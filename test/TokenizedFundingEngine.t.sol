// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TokenizedFundingEngine} from "../src/contracts/TokenizedFundingEngine.sol";

contract TokenizedFundingEngineTest is Test {
    TokenizedFundingEngine public engine;

    address public admin = address(this);
    address public solvencyOracle = address(0x1111);
    address public milestoneOracle = address(0x2222);
    address public investor1 = address(0x3333);
    address public investor2 = address(0x4444);

    bytes32 public projectId =
        bytes32(uint256(0x5265766974616c697a6174696f6e50726f746f636f6c000000000000000001));

    function setUp() public {
        engine = new TokenizedFundingEngine(
            "https://rvp.example.com/metadata/{id}.json",
            address(0),     // No CCIP router for tests
            0               // No chain selector for tests
        );

        // Grant roles
        engine.grantRole(engine.SOLVENCY_ORACLE_ROLE(), solvencyOracle);
        engine.grantRole(engine.MILESTONE_ORACLE_ROLE(), milestoneOracle);

        // Fund test accounts
        vm.deal(investor1, 100 ether);
        vm.deal(investor2, 100 ether);
    }

    // =========================================================================
    // Helper: create a standard round with 4 tranches (25% each)
    // =========================================================================

    function _createStandardRound() internal returns (uint256 roundId) {
        uint8[] memory milestoneIds = new uint8[](4);
        milestoneIds[0] = 0;
        milestoneIds[1] = 1;
        milestoneIds[2] = 2;
        milestoneIds[3] = 3;

        uint16[] memory basisPoints = new uint16[](4);
        basisPoints[0] = 2500;
        basisPoints[1] = 2500;
        basisPoints[2] = 2500;
        basisPoints[3] = 2500;

        engine.createFundingRound(
            projectId,
            10 ether,
            block.timestamp + 30 days,
            milestoneIds,
            basisPoints
        );

        return 1; // First round ID
    }

    // =========================================================================
    // Test: createFundingRound
    // =========================================================================

    function testCreateFundingRound() public {
        uint256 roundId = _createStandardRound();

        (
            bytes32 pid,
            uint8 roundType,
            uint8 status,
            uint256 targetAmount,
            uint256 totalDeposited,
            uint256 totalReleased,
            uint256 deadline,
            uint256 investorCount
        ) = engine.getRoundInfo(roundId);

        assertEq(pid, projectId);
        assertEq(roundType, 0); // STANDARD
        assertEq(status, 0);    // OPEN
        assertEq(targetAmount, 10 ether);
        assertEq(totalDeposited, 0);
        assertEq(totalReleased, 0);
        assertTrue(deadline > block.timestamp);
        assertEq(investorCount, 0);

        // Verify tranches
        (
            uint8[] memory milestoneIds,
            uint16[] memory basisPoints,
            bool[] memory released
        ) = engine.getRoundTranches(roundId);

        assertEq(milestoneIds.length, 4);
        assertEq(basisPoints[0], 2500);
        assertEq(basisPoints[1], 2500);
        assertEq(basisPoints[2], 2500);
        assertEq(basisPoints[3], 2500);
        assertFalse(released[0]);

        // Verify project rounds
        uint256[] memory rounds = engine.getProjectRounds(projectId);
        assertEq(rounds.length, 1);
        assertEq(rounds[0], roundId);
    }

    // =========================================================================
    // Test: invest
    // =========================================================================

    function testInvest() public {
        uint256 roundId = _createStandardRound();

        vm.prank(investor1);
        engine.invest{value: 5 ether}(roundId);

        // Check investor position
        (uint256 amount, uint256 claimed) = engine.getInvestorPosition(roundId, investor1);
        assertEq(amount, 5 ether);
        assertEq(claimed, 0);

        // Check round state
        (, , uint8 status, , uint256 totalDeposited, , , uint256 investorCount) =
            engine.getRoundInfo(roundId);
        assertEq(status, 0); // Still OPEN (target is 10 ETH)
        assertEq(totalDeposited, 5 ether);
        assertEq(investorCount, 1);

        // Check ERC-1155 token minted
        uint256 tokenId = engine.encodeTokenId(projectId, roundId);
        assertEq(engine.balanceOf(investor1, tokenId), 5 ether);

        // Second investor reaches target
        vm.prank(investor2);
        engine.invest{value: 5 ether}(roundId);

        (, , status, , totalDeposited, , , investorCount) = engine.getRoundInfo(roundId);
        assertEq(status, 1); // FUNDED
        assertEq(totalDeposited, 10 ether);
        assertEq(investorCount, 2);
    }

    // =========================================================================
    // Test: releaseTranche
    // =========================================================================

    function testReleaseTranche() public {
        uint256 roundId = _createStandardRound();

        // Fund the round
        vm.prank(investor1);
        engine.invest{value: 10 ether}(roundId);

        // Release first tranche (milestone 0)
        vm.prank(milestoneOracle);
        engine.releaseTranche(projectId, 0);

        (, , uint8 status, , , uint256 totalReleased, , ) = engine.getRoundInfo(roundId);
        assertEq(status, 2); // RELEASING
        assertEq(totalReleased, 2.5 ether); // 25% of 10 ETH

        // Verify tranche marked as released
        (, , bool[] memory released) = engine.getRoundTranches(roundId);
        assertTrue(released[0]);
        assertFalse(released[1]);
    }

    // =========================================================================
    // Test: releaseTranche unauthorized
    // =========================================================================

    function testReleaseTrancheUnauthorized() public {
        _createStandardRound();

        vm.prank(investor1);
        engine.invest{value: 10 ether}(1);

        // Non-role caller should revert
        vm.prank(investor1);
        vm.expectRevert();
        engine.releaseTranche(projectId, 0);
    }

    // =========================================================================
    // Test: initiateRescueFunding
    // =========================================================================

    function testInitiateRescueFunding() public {
        vm.prank(solvencyOracle);
        engine.initiateRescueFunding(projectId, 15); // Low solvency score

        // Rescue round should be created as round ID 1
        (
            bytes32 pid,
            uint8 roundType,
            uint8 status,
            uint256 targetAmount,
            ,
            ,
            uint256 deadline,

        ) = engine.getRoundInfo(1);

        assertEq(pid, projectId);
        assertEq(roundType, 1); // RESCUE
        assertEq(status, 0);    // OPEN
        // Target: (100 - 15) * 0.1 ether = 8.5 ether
        assertEq(targetAmount, 8.5 ether);
        assertEq(deadline, block.timestamp + 7 days);

        // Should have single tranche at 100%
        (
            uint8[] memory milestoneIds,
            uint16[] memory basisPoints,

        ) = engine.getRoundTranches(1);
        assertEq(milestoneIds.length, 1);
        assertEq(milestoneIds[0], 0);
        assertEq(basisPoints[0], 10000);
    }

    // =========================================================================
    // Test: claimReleasedFunds
    // =========================================================================

    function testClaimReleasedFunds() public {
        uint256 roundId = _createStandardRound();

        // Two investors fund equally
        vm.prank(investor1);
        engine.invest{value: 5 ether}(roundId);
        vm.prank(investor2);
        engine.invest{value: 5 ether}(roundId);

        // Release first tranche (25% = 2.5 ETH)
        vm.prank(milestoneOracle);
        engine.releaseTranche(projectId, 0);

        // Investor1 claims pro-rata share (50% of 2.5 ETH = 1.25 ETH)
        uint256 balBefore = investor1.balance;
        vm.prank(investor1);
        engine.claimReleasedFunds(roundId);
        uint256 balAfter = investor1.balance;

        assertEq(balAfter - balBefore, 1.25 ether);

        // Check position updated
        (, uint256 claimed) = engine.getInvestorPosition(roundId, investor1);
        assertEq(claimed, 1.25 ether);
    }

    // =========================================================================
    // Test: tokenId encoding roundtrip
    // =========================================================================

    function testTokenIdEncoding() public view {
        uint256 roundId = 42;
        uint256 tokenId = engine.encodeTokenId(projectId, roundId);

        (bytes32 decodedProject, uint256 decodedRound) = engine.decodeTokenId(tokenId);

        // The lower 128 bits of projectId should roundtrip
        assertEq(uint128(uint256(decodedProject)), uint128(uint256(projectId)));
        assertEq(decodedRound, roundId);
    }

    // =========================================================================
    // Test: pause blocks operations
    // =========================================================================

    function testPauseBlocks() public {
        engine.pause();

        // createFundingRound should revert when paused
        uint8[] memory milestoneIds = new uint8[](1);
        milestoneIds[0] = 0;
        uint16[] memory basisPoints = new uint16[](1);
        basisPoints[0] = 10000;

        vm.expectRevert();
        engine.createFundingRound(
            projectId,
            10 ether,
            block.timestamp + 30 days,
            milestoneIds,
            basisPoints
        );

        // Unpause and verify it works again
        engine.unpause();
        engine.createFundingRound(
            projectId,
            10 ether,
            block.timestamp + 30 days,
            milestoneIds,
            basisPoints
        );

        (, , uint8 status, , , , , ) = engine.getRoundInfo(1);
        assertEq(status, 0); // OPEN
    }

    // =========================================================================
    // Test: supportsInterface (ERC-1155)
    // =========================================================================

    function testSupportsERC1155Interface() public view {
        // ERC-1155 interface ID: 0xd9b67a26
        assertTrue(engine.supportsInterface(0xd9b67a26));
        // AccessControl interface ID: 0x7965db0b
        assertTrue(engine.supportsInterface(0x7965db0b));
    }

    // =========================================================================
    // Test: Chainlink Automation — checkUpkeep / performUpkeep
    // =========================================================================

    function testCheckUpkeepNoExpiredRounds() public {
        _createStandardRound(); // deadline = now + 30 days

        (bool upkeepNeeded, ) = engine.checkUpkeep("");
        assertFalse(upkeepNeeded);
    }

    function testCheckUpkeepWithExpiredRound() public {
        _createStandardRound();

        // Warp past deadline
        vm.warp(block.timestamp + 31 days);

        (bool upkeepNeeded, bytes memory performData) = engine.checkUpkeep("");
        assertTrue(upkeepNeeded);

        uint256[] memory roundIds = abi.decode(performData, (uint256[]));
        assertEq(roundIds.length, 1);
        assertEq(roundIds[0], 1);
    }

    function testPerformUpkeepCancelsExpiredRound() public {
        _createStandardRound();

        // Investor deposits into the round
        vm.prank(investor1);
        engine.invest{value: 3 ether}(1);

        // Warp past deadline
        vm.warp(block.timestamp + 31 days);

        (, bytes memory performData) = engine.checkUpkeep("");
        engine.performUpkeep(performData);

        // Verify round is CANCELLED
        (, , uint8 status, , , uint256 totalReleased, , ) = engine.getRoundInfo(1);
        assertEq(status, 4); // CANCELLED
        assertEq(totalReleased, 3 ether); // Refundable
    }

    function testPerformUpkeepIgnoresNonExpiredRound() public {
        _createStandardRound();

        // Construct stale performData with round 1
        uint256[] memory staleRoundIds = new uint256[](1);
        staleRoundIds[0] = 1;
        bytes memory stalePerformData = abi.encode(staleRoundIds);

        // Round is NOT expired — performUpkeep should be a no-op
        engine.performUpkeep(stalePerformData);

        (, , uint8 status, , , , , ) = engine.getRoundInfo(1);
        assertEq(status, 0); // Still OPEN
    }
}
