// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {SolvencyConsumer} from "../src/contracts/SolvencyConsumer.sol";

/**
 * @title SolvencyConsumerTest
 * @notice Foundry tests for the SolvencyConsumer oracle consumer contract.
 */
contract SolvencyConsumerTest is Test {
    SolvencyConsumer public consumer;

    address public owner = address(this);
    address public workflow = address(0xC5E1);
    address public stranger = address(0xDEAD);

    bytes32 public projectId =
        bytes32(uint256(0x5265766974616c697a6174696f6e50726f746f636f6c000000000000000001));

    // Reusable report builder
    function _buildReport(
        uint8 score,
        uint8 riskLevel,
        bool triggerRescue
    ) internal view returns (bytes memory) {
        return abi.encode(
            projectId,
            score,
            riskLevel,
            uint8(80),  // financialHealth
            uint8(70),  // costExposure
            uint8(60),  // fundingMomentum
            uint8(90),  // runwayAdequacy
            triggerRescue,
            uint64(block.timestamp)
        );
    }

    function setUp() public {
        consumer = new SolvencyConsumer(workflow);

        // Register a project
        consumer.registerProject(
            projectId,
            50_000_000e6,   // $50M budget
            15_000_000e6,   // $15M deployed
            35_000_000e6,   // $35M remaining
            2_000_000e6,    // $2M/month velocity
            1_500_000e6     // $1.5M/month burn
        );
    }

    // =========================================================================
    // Project Registration
    // =========================================================================

    function testRegisterProject() public view {
        (
            uint256 totalBudget,
            uint256 capitalDeployed,
            uint256 capitalRemaining,
            uint256 fundingVelocity,
            uint256 burnRate
        ) = consumer.getProjectFinancials(projectId);

        assertEq(totalBudget, 50_000_000e6);
        assertEq(capitalDeployed, 15_000_000e6);
        assertEq(capitalRemaining, 35_000_000e6);
        assertEq(fundingVelocity, 2_000_000e6);
        assertEq(burnRate, 1_500_000e6);
    }

    function testRegisterProjectOnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        consumer.registerProject(
            bytes32(uint256(2)),
            1e6, 0, 1e6, 0, 0
        );
    }

    // =========================================================================
    // Report Receiving
    // =========================================================================

    function testReceiveSolvencyReport() public {
        bytes memory report = _buildReport(75, 0, false); // LOW risk

        vm.prank(workflow);
        consumer.receiveSolvencyReport(report);

        (
            uint8 overallScore,
            uint8 riskLevel,
            uint8 financialHealth,
            uint8 costExposure,
            uint8 fundingMomentum,
            uint8 runwayAdequacy,
            bool rescueTriggered,
            uint64 timestamp
        ) = consumer.getLatestSolvency(projectId);

        assertEq(overallScore, 75);
        assertEq(riskLevel, 0); // LOW
        assertEq(financialHealth, 80);
        assertEq(costExposure, 70);
        assertEq(fundingMomentum, 60);
        assertEq(runwayAdequacy, 90);
        assertFalse(rescueTriggered);
        assertEq(timestamp, uint64(block.timestamp));
    }

    function testReceiveReportUnauthorized() public {
        bytes memory report = _buildReport(75, 0, false);

        vm.prank(stranger);
        vm.expectRevert("SolvencyConsumer: unauthorized");
        consumer.receiveSolvencyReport(report);
    }

    function testReceiveReportInvalidScore() public {
        bytes memory report = abi.encode(
            projectId,
            uint8(101), // invalid score > 100
            uint8(0),
            uint8(80), uint8(70), uint8(60), uint8(90),
            false,
            uint64(block.timestamp)
        );

        vm.prank(workflow);
        vm.expectRevert("Invalid score");
        consumer.receiveSolvencyReport(report);
    }

    function testReceiveReportUnregisteredProject() public {
        bytes32 unknownProject = bytes32(uint256(999));
        bytes memory report = abi.encode(
            unknownProject,
            uint8(75), uint8(0),
            uint8(80), uint8(70), uint8(60), uint8(90),
            false, uint64(block.timestamp)
        );

        vm.prank(workflow);
        vm.expectRevert("Project not registered");
        consumer.receiveSolvencyReport(report);
    }

    // =========================================================================
    // Rescue Funding Trigger
    // =========================================================================

    function testRescueFundingTriggeredByLowScore() public {
        bytes memory report = _buildReport(20, 3, false); // CRITICAL, score < 25

        vm.prank(workflow);
        vm.expectEmit(true, false, false, true);
        emit SolvencyConsumer.RescueFundingInitiated(projectId, 20, uint64(block.timestamp));
        consumer.receiveSolvencyReport(report);
    }

    function testRescueFundingTriggeredByFlag() public {
        bytes memory report = _buildReport(50, 1, true); // MEDIUM but triggerRescue=true

        vm.prank(workflow);
        vm.expectEmit(true, false, false, true);
        emit SolvencyConsumer.RescueFundingInitiated(projectId, 50, uint64(block.timestamp));
        consumer.receiveSolvencyReport(report);
    }

    function testNoRescueAboveThreshold() public {
        bytes memory report = _buildReport(75, 0, false); // LOW risk

        vm.prank(workflow);
        // No RescueFundingInitiated event should be emitted
        vm.recordLogs();
        consumer.receiveSolvencyReport(report);

        VmSafe.Log[] memory logs = vm.getRecordedLogs();
        // Should have SolvencyUpdated but NOT RescueFundingInitiated
        for (uint256 i = 0; i < logs.length; i++) {
            assertTrue(
                logs[i].topics[0] != keccak256("RescueFundingInitiated(bytes32,uint8,uint64)"),
                "Unexpected rescue funding event"
            );
        }
    }

    // =========================================================================
    // Risk Alert Events
    // =========================================================================

    function testHighRiskAlert() public {
        bytes memory report = _buildReport(40, 2, false); // HIGH risk

        vm.prank(workflow);
        vm.expectEmit(true, false, false, false);
        emit SolvencyConsumer.RiskAlertTriggered(projectId, 40, SolvencyConsumer.RiskLevel.HIGH, "HIGH");
        consumer.receiveSolvencyReport(report);
    }

    function testCriticalRiskAlert() public {
        bytes memory report = _buildReport(10, 3, false); // CRITICAL

        vm.prank(workflow);
        vm.expectEmit(true, false, false, false);
        emit SolvencyConsumer.RiskAlertTriggered(projectId, 10, SolvencyConsumer.RiskLevel.CRITICAL, "CRITICAL");
        consumer.receiveSolvencyReport(report);
    }

    // =========================================================================
    // History Buffer
    // =========================================================================

    function testHistoryAppends() public {
        // Submit 3 reports
        for (uint8 i = 0; i < 3; i++) {
            vm.warp(block.timestamp + 1);
            bytes memory report = _buildReport(75 - i * 10, 0, false);
            vm.prank(workflow);
            consumer.receiveSolvencyReport(report);
        }

        assertEq(consumer.getSolvencyHistoryCount(projectId), 3);

        // Check first entry
        (uint8 score, , ) = consumer.getSolvencyHistoryEntry(projectId, 0);
        assertEq(score, 75);

        // Check last entry
        (score, , ) = consumer.getSolvencyHistoryEntry(projectId, 2);
        assertEq(score, 55);
    }

    // =========================================================================
    // Admin Functions
    // =========================================================================

    function testUpdateProjectFinancials() public {
        consumer.updateProjectFinancials(
            projectId,
            20_000_000e6,   // updated deployed
            30_000_000e6,   // updated remaining
            3_000_000e6,    // updated velocity
            2_000_000e6     // updated burn
        );

        (, uint256 deployed, uint256 remaining, uint256 velocity, uint256 burn) =
            consumer.getProjectFinancials(projectId);

        assertEq(deployed, 20_000_000e6);
        assertEq(remaining, 30_000_000e6);
        assertEq(velocity, 3_000_000e6);
        assertEq(burn, 2_000_000e6);
    }

    function testSetAuthorizedWorkflow() public {
        address newWorkflow = address(0xC5E2);
        consumer.setAuthorizedWorkflow(newWorkflow);
        assertEq(consumer.authorizedWorkflow(), newWorkflow);
    }

    function testSetRescueThreshold() public {
        consumer.setRescueThreshold(30);
        assertEq(consumer.rescueThreshold(), 30);
    }

    function testSetRescueThresholdInvalid() public {
        vm.expectRevert("Invalid threshold");
        consumer.setRescueThreshold(101);
    }

    function testOwnerCanSubmitReport() public {
        bytes memory report = _buildReport(75, 0, false);
        // Owner (address(this)) should also be authorized
        consumer.receiveSolvencyReport(report);

        (uint8 score, , , , , , , ) = consumer.getLatestSolvency(projectId);
        assertEq(score, 75);
    }
}
