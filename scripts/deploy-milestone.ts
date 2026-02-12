/**
 * Deploy MilestoneConsumer.sol
 *
 * Usage:
 *   bun run scripts/deploy-milestone.ts
 *
 * Supports both Sepolia and Tenderly Virtual TestNet.
 * Set DEPLOY_NETWORK=tenderly in .env to use Tenderly.
 */

import { type Address, type Hex } from 'viem'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getNetworkConfig, printNetworkBanner, checkBalance } from './lib/network'

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
  const net = getNetworkConfig()
  printNetworkBanner(net, 'MilestoneConsumer Deployment')
  await checkBalance(net)

  // Determine authorized workflow address (default to deployer for testing)
  const authorizedWorkflow = (process.env.AUTHORIZED_WORKFLOW ?? net.account.address) as Address
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

  const hash = await net.walletClient.deployContract({
    abi: MILESTONE_CONSUMER_ABI,
    bytecode,
    args: [authorizedWorkflow],
  })

  console.log(`TX hash:   ${hash}`)
  console.log('Waiting for confirmation...')

  const receipt = await net.publicClient.waitForTransactionReceipt({ hash })
  const contractAddress = receipt.contractAddress!

  console.log(`\nDeployed!`)
  console.log(`Address:   ${contractAddress}`)
  console.log(`Block:     ${receipt.blockNumber}`)
  console.log(`Gas used:  ${receipt.gasUsed}`)

  // Register the demo project with 4 milestones
  console.log('\nRegistering demo project milestones...')

  const projectId =
    '0x5265766974616c697a6174696f6e50726f746f636f6c00000000000000000001' as Hex

  const regHash = await net.walletClient.writeContract({
    address: contractAddress,
    abi: MILESTONE_CONSUMER_ABI,
    functionName: 'registerProjectMilestones',
    args: [projectId, 4],
  })

  const regReceipt = await net.publicClient.waitForTransactionReceipt({
    hash: regHash,
  })
  console.log(`Registered: TX ${regHash} (block ${regReceipt.blockNumber})`)

  // Save deployment info
  const deployment = {
    network: net.network,
    chainId: net.chain.id,
    contractAddress,
    authorizedWorkflow,
    deployer: net.account.address,
    deployTxHash: hash,
    blockNumber: Number(receipt.blockNumber),
    demoProjectId: projectId,
    totalMilestones: 4,
    registerTxHash: regHash,
    deployedAt: new Date().toISOString(),
  }

  const deploymentsDir = join(import.meta.dir, '..', 'deployments')
  mkdirSync(deploymentsDir, { recursive: true })
  const deploymentPath = join(deploymentsDir, `${net.network}-milestone.json`)
  writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2))

  console.log(`\nDeployment saved to: deployments/${net.network}-milestone.json`)

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
