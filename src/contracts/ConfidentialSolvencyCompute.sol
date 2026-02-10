// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ConfidentialSolvencyCompute
 * @author Revitalization Protocol
 * @notice On-chain contract for privacy-preserving solvency computation with
 *         attestation proofs. Demonstrates Chainlink Confidential Compute
 *         integration for sensitive financial scoring.
 *
 * @dev This contract:
 *   1. Computes weighted solvency scores from component inputs
 *   2. Stores only the score + attestation hash (not raw inputs)
 *   3. Supports enclave-verified submissions for CC SDK integration
 *   4. Provides attestation validation for downstream consumers
 *
 * Hackathon Categories: Privacy, CRE & AI, Risk & Compliance
 */
contract ConfidentialSolvencyCompute is AccessControl {
    // =========================================================================
    // Roles
    // =========================================================================

    bytes32 public constant COMPUTE_OPERATOR_ROLE = keccak256("COMPUTE_OPERATOR_ROLE");
    bytes32 public constant ENCLAVE_ROLE = keccak256("ENCLAVE_ROLE");

    // =========================================================================
    // Types
    // =========================================================================

    enum RiskLevel {
        LOW,        // Score >= 75
        MEDIUM,     // Score 50-74
        HIGH,       // Score 25-49
        CRITICAL    // Score < 25
    }

    struct ComputeResult {
        bytes32 projectId;
        uint8 score;
        RiskLevel riskLevel;
        bytes32 attestationHash;
        bool enclaveVerified;
        uint64 timestamp;
    }

    // =========================================================================
    // State
    // =========================================================================

    /// @notice Latest compute result per project
    mapping(bytes32 => ComputeResult) public latestResult;

    /// @notice Registered attestation hashes
    mapping(bytes32 => bool) public attestations;

    /// @notice Total computations performed
    uint256 public computationCount;

    // =========================================================================
    // Events
    // =========================================================================

    event SolvencyComputed(
        bytes32 indexed projectId,
        uint8 score,
        RiskLevel riskLevel,
        bytes32 attestationHash,
        uint64 timestamp
    );

    event EnclaveResultSubmitted(
        bytes32 indexed projectId,
        uint8 score,
        RiskLevel riskLevel,
        bytes32 attestationHash
    );

    event AttestationRegistered(bytes32 indexed attestationHash);

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(COMPUTE_OPERATOR_ROLE, msg.sender);
    }

    // =========================================================================
    // Core Computation
    // =========================================================================

    /**
     * @notice Compute a solvency score from component inputs.
     * @dev Uses the same weights as the CRE workflow: FH=35, CE=20, FM=25, RA=20.
     *      Only the score + attestation hash are stored, not raw inputs.
     * @param projectId The project identifier
     * @param financialHealth Financial health score (0-100)
     * @param costExposure Cost exposure score (0-100)
     * @param fundingMomentum Funding momentum score (0-100)
     * @param runwayAdequacy Runway adequacy score (0-100)
     * @param nonce Unique nonce for attestation hash differentiation
     */
    function computeSolvencyScore(
        bytes32 projectId,
        uint8 financialHealth,
        uint8 costExposure,
        uint8 fundingMomentum,
        uint8 runwayAdequacy,
        uint256 nonce
    ) external onlyRole(COMPUTE_OPERATOR_ROLE) {
        require(financialHealth <= 100, "Invalid financialHealth");
        require(costExposure <= 100, "Invalid costExposure");
        require(fundingMomentum <= 100, "Invalid fundingMomentum");
        require(runwayAdequacy <= 100, "Invalid runwayAdequacy");

        // Weighted computation: FH=35%, CE=20%, FM=25%, RA=20%
        uint256 score = (
            uint256(financialHealth) * 35 +
            uint256(costExposure) * 20 +
            uint256(fundingMomentum) * 25 +
            uint256(runwayAdequacy) * 20
        ) / 100;

        // Determine risk level
        RiskLevel riskLevel;
        if (score >= 75) riskLevel = RiskLevel.LOW;
        else if (score >= 50) riskLevel = RiskLevel.MEDIUM;
        else if (score >= 25) riskLevel = RiskLevel.HIGH;
        else riskLevel = RiskLevel.CRITICAL;

        // Compute attestation hash (inputs + outputs + nonce)
        bytes32 attestationHash = keccak256(abi.encodePacked(
            projectId,
            financialHealth,
            costExposure,
            fundingMomentum,
            runwayAdequacy,
            uint8(score),
            nonce
        ));

        // Determine enclave verification based on caller role
        bool enclaveVerified = hasRole(ENCLAVE_ROLE, msg.sender);

        // Store result (only score + attestation, not raw inputs)
        latestResult[projectId] = ComputeResult({
            projectId: projectId,
            score: uint8(score),
            riskLevel: riskLevel,
            attestationHash: attestationHash,
            enclaveVerified: enclaveVerified,
            timestamp: uint64(block.timestamp)
        });

        // Register attestation
        attestations[attestationHash] = true;
        computationCount++;

        emit SolvencyComputed(projectId, uint8(score), riskLevel, attestationHash, uint64(block.timestamp));
        emit AttestationRegistered(attestationHash);
    }

    /**
     * @notice Submit a pre-computed result from a CC SDK enclave.
     * @param projectId The project identifier
     * @param score Pre-computed solvency score (0-100)
     * @param riskLevel Pre-determined risk level
     * @param attestationHash Enclave-generated attestation hash
     * @param proof Enclave proof bytes (stored as attestation, validated off-chain)
     */
    function submitEnclaveResult(
        bytes32 projectId,
        uint8 score,
        uint8 riskLevel,
        bytes32 attestationHash,
        bytes calldata proof
    ) external onlyRole(ENCLAVE_ROLE) {
        require(score <= 100, "Invalid score");
        require(riskLevel <= 3, "Invalid risk level");
        require(proof.length > 0, "Empty proof");

        latestResult[projectId] = ComputeResult({
            projectId: projectId,
            score: score,
            riskLevel: RiskLevel(riskLevel),
            attestationHash: attestationHash,
            enclaveVerified: true,
            timestamp: uint64(block.timestamp)
        });

        attestations[attestationHash] = true;
        computationCount++;

        emit EnclaveResultSubmitted(projectId, score, RiskLevel(riskLevel), attestationHash);
        emit AttestationRegistered(attestationHash);
    }

    // =========================================================================
    // Read Interface
    // =========================================================================

    function getLatestResult(bytes32 projectId) external view returns (
        uint8 score,
        uint8 riskLevel,
        bytes32 attestationHash,
        bool enclaveVerified,
        uint64 timestamp
    ) {
        ComputeResult memory r = latestResult[projectId];
        return (r.score, uint8(r.riskLevel), r.attestationHash, r.enclaveVerified, r.timestamp);
    }

    function isAttestationValid(bytes32 hash) external view returns (bool) {
        return attestations[hash];
    }
}
