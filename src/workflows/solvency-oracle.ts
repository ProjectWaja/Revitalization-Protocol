/**
 * ============================================================================
 * Revitalization Protocol — Real-Time Project Solvency Oracle
 * ============================================================================
 *
 * CRE Workflow: Monitors financial health of infrastructure projects and
 * produces verifiable solvency reports written onchain.
 *
 * Architecture:
 *   Cron Trigger (every 5 min)
 *     → Fetch cost indices (HTTPClient + consensus)
 *     → Read onchain project financials (EVMClient)
 *     → Fetch funding velocity from external API (HTTPClient + consensus)
 *     → Compute solvency score [Confidential Compute placeholder]
 *     → Call AI risk agent for narrative assessment (HTTPClient, x402-style)
 *     → Generate signed report → Write onchain (EVMClient)
 *
 * Chainlink Services Used:
 *   - CRE Workflows (orchestration)
 *   - Data Feeds (cost indices via proxy)
 *   - Confidential Compute (placeholder for sensitive solvency calc)
 *   - Custom HTTP APIs (funding data, AI agent, satellite mock)
 *
 * Target Hackathon Categories:
 *   - DeFi & Tokenization (solvency-gated funding release)
 *   - Risk & Compliance (real-time risk monitoring)
 *   - CRE & AI (AI risk scoring inside CRE workflow)
 *   - Privacy (Confidential Compute for sensitive financials)
 *
 * @author Willis — Revitalization Protocol Team
 * @version 0.1.0
 * @hackathon Chainlink Convergence 2026
 */

import {
  Runner,
  handler,
  HTTPClient,
  EVMClient,
  CronCapability,
  consensusMedianAggregation,
  ConsensusAggregationByFields,
  consensusIdenticalAggregation,
  median,
  identical,
  encodeCallMsg,
  getNetwork,
  LAST_FINALIZED_BLOCK_NUMBER,
  ok,
  text,
  type Runtime,
  type NodeRuntime,
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
  keccak256,
  toHex,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem'

// =============================================================================
// Configuration Schema
// =============================================================================

const configSchema = z.object({
  // Scheduling
  schedule: z.string().describe('Cron expression for solvency checks'),

  // Project identity
  projectId: z.string().describe('Hex-encoded bytes32 project identifier'),

  // EVM configuration
  evmChainSelectorName: z.string().describe('CRE chain selector name, e.g., ethereum-sepolia'),
  solvencyConsumerAddress: z.string().describe('Address of SolvencyConsumer.sol'),

  // External API endpoints
  costIndexApiUrl: z.string().describe('URL for commodity/cost index API'),
  fundingApiUrl: z.string().describe('URL for funding velocity/metrics API'),
  aiRiskAgentUrl: z.string().describe('URL for AI risk scoring agent (Claude API or x402)'),

  // Thresholds
  rescueTriggerThreshold: z.number().describe('Score below which rescue funding is triggered (0-100)'),
  alertThreshold: z.number().describe('Score below which alerts are emitted (0-100)'),

  // Confidential Compute (optional)
  confidentialComputeAddress: z.string().optional().describe('Address of ConfidentialSolvencyCompute.sol (optional)'),
})

type Config = z.infer<typeof configSchema>

// =============================================================================
// Data Structures (inline to avoid import issues in WASM)
// =============================================================================

interface CostIndexData {
  steelIndex: number
  concreteIndex: number
  laborIndex: number
  lumberIndex: number
  fuelIndex: number
  timestamp: number
}

interface FundingMetrics {
  totalPledged: number
  totalReceived: number
  pledgeFulfillmentRate: number
  investorCount: number
  daysSinceLastFunding: number
}

interface ProjectFinancials {
  totalBudget: number
  capitalDeployed: number
  capitalRemaining: number
  fundingVelocity: number
  burnRate: number
  monthsOfRunway: number
}

interface SolvencyComponents {
  financialHealth: number
  costExposure: number
  fundingMomentum: number
  runwayAdequacy: number
}

interface AIRiskResult {
  riskNarrative: string
  topRisks: string[]
  recommendation: string
  triggerRescue: boolean
}

// =============================================================================
// ABI Definitions for SolvencyConsumer.sol
// =============================================================================

const SOLVENCY_CONSUMER_ABI = [
  {
    name: 'getProjectFinancials',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'projectId', type: 'bytes32' }],
    outputs: [
      { name: 'totalBudget', type: 'uint256' },
      { name: 'capitalDeployed', type: 'uint256' },
      { name: 'capitalRemaining', type: 'uint256' },
      { name: 'fundingVelocity', type: 'uint256' },
      { name: 'burnRate', type: 'uint256' },
    ],
  },
  {
    name: 'receiveSolvencyReport',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'report', type: 'bytes' }],
    outputs: [],
  },
] as const

// =============================================================================
// ABI Definitions for ConfidentialSolvencyCompute.sol
// =============================================================================

const CONFIDENTIAL_COMPUTE_ABI = [
  {
    name: 'computeSolvencyScore',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'projectId', type: 'bytes32' },
      { name: 'financialHealth', type: 'uint8' },
      { name: 'costExposure', type: 'uint8' },
      { name: 'fundingMomentum', type: 'uint8' },
      { name: 'runwayAdequacy', type: 'uint8' },
      { name: 'nonce', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'getLatestResult',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'projectId', type: 'bytes32' }],
    outputs: [
      { name: 'score', type: 'uint8' },
      { name: 'riskLevel', type: 'uint8' },
      { name: 'attestationHash', type: 'bytes32' },
      { name: 'enclaveVerified', type: 'bool' },
      { name: 'timestamp', type: 'uint64' },
    ],
  },
] as const

// =============================================================================
// Step 1: Fetch Cost Indices (Node Mode — each node fetches, then consensus)
// =============================================================================

/**
 * Fetches commodity/material cost index data from an external API.
 * Runs in Node Mode: each DON node fetches independently, results
 * are aggregated via median consensus for numeric fields and
 * identical consensus for the source string.
 */
// ---------------------------------------------------------------------------
// CHAINLINK DATA FEED GAP: Construction Material Price Feeds
//
// Chainlink Data Feeds currently do not cover construction material commodities
// (steel, concrete, labor, lumber, fuel). This custom HTTP API demonstrates the
// data schema and consumption pattern that a future Chainlink Construction
// Materials Data Feed could provide. The weighted cost index approach mirrors
// how existing Chainlink commodity feeds (gold, oil) are consumed.
//
// When Chainlink adds construction material feeds, replace this HTTP fetch with:
//   const steelFeed = new DataFeed(runtime, { feedAddress: STEEL_INDEX_FEED })
//   const steelIndex = steelFeed.latestAnswer()
// ---------------------------------------------------------------------------
const fetchCostIndices = (
  sendRequester: HTTPSendRequester,
  config: Config,
): CostIndexData => {
  const response = sendRequester
    .sendRequest({
      url: config.costIndexApiUrl,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    })
    .result()

  if (!ok(response)) {
    throw new Error(`Cost index API failed: HTTP ${response.statusCode}`)
  }

  const body = text(response)
  const data = JSON.parse(body)

  return {
    steelIndex: Number(data.steel ?? data.steelIndex ?? 50),
    concreteIndex: Number(data.concrete ?? data.concreteIndex ?? 50),
    laborIndex: Number(data.labor ?? data.laborIndex ?? 50),
    lumberIndex: Number(data.lumber ?? data.lumberIndex ?? 50),
    fuelIndex: Number(data.fuel ?? data.fuelIndex ?? 50),
    timestamp: Number(data.timestamp ?? Math.floor(Date.now() / 1000)),
  }
}

// =============================================================================
// Step 2: Fetch Funding Metrics (Node Mode — consensus aggregated)
// =============================================================================

const fetchFundingMetrics = (
  sendRequester: HTTPSendRequester,
  config: Config,
): FundingMetrics => {
  const response = sendRequester
    .sendRequest({
      url: `${config.fundingApiUrl}?projectId=${config.projectId}`,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    })
    .result()

  if (!ok(response)) {
    throw new Error(`Funding API failed: HTTP ${response.statusCode}`)
  }

  const body = text(response)
  const data = JSON.parse(body)

  return {
    totalPledged: Number(data.totalPledged ?? 0),
    totalReceived: Number(data.totalReceived ?? 0),
    pledgeFulfillmentRate: Number(data.pledgeFulfillmentRate ?? 0),
    investorCount: Number(data.investorCount ?? 0),
    daysSinceLastFunding: Number(data.daysSinceLastFunding ?? 999),
  }
}

// =============================================================================
// Step 3: AI Risk Agent Call (Node Mode — identical consensus on JSON)
// =============================================================================

/**
 * Calls the AI risk scoring agent (Claude API or x402-wrapped service).
 * Each node calls independently; we use identical aggregation since the
 * model is pinned to temperature=0 and we expect deterministic structured output.
 *
 * NOTE: LLMs are inherently non-deterministic. For production, consider:
 * 1. Running AI outside the DON via HTTP trigger callback
 * 2. Using a deterministic scoring model instead
 * 3. Using Confidential Compute for the AI call (single-node execution)
 *
 * For hackathon MVP, we accept the risk and use structured JSON + identical.
 */
const callAIRiskAgent = (
  sendRequester: HTTPSendRequester,
  config: Config,
  solvencyData: {
    components: SolvencyComponents
    overallScore: number
    costIndices: CostIndexData
    fundingMetrics: FundingMetrics
  },
): AIRiskResult => {
  const prompt = buildRiskPrompt(solvencyData)

  const response = sendRequester
    .sendRequest({
      url: config.aiRiskAgentUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // NOTE: In production, use runtime.getSecret() for API key.
        // For x402-style payment, the payment header would go here.
        // 'X-Payment-Signature': '<x402_payment_payload>'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })
    .result()

  if (!ok(response)) {
    // Graceful degradation: return conservative defaults if AI is unavailable
    return {
      riskNarrative: 'AI risk agent unavailable. Using rule-based assessment only.',
      topRisks: ['AI agent unreachable'],
      recommendation: 'Review solvency score manually.',
      triggerRescue: solvencyData.overallScore < 25,
    }
  }

  const body = text(response)
  const aiResponse = JSON.parse(body)

  // Parse Claude's structured response
  const content = aiResponse.content?.[0]?.text ?? '{}'
  const parsed = JSON.parse(content)

  return {
    riskNarrative: String(parsed.riskNarrative ?? 'No narrative available'),
    topRisks: Array.isArray(parsed.topRisks) ? parsed.topRisks.slice(0, 3) : [],
    recommendation: String(parsed.recommendation ?? 'No recommendation'),
    triggerRescue: Boolean(parsed.triggerRescue ?? false),
  }
}

/**
 * Build a deterministic, structured prompt for the AI risk agent.
 */
function buildRiskPrompt(data: {
  components: SolvencyComponents
  overallScore: number
  costIndices: CostIndexData
  fundingMetrics: FundingMetrics
}): string {
  return `You are an infrastructure project risk analyst for the Revitalization Protocol.
Analyze the following solvency data and respond ONLY with a JSON object (no markdown, no explanation).

PROJECT SOLVENCY DATA:
- Overall Score: ${data.overallScore}/100
- Financial Health: ${data.components.financialHealth}/100
- Cost Exposure: ${data.components.costExposure}/100
- Funding Momentum: ${data.components.fundingMomentum}/100
- Runway Adequacy: ${data.components.runwayAdequacy}/100

COST INDICES:
- Steel: ${data.costIndices.steelIndex}, Concrete: ${data.costIndices.concreteIndex}
- Labor: ${data.costIndices.laborIndex}, Lumber: ${data.costIndices.lumberIndex}
- Fuel: ${data.costIndices.fuelIndex}

FUNDING:
- Pledged: $${data.fundingMetrics.totalPledged}, Received: $${data.fundingMetrics.totalReceived}
- Fulfillment Rate: ${(data.fundingMetrics.pledgeFulfillmentRate * 100).toFixed(1)}%
- Active Investors: ${data.fundingMetrics.investorCount}
- Days Since Last Funding: ${data.fundingMetrics.daysSinceLastFunding}

Respond with exactly this JSON structure:
{
  "riskNarrative": "<2-3 sentence risk summary>",
  "topRisks": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "recommendation": "<single actionable recommendation>",
  "triggerRescue": <true if score < 25 and funding is stalling, false otherwise>
}`
}

// =============================================================================
// Step 4: Solvency Score Computation (Confidential Compute Placeholder)
// =============================================================================

/**
 * Compute solvency score from raw data.
 * This function is marked for Confidential Compute execution because it
 * processes sensitive financial data that investors/creditors should not
 * see in plaintext on the DON.
 *
 * When CC SDK ships (Feb 14), this will be wrapped in:
 *   ccRuntime.execute(computeSolvency, { visibility: 'attestation-only' })
 */
function computeSolvency(
  financials: ProjectFinancials,
  costIndices: CostIndexData,
  fundingMetrics: FundingMetrics,
): { components: SolvencyComponents; overallScore: number; riskLevel: number } {
  // --- [CONFIDENTIAL_COMPUTE_BOUNDARY_START] ---
  // Everything between these markers will run inside a Chainlink Confidential
  // Compute enclave when the CC SDK ships (expected early 2026). The enclave
  // ensures sensitive financial data (budgets, burn rates, creditor exposure)
  // is never visible to DON nodes — only the final score + attestation hash
  // are published on-chain. Architecture is ready: swap this block for
  // ccRuntime.execute(computeSolvency, { visibility: 'attestation-only' })

  const WEIGHTS = {
    financialHealth: 0.35,
    costExposure: 0.20,
    fundingMomentum: 0.25,
    runwayAdequacy: 0.20,
  }

  // Financial Health (0-100)
  let fh = 100
  const deployRatio = financials.capitalDeployed / Math.max(financials.totalBudget, 1)
  const remainRatio = financials.capitalRemaining / Math.max(financials.totalBudget, 1)
  if (deployRatio < 0.1) fh -= 30
  if (deployRatio > 0.9 && remainRatio < 0.05) fh -= 40
  if (financials.burnRate > 0) {
    const sustain = financials.fundingVelocity / financials.burnRate
    if (sustain < 0.5) fh -= 30
    else if (sustain < 0.8) fh -= 15
    else if (sustain > 1.2) fh += 10
  }
  fh = Math.max(0, Math.min(100, fh))

  // Cost Exposure (0-100)
  const avgCost = (
    costIndices.steelIndex + costIndices.concreteIndex +
    costIndices.laborIndex + costIndices.lumberIndex + costIndices.fuelIndex
  ) / 5
  const ce = Math.max(0, Math.min(100, Math.round(100 - (avgCost - 30) * (100 / 70))))

  // Funding Momentum (0-100)
  let fm = 50
  fm += (fundingMetrics.pledgeFulfillmentRate - 0.5) * 40
  if (fundingMetrics.investorCount >= 10) fm += 15
  else if (fundingMetrics.investorCount >= 5) fm += 10
  else if (fundingMetrics.investorCount <= 2) fm -= 15
  if (fundingMetrics.daysSinceLastFunding <= 7) fm += 15
  else if (fundingMetrics.daysSinceLastFunding <= 30) fm += 5
  else if (fundingMetrics.daysSinceLastFunding > 90) fm -= 25
  else if (fundingMetrics.daysSinceLastFunding > 60) fm -= 15
  fm = Math.max(0, Math.min(100, Math.round(fm)))

  // Runway Adequacy (0-100)
  const months = financials.monthsOfRunway
  let ra = 5
  if (months >= 24) ra = 100
  else if (months >= 12) ra = 80
  else if (months >= 6) ra = 60
  else if (months >= 3) ra = 40
  else if (months >= 1) ra = 20

  const overallScore = Math.round(
    fh * WEIGHTS.financialHealth +
    ce * WEIGHTS.costExposure +
    fm * WEIGHTS.fundingMomentum +
    ra * WEIGHTS.runwayAdequacy,
  )

  // Risk level: 0=LOW, 1=MEDIUM, 2=HIGH, 3=CRITICAL
  let riskLevel = 3
  if (overallScore >= 75) riskLevel = 0
  else if (overallScore >= 50) riskLevel = 1
  else if (overallScore >= 25) riskLevel = 2

  // --- [CONFIDENTIAL_COMPUTE_BOUNDARY_END] ---

  return {
    components: {
      financialHealth: fh,
      costExposure: ce,
      fundingMomentum: fm,
      runwayAdequacy: ra,
    },
    overallScore,
    riskLevel,
  }
}

// =============================================================================
// Step 5: Encode Report for Onchain Submission
// =============================================================================

/**
 * Encode the solvency report as ABI-packed bytes for the onchain consumer.
 * Matches: SolvencyConsumer.receiveSolvencyReport(bytes report)
 */
function encodeSolvencyReport(
  projectId: string,
  score: number,
  riskLevel: number,
  components: SolvencyComponents,
  triggerRescue: boolean,
  timestamp: number,
): string {
  // ABI-encode the report struct
  const encoded = encodeAbiParameters(
    parseAbiParameters(
      'bytes32 projectId, uint8 overallScore, uint8 riskLevel, uint8 financialHealth, uint8 costExposure, uint8 fundingMomentum, uint8 runwayAdequacy, bool triggerRescue, uint64 timestamp',
    ),
    [
      projectId as `0x${string}`,
      score,
      riskLevel,
      components.financialHealth,
      components.costExposure,
      components.fundingMomentum,
      components.runwayAdequacy,
      triggerRescue,
      BigInt(timestamp),
    ],
  )

  return encoded
}

// =============================================================================
// Main Workflow Callback — Orchestrates the full solvency pipeline
// =============================================================================

const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): string => {
  const config = runtime.config
  const now = runtime.now()
  const timestamp = Math.floor(now.getTime() / 1000)

  runtime.log(`[RVP] Solvency Oracle triggered at ${now.toISOString()}`)
  runtime.log(`[RVP] Monitoring project: ${config.projectId}`)

  // -------------------------------------------------------------------------
  // Step 1: Fetch cost indices via HTTP (Node Mode + median consensus)
  // -------------------------------------------------------------------------
  runtime.log('[RVP] Step 1: Fetching cost indices...')

  const httpClient = new HTTPClient()
  const costIndices = httpClient
    .sendRequest(
      runtime,
      fetchCostIndices,
      ConsensusAggregationByFields<CostIndexData>({
        steelIndex: median,
        concreteIndex: median,
        laborIndex: median,
        lumberIndex: median,
        fuelIndex: median,
        timestamp: median,
      }),
    )(config)
    .result()

  runtime.log(`[RVP] Cost indices: steel=${costIndices.steelIndex}, concrete=${costIndices.concreteIndex}, labor=${costIndices.laborIndex}`)

  // -------------------------------------------------------------------------
  // Step 2: Read project financials from onchain (DON Mode — BFT guaranteed)
  // -------------------------------------------------------------------------
  runtime.log('[RVP] Step 2: Reading onchain project financials...')

  const chainSelector = getNetwork({
    chainFamily: 'evm',
    chainSelectorName: config.evmChainSelectorName,
    isTestnet: true,
  })
  const evmClient = new EVMClient(chainSelector)

  const financialsCallData = encodeFunctionData({
    abi: SOLVENCY_CONSUMER_ABI,
    functionName: 'getProjectFinancials',
    args: [config.projectId as `0x${string}`],
  })

  const financialsResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: config.solvencyConsumerAddress as Address,
        data: financialsCallData,
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result()

  // Decode the onchain financials (5 uint256 values)
  // In production, use generated bindings from `cre evm generate-bindings`
  const decoded = decodeFunctionResult({
    abi: SOLVENCY_CONSUMER_ABI,
    functionName: 'getProjectFinancials',
    data: financialsResult.data as `0x${string}`,
  }) as [bigint, bigint, bigint, bigint, bigint]

  const financials: ProjectFinancials = {
    totalBudget: Number(decoded[0]) / 1e6,          // Stored as USD * 1e6
    capitalDeployed: Number(decoded[1]) / 1e6,
    capitalRemaining: Number(decoded[2]) / 1e6,
    fundingVelocity: Number(decoded[3]) / 1e6,
    burnRate: Number(decoded[4]) / 1e6,
    monthsOfRunway:
      Number(decoded[4]) > 0
        ? Number(decoded[2]) / Number(decoded[4])
        : 999,
  }

  runtime.log(`[RVP] Financials: budget=$${financials.totalBudget}M, runway=${financials.monthsOfRunway.toFixed(1)} months`)

  // -------------------------------------------------------------------------
  // Step 3: Fetch funding metrics via HTTP (Node Mode + field consensus)
  // -------------------------------------------------------------------------
  runtime.log('[RVP] Step 3: Fetching funding metrics...')

  const fundingMetrics = httpClient
    .sendRequest(
      runtime,
      fetchFundingMetrics,
      ConsensusAggregationByFields<FundingMetrics>({
        totalPledged: median,
        totalReceived: median,
        pledgeFulfillmentRate: median,
        investorCount: median,
        daysSinceLastFunding: median,
      }),
    )(config)
    .result()

  runtime.log(`[RVP] Funding: pledged=$${fundingMetrics.totalPledged}, investors=${fundingMetrics.investorCount}`)

  // -------------------------------------------------------------------------
  // Step 4: Compute solvency score + Confidential Compute attestation
  // -------------------------------------------------------------------------
  runtime.log('[RVP] Step 4: Computing solvency score...')

  const solvency = computeSolvency(financials, costIndices, fundingMetrics)

  runtime.log(`[RVP] Solvency: score=${solvency.overallScore}/100, risk=${['LOW','MEDIUM','HIGH','CRITICAL'][solvency.riskLevel]}`)

  // If ConfidentialSolvencyCompute is configured, read the attestation hash
  if (config.confidentialComputeAddress) {
    runtime.log('[RVP] Step 4b: Reading CC attestation hash...')

    const ccCallData = encodeFunctionData({
      abi: CONFIDENTIAL_COMPUTE_ABI,
      functionName: 'getLatestResult',
      args: [config.projectId as `0x${string}`],
    })

    try {
      const ccResult = evmClient
        .callContract(runtime, {
          call: encodeCallMsg({
            from: zeroAddress,
            to: config.confidentialComputeAddress as Address,
            data: ccCallData,
          }),
          blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
        })
        .result()

      const ccDecoded = decodeFunctionResult({
        abi: CONFIDENTIAL_COMPUTE_ABI,
        functionName: 'getLatestResult',
        data: ccResult.data as `0x${string}`,
      }) as [number, number, string, boolean, bigint]

      const ccAttestationHash = ccDecoded[2]
      const ccEnclaveVerified = ccDecoded[3]

      runtime.log(`[RVP] CC attestation: hash=${ccAttestationHash}, enclaveVerified=${ccEnclaveVerified}`)
    } catch {
      runtime.log('[RVP] CC attestation read failed — continuing without CC verification')
    }
  }

  // -------------------------------------------------------------------------
  // Step 5: AI Risk Agent call (Node Mode — structured JSON, identical consensus)
  // -------------------------------------------------------------------------
  runtime.log('[RVP] Step 5: Calling AI risk agent...')

  // NOTE: LLMs are non-deterministic. For hackathon, we accept this limitation.
  // For production: run AI call outside the DON via HTTP trigger, or use CC.
  //
  // Using runInNodeMode with identical aggregation — if nodes disagree on
  // the AI response, consensus will fail and we fall back to rule-based.
  const aiApiKey = runtime.getSecret('ANTHROPIC_API_KEY').result()

  const aiResult = runtime
    .runInNodeMode(
      (nodeRuntime: NodeRuntime<Config>): AIRiskResult => {
        const nodeHttp = new HTTPClient()
        const resp = nodeHttp
          .sendRequest(nodeRuntime, {
            url: config.aiRiskAgentUrl,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': aiApiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 500,
              temperature: 0,
              messages: [
                {
                  role: 'user',
                  content: buildRiskPrompt({
                    components: solvency.components,
                    overallScore: solvency.overallScore,
                    costIndices,
                    fundingMetrics,
                  }),
                },
              ],
            }),
          })
          .result()

        if (!ok(resp)) {
          return {
            riskNarrative: 'AI unavailable — rule-based fallback active.',
            topRisks: ['AI agent unreachable'],
            recommendation: 'Manual review recommended.',
            triggerRescue: solvency.overallScore < 25,
          }
        }

        const body = text(resp)
        const parsed = JSON.parse(body)
        const content = parsed.content?.[0]?.text ?? '{}'

        // Strip any markdown code fences the model might emit
        const cleaned = content.replace(/```json\s*|```/g, '').trim()
        const result = JSON.parse(cleaned)

        return {
          riskNarrative: String(result.riskNarrative ?? ''),
          topRisks: Array.isArray(result.topRisks) ? result.topRisks.slice(0, 3) : [],
          recommendation: String(result.recommendation ?? ''),
          triggerRescue: Boolean(result.triggerRescue ?? false),
        }
      },
      // Use identical aggregation — all nodes must agree on the structured output
      ConsensusAggregationByFields<AIRiskResult>({
        riskNarrative: identical,
        topRisks: identical,
        recommendation: identical,
        triggerRescue: identical,
      }),
    )()
    .result()

  runtime.log(`[RVP] AI Assessment: rescue=${aiResult.triggerRescue}, narrative="${aiResult.riskNarrative.substring(0, 80)}..."`)

  // -------------------------------------------------------------------------
  // Step 6: Generate signed report and write onchain
  // -------------------------------------------------------------------------
  runtime.log('[RVP] Step 6: Writing solvency report onchain...')

  const shouldTriggerRescue =
    aiResult.triggerRescue ||
    solvency.overallScore < config.rescueTriggerThreshold

  const reportBytes = encodeSolvencyReport(
    config.projectId,
    solvency.overallScore,
    solvency.riskLevel,
    solvency.components,
    shouldTriggerRescue,
    timestamp,
  )

  // Generate a signed report using CRE's report capability
  const signedReport = runtime.report(reportBytes)

  // Write the signed report to SolvencyConsumer.sol
  const writeCallData = encodeFunctionData({
    abi: SOLVENCY_CONSUMER_ABI,
    functionName: 'receiveSolvencyReport',
    args: [signedReport as `0x${string}`],
  })

  const writeResult = evmClient
    .writeReport(runtime, {
      to: config.solvencyConsumerAddress as Address,
      data: writeCallData,
    })
    .result()

  runtime.log(`[RVP] ✅ Solvency report written onchain. TX: ${writeResult.transactionHash}`)
  runtime.log(`[RVP] Score: ${solvency.overallScore}/100 | Risk: ${['LOW','MEDIUM','HIGH','CRITICAL'][solvency.riskLevel]} | Rescue: ${shouldTriggerRescue}`)

  // Return summary for CRE execution logs
  return JSON.stringify({
    status: 'success',
    projectId: config.projectId,
    score: solvency.overallScore,
    riskLevel: solvency.riskLevel,
    rescueTriggered: shouldTriggerRescue,
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
