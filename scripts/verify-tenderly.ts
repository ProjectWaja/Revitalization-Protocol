/**
 * Verify Tenderly Virtual TestNet Connection
 *
 * Checks that the RPC endpoint is reachable, the wallet is configured,
 * and key Chainlink contracts are accessible on the forked network.
 *
 * Usage:
 *   bun run scripts/verify-tenderly.ts
 */

import { createPublicClient, http, formatEther, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// ---------------------------------------------------------------------------
// Chainlink Sepolia contract addresses (should be available on fork)
// ---------------------------------------------------------------------------

const CHAINLINK_CONTRACTS = {
  'ETH/USD Data Feed': '0x694AA1769357215DE4FAC081bf1f309aDC325306',
  'CCIP Router': '0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59',
  'LINK Token': '0x779877A7B0D9E8603169DdbD7836e478b4624789',
} as const

// ERC-20 balanceOf ABI for checking LINK token
const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// AggregatorV3 latestRoundData ABI for checking Data Feed
const AGGREGATOR_ABI = [
  {
    name: 'latestRoundData',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pass(label: string, detail?: string) {
  console.log(`  [PASS] ${label}${detail ? ` — ${detail}` : ''}`)
}

function fail(label: string, detail?: string) {
  console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(60))
  console.log('Revitalization Protocol — Tenderly Connection Verification')
  console.log('='.repeat(60))

  const rpcUrl = process.env.TENDERLY_VIRTUAL_TESTNET_RPC
  if (!rpcUrl) {
    fail('RPC URL', 'TENDERLY_VIRTUAL_TESTNET_RPC not set in .env')
    process.exit(1)
  }

  const maskedRpc = rpcUrl.replace(/\/[^/]{8,}$/, '/***')
  console.log(`\nRPC: ${maskedRpc}`)

  let passed = 0
  let failed = 0

  // 1. Check RPC connectivity
  console.log('\n--- RPC Connectivity ---')
  const publicClient = createPublicClient({ transport: http(rpcUrl) })

  try {
    const chainId = await publicClient.getChainId()
    pass('Chain ID', `${chainId} (Sepolia = 11155111)`)
    passed++
  } catch (err: any) {
    fail('Chain ID', err.message)
    failed++
  }

  try {
    const blockNumber = await publicClient.getBlockNumber()
    pass('Block number', `${blockNumber}`)
    passed++
  } catch (err: any) {
    fail('Block number', err.message)
    failed++
  }

  // 2. Check wallet
  console.log('\n--- Wallet ---')
  const pk = (process.env.TENDERLY_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY) as Hex

  if (pk) {
    const account = privateKeyToAccount(pk)
    console.log(`  Address: ${account.address}`)

    try {
      const balance = await publicClient.getBalance({ address: account.address })
      const ethBalance = formatEther(balance)
      if (balance > 0n) {
        pass('ETH balance', `${ethBalance} ETH`)
      } else {
        fail('ETH balance', `0 ETH — run: bun run fund:tenderly`)
      }
      passed++
    } catch (err: any) {
      fail('ETH balance', err.message)
      failed++
    }
  } else {
    fail('Private key', 'No TENDERLY_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in .env')
    failed++
  }

  // 3. Check Chainlink contracts on fork
  console.log('\n--- Chainlink Contracts (Sepolia fork) ---')

  for (const [name, address] of Object.entries(CHAINLINK_CONTRACTS)) {
    try {
      const code = await publicClient.getCode({ address: address as `0x${string}` })
      if (code && code !== '0x') {
        pass(name, `${address.slice(0, 10)}... (contract exists)`)
        passed++
      } else {
        fail(name, 'No contract code at address')
        failed++
      }
    } catch (err: any) {
      fail(name, err.message)
      failed++
    }
  }

  // 4. Try reading ETH/USD price from Data Feed
  console.log('\n--- Data Feed Test ---')
  try {
    const result = await publicClient.readContract({
      address: CHAINLINK_CONTRACTS['ETH/USD Data Feed'] as `0x${string}`,
      abi: AGGREGATOR_ABI,
      functionName: 'latestRoundData',
    })
    const price = Number(result[1]) / 1e8
    pass('ETH/USD price', `$${price.toFixed(2)}`)
    passed++
  } catch (err: any) {
    fail('ETH/USD price', `Could not read — ${err.message?.slice(0, 80)}`)
    failed++
  }

  // 5. Check tenderly_setBalance support
  console.log('\n--- Tenderly RPC Methods ---')
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tenderly_setBalance',
        params: [['0x0000000000000000000000000000000000000001'], '0xDE0B6B3A7640000'],
        id: 1,
      }),
    })
    const result = await response.json()
    if (!result.error) {
      pass('tenderly_setBalance', 'supported')
      passed++
    } else {
      fail('tenderly_setBalance', result.error.message)
      failed++
    }
  } catch (err: any) {
    fail('tenderly_setBalance', err.message)
    failed++
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log('='.repeat(60))

  if (failed > 0) {
    console.log('\nSome checks failed. See above for details.')
    process.exit(1)
  } else {
    console.log('\nTenderly Virtual TestNet is fully connected and ready!')
    console.log('\nNext steps:')
    console.log('  1. Fund wallet:     bun run fund:tenderly')
    console.log('  2. Build contracts: forge build')
    console.log('  3. Deploy:          bun run deploy:tenderly')
  }
}

main().catch((err) => {
  console.error('\nVerification failed:', err.message ?? err)
  process.exit(1)
})
