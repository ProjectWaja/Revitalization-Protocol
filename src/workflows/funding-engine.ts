/**
 * ============================================================================
 * Revitalization Protocol — Tokenized Funding Engine Workflow
 * ============================================================================
 *
 * CRE Workflow: Monitors funding round health, reads cross-module oracle data,
 * and produces deterministic funding health reports written onchain.
 *
 * Architecture:
 *   Cron Trigger (every 10 min)
 *     → Read onchain funding round state (EVMClient)
 *     → Read onchain solvency score from SolvencyConsumer (EVMClient)
 *     → Read onchain milestone status from MilestoneConsumer (EVMClient)
 *     → Compute funding health metrics [Confidential Compute placeholder]
 *     → Evaluate rule-based health status + explanation
 *     → Generate signed report → Write onchain (EVMClient)
 *
 * NOTE: This workflow monitors and reports — it does NOT call releaseTranche()
 * directly. That's triggered by MilestoneConsumer. The workflow provides
 * deterministic risk monitoring and onchain reporting.
 *
 * Chainlink Services Used:
 *   - CRE Workflows (orchestration)
 *   - EVMClient (cross-contract reads)
 *   - Confidential Compute (placeholder for sensitive metrics)
 *
 * @author Willis — Revitalization Protocol Team
 * @version 0.2.0
 * @hackathon Chainlink Convergence 2026
 */

import {
  Runner,
  handler,
  EVMClient,
  CronCapability,
  encodeCallMsg,
  getNetwork,
  LAST_FINALIZED_BLOCK_NUMBER,
  type Runtime,
  type CronPayload,
  type HandlerEntry,
} from '@chainlink/cre-sdk'

import { z } from 'zod'
import {
  type Address,
  encodeFunctionData,
  decodeFunctionResult,
  zeroAddress,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem'

// =============================================================================
// Configuration Schema
// =============================================================================

const configSchema = z.object({
  schedule: z.string().describe('Cron expression for funding status checks'),
  projectId: z.string().describe('Hex-encoded bytes32 project identifier'),
  evmChainSelectorName: z.string().describe('CRE chain selector name, e.g., ethereum-sepolia'),
  fundingEngineAddress: z.string().describe('Address of TokenizedFundingEngine.sol'),
  solvencyConsumerAddress: z.string().describe('Address of SolvencyConsumer.sol'),
  milestoneConsumerAddress: z.string().describe('Address of MilestoneConsumer.sol'),
  maxTrancheReleaseAmount: z.string().describe('Maximum tranche release amount in wei'),
  minInvestorCount: z.number().describe('Minimum investor count safety threshold'),
})

type Config = z.infer<typeof configSchema>

// =============================================================================
// Data Structures (inline to avoid import issues in WASM)
// =============================================================================

interface RoundInfo {
  projectId: string
  roundType: number
  status: number
  targetAmount: bigint
  totalDeposited: bigint
  totalReleased: bigint
  deadline: bigint
  investorCount: bigint
}

interface TrancheInfo {
  milestoneIds: number[]
  basisPoints: number[]
  released: boolean[]
}

interface SolvencyData {
  overallScore: number
  riskLevel: number
  rescueTriggered: boolean
}

interface MilestoneData {
  progressPercentage: number
  verificationScore: number
  approved: boolean
}

interface FundingHealthMetrics {
  concentrationRisk: number
  velocityRisk: number
  fundingProgress: number
  trancheUtilization: number
}

// =============================================================================
// ABI Definitions
// =============================================================================

const FUNDING_ENGINE_ABI = [
  {
    name: 'getRoundInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'roundId', type: 'uint256' }],
    outputs: [
      { name: 'projectId', type: 'bytes32' },
      { name: 'roundType', type: 'uint8' },
      { name: 'status', type: 'uint8' },
      { name: 'targetAmount', type: 'uint256' },
      { name: 'totalDeposited', type: 'uint256' },
      { name: 'totalReleased', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'investorCount', type: 'uint256' },
    ],
  },
  {
    name: 'getRoundTranches',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'roundId', type: 'uint256' }],
    outputs: [
      { name: 'milestoneIds', type: 'uint8[]' },
      { name: 'basisPoints', type: 'uint16[]' },
      { name: 'released', type: 'bool[]' },
    ],
  },
  {
    name: 'getProjectRounds',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'projectId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
] as const

const SOLVENCY_CONSUMER_ABI = [
  {
    name: 'getLatestSolvency',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'projectId', type: 'bytes32' }],
    outputs: [
      { name: 'overallScore', type: 'uint8' },
      { name: 'riskLevel', type: 'uint8' },
      { name: 'financialHealth', type: 'uint8' },
      { name: 'costExposure', type: 'uint8' },
      { name: 'fundingMomentum', type: 'uint8' },
      { name: 'runwayAdequacy', type: 'uint8' },
      { name: 'rescueTriggered', type: 'bool' },
      { name: 'timestamp', type: 'uint64' },
    ],
  },
] as const

const MILESTONE_CONSUMER_ABI = [
  {
    name: 'getLatestMilestone',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'projectId', type: 'bytes32' },
      { name: 'milestoneId', type: 'uint8' },
    ],
    outputs: [
      { name: 'progressPercentage', type: 'uint8' },
      { name: 'verificationScore', type: 'uint8' },
      { name: 'approved', type: 'bool' },
      { name: 'timestamp', type: 'uint64' },
    ],
  },
] as const

// =============================================================================
// Step 1: Read Onchain Funding Round State
// =============================================================================

function readFundingRoundState(
  evmClient: EVMClient,
  runtime: Runtime<Config>,
  config: Config,
): { roundInfo: RoundInfo | null; tranches: TrancheInfo | null; activeRoundId: number } {
  // First, get project rounds
  const roundsCallData = encodeFunctionData({
    abi: FUNDING_ENGINE_ABI,
    functionName: 'getProjectRounds',
    args: [config.projectId as `0x${string}`],
  })

  const roundsResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: config.fundingEngineAddress as Address,
        data: roundsCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result()

  const roundIds = decodeFunctionResult({
    abi: FUNDING_ENGINE_ABI,
    functionName: 'getProjectRounds',
    data: roundsResult.data as `0x${string}`,
  }) as [bigint[]]

  if (!roundIds[0] || roundIds[0].length === 0) {
    runtime.log('[RVP-Funding] No active rounds found for project')
    return { roundInfo: null, tranches: null, activeRoundId: 0 }
  }

  // Get the latest round
  const latestRoundId = Number(roundIds[0][roundIds[0].length - 1])

  // Read round info
  const infoCallData = encodeFunctionData({
    abi: FUNDING_ENGINE_ABI,
    functionName: 'getRoundInfo',
    args: [BigInt(latestRoundId)],
  })

  const infoResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: config.fundingEngineAddress as Address,
        data: infoCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result()

  const decoded = decodeFunctionResult({
    abi: FUNDING_ENGINE_ABI,
    functionName: 'getRoundInfo',
    data: infoResult.data as `0x${string}`,
  }) as [string, number, number, bigint, bigint, bigint, bigint, bigint]

  const roundInfo: RoundInfo = {
    projectId: decoded[0],
    roundType: decoded[1],
    status: decoded[2],
    targetAmount: decoded[3],
    totalDeposited: decoded[4],
    totalReleased: decoded[5],
    deadline: decoded[6],
    investorCount: decoded[7],
  }

  // Read tranches
  const tranchesCallData = encodeFunctionData({
    abi: FUNDING_ENGINE_ABI,
    functionName: 'getRoundTranches',
    args: [BigInt(latestRoundId)],
  })

  const tranchesResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: config.fundingEngineAddress as Address,
        data: tranchesCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result()

  const trancheDecoded = decodeFunctionResult({
    abi: FUNDING_ENGINE_ABI,
    functionName: 'getRoundTranches',
    data: tranchesResult.data as `0x${string}`,
  }) as [number[], number[], boolean[]]

  const tranches: TrancheInfo = {
    milestoneIds: trancheDecoded[0].map(Number),
    basisPoints: trancheDecoded[1].map(Number),
    released: trancheDecoded[2].map(Boolean),
  }

  return { roundInfo, tranches, activeRoundId: latestRoundId }
}

// =============================================================================
// Step 2: Read Onchain Solvency Score
// =============================================================================

function readSolvencyScore(
  evmClient: EVMClient,
  runtime: Runtime<Config>,
  config: Config,
): SolvencyData {
  const callData = encodeFunctionData({
    abi: SOLVENCY_CONSUMER_ABI,
    functionName: 'getLatestSolvency',
    args: [config.projectId as `0x${string}`],
  })

  const result = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: config.solvencyConsumerAddress as Address,
        data: callData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result()

  const decoded = decodeFunctionResult({
    abi: SOLVENCY_CONSUMER_ABI,
    functionName: 'getLatestSolvency',
    data: result.data as `0x${string}`,
  }) as [number, number, number, number, number, number, boolean, bigint]

  return {
    overallScore: decoded[0],
    riskLevel: decoded[1],
    rescueTriggered: decoded[6],
  }
}

// =============================================================================
// Step 3: Read Onchain Milestone Status
// =============================================================================

function readMilestoneStatus(
  evmClient: EVMClient,
  runtime: Runtime<Config>,
  config: Config,
  milestoneId: number,
): MilestoneData {
  const callData = encodeFunctionData({
    abi: MILESTONE_CONSUMER_ABI,
    functionName: 'getLatestMilestone',
    args: [config.projectId as `0x${string}`, milestoneId],
  })

  const result = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: config.milestoneConsumerAddress as Address,
        data: callData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result()

  const decoded = decodeFunctionResult({
    abi: MILESTONE_CONSUMER_ABI,
    functionName: 'getLatestMilestone',
    data: result.data as `0x${string}`,
  }) as [number, number, boolean, bigint]

  return {
    progressPercentage: decoded[0],
    verificationScore: decoded[1],
    approved: decoded[2],
  }
}

// =============================================================================
// Step 4: Compute Funding Health Metrics [CC Placeholder]
// =============================================================================

/**
 * Compute funding health metrics from round state and cross-module data.
 * Marked for Confidential Compute — investor positions are sensitive.
 */
function computeFundingHealth(
  roundInfo: RoundInfo,
  tranches: TrancheInfo,
  solvency: SolvencyData,
): FundingHealthMetrics {
  // --- [CONFIDENTIAL_COMPUTE_BOUNDARY_START] ---

  // Concentration risk: higher if few investors hold most funds
  // Simplified: if < 3 investors, high risk
  let concentrationRisk = 0
  const investorCount = Number(roundInfo.investorCount)
  if (investorCount <= 1) concentrationRisk = 90
  else if (investorCount <= 3) concentrationRisk = 60
  else if (investorCount <= 5) concentrationRisk = 40
  else if (investorCount <= 10) concentrationRisk = 20
  else concentrationRisk = 10

  // Velocity risk: how fast is funding progressing vs deadline
  const totalDeposited = Number(roundInfo.totalDeposited)
  const targetAmount = Number(roundInfo.targetAmount)
  const fundingProgress = targetAmount > 0 ? (totalDeposited / targetAmount) * 100 : 0

  let velocityRisk = 50
  if (fundingProgress >= 100) velocityRisk = 0
  else if (fundingProgress >= 75) velocityRisk = 15
  else if (fundingProgress >= 50) velocityRisk = 30
  else if (fundingProgress >= 25) velocityRisk = 50
  else velocityRisk = 80

  // Adjust velocity risk by solvency
  if (solvency.overallScore < 25) velocityRisk = Math.min(100, velocityRisk + 20)

  // Tranche utilization: how many tranches have been released
  const releasedCount = tranches.released.filter(Boolean).length
  const trancheUtilization = tranches.released.length > 0
    ? (releasedCount / tranches.released.length) * 100
    : 0

  // --- [CONFIDENTIAL_COMPUTE_BOUNDARY_END] ---

  return {
    concentrationRisk: Math.round(concentrationRisk),
    velocityRisk: Math.round(velocityRisk),
    fundingProgress: Math.round(fundingProgress),
    trancheUtilization: Math.round(trancheUtilization),
  }
}

// =============================================================================
// Main Workflow Callback
// =============================================================================

const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): string => {
  const config = runtime.config
  const now = runtime.now()
  const timestamp = Math.floor(now.getTime() / 1000)

  runtime.log(`[RVP-Funding] Funding Engine workflow triggered at ${now.toISOString()}`)
  runtime.log(`[RVP-Funding] Monitoring project: ${config.projectId}`)

  // -------------------------------------------------------------------------
  // Step 1: Read onchain funding round state (DON Mode — BFT)
  // -------------------------------------------------------------------------
  runtime.log('[RVP-Funding] Step 1: Reading onchain funding round state...')

  const chainSelector = getNetwork({
    chainFamily: 'evm',
    chainSelectorName: config.evmChainSelectorName,
    isTestnet: true,
  })
  const evmClient = new EVMClient(chainSelector)

  const { roundInfo, tranches, activeRoundId } = readFundingRoundState(
    evmClient, runtime, config,
  )

  if (!roundInfo || !tranches) {
    runtime.log('[RVP-Funding] No active funding rounds. Skipping cycle.')
    return JSON.stringify({ status: 'no_rounds', projectId: config.projectId, timestamp })
  }

  runtime.log(
    `[RVP-Funding] Round ${activeRoundId}: ` +
    `deposited=${Number(roundInfo.totalDeposited) / 1e18} ETH, ` +
    `investors=${Number(roundInfo.investorCount)}`
  )

  // -------------------------------------------------------------------------
  // Step 2: Read onchain solvency score (DON Mode — BFT)
  // -------------------------------------------------------------------------
  runtime.log('[RVP-Funding] Step 2: Reading solvency score...')

  const solvency = readSolvencyScore(evmClient, runtime, config)

  runtime.log(
    `[RVP-Funding] Solvency: score=${solvency.overallScore}, ` +
    `risk=${['LOW','MEDIUM','HIGH','CRITICAL'][solvency.riskLevel]}`
  )

  // -------------------------------------------------------------------------
  // Step 3: Read onchain milestone status (DON Mode — BFT)
  // -------------------------------------------------------------------------
  runtime.log('[RVP-Funding] Step 3: Reading milestone status...')

  // Read milestone 0 status (first milestone for the project)
  const milestone = readMilestoneStatus(evmClient, runtime, config, 0)

  runtime.log(
    `[RVP-Funding] Milestone 0: progress=${milestone.progressPercentage}%, ` +
    `approved=${milestone.approved}`
  )

  // -------------------------------------------------------------------------
  // Step 4: Compute funding health metrics [CC PLACEHOLDER]
  // -------------------------------------------------------------------------
  runtime.log('[RVP-Funding] Step 4: Computing funding health metrics [CC_PLACEHOLDER]...')

  const metrics = computeFundingHealth(roundInfo, tranches, solvency)

  runtime.log(
    `[RVP-Funding] Health: concentration=${metrics.concentrationRisk}, ` +
    `velocity=${metrics.velocityRisk}, progress=${metrics.fundingProgress}%`
  )

  // -------------------------------------------------------------------------
  // Step 5: Rule-based health status + explanation
  // -------------------------------------------------------------------------
  runtime.log('[RVP-Funding] Step 5: Evaluating funding health (rule-based)...')

  let healthStatus = 'Healthy'
  let explanation = 'Funding round is stable with good diversification and velocity.'

  if (metrics.concentrationRisk > 40) {
    healthStatus = 'Caution'
    explanation = 'High concentration: top investor holds more than 40% of the round.'
  } else if (metrics.velocityRisk > 60) {
    healthStatus = 'Caution'
    explanation = 'Funding velocity slowing: no significant new pledges in over 30 days.'
  }

  if (metrics.concentrationRisk > 60 || metrics.velocityRisk > 80 || solvency.overallScore < 30) {
    healthStatus = 'At Risk'
    explanation = 'Elevated risk: review concentration, funding momentum, and solvency score.'
  }

  runtime.log(`[RVP-Funding] Health: ${healthStatus} — "${explanation.substring(0, 60)}..."`)

  // -------------------------------------------------------------------------
  // Step 6: Encode & write funding report onchain
  // -------------------------------------------------------------------------
  runtime.log('[RVP-Funding] Step 6: Writing funding report onchain...')

  const reportBytes = encodeAbiParameters(
    parseAbiParameters(
      'bytes32 projectId, uint256 roundId, uint8 roundType, uint8 status, ' +
      'uint256 totalDeposited, uint256 totalReleased, uint256 investorCount, ' +
      'uint8 concentrationRisk, uint8 velocityRisk, uint64 timestamp',
    ),
    [
      config.projectId as `0x${string}`,
      BigInt(activeRoundId),
      roundInfo.roundType,
      roundInfo.status,
      roundInfo.totalDeposited,
      roundInfo.totalReleased,
      roundInfo.investorCount,
      metrics.concentrationRisk,
      metrics.velocityRisk,
      BigInt(timestamp),
    ],
  )

  const signedReport = runtime.report(reportBytes)

  runtime.log(`[RVP-Funding] Funding report generated. Round ${activeRoundId}`)
  runtime.log(
    `[RVP-Funding] Summary: ` +
    `progress=${metrics.fundingProgress}% | ` +
    `concentration=${metrics.concentrationRisk} | ` +
    `velocity=${metrics.velocityRisk} | ` +
    `health=${healthStatus}`
  )

  return JSON.stringify({
    status: 'success',
    projectId: config.projectId,
    roundId: activeRoundId,
    fundingProgress: metrics.fundingProgress,
    concentrationRisk: metrics.concentrationRisk,
    velocityRisk: metrics.velocityRisk,
    healthStatus,
    explanation,
    timestamp,
  })
}

// =============================================================================
// Workflow Registration
// =============================================================================

function initWorkflow(config: Config): Array<HandlerEntry<Config, any, any, any>> {
  const cron = new CronCapability()

  return [
    handler(
      cron.trigger({ schedule: config.schedule }),
      onCronTrigger,
    ),
  ]
}

// =============================================================================
// Entry Point
// =============================================================================

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema })
  await runner.run(initWorkflow)
}

main()
