'use client'

import { useState, useCallback } from 'react'

const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
const RISK_COLORS: Record<string, string> = {
  LOW: 'text-green-400',
  MEDIUM: 'text-yellow-400',
  HIGH: 'text-orange-400',
  CRITICAL: 'text-red-400',
}

interface CCResult {
  score: number
  riskLevel: number
  attestationHash: string
  enclaveVerified: boolean
  timestamp: number
  computationCount: number
}

interface Props {
  confidentialAddress: string | null
  onDeploy: (address: string) => void
  onRefresh: () => void
}

export function ConfidentialComputePanel({ confidentialAddress, onDeploy, onRefresh }: Props) {
  const [deploying, setDeploying] = useState(false)
  const [computing, setComputing] = useState(false)
  const [result, setResult] = useState<CCResult | null>(null)
  const [fh, setFh] = useState(80)
  const [ce, setCe] = useState(65)
  const [fm, setFm] = useState(70)
  const [ra, setRa] = useState(85)
  const [error, setError] = useState<string | null>(null)

  const handleDeploy = useCallback(async () => {
    setDeploying(true)
    setError(null)
    try {
      const res = await fetch('/api/demo/confidential', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deploy' }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      onDeploy(data.address)
    } catch (err) {
      setError(String(err))
    } finally {
      setDeploying(false)
    }
  }, [onDeploy])

  const handleCompute = useCallback(async () => {
    if (!confidentialAddress) return
    setComputing(true)
    setError(null)
    try {
      const res = await fetch('/api/demo/confidential', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'compute',
          confidentialAddress,
          financialHealth: fh,
          costExposure: ce,
          fundingMomentum: fm,
          runwayAdequacy: ra,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setResult(data.result)
      onRefresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setComputing(false)
    }
  }, [confidentialAddress, fh, ce, fm, ra, onRefresh])

  // Predicted score based on weights
  const predictedScore = Math.round(fh * 0.35 + ce * 0.20 + fm * 0.25 + ra * 0.20)
  const predictedRisk = predictedScore >= 75 ? 0 : predictedScore >= 50 ? 1 : predictedScore >= 25 ? 2 : 3

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Confidential Compute</h2>
          <p className="text-sm text-gray-500 mt-1">Privacy-Preserving Solvency Scoring with Attestation Proofs</p>
        </div>
        {confidentialAddress ? (
          <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">Deployed</span>
        ) : (
          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 rounded text-xs font-medium transition-colors"
          >
            {deploying ? 'Deploying...' : 'Deploy CC Contract'}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
          {error}
        </div>
      )}

      {confidentialAddress && (
        <div className="space-y-6">
          {/* Input Sliders */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'Financial Health', value: fh, set: setFh, weight: '35%', color: 'accent-blue-500' },
              { label: 'Cost Exposure', value: ce, set: setCe, weight: '20%', color: 'accent-purple-500' },
              { label: 'Funding Momentum', value: fm, set: setFm, weight: '25%', color: 'accent-cyan-500' },
              { label: 'Runway Adequacy', value: ra, set: setRa, weight: '20%', color: 'accent-emerald-500' },
            ].map((s) => (
              <div key={s.label} className="bg-gray-800/30 rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">{s.label} <span className="text-gray-600">({s.weight})</span></span>
                  <span className="font-mono font-bold">{s.value}</span>
                </div>
                <input
                  type="range" min={0} max={100} value={s.value}
                  onChange={(e) => s.set(Number(e.target.value))}
                  className={`w-full ${s.color}`}
                />
              </div>
            ))}
          </div>

          {/* Predicted Output + Compute Button */}
          <div className="flex items-center justify-between bg-gray-800/30 rounded-lg p-4">
            <div className="flex items-center gap-6">
              <div>
                <div className="text-sm text-gray-500">Predicted Score</div>
                <div className={`text-2xl font-bold font-mono ${RISK_COLORS[RISK_LEVELS[predictedRisk]]}`}>
                  {predictedScore}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Risk Level</div>
                <div className={`text-base font-medium ${RISK_COLORS[RISK_LEVELS[predictedRisk]]}`}>
                  {RISK_LEVELS[predictedRisk]}
                </div>
              </div>
              <div className="text-sm text-gray-600">
                = FH({fh})x0.35 + CE({ce})x0.20 + FM({fm})x0.25 + RA({ra})x0.20
              </div>
            </div>
            <button
              onClick={handleCompute}
              disabled={computing}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              {computing ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                  Computing...
                </>
              ) : (
                'Compute On-Chain'
              )}
            </button>
          </div>

          {/* Attestation Result */}
          {result && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-400">Latest Attestation</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-gray-400 text-sm">On-Chain Score</div>
                  <div className={`text-xl font-bold font-mono ${RISK_COLORS[RISK_LEVELS[result.riskLevel]]}`}>
                    {result.score}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-gray-400 text-sm">Risk Level</div>
                  <div className={`text-lg font-bold ${RISK_COLORS[RISK_LEVELS[result.riskLevel]]}`}>
                    {RISK_LEVELS[result.riskLevel]}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-gray-400 text-sm">Enclave Verified</div>
                  <div className={`text-lg font-bold ${result.enclaveVerified ? 'text-green-400' : 'text-gray-500'}`}>
                    {result.enclaveVerified ? 'Yes' : 'No'}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-gray-400 text-sm">Computations</div>
                  <div className="text-xl font-bold font-mono">{result.computationCount}</div>
                </div>
              </div>

              {/* Attestation Hash */}
              <div className="bg-gray-800/30 rounded-lg p-3">
                <div className="text-sm text-gray-500 mb-1">Attestation Hash (keccak256 of inputs + score + nonce)</div>
                <div className="font-mono text-sm text-orange-400 break-all">{result.attestationHash}</div>
                <div className="text-sm text-gray-600 mt-1">
                  Raw inputs are NOT stored on-chain — only this hash proves the computation
                </div>
              </div>
            </div>
          )}

          {/* Contract Address */}
          <div className="text-xs text-gray-600">
            Contract: <span className="font-mono">{confidentialAddress}</span>
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between text-sm text-gray-500">
        <span>Weighted: FH(35%) + CE(20%) + FM(25%) + RA(20%)</span>
        <span>Chainlink Confidential Compute</span>
      </div>
    </div>
  )
}
