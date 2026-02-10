'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPublicClient, http, formatEther, type Address } from 'viem'
import { foundry, sepolia } from 'viem/chains'
import {
  ADDRESSES,
  PROJECT_ID,
  SOLVENCY_ABI,
  MILESTONE_ABI,
  FUNDING_ABI,
  RESERVE_ABI,
} from '@/lib/contracts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
    overallScore: 72,
    riskLevel: 1,
    financialHealth: 80,
    costExposure: 65,
    fundingMomentum: 68,
    runwayAdequacy: 85,
    rescueTriggered: false,
    timestamp: Math.floor(Date.now() / 1000) - 300,
    financials: {
      totalBudget: 50_000_000,
      capitalDeployed: 18_500_000,
      capitalRemaining: 31_500_000,
      fundingVelocity: 2_100_000,
      burnRate: 1_650_000,
    },
  },
  milestones: [
    { id: 0, name: 'Foundation & Excavation', progress: 100, score: 92, approved: true, status: 'VERIFIED' },
    { id: 1, name: 'Steel Framing & Structure', progress: 74, score: 85, approved: true, status: 'IN_PROGRESS' },
    { id: 2, name: 'MEP & Interior Systems', progress: 20, score: 78, approved: false, status: 'IN_PROGRESS' },
    { id: 3, name: 'Finishing & Commissioning', progress: 0, score: 0, approved: false, status: 'NOT_STARTED' },
  ],
  rounds: [
    {
      roundId: 1,
      roundType: 'STANDARD',
      status: 1,
      targetAmount: 10,
      totalDeposited: 10,
      totalReleased: 2.5,
      deadline: Math.floor(Date.now() / 1000) + 25 * 86400,
      investorCount: 8,
      tranches: [
        { milestoneId: 0, basisPoints: 2500, released: true },
        { milestoneId: 1, basisPoints: 2500, released: false },
        { milestoneId: 2, basisPoints: 2500, released: false },
        { milestoneId: 3, basisPoints: 2500, released: false },
      ],
    },
  ],
  reserves: {
    project: {
      porReported: 48_500_000,
      onchainBalance: 31.5,
      claimed: 50_000_000,
      status: 1,
      reserveRatio: 9700,
      timestamp: Math.floor(Date.now() / 1000) - 1800,
    },
    engine: {
      contractBalance: 10,
      reportedDeposits: 10,
      status: 1,
      timestamp: Math.floor(Date.now() / 1000) - 600,
    },
  },
  isLive: false,
  lastUpdated: Date.now(),
  error: null,
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const POLL_INTERVAL = 10_000 // 10 seconds

export function useContractData(): DashboardData {
  const [data, setData] = useState<DashboardData>(DEMO_DATA)

  const fetchData = useCallback(async () => {
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL
    if (!rpcUrl) return // No RPC configured, stay on demo data

    const isAnvil = rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost')
    const chain = isAnvil ? foundry : sepolia

    const client = createPublicClient({ chain, transport: http(rpcUrl) })

    // Check if contracts are deployed
    const hasContracts =
      ADDRESSES.solvencyConsumer !== '0x0000000000000000000000000000000000000000'

    if (!hasContracts) return

    try {
      // Fetch all data in parallel
      const [solvencyResult, financialsResult, roundsResult] = await Promise.all([
        client.readContract({
          address: ADDRESSES.solvencyConsumer,
          abi: SOLVENCY_ABI,
          functionName: 'getLatestSolvency',
          args: [PROJECT_ID],
        }).catch(() => null),

        client.readContract({
          address: ADDRESSES.solvencyConsumer,
          abi: SOLVENCY_ABI,
          functionName: 'getProjectFinancials',
          args: [PROJECT_ID],
        }).catch(() => null),

        client.readContract({
          address: ADDRESSES.fundingEngine,
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
            address: ADDRESSES.milestoneConsumer,
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
            address: ADDRESSES.fundingEngine,
            abi: FUNDING_ABI,
            functionName: 'getRoundInfo',
            args: [roundId],
          }),
          client.readContract({
            address: ADDRESSES.fundingEngine,
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
        const engineBalance = await client.getBalance({ address: ADDRESSES.fundingEngine })
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

  return data
}
