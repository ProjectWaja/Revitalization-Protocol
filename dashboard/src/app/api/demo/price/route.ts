import { NextResponse } from 'next/server'
import { getPublicClient, getWalletClient } from '@/lib/anvil'
import { loadAbi } from '@/lib/demo-abis'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { price, priceFeedAddress } = await req.json()
    if (!price || price <= 0) return NextResponse.json({ error: 'Price must be positive' }, { status: 400 })
    if (!priceFeedAddress) return NextResponse.json({ error: 'priceFeedAddress required' }, { status: 400 })

    // Convert USD price to 8-decimal format (e.g., $2500 → 250000000000)
    const answer = BigInt(Math.round(price * 1e8))

    const pub = getPublicClient()
    const admin = getWalletClient('admin')
    const abi = loadAbi('MockV3Aggregator')

    const hash = await admin.writeContract({
      address: priceFeedAddress,
      abi,
      functionName: 'updateAnswer',
      args: [answer],
    })
    await pub.waitForTransactionReceipt({ hash })

    return NextResponse.json({ success: true, hash, price, answer: answer.toString() })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
