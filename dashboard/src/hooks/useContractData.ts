'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createPublicClient, http, formatEther, type Address } from 'viem'
import { foundry, sepolia } from 'viem/chains'
import {
  ADDRESSES as DEFAULT_ADDRESSES,
  PROJECT_ID,
  SOLVENCY_ABI,
  MILESTONE_ABI,
  FUNDING_ABI,
  RESERVE_ABI,
} from '@/lib/contracts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContractAddresses {
  solvencyConsumer: Address
  milestoneConsumer: Address
  fundingEngine: Address
  reserveVerifier: Address
}

export interface SolvencyData {
  overallScore: number
  riskLevel: number
  financialHealth: number
  costExposure: number
  fundingMomentum: number
  runwayAdequacy: number
  rescueTriggered: boolean
  timestamp: number
  financials: {
    totalBudget: number
    capitalDeployed: number
    capitalRemaining: number
    fundingVelocity: number
    burnRate: number
  }
}

export interface MilestoneData {
  id: number
  name: string
  progress: number
  score: number
  approved: boolean
  status: string
}

export interface TrancheData {
  milestoneId: number
  basisPoints: number
  released: boolean
}

export interface RoundData {
  roundId: number
  roundType: string
  status: number
  targetAmount: number
  totalDeposited: number
  totalReleased: number
  deadline: number
  investorCount: number
  tranches: TrancheData[]
}

export interface ReserveData {
  project: {
    porReported: number
    onchainBalance: number
    claimed: number
    status: number
    reserveRatio: number
    timestamp: number
  }
  engine: {
    contractBalance: number
    reportedDeposits: number
    status: number
    timestamp: number
  }
}

export interface DashboardData {
  solvency: SolvencyData
  milestones: MilestoneData[]
  rounds: RoundData[]
  reserves: ReserveData
  isLive: boolean
  lastUpdated: number
  error: string | null
}

// ---------------------------------------------------------------------------
// Demo fallback data
// ---------------------------------------------------------------------------

const MILESTONE_NAMES = [
  'Foundation & Excavation',
  'Steel Framing & Structure',
  'MEP & Interior Systems',
  'Finishing & Commissioning',
]

const DEMO_DATA: DashboardData = {
  solvency: {
    overallScore: 0,
    riskLevel: 0,
    financialHealth: 0,
    costExposure: 0,
    fundingMomentum: 0,
    runwayAdequacy: 0,
    rescueTriggered: false,
    timestamp: 0,
    financials: {
      totalBudget: 0,
      capitalDeployed: 0,
      capitalRemaining: 0,
      fundingVelocity: 0,
      burnRate: 0,
    },
  },
  milestones: MILESTONE_NAMES.map((name, i) => ({
    id: i, name, progress: 0, score: 0, approved: false, status: 'NOT_STARTED',
  })),
  rounds: [],
  reserves: {
    project: { porReported: 0, onchainBalance: 0, claimed: 0, status: 0, reserveRatio: 0, timestamp: 0 },
    engine: { contractBalance: 0, reportedDeposits: 0, status: 0, timestamp: 0 },
  },
  isLive: false,
  lastUpdated: Date.now(),
  error: null,
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const POLL_INTERVAL = 5_000 // 5 seconds for demo responsiveness

export function useContractData(overrideAddresses?: ContractAddresses | null) {
  const [data, setData] = useState<DashboardData>(DEMO_DATA)
  const addressesRef = useRef<ContractAddresses>(DEFAULT_ADDRESSES)

  // Update addresses when override changes
  if (overrideAddresses) {
    addressesRef.current = overrideAddresses
  }

  const fetchData = useCallback(async () => {
    const addrs = addressesRef.current
    const isZero = addrs.solvencyConsumer === '0x0000000000000000000000000000000000000000'
    if (isZero) return

    const rpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? 'http://127.0.0.1:8545'
    const isAnvil = rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost')
    const chain = isAnvil ? foundry : sepolia

    const client = createPublicClient({ chain, transport: http(rpcUrl) })

    try {
      // Fetch all data in parallel
      const [solvencyResult, financialsResult, roundsResult] = await Promise.all([
        client.readContract({
          address: addrs.solvencyConsumer,
          abi: SOLVENCY_ABI,
          functionName: 'getLatestSolvency',
          args: [PROJECT_ID],
        }).catch(() => null),

        client.readContract({
          address: addrs.solvencyConsumer,
          abi: SOLVENCY_ABI,
          functionName: 'getProjectFinancials',
          args: [PROJECT_ID],
        }).catch(() => null),

        client.readContract({
          address: addrs.fundingEngine,
          abi: FUNDING_ABI,
          functionName: 'getProjectRounds',
          args: [PROJECT_ID],
        }).catch(() => null),
      ])

      if (!solvencyResult || !financialsResult) return

      const sol = solvencyResult as readonly [number, number, number, number, number, number, boolean, bigint]
      const fin = financialsResult as readonly [bigint, bigint, bigint, bigint, bigint]

      // Fetch milestones
      const milestonePromises = [0, 1, 2, 3].map((id) =>
        client
          .readContract({
            address: addrs.milestoneConsumer,
            abi: MILESTONE_ABI,
            functionName: 'getLatestMilestone',
            args: [PROJECT_ID, id],
          })
          .catch(() => null),
      )
      const milestoneResults = await Promise.all(milestonePromises)

      const milestones: MilestoneData[] = milestoneResults.map((res, i) => {
        if (!res) {
          return { id: i, name: MILESTONE_NAMES[i], progress: 0, score: 0, approved: false, status: 'NOT_STARTED' }
        }
        const m = res as readonly [number, number, boolean, bigint]
        const status =
          m[2] && m[0] === 100
            ? 'VERIFIED'
            : m[0] > 0
              ? 'IN_PROGRESS'
              : 'NOT_STARTED'
        return {
          id: i,
          name: MILESTONE_NAMES[i],
          progress: m[0],
          score: m[1],
          approved: m[2],
          status,
        }
      })

      // Fetch rounds
      const roundIds = (roundsResult as readonly bigint[]) ?? []
      const roundPromises = roundIds.map(async (roundId) => {
        const [info, tranches] = await Promise.all([
          client.readContract({
            address: addrs.fundingEngine,
            abi: FUNDING_ABI,
            functionName: 'getRoundInfo',
            args: [roundId],
          }),
          client.readContract({
            address: addrs.fundingEngine,
            abi: FUNDING_ABI,
            functionName: 'getRoundTranches',
            args: [roundId],
          }),
        ])

        const r = info as readonly [string, number, number, bigint, bigint, bigint, bigint, bigint]
        const t = tranches as readonly [readonly number[], readonly number[], readonly boolean[]]

        return {
          roundId: Number(roundId),
          roundType: r[1] === 0 ? 'STANDARD' : 'RESCUE',
          status: r[2],
          targetAmount: Number(formatEther(r[3])),
          totalDeposited: Number(formatEther(r[4])),
          totalReleased: Number(formatEther(r[5])),
          deadline: Number(r[6]),
          investorCount: Number(r[7]),
          tranches: t[0].map((mid, idx) => ({
            milestoneId: mid,
            basisPoints: t[1][idx],
            released: t[2][idx],
          })),
        } as RoundData
      })
      const rounds = await Promise.all(roundPromises)

      // Fetch reserve data
      let reserves = DEMO_DATA.reserves
      try {
        const engineBalance = await client.getBalance({ address: addrs.fundingEngine })
        reserves = {
          project: {
            ...DEMO_DATA.reserves.project,
            timestamp: Math.floor(Date.now() / 1000),
          },
          engine: {
            contractBalance: Number(formatEther(engineBalance)),
            reportedDeposits: rounds.reduce((sum, r) => sum + r.totalDeposited, 0),
            status: Number(formatEther(engineBalance)) >= rounds.reduce((sum, r) => sum + r.totalDeposited, 0) ? 1 : 2,
            timestamp: Math.floor(Date.now() / 1000),
          },
        }
      } catch {
        // Keep demo reserve data
      }

      setData({
        solvency: {
          overallScore: sol[0],
          riskLevel: sol[1],
          financialHealth: sol[2],
          costExposure: sol[3],
          fundingMomentum: sol[4],
          runwayAdequacy: sol[5],
          rescueTriggered: sol[6],
          timestamp: Number(sol[7]),
          financials: {
            totalBudget: Number(fin[0]) / 1e6,
            capitalDeployed: Number(fin[1]) / 1e6,
            capitalRemaining: Number(fin[2]) / 1e6,
            fundingVelocity: Number(fin[3]) / 1e6,
            burnRate: Number(fin[4]) / 1e6,
          },
        },
        milestones,
        rounds,
        reserves,
        isLive: true,
        lastUpdated: Date.now(),
        error: null,
      })
    } catch (err) {
      setData((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to fetch contract data',
      }))
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchData])

  return { data, refresh: fetchData }
}
