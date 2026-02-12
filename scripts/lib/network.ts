/**
 * Shared network configuration for deploy scripts.
 *
 * Supports two networks:
 *   - "sepolia"  — Ethereum Sepolia testnet via Alchemy/Infura
 *   - "tenderly" — Tenderly Virtual TestNet (Sepolia fork)
 *
 * Set DEPLOY_NETWORK env var to switch networks.
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  type Chain,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Transport,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { readFileSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NetworkName = 'sepolia' | 'tenderly'

export interface NetworkConfig {
  network: NetworkName
  rpcUrl: string
  deployerPrivateKey: Hex
  chain: Chain
  account: ReturnType<typeof privateKeyToAccount>
  publicClient: PublicClient<Transport, Chain>
  walletClient: WalletClient<Transport, Chain>
}

// ---------------------------------------------------------------------------
// Tenderly Virtual TestNet chain definition (Sepolia fork)
// ---------------------------------------------------------------------------

export const tenderlyVirtualTestnet: Chain = {
  ...sepolia,
  id: sepolia.id, // Same chain ID as Sepolia since it's a fork
  name: 'Tenderly Virtual TestNet (Sepolia)',
  rpcUrls: {
    default: {
      http: [process.env.TENDERLY_VIRTUAL_TESTNET_RPC ?? ''],
    },
  },
}

// ---------------------------------------------------------------------------
// Load secrets (secrets.json > env vars)
// ---------------------------------------------------------------------------

function loadSecrets(): Record<string, string> {
  try {
    const secretsPath = join(import.meta.dir, '..', '..', 'config', 'secrets.json')
    return JSON.parse(readFileSync(secretsPath, 'utf-8'))
  } catch {
    return {}
  }
}

function getEnv(key: string, secrets: Record<string, string>): string {
  return secrets[key] ?? process.env[key] ?? ''
}

// ---------------------------------------------------------------------------
// getNetworkConfig — single entry point for all deploy scripts
// ---------------------------------------------------------------------------

export function getNetworkConfig(): NetworkConfig {
  const secrets = loadSecrets()
  const network = (getEnv('DEPLOY_NETWORK', secrets) || 'sepolia') as NetworkName

  if (network !== 'sepolia' && network !== 'tenderly') {
    throw new Error(`Invalid DEPLOY_NETWORK "${network}". Use "sepolia" or "tenderly".`)
  }

  let rpcUrl: string
  let deployerPrivateKey: Hex

  if (network === 'tenderly') {
    rpcUrl = getEnv('TENDERLY_VIRTUAL_TESTNET_RPC', secrets)
    if (!rpcUrl) {
      throw new Error(
        'Missing TENDERLY_VIRTUAL_TESTNET_RPC. Create a Virtual TestNet at https://dashboard.tenderly.co ' +
        'and paste the RPC URL in .env',
      )
    }
    // Use Tenderly-specific key if set, otherwise fall back to deployer key
    deployerPrivateKey = (
      getEnv('TENDERLY_PRIVATE_KEY', secrets) ||
      getEnv('DEPLOYER_PRIVATE_KEY', secrets)
    ) as Hex
  } else {
    rpcUrl = getEnv('SEPOLIA_RPC_URL', secrets)
    if (!rpcUrl) {
      throw new Error('Missing SEPOLIA_RPC_URL. Set it in .env or config/secrets.json.')
    }
    deployerPrivateKey = getEnv('DEPLOYER_PRIVATE_KEY', secrets) as Hex
  }

  if (!deployerPrivateKey) {
    throw new Error(
      'Missing private key. Set DEPLOYER_PRIVATE_KEY (or TENDERLY_PRIVATE_KEY for Tenderly) in .env.',
    )
  }

  const chain = network === 'tenderly' ? tenderlyVirtualTestnet : sepolia
  const account = privateKeyToAccount(deployerPrivateKey)

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  }) as PublicClient<Transport, Chain>

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  }) as WalletClient<Transport, Chain>

  return {
    network,
    rpcUrl,
    deployerPrivateKey,
    chain,
    account,
    publicClient,
    walletClient,
  }
}

// ---------------------------------------------------------------------------
// Helper: print network banner for deploy scripts
// ---------------------------------------------------------------------------

export function printNetworkBanner(config: NetworkConfig, scriptName: string) {
  const maskedRpc = config.rpcUrl.replace(/\/[^/]{8,}$/, '/***')
  const networkLabel = config.network === 'tenderly'
    ? 'Tenderly Virtual TestNet (Sepolia fork)'
    : `Ethereum Sepolia (${config.chain.id})`

  console.log('='.repeat(60))
  console.log(`Revitalization Protocol — ${scriptName}`)
  console.log('='.repeat(60))
  console.log(`\nNetwork:   ${networkLabel}`)
  console.log(`Deployer:  ${config.account.address}`)
  console.log(`RPC:       ${maskedRpc}`)
}

// ---------------------------------------------------------------------------
// Helper: check deployer balance with friendly error
// ---------------------------------------------------------------------------

export async function checkBalance(
  config: NetworkConfig,
  minEth = 0.01,
): Promise<number> {
  const balance = await config.publicClient.getBalance({
    address: config.account.address,
  })
  const balanceEth = Number(balance) / 1e18
  console.log(`Balance:   ${balanceEth.toFixed(4)} ETH`)

  if (balanceEth < minEth) {
    if (config.network === 'tenderly') {
      throw new Error(
        `Insufficient balance (${balanceEth} ETH). Run: bun run fund:tenderly`,
      )
    } else {
      throw new Error(
        `Insufficient balance (${balanceEth} ETH). Need at least ${minEth} ETH. ` +
        'Get testnet ETH from https://faucets.chain.link',
      )
    }
  }

  return balanceEth
}
