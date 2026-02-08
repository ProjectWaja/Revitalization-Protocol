/**
 * Deploy SolvencyConsumer.sol to Ethereum Sepolia
 *
 * Usage:
 *   bun run scripts/deploy-solvency.ts
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
  // Try secrets file first, then fall back to env vars
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
// Contract ABI & Bytecode
// ---------------------------------------------------------------------------

// NOTE: In a full setup you'd compile with solc/forge and import the artifact.
// For the hackathon, we compile separately and paste the bytecode here,
// or use forge to compile and read the artifact.
//
// To compile:
//   forge build --contracts src/contracts/SolvencyConsumer.sol
//   Then copy the bytecode from out/SolvencyConsumer.sol/SolvencyConsumer.json

const SOLVENCY_CONSUMER_ABI = [
  {
    type: 'constructor',
    inputs: [{ name: '_authorizedWorkflow', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    name: 'registerProject',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'projectId', type: 'bytes32' },
      { name: 'totalBudget', type: 'uint256' },
      { name: 'capitalDeployed', type: 'uint256' },
      { name: 'capitalRemaining', type: 'uint256' },
      { name: 'fundingVelocity', type: 'uint256' },
      { name: 'burnRate', type: 'uint256' },
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
  console.log('Revitalization Protocol — SolvencyConsumer Deployment')
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
  // Try forge artifact first, then fall back to a local bytecode file
  let bytecode: Hex

  try {
    const artifactPath = join(
      import.meta.dir,
      '..',
      'out',
      'SolvencyConsumer.sol',
      'SolvencyConsumer.json',
    )
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'))
    bytecode = artifact.bytecode.object as Hex
    console.log('\nLoaded bytecode from forge artifact')
  } catch {
    try {
      const bytecodePath = join(
        import.meta.dir,
        '..',
        'config',
        'SolvencyConsumer.bytecode.hex',
      )
      bytecode = `0x${readFileSync(bytecodePath, 'utf-8').trim()}` as Hex
      console.log('\nLoaded bytecode from config/SolvencyConsumer.bytecode.hex')
    } catch {
      console.error(
        '\nNo compiled bytecode found. Compile the contract first:\n' +
        '  forge build --contracts src/contracts/SolvencyConsumer.sol\n' +
        'Or place raw bytecode in config/SolvencyConsumer.bytecode.hex\n',
      )
      process.exit(1)
    }
  }

  // Deploy
  console.log('\nDeploying SolvencyConsumer...')

  const hash = await walletClient.deployContract({
    abi: SOLVENCY_CONSUMER_ABI,
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

  // Register the demo project
  console.log('\nRegistering demo project...')

  const projectId =
    '0x5265766974616c697a6174696f6e50726f746f636f6c000000000000000001' as Hex

  const regHash = await walletClient.writeContract({
    address: contractAddress,
    abi: SOLVENCY_CONSUMER_ABI,
    functionName: 'registerProject',
    args: [
      projectId,
      50_000_000n * 1_000_000n,   // $50M total budget (USD * 1e6)
      15_000_000n * 1_000_000n,   // $15M deployed
      35_000_000n * 1_000_000n,   // $35M remaining
      2_000_000n * 1_000_000n,    // $2M/month funding velocity
      1_500_000n * 1_000_000n,    // $1.5M/month burn rate
    ],
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
    registerTxHash: regHash,
    deployedAt: new Date().toISOString(),
  }

  const deploymentsDir = join(import.meta.dir, '..', 'deployments')
  mkdirSync(deploymentsDir, { recursive: true })
  const deploymentPath = join(deploymentsDir, 'sepolia-solvency.json')
  writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2))

  console.log(`\nDeployment saved to: deployments/sepolia-solvency.json`)

  // Update the workflow config with the deployed address
  const configPath = join(
    import.meta.dir,
    '..',
    'config',
    'solvency-oracle.config.json',
  )
  const workflowConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
  workflowConfig.solvencyConsumerAddress = contractAddress
  writeFileSync(configPath, JSON.stringify(workflowConfig, null, 2))

  console.log(`Updated config/solvency-oracle.config.json with contract address`)

  console.log('\n' + '='.repeat(60))
  console.log('Deployment complete!')
  console.log('='.repeat(60))
  console.log(`
Next steps:
  1. Compile the contract:  forge build --contracts src/contracts/SolvencyConsumer.sol
  2. Fund the workflow:     Send LINK to the DON subscription
  3. Deploy the workflow:   bun run deploy:workflow
  4. Simulate locally:      bun run simulate
  `)
}

main().catch((err) => {
  console.error('\nDeployment failed:', err.message ?? err)
  process.exit(1)
})
