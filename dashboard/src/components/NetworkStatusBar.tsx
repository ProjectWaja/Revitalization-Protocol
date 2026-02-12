'use client'

import { useEffect, useState } from 'react'
import { ADDRESSES, NETWORK_NAME, IS_TENDERLY, TENDERLY_EXPLORER, DEPLOYER_ADDRESS } from '@/lib/contracts'

interface NetworkStatus {
  blockNumber: number
  chainId: number
  connected: boolean
  error?: string
}

export function NetworkStatusBar() {
  const [status, setStatus] = useState<NetworkStatus>({
    blockNumber: 0,
    chainId: 0,
    connected: false,
  })

  useEffect(() => {
    async function check() {
      try {
        const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'http://127.0.0.1:8545'
        const [blockRes, chainRes] = await Promise.all([
          fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
          }),
          fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 2 }),
          }),
        ])
        const blockData = await blockRes.json()
        const chainData = await chainRes.json()
        setStatus({
          blockNumber: parseInt(blockData.result, 16),
          chainId: parseInt(chainData.result, 16),
          connected: true,
        })
      } catch (e: any) {
        setStatus({ blockNumber: 0, chainId: 0, connected: false, error: e.message })
      }
    }
    check()
    const interval = setInterval(check, 15000) // refresh every 15s
    return () => clearInterval(interval)
  }, [])

  const networkLabel = IS_TENDERLY ? 'Tenderly Virtual TestNet' : NETWORK_NAME === 'anvil' ? 'Local Anvil' : 'Sepolia'
  const networkColor = IS_TENDERLY ? 'purple' : NETWORK_NAME === 'anvil' ? 'yellow' : 'blue'

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        {/* Network Badge */}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${status.connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
          <span className={`font-medium text-${networkColor}-400`}>{networkLabel}</span>
          {IS_TENDERLY && (
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">Sepolia Fork</span>
          )}
        </div>

        {/* Block Number */}
        {status.connected && (
          <div className="flex items-center gap-1.5 text-gray-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span className="font-mono">{status.blockNumber.toLocaleString()}</span>
          </div>
        )}

        {/* Chain ID */}
        {status.connected && (
          <div className="text-gray-500">
            Chain ID: <span className="font-mono text-gray-400">{status.chainId}</span>
          </div>
        )}

        {/* Deployer */}
        {DEPLOYER_ADDRESS && (
          <div className="text-gray-500">
            Deployer: <span className="font-mono text-gray-400">{DEPLOYER_ADDRESS.slice(0, 6)}...{DEPLOYER_ADDRESS.slice(-4)}</span>
          </div>
        )}

        {/* Tenderly Explorer Link */}
        {IS_TENDERLY && TENDERLY_EXPLORER && (
          <a
            href={TENDERLY_EXPLORER}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1.5 text-purple-400 hover:text-purple-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Tenderly Explorer
          </a>
        )}

        {/* Error */}
        {status.error && (
          <span className="text-red-400 text-xs">{status.error}</span>
        )}
      </div>
    </div>
  )
}
