import type { RoundData } from '@/hooks/useContractData'

const ROUND_STATUS = ['OPEN', 'FUNDED', 'RELEASING', 'COMPLETED', 'CANCELLED'] as const
const STATUS_COLORS: Record<string, string> = {
  OPEN: 'text-blue-400 bg-blue-400/10',
  FUNDED: 'text-green-400 bg-green-400/10',
  RELEASING: 'text-yellow-400 bg-yellow-400/10',
  COMPLETED: 'text-emerald-400 bg-emerald-400/10',
  CANCELLED: 'text-red-400 bg-red-400/10',
}

function formatUsd(eth: number, ethPrice: number): string {
  if (ethPrice <= 0) return ''
  const usd = eth * ethPrice
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`
  return `$${usd.toFixed(0)}`
}

function RoundCard({ round, ethPrice }: { round: RoundData; ethPrice: number }) {
  const status = ROUND_STATUS[round.status]
  const daysLeft = Math.max(0, Math.floor((round.deadline - Date.now() / 1000) / 86400))
  const fundingProgress = round.targetAmount > 0 ? (round.totalDeposited / round.targetAmount) * 100 : 0
  const releaseProgress = round.totalDeposited > 0 ? (round.totalReleased / round.totalDeposited) * 100 : 0

  return (
    <div className="bg-gray-800/30 rounded-lg p-5 border border-gray-700/50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-medium">Round #{round.roundId}</h3>
          <span className="text-base text-gray-500">{round.roundType}</span>
          {round.roundType === 'RESCUE' && round.rescuePremiumBps > 0 && (
            <span className="text-base font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
              +{(round.rescuePremiumBps / 100).toFixed(0)}% Bonus
            </span>
          )}
        </div>
        <span className={`px-3 py-1 rounded-full text-base font-medium ${STATUS_COLORS[status]}`}>
          {status}
        </span>
      </div>

      {/* Premium Pool Info */}
      {round.roundType === 'RESCUE' && round.rescuePremiumBps > 0 && round.premiumPool > 0 && (
        <div className="mb-4 bg-amber-400/5 border border-amber-400/20 rounded-lg p-3 flex items-center justify-between">
          <span className="text-base text-amber-300">Rescue Premium Pool</span>
          <span className="text-lg font-mono text-amber-400">{round.premiumPool.toFixed(2)} ETH</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Round Overview */}
        <div className="space-y-4">
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-lg mb-1">
                <span className="text-gray-400">Funding Progress</span>
                <span className="font-mono">
                  {round.totalDeposited.toFixed(1)}/{round.targetAmount.toFixed(1)} ETH
                  {ethPrice > 0 && <span className="text-gray-500 ml-1">({formatUsd(round.totalDeposited, ethPrice)})</span>}
                </span>
              </div>
              <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, fundingProgress)}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-lg mb-1">
                <span className="text-gray-400">Tranche Release</span>
                <span className="font-mono">
                  {round.totalReleased.toFixed(1)}/{round.totalDeposited.toFixed(1)} ETH
                  {ethPrice > 0 && <span className="text-gray-500 ml-1">({formatUsd(round.totalReleased, ethPrice)})</span>}
                </span>
              </div>
              <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, releaseProgress)}%` }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-lg">
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-gray-400 text-base">Investors</div>
              <div className="text-2xl font-bold font-mono">{round.investorCount}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-gray-400 text-base">Days Left</div>
              <div className="text-2xl font-bold font-mono">{daysLeft}</div>
            </div>
          </div>
        </div>

        {/* Tranche Schedule */}
        <div className="space-y-4 lg:col-span-2">
          <h4 className="text-lg font-medium text-gray-400">Tranche Schedule</h4>
          <div className="space-y-2">
            {round.tranches.map((t, i) => (
              <div key={i} className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${t.released ? 'bg-green-500' : 'bg-gray-600'}`} />
                <div className="flex-1 text-lg">
                  <span className="text-gray-300">Milestone {t.milestoneId}</span>
                </div>
                <div className="text-lg font-mono text-gray-400">{(t.basisPoints / 100).toFixed(0)}%</div>
                <span className={`text-base ${t.released ? 'text-green-400' : 'text-gray-500'}`}>
                  {t.released ? 'Released' : 'Locked'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function FundingPanel({ rounds, ethPrice = 0 }: { rounds: RoundData[]; ethPrice?: number }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Tokenized Funding Engine</h2>
          {ethPrice > 0 && (
            <span className="text-lg text-gray-500">ETH/USD: ${ethPrice.toLocaleString()} via Chainlink Data Feed</span>
          )}
        </div>
        <span className="text-base text-gray-400">{rounds.length} round{rounds.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-4">
        {rounds.map((round) => (
          <RoundCard key={round.roundId} round={round} ethPrice={ethPrice} />
        ))}
        {rounds.length === 0 && (
          <div className="text-center text-gray-500 py-8">No funding rounds created yet</div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between text-base text-gray-500">
        <span>ERC-1155 Position Tokens</span>
        <span>Chainlink Data Feeds + CCIP</span>
      </div>
    </div>
  )
}
