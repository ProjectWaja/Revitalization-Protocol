import { NextResponse } from 'next/server'
import { encodeAbiParameters, parseAbiParameters, parseEther, type Address } from 'viem'
import { getPublicClient, getWalletClient, PROJECT_ID } from '@/lib/anvil'
import { loadAbi } from '@/lib/demo-abis'

export const dynamic = 'force-dynamic'

interface StepResult {
  step: string
  hash?: string
  data?: Record<string, unknown>
}

async function tx(
  client: ReturnType<typeof getWalletClient>,
  pub: ReturnType<typeof getPublicClient>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any,
) {
  const hash = await client.writeContract(params)
  await pub.waitForTransactionReceipt({ hash })
  return hash
}

export async function POST(req: Request) {
  try {
    const { stage, addresses } = await req.json()
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

    const solvencyAddr = addresses.solvencyConsumer as Address
    const milestoneAddr = addresses.milestoneConsumer as Address
    const engineAddr = addresses.fundingEngine as Address
    const reserveAddr = addresses.reserveVerifier as Address

    const results: StepResult[] = []

    if (stage === 1) {
      // =====================================================================
      // Stage 1: "The Build" (2015-2017) — Healthy project, funding flowing
      // =====================================================================

      // Step 1: Set Oceanwide financials ($1.2B budget, $400M deployed)
      let hash = await tx(admin, pub, {
        address: solvencyAddr, abi: solvencyAbi,
        functionName: 'updateProjectFinancials',
        args: [PROJECT_ID, 400_000_000n * 1000000n, 800_000_000n * 1000000n, 2_000_000n * 1000000n, 1_500_000n * 1000000n],
      })
      results.push({ step: 'Set financials: $1.2B budget, $400M deployed, $800M remaining', hash })

      // Step 2: Submit solvency score 82 (LOW risk)
      const report1 = encodeAbiParameters(
        parseAbiParameters('bytes32, uint8, uint8, uint8, uint8, uint8, uint8, bool, uint64'),
        [PROJECT_ID, 82, 0, 88, 72, 85, 90, false, BigInt(Math.floor(Date.now() / 1000))],
      )
      hash = await tx(workflow, pub, {
        address: solvencyAddr, abi: solvencyAbi,
        functionName: 'receiveSolvencyReport', args: [report1],
      })
      results.push({ step: 'Solvency: 82/100 (LOW) — FH:88 CE:72 FM:85 RA:90', hash })

      // Step 3: Check if round 1 exists; if not, we already have one from setup
      // The setup route creates round 1, so we skip creating another

      // Step 4: Investor deposits 10 ETH to fund round 1
      hash = await tx(investor, pub, {
        address: engineAddr, abi: fundingAbi,
        functionName: 'invest', args: [1n],
        value: parseEther('10'),
      })
      results.push({ step: 'Investor deposits 10 ETH -> Round #1 FUNDED', hash })

      // Step 5: Complete Milestone 0 (Foundation) -> 25% tranche released
      const msReport0 = encodeAbiParameters(
        parseAbiParameters('bytes32, uint8, uint8, uint8, bool, uint64'),
        [PROJECT_ID, 0, 100, 90, true, BigInt(Math.floor(Date.now() / 1000))],
      )
      hash = await tx(workflow, pub, {
        address: milestoneAddr, abi: milestoneAbi,
        functionName: 'receiveMilestoneReport', args: [msReport0],
      })
      results.push({ step: 'Milestone 0 (Foundation) complete -> 25% tranche released', hash })

      // Step 6: Verify reserves
      hash = await tx(admin, pub, {
        address: reserveAddr, abi: reserveAbi,
        functionName: 'verifyFundingEngineReserves', args: [parseEther('10')],
      })
      results.push({ step: 'Reserves verified: engine balance matches deposits', hash })

    } else if (stage === 2) {
      // =====================================================================
      // Stage 2: "The Stall" (2017-2019) — Capital drying up, solvency dropping
      // =====================================================================

      // Step 1: Solvency drops to 58 (MEDIUM)
      const report2a = encodeAbiParameters(
        parseAbiParameters('bytes32, uint8, uint8, uint8, uint8, uint8, uint8, bool, uint64'),
        [PROJECT_ID, 58, 1, 62, 55, 48, 65, false, BigInt(Math.floor(Date.now() / 1000))],
      )
      let hash = await tx(workflow, pub, {
        address: solvencyAddr, abi: solvencyAbi,
        functionName: 'receiveSolvencyReport', args: [report2a],
      })
      results.push({ step: 'Solvency drops to 58 (MEDIUM) — capital controls tighten', hash })

      // Step 2: Update financials — $750M deployed, burn rate increasing
      hash = await tx(admin, pub, {
        address: solvencyAddr, abi: solvencyAbi,
        functionName: 'updateProjectFinancials',
        args: [PROJECT_ID, 750_000_000n * 1000000n, 450_000_000n * 1000000n, 1_200_000n * 1000000n, 4_200_000n * 1000000n],
      })
      results.push({ step: 'Financials: $750M deployed, $450M remaining, burn $4.2M/mo', hash })

      // Step 3: Solvency drops further to 35 (HIGH)
      const report2b = encodeAbiParameters(
        parseAbiParameters('bytes32, uint8, uint8, uint8, uint8, uint8, uint8, bool, uint64'),
        [PROJECT_ID, 35, 2, 40, 35, 22, 38, false, BigInt(Math.floor(Date.now() / 1000))],
      )
      hash = await tx(workflow, pub, {
        address: solvencyAddr, abi: solvencyAbi,
        functionName: 'receiveSolvencyReport', args: [report2b],
      })
      results.push({ step: 'Solvency crashes to 35 (HIGH) — liens mounting, China restricts capital', hash })

      // Step 4: Financials worsen — $1.1B deployed, only $100M remaining
      hash = await tx(admin, pub, {
        address: solvencyAddr, abi: solvencyAbi,
        functionName: 'updateProjectFinancials',
        args: [PROJECT_ID, 1_100_000_000n * 1000000n, 100_000_000n * 1000000n, 500_000n * 1000000n, 6_800_000n * 1000000n],
      })
      results.push({ step: 'Financials: $1.1B deployed, $100M remaining, burn $6.8M/mo', hash })

      // Step 5: Complete Milestone 1 (Steel Framing) — at inflated cost
      const msReport1 = encodeAbiParameters(
        parseAbiParameters('bytes32, uint8, uint8, uint8, bool, uint64'),
        [PROJECT_ID, 1, 100, 85, true, BigInt(Math.floor(Date.now() / 1000))],
      )
      hash = await tx(workflow, pub, {
        address: milestoneAddr, abi: milestoneAbi,
        functionName: 'receiveMilestoneReport', args: [msReport1],
      })
      results.push({ step: 'Milestone 1 (Steel Framing) complete at inflated cost -> 25% tranche', hash })

      // Step 6: Reserve check — coverage declining
      hash = await tx(admin, pub, {
        address: reserveAddr, abi: reserveAbi,
        functionName: 'verifyFundingEngineReserves', args: [parseEther('10')],
      })
      results.push({ step: 'Reserve verification: coverage declining as funds released', hash })

    } else if (stage === 3) {
      // =====================================================================
      // Stage 3: "The Rescue" (What Could Have Been)
      // =====================================================================

      // Step 1: Solvency hits 18 (CRITICAL)
      const report3 = encodeAbiParameters(
        parseAbiParameters('bytes32, uint8, uint8, uint8, uint8, uint8, uint8, bool, uint64'),
        [PROJECT_ID, 18, 3, 15, 12, 20, 25, true, BigInt(Math.floor(Date.now() / 1000))],
      )
      let hash = await tx(workflow, pub, {
        address: solvencyAddr, abi: solvencyAbi,
        functionName: 'receiveSolvencyReport', args: [report3],
      })
      results.push({ step: 'CRITICAL solvency 18/100 — rescue threshold breached', hash })

      // Step 2: Directly trigger rescue funding on the engine
      // (The cross-module hook does this via try/catch; we call directly for demo reliability)
      const solvencyRole = await pub.readContract({
        address: engineAddr, abi: fundingAbi,
        functionName: 'SOLVENCY_ORACLE_ROLE',
      }) as `0x${string}`
      const adminHasRole = await pub.readContract({
        address: engineAddr, abi: fundingAbi,
        functionName: 'hasRole', args: [solvencyRole, admin.account.address],
      }) as boolean
      if (!adminHasRole) {
        await tx(admin, pub, {
          address: engineAddr, abi: fundingAbi,
          functionName: 'grantRole', args: [solvencyRole, admin.account.address],
        })
      }
      hash = await tx(admin, pub, {
        address: engineAddr, abi: fundingAbi,
        functionName: 'initiateRescueFunding', args: [PROJECT_ID, 18],
      })
      results.push({ step: 'Rescue round created with 41% premium for external investors', hash })

      // Find the rescue round ID
      const roundIds = await pub.readContract({
        address: engineAddr, abi: fundingAbi,
        functionName: 'getProjectRounds', args: [PROJECT_ID],
      }) as readonly bigint[]
      const rescueRoundId = roundIds[roundIds.length - 1]
      results.push({ step: `Rescue round #${rescueRoundId} — target: 8.2 ETH, +41% premium`, data: { rescueRoundId: Number(rescueRoundId) } })

      // Step 3: Admin deposits premium pool (~3.36 ETH for 41% of 8.2 ETH)
      hash = await tx(admin, pub, {
        address: engineAddr, abi: fundingAbi,
        functionName: 'depositRescuePremium', args: [rescueRoundId],
        value: parseEther('3.362'),
      })
      results.push({ step: 'Admin deposits 3.362 ETH rescue premium pool', hash })

      // Step 4: Rescue investor deposits 8.2 ETH -> round FUNDED
      hash = await tx(investor, pub, {
        address: engineAddr, abi: fundingAbi,
        functionName: 'invest', args: [rescueRoundId],
        value: parseEther('8.2'),
      })
      results.push({ step: 'Rescue investor deposits 8.2 ETH -> Round FUNDED', hash })

      // Step 5: Release rescue tranche (milestone 0 at 100%)
      // Rescue rounds have a single tranche tied to milestone 0
      // We call releaseTranche directly on the engine
      const milestoneRole = await pub.readContract({
        address: engineAddr, abi: fundingAbi,
        functionName: 'MILESTONE_ORACLE_ROLE',
      }) as `0x${string}`
      const adminHasMsRole = await pub.readContract({
        address: engineAddr, abi: fundingAbi,
        functionName: 'hasRole', args: [milestoneRole, admin.account.address],
      }) as boolean
      if (!adminHasMsRole) {
        await tx(admin, pub, {
          address: engineAddr, abi: fundingAbi,
          functionName: 'grantRole', args: [milestoneRole, admin.account.address],
        })
      }
      hash = await tx(admin, pub, {
        address: engineAddr, abi: fundingAbi,
        functionName: 'releaseTranche', args: [PROJECT_ID, 0],
      })
      results.push({ step: 'Rescue tranche released (100%) -> funds available for claim', hash })

      // Step 6: Investor claims with premium
      hash = await tx(investor, pub, {
        address: engineAddr, abi: fundingAbi,
        functionName: 'claimReleasedFunds', args: [rescueRoundId],
      })
      results.push({ step: 'Rescue investor claims: 8.2 ETH + 3.362 ETH (41% premium) = 11.562 ETH', hash })

      // Step 7: Recovery solvency improving to 55
      const report3b = encodeAbiParameters(
        parseAbiParameters('bytes32, uint8, uint8, uint8, uint8, uint8, uint8, bool, uint64'),
        [PROJECT_ID, 55, 1, 58, 52, 50, 60, false, BigInt(Math.floor(Date.now() / 1000))],
      )
      hash = await tx(workflow, pub, {
        address: solvencyAddr, abi: solvencyAbi,
        functionName: 'receiveSolvencyReport', args: [report3b],
      })
      results.push({ step: 'Recovery: solvency improves to 55 (MEDIUM) — project stabilizing', hash })

    } else {
      return NextResponse.json({ error: 'stage must be 1, 2, or 3' }, { status: 400 })
    }

    return NextResponse.json({ success: true, stage, results })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
