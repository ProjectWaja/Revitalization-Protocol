// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ReserveVerifier} from "../src/contracts/ReserveVerifier.sol";

contract ReserveVerifierTest is Test {
    ReserveVerifier public verifier;
    MockPoRFeed public porFeed;
    MockFundingEngine public mockEngine;

    bytes32 public projectId =
        bytes32(uint256(0x5265766974616c697a6174696f6e50726f746f636f6c000000000000000001));

    address public reserveWallet = address(0xAAAA);

    function setUp() public {
        mockEngine = new MockFundingEngine();
        verifier = new ReserveVerifier(address(mockEngine));

        // Deploy mock PoR feed
        porFeed = new MockPoRFeed(8, 50_000_000 * 1e8); // $50M with 8 decimals

        // Fund the reserve wallet
        vm.deal(reserveWallet, 100 ether);

        // Configure project reserves
        verifier.configureProjectReserves(
            projectId,
            address(porFeed),
            reserveWallet,
            50_000_000e6,   // $50M claimed (USD * 1e6)
            8000            // 80% minimum ratio
        );
    }

    // =========================================================================
    // Project Reserve Verification
    // =========================================================================

    function testVerifyProjectReserves() public {
        ReserveVerifier.VerificationStatus status = verifier.verifyProjectReserves(projectId);

        assertEq(uint8(status), uint8(ReserveVerifier.VerificationStatus.VERIFIED));

        (
            uint256 porReported,
            ,
            uint256 claimed,
            uint8 statusCode,
            uint256 reserveRatio,
            uint64 timestamp
        ) = verifier.getProjectVerification(projectId);

        assertEq(porReported, 50_000_000e6); // Normalized to USD * 1e6
        assertEq(claimed, 50_000_000e6);
        assertEq(statusCode, 1); // VERIFIED
        assertEq(reserveRatio, 10000); // 100%
        assertEq(timestamp, uint64(block.timestamp));
    }

    function testUnderReservedProject() public {
        // Set PoR feed to report only $30M (60% of $50M claimed, below 80% threshold)
        porFeed.setAnswer(30_000_000 * 1e8);

        ReserveVerifier.VerificationStatus status = verifier.verifyProjectReserves(projectId);

        assertEq(uint8(status), uint8(ReserveVerifier.VerificationStatus.UNDER_RESERVED));

        (, , , , uint256 reserveRatio, ) = verifier.getProjectVerification(projectId);
        assertEq(reserveRatio, 6000); // 60%
    }

    function testStalePoRData() public {
        // Warp forward past staleness threshold
        vm.warp(block.timestamp + 2 hours);

        ReserveVerifier.VerificationStatus status = verifier.verifyProjectReserves(projectId);

        assertEq(uint8(status), uint8(ReserveVerifier.VerificationStatus.STALE_DATA));
    }

    function testIsReserveVerified() public {
        verifier.verifyProjectReserves(projectId);
        assertTrue(verifier.isReserveVerified(projectId));
    }

    function testIsReserveVerifiedStale() public {
        verifier.verifyProjectReserves(projectId);
        vm.warp(block.timestamp + 2 hours);
        assertFalse(verifier.isReserveVerified(projectId));
    }

    function testUnverifiedProject() public view {
        assertFalse(verifier.isReserveVerified(projectId)); // Never verified
    }

    // =========================================================================
    // Funding Engine Verification
    // =========================================================================

    function testVerifyFundingEngineReserves() public {
        // Fund the mock engine with 10 ETH
        vm.deal(address(mockEngine), 10 ether);

        ReserveVerifier.VerificationStatus status =
            verifier.verifyFundingEngineReserves(10 ether);

        assertEq(uint8(status), uint8(ReserveVerifier.VerificationStatus.VERIFIED));

        (
            address engine,
            uint256 balance,
            uint256 reported,
            uint8 statusCode,

        ) = verifier.getEngineVerification();

        assertEq(engine, address(mockEngine));
        assertEq(balance, 10 ether);
        assertEq(reported, 10 ether);
        assertEq(statusCode, 1); // VERIFIED
    }

    function testFundingEngineUnderReserved() public {
        // Engine has 5 ETH but reports 10 ETH deposits
        vm.deal(address(mockEngine), 5 ether);

        ReserveVerifier.VerificationStatus status =
            verifier.verifyFundingEngineReserves(10 ether);

        assertEq(uint8(status), uint8(ReserveVerifier.VerificationStatus.UNDER_RESERVED));
    }

    // =========================================================================
    // Admin
    // =========================================================================

    function testConfigureProjectReserves() public {
        bytes32 newProject = bytes32(uint256(2));

        verifier.configureProjectReserves(
            newProject,
            address(porFeed),
            reserveWallet,
            100_000_000e6,
            9000
        );

        (
            address feed,
            address wallet,
            uint256 claimed,
            uint256 minRatio,
            bool active
        ) = verifier.projectReserves(newProject);

        assertEq(feed, address(porFeed));
        assertEq(wallet, reserveWallet);
        assertEq(claimed, 100_000_000e6);
        assertEq(minRatio, 9000);
        assertTrue(active);
    }

    function testUnconfiguredProjectReverts() public {
        vm.expectRevert("Project not configured for PoR");
        verifier.verifyProjectReserves(bytes32(uint256(999)));
    }

    function testSetMaxStaleness() public {
        verifier.setMaxStaleness(2 hours);
        assertEq(verifier.maxStaleness(), 2 hours);
    }

    // =========================================================================
    // Chainlink Automation
    // =========================================================================

    function testCheckUpkeepAfterInterval() public {
        // Warp to a realistic timestamp so interval math works
        vm.warp(5 hours);

        (bool upkeepNeeded, ) = verifier.checkUpkeep("");
        assertTrue(upkeepNeeded);

        // Perform upkeep — set cached deposits and fund the engine
        vm.deal(address(mockEngine), 10 ether);
        verifier.setCachedTotalDeposits(10 ether);
        verifier.performUpkeep("");

        // Immediately after, interval has not elapsed
        (upkeepNeeded, ) = verifier.checkUpkeep("");
        assertFalse(upkeepNeeded);

        // Warp 5 hours — interval elapsed again
        vm.warp(block.timestamp + 5 hours);
        (upkeepNeeded, ) = verifier.checkUpkeep("");
        assertTrue(upkeepNeeded);
    }

    function testPerformUpkeepVerifiesReserves() public {
        vm.warp(5 hours);
        vm.deal(address(mockEngine), 10 ether);
        verifier.setCachedTotalDeposits(10 ether);

        verifier.performUpkeep("");

        // Engine should be verified
        assertTrue(verifier.isEngineReserveVerified());
        assertEq(verifier.lastAutomatedVerification(), block.timestamp);
    }

    function testPerformUpkeepRevertsBeforeInterval() public {
        vm.warp(5 hours);
        // First call succeeds
        vm.deal(address(mockEngine), 10 ether);
        verifier.setCachedTotalDeposits(10 ether);
        verifier.performUpkeep("");

        // Second call immediately should revert
        vm.expectRevert("Interval not elapsed");
        verifier.performUpkeep("");
    }
}

// =============================================================================
// Mock Chainlink PoR Feed
// =============================================================================

contract MockPoRFeed {
    uint8 private _decimals;
    int256 private _answer;
    uint256 private _updatedAt;

    constructor(uint8 decimals_, int256 answer_) {
        _decimals = decimals_;
        _answer = answer_;
        _updatedAt = block.timestamp;
    }

    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (1, _answer, _updatedAt, _updatedAt, 1);
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function description() external pure returns (string memory) {
        return "Mock PoR Feed";
    }

    function setAnswer(int256 newAnswer) external {
        _answer = newAnswer;
        _updatedAt = block.timestamp;
    }
}

// =============================================================================
// Mock Funding Engine (just needs to hold ETH)
// =============================================================================

contract MockFundingEngine {
    receive() external payable {}
}
