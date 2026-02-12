'use client'

import { ADDRESSES, IS_TENDERLY, TENDERLY_EXPLORER } from '@/lib/contracts'
import { CONTRACT_COLORS, type ContractName } from '@/lib/chain-events'

interface ContractInfo {
  name: ContractName
  label: string
  address: string
  description: string
  chainlinkServices: string[]
}

const CONTRACTS: ContractInfo[] = [
  {
    name: 'SolvencyConsumer',
    label: 'Solvency Oracle',
    address: ADDRESSES.solvencyConsumer,
    description: 'AI-powered risk assessment via CRE + Claude',
    chainlinkServices: ['CRE', 'AI Agent', 'Data Feeds'],
  },
  {
    name: 'MilestoneConsumer',
    label: 'Milestone Oracle',
    address: ADDRESSES.milestoneConsumer,
    description: 'Rule-based milestone verification + tranche gating',
    chainlinkServices: ['CRE', 'Data Feeds'],
  },
  {
    name: 'TokenizedFundingEngine',
    label: 'Funding Engine',
    address: ADDRESSES.fundingEngine,
    description: 'ERC-1155 tokenized bonds, CCIP cross-chain, rescue funding',
    chainlinkServices: ['CCIP', 'Automation', 'Data Feeds'],
  },
  {
    name: 'ReserveVerifier',
    label: 'Reserve Verifier',
    address: ADDRESSES.reserveVerifier,
    description: 'Proof of Reserves + Automation-driven verification',
    chainlinkServices: ['PoR', 'Automation', 'Data Feeds'],
  },
]

function getTenderlyContractUrl(address: string): string {
  if (!TENDERLY_EXPLORER) return ''
  return `${TENDERLY_EXPLORER}/contract/${address}`
}

export function ContractDeploymentPanel() {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Deployed Contracts</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {IS_TENDERLY ? 'Live on Tenderly Virtual TestNet (Sepolia fork)' : 'Contract addresses'}
          </p>
        </div>
        {IS_TENDERLY && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-purple-400 bg-purple-400/10 px-3 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            Tenderly
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-800">
        {CONTRACTS.map((contract) => {
          const colors = CONTRACT_COLORS[contract.name]
          const explorerUrl = getTenderlyContractUrl(contract.address)

          return (
            <div key={contract.name} className="bg-gray-900 p-5 space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full`} style={{ backgroundColor: colors.hex }} />
                    <span className="font-medium text-white">{contract.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{contract.description}</p>
                </div>
              </div>

              {/* Address */}
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-gray-400 bg-gray-800 px-2.5 py-1 rounded flex-1 truncate">
                  {contract.address}
                </code>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 transition-colors flex-shrink-0"
                    title="View on Tenderly"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>

              {/* Chainlink Services */}
              <div className="flex flex-wrap gap-1.5">
                {contract.chainlinkServices.map((service) => (
                  <span
                    key={service}
                    className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  >
                    {service}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Cross-Module Wiring */}
      <div className="px-6 py-4 border-t border-gray-800">
        <p className="text-xs font-medium text-gray-500 mb-2">Cross-Module Hooks (wired at deployment)</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CONTRACT_COLORS['SolvencyConsumer'].hex }} />
            Solvency
            <span className="text-gray-600">→</span>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CONTRACT_COLORS['TokenizedFundingEngine'].hex }} />
            Rescue Funding
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CONTRACT_COLORS['MilestoneConsumer'].hex }} />
            Milestone
            <span className="text-gray-600">→</span>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CONTRACT_COLORS['TokenizedFundingEngine'].hex }} />
            Tranche Release
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CONTRACT_COLORS['ReserveVerifier'].hex }} />
            Reserves
            <span className="text-gray-600">→</span>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CONTRACT_COLORS['TokenizedFundingEngine'].hex }} />
            Solvency Check
          </div>
        </div>
      </div>
    </div>
  )
}
