// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MilestoneConsumer
 * @author Revitalization Protocol
 * @notice Receives and stores milestone verification reports from the CRE Milestone Oracle workflow.
 *         Verifies physical construction progress via satellite/drone imagery and permit data.
 *
 * @dev This contract:
 *   1. Stores project milestone configurations (set by admin/governance)
 *   2. Receives signed milestone reports from the CRE workflow DON
 *   3. Maintains a rolling history of milestone verifications per project
 *   4. Emits events for downstream consumers (funding engine, dashboard, alerts)
 *   5. Emits MilestoneCompleted when a milestone reaches 100% for funding tranche release
 *
 * Hackathon Categories: DeFi & Tokenization, Risk & Compliance, CRE & AI
 */
contract MilestoneConsumer is Ownable {
    // =========================================================================
    // Types
    // =========================================================================

    enum MilestoneStatus {
        NOT_STARTED,
        IN_PROGRESS,
        COMPLETED,
        VERIFIED,
        DISPUTED
    }

    struct MilestoneReport {
        bytes32 projectId;
        uint8 milestoneId;
        uint8 progressPercentage;    // 0-100
        uint8 verificationScore;     // 0-100 (composite confidence score)
        bool approved;
        uint64 timestamp;
    }

    struct MilestoneConfig {
        uint8 totalMilestones;
        bool isActive;
    }

    // =========================================================================
    // State
    // =========================================================================

    /// @notice Authorized CRE workflow DON address that can submit reports
    address public authorizedWorkflow;

    /// @notice Funding engine contract address (wired in Week 2 for tranche release)
    address public fundingEngine;

    /// @notice Project milestone configurations
    mapping(bytes32 => MilestoneConfig) public milestoneConfigs;

    /// @notice Latest milestone report per project per milestone
    mapping(bytes32 => mapping(uint8 => MilestoneReport)) public latestMilestone;

    /// @notice Historical milestone reports per project (rolling buffer)
    mapping(bytes32 => MilestoneReport[]) public milestoneHistory;

    /// @notice Maximum history entries to retain per project
    uint256 public constant MAX_HISTORY = 100;

    /// @notice Minimum verification score to auto-approve a milestone
    uint8 public approvalThreshold = 70;

    // =========================================================================
    // Events
    // =========================================================================

    event MilestoneVerified(
        bytes32 indexed projectId,
        uint8 milestoneId,
        uint8 progressPercentage,
        uint8 verificationScore,
        uint64 timestamp
    );

    event MilestoneDisputed(
        bytes32 indexed projectId,
        uint8 milestoneId,
        uint8 verificationScore,
        string reason
    );

    event MilestoneProgressUpdated(
        bytes32 indexed projectId,
        uint8 milestoneId,
        uint8 progressPercentage,
        uint64 timestamp
    );

    event MilestoneCompleted(
        bytes32 indexed projectId,
        uint8 milestoneId,
        uint64 timestamp
    );

    event ProjectMilestoneRegistered(
        bytes32 indexed projectId,
        uint8 totalMilestones
    );

    event AuthorizedWorkflowUpdated(address indexed newWorkflow);

    // =========================================================================
    // Modifiers
    // =========================================================================

    modifier onlyAuthorizedWorkflow() {
        require(
            msg.sender == authorizedWorkflow || msg.sender == owner(),
            "MilestoneConsumer: unauthorized"
        );
        _;
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor(address _authorizedWorkflow) Ownable(msg.sender) {
        authorizedWorkflow = _authorizedWorkflow;
    }

    // =========================================================================
    // CRE Workflow Interface — Report Receiving
    // =========================================================================

    /**
     * @notice Receives a milestone report from the CRE Milestone Oracle workflow.
     * @dev Called by the CRE DON after generating a signed report.
     *      The report bytes are ABI-encoded as:
     *      (bytes32 projectId, uint8 milestoneId, uint8 progressPercentage,
     *       uint8 verificationScore, bool approved, uint64 timestamp)
     * @param report ABI-encoded milestone report data
     */
    function receiveMilestoneReport(bytes calldata report) external onlyAuthorizedWorkflow {
        (
            bytes32 projectId,
            uint8 milestoneId,
            uint8 progressPercentage,
            uint8 verificationScore,
            bool approved,
            uint64 timestamp
        ) = abi.decode(report, (bytes32, uint8, uint8, uint8, bool, uint64));

        require(progressPercentage <= 100, "Invalid progress");
        require(verificationScore <= 100, "Invalid score");
        require(milestoneConfigs[projectId].isActive, "Project not registered");
        require(
            milestoneId < milestoneConfigs[projectId].totalMilestones,
            "Milestone ID out of range"
        );

        MilestoneReport memory newReport = MilestoneReport({
            projectId: projectId,
            milestoneId: milestoneId,
            progressPercentage: progressPercentage,
            verificationScore: verificationScore,
            approved: approved,
            timestamp: timestamp
        });

        // Store latest
        latestMilestone[projectId][milestoneId] = newReport;

        // Append to history (bounded)
        if (milestoneHistory[projectId].length >= MAX_HISTORY) {
            for (uint256 i = 0; i < milestoneHistory[projectId].length - 1; i++) {
                milestoneHistory[projectId][i] = milestoneHistory[projectId][i + 1];
            }
            milestoneHistory[projectId].pop();
        }
        milestoneHistory[projectId].push(newReport);

        // Emit progress update
        emit MilestoneProgressUpdated(projectId, milestoneId, progressPercentage, timestamp);

        // Dispute detection: low verification score
        if (verificationScore < approvalThreshold && !approved) {
            emit MilestoneDisputed(
                projectId,
                milestoneId,
                verificationScore,
                "Verification score below threshold"
            );
        }

        // Verified milestone
        if (approved && verificationScore >= approvalThreshold) {
            emit MilestoneVerified(
                projectId,
                milestoneId,
                progressPercentage,
                verificationScore,
                timestamp
            );
        }

        // Cross-module hook: milestone completed at 100%
        if (approved && progressPercentage == 100) {
            emit MilestoneCompleted(projectId, milestoneId, timestamp);

            // If funding engine is configured, notify it for tranche release
            if (fundingEngine != address(0)) {
                // NOTE: Will be wired to TokenizedFundingEngine in Week 2
                (bool success, ) = fundingEngine.call(
                    abi.encodeWithSignature(
                        "releaseTranche(bytes32,uint8)",
                        projectId,
                        milestoneId
                    )
                );
                if (!success) {
                    emit MilestoneDisputed(
                        projectId,
                        milestoneId,
                        verificationScore,
                        "FUNDING_ENGINE_CALL_FAILED"
                    );
                }
            }
        }
    }

    // =========================================================================
    // Read Interface — For CRE Workflow & Dashboard
    // =========================================================================

    /**
     * @notice Returns the latest milestone report for a project milestone.
     */
    function getLatestMilestone(
        bytes32 projectId,
        uint8 milestoneId
    ) external view returns (
        uint8 progressPercentage,
        uint8 verificationScore,
        bool approved,
        uint64 timestamp
    ) {
        MilestoneReport memory r = latestMilestone[projectId][milestoneId];
        return (r.progressPercentage, r.verificationScore, r.approved, r.timestamp);
    }

    /**
     * @notice Returns the milestone config for a project.
     * @dev Called by the Milestone Oracle via EVMClient.callContract()
     */
    function getMilestoneConfig(bytes32 projectId) external view returns (
        uint8 totalMilestones,
        bool isActive
    ) {
        MilestoneConfig memory c = milestoneConfigs[projectId];
        return (c.totalMilestones, c.isActive);
    }

    /**
     * @notice Returns the count of historical milestone reports for a project.
     */
    function getMilestoneHistoryCount(bytes32 projectId) external view returns (uint256) {
        return milestoneHistory[projectId].length;
    }

    /**
     * @notice Returns a specific historical milestone report.
     */
    function getMilestoneHistoryEntry(
        bytes32 projectId,
        uint256 index
    ) external view returns (
        uint8 milestoneId,
        uint8 progressPercentage,
        uint8 verificationScore,
        bool approved,
        uint64 timestamp
    ) {
        require(index < milestoneHistory[projectId].length, "Index out of bounds");
        MilestoneReport memory r = milestoneHistory[projectId][index];
        return (
            r.milestoneId,
            r.progressPercentage,
            r.verificationScore,
            r.approved,
            r.timestamp
        );
    }

    // =========================================================================
    // Admin Functions
    // =========================================================================

    /**
     * @notice Register a project with its total milestone count.
     */
    function registerProjectMilestones(
        bytes32 projectId,
        uint8 totalMilestones
    ) external onlyOwner {
        require(totalMilestones > 0, "Must have at least one milestone");

        milestoneConfigs[projectId] = MilestoneConfig({
            totalMilestones: totalMilestones,
            isActive: true
        });

        emit ProjectMilestoneRegistered(projectId, totalMilestones);
    }

    /**
     * @notice Update the authorized CRE workflow DON address.
     */
    function setAuthorizedWorkflow(address _workflow) external onlyOwner {
        authorizedWorkflow = _workflow;
        emit AuthorizedWorkflowUpdated(_workflow);
    }

    /**
     * @notice Set the funding engine address (Week 2 — tranche release).
     */
    function setFundingEngine(address _engine) external onlyOwner {
        fundingEngine = _engine;
    }

    /**
     * @notice Update the auto-approval threshold.
     */
    function setApprovalThreshold(uint8 _threshold) external onlyOwner {
        require(_threshold <= 100, "Invalid threshold");
        approvalThreshold = _threshold;
    }
}
