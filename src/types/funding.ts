/**
 * Revitalization Protocol — Funding Engine Types
 * Shared type definitions for the Tokenized Funding Engine (Module 3)
 */

export enum RoundStatus {
  OPEN = 0,
  FUNDED = 1,
  RELEASING = 2,
  COMPLETED = 3,
  CANCELLED = 4,
}

export enum RoundType {
  STANDARD = 0,
  RESCUE = 1,
}

export interface FundingRound {
  projectId: string             // bytes32 project identifier
  roundId: number               // uint256 round identifier
  roundType: RoundType          // STANDARD or RESCUE
  status: RoundStatus           // Current round status
  targetAmount: number          // Target ETH to raise
  totalDeposited: number        // Total ETH deposited
  totalReleased: number         // Total ETH released via tranches
  tranches: TrancheConfig[]     // Milestone-gated tranche configuration
  deadline: number              // Unix timestamp deadline for funding
}

export interface InvestorPosition {
  investor: string              // Address of the investor
  tokenId: number               // ERC-1155 token ID
  amount: number                // ETH deposited
  claimed: number               // ETH claimed from released tranches
  sharePercent: number          // Pro-rata share (basis points, 0-10000)
}

export interface TrancheConfig {
  milestoneId: number           // uint8 milestone that gates this tranche
  basisPoints: number           // Share of total funds (0-10000, sum = 10000)
  released: boolean             // Whether this tranche has been released
}

export interface RescueFundingRequest {
  projectId: string             // bytes32 project identifier
  solvencyScore: number         // uint8 score that triggered rescue (0-100)
  estimatedTarget: number       // Estimated funding target in ETH
}

export interface OnchainFundingReport {
  projectId: string             // bytes32
  roundId: number               // uint256
  roundType: number             // uint8 (0=STANDARD, 1=RESCUE)
  status: number                // uint8 (0-4)
  totalDeposited: number        // uint256 (wei)
  totalReleased: number         // uint256 (wei)
  investorCount: number         // uint256
  concentrationRisk: number     // uint8 (0-100)
  velocityRisk: number          // uint8 (0-100)
  timestamp: number             // uint64
}

export interface FundingRiskAssessment {
  riskNarrative: string         // Natural language risk summary
  concentrationRisk: number     // 0-100 (100 = single investor dominates)
  velocityRisk: number          // 0-100 (100 = funding velocity stalled)
  recommendation: string        // Suggested action
  approveRelease: boolean       // Whether AI recommends tranche release
}

export interface CrossChainTransfer {
  messageId: string             // CCIP message ID (bytes32)
  sourceChain: string           // Source chain selector name
  destChain: string             // Destination chain selector name
  amount: number                // ETH amount transferred
  status: string                // 'pending' | 'confirmed' | 'failed'
}
