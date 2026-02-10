import { NextResponse } from 'next/server'
import { parseEther } from 'viem'
import { getPublicClient, getWalletClient } from '@/lib/anvil'
import { loadAbi } from '@/lib/demo-abis'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { roundId, amount, engineAddress } = await req.json()
    if (!roundId || !amount) return NextResponse.json({ error: 'roundId and amount required' }, { status: 400 })

    const pub = getPublicClient()
    const investor = getWalletClient('investor')
    const abi = loadAbi('TokenizedFundingEngine')

    const hash = await investor.writeContract({
      address: engineAddress,
      abi,
      functionName: 'invest',
      args: [BigInt(roundId)],
      value: parseEther(String(amount)),
    })
    await pub.waitForTransactionReceipt({ hash })

    return NextResponse.json({ success: true, hash, roundId, amount })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
