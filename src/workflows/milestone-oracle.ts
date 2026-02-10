/**
 * ============================================================================
 * Revitalization Protocol — Construction Milestone Oracle
 * ============================================================================
 *
 * CRE Workflow: Verifies physical construction progress via satellite/drone
 * imagery and permit data, with deterministic rule-based scoring, and writes
 * milestone verification reports onchain.
 *
 * Architecture:
 *   Cron Trigger (weekly audit sweep)
 *     → Fetch satellite imagery metadata (HTTPClient + consensus)
 *     → Fetch permit status data (HTTPClient + consensus)
 *     → Read onchain milestone config (EVMClient)
 *     → Compute progress score [Confidential Compute placeholder]
 *     → Generate signed report → Write onchain (EVMClient)
 *
 * Chainlink Services Used:
 *   - CRE Workflows (orchestration)
 *   - Data Feeds (satellite/permit data via proxy)
 *   - Confidential Compute (placeholder for sensitive imagery analysis)
 *   - Custom HTTP APIs (satellite data, permit API)
 *
 * Target Hackathon Categories:
 *   - DeFi & Tokenization (milestone-gated funding release)
 *   - Risk & Compliance (construction progress verification)
 *   - Privacy (Confidential Compute for proprietary imagery)
 *
 * @author Willis — Revitalization Protocol Team
 * @version 0.2.0
 * @hackathon Chainlink Convergence 2026
 */

import {
  Runner,
  handler,
  HTTPClient,
  EVMClient,
  CronCapability,
  ConsensusAggregationByFields,
  median,
  identical,
  encodeCallMsg,
  getNetwork,
  LAST_FINALIZED_BLOCK_NUMBER,
  ok,
  text,
  type Runtime,
  type HTTPSendRequester,
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
  // Scheduling
  schedule: z.string().describe('Cron expression for weekly milestone audit sweep'),

  // Project identity
  projectId: z.string().describe('Hex-encoded bytes32 project identifier'),
  milestoneId: z.number().describe('Milestone ID to verify (uint8)'),

  // EVM configuration
  evmChainSelectorName: z.string().describe('CRE chain selector name, e.g., ethereum-sepolia'),
  milestoneConsumerAddress: z.string().describe('Address of MilestoneConsumer.sol'),

  // External API endpoints
  satelliteApiUrl: z.string().describe('URL for satellite/drone imagery metadata API'),
  permitApiUrl: z.string().describe('URL for city permit status API'),

  // Thresholds
  approvalThreshold: z.number().describe('Min composite score to auto-approve milestone (0-100)'),
})

type Config = z.infer<typeof configSchema>

// =============================================================================
// Data Structures (inline to avoid import issues in WASM)
// =============================================================================

interface SatelliteData {
  changeDetectionScore: number
  structuralFootprintPercent: number
  cloudCover: number
  resolution: number
  captureDate: number
}

interface PermitData {
  totalPermits: number
  approvedPermits: number
  pendingPermits: number
  expiredPermits: number
  complianceRate: number          // approved / total (0-100)
}

interface MilestoneConfig {
  totalMilestones: number
  isActive: boolean
}

interface ProgressComponents {
  structuralProgress: number      // 0-100
  permitCompliance: number        // 0-100
  imageVerification: number       // 0-100
  overallProgress: number         // Weighted composite (0-100)
}

// =============================================================================
// ABI Definitions for MilestoneConsumer.sol
// =============================================================================

const MILESTONE_CONSUMER_ABI = [
  {
    name: 'getMilestoneConfig',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'projectId', type: 'bytes32' }],
    outputs: [
      { name: 'totalMilestones', type: 'uint8' },
      { name: 'isActive', type: 'bool' },
    ],
  },
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
  {
    name: 'receiveMilestoneReport',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'report', type: 'bytes' }],
    outputs: [],
  },
] as const

// =============================================================================
// Step 1: Fetch Satellite Imagery Data (Node Mode — median consensus)
// =============================================================================

/**
 * Fetches satellite/drone imagery metadata from external API.
 * Each DON node fetches independently; numeric fields aggregated via median.
 */
const fetchSatelliteData = (
  sendRequester: HTTPSendRequester,
  config: Config,
): SatelliteData => {
  const response = sendRequester
    .sendRequest({
      url: `${config.satelliteApiUrl}?projectId=${config.projectId}`,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    })
    .result()

  if (!ok(response)) {
    throw new Error(`Satellite API failed: HTTP ${response.statusCode}`)
  }

  const body = text(response)
  const data = JSON.parse(body)

  // If array, take the most recent entry
  const latest = Array.isArray(data) ? data[data.length - 1] : data

  return {
    changeDetectionScore: Number(latest.changeDetectionScore ?? 0),
    structuralFootprintPercent: Number(latest.structuralFootprintPercent ?? 0),
    cloudCover: Number(latest.cloudCover ?? 100),
    resolution: Number(latest.resolution ?? 1),
    captureDate: Number(latest.captureDate ?? 0),
  }
}

// =============================================================================
// Step 2: Fetch Permit Status (Node Mode — identical consensus on strings)
// =============================================================================

/**
 * Fetches city permit status data from external API.
 * Identical consensus ensures all nodes see the same permit statuses.
 */
const fetchPermitData = (
  sendRequester: HTTPSendRequester,
  config: Config,
): PermitData => {
  const response = sendRequester
    .sendRequest({
      url: `${config.permitApiUrl}?projectId=${config.projectId}`,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    })
    .result()

  if (!ok(response)) {
    throw new Error(`Permit API failed: HTTP ${response.statusCode}`)
  }

  const body = text(response)
  const data = JSON.parse(body)

  // Parse permit array into aggregate metrics
  const permits = Array.isArray(data) ? data : [data]
  const total = permits.length
  const approved = permits.filter((p: any) => p.status === 'approved').length
  const pending = permits.filter((p: any) => p.status === 'pending').length
  const expired = permits.filter((p: any) => p.status === 'expired').length

  return {
    totalPermits: total,
    approvedPermits: approved,
    pendingPermits: pending,
    expiredPermits: expired,
    complianceRate: total > 0 ? Math.round((approved / total) * 100) : 0,
  }
}

// =============================================================================
// Step 3: Progress Score Computation (Confidential Compute Placeholder)
// =============================================================================

/**
 * Compute milestone progress score from satellite and permit data.
 * Weighted scoring: structural 40%, permit 20%, imagery 40%.
 *
 * When CC SDK ships (Feb 14), this will be wrapped in:
 *   ccRuntime.execute(computeProgress, { visibility: 'attestation-only' })
 */
function computeProgress(
  satelliteData: SatelliteData,
  permitData: PermitData,
): ProgressComponents {
  // --- [CONFIDENTIAL_COMPUTE_BOUNDARY_START] ---

  const WEIGHTS = {
    structuralProgress: 0.40,
    permitCompliance: 0.20,
    imageVerification: 0.40,
  }

  // Structural Progress (0-100): based on change detection and footprint
  let sp = Math.round(
    (satelliteData.changeDetectionScore * 0.6) +
    (satelliteData.structuralFootprintPercent * 0.4)
  )
  sp = Math.max(0, Math.min(100, sp))

  // Permit Compliance (0-100): based on approval rate and expired status
  let pc = permitData.complianceRate
  if (permitData.expiredPermits > 0) {
    pc -= permitData.expiredPermits * 15
  }
  if (permitData.pendingPermits > 0) {
    pc -= permitData.pendingPermits * 5
  }
  pc = Math.max(0, Math.min(100, pc))

  // Image Verification (0-100): based on image quality and recency
  let iv = 80  // Base score
  // Penalize high cloud cover
  if (satelliteData.cloudCover > 50) iv -= 30
  else if (satelliteData.cloudCover > 20) iv -= 10
  // Reward high resolution
  if (satelliteData.resolution <= 0.05) iv += 15
  else if (satelliteData.resolution <= 0.3) iv += 10
  else if (satelliteData.resolution > 1) iv -= 20
  // Bonus for recent imagery (within 7 days)
  const nowSeconds = Math.floor(Date.now() / 1000)
  const daysSinceCapture = (nowSeconds - satelliteData.captureDate) / 86400
  if (daysSinceCapture <= 7) iv += 10
  else if (daysSinceCapture > 30) iv -= 15
  else if (daysSinceCapture > 14) iv -= 5
  iv = Math.max(0, Math.min(100, iv))

  const overallProgress = Math.round(
    sp * WEIGHTS.structuralProgress +
    pc * WEIGHTS.permitCompliance +
    iv * WEIGHTS.imageVerification,
  )

  // --- [CONFIDENTIAL_COMPUTE_BOUNDARY_END] ---

  return {
    structuralProgress: sp,
    permitCompliance: pc,
    imageVerification: iv,
    overallProgress: Math.max(0, Math.min(100, overallProgress)),
  }
}

// =============================================================================
// Step 5: Encode Report for Onchain Submission
// =============================================================================

/**
 * Encode the milestone report as ABI-packed bytes for the onchain consumer.
 * Matches: MilestoneConsumer.receiveMilestoneReport(bytes report)
 */
function encodeMilestoneReport(
  projectId: string,
  milestoneId: number,
  progressPercentage: number,
  verificationScore: number,
  approved: boolean,
  timestamp: number,
): string {
  const encoded = encodeAbiParameters(
    parseAbiParameters(
      'bytes32 projectId, uint8 milestoneId, uint8 progressPercentage, uint8 verificationScore, bool approved, uint64 timestamp',
    ),
    [
      projectId as `0x${string}`,
      milestoneId,
      progressPercentage,
      verificationScore,
      approved,
      BigInt(timestamp),
    ],
  )

  return encoded
}

// =============================================================================
// Main Workflow Callback — Orchestrates the full milestone pipeline
// =============================================================================

const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): string => {
  const config = runtime.config
  const now = runtime.now()
  const timestamp = Math.floor(now.getTime() / 1000)

  runtime.log(`[RVP] Milestone Oracle triggered at ${now.toISOString()}`)
  runtime.log(`[RVP] Monitoring project: ${config.projectId}, milestone: ${config.milestoneId}`)

  // -------------------------------------------------------------------------
  // Step 1: Fetch satellite imagery data via HTTP (Node Mode + median consensus)
  // -------------------------------------------------------------------------
  runtime.log('[RVP] Step 1: Fetching satellite imagery data...')

  const httpClient = new HTTPClient()
  const satelliteData = httpClient
    .sendRequest(
      runtime,
      fetchSatelliteData,
      ConsensusAggregationByFields<SatelliteData>({
        changeDetectionScore: median,
        structuralFootprintPercent: median,
        cloudCover: median,
        resolution: median,
        captureDate: median,
      }),
    )(config)
    .result()

  runtime.log(`[RVP] Satellite: change=${satelliteData.changeDetectionScore}, footprint=${satelliteData.structuralFootprintPercent}%, cloud=${satelliteData.cloudCover}%`)

  // -------------------------------------------------------------------------
  // Step 2: Fetch permit status via HTTP (Node Mode + identical consensus)
  // -------------------------------------------------------------------------
  runtime.log('[RVP] Step 2: Fetching permit status data...')

  const permitData = httpClient
    .sendRequest(
      runtime,
      fetchPermitData,
      ConsensusAggregationByFields<PermitData>({
        totalPermits: identical,
        approvedPermits: identical,
        pendingPermits: identical,
        expiredPermits: identical,
        complianceRate: identical,
      }),
    )(config)
    .result()

  runtime.log(`[RVP] Permits: ${permitData.approvedPermits}/${permitData.totalPermits} approved, compliance=${permitData.complianceRate}%`)

  // -------------------------------------------------------------------------
  // Step 3: Read onchain milestone config (DON Mode — BFT guaranteed)
  // -------------------------------------------------------------------------
  runtime.log('[RVP] Step 3: Reading onchain milestone config...')

  const chainSelector = getNetwork({
    chainFamily: 'evm',
    chainSelectorName: config.evmChainSelectorName,
    isTestnet: true,
  })
  const evmClient = new EVMClient(chainSelector)

  const configCallData = encodeFunctionData({
    abi: MILESTONE_CONSUMER_ABI,
    functionName: 'getMilestoneConfig',
    args: [config.projectId as `0x${string}`],
  })

  const configResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: config.milestoneConsumerAddress as Address,
        data: configCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result()

  const decodedConfig = decodeFunctionResult({
    abi: MILESTONE_CONSUMER_ABI,
    functionName: 'getMilestoneConfig',
    data: configResult.data as `0x${string}`,
  }) as [number, boolean]

  const milestoneConfig: MilestoneConfig = {
    totalMilestones: Number(decodedConfig[0]),
    isActive: Boolean(decodedConfig[1]),
  }

  runtime.log(`[RVP] Config: ${milestoneConfig.totalMilestones} milestones, active=${milestoneConfig.isActive}`)

  // -------------------------------------------------------------------------
  // Step 4: Compute progress score [CONFIDENTIAL COMPUTE PLACEHOLDER]
  // -------------------------------------------------------------------------
  runtime.log('[RVP] Step 4: Computing progress score [CC_PLACEHOLDER]...')

  // NOTE: When Confidential Compute SDK is available, wrap this call:
  //   const progress = ccRuntime.execute(
  //     () => computeProgress(satelliteData, permitData),
  //     { attestation: true, enclave: 'sgx' }
  //   )
  const progress = computeProgress(satelliteData, permitData)

  runtime.log(`[RVP] Progress: structural=${progress.structuralProgress}, permit=${progress.permitCompliance}, image=${progress.imageVerification}, overall=${progress.overallProgress}`)

  // -------------------------------------------------------------------------
  // Step 5: Rule-based approval decision + status summary
  // -------------------------------------------------------------------------
  runtime.log('[RVP] Step 5: Evaluating approval (rule-based)...')

  const shouldApprove =
    progress.overallProgress >= config.approvalThreshold &&
    permitData.complianceRate === 100

  const statusSummary = progress.overallProgress >= 95
    ? 'Milestone fully verified: strong structural progress, high site activity, all permits approved.'
    : progress.overallProgress >= 80
    ? 'Milestone nearing completion: good structural and image progress, minor permit items pending.'
    : progress.overallProgress >= 50
    ? 'Moderate progress detected: structural work underway, permits partially in place.'
    : 'Early stage progress: limited structural changes and site activity observed.'

  runtime.log(`[RVP] Decision: approved=${shouldApprove}, progress=${progress.overallProgress}%, status="${statusSummary.substring(0, 60)}..."`)

  // -------------------------------------------------------------------------
  // Step 6: Generate signed report and write onchain
  // -------------------------------------------------------------------------
  runtime.log('[RVP] Step 6: Writing milestone report onchain...')

  const reportBytes = encodeMilestoneReport(
    config.projectId,
    config.milestoneId,
    progress.overallProgress,
    progress.overallProgress,
    shouldApprove,
    timestamp,
  )

  // Generate a signed report using CRE's report capability
  const signedReport = runtime.report(reportBytes)

  // Write the signed report to MilestoneConsumer.sol
  const writeCallData = encodeFunctionData({
    abi: MILESTONE_CONSUMER_ABI,
    functionName: 'receiveMilestoneReport',
    args: [signedReport as `0x${string}`],
  })

  const writeResult = evmClient
    .writeReport(runtime, {
      to: config.milestoneConsumerAddress as Address,
      data: writeCallData,
    })
    .result()

  runtime.log(`[RVP] Milestone report written onchain. TX: ${writeResult.transactionHash}`)
  runtime.log(`[RVP] Progress: ${progress.overallProgress}% | Approved: ${shouldApprove}`)

  // Return summary for CRE execution logs
  return JSON.stringify({
    status: 'success',
    projectId: config.projectId,
    milestoneId: config.milestoneId,
    progressPercentage: progress.overallProgress,
    verificationScore: progress.overallProgress,
    approved: shouldApprove,
    statusSummary,
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
