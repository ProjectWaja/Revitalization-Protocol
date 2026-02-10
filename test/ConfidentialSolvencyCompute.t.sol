// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ConfidentialSolvencyCompute} from "../src/contracts/ConfidentialSolvencyCompute.sol";

contract ConfidentialSolvencyComputeTest is Test {
    ConfidentialSolvencyCompute public cc;

    address public admin = address(this);
    address public operator = address(0x5555);
    address public enclave = address(0x6666);
    address public unauthorized = address(0x7777);

    bytes32 public projectId =
        bytes32(uint256(0x5265766974616c697a6174696f6e50726f746f636f6c000000000000000001));

    function setUp() public {
        cc = new ConfidentialSolvencyCompute();

        // Grant roles
        cc.grantRole(cc.COMPUTE_OPERATOR_ROLE(), operator);
        cc.grantRole(cc.ENCLAVE_ROLE(), enclave);
    }

    // =========================================================================
    // Core Computation — Score Ranges
    // =========================================================================

    function testComputeLowRisk() public {
        // All high scores → LOW risk
        vm.prank(operator);
        cc.computeSolvencyScore(projectId, 90, 85, 80, 75, 1);

        (uint8 score, uint8 riskLevel, , , ) = cc.getLatestResult(projectId);
        // (90*35 + 85*20 + 80*25 + 75*20) / 100 = (3150+1700+2000+1500)/100 = 83
        assertEq(score, 83);
        assertEq(riskLevel, 0); // LOW
    }

    function testComputeCriticalRisk() public {
        // All very low scores → CRITICAL
        vm.prank(operator);
        cc.computeSolvencyScore(projectId, 10, 15, 20, 10, 1);

        (uint8 score, uint8 riskLevel, , , ) = cc.getLatestResult(projectId);
        // (10*35 + 15*20 + 20*25 + 10*20) / 100 = (350+300+500+200)/100 = 13
        assertEq(score, 13);
        assertEq(riskLevel, 3); // CRITICAL
    }

    function testComputeMediumRisk() public {
        // Moderate scores → MEDIUM
        vm.prank(operator);
        cc.computeSolvencyScore(projectId, 60, 55, 65, 50, 1);

        (uint8 score, uint8 riskLevel, , , ) = cc.getLatestResult(projectId);
        // (60*35 + 55*20 + 65*25 + 50*20) / 100 = (2100+1100+1625+1000)/100 = 58
        assertEq(score, 58);
        assertEq(riskLevel, 1); // MEDIUM
    }

    // =========================================================================
    // Attestation
    // =========================================================================

    function testAttestationRegistered() public {
        vm.prank(operator);
        cc.computeSolvencyScore(projectId, 80, 70, 60, 50, 42);

        (, , bytes32 attestationHash, , ) = cc.getLatestResult(projectId);
        assertTrue(cc.isAttestationValid(attestationHash));
    }

    function testDeterministicAttestation() public {
        // Same inputs + nonce → same attestation hash
        vm.prank(operator);
        cc.computeSolvencyScore(projectId, 80, 70, 60, 50, 42);
        (, , bytes32 hash1, , ) = cc.getLatestResult(projectId);

        // Compute expected hash manually
        uint8 expectedScore = uint8((uint256(80) * 35 + uint256(70) * 20 + uint256(60) * 25 + uint256(50) * 20) / 100);
        bytes32 expectedHash = keccak256(abi.encodePacked(
            projectId,
            uint8(80), uint8(70), uint8(60), uint8(50),
            expectedScore,
            uint256(42)
        ));

        assertEq(hash1, expectedHash);
    }

    function testDifferentNoncesDifferentHashes() public {
        vm.prank(operator);
        cc.computeSolvencyScore(projectId, 80, 70, 60, 50, 1);
        (, , bytes32 hash1, , ) = cc.getLatestResult(projectId);

        vm.prank(operator);
        cc.computeSolvencyScore(projectId, 80, 70, 60, 50, 2);
        (, , bytes32 hash2, , ) = cc.getLatestResult(projectId);

        assertTrue(hash1 != hash2);
        assertTrue(cc.isAttestationValid(hash1));
        assertTrue(cc.isAttestationValid(hash2));
    }

    // =========================================================================
    // Enclave Verification
    // =========================================================================

    function testEnclaveVerifiedWhenCalledByEnclave() public {
        // Grant enclave the operator role too so it can call computeSolvencyScore
        cc.grantRole(cc.COMPUTE_OPERATOR_ROLE(), enclave);

        vm.prank(enclave);
        cc.computeSolvencyScore(projectId, 80, 70, 60, 50, 1);

        (, , , bool enclaveVerified, ) = cc.getLatestResult(projectId);
        assertTrue(enclaveVerified);
    }

    function testNotEnclaveVerifiedWhenCalledByOperator() public {
        vm.prank(operator);
        cc.computeSolvencyScore(projectId, 80, 70, 60, 50, 1);

        (, , , bool enclaveVerified, ) = cc.getLatestResult(projectId);
        assertFalse(enclaveVerified);
    }

    // =========================================================================
    // submitEnclaveResult
    // =========================================================================

    function testSubmitEnclaveResult() public {
        bytes32 attestationHash = keccak256("test-attestation");
        bytes memory proof = hex"deadbeef";

        vm.prank(enclave);
        cc.submitEnclaveResult(projectId, 72, 1, attestationHash, proof);

        (uint8 score, uint8 riskLevel, bytes32 hash, bool verified, uint64 timestamp) =
            cc.getLatestResult(projectId);

        assertEq(score, 72);
        assertEq(riskLevel, 1); // MEDIUM
        assertEq(hash, attestationHash);
        assertTrue(verified);
        assertEq(timestamp, uint64(block.timestamp));
        assertTrue(cc.isAttestationValid(attestationHash));
    }

    function testSubmitEnclaveResultEmptyProofReverts() public {
        vm.prank(enclave);
        vm.expectRevert("Empty proof");
        cc.submitEnclaveResult(projectId, 72, 1, keccak256("test"), "");
    }

    function testSubmitEnclaveResultInvalidScoreReverts() public {
        vm.prank(enclave);
        vm.expectRevert("Invalid score");
        cc.submitEnclaveResult(projectId, 101, 1, keccak256("test"), hex"aa");
    }

    // =========================================================================
    // Access Control
    // =========================================================================

    function testUnauthorizedComputeReverts() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        cc.computeSolvencyScore(projectId, 80, 70, 60, 50, 1);
    }

    function testUnauthorizedEnclaveSubmitReverts() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        cc.submitEnclaveResult(projectId, 72, 1, keccak256("test"), hex"aa");
    }

    // =========================================================================
    // Input Validation
    // =========================================================================

    function testInvalidFinancialHealthReverts() public {
        vm.prank(operator);
        vm.expectRevert("Invalid financialHealth");
        cc.computeSolvencyScore(projectId, 101, 70, 60, 50, 1);
    }

    // =========================================================================
    // Computation Counter
    // =========================================================================

    function testComputationCounter() public {
        assertEq(cc.computationCount(), 0);

        vm.prank(operator);
        cc.computeSolvencyScore(projectId, 80, 70, 60, 50, 1);
        assertEq(cc.computationCount(), 1);

        vm.prank(operator);
        cc.computeSolvencyScore(projectId, 60, 50, 40, 30, 2);
        assertEq(cc.computationCount(), 2);

        vm.prank(enclave);
        cc.submitEnclaveResult(projectId, 72, 1, keccak256("test"), hex"aa");
        assertEq(cc.computationCount(), 3);
    }
}
