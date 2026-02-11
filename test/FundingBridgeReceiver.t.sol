// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {CCIPLocalSimulator, IRouterClient} from "@chainlink/local/src/ccip/CCIPLocalSimulator.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {FundingBridgeReceiver} from "../src/contracts/FundingBridgeReceiver.sol";

contract FundingBridgeReceiverTest is Test {
    CCIPLocalSimulator public simulator;
    FundingBridgeReceiver public receiver;

    uint64 public chainSelector;
    address public router;
    address public authorizedSender = address(0xABCD);
    address public unauthorized = address(0x9999);

    bytes32 public projectId =
        bytes32(uint256(0x5265766974616c697a6174696f6e50726f746f636f6c000000000000000001));

    function setUp() public {
        // Deploy CCIPLocalSimulator — provides mock router
        simulator = new CCIPLocalSimulator();

        (
            uint64 chainSelector_,
            IRouterClient sourceRouter_,
            ,,,, // destRouter, wrappedNative, linkToken, ccipBnM, ccipLnM
        ) = simulator.configuration();

        chainSelector = chainSelector_;
        router = address(sourceRouter_);

        // Deploy receiver with real CCIPReceiver inheritance
        receiver = new FundingBridgeReceiver(
            router,
            chainSelector,
            authorizedSender
        );
    }

    // =========================================================================
    // Deployment
    // =========================================================================

    function testDeployment() public view {
        assertEq(receiver.getRouter(), router);
        assertEq(receiver.sourceChainSelector(), chainSelector);
        assertEq(receiver.authorizedSender(), authorizedSender);
        assertEq(receiver.messageCount(), 0);
    }

    function testDeploymentRevertsWithZeroRouter() public {
        vm.expectRevert();
        new FundingBridgeReceiver(address(0), chainSelector, authorizedSender);
    }

    // =========================================================================
    // Receive via Router (simulated CCIP message delivery)
    // =========================================================================

    function testReceiveValidMessage() public {
        bytes memory fundingData = abi.encode(
            projectId,
            uint256(1),     // roundId
            uint8(0),       // STANDARD
            uint256(5 ether)
        );

        Client.Any2EVMMessage memory message = Client.Any2EVMMessage({
            messageId: keccak256("test-message-1"),
            sourceChainSelector: chainSelector,
            sender: abi.encode(authorizedSender),
            data: fundingData,
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });

        // Call ccipReceive as the router (onlyRouter modifier)
        vm.prank(router);
        receiver.ccipReceive(message);

        // Verify stored record
        (
            bytes32 pid,
            uint256 roundId,
            uint8 roundType,
            uint256 amount,
            uint64 receivedAt
        ) = receiver.getReceivedFunding(keccak256("test-message-1"));

        assertEq(pid, projectId);
        assertEq(roundId, 1);
        assertEq(roundType, 0);
        assertEq(amount, 5 ether);
        assertEq(receivedAt, uint64(block.timestamp));
        assertEq(receiver.messageCount(), 1);
    }

    function testReceiveRescueFundingMessage() public {
        bytes memory fundingData = abi.encode(
            projectId,
            uint256(2),     // roundId
            uint8(1),       // RESCUE
            uint256(8.5 ether)
        );

        Client.Any2EVMMessage memory message = Client.Any2EVMMessage({
            messageId: keccak256("rescue-message"),
            sourceChainSelector: chainSelector,
            sender: abi.encode(authorizedSender),
            data: fundingData,
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });

        vm.prank(router);
        receiver.ccipReceive(message);

        (, uint256 roundId, uint8 roundType, uint256 amount,) =
            receiver.getReceivedFunding(keccak256("rescue-message"));

        assertEq(roundId, 2);
        assertEq(roundType, 1); // RESCUE
        assertEq(amount, 8.5 ether);
    }

    // =========================================================================
    // Access Control
    // =========================================================================

    function testRevertOnNonRouterCaller() public {
        Client.Any2EVMMessage memory message = _buildMessage(
            keccak256("msg"), authorizedSender
        );

        // Non-router caller should revert
        vm.prank(unauthorized);
        vm.expectRevert();
        receiver.ccipReceive(message);
    }

    function testRevertOnWrongSourceChain() public {
        bytes memory fundingData = abi.encode(projectId, uint256(1), uint8(0), uint256(1 ether));

        Client.Any2EVMMessage memory message = Client.Any2EVMMessage({
            messageId: keccak256("wrong-chain"),
            sourceChainSelector: 999999, // wrong chain
            sender: abi.encode(authorizedSender),
            data: fundingData,
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });

        vm.prank(router);
        vm.expectRevert(
            abi.encodeWithSelector(
                FundingBridgeReceiver.InvalidSourceChain.selector,
                uint64(999999),
                chainSelector
            )
        );
        receiver.ccipReceive(message);
    }

    function testRevertOnUnauthorizedSender() public {
        Client.Any2EVMMessage memory message = _buildMessage(
            keccak256("unauth"), unauthorized
        );

        vm.prank(router);
        vm.expectRevert(
            abi.encodeWithSelector(
                FundingBridgeReceiver.UnauthorizedSender.selector,
                unauthorized,
                authorizedSender
            )
        );
        receiver.ccipReceive(message);
    }

    // =========================================================================
    // Admin Functions
    // =========================================================================

    function testSetAuthorizedSender() public {
        address newSender = address(0xBEEF);
        receiver.setAuthorizedSender(newSender);
        assertEq(receiver.authorizedSender(), newSender);
    }

    function testSetSourceChainSelector() public {
        uint64 newSelector = 12345;
        receiver.setSourceChainSelector(newSelector);
        assertEq(receiver.sourceChainSelector(), newSelector);
    }

    // =========================================================================
    // Helper
    // =========================================================================

    function _buildMessage(
        bytes32 messageId,
        address sender
    ) internal view returns (Client.Any2EVMMessage memory) {
        bytes memory fundingData = abi.encode(
            projectId, uint256(1), uint8(0), uint256(1 ether)
        );

        return Client.Any2EVMMessage({
            messageId: messageId,
            sourceChainSelector: chainSelector,
            sender: abi.encode(sender),
            data: fundingData,
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
    }
}
