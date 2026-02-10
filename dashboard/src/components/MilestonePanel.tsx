import type { MilestoneData } from '@/hooks/useContractData'

const STATUS_COLORS: Record<string, string> = {
  VERIFIED: 'text-green-400',
  IN_PROGRESS: 'text-blue-400',
  NOT_STARTED: 'text-gray-500',
  DISPUTED: 'text-red-400',
}

export function MilestonePanel({ milestones }: { milestones: MilestoneData[] }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Milestone Oracle</h2>
        <span className="text-sm text-gray-400">Satellite + Drone + Permit Verification</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {milestones.map((m) => (
          <div key={m.id} className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-400">Milestone {m.id}</span>
              <span className={`text-xs font-medium ${STATUS_COLORS[m.status] ?? 'text-gray-500'}`}>
                {m.status.replace('_', ' ')}
              </span>
            </div>
            <h3 className="text-sm font-medium mb-3">{m.name}</h3>

            {/* Progress bar */}
            <div className="space-y-1 mb-3">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Progress</span>
                <span className="font-mono">{m.progress}%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    m.progress === 100 ? 'bg-green-500' : m.progress > 0 ? 'bg-blue-500' : 'bg-gray-600'
                  }`}
                  style={{ width: `${m.progress}%` }}
                />
              </div>
            </div>

            {/* Score */}
            {m.score > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Verification</span>
                <span className={`font-mono ${m.score >= 70 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {m.score}/100
                </span>
              </div>
            )}

            {/* Tranche indicator */}
            <div className="mt-3 pt-3 border-t border-gray-700">
              <div className="flex items-center gap-2 text-xs">
                <div className={`w-2 h-2 rounded-full ${m.approved && m.progress === 100 ? 'bg-green-500' : 'bg-gray-600'}`} />
                <span className="text-gray-400">
                  Tranche: {m.approved && m.progress === 100 ? 'Released' : 'Locked'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between text-xs text-gray-500">
        <span>{milestones.length} milestones configured</span>
        <span>Chainlink CRE (Rule-Based Verification)</span>
      </div>
    </div>
  )
}
