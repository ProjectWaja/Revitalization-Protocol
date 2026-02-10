// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface ITokenizedFundingEngine_Rescue {
    function initiateRescueFunding(bytes32 projectId, uint8 solvencyScore) external;
}

/**
 * @title SolvencyConsumer
 * @author Revitalization Protocol
 * @notice Receives and stores solvency reports from the CRE Solvency Oracle workflow.
 *         Designed as a Keystone-compatible consumer for CRE report delivery.
 *
 * @dev This contract:
 *   1. Stores project financial parameters (set by admin/governance)
 *   2. Receives signed solvency reports from the CRE workflow DON
 *   3. Maintains a rolling history of solvency scores per project
 *   4. Emits events for downstream consumers (funding engine, dashboard, alerts)
 *   5. Can trigger rescue funding when solvency drops below threshold
 *
 * Hackathon Categories: DeFi & Tokenization, Risk & Compliance, CRE & AI
 */
contract SolvencyConsumer is Ownable {
    // =========================================================================
    // Types
    // =========================================================================

    enum RiskLevel {
        LOW,        // Score >= 75
        MEDIUM,     // Score 50-74
        HIGH,       // Score 25-49
        CRITICAL    // Score < 25
    }

    struct SolvencyReport {
        bytes32 projectId;
        uint8 overallScore;        // 0-100
        RiskLevel riskLevel;
        uint8 financialHealth;     // Component scores (0-100)
        uint8 costExposure;
        uint8 fundingMomentum;
        uint8 runwayAdequacy;
        bool rescueTriggered;
        uint64 timestamp;
    }

    struct ProjectFinancials {
        uint256 totalBudget;       // USD * 1e6 (6 decimals)
        uint256 capitalDeployed;
        uint256 capitalRemaining;
        uint256 fundingVelocity;   // USD/month * 1e6
        uint256 burnRate;          // USD/month * 1e6
        bool isActive;
    }

    // =========================================================================
    // State
    // =========================================================================

    /// @notice Authorized CRE workflow DON address that can submit reports
    address public authorizedWorkflow;

    /// @notice Rescue funding contract (typed interface for safe cross-module calls)
    ITokenizedFundingEngine_Rescue public rescueFundingEngine;

    /// @notice Project financial parameters (set by admin, read by CRE workflow)
    mapping(bytes32 => ProjectFinancials) public projectFinancials;

    /// @notice Latest solvency report per project
    mapping(bytes32 => SolvencyReport) public latestSolvency;

    /// @notice Historical solvency reports per project (rolling buffer)
    mapping(bytes32 => SolvencyReport[]) public solvencyHistory;

    /// @notice Maximum history entries to retain per project
    uint256 public constant MAX_HISTORY = 100;

    /// @notice Threshold below which rescue funding is auto-triggered
    uint8 public rescueThreshold = 25;

    // =========================================================================
    // Events
    // =========================================================================

    event SolvencyUpdated(
        bytes32 indexed projectId,
        uint8 overallScore,
        RiskLevel riskLevel,
        uint64 timestamp
    );

    event RiskAlertTriggered(
        bytes32 indexed projectId,
        uint8 score,
        RiskLevel riskLevel,
        string alertType
    );

    event RescueFundingInitiated(
        bytes32 indexed projectId,
        uint8 solvencyScore,
        uint64 timestamp
    );

    event ProjectRegistered(
        bytes32 indexed projectId,
        uint256 totalBudget
    );

    event ProjectFinancialsUpdated(
        bytes32 indexed projectId
    );

    event AuthorizedWorkflowUpdated(address indexed newWorkflow);

    // =========================================================================
    // Modifiers
    // =========================================================================

    modifier onlyAuthorizedWorkflow() {
        require(
            msg.sender == authorizedWorkflow || msg.sender == owner(),
            "SolvencyConsumer: unauthorized"
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
     * @notice Receives a solvency report from the CRE Solvency Oracle workflow.
     * @dev Called by the CRE DON after generating a signed report.
     *      The report bytes are ABI-encoded as:
     *      (bytes32 projectId, uint8 overallScore, uint8 riskLevel,
     *       uint8 financialHealth, uint8 costExposure, uint8 fundingMomentum,
     *       uint8 runwayAdequacy, bool triggerRescue, uint64 timestamp)
     * @param report ABI-encoded solvency report data
     */
    function receiveSolvencyReport(bytes calldata report) external onlyAuthorizedWorkflow {
        (
            bytes32 projectId,
            uint8 overallScore,
            uint8 riskLevel,
            uint8 financialHealth,
            uint8 costExposure,
            uint8 fundingMomentum,
            uint8 runwayAdequacy,
            bool triggerRescue,
            uint64 timestamp
        ) = abi.decode(report, (bytes32, uint8, uint8, uint8, uint8, uint8, uint8, bool, uint64));

        require(overallScore <= 100, "Invalid score");
        require(riskLevel <= 3, "Invalid risk level");
        require(projectFinancials[projectId].isActive, "Project not registered");

        SolvencyReport memory newReport = SolvencyReport({
            projectId: projectId,
            overallScore: overallScore,
            riskLevel: RiskLevel(riskLevel),
            financialHealth: financialHealth,
            costExposure: costExposure,
            fundingMomentum: fundingMomentum,
            runwayAdequacy: runwayAdequacy,
            rescueTriggered: triggerRescue,
            timestamp: timestamp
        });

        // Store latest
        latestSolvency[projectId] = newReport;

        // Append to history (bounded)
        if (solvencyHistory[projectId].length >= MAX_HISTORY) {
            // Shift array left (remove oldest)
            for (uint256 i = 0; i < solvencyHistory[projectId].length - 1; i++) {
                solvencyHistory[projectId][i] = solvencyHistory[projectId][i + 1];
            }
            solvencyHistory[projectId].pop();
        }
        solvencyHistory[projectId].push(newReport);

        emit SolvencyUpdated(projectId, overallScore, RiskLevel(riskLevel), timestamp);

        // Alert logic
        if (riskLevel >= 2) {
            string memory alertType = riskLevel == 3 ? "CRITICAL" : "HIGH";
            emit RiskAlertTriggered(projectId, overallScore, RiskLevel(riskLevel), alertType);
        }

        // Rescue funding trigger
        if (triggerRescue || overallScore < rescueThreshold) {
            emit RescueFundingInitiated(projectId, overallScore, timestamp);

            // If rescue funding engine is configured, call it via typed interface
            if (address(rescueFundingEngine) != address(0)) {
                try rescueFundingEngine.initiateRescueFunding(projectId, overallScore) {
                    // success — no action needed
                } catch {
                    emit RiskAlertTriggered(
                        projectId,
                        overallScore,
                        RiskLevel(riskLevel),
                        "RESCUE_CALL_FAILED"
                    );
                }
            }
        }
    }

    // =========================================================================
    // Read Interface — For CRE Workflow & Dashboard
    // =========================================================================

    /**
     * @notice Returns project financial parameters for the CRE workflow.
     * @dev Called by the Solvency Oracle via EVMClient.callContract()
     */
    function getProjectFinancials(bytes32 projectId) external view returns (
        uint256 totalBudget,
        uint256 capitalDeployed,
        uint256 capitalRemaining,
        uint256 fundingVelocity,
        uint256 burnRate
    ) {
        ProjectFinancials memory p = projectFinancials[projectId];
        return (p.totalBudget, p.capitalDeployed, p.capitalRemaining, p.fundingVelocity, p.burnRate);
    }

    /**
     * @notice Returns the latest solvency report for a project.
     */
    function getLatestSolvency(bytes32 projectId) external view returns (
        uint8 overallScore,
        uint8 riskLevel,
        uint8 financialHealth,
        uint8 costExposure,
        uint8 fundingMomentum,
        uint8 runwayAdequacy,
        bool rescueTriggered,
        uint64 timestamp
    ) {
        SolvencyReport memory r = latestSolvency[projectId];
        return (
            r.overallScore,
            uint8(r.riskLevel),
            r.financialHealth,
            r.costExposure,
            r.fundingMomentum,
            r.runwayAdequacy,
            r.rescueTriggered,
            r.timestamp
        );
    }

    /**
     * @notice Returns the count of historical solvency reports for a project.
     */
    function getSolvencyHistoryCount(bytes32 projectId) external view returns (uint256) {
        return solvencyHistory[projectId].length;
    }

    /**
     * @notice Returns a specific historical solvency report.
     */
    function getSolvencyHistoryEntry(bytes32 projectId, uint256 index) external view returns (
        uint8 overallScore,
        uint8 riskLevel,
        uint64 timestamp
    ) {
        require(index < solvencyHistory[projectId].length, "Index out of bounds");
        SolvencyReport memory r = solvencyHistory[projectId][index];
        return (r.overallScore, uint8(r.riskLevel), r.timestamp);
    }

    // =========================================================================
    // Admin Functions
    // =========================================================================

    /**
     * @notice Register a new project with its financial parameters.
     */
    function registerProject(
        bytes32 projectId,
        uint256 totalBudget,
        uint256 capitalDeployed,
        uint256 capitalRemaining,
        uint256 fundingVelocity,
        uint256 burnRate
    ) external onlyOwner {
        projectFinancials[projectId] = ProjectFinancials({
            totalBudget: totalBudget,
            capitalDeployed: capitalDeployed,
            capitalRemaining: capitalRemaining,
            fundingVelocity: fundingVelocity,
            burnRate: burnRate,
            isActive: true
        });

        emit ProjectRegistered(projectId, totalBudget);
    }

    /**
     * @notice Update financial parameters for an existing project.
     * @dev In production, this would be called by a governance contract or
     *      another CRE workflow that ingests real financial data.
     */
    function updateProjectFinancials(
        bytes32 projectId,
        uint256 capitalDeployed,
        uint256 capitalRemaining,
        uint256 fundingVelocity,
        uint256 burnRate
    ) external onlyOwner {
        require(projectFinancials[projectId].isActive, "Project not registered");

        ProjectFinancials storage p = projectFinancials[projectId];
        p.capitalDeployed = capitalDeployed;
        p.capitalRemaining = capitalRemaining;
        p.fundingVelocity = fundingVelocity;
        p.burnRate = burnRate;

        emit ProjectFinancialsUpdated(projectId);
    }

    /**
     * @notice Update the authorized CRE workflow DON address.
     */
    function setAuthorizedWorkflow(address _workflow) external onlyOwner {
        authorizedWorkflow = _workflow;
        emit AuthorizedWorkflowUpdated(_workflow);
    }

    /**
     * @notice Set the rescue funding engine address (Module 2).
     */
    function setRescueFundingEngine(address _engine) external onlyOwner {
        rescueFundingEngine = ITokenizedFundingEngine_Rescue(_engine);
    }

    /**
     * @notice Update the rescue trigger threshold.
     */
    function setRescueThreshold(uint8 _threshold) external onlyOwner {
        require(_threshold <= 100, "Invalid threshold");
        rescueThreshold = _threshold;
    }
}
