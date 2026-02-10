// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SolvencyConsumer} from "../src/contracts/SolvencyConsumer.sol";
import {MilestoneConsumer} from "../src/contracts/MilestoneConsumer.sol";
import {TokenizedFundingEngine} from "../src/contracts/TokenizedFundingEngine.sol";
import {ReserveVerifier} from "../src/contracts/ReserveVerifier.sol";

/**
 * @title IntegrationTest
 * @notice End-to-end integration test that deploys all contracts, wires
 *         cross-module hooks, and simulates the full Revitalization Protocol lifecycle.
 *
 * Flow tested:
 *   1. Deploy & wire all contracts
 *   2. Register project in SolvencyConsumer + MilestoneConsumer
 *   3. Admin creates standard funding round in FundingEngine
 *   4. Investors deposit ETH and receive ERC-1155 tokens
 *   5. Milestone Oracle reports 100% → MilestoneConsumer calls releaseTranche()
 *   6. Investors claim released funds pro-rata
 *   7. Solvency Oracle reports critical score → SolvencyConsumer calls initiateRescueFunding()
 *   8. ReserveVerifier validates funding engine reserves
 */
contract IntegrationTest is Test {
    SolvencyConsumer public solvency;
    MilestoneConsumer public milestone;
    TokenizedFundingEngine public engine;
    ReserveVerifier public reserves;

    address public admin = address(this);
    address public workflow = address(0xC5E1);
    address public investor1 = address(0x3333);
    address public investor2 = address(0x4444);

    bytes32 public projectId =
        bytes32(uint256(0x5265766974616c697a6174696f6e50726f746f636f6c000000000000000001));

    function setUp() public {
        // --- Deploy all contracts ---
        solvency = new SolvencyConsumer(workflow);
        milestone = new MilestoneConsumer(workflow);
        engine = new TokenizedFundingEngine(
            "https://rvp.example.com/metadata/{id}.json",
            address(0), // no CCIP for integration test
            0
        );
        reserves = new ReserveVerifier(address(engine));

        // --- Wire cross-module hooks ---
        // SolvencyConsumer → FundingEngine (rescue funding)
        solvency.setRescueFundingEngine(address(engine));

        // MilestoneConsumer → FundingEngine (tranche release)
        milestone.setFundingEngine(address(engine));

        // Grant roles to the oracle consumer contracts
        engine.grantRole(engine.SOLVENCY_ORACLE_ROLE(), address(solvency));
        engine.grantRole(engine.MILESTONE_ORACLE_ROLE(), address(milestone));

        // --- Register project in both oracles ---
        solvency.registerProject(
            projectId,
            50_000_000e6,
            15_000_000e6,
            35_000_000e6,
            2_000_000e6,
            1_500_000e6
        );
        milestone.registerProjectMilestones(projectId, 4);

        // --- Configure PoR ---
        reserves.configureProjectReserves(
            projectId,
            address(0),         // No PoR feed in test
            address(engine),    // Engine itself is the reserve wallet
            50_000_000e6,
            8000                // 80% min ratio
        );

        // Fund test accounts
        vm.deal(investor1, 100 ether);
        vm.deal(investor2, 100 ether);
    }

    // =========================================================================
    // Full Lifecycle: Standard Funding → Milestone → Tranche Release → Claim
    // =========================================================================

    function testFullStandardFundingLifecycle() public {
        // Step 1: Admin creates funding round (4 milestones, 25% each)
        uint8[] memory milestoneIds = new uint8[](4);
        milestoneIds[0] = 0;
        milestoneIds[1] = 1;
        milestoneIds[2] = 2;
        milestoneIds[3] = 3;

        uint16[] memory bps = new uint16[](4);
        bps[0] = 2500;
        bps[1] = 2500;
        bps[2] = 2500;
        bps[3] = 2500;

        engine.createFundingRound(
            projectId,
            10 ether,
            block.timestamp + 30 days,
            milestoneIds,
            bps
        );

        // Step 2: Investors fund the round
        vm.prank(investor1);
        engine.invest{value: 6 ether}(1);

        vm.prank(investor2);
        engine.invest{value: 4 ether}(1);

        // Verify round is FUNDED
        uint8 status;
        uint256 deposited;
        uint256 released;
        uint256 count;
        (, , status, , deposited, , , count) = engine.getRoundInfo(1);
        assertEq(status, 1); // FUNDED
        assertEq(deposited, 10 ether);
        assertEq(count, 2);

        // Step 3: Milestone Oracle reports milestone 0 at 100% approved
        bytes memory milestoneReport = abi.encode(
            projectId,
            uint8(0),       // milestoneId
            uint8(100),     // progress
            uint8(90),      // verificationScore
            true,           // approved
            uint64(block.timestamp)
        );

        vm.prank(workflow);
        milestone.receiveMilestoneReport(milestoneReport);

        // This should have triggered releaseTranche(projectId, 0) on the engine
        (, , status, , , released, , ) = engine.getRoundInfo(1);
        assertEq(status, 2); // RELEASING
        assertEq(released, 2.5 ether); // 25% of 10 ETH

        // Step 4: Investor1 claims their share (60% of 2.5 ETH = 1.5 ETH)
        uint256 balBefore = investor1.balance;
        vm.prank(investor1);
        engine.claimReleasedFunds(1);
        assertEq(investor1.balance - balBefore, 1.5 ether);

        // Investor2 claims their share (40% of 2.5 ETH = 1.0 ETH)
        balBefore = investor2.balance;
        vm.prank(investor2);
        engine.claimReleasedFunds(1);
        assertEq(investor2.balance - balBefore, 1.0 ether);

        // Step 5: Complete remaining milestones
        for (uint8 m = 1; m <= 3; m++) {
            vm.warp(block.timestamp + 7 days);
            milestoneReport = abi.encode(
                projectId,
                m,
                uint8(100),
                uint8(85),
                true,
                uint64(block.timestamp)
            );
            vm.prank(workflow);
            milestone.receiveMilestoneReport(milestoneReport);
        }

        // Round should be COMPLETED
        (, , status, , , released, , ) = engine.getRoundInfo(1);
        assertEq(status, 3); // COMPLETED
        assertEq(released, 10 ether); // All tranches released
    }

    // =========================================================================
    // Rescue Funding Flow: Low Solvency → Rescue Round Created
    // =========================================================================

    function testRescueFundingTriggeredBySolvency() public {
        // Solvency oracle reports critical score (15/100)
        bytes memory solvencyReport = abi.encode(
            projectId,
            uint8(15),      // overallScore
            uint8(3),       // riskLevel = CRITICAL
            uint8(20),      // financialHealth
            uint8(10),      // costExposure
            uint8(15),      // fundingMomentum
            uint8(5),       // runwayAdequacy
            true,           // triggerRescue
            uint64(block.timestamp)
        );

        vm.prank(workflow);
        solvency.receiveSolvencyReport(solvencyReport);

        // Rescue round should have been created in the funding engine
        // Check round ID 1 (first round created)
        bytes32 pid;
        uint8 roundType;
        uint8 status;
        uint256 targetAmount;
        uint256 deadline;
        (pid, roundType, status, targetAmount, , , deadline, ) = engine.getRoundInfo(1);

        assertEq(pid, projectId);
        assertEq(roundType, 1); // RESCUE
        assertEq(status, 0);    // OPEN
        // Target: (100 - 15) * 0.1 ether = 8.5 ether
        assertEq(targetAmount, 8.5 ether);
        assertTrue(deadline > block.timestamp);

        // Investors can now fund the rescue round
        vm.prank(investor1);
        engine.invest{value: 8.5 ether}(1);

        (, , status, , , , , ) = engine.getRoundInfo(1);
        assertEq(status, 1); // FUNDED
    }

    // =========================================================================
    // Reserve Verification: Verify Engine Solvency
    // =========================================================================

    function testReserveVerificationAfterFunding() public {
        // Create and fund a round
        uint8[] memory mids = new uint8[](1);
        mids[0] = 0;
        uint16[] memory bp = new uint16[](1);
        bp[0] = 10000;

        engine.createFundingRound(
            projectId, 5 ether, block.timestamp + 30 days, mids, bp
        );

        vm.prank(investor1);
        engine.invest{value: 5 ether}(1);

        // Verify the engine's reserves match reported deposits
        ReserveVerifier.VerificationStatus status =
            reserves.verifyFundingEngineReserves(5 ether);

        assertEq(uint8(status), uint8(ReserveVerifier.VerificationStatus.VERIFIED));
        assertTrue(reserves.isEngineReserveVerified());
    }

    // =========================================================================
    // Full Cross-Module Wire Check
    // =========================================================================

    function testCrossModuleWiringCorrect() public view {
        // Verify all contracts are wired correctly
        assertEq(address(solvency.rescueFundingEngine()), address(engine));
        assertEq(address(milestone.fundingEngine()), address(engine));
        assertEq(reserves.fundingEngine(), address(engine));
        assertTrue(engine.hasRole(engine.SOLVENCY_ORACLE_ROLE(), address(solvency)));
        assertTrue(engine.hasRole(engine.MILESTONE_ORACLE_ROLE(), address(milestone)));
    }

    // =========================================================================
    // Cancel & Refund Flow
    // =========================================================================

    function testCancelRoundAndRefund() public {
        uint8[] memory mids = new uint8[](1);
        mids[0] = 0;
        uint16[] memory bp = new uint16[](1);
        bp[0] = 10000;

        engine.createFundingRound(
            projectId, 10 ether, block.timestamp + 30 days, mids, bp
        );

        // Investor deposits
        vm.prank(investor1);
        engine.invest{value: 3 ether}(1);

        // Admin cancels
        engine.cancelRound(1);

        // Investor claims refund
        uint256 balBefore = investor1.balance;
        vm.prank(investor1);
        engine.claimReleasedFunds(1);
        assertEq(investor1.balance - balBefore, 3 ether);
    }

    // =========================================================================
    // Multiple Rounds: Standard + Rescue coexist
    // =========================================================================

    function testMultipleRoundsCoexist() public {
        // Create standard round
        uint8[] memory mids = new uint8[](2);
        mids[0] = 0;
        mids[1] = 1;
        uint16[] memory bp = new uint16[](2);
        bp[0] = 5000;
        bp[1] = 5000;

        engine.createFundingRound(
            projectId, 10 ether, block.timestamp + 30 days, mids, bp
        );

        // Fund standard round
        vm.prank(investor1);
        engine.invest{value: 10 ether}(1);

        // Trigger rescue round via solvency
        bytes memory report = abi.encode(
            projectId, uint8(10), uint8(3),
            uint8(10), uint8(10), uint8(10), uint8(10),
            true, uint64(block.timestamp)
        );
        vm.prank(workflow);
        solvency.receiveSolvencyReport(report);

        // Fund rescue round
        vm.prank(investor2);
        engine.invest{value: 9 ether}(2);

        // Both rounds should be FUNDED
        (, , uint8 status1, , , , , ) = engine.getRoundInfo(1);
        (, , uint8 status2, , , , , ) = engine.getRoundInfo(2);
        assertEq(status1, 1); // FUNDED
        assertEq(status2, 1); // FUNDED

        // Milestone 0 completes — should release tranches on BOTH rounds
        bytes memory msReport = abi.encode(
            projectId, uint8(0), uint8(100), uint8(90), true, uint64(block.timestamp)
        );
        vm.prank(workflow);
        milestone.receiveMilestoneReport(msReport);

        // Standard round: 50% released (milestone 0 = 5000 bps)
        uint256 released1;
        (, , , , , released1, , ) = engine.getRoundInfo(1);
        assertEq(released1, 5 ether);

        // Rescue round: has milestone 0 tranche at 10000 bps → full release
        uint8 status2After;
        uint256 released2;
        (,, status2After,,, released2,,) = engine.getRoundInfo(2);
        assertEq(released2, 9 ether);
        assertEq(status2After, 3); // COMPLETED
    }

    // =========================================================================
    // Automation: Expired Rescue Round Auto-Cancelled
    // =========================================================================

    function testAutomationCancelsExpiredRescueRound() public {
        // Trigger rescue round via solvency (score=15 → 7-day deadline)
        bytes memory report = abi.encode(
            projectId, uint8(15), uint8(3),
            uint8(20), uint8(10), uint8(15), uint8(5),
            true, uint64(block.timestamp)
        );
        vm.prank(workflow);
        solvency.receiveSolvencyReport(report);

        // Verify rescue round exists and is OPEN
        (, , uint8 status, , , , , ) = engine.getRoundInfo(1);
        assertEq(status, 0); // OPEN

        // Warp past the 7-day deadline
        vm.warp(block.timestamp + 8 days);

        // Automation detects expired round
        (bool upkeepNeeded, bytes memory performData) = engine.checkUpkeep("");
        assertTrue(upkeepNeeded);

        // Automation cancels the expired round
        engine.performUpkeep(performData);

        (, , status, , , , , ) = engine.getRoundInfo(1);
        assertEq(status, 4); // CANCELLED
    }
}
