/**
 * Fund wallet on Tenderly Virtual TestNet
 *
 * Uses Tenderly's `tenderly_setBalance` RPC method to give the deployer
 * wallet unlimited test ETH. No faucet required!
 *
 * Usage:
 *   bun run scripts/fund-tenderly.ts
 *   bun run scripts/fund-tenderly.ts 0xYOUR_ADDRESS    # fund a specific address
 *   bun run scripts/fund-tenderly.ts 0xADDR 500        # fund with 500 ETH
 */

import { createPublicClient, http, formatEther, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getRpcUrl(): string {
  const rpc = process.env.TENDERLY_VIRTUAL_TESTNET_RPC
  if (!rpc) {
    throw new Error(
      'Missing TENDERLY_VIRTUAL_TESTNET_RPC in .env.\n' +
      'Create a Virtual TestNet at https://dashboard.tenderly.co and paste the RPC URL.',
    )
  }
  return rpc
}

function getDeployerAddress(): string {
  const pk = (process.env.TENDERLY_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY) as Hex
  if (!pk) {
    throw new Error('Missing TENDERLY_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in .env.')
  }
  return privateKeyToAccount(pk).address
}

// ---------------------------------------------------------------------------
// Fund wallet via tenderly_setBalance
// ---------------------------------------------------------------------------

async function main() {
  const rpcUrl = getRpcUrl()
  const targetAddress = process.argv[2] || getDeployerAddress()
  const ethAmount = Number(process.argv[3] || 1000) // Default: 1000 ETH

  // Convert ETH to hex wei
  const weiAmount = BigInt(ethAmount) * 10n ** 18n
  const hexWei = `0x${weiAmount.toString(16)}`

  console.log('='.repeat(60))
  console.log('Revitalization Protocol — Fund Tenderly Wallet')
  console.log('='.repeat(60))
  console.log(`\nTarget:    ${targetAddress}`)
  console.log(`Amount:    ${ethAmount} ETH`)
  console.log(`RPC:       ${rpcUrl.replace(/\/[^/]{8,}$/, '/***')}`)

  // Check balance before
  const publicClient = createPublicClient({ transport: http(rpcUrl) })
  const balanceBefore = await publicClient.getBalance({
    address: targetAddress as `0x${string}`,
  })
  console.log(`\nBefore:    ${formatEther(balanceBefore)} ETH`)

  // Call tenderly_setBalance
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tenderly_setBalance',
      params: [[targetAddress], hexWei],
      id: 1,
    }),
  })

  const result = await response.json()

  if (result.error) {
    throw new Error(`tenderly_setBalance failed: ${JSON.stringify(result.error)}`)
  }

  // Verify new balance
  const balanceAfter = await publicClient.getBalance({
    address: targetAddress as `0x${string}`,
  })
  console.log(`After:     ${formatEther(balanceAfter)} ETH`)
  console.log(`\nWallet funded successfully!`)
}

main().catch((err) => {
  console.error('\nFunding failed:', err.message ?? err)
  process.exit(1)
})
