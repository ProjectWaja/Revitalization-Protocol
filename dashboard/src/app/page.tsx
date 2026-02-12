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
import { OceanwideScenarioPanel } from '@/components/OceanwideScenarioPanel'
import { TabNavigation } from '@/components/TabNavigation'
import { MetricsSummary } from '@/components/MetricsSummary'
import { NetworkStatusBar } from '@/components/NetworkStatusBar'
import { ContractDeploymentPanel } from '@/components/ContractDeploymentPanel'
import { useContractData, type ContractAddresses } from '@/hooks/useContractData'

export default function Dashboard() {
  const [addresses, setAddresses] = useState<ContractAddresses | null>(null)
  const [ccAddress, setCcAddress] = useState<string | null>(null)
  const { data, refresh } = useContractData(addresses)
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold">Oceanwide Plaza — Los Angeles</h1>
          <p className="text-gray-400 mt-1 text-base sm:text-lg">
            $1.2B Mixed-Use Development, DTLA — Real-time monitoring via Chainlink CRE
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {data.isLive ? (
            <span className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          ) : (
            <span className="flex items-center gap-2 text-sm text-gray-400 bg-gray-400/10 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              Waiting for Setup
            </span>
          )}
          {data.ethPrice > 0 && (
            <span className="text-sm text-gray-500 bg-gray-800 px-3 py-1 rounded font-mono">
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

      {/* Tab Navigation */}
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab Content — all tabs stay mounted to preserve state */}
      <div className="pt-2">
        <div className={activeTab === 'overview' ? 'space-y-6' : 'hidden'}>
          <NetworkStatusBar />
          <ContractDeploymentPanel />
          <OceanwideScenarioPanel
            addresses={addresses}
            onRefresh={refresh}
            onAddressesChange={setAddresses}
          />
          <MetricsSummary data={data} />
          <details className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <summary className="px-6 py-4 cursor-pointer text-sm text-gray-400 hover:text-gray-300 transition-colors select-none">
              Advanced Controls (manual contract interactions)
            </summary>
            <div className="px-6 pb-6">
              <DemoControlPanel
                onRefresh={refresh}
                onAddressesChange={setAddresses}
                addresses={addresses}
              />
            </div>
          </details>
        </div>

        <div className={activeTab === 'oracles' ? 'space-y-6' : 'hidden'}>
          <SolvencyPanel data={data.solvency} />
          <MilestonePanel milestones={data.milestones} />
        </div>

        <div className={activeTab === 'funding' ? 'space-y-6' : 'hidden'}>
          <FundingPanel rounds={data.rounds} ethPrice={data.ethPrice} />
          <ReservePanel data={data.reserves} ethPrice={data.ethPrice} />
        </div>

        <div className={activeTab === 'architecture' ? 'space-y-6' : 'hidden'}>
          <ArchitecturePanel />
          <WorkflowPanel data={data} />
          <ConfidentialComputePanel
            confidentialAddress={ccAddress}
            onDeploy={setCcAddress}
            onRefresh={refresh}
          />
        </div>
      </div>
    </div>
  )
}
