import type { DashboardData } from '@/hooks/useContractData'

const RISK_LABELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
const RISK_COLORS: Record<string, { text: string; bg: string }> = {
  LOW: { text: 'text-green-400', bg: 'bg-green-400/10' },
  MEDIUM: { text: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  HIGH: { text: 'text-orange-400', bg: 'bg-orange-400/10' },
  CRITICAL: { text: 'text-red-400', bg: 'bg-red-400/10' },
}

const VERIFICATION_STATUS = ['UNVERIFIED', 'VERIFIED', 'UNDER_RESERVED', 'STALE_DATA', 'FEED_UNAVAILABLE'] as const

export function MetricsSummary({ data }: { data: DashboardData }) {
  const risk = RISK_LABELS[data.solvency.riskLevel] ?? 'LOW'
  const riskColor = RISK_COLORS[risk]

  const completedMilestones = data.milestones.filter((m) => m.progress === 100 && m.approved).length
  const totalMilestones = data.milestones.length
  const milestonePercent = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0

  const totalRaised = data.rounds.reduce((sum, r) => sum + r.totalDeposited, 0)
  const totalTarget = data.rounds.reduce((sum, r) => sum + r.targetAmount, 0)

  const engineStatus = VERIFICATION_STATUS[data.reserves.engine.status] ?? 'UNVERIFIED'
  const coverageRatio = data.reserves.engine.reportedDeposits > 0
    ? (data.reserves.engine.contractBalance / data.reserves.engine.reportedDeposits) * 100
    : 0

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Solvency Score */}
      <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
        <div className="text-base text-gray-400 mb-1">Solvency Score</div>
        <div className="flex items-end gap-3">
          <span className={`text-4xl font-bold font-mono ${
            data.solvency.overallScore >= 75 ? 'text-green-400' :
            data.solvency.overallScore >= 50 ? 'text-yellow-400' :
            data.solvency.overallScore >= 25 ? 'text-orange-400' : 'text-red-400'
          }`}>
            {data.solvency.overallScore}
          </span>
          <span className={`text-base font-medium px-2 py-0.5 rounded ${riskColor.text} ${riskColor.bg} mb-1`}>
            {risk}
          </span>
        </div>
        <div className="text-base text-gray-500 mt-2">
          {data.solvency.rescueTriggered ? 'Rescue triggered' : 'Normal operations'}
        </div>
      </div>

      {/* Milestone Progress */}
      <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
        <div className="text-base text-gray-400 mb-1">Milestone Progress</div>
        <div className="text-4xl font-bold font-mono text-white">
          {completedMilestones}/{totalMilestones}
        </div>
        <div className="mt-2">
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${milestonePercent === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${milestonePercent}%` }}
            />
          </div>
          <div className="text-base text-gray-500 mt-1">{milestonePercent.toFixed(0)}% complete</div>
        </div>
      </div>

      {/* Funding Status */}
      <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
        <div className="text-base text-gray-400 mb-1">Funding Status</div>
        <div className="text-4xl font-bold font-mono text-white">
          {totalRaised.toFixed(1)}
          <span className="text-lg text-gray-500"> ETH</span>
        </div>
        <div className="text-base text-gray-500 mt-2">
          {totalTarget > 0 ? `${((totalRaised / totalTarget) * 100).toFixed(0)}% of ${totalTarget.toFixed(1)} ETH target` : 'No rounds active'}
          {data.rounds.length > 0 && ` — ${data.rounds.length} round${data.rounds.length !== 1 ? 's' : ''}`}
        </div>
      </div>

      {/* Reserve Coverage */}
      <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
        <div className="text-base text-gray-400 mb-1">Reserve Coverage</div>
        <div className={`text-4xl font-bold font-mono ${
          coverageRatio >= 100 ? 'text-green-400' : coverageRatio > 0 ? 'text-red-400' : 'text-gray-500'
        }`}>
          {coverageRatio > 0 ? `${coverageRatio.toFixed(0)}%` : '--'}
        </div>
        <div className="text-base text-gray-500 mt-2">
          {engineStatus === 'VERIFIED' ? 'Fully verified' :
           engineStatus === 'UNDER_RESERVED' ? 'Under-reserved' :
           'Awaiting verification'}
        </div>
      </div>
    </div>
  )
}
