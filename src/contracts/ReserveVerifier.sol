// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

// =============================================================================
// Chainlink Automation Interface
// Compatible with Chainlink Automation — register as Custom Logic upkeep
// at automation.chain.link with this contract address
// =============================================================================

interface AutomationCompatibleInterface_Verifier {
    function checkUpkeep(bytes calldata checkData) external returns (bool upkeepNeeded, bytes memory performData);
    function performUpkeep(bytes calldata performData) external;
}

/**
 * @title ReserveVerifier
 * @author Revitalization Protocol
 * @notice Integrates Chainlink Proof of Reserves to verify project collateral
 *         and funding engine reserves. Provides cryptographic assurance that
 *         claimed financial backing actually exists.
 *
 * @dev This contract:
 *   1. Reads Chainlink PoR data feeds for project reserve wallets
 *   2. Verifies TokenizedFundingEngine ETH balances match reported deposits
 *   3. Validates project financial claims against on-chain reserves
 *   4. Emits alerts when reserves fall below claimed amounts
 *   5. Blocks rescue funding if reserves cannot be verified
 *
 * Chainlink Proof of Reserves provides cryptographic proof that off-chain or
 * cross-chain reserves backing a protocol actually exist. For infrastructure
 * projects, this means verifying that claimed budgets, escrow accounts, and
 * funding commitments are real — not just self-reported numbers.
 *
 * Hackathon Categories: DeFi & Tokenization, Risk & Compliance
 */
contract ReserveVerifier is Ownable, AutomationCompatibleInterface_Verifier {
    // =========================================================================
    // Types
    // =========================================================================

    enum VerificationStatus {
        UNVERIFIED,
        VERIFIED,
        UNDER_RESERVED,
        STALE_DATA,
        FEED_UNAVAILABLE
    }

    struct ProjectReserveConfig {
        address porFeedAddress;         // Chainlink PoR data feed for this project
        address reserveWallet;          // On-chain wallet holding project reserves
        uint256 claimedReserves;        // Self-reported reserve amount (USD * 1e6)
        uint256 minimumReserveRatio;    // Min ratio (basis points, e.g., 8000 = 80%)
        bool isActive;
    }

    struct ReserveVerification {
        bytes32 projectId;
        uint256 porReportedReserves;    // What PoR feed reports
        uint256 onchainBalance;         // What the chain shows
        uint256 claimedReserves;        // What the project claims
        VerificationStatus status;
        uint256 reserveRatio;           // Actual / Claimed (basis points)
        uint64 timestamp;
    }

    struct FundingEngineVerification {
        address engineAddress;
        uint256 contractBalance;        // Actual ETH in the contract
        uint256 reportedDeposits;       // Sum of all round totalDeposited
        VerificationStatus status;
        uint64 timestamp;
    }

    // =========================================================================
    // State
    // =========================================================================

    /// @notice PoR configurations per project
    mapping(bytes32 => ProjectReserveConfig) public projectReserves;

    /// @notice Latest verification result per project
    mapping(bytes32 => ReserveVerification) public latestVerification;

    /// @notice Latest funding engine verification
    FundingEngineVerification public latestEngineVerification;

    /// @notice Maximum staleness for PoR data (default 1 hour)
    uint256 public maxStaleness = 1 hours;

    /// @notice Address of the TokenizedFundingEngine
    address public fundingEngine;

    /// @notice Automation: interval between automated verifications (default 4 hours)
    uint256 public automationInterval = 4 hours;

    /// @notice Automation: timestamp of last automated verification
    uint256 public lastAutomatedVerification;

    /// @notice Automation: cached total deposits for engine verification
    uint256 public cachedTotalDeposits;

    // =========================================================================
    // Events
    // =========================================================================

    event ReservesVerified(
        bytes32 indexed projectId,
        VerificationStatus status,
        uint256 reserveRatio,
        uint64 timestamp
    );

    event ReserveDeficitDetected(
        bytes32 indexed projectId,
        uint256 claimed,
        uint256 actual,
        uint256 deficitPercent
    );

    event FundingEngineVerified(
        address indexed engine,
        VerificationStatus status,
        uint256 contractBalance,
        uint256 reportedDeposits
    );

    event ProjectReserveConfigured(
        bytes32 indexed projectId,
        address porFeed,
        address reserveWallet
    );

    event AutomatedVerificationPerformed(uint64 timestamp);

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor(address _fundingEngine) Ownable(msg.sender) {
        fundingEngine = _fundingEngine;
    }

    // =========================================================================
    // Core Verification Functions
    // =========================================================================

    /**
     * @notice Verify a project's reserves against its Chainlink PoR feed.
     * @dev Reads the PoR data feed, compares against claimed reserves,
     *      and checks the on-chain wallet balance as a secondary signal.
     * @param projectId The bytes32 project identifier
     */
    function verifyProjectReserves(bytes32 projectId) external returns (VerificationStatus) {
        ProjectReserveConfig storage config = projectReserves[projectId];
        require(config.isActive, "Project not configured for PoR");

        uint256 porReported = 0;
        VerificationStatus status;

        // Read Chainlink PoR feed
        if (config.porFeedAddress != address(0)) {
            try AggregatorV3Interface(config.porFeedAddress).latestRoundData() returns (
                uint80,
                int256 answer,
                uint256,
                uint256 updatedAt,
                uint80
            ) {
                // Check staleness
                if (block.timestamp - updatedAt > maxStaleness) {
                    status = VerificationStatus.STALE_DATA;
                } else {
                    uint8 decimals = AggregatorV3Interface(config.porFeedAddress).decimals();
                    // Normalize to USD * 1e6
                    if (decimals <= 6) {
                        porReported = uint256(answer) * (10 ** (6 - decimals));
                    } else {
                        porReported = uint256(answer) / (10 ** (decimals - 6));
                    }
                }
            } catch {
                status = VerificationStatus.FEED_UNAVAILABLE;
            }
        }

        // Check on-chain wallet balance as secondary signal
        uint256 onchainBalance = 0;
        if (config.reserveWallet != address(0)) {
            onchainBalance = config.reserveWallet.balance;
        }

        // Determine total verifiable reserves (PoR feed + on-chain)
        uint256 totalVerified = porReported > 0 ? porReported : onchainBalance;

        // Calculate reserve ratio (basis points)
        uint256 reserveRatio = config.claimedReserves > 0
            ? (totalVerified * 10000) / config.claimedReserves
            : 0;

        // Determine status if not already set by staleness/unavailability
        if (status == VerificationStatus.UNVERIFIED) {
            if (reserveRatio >= config.minimumReserveRatio) {
                status = VerificationStatus.VERIFIED;
            } else {
                status = VerificationStatus.UNDER_RESERVED;
            }
        }

        // Store verification result
        latestVerification[projectId] = ReserveVerification({
            projectId: projectId,
            porReportedReserves: porReported,
            onchainBalance: onchainBalance,
            claimedReserves: config.claimedReserves,
            status: status,
            reserveRatio: reserveRatio,
            timestamp: uint64(block.timestamp)
        });

        emit ReservesVerified(projectId, status, reserveRatio, uint64(block.timestamp));

        // Emit deficit alert if under-reserved
        if (status == VerificationStatus.UNDER_RESERVED) {
            uint256 deficitPercent = 10000 - reserveRatio;
            emit ReserveDeficitDetected(
                projectId,
                config.claimedReserves,
                totalVerified,
                deficitPercent
            );
        }

        return status;
    }

    /**
     * @notice Verify the TokenizedFundingEngine's ETH balance matches deposits.
     * @dev Self-referential PoR: ensures the contract holds what it claims.
     *      Compares actual ETH balance to the sum of all active round deposits.
     * @param reportedTotalDeposits The total deposits as reported by the engine
     */
    function verifyFundingEngineReserves(
        uint256 reportedTotalDeposits
    ) external returns (VerificationStatus) {
        require(fundingEngine != address(0), "Funding engine not set");

        uint256 actualBalance = fundingEngine.balance;

        VerificationStatus status;
        if (actualBalance >= reportedTotalDeposits) {
            status = VerificationStatus.VERIFIED;
        } else {
            status = VerificationStatus.UNDER_RESERVED;
        }

        latestEngineVerification = FundingEngineVerification({
            engineAddress: fundingEngine,
            contractBalance: actualBalance,
            reportedDeposits: reportedTotalDeposits,
            status: status,
            timestamp: uint64(block.timestamp)
        });

        emit FundingEngineVerified(fundingEngine, status, actualBalance, reportedTotalDeposits);

        return status;
    }

    /**
     * @notice Check if a project's reserves are currently verified.
     * @dev Used by TokenizedFundingEngine before allowing rescue funding.
     */
    function isReserveVerified(bytes32 projectId) external view returns (bool) {
        ReserveVerification memory v = latestVerification[projectId];
        if (v.timestamp == 0) return false;
        if (block.timestamp - v.timestamp > maxStaleness) return false;
        return v.status == VerificationStatus.VERIFIED;
    }

    /**
     * @notice Check if the funding engine's reserves are verified.
     */
    function isEngineReserveVerified() external view returns (bool) {
        FundingEngineVerification memory v = latestEngineVerification;
        if (v.timestamp == 0) return false;
        if (block.timestamp - v.timestamp > maxStaleness) return false;
        return v.status == VerificationStatus.VERIFIED;
    }

    // =========================================================================
    // Read Interface
    // =========================================================================

    function getProjectVerification(bytes32 projectId) external view returns (
        uint256 porReported,
        uint256 onchainBalance,
        uint256 claimed,
        uint8 status,
        uint256 reserveRatio,
        uint64 timestamp
    ) {
        ReserveVerification memory v = latestVerification[projectId];
        return (
            v.porReportedReserves,
            v.onchainBalance,
            v.claimedReserves,
            uint8(v.status),
            v.reserveRatio,
            v.timestamp
        );
    }

    function getEngineVerification() external view returns (
        address engine,
        uint256 contractBalance,
        uint256 reportedDeposits,
        uint8 status,
        uint64 timestamp
    ) {
        FundingEngineVerification memory v = latestEngineVerification;
        return (v.engineAddress, v.contractBalance, v.reportedDeposits, uint8(v.status), v.timestamp);
    }

    // =========================================================================
    // Admin Functions
    // =========================================================================

    /**
     * @notice Configure a project's reserve verification parameters.
     * @param projectId The project to configure
     * @param porFeedAddress Chainlink PoR data feed address (0x0 if none).
     *        NOTE: No Chainlink Proof of Reserves feed currently exists for
     *        construction project escrow accounts. We use ETH/USD as a
     *        demonstration feed on Sepolia. A dedicated PoR feed for
     *        construction escrow would enable trustless verification of
     *        project financial backing — a real-world gap Chainlink could fill.
     * @param reserveWallet On-chain wallet holding reserves (for balance check)
     * @param claimedReserves The project's self-reported reserves (USD * 1e6)
     * @param minimumReserveRatio Minimum acceptable ratio (basis points)
     */
    function configureProjectReserves(
        bytes32 projectId,
        address porFeedAddress,
        address reserveWallet,
        uint256 claimedReserves,
        uint256 minimumReserveRatio
    ) external onlyOwner {
        require(minimumReserveRatio <= 10000, "Ratio cannot exceed 100%");

        projectReserves[projectId] = ProjectReserveConfig({
            porFeedAddress: porFeedAddress,
            reserveWallet: reserveWallet,
            claimedReserves: claimedReserves,
            minimumReserveRatio: minimumReserveRatio,
            isActive: true
        });

        emit ProjectReserveConfigured(projectId, porFeedAddress, reserveWallet);
    }

    function setFundingEngine(address _engine) external onlyOwner {
        fundingEngine = _engine;
    }

    function setMaxStaleness(uint256 _maxStaleness) external onlyOwner {
        maxStaleness = _maxStaleness;
    }

    function setCachedTotalDeposits(uint256 _deposits) external onlyOwner {
        cachedTotalDeposits = _deposits;
    }

    function setAutomationInterval(uint256 _interval) external onlyOwner {
        automationInterval = _interval;
    }

    // =========================================================================
    // Chainlink Automation
    // =========================================================================

    function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory performData) {
        bool intervalElapsed = (block.timestamp - lastAutomatedVerification) >= automationInterval;
        return (intervalElapsed, "");
    }

    function performUpkeep(bytes calldata) external override {
        require(
            (block.timestamp - lastAutomatedVerification) >= automationInterval,
            "Interval not elapsed"
        );

        lastAutomatedVerification = block.timestamp;

        // Verify funding engine reserves using cached deposits
        this.verifyFundingEngineReserves(cachedTotalDeposits);

        emit AutomatedVerificationPerformed(uint64(block.timestamp));
    }
}
