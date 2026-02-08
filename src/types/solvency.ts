/**
 * Revitalization Protocol — Solvency Types
 * Shared type definitions for the Real-Time Project Solvency Oracle
 */

export interface ProjectFinancials {
  projectId: string
  totalBudget: number        // Total project budget in USD
  capitalDeployed: number    // Capital already deployed
  capitalRemaining: number   // Remaining budget
  fundingVelocity: number    // Rate of new capital inflow (USD/month)
  burnRate: number           // Monthly expenditure rate
  monthsOfRunway: number     // capitalRemaining / burnRate
}

export interface CostIndexData {
  steelIndex: number         // Steel price index (normalized 0-100)
  concreteIndex: number      // Concrete price index
  laborIndex: number         // Labor cost index
  lumberIndex: number        // Lumber price index
  fuelIndex: number          // Fuel/energy index
  timestamp: number          // Unix timestamp of data fetch
}

export interface FundingMetrics {
  totalPledged: number       // Total committed funding
  totalReceived: number      // Actual received funding
  pledgeFulfillmentRate: number  // received / pledged (0-1)
  investorCount: number      // Number of active investors
  lastFundingDate: number    // Unix timestamp of last funding event
  daysSinceLastFunding: number
}

export interface SolvencyScore {
  projectId: string
  overallScore: number       // 0-100 (100 = fully solvent, 0 = critical)
  riskLevel: RiskLevel       // Enum: LOW, MEDIUM, HIGH, CRITICAL
  components: {
    financialHealth: number  // 0-100
    costExposure: number     // 0-100 (100 = stable costs, 0 = extreme inflation)
    fundingMomentum: number  // 0-100
    runwayAdequacy: number   // 0-100
  }
  timestamp: number
  confidential: boolean      // Whether computed inside Confidential Compute
}

export enum RiskLevel {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  CRITICAL = 3,
}

export interface AIRiskAssessment {
  riskNarrative: string      // Natural language risk summary
  topRisks: string[]         // Top 3 risk factors
  recommendation: string     // Suggested action
  confidenceScore: number    // 0-1 confidence in the assessment
  triggerRescueFunding: boolean  // Whether to initiate rescue funding workflow
}

export interface SolvencyReport {
  solvencyScore: SolvencyScore
  aiAssessment: AIRiskAssessment
  costIndices: CostIndexData
  fundingMetrics: FundingMetrics
  reportHash: string         // Keccak256 hash for onchain verification
}

/**
 * Onchain report struct — matches SolvencyConsumer.sol
 * Encoded as ABI for runtime.report()
 */
export interface OnchainSolvencyReport {
  projectId: string          // bytes32
  overallScore: number       // uint8 (0-100)
  riskLevel: number          // uint8 (0=LOW, 1=MED, 2=HIGH, 3=CRITICAL)
  financialHealth: number    // uint8
  costExposure: number       // uint8
  fundingMomentum: number    // uint8
  runwayAdequacy: number     // uint8
  triggerRescue: boolean     // bool — should we trigger rescue funding?
  timestamp: number          // uint64
}
