import type { ReserveData } from '@/hooks/useContractData'

function formatUsd(eth: number, ethPrice: number): string {
  if (ethPrice <= 0) return ''
  const usd = eth * ethPrice
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`
  return `$${usd.toFixed(0)}`
}

const VERIFICATION_STATUS = ['UNVERIFIED', 'VERIFIED', 'UNDER_RESERVED', 'STALE_DATA', 'FEED_UNAVAILABLE'] as const
const STATUS_STYLES: Record<string, string> = {
  VERIFIED: 'text-green-400 bg-green-400/10',
  UNDER_RESERVED: 'text-red-400 bg-red-400/10',
  STALE_DATA: 'text-yellow-400 bg-yellow-400/10',
  UNVERIFIED: 'text-gray-400 bg-gray-400/10',
  FEED_UNAVAILABLE: 'text-orange-400 bg-orange-400/10',
}
const STATUS_ICON: Record<string, string> = {
  VERIFIED: 'text-green-400',
  UNDER_RESERVED: 'text-red-400',
  STALE_DATA: 'text-yellow-400',
  UNVERIFIED: 'text-gray-500',
  FEED_UNAVAILABLE: 'text-orange-400',
}

function VerificationBadge({ status }: { status: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[status]}`}>
      <svg className={`w-3 h-3 ${STATUS_ICON[status]}`} viewBox="0 0 20 20" fill="currentColor">
        {status === 'VERIFIED' ? (
          <path fillRule="evenodd" d="M16.403 12.652a3 3 0 010-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
        ) : status === 'UNDER_RESERVED' ? (
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        ) : (
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
        )}
      </svg>
      {status}
    </div>
  )
}

export function ReservePanel({ data, ethPrice = 0 }: { data: ReserveData; ethPrice?: number }) {
  const pr = data.project
  const er = data.engine
  const projectStatus = VERIFICATION_STATUS[pr.status]
  const engineStatus = VERIFICATION_STATUS[er.status]

  // Compute coverage ratio for engine
  const coverageRatio = er.reportedDeposits > 0 ? (er.contractBalance / er.reportedDeposits) * 100 : 0

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
          <VerificationBadge status={projectStatus} />
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
          <h3 className="text-sm font-medium text-gray-400">Funding Engine Verification</h3>
          <VerificationBadge status={engineStatus} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-gray-400 text-xs">On-Chain Balance</div>
            <div className="text-lg font-bold font-mono">{er.contractBalance.toFixed(2)} ETH</div>
            {ethPrice > 0 && <div className="text-xs text-gray-500 font-mono">{formatUsd(er.contractBalance, ethPrice)}</div>}
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-gray-400 text-xs">Reported Deposits</div>
            <div className="text-lg font-bold font-mono">{er.reportedDeposits.toFixed(2)} ETH</div>
            {ethPrice > 0 && <div className="text-xs text-gray-500 font-mono">{formatUsd(er.reportedDeposits, ethPrice)}</div>}
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-gray-400 text-xs">Coverage</div>
            <div className={`text-lg font-bold ${coverageRatio >= 100 ? 'text-green-400' : 'text-red-400'}`}>
              {er.reportedDeposits > 0 ? `${coverageRatio.toFixed(0)}%` : '--'}
            </div>
          </div>
        </div>

        {/* Engine coverage bar */}
        {er.reportedDeposits > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Balance vs Deposits</span>
              <span className={`font-mono text-xs ${coverageRatio >= 100 ? 'text-green-400' : 'text-red-400'}`}>
                {coverageRatio >= 100 ? 'Fully Collateralized' : 'Under-Collateralized'}
              </span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden relative">
              <div
                className={`h-full rounded-full ${coverageRatio >= 100 ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(100, coverageRatio)}%` }}
              />
              <div className="absolute top-0 left-full w-0.5 h-full bg-white/20" style={{ left: '100%' }} />
            </div>
          </div>
        )}
      </div>

      {/* Verification Timestamps */}
      <div className="mt-4 pt-4 border-t border-gray-800">
        <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
          <div>
            <span className="text-gray-600">Project PoR: </span>
            {pr.timestamp > 0 ? new Date(pr.timestamp * 1000).toLocaleTimeString() : 'Not verified'}
          </div>
          <div>
            <span className="text-gray-600">Engine: </span>
            {er.timestamp > 0 ? new Date(er.timestamp * 1000).toLocaleTimeString() : 'Not verified'}
          </div>
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-2">
          <span>Chainlink Automation (4h interval)</span>
          <span>PoR + Data Feeds{ethPrice > 0 && ` (ETH $${ethPrice.toLocaleString()})`}</span>
        </div>
      </div>
    </div>
  )
}
