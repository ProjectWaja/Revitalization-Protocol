import type { ReserveData } from '@/hooks/useContractData'

const VERIFICATION_STATUS = ['UNVERIFIED', 'VERIFIED', 'UNDER_RESERVED', 'STALE_DATA', 'FEED_UNAVAILABLE'] as const
const STATUS_STYLES: Record<string, string> = {
  VERIFIED: 'text-green-400 bg-green-400/10',
  UNDER_RESERVED: 'text-red-400 bg-red-400/10',
  STALE_DATA: 'text-yellow-400 bg-yellow-400/10',
  UNVERIFIED: 'text-gray-400 bg-gray-400/10',
  FEED_UNAVAILABLE: 'text-orange-400 bg-orange-400/10',
}

export function ReservePanel({ data }: { data: ReserveData }) {
  const pr = data.project
  const er = data.engine
  const projectStatus = VERIFICATION_STATUS[pr.status]
  const engineStatus = VERIFICATION_STATUS[er.status]

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Proof of Reserves</h2>
        <span className="text-sm text-gray-400">Chainlink PoR</span>
      </div>

      {/* Project Reserves */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-400">Project Reserve Verification</h3>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[projectStatus]}`}>
            {projectStatus}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-gray-400 text-xs">Claimed Reserves</div>
            <div className="text-lg font-bold font-mono">${(pr.claimed / 1e6).toFixed(0)}M</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-gray-400 text-xs">PoR Verified</div>
            <div className="text-lg font-bold font-mono">${(pr.porReported / 1e6).toFixed(1)}M</div>
          </div>
        </div>

        {/* Reserve Ratio Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Reserve Ratio</span>
            <span className={`font-mono ${pr.reserveRatio >= 8000 ? 'text-green-400' : 'text-red-400'}`}>
              {(pr.reserveRatio / 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden relative">
            <div
              className={`h-full rounded-full ${pr.reserveRatio >= 8000 ? 'bg-green-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(100, pr.reserveRatio / 100)}%` }}
            />
            {/* 80% threshold marker */}
            <div className="absolute top-0 left-[80%] w-0.5 h-full bg-yellow-400/50" />
          </div>
          <div className="text-xs text-gray-500 text-right">Min threshold: 80%</div>
        </div>
      </div>

      {/* Funding Engine Reserves */}
      <div className="space-y-4 pt-4 border-t border-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-400">Funding Engine Self-Verification</h3>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[engineStatus]}`}>
            {engineStatus}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-gray-400 text-xs">Contract ETH</div>
            <div className="text-lg font-bold font-mono">{er.contractBalance.toFixed(1)}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-gray-400 text-xs">Reported</div>
            <div className="text-lg font-bold font-mono">{er.reportedDeposits.toFixed(1)}</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-gray-400 text-xs">Match</div>
            <div className={`text-lg font-bold ${er.contractBalance >= er.reportedDeposits ? 'text-green-400' : 'text-red-400'}`}>
              {er.contractBalance >= er.reportedDeposits ? 'Yes' : 'No'}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between text-xs text-gray-500">
        <span>Updated {pr.timestamp > 0 ? `${Math.floor((Date.now() / 1000 - pr.timestamp) / 60)}m ago` : '--'}</span>
        <span>Chainlink Proof of Reserves</span>
      </div>
    </div>
  )
}
