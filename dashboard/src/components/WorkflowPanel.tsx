import type { DashboardData } from '@/hooks/useContractData'

interface WorkflowDef {
  name: string
  schedule: string
  services: string[]
  target: string
  steps: string[]
  color: string
  borderColor: string
}

const WORKFLOWS: WorkflowDef[] = [
  {
    name: 'Solvency Oracle',
    schedule: 'Every 5 min',
    services: ['CRE', 'AI (Claude)', 'Data Feeds', 'Confidential Compute'],
    target: 'SolvencyConsumer',
    steps: [
      'Fetch cost indices (HTTP + median consensus)',
      'Read onchain financials (EVM, DON mode)',
      'Fetch funding metrics (HTTP + median consensus)',
      'Compute weighted score (Confidential Compute)',
      'AI risk assessment (Claude + identical consensus)',
      'Generate signed report + write onchain',
    ],
    color: 'bg-blue-500',
    borderColor: 'border-blue-500/30',
  },
  {
    name: 'Milestone Oracle',
    schedule: 'Weekly',
    services: ['CRE', 'Data Feeds', 'Confidential Compute'],
    target: 'MilestoneConsumer',
    steps: [
      'Fetch satellite imagery metadata (HTTP + median)',
      'Fetch permit status (HTTP + identical consensus)',
      'Read onchain milestone config (EVM, DON)',
      'Compute progress score (Confidential Compute)',
      'Rule-based approval decision',
      'Generate signed report + write onchain',
    ],
    color: 'bg-green-500',
    borderColor: 'border-green-500/30',
  },
  {
    name: 'Funding Engine',
    schedule: 'Every 10 min',
    services: ['CRE', 'Data Feeds', 'Confidential Compute'],
    target: 'TokenizedFundingEngine',
    steps: [
      'Read round state (EVM, DON mode, BFT)',
      'Read solvency score (cross-contract)',
      'Read milestone status (cross-contract)',
      'Compute funding health (Confidential Compute)',
      'Rule-based health evaluation',
      'Generate report + write onchain',
    ],
    color: 'bg-purple-500',
    borderColor: 'border-purple-500/30',
  },
]

function WorkflowCard({ workflow, lastTimestamp }: { workflow: WorkflowDef; lastTimestamp: number }) {
  const isActive = lastTimestamp > 0
  const timeSince = lastTimestamp > 0 ? Math.floor((Date.now() / 1000 - lastTimestamp) / 60) : -1

  return (
    <div className={`bg-gray-800/30 rounded-lg border ${workflow.borderColor} p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${workflow.color} ${isActive ? 'animate-pulse' : 'opacity-40'}`} />
          <h3 className="text-lg font-semibold">{workflow.name}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base text-gray-500 font-mono">{workflow.schedule}</span>
          {isActive && (
            <span className="text-base text-green-400 bg-green-400/10 px-2 py-0.5 rounded">Active</span>
          )}
        </div>
      </div>

      {/* Services */}
      <div className="flex flex-wrap gap-1.5">
        {workflow.services.map((s) => (
          <span key={s} className="text-sm px-2 py-0.5 bg-gray-700/50 text-gray-400 rounded">
            {s}
          </span>
        ))}
      </div>

      {/* Pipeline Steps */}
      <div className="space-y-1">
        {workflow.steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2 text-base">
            <span className="text-gray-600 font-mono w-4 text-right flex-shrink-0">{i + 1}.</span>
            <span className="text-gray-400">{step}</span>
          </div>
        ))}
      </div>

      {/* Target + Timing */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-700/30">
        <span className="text-base text-gray-500">
          Target: <span className="font-mono text-gray-400">{workflow.target}</span>
        </span>
        <span className="text-base text-gray-500">
          {timeSince >= 0 ? `${timeSince}m ago` : 'No data yet'}
        </span>
      </div>
    </div>
  )
}

export function WorkflowPanel({ data }: { data: DashboardData }) {
  // Derive last execution timestamps from contract data
  const solvencyTimestamp = data.solvency.timestamp
  const milestoneTimestamp = data.milestones.reduce((max, m) => {
    // Use the most recent milestone status change as proxy
    return m.progress > 0 ? Math.max(max, data.lastUpdated / 1000) : max
  }, 0)
  const fundingTimestamp = data.rounds.length > 0 ? data.lastUpdated / 1000 : 0

  const timestamps = [solvencyTimestamp, milestoneTimestamp, fundingTimestamp]

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">CRE Workflow Monitor</h2>
          <p className="text-lg text-gray-500 mt-1">Chainlink Runtime Environment — Multi-Step Oracle Pipelines</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base text-gray-500">
            {timestamps.filter((t) => t > 0).length}/3 active
          </span>
        </div>
      </div>

      {/* Workflow Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {WORKFLOWS.map((wf, i) => (
          <WorkflowCard key={wf.name} workflow={wf} lastTimestamp={timestamps[i]} />
        ))}
      </div>

      {/* CRE Consensus Explanation */}
      <div className="mt-6 pt-4 border-t border-gray-800">
        <h3 className="text-lg font-medium text-gray-400 mb-3">CRE Consensus Strategies</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-gray-800/30 rounded-lg p-4">
            <div className="text-base font-medium text-blue-400">Median Aggregation</div>
            <div className="text-base text-gray-500 mt-1">Numeric fields (costs, scores) — outlier-resistant</div>
          </div>
          <div className="bg-gray-800/30 rounded-lg p-4">
            <div className="text-base font-medium text-green-400">Identical Consensus</div>
            <div className="text-base text-gray-500 mt-1">Structured data (AI JSON, permits) — exact match</div>
          </div>
          <div className="bg-gray-800/30 rounded-lg p-4">
            <div className="text-base font-medium text-purple-400">DON Mode (BFT)</div>
            <div className="text-base text-gray-500 mt-1">On-chain reads — Byzantine fault tolerant</div>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-800 text-base text-gray-500 text-center">
        3 CRE Workflows — Compiled to WASM — Executed on Chainlink DON
      </div>
    </div>
  )
}
