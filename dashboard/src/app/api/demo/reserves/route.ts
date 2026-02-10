import { NextResponse } from 'next/server'
import { getPublicClient, getWalletClient } from '@/lib/anvil'
import { loadAbi } from '@/lib/demo-abis'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { reserveAddress, engineAddress } = await req.json()
    const pub = getPublicClient()
    const admin = getWalletClient('admin')
    const abi = loadAbi('ReserveVerifier')

    // Get engine balance to pass to verification
    const balance = await pub.getBalance({ address: engineAddress })

    const hash = await admin.writeContract({
      address: reserveAddress,
      abi,
      functionName: 'verifyFundingEngineReserves',
      args: [balance],
    })
    await pub.waitForTransactionReceipt({ hash })

    return NextResponse.json({ success: true, hash })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
