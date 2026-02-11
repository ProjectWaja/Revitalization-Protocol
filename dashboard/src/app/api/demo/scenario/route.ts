import { NextResponse } from 'next/server'
import { encodeAbiParameters, parseAbiParameters, parseEther, formatEther, type Address } from 'viem'
import { getPublicClient, getWalletClient, PROJECT_ID } from '@/lib/anvil'
import { loadAbi } from '@/lib/demo-abis'

export const dynamic = 'force-dynamic'

interface StepResult {
  step: string
  hash?: string
  data?: Record<string, unknown>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tx(client: any, pub: any, params: any) {
  const hash = await client.writeContract(params)
  await pub.waitForTransactionReceipt({ hash })
  return hash
}

function ts() {
  return BigInt(Math.floor(Date.now() / 1000))
}

function solReport(
  score: number, risk: number,
  fh: number, ce: number, fm: number, ra: number,
  rescue: boolean,
) {
  return encodeAbiParameters(
    parseAbiParameters('bytes32, uint8, uint8, uint8, uint8, uint8, uint8, bool, uint64'),
    [PROJECT_ID, score, risk, fh, ce, fm, ra, rescue, ts()],
  )
}

function msReport(index: number, progress: number, quality: number, approved: boolean) {
  return encodeAbiParameters(
    parseAbiParameters('bytes32, uint8, uint8, uint8, bool, uint64'),
    [PROJECT_ID, index, progress, quality, approved, ts()],
  )
}

/** Safely convert any contract return value to bigint */
function toBig(v: unknown): bigint {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number') return BigInt(v)
  return BigInt(String(v))
}

/** Ensure admin has a specific role on the funding engine */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureRole(admin: any, pub: any, engineAddr: Address, abi: any, roleFn: string) {
  const role = await pub.readContract({ address: engineAddr, abi, functionName: roleFn }) as `0x${string}`
  const has = await pub.readContract({
    address: engineAddr, abi, functionName: 'hasRole', args: [role, admin.account.address],
  }) as boolean
  if (!has) {
    await tx(admin, pub, { address: engineAddr, abi, functionName: 'grantRole', args: [role, admin.account.address] })
  }
}

export async function POST(req: Request) {
  try {
    const { stage, variant = 'good', addresses } = await req.json()
    if (!stage || !addresses) {
      return NextResponse.json({ error: 'stage and addresses required' }, { status: 400 })
    }

    const pub = getPublicClient()
    const admin = getWalletClient('admin')
    const workflow = getWalletClient('workflow')
    const investor = getWalletClient('investor')

    const solvencyAbi = loadAbi('SolvencyConsumer')
    const milestoneAbi = loadAbi('MilestoneConsumer')
    const fundingAbi = loadAbi('TokenizedFundingEngine')
    const reserveAbi = loadAbi('ReserveVerifier')

    const sol = addresses.solvencyConsumer as Address
    const ms = addresses.milestoneConsumer as Address
    const eng = addresses.fundingEngine as Address
    const res = addresses.reserveVerifier as Address

    const results: StepResult[] = []
    const usd = (n: bigint) => n * 1_000_000n // 6-decimal USD scaling

    // =====================================================================
    // STAGE 1: Foundation (2015-2017)
    // =====================================================================
    if (stage === 1) {
      if (variant === 'good') {
        // --- On Track: solvency 85, $400M/$800M, 10 ETH, milestone 0 complete ---
        let hash = await tx(admin, pub, {
          address: sol, abi: solvencyAbi, functionName: 'updateProjectFinancials',
          args: [PROJECT_ID, usd(400_000_000n), usd(800_000_000n), usd(2_000_000n), usd(1_500_000n)],
        })
        results.push({ step: 'Financials: $400M deployed, $800M remaining, burn $1.5M/mo', hash })

        hash = await tx(workflow, pub, {
          address: sol, abi: solvencyAbi,
          functionName: 'receiveSolvencyReport', args: [solReport(85, 0, 88, 72, 85, 90, false)],
        })
        results.push({ step: 'Solvency: 85 (LOW) — on budget, strong fundamentals', hash })

        hash = await tx(investor, pub, {
          address: eng, abi: fundingAbi, functionName: 'invest', args: [1n], value: parseEther('10'),
        })
        results.push({ step: 'Investor deposits 10 ETH → Round #1 FUNDED', hash })

        hash = await tx(workflow, pub, {
          address: ms, abi: milestoneAbi,
          functionName: 'receiveMilestoneReport', args: [msReport(0, 100, 90, true)],
        })
        results.push({ step: 'Milestone 0 (Foundation) complete → 25% tranche released', hash })

        hash = await tx(admin, pub, {
          address: res, abi: reserveAbi,
          functionName: 'verifyFundingEngineReserves', args: [parseEther('10')],
        })
        results.push({ step: 'Reserves verified: engine balance matches deposits', hash })

      } else if (variant === 'neutral') {
        // --- Minor Delays: solvency 68, $480M/$720M, 7 ETH (partial), milestone 80% ---
        let hash = await tx(admin, pub, {
          address: sol, abi: solvencyAbi, functionName: 'updateProjectFinancials',
          args: [PROJECT_ID, usd(480_000_000n), usd(720_000_000n), usd(1_800_000n), usd(2_200_000n)],
        })
        results.push({ step: 'Financials: $480M deployed, $720M remaining, burn $2.2M/mo', hash })

        hash = await tx(workflow, pub, {
          address: sol, abi: solvencyAbi,
          functionName: 'receiveSolvencyReport', args: [solReport(68, 1, 72, 60, 65, 75, false)],
        })
        results.push({ step: 'Solvency: 68 (MEDIUM) — slightly over budget', hash })

        hash = await tx(investor, pub, {
          address: eng, abi: fundingAbi, functionName: 'invest', args: [1n], value: parseEther('7'),
        })
        results.push({ step: 'Investor deposits 7 ETH → Round #1 still OPEN (7/10 ETH)', hash })

        hash = await tx(workflow, pub, {
          address: ms, abi: milestoneAbi,
          functionName: 'receiveMilestoneReport', args: [msReport(0, 80, 75, false)],
        })
        results.push({ step: 'Milestone 0 at 80% — not approved, tranche LOCKED', hash })

        hash = await tx(admin, pub, {
          address: res, abi: reserveAbi,
          functionName: 'verifyFundingEngineReserves', args: [parseEther('7')],
        })
        results.push({ step: 'Reserves verified: 7 ETH on deposit', hash })

      } else if (variant === 'bad') {
        // --- Budget Overruns: solvency 48→42, $580M/$620M, 5 ETH, milestone 60% ---
        let hash = await tx(admin, pub, {
          address: sol, abi: solvencyAbi, functionName: 'updateProjectFinancials',
          args: [PROJECT_ID, usd(580_000_000n), usd(620_000_000n), usd(1_500_000n), usd(3_800_000n)],
        })
        results.push({ step: 'Financials: $580M deployed, $620M remaining, burn $3.8M/mo', hash })

        hash = await tx(workflow, pub, {
          address: sol, abi: solvencyAbi,
          functionName: 'receiveSolvencyReport', args: [solReport(48, 2, 50, 42, 40, 55, false)],
        })
        results.push({ step: 'Solvency: 48 (HIGH) — budget overruns begin', hash })

        hash = await tx(workflow, pub, {
          address: sol, abi: solvencyAbi,
          functionName: 'receiveSolvencyReport', args: [solReport(42, 2, 45, 38, 35, 48, false)],
        })
        results.push({ step: 'Solvency drops to 42 (HIGH) — two consecutive drops', hash })

        hash = await tx(investor, pub, {
          address: eng, abi: fundingAbi, functionName: 'invest', args: [1n], value: parseEther('5'),
        })
        results.push({ step: 'Investor deposits 5 ETH → Round #1 still OPEN (5/10 ETH)', hash })

        hash = await tx(workflow, pub, {
          address: ms, abi: milestoneAbi,
          functionName: 'receiveMilestoneReport', args: [msReport(0, 60, 55, false)],
        })
        results.push({ step: 'Milestone 0 at 60% — stuck, tranche LOCKED', hash })

        hash = await tx(admin, pub, {
          address: res, abi: reserveAbi,
          functionName: 'verifyFundingEngineReserves', args: [parseEther('5')],
        })
        results.push({ step: 'Reserves verified: only 5 ETH on deposit', hash })
      }

    // =====================================================================
    // STAGE 2: Construction (2017-2019)
    // =====================================================================
    } else if (stage === 2) {
      if (variant === 'good') {
        // --- Steady Progress: solvency 62→58, $700M/$500M, milestone 1 complete ---
        let hash = await tx(workflow, pub, {
          address: sol, abi: solvencyAbi,
          functionName: 'receiveSolvencyReport', args: [solReport(62, 1, 68, 58, 55, 65, false)],
        })
        results.push({ step: 'Solvency: 62 (MEDIUM) — holding steady despite pressures', hash })

        hash = await tx(admin, pub, {
          address: sol, abi: solvencyAbi, functionName: 'updateProjectFinancials',
          args: [PROJECT_ID, usd(700_000_000n), usd(500_000_000n), usd(1_500_000n), usd(2_500_000n)],
        })
        results.push({ step: 'Financials: $700M deployed, $500M remaining, burn $2.5M/mo', hash })

        hash = await tx(workflow, pub, {
          address: sol, abi: solvencyAbi,
          functionName: 'receiveSolvencyReport', args: [solReport(58, 1, 62, 55, 48, 65, false)],
        })
        results.push({ step: 'Solvency: 58 (MEDIUM) — stable, manageable decline', hash })

        hash = await tx(workflow, pub, {
          address: ms, abi: milestoneAbi,
          functionName: 'receiveMilestoneReport', args: [msReport(1, 100, 85, true)],
        })
        results.push({ step: 'Milestone 1 (Steel Framing) complete → 25% tranche released', hash })

        hash = await tx(admin, pub, {
          address: res, abi: reserveAbi,
          functionName: 'verifyFundingEngineReserves', args: [parseEther('10')],
        })
        results.push({ step: 'Reserves verified: 50% of tranches now released', hash })

      } else if (variant === 'neutral') {
        // --- Slowdown: solvency 42→38, $950M/$250M, milestone 1 complete at inflated cost ---
        let hash = await tx(workflow, pub, {
          address: sol, abi: solvencyAbi,
          functionName: 'receiveSolvencyReport', args: [solReport(42, 2, 45, 40, 32, 48, false)],
        })
        results.push({ step: 'Solvency: 42 (HIGH) — capital controls biting hard', hash })

        hash = await tx(admin, pub, {
          address: sol, abi: solvencyAbi, functionName: 'updateProjectFinancials',
          args: [PROJECT_ID, usd(950_000_000n), usd(250_000_000n), usd(1_000_000n), usd(5_200_000n)],
        })
        results.push({ step: 'Financials: $950M deployed, $250M remaining, burn $5.2M/mo', hash })

        hash = await tx(workflow, pub, {
          address: sol, abi: solvencyAbi,
          functionName: 'receiveSolvencyReport', args: [solReport(38, 2, 40, 35, 28, 42, false)],
        })
        results.push({ step: 'Solvency drops to 38 (HIGH) — approaching rescue threshold', hash })

        hash = await tx(workflow, pub, {
          address: ms, abi: milestoneAbi,
          functionName: 'receiveMilestoneReport', args: [msReport(1, 100, 70, true)],
        })
        results.push({ step: 'Milestone 1 (Steel Framing) complete at inflated cost → tranche released', hash })

        hash = await tx(admin, pub, {
          address: res, abi: reserveAbi,
          functionName: 'verifyFundingEngineReserves', args: [parseEther('10')],
        })
        results.push({ step: 'Reserve coverage declining — burn outpacing velocity', hash })

      } else if (variant === 'bad') {
        // --- Capital Crisis: solvency 35→28, $1.05B/$150M, milestone 1 stuck at 85% ---
        let hash = await tx(workflow, pub, {
          address: sol, abi: solvencyAbi,
          functionName: 'receiveSolvencyReport', args: [solReport(35, 2, 38, 32, 25, 40, false)],
        })
        results.push({ step: 'Solvency: 35 (HIGH) — liens mounting, China restricts capital', hash })

        hash = await tx(admin, pub, {
          address: sol, abi: solvencyAbi, functionName: 'updateProjectFinancials',
          args: [PROJECT_ID, usd(1_050_000_000n), usd(150_000_000n), usd(500_000n), usd(6_800_000n)],
        })
        results.push({ step: 'Financials: $1.05B deployed, $150M remaining, burn $6.8M/mo', hash })

        hash = await tx(workflow, pub, {
          address: sol, abi: solvencyAbi,
          functionName: 'receiveSolvencyReport', args: [solReport(28, 2, 30, 25, 18, 32, false)],
        })
        results.push({ step: 'Solvency crashes to 28 (HIGH) — one step from rescue threshold', hash })

        hash = await tx(workflow, pub, {
          address: ms, abi: milestoneAbi,
          functionName: 'receiveMilestoneReport', args: [msReport(1, 85, 60, false)],
        })
        results.push({ step: 'Milestone 1 (Steel Framing) stuck at 85% — construction stalls', hash })

        hash = await tx(admin, pub, {
          address: res, abi: reserveAbi,
          functionName: 'verifyFundingEngineReserves', args: [parseEther('10')],
        })
        results.push({ step: 'Reserve check: $150M left of $1.2B — dangerously low', hash })
      }

    // =====================================================================
    // STAGE 3: Resolution (2019-2026)
    // =====================================================================
    } else if (stage === 3) {
      if (variant === 'good') {
        // --- Recovery: solvency 52→58, new standard round, milestone 2 complete ---
        let hash = await tx(workflow, pub, {
          address: sol, abi: solvencyAbi,
          functionName: 'receiveSolvencyReport', args: [solReport(52, 1, 55, 48, 50, 58, false)],
        })
        results.push({ step: 'Solvency: 52 (MEDIUM) — project stabilizing on its own', hash })

        hash = await tx(admin, pub, {
          address: sol, abi: solvencyAbi, functionName: 'updateProjectFinancials',
          args: [PROJECT_ID, usd(1_000_000_000n), usd(200_000_000n), usd(1_200_000n), usd(3_000_000n)],
        })
        results.push({ step: 'Financials: $1B deployed, $200M remaining, burn $3.0M/mo', hash })

        // Create new standard funding round
        hash = await tx(admin, pub, {
          address: eng, abi: fundingAbi, functionName: 'createFundingRound',
          args: [PROJECT_ID, parseEther('8'), BigInt(Math.floor(Date.now() / 1000) + 86400 * 30), [2], [10000]],
        })
        results.push({ step: 'New standard Round #2 created: 8 ETH target', hash })

        // Find the new round ID
        const roundIds = await pub.readContract({
          address: eng, abi: fundingAbi, functionName: 'getProjectRounds', args: [PROJECT_ID],
        }) as readonly bigint[]
        const newRoundId = roundIds[roundIds.length - 1]

        hash = await tx(investor, pub, {
          address: eng, abi: fundingAbi, functionName: 'invest', args: [newRoundId], value: parseEther('8'),
        })
        results.push({ step: `Investor deposits 8 ETH → Round #${newRoundId} FUNDED`, hash })

        hash = await tx(workflow, pub, {
          address: ms, abi: milestoneAbi,
          functionName: 'receiveMilestoneReport', args: [msReport(2, 100, 88, true)],
        })
        results.push({ step: 'Milestone 2 (MEP Systems) complete → tranche released', hash })

        hash = await tx(workflow, pub, {
          address: sol, abi: solvencyAbi,
          functionName: 'receiveSolvencyReport', args: [solReport(58, 1, 62, 55, 55, 62, false)],
        })
        results.push({ step: 'Recovery: solvency improves to 58 (MEDIUM) — project on track', hash })

      } else if (variant === 'neutral') {
        // --- Rescue Funded: solvency 22 → rescue with 39% premium ---
        let hash = await tx(workflow, pub, {
          address: sol, abi: solvencyAbi,
          functionName: 'receiveSolvencyReport', args: [solReport(22, 3, 20, 18, 22, 28, true)],
        })
        results.push({ step: 'CRITICAL solvency 22 — rescue threshold breached', hash })

        // Trigger rescue directly for demo reliability
        await ensureRole(admin, pub, eng, fundingAbi, 'SOLVENCY_ORACLE_ROLE')
        hash = await tx(admin, pub, {
          address: eng, abi: fundingAbi,
          functionName: 'initiateRescueFunding', args: [PROJECT_ID, 22],
        })
        results.push({ step: 'Rescue round created — premium: 39%', hash })

        // Find rescue round
        const roundIds = await pub.readContract({
          address: eng, abi: fundingAbi, functionName: 'getProjectRounds', args: [PROJECT_ID],
        }) as readonly bigint[]
        const rescueId = roundIds[roundIds.length - 1]

        // Read the actual target from the contract
        const roundInfo = await pub.readContract({
          address: eng, abi: fundingAbi, functionName: 'getRoundInfo', args: [rescueId],
        }) as readonly unknown[]
        const target = toBig(roundInfo[3])
        const premiumBps = toBig(roundInfo[8])
        const premiumPct = Number(premiumBps) / 100
        const premiumAmount = (target * premiumBps) / 10000n

        results.push({
          step: `Rescue round #${rescueId}: target ${formatEther(target)} ETH, +${premiumPct}% premium`,
          data: { rescueRoundId: Number(rescueId), premiumPct },
        })

        // Admin deposits premium pool
        hash = await tx(admin, pub, {
          address: eng, abi: fundingAbi,
          functionName: 'depositRescuePremium', args: [rescueId],
          value: premiumAmount,
        })
        results.push({ step: `Admin deposits ${formatEther(premiumAmount)} ETH rescue premium pool`, hash })

        // Investor funds rescue round
        hash = await tx(investor, pub, {
          address: eng, abi: fundingAbi, functionName: 'invest', args: [rescueId], value: target,
        })
        results.push({ step: `Rescue investor deposits ${formatEther(target)} ETH → Round FUNDED`, hash })

        // Release rescue tranche
        await ensureRole(admin, pub, eng, fundingAbi, 'MILESTONE_ORACLE_ROLE')
        hash = await tx(admin, pub, {
          address: eng, abi: fundingAbi, functionName: 'releaseTranche', args: [PROJECT_ID, 0],
        })
        results.push({ step: 'Rescue tranche released (100%) → funds available for claim', hash })

        // Investor claims with premium
        hash = await tx(investor, pub, {
          address: eng, abi: fundingAbi, functionName: 'claimReleasedFunds', args: [rescueId],
        })
        const totalPayout = target + premiumAmount
        results.push({ step: `Investor claims: ${formatEther(target)} + ${formatEther(premiumAmount)} = ${formatEther(totalPayout)} ETH`, hash })

        // Recovery
        hash = await tx(workflow, pub, {
          address: sol, abi: solvencyAbi,
          functionName: 'receiveSolvencyReport', args: [solReport(48, 1, 52, 45, 44, 52, false)],
        })
        results.push({ step: 'Recovery: solvency improves to 48 (MEDIUM) — rescue capital working', hash })

      } else if (variant === 'bad') {
        // --- Desperate Measures: solvency 10 → rescue with 45% premium ---
        let hash = await tx(workflow, pub, {
          address: sol, abi: solvencyAbi,
          functionName: 'receiveSolvencyReport', args: [solReport(10, 3, 8, 5, 12, 15, true)],
        })
        results.push({ step: 'CRITICAL solvency 10 — most severe collapse', hash })

        // Trigger rescue directly
        await ensureRole(admin, pub, eng, fundingAbi, 'SOLVENCY_ORACLE_ROLE')
        hash = await tx(admin, pub, {
          address: eng, abi: fundingAbi,
          functionName: 'initiateRescueFunding', args: [PROJECT_ID, 10],
        })
        results.push({ step: 'Rescue round created — premium: 45%', hash })

        // Find rescue round
        const roundIds = await pub.readContract({
          address: eng, abi: fundingAbi, functionName: 'getProjectRounds', args: [PROJECT_ID],
        }) as readonly bigint[]
        const rescueId = roundIds[roundIds.length - 1]

        // Read actual target and premium from contract
        const roundInfo = await pub.readContract({
          address: eng, abi: fundingAbi, functionName: 'getRoundInfo', args: [rescueId],
        }) as readonly unknown[]
        const target = toBig(roundInfo[3])
        const premiumBps = toBig(roundInfo[8])
        const premiumPct = Number(premiumBps) / 100
        const premiumAmount = (target * premiumBps) / 10000n

        results.push({
          step: `Rescue round #${rescueId}: target ${formatEther(target)} ETH, +${premiumPct}% premium`,
          data: { rescueRoundId: Number(rescueId), premiumPct },
        })

        // Admin deposits premium pool
        hash = await tx(admin, pub, {
          address: eng, abi: fundingAbi,
          functionName: 'depositRescuePremium', args: [rescueId],
          value: premiumAmount,
        })
        results.push({ step: `Admin deposits ${formatEther(premiumAmount)} ETH rescue premium pool`, hash })

        // Investor funds rescue round
        hash = await tx(investor, pub, {
          address: eng, abi: fundingAbi, functionName: 'invest', args: [rescueId], value: target,
        })
        results.push({ step: `Rescue investor deposits ${formatEther(target)} ETH → Round FUNDED`, hash })

        // Release rescue tranche
        await ensureRole(admin, pub, eng, fundingAbi, 'MILESTONE_ORACLE_ROLE')
        hash = await tx(admin, pub, {
          address: eng, abi: fundingAbi, functionName: 'releaseTranche', args: [PROJECT_ID, 0],
        })
        results.push({ step: 'Rescue tranche released (100%) → funds available for claim', hash })

        // Investor claims with premium
        hash = await tx(investor, pub, {
          address: eng, abi: fundingAbi, functionName: 'claimReleasedFunds', args: [rescueId],
        })
        const totalPayout = target + premiumAmount
        results.push({ step: `Investor claims: ${formatEther(target)} + ${formatEther(premiumAmount)} = ${formatEther(totalPayout)} ETH`, hash })

        // Partial recovery only
        hash = await tx(workflow, pub, {
          address: sol, abi: solvencyAbi,
          functionName: 'receiveSolvencyReport', args: [solReport(35, 2, 38, 30, 32, 40, false)],
        })
        results.push({ step: 'Partial recovery: solvency to 35 (HIGH) — late intervention is expensive', hash })
      }

    } else {
      return NextResponse.json({ error: 'stage must be 1, 2, or 3' }, { status: 400 })
    }

    return NextResponse.json({ success: true, stage, variant, results })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
