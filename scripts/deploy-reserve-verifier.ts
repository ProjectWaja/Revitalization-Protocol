/**
 * Deploy ReserveVerifier.sol to Ethereum Sepolia
 *
 * Usage:
 *   bun run scripts/deploy-reserve-verifier.ts
 *
 * Required environment / secrets:
 *   DEPLOYER_PRIVATE_KEY  — Private key of the deploying wallet
 *   SEPOLIA_RPC_URL       — Alchemy/Infura Sepolia RPC endpoint
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface DeployConfig {
  deployerPrivateKey: Hex
  sepoliaRpcUrl: string
  fundingEngineAddress: Address
}

function loadConfig(): DeployConfig {
  let secrets: Record<string, string> = {}

  try {
    const secretsPath = join(import.meta.dir, '..', 'config', 'secrets.json')
    secrets = JSON.parse(readFileSync(secretsPath, 'utf-8'))
  } catch {
    // No secrets file — rely on env vars
  }

  const deployerPrivateKey = (
    secrets.DEPLOYER_PRIVATE_KEY ??
    process.env.DEPLOYER_PRIVATE_KEY ??
    ''
  ) as Hex

  const sepoliaRpcUrl =
    secrets.SEPOLIA_RPC_URL ??
    process.env.SEPOLIA_RPC_URL ??
    ''

  // Load funding engine address from prior deployment
  let fundingEngineAddress: Address = '0x0000000000000000000000000000000000000000' as Address
  try {
    const fundingDeploy = JSON.parse(
      readFileSync(join(import.meta.dir, '..', 'deployments', 'sepolia-funding.json'), 'utf-8'),
    )
    fundingEngineAddress = fundingDeploy.contractAddress as Address
  } catch {
    console.warn('No prior funding engine deployment found. Using zero address.')
  }

  if (!deployerPrivateKey) {
    throw new Error(
      'Missing DEPLOYER_PRIVATE_KEY. Set it in config/secrets.json or as an env var.',
    )
  }
  if (!sepoliaRpcUrl) {
    throw new Error(
      'Missing SEPOLIA_RPC_URL. Set it in config/secrets.json or as an env var.',
    )
  }

  return { deployerPrivateKey, sepoliaRpcUrl, fundingEngineAddress }
}

// ---------------------------------------------------------------------------
// Contract ABI
// ---------------------------------------------------------------------------

const RESERVE_VERIFIER_ABI = [
  {
    type: 'constructor',
    inputs: [{ name: '_fundingEngine', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'configureProjectReserves',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'projectId', type: 'bytes32' },
      { name: 'porFeedAddress', type: 'address' },
      { name: 'reserveWallet', type: 'address' },
      { name: 'claimedReserves', type: 'uint256' },
      { name: 'minimumReserveRatio', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(60))
  console.log('Revitalization Protocol — ReserveVerifier Deployment')
  console.log('='.repeat(60))

  const config = loadConfig()
  const account = privateKeyToAccount(config.deployerPrivateKey)

  console.log(`\nDeployer:  ${account.address}`)
  console.log(`Chain:     Ethereum Sepolia (${sepolia.id})`)
  console.log(`RPC:       ${config.sepoliaRpcUrl.replace(/\/[^/]*$/, '/***')}`)
  console.log(`Funding Engine: ${config.fundingEngineAddress}`)

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(config.sepoliaRpcUrl),
  })

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(config.sepoliaRpcUrl),
  })

  const balance = await publicClient.getBalance({ address: account.address })
  const balanceEth = Number(balance) / 1e18
  console.log(`Balance:   ${balanceEth.toFixed(4)} ETH`)

  if (balanceEth < 0.01) {
    throw new Error(
      `Insufficient balance (${balanceEth} ETH). Need at least 0.01 ETH. ` +
      'Get testnet ETH from https://faucets.chain.link',
    )
  }

  // Load compiled bytecode
  let bytecode: Hex

  try {
    const artifactPath = join(
      import.meta.dir,
      '..',
      'out',
      'ReserveVerifier.sol',
      'ReserveVerifier.json',
    )
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'))
    bytecode = artifact.bytecode.object as Hex
    console.log('\nLoaded bytecode from forge artifact')
  } catch {
    console.error(
      '\nNo compiled bytecode found. Compile the contract first:\n' +
      '  forge build\n',
    )
    process.exit(1)
  }

  // Deploy
  console.log('\nDeploying ReserveVerifier...')

  const hash = await walletClient.deployContract({
    abi: RESERVE_VERIFIER_ABI,
    bytecode,
    args: [config.fundingEngineAddress],
  })

  console.log(`TX hash:   ${hash}`)
  console.log('Waiting for confirmation...')

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const contractAddress = receipt.contractAddress!

  console.log(`\nDeployed!`)
  console.log(`Address:   ${contractAddress}`)
  console.log(`Block:     ${receipt.blockNumber}`)
  console.log(`Gas used:  ${receipt.gasUsed}`)

  // Configure demo project reserves
  console.log('\nConfiguring demo project reserves...')

  const projectId =
    '0x5265766974616c697a6174696f6e50726f746f636f6c00000000000000000001' as Hex

  const configHash = await walletClient.writeContract({
    address: contractAddress,
    abi: RESERVE_VERIFIER_ABI,
    functionName: 'configureProjectReserves',
    args: [
      projectId,
      '0x0000000000000000000000000000000000000000' as Address, // No PoR feed yet
      config.fundingEngineAddress,                             // Engine as reserve wallet
      50_000_000n * 1_000_000n,                               // $50M claimed
      8000n,                                                   // 80% minimum ratio
    ],
  })

  const configReceipt = await publicClient.waitForTransactionReceipt({ hash: configHash })
  console.log(`Configured: TX ${configHash} (block ${configReceipt.blockNumber})`)

  // Save deployment info
  const deployment = {
    network: 'sepolia',
    chainId: sepolia.id,
    contractAddress,
    fundingEngine: config.fundingEngineAddress,
    deployer: account.address,
    deployTxHash: hash,
    blockNumber: Number(receipt.blockNumber),
    demoProjectId: projectId,
    configTxHash: configHash,
    deployedAt: new Date().toISOString(),
  }

  const deploymentsDir = join(import.meta.dir, '..', 'deployments')
  mkdirSync(deploymentsDir, { recursive: true })
  const deploymentPath = join(deploymentsDir, 'sepolia-reserve-verifier.json')
  writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2))

  console.log(`\nDeployment saved to: deployments/sepolia-reserve-verifier.json`)

  console.log('\n' + '='.repeat(60))
  console.log('Deployment complete!')
  console.log('='.repeat(60))
}

main().catch((err) => {
  console.error('\nDeployment failed:', err.message ?? err)
  process.exit(1)
})
