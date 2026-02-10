// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FundingBridgeReceiver
 * @author Revitalization Protocol
 * @notice Minimal CCIP receiver stub for Polygon Amoy.
 *         Receives cross-chain funding messages from TokenizedFundingEngine on Sepolia.
 *
 * @dev Demonstrates cross-chain architecture intent without full CCIP implementation.
 *      In production, this would inherit from Chainlink's CCIPReceiver and handle
 *      token transfers, fund disbursement, and local state mirroring.
 *
 * Hackathon Categories: DeFi & Tokenization, CCIP Cross-Chain
 */
contract FundingBridgeReceiver is Ownable {
    // =========================================================================
    // CCIP Inline Interface (minimal receiver)
    // =========================================================================

    struct Any2EVMMessage {
        bytes32 messageId;
        uint64 sourceChainSelector;
        bytes sender;
        bytes data;
    }

    // =========================================================================
    // State
    // =========================================================================

    /// @notice Authorized CCIP router address
    address public ccipRouter;

    /// @notice Authorized source chain selector (Sepolia)
    uint64 public sourceChainSelector;

    /// @notice Authorized sender on source chain (TokenizedFundingEngine)
    address public authorizedSender;

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

    event RouterUpdated(address indexed newRouter);

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor(
        address _ccipRouter,
        uint64 _sourceChainSelector,
        address _authorizedSender
    ) Ownable(msg.sender) {
        ccipRouter = _ccipRouter;
        sourceChainSelector = _sourceChainSelector;
        authorizedSender = _authorizedSender;
    }

    // =========================================================================
    // CCIP Receive Handler
    // =========================================================================

    /**
     * @notice Called by the CCIP router when a cross-chain message arrives.
     * @dev In production, this would be _ccipReceive() from CCIPReceiver.
     *      For hackathon, we use a public function gated by router check.
     */
    function ccipReceive(Any2EVMMessage calldata message) external {
        require(msg.sender == ccipRouter, "Only CCIP router");
        require(message.sourceChainSelector == sourceChainSelector, "Invalid source chain");

        address sender = abi.decode(message.sender, (address));
        require(sender == authorizedSender, "Unauthorized sender");

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

        emit CrossChainFundingReceived(message.messageId, projectId, roundId, amount);
    }

    // =========================================================================
    // Admin
    // =========================================================================

    function setRouter(address _router) external onlyOwner {
        ccipRouter = _router;
        emit RouterUpdated(_router);
    }

    function setAuthorizedSender(address _sender) external onlyOwner {
        authorizedSender = _sender;
    }

    function setSourceChainSelector(uint64 _selector) external onlyOwner {
        sourceChainSelector = _selector;
    }

    // Allow contract to receive ETH
    receive() external payable {}
}
