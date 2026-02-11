'use client'

import { useState, useCallback } from 'react'
import type { ContractAddresses } from '@/hooks/useContractData'

interface StepResult {
  step: string
  hash?: string
  data?: Record<string, unknown>
}

type StageStatus = 'pending' | 'running' | 'done' | 'error'

const STAGES = [
  {
    id: 1,
    label: 'The Build',
    period: '2015-2017',
    color: 'green',
    narrative:
      'Oceanwide Holdings launches a $1.2B mixed-use development in downtown LA. Capital flows freely from China, foundation and steel framing progress on schedule. Solvency score: 82/100.',
  },
  {
    id: 2,
    label: 'The Stall',
    period: '2017-2019',
    color: 'yellow',
    narrative:
      "China's capital controls tighten. Oceanwide can't move money out. Burn rate climbs to $6.8M/mo while funding velocity collapses. $98.6M in liens pile up. Solvency plummets from 58 to 35.",
  },
  {
    id: 3,
    label: 'The Rescue',
    period: 'What Could Have Been',
    color: 'red',
    narrative:
      'Solvency hits 18 (CRITICAL) — auto-triggers a rescue funding round with a 41% premium for external investors willing to save the project. Rescue capital flows in, premium rewards risk-takers, project stabilizes.',
  },
] as const

const STAGE_COLORS = {
  green: {
    pill: 'bg-green-500/20 text-green-400 border-green-500/30',
    pillActive: 'bg-green-500 text-white',
    border: 'border-green-500/30',
    bg: 'bg-green-500/5',
    dot: 'bg-green-500',
  },
  yellow: {
    pill: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    pillActive: 'bg-yellow-500 text-black',
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-500/5',
    dot: 'bg-yellow-500',
  },
  red: {
    pill: 'bg-red-500/20 text-red-400 border-red-500/30',
    pillActive: 'bg-red-500 text-white',
    border: 'border-red-500/30',
    bg: 'bg-red-500/5',
    dot: 'bg-red-500',
  },
} as const

interface Props {
  addresses: ContractAddresses | null
  onRefresh: () => void
}

export function OceanwideScenarioPanel({ addresses, onRefresh }: Props) {
  const [activeStage, setActiveStage] = useState<1 | 2 | 3>(1)
  const [stageStatuses, setStageStatuses] = useState<Record<number, StageStatus>>({ 1: 'pending', 2: 'pending', 3: 'pending' })
  const [stageResults, setStageResults] = useState<Record<number, StepResult[]>>({})
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [open, setOpen] = useState(true)

  const runStage = useCallback(async (stage: 1 | 2 | 3) => {
    if (!addresses) return
    setStageStatuses((prev) => ({ ...prev, [stage]: 'running' }))
    setStageResults((prev) => ({ ...prev, [stage]: [] }))
    setErrorMsg(null)

    try {
      const res = await fetch('/api/demo/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, addresses }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Scenario failed')

      setStageResults((prev) => ({ ...prev, [stage]: data.results }))
      setStageStatuses((prev) => ({ ...prev, [stage]: 'done' }))
      onRefresh()
    } catch (err) {
      setErrorMsg(String(err))
      setStageStatuses((prev) => ({ ...prev, [stage]: 'error' }))
    }
  }, [addresses, onRefresh])

  const stage = STAGES[activeStage - 1]
  const colors = STAGE_COLORS[stage.color]
  const steps = stageResults[activeStage] ?? []
  const status = stageStatuses[activeStage]

  if (!addresses) return null

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold">Oceanwide Plaza Scenario</span>
          <span className="text-xs text-gray-500">3-stage lifecycle demo</span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-4">
          {/* Stage Selector */}
          <div className="flex gap-2">
            {STAGES.map((s) => {
              const c = STAGE_COLORS[s.color]
              const isActive = s.id === activeStage
              const isDone = stageStatuses[s.id] === 'done'
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveStage(s.id as 1 | 2 | 3)}
                  className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    isActive ? c.pillActive + ' border-transparent' : c.pill + ' border ' + c.border
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    {isDone && <span className="text-xs">&#10003;</span>}
                    <span>Stage {s.id}: {s.label}</span>
                  </div>
                  <div className={`text-[10px] mt-0.5 ${isActive ? 'opacity-80' : 'opacity-60'}`}>
                    {s.period}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Narrative + Action */}
          <div className={`${colors.bg} border ${colors.border} rounded-lg p-4`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-sm font-medium mb-1">
                  Stage {stage.id}: {stage.label}
                  <span className="text-xs text-gray-500 ml-2">({stage.period})</span>
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed">{stage.narrative}</p>
              </div>
              <button
                onClick={() => runStage(activeStage)}
                disabled={status === 'running'}
                className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  status === 'running'
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : status === 'done'
                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      : `${colors.pillActive} hover:opacity-90`
                }`}
              >
                {status === 'running' ? 'Running...' : status === 'done' ? 'Re-run' : 'Execute Stage'}
              </button>
            </div>
          </div>

          {/* Error */}
          {errorMsg && status === 'error' && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-xs text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Step Tracker */}
          {steps.length > 0 && (
            <div className="space-y-1 bg-gray-800/30 rounded-lg p-4">
              <h4 className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Transaction Log</h4>
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-3 py-1.5">
                  <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
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
              ))}
            </div>
          )}

          {/* Running indicator */}
          {status === 'running' && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
              Executing scenario transactions...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
