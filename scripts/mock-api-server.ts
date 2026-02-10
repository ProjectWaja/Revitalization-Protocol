/**
 * Revitalization Protocol — Mock API Server
 *
 * Serves fixture data for CRE workflow simulation. Provides all external
 * API endpoints that the solvency, milestone, and funding workflows call.
 *
 * Usage:
 *   bun run scripts/mock-api-server.ts
 *   bun run mock-api
 *
 * Endpoints:
 *   GET  /api/v1/cost-indices         — Commodity cost index data
 *   GET  /api/v1/funding-metrics      — Funding velocity & investor metrics
 *   GET  /api/v1/satellite-imagery    — Satellite/drone imagery data
 *   GET  /api/v1/permit-status        — Permit compliance data
 *   POST /api/v1/ai-risk-assessment   — Mock AI risk assessment (Claude proxy)
 *   POST /api/v1/ai-progress-assessment — Mock AI progress assessment
 *   GET  /health                      — Server health check
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const PORT = Number(process.env.MOCK_API_PORT ?? 3001)

// ---------------------------------------------------------------------------
// Load fixture data
// ---------------------------------------------------------------------------

const fixturesDir = join(import.meta.dir, '..', 'config', 'fixtures')

let satelliteData: any[]
let permitData: any[]

try {
  satelliteData = JSON.parse(readFileSync(join(fixturesDir, 'mock-satellite-data.json'), 'utf-8'))
  permitData = JSON.parse(readFileSync(join(fixturesDir, 'mock-permit-status.json'), 'utf-8'))
} catch (e) {
  console.error('Failed to load fixture data:', e)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Cost Index Data (simulates commodity price feeds)
// ---------------------------------------------------------------------------

function generateCostIndices() {
  // Simulate mild fluctuation around baseline values
  const jitter = () => Math.round((Math.random() - 0.5) * 6)
  return {
    steelIndex: 52 + jitter(),
    concreteIndex: 45 + jitter(),
    laborIndex: 61 + jitter(),
    lumberIndex: 38 + jitter(),
    fuelIndex: 55 + jitter(),
    timestamp: Math.floor(Date.now() / 1000),
    source: 'mock-commodity-api',
  }
}

// ---------------------------------------------------------------------------
// Funding Metrics (simulates funding velocity API)
// ---------------------------------------------------------------------------

function generateFundingMetrics(projectId?: string) {
  return {
    projectId: projectId ?? '0x5265766974616c697a6174696f6e50726f746f636f6c000000000000000001',
    totalPledged: 42_000_000,
    totalReceived: 36_500_000,
    pledgeFulfillmentRate: 0.869,
    investorCount: 14,
    lastFundingDate: Math.floor(Date.now() / 1000) - 3 * 86400, // 3 days ago
    daysSinceLastFunding: 3,
    averageInvestmentSize: 2_607_143,
    topInvestorShare: 0.18, // 18% concentration
  }
}

// ---------------------------------------------------------------------------
// Mock AI Responses (simulates Claude API structured output)
// ---------------------------------------------------------------------------

function generateAIRiskAssessment(body: any): any {
  // Parse the user message to extract score data for context-aware response
  const userMsg = body?.messages?.[0]?.content ?? ''
  const scoreMatch = userMsg.match(/Overall Score: (\d+)/)
  const overallScore = scoreMatch ? parseInt(scoreMatch[1]) : 75

  let riskNarrative: string
  let triggerRescue: boolean
  let recommendation: string

  if (overallScore >= 75) {
    riskNarrative = 'Project solvency remains healthy with strong financial fundamentals. Cost indices are within normal range and funding momentum is positive.'
    triggerRescue = false
    recommendation = 'Continue monitoring. No action required at this time.'
  } else if (overallScore >= 50) {
    riskNarrative = 'Project showing moderate financial stress. Funding velocity has slowed and some cost indices are elevated. Runway remains adequate but trending downward.'
    triggerRescue = false
    recommendation = 'Increase monitoring frequency. Engage with key stakeholders about funding timeline.'
  } else if (overallScore >= 25) {
    riskNarrative = 'Project at high risk. Significant funding shortfall detected with deteriorating cost exposure. Runway is critically low and rescue funding should be evaluated.'
    triggerRescue = false
    recommendation = 'Initiate stakeholder review. Prepare rescue funding parameters.'
  } else {
    riskNarrative = 'Critical solvency failure imminent. Capital reserves near exhaustion, funding has stalled, and cost overruns are accelerating. Immediate intervention required.'
    triggerRescue = true
    recommendation = 'Trigger rescue funding immediately. Halt non-essential expenditures.'
  }

  return {
    id: 'msg_mock_' + Date.now(),
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          riskNarrative,
          topRisks: [
            'Funding velocity decline',
            'Material cost inflation',
            'Contractor payment delays',
          ],
          recommendation,
          triggerRescue,
        }),
      },
    ],
    model: 'claude-sonnet-4-20250514',
    usage: { input_tokens: 350, output_tokens: 120 },
  }
}

function generateAIProgressAssessment(body: any): any {
  const userMsg = body?.messages?.[0]?.content ?? ''
  const progressMatch = userMsg.match(/Progress: (\d+)%/)
  const progress = progressMatch ? parseInt(progressMatch[1]) : 65

  return {
    id: 'msg_mock_' + Date.now(),
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          progressNarrative: `Satellite imagery confirms structural progress at approximately ${progress}%. Foundation work complete, steel framing advancing on schedule. Permit compliance rate is satisfactory with 4 of 5 permits approved.`,
          verifiedPercentage: progress,
          concerns: progress < 50
            ? ['Slow structural progress relative to timeline', 'Pending plumbing permit may cause delays']
            : ['Pending plumbing permit may cause minor delays'],
          recommendation: progress >= 80
            ? 'Milestone on track for completion. Continue current pace.'
            : 'Monitor progress closely. Follow up on pending plumbing permit.',
          approved: progress >= 70,
        }),
      },
    ],
    model: 'claude-sonnet-4-20250514',
    usage: { input_tokens: 400, output_tokens: 150 },
  }
}

function generateAIFundingRisk(body: any): any {
  const userMsg = body?.messages?.[0]?.content ?? ''
  const concentrationMatch = userMsg.match(/Concentration Risk: (\d+)/)
  const velocityMatch = userMsg.match(/Velocity Risk: (\d+)/)
  const concentration = concentrationMatch ? parseInt(concentrationMatch[1]) : 30
  const velocity = velocityMatch ? parseInt(velocityMatch[1]) : 25

  return {
    id: 'msg_mock_' + Date.now(),
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          riskNarrative: 'Funding round is progressing well with healthy investor diversification. Velocity metrics indicate sustained interest. Tranche release conditions are being met on schedule.',
          concentrationRisk: concentration,
          velocityRisk: velocity,
          recommendation: 'Approve next tranche release upon milestone verification.',
          approveRelease: concentration < 70 && velocity < 60,
        }),
      },
    ],
    model: 'claude-sonnet-4-20250514',
    usage: { input_tokens: 380, output_tokens: 130 },
  }
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

function handleRequest(req: Request): Response {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  console.log(`${method} ${path}`)

  // Health check
  if (path === '/health') {
    return Response.json({
      status: 'ok',
      service: 'revitalization-protocol-mock-api',
      timestamp: new Date().toISOString(),
      endpoints: [
        '/api/v1/cost-indices',
        '/api/v1/funding-metrics',
        '/api/v1/satellite-imagery',
        '/api/v1/permit-status',
        '/api/v1/ai-risk-assessment',
        '/api/v1/ai-progress-assessment',
      ],
    })
  }

  // Cost indices
  if (path === '/api/v1/cost-indices' && method === 'GET') {
    return Response.json(generateCostIndices())
  }

  // Funding metrics
  if (path === '/api/v1/funding-metrics' && method === 'GET') {
    const projectId = url.searchParams.get('projectId') ?? undefined
    return Response.json(generateFundingMetrics(projectId))
  }

  // Satellite imagery
  if (path === '/api/v1/satellite-imagery' && method === 'GET') {
    return Response.json(satelliteData)
  }

  // Permit status
  if (path === '/api/v1/permit-status' && method === 'GET') {
    return Response.json(permitData)
  }

  // AI Risk Assessment (mimics Claude API format)
  if ((path === '/api/v1/ai-risk-assessment' || path === '/v1/messages') && method === 'POST') {
    return req.json().then((body: any) => {
      const userMsg = body?.messages?.[0]?.content ?? ''

      // Route to appropriate mock based on content
      if (userMsg.includes('funding risk analyst') || userMsg.includes('Concentration Risk')) {
        return Response.json(generateAIFundingRisk(body))
      } else if (userMsg.includes('milestone') || userMsg.includes('progress analyst')) {
        return Response.json(generateAIProgressAssessment(body))
      } else {
        return Response.json(generateAIRiskAssessment(body))
      }
    })
  }

  // AI Progress Assessment
  if (path === '/api/v1/ai-progress-assessment' && method === 'POST') {
    return req.json().then((body: any) => {
      return Response.json(generateAIProgressAssessment(body))
    })
  }

  // 404
  return Response.json(
    { error: 'Not found', path, availableEndpoints: '/health' },
    { status: 404 },
  )
}

// ---------------------------------------------------------------------------
// Server Start
// ---------------------------------------------------------------------------

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
})

console.log('='.repeat(60))
console.log('Revitalization Protocol — Mock API Server')
console.log('='.repeat(60))
console.log(`\nListening on http://localhost:${server.port}`)
console.log(`\nEndpoints:`)
console.log(`  GET  http://localhost:${server.port}/api/v1/cost-indices`)
console.log(`  GET  http://localhost:${server.port}/api/v1/funding-metrics`)
console.log(`  GET  http://localhost:${server.port}/api/v1/satellite-imagery`)
console.log(`  GET  http://localhost:${server.port}/api/v1/permit-status`)
console.log(`  POST http://localhost:${server.port}/v1/messages              (Claude API mock)`)
console.log(`  GET  http://localhost:${server.port}/health`)
console.log(`\nUpdate your config files to use http://localhost:${server.port}`)
console.log(`Press Ctrl+C to stop.\n`)
