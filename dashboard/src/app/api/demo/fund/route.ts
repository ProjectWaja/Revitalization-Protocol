import { NextResponse } from 'next/server'
import { parseEther } from 'viem'
import { getPublicClient, getWalletClient, PROJECT_ID } from '@/lib/anvil'
import { loadAbi } from '@/lib/demo-abis'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { engineAddress } = await req.json()
    const pub = getPublicClient()
    const admin = getWalletClient('admin')
    const abi = loadAbi('TokenizedFundingEngine')

    const hash = await admin.writeContract({
      address: engineAddress,
      abi,
      functionName: 'createFundingRound',
      args: [
        PROJECT_ID,
        parseEther('10'),
        BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
        [0, 1, 2, 3],
        [2500, 2500, 2500, 2500],
      ],
    })
    await pub.waitForTransactionReceipt({ hash })

    return NextResponse.json({ success: true, hash })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
