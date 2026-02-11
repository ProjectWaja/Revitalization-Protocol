'use client'

import { useState, useCallback } from 'react'
import type { Address } from 'viem'

interface DemoAddresses {
  solvencyConsumer: Address
  milestoneConsumer: Address
  fundingEngine: Address
  reserveVerifier: Address
  priceFeed?: Address
}

interface Props {
  onRefresh: () => void
  onAddressesChange: (addresses: DemoAddresses) => void
  addresses: DemoAddresses | null
}

type Status = 'idle' | 'loading' | 'success' | 'error'

function StatusDot({ status }: { status: Status }) {
  if (status === 'idle') return null
  const color = status === 'loading' ? 'bg-yellow-400 animate-pulse' : status === 'success' ? 'bg-green-400' : 'bg-red-400'
  return <span className={`w-2 h-2 rounded-full ${color} inline-block`} />
}

export function DemoControlPanel({ onRefresh, onAddressesChange, addresses }: Props) {
  const [open, setOpen] = useState(true)
  const [setupStatus, setSetupStatus] = useState<Status>('idle')
  const [solvencyScore, setSolvencyScore] = useState(72)
  const [solvencyStatus, setSolvencyStatus] = useState<Status>('idle')
  const [milestoneId, setMilestoneId] = useState(0)
  const [milestoneStatus, setMilestoneStatus] = useState<Status>('idle')
  const [fundStatus, setFundStatus] = useState<Status>('idle')
  const [investAmount, setInvestAmount] = useState('5')
  const [investRound, setInvestRound] = useState('1')
  const [investStatus, setInvestStatus] = useState<Status>('idle')
  const [rescueStatus, setRescueStatus] = useState<Status>('idle')
  const [reserveStatus, setReserveStatus] = useState<Status>('idle')
  const [ethPrice, setEthPrice] = useState('2500')
  const [priceStatus, setPriceStatus] = useState<Status>('idle')
  const [workflowType, setWorkflowType] = useState<'all' | 'solvency' | 'milestone' | 'funding'>('all')
  const [workflowStatus, setWorkflowStatus] = useState<Status>('idle')
  const [workflowSteps, setWorkflowSteps] = useState<{ step: string; result: string }[]>([])
  const [message, setMessage] = useState<string | null>(null)

  const showMessage = useCallback((msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(null), 4000)
  }, [])

  const callApi = useCallback(async (path: string, body: Record<string, unknown>, setStatus: (s: Status) => void) => {
    setStatus('loading')
    try {
      const res = await fetch(`/api/demo/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed')
      setStatus('success')
      setTimeout(() => setStatus('idle'), 3000)
      onRefresh()
      return data
    } catch (err) {
      setStatus('error')
      showMessage(String(err))
      setTimeout(() => setStatus('idle'), 3000)
      return null
    }
  }, [onRefresh, showMessage])

  const handleSetup = async () => {
    const data = await callApi('setup', {}, setSetupStatus)
    if (data?.addresses) {
      onAddressesChange(data.addresses)
      showMessage('Contracts deployed and wired!')
    }
  }

  const handleSolvency = () => callApi('solvency', { score: solvencyScore, solvencyAddress: addresses?.solvencyConsumer }, setSolvencyStatus)
  const handleMilestone = () => callApi('milestone', { milestoneId, milestoneAddress: addresses?.milestoneConsumer }, setMilestoneStatus)
  const handleFund = () => callApi('fund', { engineAddress: addresses?.fundingEngine }, setFundStatus)
  const handleInvest = () => callApi('invest', { roundId: Number(investRound), amount: investAmount, engineAddress: addresses?.fundingEngine }, setInvestStatus)
  const handleRescue = () => callApi('rescue', { solvencyAddress: addresses?.solvencyConsumer }, setRescueStatus)
  const handleReserves = () => callApi('reserves', { reserveAddress: addresses?.reserveVerifier, engineAddress: addresses?.fundingEngine }, setReserveStatus)
  const handlePrice = () => callApi('price', { price: Number(ethPrice), priceFeedAddress: addresses?.priceFeed }, setPriceStatus)
  const handleWorkflow = async () => {
    setWorkflowSteps([])
    const data = await callApi('workflow', { workflow: workflowType, addresses }, setWorkflowStatus)
    if (data?.steps) {
      setWorkflowSteps(data.steps)
      showMessage(`CRE workflow completed: ${data.steps.length} steps in ${data.totalDuration}ms`)
    }
  }

  const isSetUp = !!addresses

  const MILESTONE_NAMES = ['Foundation & Excavation', 'Steel Framing & Structure', 'MEP & Interior Systems', 'Finishing & Commissioning']

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold">Demo Controls</span>
          {isSetUp && (
            <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">Connected</span>
          )}
        </div>
        <svg className={`w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Toast */}
      {message && (
        <div className="mx-6 mb-2 px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-300">
          {message}
        </div>
      )}

      {/* Controls */}
      {open && (
        <div className="px-6 pb-6 space-y-4">
          {/* Setup Row */}
          {!isSetUp && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-blue-300">One-Click Setup</h3>
                  <p className="text-xs text-gray-400 mt-1">Deploy all contracts, wire hooks, register project, create funding round</p>
                </div>
                <button
                  onClick={handleSetup}
                  disabled={setupStatus === 'loading'}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-gray-400 rounded-lg text-sm font-medium transition-colors"
                >
                  <StatusDot status={setupStatus} />
                  {setupStatus === 'loading' ? 'Deploying...' : 'Deploy & Setup'}
                </button>
              </div>
            </div>
          )}

          {/* Control Grid */}
          {isSetUp && (<>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Solvency */}
              <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-medium">Adjust Solvency Score</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min={0} max={100} value={solvencyScore}
                      onChange={(e) => setSolvencyScore(Number(e.target.value))}
                      className="flex-1 accent-blue-500"
                    />
                    <span className={`text-lg font-mono font-bold w-8 text-right ${
                      solvencyScore >= 75 ? 'text-green-400' : solvencyScore >= 50 ? 'text-yellow-400' : solvencyScore >= 25 ? 'text-orange-400' : 'text-red-400'
                    }`}>{solvencyScore}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {solvencyScore >= 75 ? 'LOW risk' : solvencyScore >= 50 ? 'MEDIUM risk' : solvencyScore >= 25 ? 'HIGH risk' : 'CRITICAL — will trigger rescue'}
                    </span>
                    <button onClick={handleSolvency} disabled={solvencyStatus === 'loading'}
                      className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded text-xs font-medium transition-colors">
                      <StatusDot status={solvencyStatus} />
                      Submit
                    </button>
                  </div>
                </div>
              </div>

              {/* Milestone */}
              <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-medium">Complete Milestone</h3>
                <div className="space-y-2">
                  <select
                    value={milestoneId}
                    onChange={(e) => setMilestoneId(Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
                  >
                    {MILESTONE_NAMES.map((name, i) => (
                      <option key={i} value={i}>{i}: {name}</option>
                    ))}
                  </select>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Sets to 100% approved</span>
                    <button onClick={handleMilestone} disabled={milestoneStatus === 'loading'}
                      className="flex items-center gap-1.5 px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 rounded text-xs font-medium transition-colors">
                      <StatusDot status={milestoneStatus} />
                      Complete
                    </button>
                  </div>
                </div>
              </div>

              {/* Create Round */}
              <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-medium">Create Funding Round</h3>
                <p className="text-xs text-gray-400">10 ETH target, 4 tranches x 25%</p>
                <div className="flex justify-end">
                  <button onClick={handleFund} disabled={fundStatus === 'loading'}
                    className="flex items-center gap-1.5 px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 rounded text-xs font-medium transition-colors">
                    <StatusDot status={fundStatus} />
                    Create Round
                  </button>
                </div>
              </div>

              {/* Invest */}
              <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-medium">Invest in Round</h3>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500">Round #</label>
                    <input type="number" min={1} value={investRound} onChange={(e) => setInvestRound(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm font-mono" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500">ETH</label>
                    <input type="number" min={0.1} step={0.1} value={investAmount} onChange={(e) => setInvestAmount(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm font-mono" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button onClick={handleInvest} disabled={investStatus === 'loading'}
                    className="flex items-center gap-1.5 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 rounded text-xs font-medium transition-colors">
                    <StatusDot status={investStatus} />
                    Invest
                  </button>
                </div>
              </div>

              {/* Rescue Trigger */}
              <div className="bg-gray-800/30 border border-red-900/50 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-medium text-red-300">Trigger Rescue Funding</h3>
                <p className="text-xs text-gray-400">Sends critical solvency report (score=15), auto-creates RESCUE round</p>
                <div className="flex justify-end">
                  <button onClick={handleRescue} disabled={rescueStatus === 'loading'}
                    className="flex items-center gap-1.5 px-3 py-1 bg-red-600 hover:bg-red-500 disabled:bg-gray-700 rounded text-xs font-medium transition-colors">
                    <StatusDot status={rescueStatus} />
                    Trigger Rescue
                  </button>
                </div>
              </div>

              {/* Verify Reserves */}
              <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-medium">Verify Reserves</h3>
                <p className="text-xs text-gray-400">Calls ReserveVerifier to check engine solvency</p>
                <div className="flex justify-end">
                  <button onClick={handleReserves} disabled={reserveStatus === 'loading'}
                    className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 rounded text-xs font-medium transition-colors">
                    <StatusDot status={reserveStatus} />
                    Verify
                  </button>
                </div>
              </div>

              {/* ETH/USD Price Feed */}
              <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-medium">Update ETH/USD Price</h3>
                <p className="text-xs text-gray-400">Chainlink Data Feed (MockV3Aggregator)</p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500">USD per ETH</label>
                    <input type="number" min={1} step={100} value={ethPrice} onChange={(e) => setEthPrice(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm font-mono" />
                  </div>
                  <button onClick={handlePrice} disabled={priceStatus === 'loading' || !addresses?.priceFeed}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 rounded text-xs font-medium transition-colors">
                    <StatusDot status={priceStatus} />
                    Update
                  </button>
                </div>
                <div className="flex gap-1">
                  {[1500, 2500, 4000, 8000].map((p) => (
                    <button key={p} onClick={() => setEthPrice(String(p))}
                      className="px-2 py-0.5 text-[10px] bg-gray-700/50 hover:bg-gray-700 rounded transition-colors">
                      ${p.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* CRE Workflow Simulation */}
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-blue-300">Simulate CRE Workflow</h3>
                  <p className="text-xs text-gray-400 mt-1">Run multi-step oracle pipeline: fetch → compute → write onchain</p>
                </div>
                <div className="flex items-center gap-2">
                  <select value={workflowType} onChange={(e) => setWorkflowType(e.target.value as typeof workflowType)}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs">
                    <option value="all">All 3 Workflows</option>
                    <option value="solvency">Solvency Oracle</option>
                    <option value="milestone">Milestone Oracle</option>
                    <option value="funding">Funding Engine</option>
                  </select>
                  <button onClick={handleWorkflow} disabled={workflowStatus === 'loading'}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded text-xs font-medium transition-colors">
                    <StatusDot status={workflowStatus} />
                    {workflowStatus === 'loading' ? 'Running...' : 'Execute'}
                  </button>
                </div>
              </div>
              {workflowSteps.length > 0 && (
                <div className="space-y-1 mt-2 bg-gray-900/50 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {workflowSteps.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-green-400 flex-shrink-0">&#10003;</span>
                      <span className="text-gray-400">{s.step}</span>
                      <span className="text-gray-600 ml-auto flex-shrink-0">{s.result}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>)}
        </div>
      )}
    </div>
  )
}
