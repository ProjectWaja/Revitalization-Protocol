import { NextResponse } from 'next/server'
import { encodeAbiParameters, parseAbiParameters, formatEther } from 'viem'
import { getPublicClient, getWalletClient, PROJECT_ID } from '@/lib/anvil'
import { loadAbi } from '@/lib/demo-abis'

export const dynamic = 'force-dynamic'

/**
 * Simulates a full CRE workflow cycle:
 * Step 1: Fetch mock data (simulates HTTP + consensus)
 * Step 2: Read onchain state (simulates EVM DON reads)
 * Step 3: Compute scores (simulates Confidential Compute)
 * Step 4: Write reports onchain (simulates signed report delivery)
 *
 * This mirrors the real CRE pipeline: fetch → read → compute → write
 */
export async function POST(req: Request) {
  try {
    const { workflow, addresses } = await req.json()
    const pub = getPublicClient()
    const wf = getWalletClient('workflow')
    const steps: { step: string; result: string; duration: number }[] = []

    if (workflow === 'solvency' || workflow === 'all') {
      const start = Date.now()

      // Step 1: Simulate HTTP fetch + median consensus (cost indices)
      const costIndex = 105 + Math.round(Math.random() * 20) // 105-125 range
      steps.push({
        step: 'Fetch cost indices (HTTP + median consensus)',
        result: `Cost Index: ${costIndex} (3-node median)`,
        duration: Date.now() - start,
      })

      // Step 2: Read onchain financials (EVM DON mode)
      const t2 = Date.now()
      const solvencyAbi = loadAbi('SolvencyConsumer')
      let currentScore = 72
      try {
        const onchain = await pub.readContract({
          address: addresses.solvencyConsumer,
          abi: solvencyAbi,
          functionName: 'getLatestSolvency',
          args: [PROJECT_ID],
        }) as readonly [number, number, number, number, number, number, boolean, bigint]
        currentScore = onchain[0]
      } catch {
        // First run — no existing data
      }
      steps.push({
        step: 'Read onchain financials (EVM, DON mode)',
        result: `Current score: ${currentScore}, reading project state`,
        duration: Date.now() - t2,
      })

      // Step 3: Compute weighted solvency score (simulates CC)
      const t3 = Date.now()
      const fh = Math.min(100, Math.max(0, 70 + Math.round((Math.random() - 0.3) * 30)))
      const ce = Math.min(100, Math.max(0, 65 + Math.round((Math.random() - 0.3) * 25)))
      const fm = Math.min(100, Math.max(0, 68 + Math.round((Math.random() - 0.3) * 20)))
      const ra = Math.min(100, Math.max(0, 80 + Math.round((Math.random() - 0.3) * 20)))
      const score = Math.round(fh * 0.35 + ce * 0.20 + fm * 0.25 + ra * 0.20)
      const riskLevel = score >= 75 ? 0 : score >= 50 ? 1 : score >= 25 ? 2 : 3
      steps.push({
        step: 'Compute solvency (Confidential Compute)',
        result: `Score: ${score} (FH:${fh} CE:${ce} FM:${fm} RA:${ra}) Risk: ${['LOW','MEDIUM','HIGH','CRITICAL'][riskLevel]}`,
        duration: Date.now() - t3,
      })

      // Step 4: AI risk assessment (simulated)
      const t4 = Date.now()
      steps.push({
        step: 'AI risk assessment (Claude + identical consensus)',
        result: `Risk level ${riskLevel}: ${score >= 75 ? 'Healthy project fundamentals' : score >= 50 ? 'Monitor cost exposure trends' : 'Elevated risk — review funding velocity'}`,
        duration: Date.now() - t4,
      })

      // Step 5: Write report onchain
      const t5 = Date.now()
      const report = encodeAbiParameters(
        parseAbiParameters('bytes32, uint8, uint8, uint8, uint8, uint8, uint8, bool, uint64'),
        [PROJECT_ID, score, riskLevel, fh, ce, fm, ra, score < 25, BigInt(Math.floor(Date.now() / 1000))],
      )
      const hash = await wf.writeContract({
        address: addresses.solvencyConsumer,
        abi: solvencyAbi,
        functionName: 'receiveSolvencyReport',
        args: [report],
      })
      await pub.waitForTransactionReceipt({ hash })
      steps.push({
        step: 'Write signed report onchain',
        result: `tx: ${hash.slice(0, 18)}... (score: ${score})`,
        duration: Date.now() - t5,
      })
    }

    if (workflow === 'milestone' || workflow === 'all') {
      // Simulate milestone workflow — pick a random incomplete milestone
      const milestoneAbi = loadAbi('MilestoneConsumer')

      const t1 = Date.now()
      steps.push({
        step: 'Fetch satellite imagery (HTTP + median consensus)',
        result: `Imagery quality: ${85 + Math.round(Math.random() * 10)}%, coverage 92%`,
        duration: Date.now() - t1,
      })

      const t2 = Date.now()
      steps.push({
        step: 'Fetch permit status (HTTP + identical consensus)',
        result: 'All permits: APPROVED (3-node identical match)',
        duration: Date.now() - t2,
      })

      // Read current milestone states
      const t3 = Date.now()
      let targetMilestone = 0
      for (let i = 0; i < 4; i++) {
        try {
          const ms = await pub.readContract({
            address: addresses.milestoneConsumer,
            abi: milestoneAbi,
            functionName: 'getLatestMilestone',
            args: [PROJECT_ID, i],
          }) as readonly [number, number, boolean, bigint]
          if (ms[0] < 100) {
            targetMilestone = i
            break
          }
          targetMilestone = i + 1
        } catch {
          targetMilestone = i
          break
        }
      }
      if (targetMilestone > 3) targetMilestone = 3
      steps.push({
        step: 'Read onchain milestone config (EVM, DON)',
        result: `Next incomplete: Milestone #${targetMilestone}`,
        duration: Date.now() - t3,
      })

      // Write milestone report
      const t4 = Date.now()
      const progressScore = 90 + Math.round(Math.random() * 10)
      const report = encodeAbiParameters(
        parseAbiParameters('bytes32, uint8, uint8, uint8, bool, uint64'),
        [PROJECT_ID, targetMilestone, 100, progressScore, true, BigInt(Math.floor(Date.now() / 1000))],
      )
      const hash = await wf.writeContract({
        address: addresses.milestoneConsumer,
        abi: milestoneAbi,
        functionName: 'receiveMilestoneReport',
        args: [report],
      })
      await pub.waitForTransactionReceipt({ hash })
      steps.push({
        step: 'Write milestone report onchain',
        result: `Milestone #${targetMilestone} → 100% (score: ${progressScore}) tx: ${hash.slice(0, 18)}...`,
        duration: Date.now() - t4,
      })
    }

    if (workflow === 'funding' || workflow === 'all') {
      // Simulate funding engine workflow — read cross-module data
      const fundingAbi = loadAbi('TokenizedFundingEngine')
      const solvencyAbi = loadAbi('SolvencyConsumer')

      const t1 = Date.now()
      let roundCount = 0
      try {
        const rounds = await pub.readContract({
          address: addresses.fundingEngine,
          abi: fundingAbi,
          functionName: 'getProjectRounds',
          args: [PROJECT_ID],
        }) as readonly bigint[]
        roundCount = rounds.length
      } catch {
        // No rounds yet
      }
      steps.push({
        step: 'Read round state (EVM, DON mode, BFT)',
        result: `${roundCount} active round(s)`,
        duration: Date.now() - t1,
      })

      const t2 = Date.now()
      let solvScore = 0
      try {
        const sol = await pub.readContract({
          address: addresses.solvencyConsumer,
          abi: solvencyAbi,
          functionName: 'getLatestSolvency',
          args: [PROJECT_ID],
        }) as readonly [number, number, number, number, number, number, boolean, bigint]
        solvScore = sol[0]
      } catch {
        // No solvency data yet
      }
      steps.push({
        step: 'Read solvency score (cross-contract)',
        result: `Solvency: ${solvScore}/100`,
        duration: Date.now() - t2,
      })

      const t3 = Date.now()
      const engineBal = await pub.getBalance({ address: addresses.fundingEngine })
      steps.push({
        step: 'Read engine balance + compute health',
        result: `Engine: ${Number(formatEther(engineBal)).toFixed(2)} ETH — Health: ${solvScore >= 50 ? 'HEALTHY' : 'AT_RISK'}`,
        duration: Date.now() - t3,
      })
    }

    return NextResponse.json({
      success: true,
      workflow,
      steps,
      totalDuration: steps.reduce((sum, s) => sum + s.duration, 0),
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
