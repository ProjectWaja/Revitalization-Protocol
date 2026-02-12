import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry, sepolia } from 'viem/chains'

// ---------------------------------------------------------------------------
// Network detection: Tenderly Virtual TestNet or local Anvil
// ---------------------------------------------------------------------------

const NETWORK = process.env.NEXT_PUBLIC_NETWORK ?? 'anvil'
const IS_TENDERLY = NETWORK === 'tenderly'

const RPC_URL = IS_TENDERLY
  ? (process.env.NEXT_PUBLIC_RPC_URL ?? '')
  : (process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545')

const CHAIN = IS_TENDERLY ? sepolia : foundry

// ---------------------------------------------------------------------------
// Wallet keys
// ---------------------------------------------------------------------------

// Anvil deterministic accounts (publicly known test keys)
const ANVIL_KEYS = {
  admin: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  workflow: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  investor: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
} as const

// For Tenderly, all roles use the deployer key (it's the contract owner)
const TENDERLY_KEY = (process.env.DEPLOYER_PRIVATE_KEY ?? '') as `0x${string}`

function getKey(role: keyof typeof ANVIL_KEYS): `0x${string}` {
  if (IS_TENDERLY) return TENDERLY_KEY
  return ANVIL_KEYS[role]
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export function getPublicClient() {
  return createPublicClient({ chain: CHAIN, transport: http(RPC_URL) })
}

export function getWalletClient(role: keyof typeof ANVIL_KEYS = 'admin') {
  const account = privateKeyToAccount(getKey(role))
  return createWalletClient({ account, chain: CHAIN, transport: http(RPC_URL) })
}

// ---------------------------------------------------------------------------
// Project ID (same across both networks)
// ---------------------------------------------------------------------------

export const PROJECT_ID = '0x5265766974616c697a6174696f6e50726f746f636f6c00000000000000000001' as `0x${string}`

// ---------------------------------------------------------------------------
// Exports for UI components
// ---------------------------------------------------------------------------

export { ANVIL_KEYS, IS_TENDERLY, RPC_URL, NETWORK }
