/**
 * Revitalization Protocol — Risk Scoring Engine
 * Pure functions for computing solvency scores from raw data.
 * Designed to be wrapped in Confidential Compute when CC SDK is available.
 */

import type {
  ProjectFinancials,
  CostIndexData,
  FundingMetrics,
  SolvencyScore,
  RiskLevel,
} from '../types/solvency'

// =============================================================================
// Scoring Weights — tunable parameters for different project profiles
// =============================================================================
const WEIGHTS = {
  financialHealth: 0.35,
  costExposure: 0.20,
  fundingMomentum: 0.25,
  runwayAdequacy: 0.20,
} as const

// =============================================================================
// Component Scorers
// =============================================================================

/**
 * Financial Health Score (0-100)
 * Measures how well the project's capital position supports completion.
 */
export function scoreFinancialHealth(financials: ProjectFinancials): number {
  const deploymentRatio = financials.capitalDeployed / financials.totalBudget
  const remainingRatio = financials.capitalRemaining / financials.totalBudget

  // Healthy: 30-80% deployed with proportional remaining
  let score = 100

  // Penalty: very low deployment (stalled) or very high (cost overrun risk)
  if (deploymentRatio < 0.1) score -= 30  // Hasn't started meaningfully
  if (deploymentRatio > 0.9 && remainingRatio < 0.05) score -= 40  // Nearly out

  // Burn rate vs. velocity check
  if (financials.burnRate > 0) {
    const sustainabilityRatio = financials.fundingVelocity / financials.burnRate
    if (sustainabilityRatio < 0.5) score -= 30      // Burning 2x faster than funding
    else if (sustainabilityRatio < 0.8) score -= 15  // Moderate concern
    else if (sustainabilityRatio > 1.2) score += 10  // Healthy surplus
  }

  return clamp(score, 0, 100)
}

/**
 * Cost Exposure Score (0-100)
 * Measures vulnerability to material/labor cost inflation.
 * 100 = costs stable/declining, 0 = extreme inflation pressure.
 */
export function scoreCostExposure(costs: CostIndexData): number {
  // Baseline: assume index 50 is "normal". Higher = more expensive = worse.
  const avgIndex =
    (costs.steelIndex + costs.concreteIndex + costs.laborIndex +
     costs.lumberIndex + costs.fuelIndex) / 5

  // Score inversely proportional to cost index
  // Index 30-50: score 70-100 (favorable)
  // Index 50-70: score 40-70 (moderate)
  // Index 70-100: score 0-40 (critical)
  const score = Math.max(0, 100 - (avgIndex - 30) * (100 / 70))

  return clamp(Math.round(score), 0, 100)
}

/**
 * Funding Momentum Score (0-100)
 * Measures investor confidence and capital flow health.
 */
export function scoreFundingMomentum(funding: FundingMetrics): number {
  let score = 50 // Start neutral

  // Pledge fulfillment: investors delivering on commitments
  score += (funding.pledgeFulfillmentRate - 0.5) * 40  // -20 to +20

  // Investor diversity: more investors = more resilient
  if (funding.investorCount >= 10) score += 15
  else if (funding.investorCount >= 5) score += 10
  else if (funding.investorCount <= 2) score -= 15

  // Recency of funding: stale funding signals abandonment
  if (funding.daysSinceLastFunding <= 7) score += 15
  else if (funding.daysSinceLastFunding <= 30) score += 5
  else if (funding.daysSinceLastFunding > 90) score -= 25
  else if (funding.daysSinceLastFunding > 60) score -= 15

  return clamp(Math.round(score), 0, 100)
}

/**
 * Runway Adequacy Score (0-100)
 * How many months of operation can the project sustain?
 */
export function scoreRunwayAdequacy(financials: ProjectFinancials): number {
  const months = financials.monthsOfRunway

  if (months >= 24) return 100
  if (months >= 12) return 80
  if (months >= 6) return 60
  if (months >= 3) return 40
  if (months >= 1) return 20
  return 5 // Less than 1 month = near-death
}

// =============================================================================
// Composite Scorer
// =============================================================================

/**
 * Compute the full solvency score from all data sources.
 * This is the function that will run inside Confidential Compute.
 */
export function computeSolvencyScore(
  projectId: string,
  financials: ProjectFinancials,
  costs: CostIndexData,
  funding: FundingMetrics,
  timestamp: number,
): SolvencyScore {
  const financialHealth = scoreFinancialHealth(financials)
  const costExposure = scoreCostExposure(costs)
  const fundingMomentum = scoreFundingMomentum(funding)
  const runwayAdequacy = scoreRunwayAdequacy(financials)

  const overallScore = Math.round(
    financialHealth * WEIGHTS.financialHealth +
    costExposure * WEIGHTS.costExposure +
    fundingMomentum * WEIGHTS.fundingMomentum +
    runwayAdequacy * WEIGHTS.runwayAdequacy,
  )

  const riskLevel = deriveRiskLevel(overallScore)

  return {
    projectId,
    overallScore,
    riskLevel,
    components: {
      financialHealth,
      costExposure,
      fundingMomentum,
      runwayAdequacy,
    },
    timestamp,
    confidential: false, // Will be true when CC is active
  }
}

/**
 * Map overall score to a risk level enum.
 */
export function deriveRiskLevel(score: number): RiskLevel {
  if (score >= 75) return 0 // LOW
  if (score >= 50) return 1 // MEDIUM
  if (score >= 25) return 2 // HIGH
  return 3                  // CRITICAL
}

// =============================================================================
// Helpers
// =============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
