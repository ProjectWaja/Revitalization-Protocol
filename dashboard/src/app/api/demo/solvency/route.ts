import { NextResponse } from 'next/server'
import { encodeAbiParameters, parseAbiParameters } from 'viem'
import { getPublicClient, getWalletClient, PROJECT_ID } from '@/lib/anvil'
import { loadAbi } from '@/lib/demo-abis'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { score, solvencyAddress } = await req.json()
    if (score < 0 || score > 100) return NextResponse.json({ error: 'Score must be 0-100' }, { status: 400 })

    const riskLevel = score >= 75 ? 0 : score >= 50 ? 1 : score >= 25 ? 2 : 3
    const triggerRescue = score < 25

    // Derive component scores from overall with some variance
    const fh = Math.min(100, Math.max(0, score + Math.round((Math.random() - 0.5) * 20)))
    const ce = Math.min(100, Math.max(0, score + Math.round((Math.random() - 0.5) * 20)))
    const fm = Math.min(100, Math.max(0, score + Math.round((Math.random() - 0.5) * 20)))
    const ra = Math.min(100, Math.max(0, score + Math.round((Math.random() - 0.5) * 20)))

    const report = encodeAbiParameters(
      parseAbiParameters('bytes32, uint8, uint8, uint8, uint8, uint8, uint8, bool, uint64'),
      [PROJECT_ID, score, riskLevel, fh, ce, fm, ra, triggerRescue, BigInt(Math.floor(Date.now() / 1000))],
    )

    const pub = getPublicClient()
    const wf = getWalletClient('workflow')
    const abi = loadAbi('SolvencyConsumer')

    const hash = await wf.writeContract({ address: solvencyAddress, abi, functionName: 'receiveSolvencyReport', args: [report] })
    await pub.waitForTransactionReceipt({ hash })

    return NextResponse.json({ success: true, hash, score, riskLevel, triggerRescue })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
