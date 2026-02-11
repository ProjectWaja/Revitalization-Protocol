import { NextResponse } from 'next/server'
import type { Hex } from 'viem'
import { getPublicClient, getWalletClient, PROJECT_ID } from '@/lib/anvil'
import { loadArtifact } from '@/lib/demo-abis'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { action, confidentialAddress, financialHealth, costExposure, fundingMomentum, runwayAdequacy } = await req.json()

    const pub = getPublicClient()
    const admin = getWalletClient('admin')
    const cc = loadArtifact('ConfidentialSolvencyCompute')

    if (action === 'deploy') {
      // Deploy ConfidentialSolvencyCompute
      const hash = await admin.deployContract({
        abi: cc.abi,
        bytecode: cc.bytecode,
      })
      const receipt = await pub.waitForTransactionReceipt({ hash })
      const addr = receipt.contractAddress!

      return NextResponse.json({ success: true, hash, address: addr })
    }

    if (action === 'compute') {
      if (!confidentialAddress) return NextResponse.json({ error: 'confidentialAddress required' }, { status: 400 })

      const fh = financialHealth ?? 80
      const ce = costExposure ?? 65
      const fm = fundingMomentum ?? 70
      const ra = runwayAdequacy ?? 85
      const nonce = BigInt(Date.now())

      const hash = await admin.writeContract({
        address: confidentialAddress,
        abi: cc.abi,
        functionName: 'computeSolvencyScore',
        args: [PROJECT_ID, fh, ce, fm, ra, nonce],
      })
      await pub.waitForTransactionReceipt({ hash })

      // Read back the result
      const result = await pub.readContract({
        address: confidentialAddress,
        abi: cc.abi,
        functionName: 'getLatestResult',
        args: [PROJECT_ID],
      }) as readonly [number, number, Hex, boolean, bigint]

      const count = await pub.readContract({
        address: confidentialAddress,
        abi: cc.abi,
        functionName: 'computationCount',
      }) as bigint

      return NextResponse.json({
        success: true,
        hash,
        result: {
          score: result[0],
          riskLevel: result[1],
          attestationHash: result[2],
          enclaveVerified: result[3],
          timestamp: Number(result[4]),
          computationCount: Number(count),
        },
        inputs: { financialHealth: fh, costExposure: ce, fundingMomentum: fm, runwayAdequacy: ra },
      })
    }

    if (action === 'read') {
      if (!confidentialAddress) return NextResponse.json({ error: 'confidentialAddress required' }, { status: 400 })

      const result = await pub.readContract({
        address: confidentialAddress,
        abi: cc.abi,
        functionName: 'getLatestResult',
        args: [PROJECT_ID],
      }) as readonly [number, number, Hex, boolean, bigint]

      const count = await pub.readContract({
        address: confidentialAddress,
        abi: cc.abi,
        functionName: 'computationCount',
      }) as bigint

      return NextResponse.json({
        success: true,
        result: {
          score: result[0],
          riskLevel: result[1],
          attestationHash: result[2],
          enclaveVerified: result[3],
          timestamp: Number(result[4]),
          computationCount: Number(count),
        },
      })
    }

    return NextResponse.json({ error: 'Invalid action. Use: deploy, compute, read' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
