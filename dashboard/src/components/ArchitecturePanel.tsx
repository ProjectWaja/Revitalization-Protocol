export function ArchitecturePanel() {
  const services = [
    { name: 'CRE Workflows', desc: 'Orchestrates multi-step oracle pipelines', color: 'bg-blue-500' },
    { name: 'AI Agents (Claude)', desc: 'Solvency risk scoring with structured JSON consensus', color: 'bg-pink-500' },
    { name: 'Data Feeds', desc: 'Cost indices via commodity price proxies', color: 'bg-purple-500' },
    { name: 'CCIP', desc: 'Cross-chain funding to Polygon Amoy', color: 'bg-cyan-500' },
    { name: 'Automation', desc: 'Expire stale rounds, periodic reserve checks', color: 'bg-yellow-500' },
    { name: 'Proof of Reserves', desc: 'Verifies project collateral and engine solvency', color: 'bg-emerald-500' },
    { name: 'Confidential Compute', desc: 'Privacy-preserving solvency calculations', color: 'bg-orange-500' },
  ]

  const contracts = [
    { name: 'SolvencyConsumer.sol', desc: 'Receives real-time financial health reports' },
    { name: 'MilestoneConsumer.sol', desc: 'Receives satellite-verified progress reports' },
    { name: 'TokenizedFundingEngine.sol', desc: 'ERC-1155 fractional funding positions' },
    { name: 'ReserveVerifier.sol', desc: 'Chainlink PoR + Automation for collateral proof' },
    { name: 'ConfidentialSolvencyCompute.sol', desc: 'Privacy-preserving scoring with attestations' },
    { name: 'FundingBridgeReceiver.sol', desc: 'CCIP cross-chain receiver stub' },
  ]

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <h2 className="text-2xl font-semibold mb-6">Architecture Overview</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chainlink Services */}
        <div>
          <h3 className="text-lg font-medium text-gray-400 mb-4">Chainlink Services Used</h3>
          <div className="space-y-4">
            {services.map((s) => (
              <div key={s.name} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${s.color} flex-shrink-0`} />
                <div>
                  <div className="text-lg font-medium">{s.name}</div>
                  <div className="text-base text-gray-500">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Smart Contracts */}
        <div>
          <h3 className="text-lg font-medium text-gray-400 mb-4">Smart Contracts (Sepolia)</h3>
          <div className="space-y-4">
            {contracts.map((c) => (
              <div key={c.name} className="flex items-start gap-3">
                <div className="w-3 h-3 rounded-full bg-gray-500 mt-1.5 flex-shrink-0" />
                <div>
                  <div className="text-lg font-mono">{c.name}</div>
                  <div className="text-base text-gray-500">{c.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Data Flow */}
      <div className="mt-8 pt-6 border-t border-gray-800">
        <h3 className="text-lg font-medium text-gray-400 mb-4">Cross-Module Data Flow</h3>
        <div className="bg-gray-800/50 rounded-lg p-5 font-mono text-base text-gray-300 space-y-2 overflow-x-auto">
          <div>SolvencyOracle --CRE--{'>'} SolvencyConsumer --initiateRescueFunding()--{'>'} FundingEngine</div>
          <div>MilestoneOracle --CRE--{'>'} MilestoneConsumer --releaseTranche()-------{'>'} FundingEngine</div>
          <div>FundingWorkflow --CRE--{'>'} reads all 3 contracts + rule-based scoring ---{'>'} Report</div>
          <div>FundingEngine  --CCIP--{'>'} FundingBridgeReceiver (Polygon Amoy)</div>
          <div>ReserveVerifier --PoR--{'>'} verifies project reserves + engine solvency</div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-800 text-base text-gray-500 text-center">
        Chainlink Convergence 2026 Hackathon — DeFi & Tokenization | Risk & Compliance | CRE & AI | Privacy
      </div>
    </div>
  )
}
