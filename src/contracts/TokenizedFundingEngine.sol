// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";

// =============================================================================
// Chainlink Automation Interface
// Compatible with Chainlink Automation — register as Custom Logic upkeep
// at automation.chain.link with this contract address
// =============================================================================

interface AutomationCompatibleInterface {
    function checkUpkeep(bytes calldata checkData) external returns (bool upkeepNeeded, bytes memory performData);
    function performUpkeep(bytes calldata performData) external;
}

/**
 * @title TokenizedFundingEngine
 * @author Revitalization Protocol
 * @notice ERC-1155 funding engine that manages fractional rescue funding positions
 *         with milestone-gated tranche release and CCIP cross-chain capability.
 *
 * @dev This contract:
 *   1. Creates funding rounds (standard or rescue) with milestone-gated tranches
 *   2. Mints ERC-1155 position tokens for investors who deposit ETH
 *   3. Releases tranches when MilestoneConsumer calls releaseTranche()
 *   4. Creates rescue funding rounds when SolvencyConsumer calls initiateRescueFunding()
 *   5. Supports CCIP cross-chain funding to Polygon Amoy
 *
 * Token ID encoding: (uint128(projectId) << 128) | uint128(roundId)
 *
 * Hackathon Categories: DeFi & Tokenization, Risk & Compliance, CRE & AI
 */
contract TokenizedFundingEngine is ERC1155, AccessControl, ReentrancyGuard, Pausable, AutomationCompatibleInterface {
    // =========================================================================
    // Roles
    // =========================================================================

    bytes32 public constant SOLVENCY_ORACLE_ROLE = keccak256("SOLVENCY_ORACLE_ROLE");
    bytes32 public constant MILESTONE_ORACLE_ROLE = keccak256("MILESTONE_ORACLE_ROLE");

    // =========================================================================
    // Types
    // =========================================================================

    enum RoundStatus {
        OPEN,
        FUNDED,
        RELEASING,
        COMPLETED,
        CANCELLED
    }

    enum RoundType {
        STANDARD,
        RESCUE
    }

    struct TrancheConfig {
        uint8 milestoneId;
        uint16 basisPoints;     // Share of total funds (0-10000)
        bool released;
    }

    struct FundingRound {
        bytes32 projectId;
        uint256 roundId;
        RoundType roundType;
        RoundStatus status;
        uint256 targetAmount;
        uint256 totalDeposited;
        uint256 totalReleased;
        uint256 deadline;
        uint256 investorCount;
        uint16 rescuePremiumBps;    // Bonus for rescue investors (basis points, e.g., 4100 = 41%)
    }

    struct InvestorPosition {
        uint256 amount;
        uint256 claimed;
    }

    // =========================================================================
    // State
    // =========================================================================

    /// @notice CCIP Router address (Sepolia)
    address public ccipRouter;

    /// @notice Polygon Amoy chain selector for CCIP
    uint64 public polygonChainSelector;

    /// @notice Chainlink ETH/USD price feed for USD-denominated reporting
    AggregatorV3Interface public ethUsdPriceFeed;

    /// @notice Auto-incrementing round counter
    uint256 public nextRoundId = 1;

    /// @notice All funding rounds by ID
    mapping(uint256 => FundingRound) public fundingRounds;

    /// @notice Tranches for each round
    mapping(uint256 => TrancheConfig[]) public roundTranches;

    /// @notice Investor positions: roundId => investor => position
    mapping(uint256 => mapping(address => InvestorPosition)) public investorPositions;

    /// @notice List of rounds per project
    mapping(bytes32 => uint256[]) public projectRounds;

    /// @notice Admin-deposited premium pool per rescue round (in wei)
    mapping(uint256 => uint256) public rescuePremiumPool;

    // =========================================================================
    // Events
    // =========================================================================

    event FundingRoundCreated(
        uint256 indexed roundId,
        bytes32 indexed projectId,
        RoundType roundType,
        uint256 targetAmount,
        uint256 deadline
    );

    event InvestmentReceived(
        uint256 indexed roundId,
        address indexed investor,
        uint256 amount,
        uint256 tokenId
    );

    event TrancheReleased(
        uint256 indexed roundId,
        uint8 milestoneId,
        uint256 releaseAmount
    );

    event RescueFundingActivated(
        bytes32 indexed projectId,
        uint256 indexed roundId,
        uint8 solvencyScore
    );

    event CrossChainTransferInitiated(
        bytes32 indexed messageId,
        uint64 destinationChain,
        uint256 amount
    );

    event FundsClaimedByInvestor(
        uint256 indexed roundId,
        address indexed investor,
        uint256 amount
    );

    event RoundCancelled(uint256 indexed roundId);

    event AutomationCancelledExpiredRound(uint256 indexed roundId);

    event RescuePremiumDeposited(uint256 indexed roundId, uint256 amount, uint16 premiumBps);

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor(
        string memory uri_,
        address _ccipRouter,
        uint64 _polygonChainSelector,
        address _ethUsdPriceFeed
    ) ERC1155(uri_) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        ccipRouter = _ccipRouter;
        polygonChainSelector = _polygonChainSelector;
        if (_ethUsdPriceFeed != address(0)) {
            ethUsdPriceFeed = AggregatorV3Interface(_ethUsdPriceFeed);
        }
    }

    // =========================================================================
    // Token ID Encoding
    // =========================================================================

    function encodeTokenId(bytes32 projectId, uint256 roundId) public pure returns (uint256) {
        return (uint256(uint128(uint256(projectId))) << 128) | uint128(roundId);
    }

    function decodeTokenId(uint256 tokenId) public pure returns (bytes32 projectId, uint256 roundId) {
        projectId = bytes32(uint256(uint128(tokenId >> 128)));
        roundId = uint256(uint128(tokenId));
    }

    // =========================================================================
    // Core Functions
    // =========================================================================

    /**
     * @notice Creates a standard funding round with milestone-gated tranches.
     * @param projectId The bytes32 project identifier
     * @param targetAmount Target ETH amount to raise (in wei)
     * @param deadline Unix timestamp deadline for funding
     * @param milestoneIds Milestone IDs for each tranche
     * @param trancheBasisPoints Basis points for each tranche (must sum to 10000)
     */
    function createFundingRound(
        bytes32 projectId,
        uint256 targetAmount,
        uint256 deadline,
        uint8[] calldata milestoneIds,
        uint16[] calldata trancheBasisPoints
    ) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        require(targetAmount > 0, "Target must be > 0");
        require(deadline > block.timestamp, "Deadline must be future");
        require(milestoneIds.length > 0, "Must have tranches");
        require(milestoneIds.length == trancheBasisPoints.length, "Array length mismatch");

        uint256 totalBps;
        for (uint256 i = 0; i < trancheBasisPoints.length; i++) {
            totalBps += trancheBasisPoints[i];
        }
        require(totalBps == 10000, "Basis points must sum to 10000");

        uint256 roundId = nextRoundId++;

        fundingRounds[roundId] = FundingRound({
            projectId: projectId,
            roundId: roundId,
            roundType: RoundType.STANDARD,
            status: RoundStatus.OPEN,
            targetAmount: targetAmount,
            totalDeposited: 0,
            totalReleased: 0,
            deadline: deadline,
            investorCount: 0,
            rescuePremiumBps: 0
        });

        for (uint256 i = 0; i < milestoneIds.length; i++) {
            roundTranches[roundId].push(TrancheConfig({
                milestoneId: milestoneIds[i],
                basisPoints: trancheBasisPoints[i],
                released: false
            }));
        }

        projectRounds[projectId].push(roundId);

        emit FundingRoundCreated(roundId, projectId, RoundType.STANDARD, targetAmount, deadline);
    }

    /**
     * @notice Deposit ETH into a funding round. Mints ERC-1155 position tokens.
     * @param roundId The funding round to invest in
     */
    function invest(uint256 roundId) external payable nonReentrant whenNotPaused {
        require(msg.value > 0, "Must send ETH");

        FundingRound storage round = fundingRounds[roundId];
        require(round.targetAmount > 0, "Round does not exist");
        require(round.status == RoundStatus.OPEN, "Round not open");
        require(block.timestamp <= round.deadline, "Round expired");

        // Track investor position
        InvestorPosition storage pos = investorPositions[roundId][msg.sender];
        if (pos.amount == 0) {
            round.investorCount++;
        }
        pos.amount += msg.value;

        round.totalDeposited += msg.value;

        // Mint ERC-1155 position tokens (amount = ETH deposited in wei)
        uint256 tokenId = encodeTokenId(round.projectId, roundId);
        _mint(msg.sender, tokenId, msg.value, "");

        // Auto-transition to FUNDED if target reached
        if (round.totalDeposited >= round.targetAmount) {
            round.status = RoundStatus.FUNDED;
        }

        emit InvestmentReceived(roundId, msg.sender, msg.value, tokenId);
    }

    /**
     * @notice Called by MilestoneConsumer when a milestone reaches 100%.
     *         Releases the matching tranche for all active rounds of the project.
     * @param projectId The bytes32 project identifier
     * @param milestoneId The milestone that was completed
     */
    function releaseTranche(
        bytes32 projectId,
        uint8 milestoneId
    ) external onlyRole(MILESTONE_ORACLE_ROLE) whenNotPaused {
        uint256[] storage rounds = projectRounds[projectId];

        for (uint256 r = 0; r < rounds.length; r++) {
            uint256 roundId = rounds[r];
            FundingRound storage round = fundingRounds[roundId];

            // Only release from funded or already-releasing rounds
            if (round.status != RoundStatus.FUNDED && round.status != RoundStatus.RELEASING) {
                continue;
            }

            TrancheConfig[] storage tranches = roundTranches[roundId];
            for (uint256 t = 0; t < tranches.length; t++) {
                if (tranches[t].milestoneId == milestoneId && !tranches[t].released) {
                    tranches[t].released = true;

                    uint256 releaseAmount = (round.totalDeposited * tranches[t].basisPoints) / 10000;
                    round.totalReleased += releaseAmount;

                    // Transition to RELEASING
                    if (round.status == RoundStatus.FUNDED) {
                        round.status = RoundStatus.RELEASING;
                    }

                    // Check if all tranches released
                    bool allReleased = true;
                    for (uint256 k = 0; k < tranches.length; k++) {
                        if (!tranches[k].released) {
                            allReleased = false;
                            break;
                        }
                    }
                    if (allReleased) {
                        round.status = RoundStatus.COMPLETED;
                    }

                    emit TrancheReleased(roundId, milestoneId, releaseAmount);
                }
            }
        }
    }

    /**
     * @notice Called by SolvencyConsumer when solvency drops below threshold.
     *         Creates an emergency RESCUE funding round.
     * @param projectId The bytes32 project identifier
     * @param solvencyScore The score that triggered rescue (0-100)
     */
    function initiateRescueFunding(
        bytes32 projectId,
        uint8 solvencyScore
    ) external onlyRole(SOLVENCY_ORACLE_ROLE) whenNotPaused {
        // Estimate rescue target based on severity: lower score = higher target
        uint256 rescueTarget = uint256(100 - solvencyScore) * 0.1 ether;
        if (rescueTarget < 1 ether) rescueTarget = 1 ether;

        // Calculate rescue premium: more severe → higher premium to attract capital (capped at 50%)
        uint256 rawPremium = uint256(100 - solvencyScore) * 50;
        uint16 premiumBps = uint16(rawPremium > 5000 ? 5000 : rawPremium);

        uint256 roundId = nextRoundId++;
        uint256 deadline = block.timestamp + 7 days;

        fundingRounds[roundId] = FundingRound({
            projectId: projectId,
            roundId: roundId,
            roundType: RoundType.RESCUE,
            status: RoundStatus.OPEN,
            targetAmount: rescueTarget,
            totalDeposited: 0,
            totalReleased: 0,
            deadline: deadline,
            investorCount: 0,
            rescuePremiumBps: premiumBps
        });

        // Rescue rounds get a single tranche released immediately upon funding
        roundTranches[roundId].push(TrancheConfig({
            milestoneId: 0,
            basisPoints: 10000,
            released: false
        }));

        projectRounds[projectId].push(roundId);

        emit FundingRoundCreated(roundId, projectId, RoundType.RESCUE, rescueTarget, deadline);
        emit RescueFundingActivated(projectId, roundId, solvencyScore);
    }

    /**
     * @notice Claim pro-rata share of released tranche funds.
     * @param roundId The funding round to claim from
     */
    function claimReleasedFunds(uint256 roundId) external nonReentrant whenNotPaused {
        FundingRound storage round = fundingRounds[roundId];
        require(
            round.status == RoundStatus.RELEASING ||
            round.status == RoundStatus.COMPLETED ||
            round.status == RoundStatus.CANCELLED,
            "No funds released"
        );

        InvestorPosition storage pos = investorPositions[roundId][msg.sender];
        require(pos.amount > 0, "No position");

        // Calculate pro-rata share of released funds
        uint256 totalClaimable = (round.totalReleased * pos.amount) / round.totalDeposited;
        uint256 unclaimed = totalClaimable - pos.claimed;
        require(unclaimed > 0, "Nothing to claim");

        pos.claimed += unclaimed;

        // Calculate rescue premium bonus (if rescue round with funded premium pool)
        uint256 premiumAmount = 0;
        if (
            round.roundType == RoundType.RESCUE &&
            round.rescuePremiumBps > 0 &&
            round.status != RoundStatus.CANCELLED
        ) {
            uint256 pool = rescuePremiumPool[roundId];
            if (pool > 0) {
                // Investor's pro-rata share of the premium pool
                premiumAmount = (pool * pos.amount) / round.totalDeposited;
                if (premiumAmount > pool) premiumAmount = pool;
                rescuePremiumPool[roundId] -= premiumAmount;
            }
        }

        uint256 totalPayout = unclaimed + premiumAmount;

        (bool success, ) = payable(msg.sender).call{value: totalPayout}("");
        require(success, "ETH transfer failed");

        emit FundsClaimedByInvestor(roundId, msg.sender, totalPayout);
    }

    /**
     * @notice Send funding cross-chain via CCIP to Polygon mirror contract.
     * @param destinationAddress The receiving contract on Polygon Amoy
     * @param roundId The funding round data to send
     * @param amount The ETH amount to bridge
     */
    function sendCrossChainFunding(
        address destinationAddress,
        uint256 roundId,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        require(ccipRouter != address(0), "CCIP router not set");
        require(amount > 0, "Amount must be > 0");

        FundingRound storage round = fundingRounds[roundId];
        require(round.targetAmount > 0, "Round does not exist");

        // Encode funding data for cross-chain message
        bytes memory data = abi.encode(
            round.projectId,
            roundId,
            uint8(round.roundType),
            amount
        );

        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(destinationAddress),
            data: data,
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({gasLimit: 200_000, allowOutOfOrderExecution: true})
            ),
            feeToken: address(0)  // Pay in native ETH
        });

        uint256 fee = IRouterClient(ccipRouter).getFee(polygonChainSelector, message);

        bytes32 messageId = IRouterClient(ccipRouter).ccipSend{value: fee + amount}(
            polygonChainSelector,
            message
        );

        emit CrossChainTransferInitiated(messageId, polygonChainSelector, amount);
    }

    /**
     * @notice Admin deposits ETH into a rescue round's premium pool.
     *         This funds the bonus payout for rescue investors who take on
     *         the risk of saving a distressed project.
     * @param roundId The rescue funding round
     */
    function depositRescuePremium(uint256 roundId) external payable onlyRole(DEFAULT_ADMIN_ROLE) {
        require(msg.value > 0, "Must send ETH");
        FundingRound storage round = fundingRounds[roundId];
        require(round.targetAmount > 0, "Round does not exist");
        require(round.roundType == RoundType.RESCUE, "Not a rescue round");
        require(round.rescuePremiumBps > 0, "No premium configured");

        rescuePremiumPool[roundId] += msg.value;

        emit RescuePremiumDeposited(roundId, msg.value, round.rescuePremiumBps);
    }

    /**
     * @notice Admin safety valve — cancel a round and allow investors to withdraw.
     * @param roundId The funding round to cancel
     */
    function cancelRound(uint256 roundId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        FundingRound storage round = fundingRounds[roundId];
        require(round.targetAmount > 0, "Round does not exist");
        require(
            round.status == RoundStatus.OPEN || round.status == RoundStatus.FUNDED,
            "Cannot cancel"
        );

        round.status = RoundStatus.CANCELLED;
        // Mark all funds as "released" so investors can claim refunds
        round.totalReleased = round.totalDeposited;

        emit RoundCancelled(roundId);
    }

    // =========================================================================
    // Read Interface
    // =========================================================================

    /**
     * @notice Returns all round IDs for a project.
     */
    function getProjectRounds(bytes32 projectId) external view returns (uint256[] memory) {
        return projectRounds[projectId];
    }

    /**
     * @notice Returns funding round info.
     */
    function getRoundInfo(uint256 roundId) external view returns (
        bytes32 projectId,
        uint8 roundType,
        uint8 status,
        uint256 targetAmount,
        uint256 totalDeposited,
        uint256 totalReleased,
        uint256 deadline,
        uint256 investorCount,
        uint16 rescuePremiumBps
    ) {
        FundingRound memory r = fundingRounds[roundId];
        return (
            r.projectId,
            uint8(r.roundType),
            uint8(r.status),
            r.targetAmount,
            r.totalDeposited,
            r.totalReleased,
            r.deadline,
            r.investorCount,
            r.rescuePremiumBps
        );
    }

    /**
     * @notice Returns rescue premium info for a round.
     */
    function getRescuePremiumInfo(uint256 roundId) external view returns (
        uint16 premiumBps,
        uint256 premiumPool,
        uint256 estimatedBonusPerEth
    ) {
        FundingRound memory r = fundingRounds[roundId];
        premiumBps = r.rescuePremiumBps;
        premiumPool = rescuePremiumPool[roundId];
        if (r.totalDeposited > 0) {
            estimatedBonusPerEth = (premiumPool * 1 ether) / r.totalDeposited;
        }
    }

    /**
     * @notice Returns tranche configs for a round.
     */
    function getRoundTranches(uint256 roundId) external view returns (
        uint8[] memory milestoneIds,
        uint16[] memory basisPoints,
        bool[] memory released
    ) {
        TrancheConfig[] storage tranches = roundTranches[roundId];
        milestoneIds = new uint8[](tranches.length);
        basisPoints = new uint16[](tranches.length);
        released = new bool[](tranches.length);

        for (uint256 i = 0; i < tranches.length; i++) {
            milestoneIds[i] = tranches[i].milestoneId;
            basisPoints[i] = tranches[i].basisPoints;
            released[i] = tranches[i].released;
        }
    }

    /**
     * @notice Returns an investor's position in a round.
     */
    function getInvestorPosition(
        uint256 roundId,
        address investor
    ) external view returns (uint256 amount, uint256 claimed) {
        InvestorPosition memory pos = investorPositions[roundId][investor];
        return (pos.amount, pos.claimed);
    }

    // =========================================================================
    // Chainlink Data Feeds — Real ETH/USD Price
    // =========================================================================

    /**
     * @notice Returns the current ETH/USD price from the Chainlink Data Feed.
     * @dev Uses the real Chainlink AggregatorV3Interface.
     *      Sepolia ETH/USD: 0x694AA1769357215DE4FAC081bf1f309aDC325306
     */
    function getEthPriceUsd() public view returns (int256 price, uint8 feedDecimals) {
        require(address(ethUsdPriceFeed) != address(0), "Price feed not set");
        (, price,,,) = ethUsdPriceFeed.latestRoundData();
        feedDecimals = ethUsdPriceFeed.decimals();
    }

    /**
     * @notice Returns a funding round's deposited value in USD.
     * @param roundId The funding round to price
     * @return valueUsd The USD value (scaled to feed decimals, typically 8)
     */
    function getRoundValueUsd(uint256 roundId) external view returns (uint256 valueUsd) {
        FundingRound memory round = fundingRounds[roundId];
        require(round.targetAmount > 0, "Round does not exist");
        require(address(ethUsdPriceFeed) != address(0), "Price feed not set");

        (int256 price,) = getEthPriceUsd();
        require(price > 0, "Invalid price");

        // totalDeposited is in wei, price is in USD with `decimals` precision
        // Result: USD value with `decimals` precision
        valueUsd = (round.totalDeposited * uint256(price)) / 1e18;
    }

    // =========================================================================
    // Chainlink Automation
    // Compatible with Chainlink Automation — register as Custom Logic upkeep
    // at automation.chain.link with this contract address
    // =========================================================================

    function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory performData) {
        uint256[] memory expiredRounds = new uint256[](nextRoundId);
        uint256 count = 0;

        for (uint256 i = 1; i < nextRoundId; i++) {
            FundingRound storage round = fundingRounds[i];
            if (round.status == RoundStatus.OPEN && block.timestamp > round.deadline) {
                expiredRounds[count] = i;
                count++;
            }
        }

        if (count > 0) {
            uint256[] memory result = new uint256[](count);
            for (uint256 j = 0; j < count; j++) {
                result[j] = expiredRounds[j];
            }
            return (true, abi.encode(result));
        }

        return (false, "");
    }

    function performUpkeep(bytes calldata performData) external override {
        uint256[] memory roundIds = abi.decode(performData, (uint256[]));

        for (uint256 i = 0; i < roundIds.length; i++) {
            uint256 roundId = roundIds[i];
            FundingRound storage round = fundingRounds[roundId];

            // Re-validate conditions (standard Automation pattern)
            if (round.status == RoundStatus.OPEN && block.timestamp > round.deadline) {
                round.status = RoundStatus.CANCELLED;
                round.totalReleased = round.totalDeposited;
                emit AutomationCancelledExpiredRound(roundId);
                emit RoundCancelled(roundId);
            }
        }
    }

    // =========================================================================
    // Admin
    // =========================================================================

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // =========================================================================
    // Interface Support (ERC1155 + AccessControl diamond)
    // =========================================================================

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // Allow contract to receive ETH for CCIP fees
    receive() external payable {}
}
