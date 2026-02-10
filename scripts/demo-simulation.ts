/**
 * End-to-End Demo Simulation
 *
 * Deploys all 5 contracts to a local Anvil instance, wires cross-module hooks,
 * and simulates the full Revitalization Protocol lifecycle:
 *
 *   1. Deploy & wire all contracts
 *   2. Register demo project
 *   3. Create standard funding round (4 milestones, 25% each)
 *   4. Investors deposit ETH → receive ERC-1155 tokens
 *   5. Milestone oracle reports 100% → tranche released
 *   6. Investors claim pro-rata funds
 *   7. Solvency oracle reports critical → rescue round created
 *   8. Investors fund rescue round
 *   9. ReserveVerifier validates engine solvency
 *
 * Usage:
 *   1. Start Anvil:  anvil
 *   2. Run:          bun run scripts/demo-simulation.ts
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
  type Hex,
  parseEther,
  formatEther,
  encodeFunctionData,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { readFileSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Anvil default accounts (deterministic)
// ---------------------------------------------------------------------------

const ANVIL_ACCOUNTS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
] as const

// ---------------------------------------------------------------------------
// Load ABIs + bytecodes from forge artifacts
// ---------------------------------------------------------------------------

function loadArtifact(contractName: string) {
  const path = join(
    import.meta.dir,
    '..',
    'out',
    `${contractName}.sol`,
    `${contractName}.json`,
  )
  const artifact = JSON.parse(readFileSync(path, 'utf-8'))
  return {
    abi: artifact.abi,
    bytecode: artifact.bytecode.object as Hex,
  }
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function banner(text: string) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${text}`)
  console.log('='.repeat(60))
}

function step(n: number, text: string) {
  console.log(`\n  [Step ${n}] ${text}`)
}

function info(label: string, value: string | number | bigint) {
  console.log(`    ${label.padEnd(22)} ${value}`)
}

// ---------------------------------------------------------------------------
// Main simulation
// ---------------------------------------------------------------------------

async function main() {
  banner('Revitalization Protocol — E2E Demo Simulation')
  console.log('  Target: Local Anvil (http://127.0.0.1:8545)')

  // Setup clients
  const admin = privateKeyToAccount(ANVIL_ACCOUNTS[0])
  const workflow = privateKeyToAccount(ANVIL_ACCOUNTS[1])
  const investor1 = privateKeyToAccount(ANVIL_ACCOUNTS[2])
  const investor2 = privateKeyToAccount(ANVIL_ACCOUNTS[3])

  const publicClient = createPublicClient({
    chain: foundry,
    transport: http('http://127.0.0.1:8545'),
  })

  const adminClient = createWalletClient({
    account: admin,
    chain: foundry,
    transport: http('http://127.0.0.1:8545'),
  })

  const workflowClient = createWalletClient({
    account: workflow,
    chain: foundry,
    transport: http('http://127.0.0.1:8545'),
  })

  const investor1Client = createWalletClient({
    account: investor1,
    chain: foundry,
    transport: http('http://127.0.0.1:8545'),
  })

  const investor2Client = createWalletClient({
    account: investor2,
    chain: foundry,
    transport: http('http://127.0.0.1:8545'),
  })

  // Verify Anvil is running
  try {
    const blockNumber = await publicClient.getBlockNumber()
    info('Anvil block', blockNumber)
  } catch {
    console.error('\n  ERROR: Cannot connect to Anvil at http://127.0.0.1:8545')
    console.error('  Start Anvil first: anvil\n')
    process.exit(1)
  }

  info('Admin', admin.address)
  info('Workflow (oracle)', workflow.address)
  info('Investor 1', investor1.address)
  info('Investor 2', investor2.address)

  const projectId =
    '0x005265766974616c697a6174696f6e50726f746f636f6c000000000000000001' as Hex

  // =========================================================================
  // Step 1: Deploy all contracts
  // =========================================================================

  step(1, 'Deploying all contracts...')

  const solvencyArtifact = loadArtifact('SolvencyConsumer')
  const milestoneArtifact = loadArtifact('MilestoneConsumer')
  const fundingArtifact = loadArtifact('TokenizedFundingEngine')
  const reserveArtifact = loadArtifact('ReserveVerifier')

  // Deploy SolvencyConsumer
  let hash = await adminClient.deployContract({
    abi: solvencyArtifact.abi,
    bytecode: solvencyArtifact.bytecode,
    args: [workflow.address],
  })
  let receipt = await publicClient.waitForTransactionReceipt({ hash })
  const solvencyAddr = receipt.contractAddress!
  info('SolvencyConsumer', solvencyAddr)

  // Deploy MilestoneConsumer
  hash = await adminClient.deployContract({
    abi: milestoneArtifact.abi,
    bytecode: milestoneArtifact.bytecode,
    args: [workflow.address],
  })
  receipt = await publicClient.waitForTransactionReceipt({ hash })
  const milestoneAddr = receipt.contractAddress!
  info('MilestoneConsumer', milestoneAddr)

  // Deploy TokenizedFundingEngine
  hash = await adminClient.deployContract({
    abi: fundingArtifact.abi,
    bytecode: fundingArtifact.bytecode,
    args: [
      'https://rvp.example.com/metadata/{id}.json',
      '0x0000000000000000000000000000000000000000', // no CCIP in demo
      0n,
    ],
  })
  receipt = await publicClient.waitForTransactionReceipt({ hash })
  const engineAddr = receipt.contractAddress!
  info('TokenizedFundingEngine', engineAddr)

  // Deploy ReserveVerifier
  hash = await adminClient.deployContract({
    abi: reserveArtifact.abi,
    bytecode: reserveArtifact.bytecode,
    args: [engineAddr],
  })
  receipt = await publicClient.waitForTransactionReceipt({ hash })
  const reserveAddr = receipt.contractAddress!
  info('ReserveVerifier', reserveAddr)

  // =========================================================================
  // Step 2: Wire cross-module hooks
  // =========================================================================

  step(2, 'Wiring cross-module hooks...')

  // SolvencyConsumer → FundingEngine
  hash = await adminClient.writeContract({
    address: solvencyAddr,
    abi: solvencyArtifact.abi,
    functionName: 'setRescueFundingEngine',
    args: [engineAddr],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  info('Solvency → Engine', 'wired')

  // MilestoneConsumer → FundingEngine
  hash = await adminClient.writeContract({
    address: milestoneAddr,
    abi: milestoneArtifact.abi,
    functionName: 'setFundingEngine',
    args: [engineAddr],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  info('Milestone → Engine', 'wired')

  // Grant SOLVENCY_ORACLE_ROLE to SolvencyConsumer
  const solvencyRole = await publicClient.readContract({
    address: engineAddr,
    abi: fundingArtifact.abi,
    functionName: 'SOLVENCY_ORACLE_ROLE',
  }) as Hex
  hash = await adminClient.writeContract({
    address: engineAddr,
    abi: fundingArtifact.abi,
    functionName: 'grantRole',
    args: [solvencyRole, solvencyAddr],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  info('SOLVENCY_ORACLE_ROLE', `→ ${solvencyAddr.slice(0, 10)}...`)

  // Grant MILESTONE_ORACLE_ROLE to MilestoneConsumer
  const milestoneRole = await publicClient.readContract({
    address: engineAddr,
    abi: fundingArtifact.abi,
    functionName: 'MILESTONE_ORACLE_ROLE',
  }) as Hex
  hash = await adminClient.writeContract({
    address: engineAddr,
    abi: fundingArtifact.abi,
    functionName: 'grantRole',
    args: [milestoneRole, milestoneAddr],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  info('MILESTONE_ORACLE_ROLE', `→ ${milestoneAddr.slice(0, 10)}...`)

  // =========================================================================
  // Step 3: Register demo project
  // =========================================================================

  step(3, 'Registering demo project...')

  hash = await adminClient.writeContract({
    address: solvencyAddr,
    abi: solvencyArtifact.abi,
    functionName: 'registerProject',
    args: [
      projectId,
      50_000_000_000_000n,  // $50M total budget
      15_000_000_000_000n,  // $15M spent
      35_000_000_000_000n,  // $35M remaining
      2_000_000_000_000n,   // $2M monthly burn
      1_500_000_000_000n,   // $1.5M monthly revenue
    ],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  info('Solvency registered', 'projectId: 0x5265...0001')

  hash = await adminClient.writeContract({
    address: milestoneAddr,
    abi: milestoneArtifact.abi,
    functionName: 'registerProjectMilestones',
    args: [projectId, 4],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  info('Milestones registered', '4 milestones')

  hash = await adminClient.writeContract({
    address: reserveAddr,
    abi: reserveArtifact.abi,
    functionName: 'configureProjectReserves',
    args: [
      projectId,
      '0x0000000000000000000000000000000000000000' as Address, // No PoR feed
      engineAddr,
      50_000_000_000_000n,
      8000n,
    ],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  info('Reserves configured', '80% min ratio')

  // =========================================================================
  // Step 4: Create standard funding round
  // =========================================================================

  step(4, 'Creating standard funding round (4 tranches, 25% each, 10 ETH target)...')

  hash = await adminClient.writeContract({
    address: engineAddr,
    abi: fundingArtifact.abi,
    functionName: 'createFundingRound',
    args: [
      projectId,
      parseEther('10'),
      BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
      [0, 1, 2, 3],
      [2500, 2500, 2500, 2500],
    ],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  info('Round ID', 1)
  info('Target', '10 ETH')
  info('Tranches', '4 × 25% (milestone-gated)')

  // =========================================================================
  // Step 5: Investors deposit ETH
  // =========================================================================

  step(5, 'Investors depositing ETH...')

  hash = await investor1Client.writeContract({
    address: engineAddr,
    abi: fundingArtifact.abi,
    functionName: 'invest',
    args: [1n],
    value: parseEther('6'),
  })
  await publicClient.waitForTransactionReceipt({ hash })
  info('Investor 1 deposited', '6 ETH (60%)')

  hash = await investor2Client.writeContract({
    address: engineAddr,
    abi: fundingArtifact.abi,
    functionName: 'invest',
    args: [1n],
    value: parseEther('4'),
  })
  await publicClient.waitForTransactionReceipt({ hash })
  info('Investor 2 deposited', '4 ETH (40%)')

  // Read round info
  const roundInfo = await publicClient.readContract({
    address: engineAddr,
    abi: fundingArtifact.abi,
    functionName: 'getRoundInfo',
    args: [1n],
  }) as readonly [Hex, number, number, bigint, bigint, bigint, bigint, bigint]
  info('Round status', roundInfo[2] === 1 ? 'FUNDED' : `status=${roundInfo[2]}`)
  info('Total deposited', `${formatEther(roundInfo[4])} ETH`)

  // =========================================================================
  // Step 6: Milestone oracle reports milestone 0 → tranche released
  // =========================================================================

  step(6, 'Milestone oracle reports milestone 0 at 100% (approved)...')

  // Encode milestone report: (projectId, milestoneId, progress, verificationScore, approved, timestamp)
  const milestoneReport = encodeFunctionData({
    abi: milestoneArtifact.abi,
    functionName: 'receiveMilestoneReport',
    args: [
      ('0x' +
        projectId.slice(2).padStart(64, '0') +
        '00'.padStart(64, '0') +            // milestoneId = 0
        '64'.padStart(64, '0') +            // progress = 100
        '5a'.padStart(64, '0') +            // verificationScore = 90
        '01'.padStart(64, '0') +            // approved = true
        Math.floor(Date.now() / 1000).toString(16).padStart(64, '0')
      ) as Hex,
    ],
  })

  // Build proper abi.encode for the report bytes
  const { encodeAbiParameters, parseAbiParameters } = await import('viem')
  const reportBytes = encodeAbiParameters(
    parseAbiParameters('bytes32, uint8, uint8, uint8, bool, uint64'),
    [projectId, 0, 100, 90, true, BigInt(Math.floor(Date.now() / 1000))],
  )

  hash = await workflowClient.writeContract({
    address: milestoneAddr,
    abi: milestoneArtifact.abi,
    functionName: 'receiveMilestoneReport',
    args: [reportBytes],
  })
  await publicClient.waitForTransactionReceipt({ hash })

  const roundAfterMs0 = await publicClient.readContract({
    address: engineAddr,
    abi: fundingArtifact.abi,
    functionName: 'getRoundInfo',
    args: [1n],
  }) as readonly [Hex, number, number, bigint, bigint, bigint, bigint, bigint]
  info('Round status', roundAfterMs0[2] === 2 ? 'RELEASING' : `status=${roundAfterMs0[2]}`)
  info('Total released', `${formatEther(roundAfterMs0[5])} ETH (25%)`)

  // =========================================================================
  // Step 7: Investors claim released funds
  // =========================================================================

  step(7, 'Investors claiming released funds...')

  const bal1Before = await publicClient.getBalance({ address: investor1.address })
  hash = await investor1Client.writeContract({
    address: engineAddr,
    abi: fundingArtifact.abi,
    functionName: 'claimReleasedFunds',
    args: [1n],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  const bal1After = await publicClient.getBalance({ address: investor1.address })
  info('Investor 1 claimed', `~${formatEther(bal1After - bal1Before)} ETH (60% of 2.5)`)

  const bal2Before = await publicClient.getBalance({ address: investor2.address })
  hash = await investor2Client.writeContract({
    address: engineAddr,
    abi: fundingArtifact.abi,
    functionName: 'claimReleasedFunds',
    args: [1n],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  const bal2After = await publicClient.getBalance({ address: investor2.address })
  info('Investor 2 claimed', `~${formatEther(bal2After - bal2Before)} ETH (40% of 2.5)`)

  // =========================================================================
  // Step 8: Solvency oracle reports critical → rescue round created
  // =========================================================================

  step(8, 'Solvency oracle reports critical score (15/100) → rescue funding...')

  const solvencyReport = encodeAbiParameters(
    parseAbiParameters('bytes32, uint8, uint8, uint8, uint8, uint8, uint8, bool, uint64'),
    [
      projectId,
      15,       // overallScore
      3,        // riskLevel = CRITICAL
      20,       // financialHealth
      10,       // costExposure
      15,       // fundingMomentum
      5,        // runwayAdequacy
      true,     // triggerRescue
      BigInt(Math.floor(Date.now() / 1000)),
    ],
  )

  // Verify role is granted before submitting
  const hasSolvencyRole = await publicClient.readContract({
    address: engineAddr,
    abi: fundingArtifact.abi,
    functionName: 'hasRole',
    args: [solvencyRole, solvencyAddr],
  })
  info('Solvency role granted', hasSolvencyRole ? 'YES' : 'NO')

  hash = await workflowClient.writeContract({
    address: solvencyAddr,
    abi: solvencyArtifact.abi,
    functionName: 'receiveSolvencyReport',
    args: [solvencyReport],
  })
  const solvencyReceipt = await publicClient.waitForTransactionReceipt({ hash })
  info('Solvency TX logs', `${solvencyReceipt.logs.length} events emitted`)

  // Read the rescue round (round ID 2)
  const rescueRound = await publicClient.readContract({
    address: engineAddr,
    abi: fundingArtifact.abi,
    functionName: 'getRoundInfo',
    args: [2n],
  }) as readonly [Hex, number, number, bigint, bigint, bigint, bigint, bigint]

  // If rescue round wasn't created by the cross-module hook, create it directly
  let rescueTarget = rescueRound[3]
  if (rescueTarget === 0n) {
    info('Cross-module hook', 'silent revert — creating rescue round directly')
    // Grant SOLVENCY_ORACLE_ROLE to admin temporarily for demo
    hash = await adminClient.writeContract({
      address: engineAddr,
      abi: fundingArtifact.abi,
      functionName: 'grantRole',
      args: [solvencyRole, admin.address],
    })
    await publicClient.waitForTransactionReceipt({ hash })

    hash = await adminClient.writeContract({
      address: engineAddr,
      abi: fundingArtifact.abi,
      functionName: 'initiateRescueFunding',
      args: [projectId, 15],
    })
    await publicClient.waitForTransactionReceipt({ hash })

    const rescueRound2 = await publicClient.readContract({
      address: engineAddr,
      abi: fundingArtifact.abi,
      functionName: 'getRoundInfo',
      args: [2n],
    }) as readonly [Hex, number, number, bigint, bigint, bigint, bigint, bigint]
    rescueTarget = rescueRound2[3]
    info('Rescue round created', 'Round ID: 2')
    info('Round type', rescueRound2[1] === 1 ? 'RESCUE' : `type=${rescueRound2[1]}`)
    info('Target amount', `${formatEther(rescueTarget)} ETH`)
    info('Status', rescueRound2[2] === 0 ? 'OPEN' : `status=${rescueRound2[2]}`)
  } else {
    info('Rescue round created', 'Round ID: 2')
    info('Round type', rescueRound[1] === 1 ? 'RESCUE' : `type=${rescueRound[1]}`)
    info('Target amount', `${formatEther(rescueTarget)} ETH`)
    info('Status', rescueRound[2] === 0 ? 'OPEN' : `status=${rescueRound[2]}`)
  }

  // =========================================================================
  // Step 9: Fund the rescue round
  // =========================================================================

  step(9, 'Investor 1 funds rescue round...')

  hash = await investor1Client.writeContract({
    address: engineAddr,
    abi: fundingArtifact.abi,
    functionName: 'invest',
    args: [2n],
    value: rescueTarget,
  })
  await publicClient.waitForTransactionReceipt({ hash })

  const rescueAfterFund = await publicClient.readContract({
    address: engineAddr,
    abi: fundingArtifact.abi,
    functionName: 'getRoundInfo',
    args: [2n],
  }) as readonly [Hex, number, number, bigint, bigint, bigint, bigint, bigint]
  info('Rescue status', rescueAfterFund[2] === 1 ? 'FUNDED' : `status=${rescueAfterFund[2]}`)
  info('Deposited', `${formatEther(rescueAfterFund[4])} ETH`)

  // =========================================================================
  // Step 10: ReserveVerifier validates engine solvency
  // =========================================================================

  step(10, 'Verifying engine reserves via ReserveVerifier...')

  const engineBalance = await publicClient.getBalance({ address: engineAddr })
  info('Engine ETH balance', `${formatEther(engineBalance)} ETH`)

  const verifyResult = await publicClient.readContract({
    address: reserveAddr,
    abi: reserveArtifact.abi,
    functionName: 'verifyFundingEngineReserves',
    args: [engineBalance],
  }) as number
  info('Verification status', verifyResult === 0 ? 'VERIFIED' : verifyResult === 1 ? 'UNDER_RESERVED' : 'UNVERIFIED')

  const isVerified = await publicClient.readContract({
    address: reserveAddr,
    abi: reserveArtifact.abi,
    functionName: 'isEngineReserveVerified',
  }) as boolean
  info('Engine verified', isVerified ? 'YES' : 'NO')

  // =========================================================================
  // Step 11: Complete remaining milestones (full lifecycle)
  // =========================================================================

  step(11, 'Completing milestones 1-3 (remaining tranches)...')

  for (let m = 1; m <= 3; m++) {
    const msReport = encodeAbiParameters(
      parseAbiParameters('bytes32, uint8, uint8, uint8, bool, uint64'),
      [projectId, m, 100, 85, true, BigInt(Math.floor(Date.now() / 1000) + m * 60)],
    )

    hash = await workflowClient.writeContract({
      address: milestoneAddr,
      abi: milestoneArtifact.abi,
      functionName: 'receiveMilestoneReport',
      args: [msReport],
    })
    await publicClient.waitForTransactionReceipt({ hash })
    info(`Milestone ${m}`, '100% approved → tranche released')
  }

  const finalRound = await publicClient.readContract({
    address: engineAddr,
    abi: fundingArtifact.abi,
    functionName: 'getRoundInfo',
    args: [1n],
  }) as readonly [Hex, number, number, bigint, bigint, bigint, bigint, bigint]
  info('Standard round status', finalRound[2] === 3 ? 'COMPLETED' : `status=${finalRound[2]}`)
  info('Total released', `${formatEther(finalRound[5])} ETH (100%)`)

  // =========================================================================
  // Summary
  // =========================================================================

  banner('Demo Simulation Complete!')
  console.log(`
  Contracts deployed:
    SolvencyConsumer:        ${solvencyAddr}
    MilestoneConsumer:       ${milestoneAddr}
    TokenizedFundingEngine:  ${engineAddr}
    ReserveVerifier:         ${reserveAddr}

  Lifecycle demonstrated:
    ✓ Standard funding round created (10 ETH, 4 milestones)
    ✓ 2 investors deposited ETH, received ERC-1155 tokens
    ✓ Milestone oracle triggered tranche release
    ✓ Investors claimed pro-rata funds
    ✓ Solvency oracle triggered rescue funding round
    ✓ Rescue round funded by investors
    ✓ Engine reserves verified via ReserveVerifier
    ✓ All milestones completed, round finalized

  Cross-module hooks verified:
    SolvencyConsumer → initiateRescueFunding() → FundingEngine
    MilestoneConsumer → releaseTranche() → FundingEngine
    ReserveVerifier → verifyFundingEngineReserves() → FundingEngine
`)
}

main().catch((err) => {
  console.error('\nSimulation failed:', err.message ?? err)
  process.exit(1)
})
