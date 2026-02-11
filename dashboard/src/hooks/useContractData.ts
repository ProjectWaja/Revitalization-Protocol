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
  PRICE_FEED_ABI,
} from '@/lib/contracts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContractAddresses {
  solvencyConsumer: Address
  milestoneConsumer: Address
  fundingEngine: Address
  reserveVerifier: Address
  priceFeed?: Address
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
  rescuePremiumBps: number
  premiumPool: number
  estimatedBonusPerEth: number
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
  ethPrice: number // USD per ETH from Chainlink Data Feed
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
  ethPrice: 0,
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
        const [info, tranches, premiumInfo] = await Promise.all([
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
          client.readContract({
            address: addrs.fundingEngine,
            abi: FUNDING_ABI,
            functionName: 'getRescuePremiumInfo',
            args: [roundId],
          }).catch(() => null),
        ])

        const r = info as readonly [string, number, number, bigint, bigint, bigint, bigint, bigint, number]
        const t = tranches as readonly [readonly number[], readonly number[], readonly boolean[]]
        const p = premiumInfo as readonly [number, bigint, bigint] | null

        return {
          roundId: Number(roundId),
          roundType: r[1] === 0 ? 'STANDARD' : 'RESCUE',
          status: r[2],
          targetAmount: Number(formatEther(r[3])),
          totalDeposited: Number(formatEther(r[4])),
          totalReleased: Number(formatEther(r[5])),
          deadline: Number(r[6]),
          investorCount: Number(r[7]),
          rescuePremiumBps: r[8],
          premiumPool: p ? Number(formatEther(p[1])) : 0,
          estimatedBonusPerEth: p ? Number(formatEther(p[2])) : 0,
          tranches: t[0].map((mid, idx) => ({
            milestoneId: mid,
            basisPoints: t[1][idx],
            released: t[2][idx],
          })),
        } as RoundData
      })
      const rounds = await Promise.all(roundPromises)

      // Fetch reserve data from ReserveVerifier contract
      let reserves = DEMO_DATA.reserves
      try {
        const [projectVerification, engineVerification, engineBalance] = await Promise.all([
          client.readContract({
            address: addrs.reserveVerifier,
            abi: RESERVE_ABI,
            functionName: 'getProjectVerification',
            args: [PROJECT_ID],
          }).catch(() => null),
          client.readContract({
            address: addrs.reserveVerifier,
            abi: RESERVE_ABI,
            functionName: 'getEngineVerification',
          }).catch(() => null),
          client.getBalance({ address: addrs.fundingEngine }),
        ])

        if (projectVerification) {
          const pv = projectVerification as readonly [bigint, bigint, bigint, number, bigint, bigint]
          reserves = {
            ...reserves,
            project: {
              porReported: Number(pv[0]),
              onchainBalance: Number(pv[1]),
              claimed: Number(pv[2]),
              status: pv[3],
              reserveRatio: Number(pv[4]),
              timestamp: Number(pv[5]),
            },
          }
        }

        if (engineVerification) {
          const ev = engineVerification as readonly [string, bigint, bigint, number, bigint]
          reserves = {
            ...reserves,
            engine: {
              contractBalance: Number(formatEther(ev[1])),
              reportedDeposits: Number(formatEther(ev[2])),
              status: ev[3],
              timestamp: Number(ev[4]),
            },
          }
        } else {
          // Fallback: derive from balance
          const bal = Number(formatEther(engineBalance))
          const totalDeposited = rounds.reduce((sum, r) => sum + r.totalDeposited, 0)
          reserves = {
            ...reserves,
            engine: {
              contractBalance: bal,
              reportedDeposits: totalDeposited,
              status: bal >= totalDeposited ? 1 : 2,
              timestamp: Math.floor(Date.now() / 1000),
            },
          }
        }
      } catch {
        // Keep demo reserve data
      }

      // Fetch ETH/USD price from Chainlink Data Feed
      let ethPrice = 0
      if (addrs.priceFeed && addrs.priceFeed !== '0x0000000000000000000000000000000000000000') {
        try {
          const [priceResult, decimalsResult] = await Promise.all([
            client.readContract({
              address: addrs.priceFeed,
              abi: PRICE_FEED_ABI,
              functionName: 'latestRoundData',
            }),
            client.readContract({
              address: addrs.priceFeed,
              abi: PRICE_FEED_ABI,
              functionName: 'decimals',
            }),
          ])
          const priceData = priceResult as readonly [bigint, bigint, bigint, bigint, bigint]
          const decimals = decimalsResult as number
          ethPrice = Number(priceData[1]) / 10 ** decimals
        } catch {
          // Price feed unavailable — leave at 0
        }
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
        ethPrice,
        isLive: true,
        lastUpdated: Date.now(),
        error: null,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      let friendly = msg
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
        friendly = 'Cannot connect to RPC — is Anvil running? (anvil --host 127.0.0.1)'
      } else if (msg.includes('execution reverted')) {
        friendly = 'Contract call reverted — click "Deploy & Setup" first'
      } else if (msg.includes('could not be found')) {
        friendly = 'Contract not found at address — redeploy via Setup'
      }
      setData((prev) => ({
        ...prev,
        error: friendly,
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
