import { createPublicClient, http, type Address } from 'viem'
import { sepolia } from 'viem/chains'

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export function getClient(rpcUrl?: string) {
  return createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl ?? process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? 'https://eth-sepolia.g.alchemy.com/v2/demo'),
  })
}

// ---------------------------------------------------------------------------
// Addresses (updated by deploy scripts)
// ---------------------------------------------------------------------------

export const ADDRESSES = {
  solvencyConsumer: (process.env.NEXT_PUBLIC_SOLVENCY_ADDRESS ?? '0x0000000000000000000000000000000000000000') as Address,
  milestoneConsumer: (process.env.NEXT_PUBLIC_MILESTONE_ADDRESS ?? '0x0000000000000000000000000000000000000000') as Address,
  fundingEngine: (process.env.NEXT_PUBLIC_FUNDING_ADDRESS ?? '0x0000000000000000000000000000000000000000') as Address,
  reserveVerifier: (process.env.NEXT_PUBLIC_RESERVE_ADDRESS ?? '0x0000000000000000000000000000000000000000') as Address,
}

export const PROJECT_ID = '0x5265766974616c697a6174696f6e50726f746f636f6c000000000000000001' as `0x${string}`

// ---------------------------------------------------------------------------
// ABIs (minimal read-only subsets)
// ---------------------------------------------------------------------------

export const SOLVENCY_ABI = [
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
] as const

export const MILESTONE_ABI = [
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

export const FUNDING_ABI = [
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

export const RESERVE_ABI = [
  {
    name: 'getProjectVerification',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'projectId', type: 'bytes32' }],
    outputs: [
      { name: 'porReported', type: 'uint256' },
      { name: 'onchainBalance', type: 'uint256' },
      { name: 'claimed', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'reserveRatio', type: 'uint256' },
      { name: 'timestamp', type: 'uint64' },
    ],
  },
  {
    name: 'getEngineVerification',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'engine', type: 'address' },
      { name: 'contractBalance', type: 'uint256' },
      { name: 'reportedDeposits', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'timestamp', type: 'uint64' },
    ],
  },
] as const
