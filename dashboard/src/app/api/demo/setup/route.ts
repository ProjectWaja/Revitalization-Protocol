import { NextResponse } from 'next/server'
import { parseEther, type Hex } from 'viem'
import { getPublicClient, getWalletClient, PROJECT_ID } from '@/lib/anvil'
import { loadArtifact } from '@/lib/demo-abis'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const pub = getPublicClient()
    const admin = getWalletClient('admin')
    const workflow = getWalletClient('workflow')

    const solvency = loadArtifact('SolvencyConsumer')
    const milestone = loadArtifact('MilestoneConsumer')
    const funding = loadArtifact('TokenizedFundingEngine')
    const reserve = loadArtifact('ReserveVerifier')

    // --- Deploy ---
    let hash = await admin.deployContract({ abi: solvency.abi, bytecode: solvency.bytecode, args: [workflow.account.address] })
    let receipt = await pub.waitForTransactionReceipt({ hash })
    const solvencyAddr = receipt.contractAddress!

    hash = await admin.deployContract({ abi: milestone.abi, bytecode: milestone.bytecode, args: [workflow.account.address] })
    receipt = await pub.waitForTransactionReceipt({ hash })
    const milestoneAddr = receipt.contractAddress!

    hash = await admin.deployContract({
      abi: funding.abi, bytecode: funding.bytecode,
      args: ['https://rvp.example.com/metadata/{id}.json', '0x0000000000000000000000000000000000000000', 0n],
    })
    receipt = await pub.waitForTransactionReceipt({ hash })
    const engineAddr = receipt.contractAddress!

    hash = await admin.deployContract({ abi: reserve.abi, bytecode: reserve.bytecode, args: [engineAddr] })
    receipt = await pub.waitForTransactionReceipt({ hash })
    const reserveAddr = receipt.contractAddress!

    // --- Wire hooks ---
    hash = await admin.writeContract({ address: solvencyAddr, abi: solvency.abi, functionName: 'setRescueFundingEngine', args: [engineAddr] })
    await pub.waitForTransactionReceipt({ hash })

    hash = await admin.writeContract({ address: milestoneAddr, abi: milestone.abi, functionName: 'setFundingEngine', args: [engineAddr] })
    await pub.waitForTransactionReceipt({ hash })

    // Grant roles
    const solvencyRole = await pub.readContract({ address: engineAddr, abi: funding.abi, functionName: 'SOLVENCY_ORACLE_ROLE' }) as Hex
    hash = await admin.writeContract({ address: engineAddr, abi: funding.abi, functionName: 'grantRole', args: [solvencyRole, solvencyAddr] })
    await pub.waitForTransactionReceipt({ hash })

    const milestoneRole = await pub.readContract({ address: engineAddr, abi: funding.abi, functionName: 'MILESTONE_ORACLE_ROLE' }) as Hex
    hash = await admin.writeContract({ address: engineAddr, abi: funding.abi, functionName: 'grantRole', args: [milestoneRole, milestoneAddr] })
    await pub.waitForTransactionReceipt({ hash })

    // --- Register project ---
    hash = await admin.writeContract({
      address: solvencyAddr, abi: solvency.abi, functionName: 'registerProject',
      args: [PROJECT_ID, 50_000_000_000_000n, 15_000_000_000_000n, 35_000_000_000_000n, 2_000_000_000_000n, 1_500_000_000_000n],
    })
    await pub.waitForTransactionReceipt({ hash })

    hash = await admin.writeContract({
      address: milestoneAddr, abi: milestone.abi, functionName: 'registerProjectMilestones',
      args: [PROJECT_ID, 4],
    })
    await pub.waitForTransactionReceipt({ hash })

    hash = await admin.writeContract({
      address: reserveAddr, abi: reserve.abi, functionName: 'configureProjectReserves',
      args: [PROJECT_ID, '0x0000000000000000000000000000000000000000', engineAddr, 50_000_000_000_000n, 8000n],
    })
    await pub.waitForTransactionReceipt({ hash })

    // --- Create first funding round ---
    hash = await admin.writeContract({
      address: engineAddr, abi: funding.abi, functionName: 'createFundingRound',
      args: [PROJECT_ID, parseEther('10'), BigInt(Math.floor(Date.now() / 1000) + 86400 * 30), [0, 1, 2, 3], [2500, 2500, 2500, 2500]],
    })
    await pub.waitForTransactionReceipt({ hash })

    // --- Submit initial solvency report (score 72, MEDIUM) ---
    const { encodeAbiParameters, parseAbiParameters } = await import('viem')
    const solvencyReport = encodeAbiParameters(
      parseAbiParameters('bytes32, uint8, uint8, uint8, uint8, uint8, uint8, bool, uint64'),
      [PROJECT_ID, 72, 1, 80, 65, 68, 85, false, BigInt(Math.floor(Date.now() / 1000))],
    )
    const wfClient = getWalletClient('workflow')
    hash = await wfClient.writeContract({ address: solvencyAddr, abi: solvency.abi, functionName: 'receiveSolvencyReport', args: [solvencyReport] })
    await pub.waitForTransactionReceipt({ hash })

    return NextResponse.json({
      success: true,
      addresses: {
        solvencyConsumer: solvencyAddr,
        milestoneConsumer: milestoneAddr,
        fundingEngine: engineAddr,
        reserveVerifier: reserveAddr,
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
