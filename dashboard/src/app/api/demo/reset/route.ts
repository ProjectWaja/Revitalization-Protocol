import { NextResponse } from 'next/server'
import { IS_TENDERLY } from '@/lib/anvil'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    // Tenderly doesn't support anvil_reset — just return success (UI handles state clearing)
    if (IS_TENDERLY) {
      return NextResponse.json({ success: true, mode: 'tenderly' })
    }

    const rpcUrl = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'anvil_reset', params: [], id: 1 }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message ?? 'anvil_reset failed')
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
