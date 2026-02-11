import type { SolvencyData } from '@/hooks/useContractData'

function formatFinancial(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`
  return value.toFixed(1)
}

const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
const RISK_COLORS = {
  LOW: 'text-green-400 bg-green-400/10',
  MEDIUM: 'text-yellow-400 bg-yellow-400/10',
  HIGH: 'text-orange-400 bg-orange-400/10',
  CRITICAL: 'text-red-400 bg-red-400/10',
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-lg">
        <span className="text-gray-400">{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export function SolvencyPanel({ data }: { data: SolvencyData }) {
  const d = data
  const risk = RISK_LEVELS[d.riskLevel]

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">Solvency Oracle</h2>
        <span className={`px-3 py-1 rounded-full text-base font-medium ${RISK_COLORS[risk]}`}>
          {risk} RISK
        </span>
      </div>

      {/* Big Score */}
      <div className="flex items-center gap-6 mb-6">
        <div className="relative w-24 h-24">
          <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1f2937" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15.5" fill="none"
              stroke={d.overallScore >= 75 ? '#4ade80' : d.overallScore >= 50 ? '#facc15' : d.overallScore >= 25 ? '#fb923c' : '#f87171'}
              strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${d.overallScore * 0.975} 100`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-3xl font-bold font-mono">{d.overallScore}</span>
          </div>
        </div>
        <div className="space-y-1.5 text-lg">
          <div className="text-gray-400">Budget: <span className="text-white">${formatFinancial(d.financials.totalBudget)}</span></div>
          <div className="text-gray-400">Deployed: <span className="text-white">${formatFinancial(d.financials.capitalDeployed)}</span></div>
          <div className="text-gray-400">Remaining: <span className="text-white">${formatFinancial(d.financials.capitalRemaining)}</span></div>
          <div className="text-gray-400">Runway: <span className="text-white">{d.financials.burnRate > 0 ? (d.financials.capitalRemaining / d.financials.burnRate).toFixed(0) : '--'} months</span></div>
        </div>
      </div>

      {/* Component Bars */}
      <div className="space-y-3">
        <ScoreBar label="Financial Health" value={d.financialHealth} color="bg-blue-500" />
        <ScoreBar label="Cost Exposure" value={d.costExposure} color="bg-purple-500" />
        <ScoreBar label="Funding Momentum" value={d.fundingMomentum} color="bg-cyan-500" />
        <ScoreBar label="Runway Adequacy" value={d.runwayAdequacy} color="bg-emerald-500" />
      </div>

      <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between text-base text-gray-500">
        <span>Updated {d.timestamp > 0 ? `${Math.floor((Date.now() / 1000 - d.timestamp) / 60)}m ago` : '--'}</span>
        <span>Chainlink CRE + AI</span>
      </div>
    </div>
  )
}
