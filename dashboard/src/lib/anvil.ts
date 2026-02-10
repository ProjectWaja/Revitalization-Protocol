import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'

// Anvil deterministic accounts (publicly known test keys)
export const ANVIL_KEYS = {
  admin: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  workflow: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  investor: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
} as const

const RPC_URL = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'

export function getPublicClient() {
  return createPublicClient({ chain: foundry, transport: http(RPC_URL) })
}

export function getWalletClient(role: keyof typeof ANVIL_KEYS) {
  const account = privateKeyToAccount(ANVIL_KEYS[role])
  return createWalletClient({ account, chain: foundry, transport: http(RPC_URL) })
}

export const PROJECT_ID = '0x005265766974616c697a6174696f6e50726f746f636f6c000000000000000001' as `0x${string}`
