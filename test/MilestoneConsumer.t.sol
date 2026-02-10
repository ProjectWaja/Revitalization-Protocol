// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {MilestoneConsumer} from "../src/contracts/MilestoneConsumer.sol";

/**
 * @title MilestoneConsumerTest
 * @notice Foundry tests for the MilestoneConsumer oracle consumer contract.
 */
contract MilestoneConsumerTest is Test {
    MilestoneConsumer public consumer;

    address public owner = address(this);
    address public workflow = address(0xC5E1);
    address public stranger = address(0xDEAD);

    bytes32 public projectId =
        bytes32(uint256(0x5265766974616c697a6174696f6e50726f746f636f6c000000000000000001));

    // Reusable report builder
    function _buildReport(
        uint8 milestoneId,
        uint8 progress,
        uint8 verificationScore,
        bool approved
    ) internal view returns (bytes memory) {
        return abi.encode(
            projectId,
            milestoneId,
            progress,
            verificationScore,
            approved,
            uint64(block.timestamp)
        );
    }

    function setUp() public {
        consumer = new MilestoneConsumer(workflow);

        // Register project with 4 milestones
        consumer.registerProjectMilestones(projectId, 4);
    }

    // =========================================================================
    // Project Registration
    // =========================================================================

    function testRegisterProjectMilestones() public view {
        (uint8 totalMilestones, bool isActive) = consumer.getMilestoneConfig(projectId);
        assertEq(totalMilestones, 4);
        assertTrue(isActive);
    }

    function testRegisterProjectOnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        consumer.registerProjectMilestones(bytes32(uint256(2)), 4);
    }

    function testRegisterProjectZeroMilestones() public {
        vm.expectRevert("Must have at least one milestone");
        consumer.registerProjectMilestones(bytes32(uint256(2)), 0);
    }

    // =========================================================================
    // Report Receiving
    // =========================================================================

    function testReceiveMilestoneReport() public {
        bytes memory report = _buildReport(0, 50, 85, true);

        vm.prank(workflow);
        consumer.receiveMilestoneReport(report);

        (uint8 progress, uint8 score, bool approved, uint64 timestamp) =
            consumer.getLatestMilestone(projectId, 0);

        assertEq(progress, 50);
        assertEq(score, 85);
        assertTrue(approved);
        assertEq(timestamp, uint64(block.timestamp));
    }

    function testReceiveReportUnauthorized() public {
        bytes memory report = _buildReport(0, 50, 85, true);

        vm.prank(stranger);
        vm.expectRevert("MilestoneConsumer: unauthorized");
        consumer.receiveMilestoneReport(report);
    }

    function testReceiveReportInvalidProgress() public {
        bytes memory report = abi.encode(
            projectId, uint8(0), uint8(101), uint8(85), true, uint64(block.timestamp)
        );

        vm.prank(workflow);
        vm.expectRevert("Invalid progress");
        consumer.receiveMilestoneReport(report);
    }

    function testReceiveReportInvalidScore() public {
        bytes memory report = abi.encode(
            projectId, uint8(0), uint8(50), uint8(101), true, uint64(block.timestamp)
        );

        vm.prank(workflow);
        vm.expectRevert("Invalid score");
        consumer.receiveMilestoneReport(report);
    }

    function testReceiveReportMilestoneOutOfRange() public {
        bytes memory report = _buildReport(5, 50, 85, true); // Only 4 milestones (0-3)

        vm.prank(workflow);
        vm.expectRevert("Milestone ID out of range");
        consumer.receiveMilestoneReport(report);
    }

    function testReceiveReportUnregisteredProject() public {
        bytes32 unknownProject = bytes32(uint256(999));
        bytes memory report = abi.encode(
            unknownProject, uint8(0), uint8(50), uint8(85), true, uint64(block.timestamp)
        );

        vm.prank(workflow);
        vm.expectRevert("Project not registered");
        consumer.receiveMilestoneReport(report);
    }

    // =========================================================================
    // Milestone Verification & Dispute
    // =========================================================================

    function testMilestoneVerifiedEvent() public {
        bytes memory report = _buildReport(0, 80, 85, true); // approved, score >= 70

        vm.prank(workflow);
        vm.expectEmit(true, false, false, true);
        emit MilestoneConsumer.MilestoneVerified(
            projectId, 0, 80, 85, uint64(block.timestamp)
        );
        consumer.receiveMilestoneReport(report);
    }

    function testMilestoneDisputedLowScore() public {
        bytes memory report = _buildReport(0, 50, 40, false); // low score, not approved

        vm.prank(workflow);
        vm.expectEmit(true, false, false, false);
        emit MilestoneConsumer.MilestoneDisputed(
            projectId, 0, 40, "Verification score below threshold"
        );
        consumer.receiveMilestoneReport(report);
    }

    // =========================================================================
    // Milestone Completion & Tranche Release Hook
    // =========================================================================

    function testMilestoneCompletedEvent() public {
        bytes memory report = _buildReport(0, 100, 90, true); // 100% + approved

        vm.prank(workflow);
        vm.expectEmit(true, false, false, true);
        emit MilestoneConsumer.MilestoneCompleted(projectId, 0, uint64(block.timestamp));
        consumer.receiveMilestoneReport(report);
    }

    function testMilestoneCompletedNotApproved() public {
        // 100% progress but NOT approved — should NOT emit MilestoneCompleted
        bytes memory report = _buildReport(0, 100, 90, false);

        vm.prank(workflow);
        vm.recordLogs();
        consumer.receiveMilestoneReport(report);

        VmSafe.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            assertTrue(
                logs[i].topics[0] != keccak256("MilestoneCompleted(bytes32,uint8,uint64)"),
                "Unexpected MilestoneCompleted event"
            );
        }
    }

    function testFundingEngineHookCalled() public {
        // Deploy a mock funding engine that records calls
        MockFundingEngine mockEngine = new MockFundingEngine();
        consumer.setFundingEngine(address(mockEngine));

        bytes memory report = _buildReport(0, 100, 90, true);

        vm.prank(workflow);
        consumer.receiveMilestoneReport(report);

        // Verify the mock was called with correct args
        assertTrue(mockEngine.wasCalled());
        assertEq(mockEngine.lastProjectId(), projectId);
        assertEq(mockEngine.lastMilestoneId(), 0);
    }

    // =========================================================================
    // History Buffer
    // =========================================================================

    function testHistoryAppends() public {
        for (uint8 i = 0; i < 3; i++) {
            vm.warp(block.timestamp + 1);
            bytes memory report = _buildReport(0, 20 * (i + 1), 80, false);
            vm.prank(workflow);
            consumer.receiveMilestoneReport(report);
        }

        assertEq(consumer.getMilestoneHistoryCount(projectId), 3);

        (uint8 mid, uint8 progress, , , ) = consumer.getMilestoneHistoryEntry(projectId, 0);
        assertEq(mid, 0);
        assertEq(progress, 20);

        (, progress, , , ) = consumer.getMilestoneHistoryEntry(projectId, 2);
        assertEq(progress, 60);
    }

    function testHistoryIndexOutOfBounds() public {
        vm.expectRevert("Index out of bounds");
        consumer.getMilestoneHistoryEntry(projectId, 0);
    }

    // =========================================================================
    // Admin Functions
    // =========================================================================

    function testSetAuthorizedWorkflow() public {
        address newWorkflow = address(0xC5E2);
        consumer.setAuthorizedWorkflow(newWorkflow);
        assertEq(consumer.authorizedWorkflow(), newWorkflow);
    }

    function testSetApprovalThreshold() public {
        consumer.setApprovalThreshold(80);
        assertEq(consumer.approvalThreshold(), 80);
    }

    function testSetApprovalThresholdInvalid() public {
        vm.expectRevert("Invalid threshold");
        consumer.setApprovalThreshold(101);
    }

    function testOwnerCanSubmitReport() public {
        bytes memory report = _buildReport(0, 50, 85, true);
        // Owner (address(this)) should also be authorized
        consumer.receiveMilestoneReport(report);

        (uint8 progress, , , ) = consumer.getLatestMilestone(projectId, 0);
        assertEq(progress, 50);
    }

    // =========================================================================
    // Multiple Milestones
    // =========================================================================

    function testMultipleMilestonesIndependent() public {
        // Submit reports for milestone 0 and milestone 1
        vm.prank(workflow);
        consumer.receiveMilestoneReport(_buildReport(0, 50, 85, true));

        vm.prank(workflow);
        consumer.receiveMilestoneReport(_buildReport(1, 30, 75, true));

        // Each should be stored independently
        (uint8 progress0, , , ) = consumer.getLatestMilestone(projectId, 0);
        (uint8 progress1, , , ) = consumer.getLatestMilestone(projectId, 1);

        assertEq(progress0, 50);
        assertEq(progress1, 30);
    }
}

// =============================================================================
// Mock Funding Engine — records releaseTranche() calls
// =============================================================================

contract MockFundingEngine {
    bool public wasCalled;
    bytes32 public lastProjectId;
    uint8 public lastMilestoneId;

    function releaseTranche(bytes32 projectId, uint8 milestoneId) external {
        wasCalled = true;
        lastProjectId = projectId;
        lastMilestoneId = milestoneId;
    }
}
