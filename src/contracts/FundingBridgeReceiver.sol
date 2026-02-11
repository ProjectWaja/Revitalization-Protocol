// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";

/**
 * @title FundingBridgeReceiver
 * @author Revitalization Protocol
 * @notice CCIP receiver on Polygon Amoy that accepts cross-chain funding messages
 *         from TokenizedFundingEngine on Sepolia.
 *
 * @dev Inherits from Chainlink's real CCIPReceiver base contract:
 *   - Router validation is handled by the `onlyRouter` modifier in CCIPReceiver
 *   - Message routing is handled by `ccipReceive()` → `_ccipReceive()` pattern
 *   - This contract adds source chain + sender validation on top
 *
 * Hackathon Categories: DeFi & Tokenization, CCIP Cross-Chain
 */
contract FundingBridgeReceiver is CCIPReceiver, Ownable {
    // =========================================================================
    // State
    // =========================================================================

    /// @notice Authorized source chain selector (Sepolia: 16015286601757825753)
    uint64 public sourceChainSelector;

    /// @notice Authorized sender on source chain (TokenizedFundingEngine address)
    address public authorizedSender;

    /// @notice Total messages received
    uint256 public messageCount;

    /// @notice Received funding records
    mapping(bytes32 => ReceivedFunding) public receivedFundings;

    struct ReceivedFunding {
        bytes32 projectId;
        uint256 roundId;
        uint8 roundType;
        uint256 amount;
        uint64 receivedAt;
    }

    // =========================================================================
    // Events
    // =========================================================================

    event CrossChainFundingReceived(
        bytes32 indexed messageId,
        bytes32 indexed projectId,
        uint256 roundId,
        uint256 amount
    );

    event AuthorizedSenderUpdated(address indexed newSender);
    event SourceChainSelectorUpdated(uint64 newSelector);

    // =========================================================================
    // Errors
    // =========================================================================

    error InvalidSourceChain(uint64 received, uint64 expected);
    error UnauthorizedSender(address received, address expected);

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor(
        address _ccipRouter,
        uint64 _sourceChainSelector,
        address _authorizedSender
    ) CCIPReceiver(_ccipRouter) Ownable(msg.sender) {
        sourceChainSelector = _sourceChainSelector;
        authorizedSender = _authorizedSender;
    }

    // =========================================================================
    // CCIP Receive Handler (real CCIPReceiver override)
    // =========================================================================

    /**
     * @notice Internal handler called by CCIPReceiver.ccipReceive() after
     *         the onlyRouter modifier validates the caller is the CCIP router.
     * @dev Validates source chain and sender, then decodes and stores funding data.
     * @param message The cross-chain message from Sepolia
     */
    function _ccipReceive(
        Client.Any2EVMMessage memory message
    ) internal override {
        // Validate source chain
        if (message.sourceChainSelector != sourceChainSelector) {
            revert InvalidSourceChain(message.sourceChainSelector, sourceChainSelector);
        }

        // Validate sender
        address sender = abi.decode(message.sender, (address));
        if (sender != authorizedSender) {
            revert UnauthorizedSender(sender, authorizedSender);
        }

        // Decode the funding data
        (
            bytes32 projectId,
            uint256 roundId,
            uint8 roundType,
            uint256 amount
        ) = abi.decode(message.data, (bytes32, uint256, uint8, uint256));

        // Store the received funding record
        receivedFundings[message.messageId] = ReceivedFunding({
            projectId: projectId,
            roundId: roundId,
            roundType: roundType,
            amount: amount,
            receivedAt: uint64(block.timestamp)
        });

        messageCount++;

        emit CrossChainFundingReceived(message.messageId, projectId, roundId, amount);
    }

    // =========================================================================
    // Read Interface
    // =========================================================================

    function getReceivedFunding(bytes32 messageId) external view returns (
        bytes32 projectId,
        uint256 roundId,
        uint8 roundType,
        uint256 amount,
        uint64 receivedAt
    ) {
        ReceivedFunding memory f = receivedFundings[messageId];
        return (f.projectId, f.roundId, f.roundType, f.amount, f.receivedAt);
    }

    // =========================================================================
    // Admin
    // =========================================================================

    function setAuthorizedSender(address _sender) external onlyOwner {
        authorizedSender = _sender;
        emit AuthorizedSenderUpdated(_sender);
    }

    function setSourceChainSelector(uint64 _selector) external onlyOwner {
        sourceChainSelector = _selector;
        emit SourceChainSelectorUpdated(_selector);
    }

    // Allow contract to receive ETH
    receive() external payable {}
}
