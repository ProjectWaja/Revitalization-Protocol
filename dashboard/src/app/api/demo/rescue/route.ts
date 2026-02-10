import { NextResponse } from 'next/server'
import { encodeAbiParameters, parseAbiParameters } from 'viem'
import { getPublicClient, getWalletClient, PROJECT_ID } from '@/lib/anvil'
import { loadAbi } from '@/lib/demo-abis'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { solvencyAddress } = await req.json()

    const report = encodeAbiParameters(
      parseAbiParameters('bytes32, uint8, uint8, uint8, uint8, uint8, uint8, bool, uint64'),
      [PROJECT_ID, 15, 3, 20, 10, 15, 5, true, BigInt(Math.floor(Date.now() / 1000))],
    )

    const pub = getPublicClient()
    const wf = getWalletClient('workflow')
    const abi = loadAbi('SolvencyConsumer')

    const hash = await wf.writeContract({ address: solvencyAddress, abi, functionName: 'receiveSolvencyReport', args: [report] })
    await pub.waitForTransactionReceipt({ hash })

    return NextResponse.json({ success: true, hash, score: 15, riskLevel: 'CRITICAL', rescueTriggered: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
