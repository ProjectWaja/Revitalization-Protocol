import { decodeEventLog, formatEther, type Abi, type Log } from 'viem'

// ── Types ────────────────────────────────────────────────────────────────

export type ContractName =
  | 'CRE Workflow'
  | 'SolvencyConsumer'
  | 'MilestoneConsumer'
  | 'TokenizedFundingEngine'
  | 'ReserveVerifier'

export interface DecodedEvent {
  contract: ContractName
  event: string
  args: Record<string, string>
  isHero: boolean
}

export interface EnrichedStep {
  step: string
  hash?: string
  sourceContract: ContractName
  fn: string
  events: DecodedEvent[]
  crossContractHook?: { from: ContractName; to: ContractName; reason: string }
  data?: Record<string, unknown>
}

// ── Constants ────────────────────────────────────────────────────────────

export const CONTRACT_COLORS: Record<ContractName, { bg: string; border: string; text: string; glow: string; hex: string }> = {
  'CRE Workflow':            { bg: 'bg-blue-500/10',   border: 'border-blue-500/40',   text: 'text-blue-400',   glow: '#3b82f6', hex: '#3b82f6' },
  'SolvencyConsumer':        { bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', text: 'text-emerald-400', glow: '#10b981', hex: '#10b981' },
  'MilestoneConsumer':       { bg: 'bg-orange-500/10', border: 'border-orange-500/40', text: 'text-orange-400', glow: '#f97316', hex: '#f97316' },
  'TokenizedFundingEngine':  { bg: 'bg-purple-500/10', border: 'border-purple-500/40', text: 'text-purple-400', glow: '#a855f7', hex: '#a855f7' },
  'ReserveVerifier':         { bg: 'bg-cyan-500/10',   border: 'border-cyan-500/40',   text: 'text-cyan-400',   glow: '#06b6d4', hex: '#06b6d4' },
}

/** Short display name for badges */
export const CONTRACT_SHORT: Record<ContractName, string> = {
  'CRE Workflow':           'CRE',
  'SolvencyConsumer':       'Solvency',
  'MilestoneConsumer':      'Milestone',
  'TokenizedFundingEngine': 'Funding',
  'ReserveVerifier':        'Reserves',
}

export const HERO_EVENTS = new Set([
  'SolvencyUpdated',
  'RiskAlertTriggered',
  'RescueFundingInitiated',
  'RescueFundingActivated',
  'TrancheReleased',
  'InvestmentReceived',
  'FundsClaimedByInvestor',
  'RescuePremiumDeposited',
  'MilestoneCompleted',
  'MilestoneVerified',
  'ReservesVerified',
  'FundingEngineVerified',
  'FundingRoundCreated',
  'ReserveDeficitDetected',
])

/** Risk level enum matching Solidity */
const RISK_LABELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const

/** Contract name → address mapping used during event decoding */
export interface ContractAddressMap {
  solvencyConsumer: string
  milestoneConsumer: string
  fundingEngine: string
  reserveVerifier: string
}

// ── Event Decoding ───────────────────────────────────────────────────────

interface AbiEntry {
  name: ContractName
  abi: Abi
  address: string
}

/** Keys that are IDs/hashes, not amounts — don't format as ETH */
const ID_KEYS = new Set(['tokenId', 'id', 'roundId', 'messageId'])

function formatArg(key: string, value: unknown): string {
  if (typeof value === 'bigint') {
    // IDs should stay as numbers, not formatted as ETH
    if (ID_KEYS.has(key)) {
      const s = value.toString()
      return s.length > 12 ? `${s.slice(0, 8)}...` : s
    }
    // If it looks like a wei amount (>1e15), format as ETH
    if (value > 1_000_000_000_000_000n) return `${formatEther(value)} ETH`
    return value.toString()
  }
  if (typeof value === 'number') {
    // Risk level enum
    if (key === 'riskLevel' || key === 'risk') return RISK_LABELS[value] ?? String(value)
    // Verification status enum
    if (key === 'status') return ['UNVERIFIED', 'VERIFIED', 'DEFICIT'][value] ?? String(value)
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') {
    // Truncate long hex strings
    if (value.startsWith('0x') && value.length > 18) return `${value.slice(0, 10)}...`
    return value
  }
  return String(value)
}

/**
 * Decode all events from a transaction receipt across multiple contract ABIs.
 * Tries each ABI against each log, silently skipping unrecognized logs.
 */
export function decodeReceiptEvents(
  logs: Log[],
  abiEntries: AbiEntry[],
): DecodedEvent[] {
  const decoded: DecodedEvent[] = []

  for (const log of logs) {
    for (const entry of abiEntries) {
      // Only try decoding if the log address matches this contract
      if (log.address.toLowerCase() !== entry.address.toLowerCase()) continue
      try {
        const result = decodeEventLog({
          abi: entry.abi,
          data: log.data,
          topics: log.topics,
        })
        const eventName = result.eventName ?? 'Unknown'
        const args: Record<string, string> = {}
        if (result.args && typeof result.args === 'object') {
          for (const [k, v] of Object.entries(result.args as unknown as Record<string, unknown>)) {
            // Skip indexed bytes32 project IDs for cleaner display
            if (k === 'projectId') continue
            args[k] = formatArg(k, v)
          }
        }
        decoded.push({
          contract: entry.name,
          event: eventName,
          args,
          isHero: HERO_EVENTS.has(eventName),
        })
        break // matched this log, move to next
      } catch {
        // ABI doesn't match this log, try next
      }
    }
  }

  return decoded
}
