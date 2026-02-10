'use client'

import { SolvencyPanel } from '@/components/SolvencyPanel'
import { MilestonePanel } from '@/components/MilestonePanel'
import { FundingPanel } from '@/components/FundingPanel'
import { ReservePanel } from '@/components/ReservePanel'
import { ArchitecturePanel } from '@/components/ArchitecturePanel'
import { useContractData } from '@/hooks/useContractData'

export default function Dashboard() {
  const data = useContractData()

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Project Dashboard</h1>
          <p className="text-gray-400 mt-1">
            Chicago Mixed-Use Infrastructure — Real-time monitoring via Chainlink CRE
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data.isLive ? (
            <span className="flex items-center gap-2 text-xs text-green-400 bg-green-400/10 px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          ) : (
            <span className="flex items-center gap-2 text-xs text-gray-400 bg-gray-400/10 px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              Demo Data
            </span>
          )}
          {data.error && (
            <span className="text-xs text-red-400">{data.error}</span>
          )}
        </div>
      </div>

      {/* Top Row: Solvency + Reserves */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SolvencyPanel data={data.solvency} />
        <ReservePanel data={data.reserves} />
      </div>

      {/* Middle Row: Milestones */}
      <MilestonePanel milestones={data.milestones} />

      {/* Bottom Row: Funding */}
      <FundingPanel rounds={data.rounds} />

      {/* Architecture Overview */}
      <ArchitecturePanel />
    </div>
  )
}
