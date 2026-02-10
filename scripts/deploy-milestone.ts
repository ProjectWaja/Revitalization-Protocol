/**
 * Deploy MilestoneConsumer.sol to Ethereum Sepolia
 *
 * Usage:
 *   bun run scripts/deploy-milestone.ts
 *
 * Required environment / secrets:
 *   DEPLOYER_PRIVATE_KEY  — Private key of the deploying wallet
 *   SEPOLIA_RPC_URL       — Alchemy/Infura Sepolia RPC endpoint
 *   AUTHORIZED_WORKFLOW   — (optional) CRE workflow DON address, defaults to deployer
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
  authorizedWorkflow?: Address
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

  const authorizedWorkflow = (
    secrets.AUTHORIZED_WORKFLOW ??
    process.env.AUTHORIZED_WORKFLOW ??
    undefined
  ) as Address | undefined

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

  return { deployerPrivateKey, sepoliaRpcUrl, authorizedWorkflow }
}

// ---------------------------------------------------------------------------
// Contract ABI
// ---------------------------------------------------------------------------

const MILESTONE_CONSUMER_ABI = [
  {
    type: 'constructor',
    inputs: [{ name: '_authorizedWorkflow', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'registerProjectMilestones',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'projectId', type: 'bytes32' },
      { name: 'totalMilestones', type: 'uint8' },
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
  {
    name: 'authorizedWorkflow',
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
  console.log('Revitalization Protocol — MilestoneConsumer Deployment')
  console.log('='.repeat(60))

  const config = loadConfig()
  const account = privateKeyToAccount(config.deployerPrivateKey)

  console.log(`\nDeployer:  ${account.address}`)
  console.log(`Chain:     Ethereum Sepolia (${sepolia.id})`)
  console.log(`RPC:       ${config.sepoliaRpcUrl.replace(/\/[^/]*$/, '/***')}`)

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(config.sepoliaRpcUrl),
  })

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(config.sepoliaRpcUrl),
  })

  // Check deployer balance
  const balance = await publicClient.getBalance({ address: account.address })
  const balanceEth = Number(balance) / 1e18
  console.log(`Balance:   ${balanceEth.toFixed(4)} ETH`)

  if (balanceEth < 0.01) {
    throw new Error(
      `Insufficient balance (${balanceEth} ETH). Need at least 0.01 ETH. ` +
      'Get testnet ETH from https://faucets.chain.link',
    )
  }

  // Determine authorized workflow address (default to deployer for testing)
  const authorizedWorkflow = config.authorizedWorkflow ?? account.address
  console.log(`Workflow:  ${authorizedWorkflow}`)

  // Load compiled bytecode
  let bytecode: Hex

  try {
    const artifactPath = join(
      import.meta.dir,
      '..',
      'out',
      'MilestoneConsumer.sol',
      'MilestoneConsumer.json',
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
  console.log('\nDeploying MilestoneConsumer...')

  const hash = await walletClient.deployContract({
    abi: MILESTONE_CONSUMER_ABI,
    bytecode,
    args: [authorizedWorkflow],
  })

  console.log(`TX hash:   ${hash}`)
  console.log('Waiting for confirmation...')

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const contractAddress = receipt.contractAddress!

  console.log(`\nDeployed!`)
  console.log(`Address:   ${contractAddress}`)
  console.log(`Block:     ${receipt.blockNumber}`)
  console.log(`Gas used:  ${receipt.gasUsed}`)

  // Register the demo project with 4 milestones
  console.log('\nRegistering demo project milestones...')

  const projectId =
    '0x5265766974616c697a6174696f6e50726f746f636f6c00000000000000000001' as Hex

  const regHash = await walletClient.writeContract({
    address: contractAddress,
    abi: MILESTONE_CONSUMER_ABI,
    functionName: 'registerProjectMilestones',
    args: [projectId, 4],
  })

  const regReceipt = await publicClient.waitForTransactionReceipt({
    hash: regHash,
  })
  console.log(`Registered: TX ${regHash} (block ${regReceipt.blockNumber})`)

  // Save deployment info
  const deployment = {
    network: 'sepolia',
    chainId: sepolia.id,
    contractAddress,
    authorizedWorkflow,
    deployer: account.address,
    deployTxHash: hash,
    blockNumber: Number(receipt.blockNumber),
    demoProjectId: projectId,
    totalMilestones: 4,
    registerTxHash: regHash,
    deployedAt: new Date().toISOString(),
  }

  const deploymentsDir = join(import.meta.dir, '..', 'deployments')
  mkdirSync(deploymentsDir, { recursive: true })
  const deploymentPath = join(deploymentsDir, 'sepolia-milestone.json')
  writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2))

  console.log(`\nDeployment saved to: deployments/sepolia-milestone.json`)

  // Update the workflow config with the deployed address
  const configPath = join(
    import.meta.dir,
    '..',
    'config',
    'milestone-oracle.config.json',
  )
  const workflowConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
  workflowConfig.milestoneConsumerAddress = contractAddress
  writeFileSync(configPath, JSON.stringify(workflowConfig, null, 2))

  console.log(`Updated config/milestone-oracle.config.json with contract address`)

  console.log('\n' + '='.repeat(60))
  console.log('Deployment complete!')
  console.log('='.repeat(60))
  console.log(`
Next steps:
  1. Compile the contract:  forge build
  2. Fund the workflow:     Send LINK to the DON subscription
  3. Deploy the workflow:   bun run deploy:milestone
  4. Simulate locally:      bun run simulate:milestone
  `)
}

main().catch((err) => {
  console.error('\nDeployment failed:', err.message ?? err)
  process.exit(1)
})
