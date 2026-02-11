'use client'

import { useState } from 'react'
import { SolvencyPanel } from '@/components/SolvencyPanel'
import { MilestonePanel } from '@/components/MilestonePanel'
import { FundingPanel } from '@/components/FundingPanel'
import { ReservePanel } from '@/components/ReservePanel'
import { ArchitecturePanel } from '@/components/ArchitecturePanel'
import { WorkflowPanel } from '@/components/WorkflowPanel'
import { ConfidentialComputePanel } from '@/components/ConfidentialComputePanel'
import { DemoControlPanel } from '@/components/DemoControlPanel'
import { useContractData, type ContractAddresses } from '@/hooks/useContractData'

export default function Dashboard() {
  const [addresses, setAddresses] = useState<ContractAddresses | null>(null)
  const [ccAddress, setCcAddress] = useState<string | null>(null)
  const { data, refresh } = useContractData(addresses)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Project Dashboard</h1>
          <p className="text-gray-400 mt-1 text-sm sm:text-base">
            Chicago Mixed-Use Infrastructure — Real-time monitoring via Chainlink CRE
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {data.isLive ? (
            <span className="flex items-center gap-2 text-xs text-green-400 bg-green-400/10 px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          ) : (
            <span className="flex items-center gap-2 text-xs text-gray-400 bg-gray-400/10 px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              Waiting for Setup
            </span>
          )}
          {data.ethPrice > 0 && (
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded font-mono">
              ETH ${data.ethPrice.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {data.error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <svg className="w-5 h-5 text-red-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <span className="text-sm text-red-300">{data.error}</span>
        </div>
      )}

      {/* Demo Controls */}
      <DemoControlPanel
        onRefresh={refresh}
        onAddressesChange={setAddresses}
        addresses={addresses}
      />

      {/* Top Row: Solvency + Reserves */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SolvencyPanel data={data.solvency} />
        <ReservePanel data={data.reserves} ethPrice={data.ethPrice} />
      </div>

      {/* Middle Row: Milestones */}
      <MilestonePanel milestones={data.milestones} />

      {/* Bottom Row: Funding */}
      <FundingPanel rounds={data.rounds} ethPrice={data.ethPrice} />

      {/* Confidential Compute */}
      <ConfidentialComputePanel
        confidentialAddress={ccAddress}
        onDeploy={setCcAddress}
        onRefresh={refresh}
      />

      {/* CRE Workflow Monitor */}
      <WorkflowPanel data={data} />

      {/* Architecture Overview */}
      <ArchitecturePanel />
    </div>
  )
}
