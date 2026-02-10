import { NextResponse } from 'next/server'
import { encodeAbiParameters, parseAbiParameters } from 'viem'
import { getPublicClient, getWalletClient, PROJECT_ID } from '@/lib/anvil'
import { loadAbi } from '@/lib/demo-abis'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { milestoneId, milestoneAddress } = await req.json()
    if (milestoneId < 0 || milestoneId > 3) return NextResponse.json({ error: 'milestoneId must be 0-3' }, { status: 400 })

    const report = encodeAbiParameters(
      parseAbiParameters('bytes32, uint8, uint8, uint8, bool, uint64'),
      [PROJECT_ID, milestoneId, 100, 95, true, BigInt(Math.floor(Date.now() / 1000))],
    )

    const pub = getPublicClient()
    const wf = getWalletClient('workflow')
    const abi = loadAbi('MilestoneConsumer')

    const hash = await wf.writeContract({ address: milestoneAddress, abi, functionName: 'receiveMilestoneReport', args: [report] })
    await pub.waitForTransactionReceipt({ hash })

    return NextResponse.json({ success: true, hash, milestoneId })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
