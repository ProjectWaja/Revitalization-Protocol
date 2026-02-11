'use client'

import { useState, useCallback } from 'react'
import { STAGES, type VariantKey, type ScenarioVariant } from '@/lib/scenario-definitions'
import type { ContractAddresses } from '@/hooks/useContractData'

interface StepResult {
  step: string
  hash?: string
  data?: Record<string, unknown>
}

type StageStatus = 'pending' | 'running' | 'done' | 'error'
type SetupStatus = 'idle' | 'running' | 'done' | 'error'

const VARIANT_COLORS: Record<VariantKey, { card: string; cardSelected: string; header: string; badge: string; btn: string; dot: string }> = {
  good: {
    card: 'border-green-500/20 hover:border-green-500/40',
    cardSelected: 'border-green-500/60 bg-green-500/5',
    header: 'bg-green-500/10 text-green-400',
    badge: 'bg-green-500/20 text-green-300',
    btn: 'bg-green-600 hover:bg-green-500 text-white',
    dot: 'bg-green-500',
  },
  neutral: {
    card: 'border-yellow-500/20 hover:border-yellow-500/40',
    cardSelected: 'border-yellow-500/60 bg-yellow-500/5',
    header: 'bg-yellow-500/10 text-yellow-400',
    badge: 'bg-yellow-500/20 text-yellow-300',
    btn: 'bg-yellow-600 hover:bg-yellow-500 text-white',
    dot: 'bg-yellow-500',
  },
  bad: {
    card: 'border-red-500/20 hover:border-red-500/40',
    cardSelected: 'border-red-500/60 bg-red-500/5',
    header: 'bg-red-500/10 text-red-400',
    badge: 'bg-red-500/20 text-red-300',
    btn: 'bg-red-600 hover:bg-red-500 text-white',
    dot: 'bg-red-500',
  },
}

const STAGE_TAB_COLORS = [
  { active: 'bg-blue-600 text-white', inactive: 'bg-gray-800 text-gray-400 hover:bg-gray-700' },
  { active: 'bg-orange-600 text-white', inactive: 'bg-gray-800 text-gray-400 hover:bg-gray-700' },
  { active: 'bg-red-600 text-white', inactive: 'bg-gray-800 text-gray-400 hover:bg-gray-700' },
]

interface Props {
  addresses: ContractAddresses | null
  onRefresh: () => void
  onAddressesChange: (a: ContractAddresses) => void
}

export function OceanwideScenarioPanel({ addresses, onRefresh, onAddressesChange }: Props) {
  const [activeStage, setActiveStage] = useState<1 | 2 | 3>(1)
  const [selectedVariants, setSelectedVariants] = useState<Record<number, VariantKey>>({ 1: 'good', 2: 'good', 3: 'good' })
  const [stageStatuses, setStageStatuses] = useState<Record<number, StageStatus>>({ 1: 'pending', 2: 'pending', 3: 'pending' })
  const [stageResults, setStageResults] = useState<Record<number, StepResult[]>>({})
  const [executedVariants, setExecutedVariants] = useState<Record<number, VariantKey>>({})
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [setupStatus, setSetupStatus] = useState<SetupStatus>('idle')

  const completedStages = new Set(
    Object.entries(stageStatuses).filter(([, s]) => s === 'done').map(([k]) => Number(k))
  )

  const runSetup = useCallback(async () => {
    setSetupStatus('running')
    try {
      const res = await fetch('/api/demo/setup', { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Setup failed')
      onAddressesChange(data.addresses)
      setSetupStatus('done')
    } catch (err) {
      setErrorMsg(String(err))
      setSetupStatus('error')
    }
  }, [onAddressesChange])

  const runStage = useCallback(async (stage: 1 | 2 | 3, variant: VariantKey) => {
    if (!addresses) return
    setStageStatuses((prev) => ({ ...prev, [stage]: 'running' }))
    setStageResults((prev) => ({ ...prev, [stage]: [] }))
    setErrorMsg(null)

    try {
      const res = await fetch('/api/demo/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, variant, addresses }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Scenario failed')

      setStageResults((prev) => ({ ...prev, [stage]: data.results }))
      setStageStatuses((prev) => ({ ...prev, [stage]: 'done' }))
      setExecutedVariants((prev) => ({ ...prev, [stage]: variant }))
      onRefresh()
    } catch (err) {
      setErrorMsg(String(err))
      setStageStatuses((prev) => ({ ...prev, [stage]: 'error' }))
    }
  }, [addresses, onRefresh])

  const stageDef = STAGES[activeStage - 1]
  const currentVariant = selectedVariants[activeStage]
  const status = stageStatuses[activeStage]
  const steps = stageResults[activeStage] ?? []
  const isStageUnlocked = activeStage === 1 || completedStages.has(activeStage - 1)

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Oceanwide Plaza — Interactive Scenario Demo</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Choose a scenario for each stage to see how the protocol responds differently
            </p>
          </div>
          {addresses && (
            <span className="text-[10px] text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
              Contracts Deployed
            </span>
          )}
        </div>
      </div>

      <div className="px-6 pb-6 pt-4 space-y-5">
        {/* Setup Banner */}
        {!addresses && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-blue-300">Deploy Contracts to Anvil</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Deploys SolvencyConsumer, MilestoneConsumer, TokenizedFundingEngine, ReserveVerifier and wires cross-module hooks.
                </p>
              </div>
              <button
                onClick={runSetup}
                disabled={setupStatus === 'running'}
                className="flex-shrink-0 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {setupStatus === 'running' ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-white rounded-full animate-spin" />
                    Deploying...
                  </span>
                ) : setupStatus === 'error' ? 'Retry Deploy' : 'Deploy & Setup'}
              </button>
            </div>
            {setupStatus === 'error' && errorMsg && (
              <div className="mt-3 text-xs text-red-300 bg-red-500/10 rounded px-3 py-2">{errorMsg}</div>
            )}
          </div>
        )}

        {addresses && (
          <>
            {/* Stage Tabs */}
            <div className="flex gap-2">
              {STAGES.map((s, idx) => {
                const isActive = s.id === activeStage
                const isDone = completedStages.has(s.id)
                const locked = s.id > 1 && !completedStages.has(s.id - 1)
                const tc = STAGE_TAB_COLORS[idx]
                return (
                  <button
                    key={s.id}
                    onClick={() => !locked && setActiveStage(s.id)}
                    disabled={locked}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      locked ? 'bg-gray-800/50 text-gray-600 cursor-not-allowed' : isActive ? tc.active : tc.inactive
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      {locked && (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      )}
                      {isDone && <span className="text-xs">&#10003;</span>}
                      <span>Stage {s.id}: {s.label}</span>
                    </div>
                    <div className="text-[10px] mt-0.5 opacity-70">{s.period}</div>
                  </button>
                )
              })}
            </div>

            {/* Stage Narrative */}
            <div className="bg-gray-800/40 rounded-lg p-4">
              <p className="text-xs text-gray-300 leading-relaxed">{stageDef.narrative}</p>
            </div>

            {/* Variant Cards */}
            {isStageUnlocked && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(['good', 'neutral', 'bad'] as VariantKey[]).map((vk) => {
                  const v: ScenarioVariant = stageDef.variants[vk]
                  const vc = VARIANT_COLORS[vk]
                  const isSelected = currentVariant === vk
                  const isRunning = status === 'running' && isSelected
                  const wasExecuted = executedVariants[activeStage] === vk

                  return (
                    <div
                      key={vk}
                      onClick={() => status !== 'running' && setSelectedVariants((prev) => ({ ...prev, [activeStage]: vk }))}
                      className={`rounded-lg border cursor-pointer transition-all ${
                        isSelected ? vc.cardSelected : vc.card
                      } ${status === 'running' ? 'pointer-events-none opacity-70' : ''}`}
                    >
                      {/* Card Header */}
                      <div className={`px-3 py-2 rounded-t-lg ${vc.header} flex items-center justify-between`}>
                        <div>
                          <span className="text-sm font-semibold">{v.label}</span>
                          {wasExecuted && <span className="ml-2 text-[10px] opacity-70">&#10003; ran</span>}
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${vc.badge}`}>
                          {vk === 'good' ? 'GOOD' : vk === 'neutral' ? 'NEUTRAL' : 'BAD'}
                        </span>
                      </div>

                      <div className="px-3 py-3 space-y-2.5">
                        {/* Tagline */}
                        <p className="text-[11px] text-gray-400 italic">{v.tagline}</p>

                        {/* Preview Metrics */}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                          <MetricPill label="Solvency" value={v.preview.solvency} />
                          <MetricPill label="Risk" value={v.preview.risk} />
                          <MetricPill label="Financials" value={v.preview.financials} />
                          <MetricPill label="Burn" value={v.preview.burn} />
                          <MetricPill label="Milestone" value={v.preview.milestone} />
                          <MetricPill label="Funding" value={v.preview.funding} />
                        </div>

                        {/* Triggers */}
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">What triggers</div>
                          <ul className="space-y-0.5">
                            {v.triggers.map((t, i) => (
                              <li key={i} className="text-[11px] text-gray-400 flex items-start gap-1.5">
                                <span className="text-gray-600 mt-0.5 flex-shrink-0">&#8226;</span>
                                {t}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Outcomes */}
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">What you&apos;ll see</div>
                          <ul className="space-y-0.5">
                            {v.outcomes.map((o, i) => (
                              <li key={i} className="text-[11px] text-gray-400 flex items-start gap-1.5">
                                <span className="text-gray-600 mt-0.5 flex-shrink-0">&#8226;</span>
                                {o}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Execute Button */}
                        {isSelected && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              runStage(activeStage, vk)
                            }}
                            disabled={isRunning}
                            className={`w-full py-2 rounded-lg text-xs font-medium transition-colors ${
                              isRunning ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : vc.btn
                            }`}
                          >
                            {isRunning ? (
                              <span className="flex items-center justify-center gap-2">
                                <span className="w-3 h-3 border-2 border-gray-400 border-t-white rounded-full animate-spin" />
                                Running...
                              </span>
                            ) : wasExecuted ? (
                              `Re-run "${v.label}"`
                            ) : (
                              `Execute "${v.label}" Scenario`
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Locked Stage Message */}
            {!isStageUnlocked && (
              <div className="bg-gray-800/30 rounded-lg p-6 text-center">
                <svg className="w-8 h-8 text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <p className="text-sm text-gray-500">Complete Stage {activeStage - 1} to unlock this stage</p>
              </div>
            )}

            {/* Error */}
            {errorMsg && status === 'error' && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-xs text-red-300">
                {errorMsg}
              </div>
            )}

            {/* Running Indicator */}
            {status === 'running' && (
              <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-400">
                <div className="w-4 h-4 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
                Executing scenario transactions...
              </div>
            )}

            {/* Transaction Log */}
            {steps.length > 0 && (
              <div className="bg-gray-800/30 rounded-lg p-4">
                <h4 className="text-xs text-gray-500 mb-3 uppercase tracking-wider">
                  Transaction Log — Stage {activeStage}
                  {executedVariants[activeStage] && (
                    <span className="ml-2 normal-case text-gray-600">
                      ({STAGES[activeStage - 1].variants[executedVariants[activeStage]].label})
                    </span>
                  )}
                </h4>
                <div className="space-y-1">
                  {steps.map((s, i) => {
                    const dotColor = executedVariants[activeStage]
                      ? VARIANT_COLORS[executedVariants[activeStage]].dot
                      : 'bg-blue-500'
                    return (
                      <div key={i} className="flex items-start gap-3 py-1.5">
                        <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
                          <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                          {i < steps.length - 1 && <div className="w-px h-4 bg-gray-700 mt-0.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-300">{s.step}</div>
                          {s.hash && (
                            <div className="text-[10px] text-gray-600 font-mono truncate mt-0.5">
                              tx: {s.hash}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-gray-600 uppercase tracking-wider">{label}</span>
      <span className="text-[10px] text-gray-300 leading-tight">{value}</span>
    </div>
  )
}
