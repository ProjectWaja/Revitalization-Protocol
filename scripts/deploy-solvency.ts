/**
 * Deploy SolvencyConsumer.sol
 *
 * Usage:
 *   bun run scripts/deploy-solvency.ts
 *
 * Supports both Sepolia and Tenderly Virtual TestNet.
 * Set DEPLOY_NETWORK=tenderly in .env to use Tenderly.
 */

import { type Address, type Hex } from 'viem'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getNetworkConfig, printNetworkBanner, checkBalance } from './lib/network'

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
  const net = getNetworkConfig()
  printNetworkBanner(net, 'SolvencyConsumer Deployment')
  await checkBalance(net)

  // Determine authorized workflow address (default to deployer for testing)
  const authorizedWorkflow = (process.env.AUTHORIZED_WORKFLOW ?? net.account.address) as Address
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

  const hash = await net.walletClient.deployContract({
    abi: SOLVENCY_CONSUMER_ABI,
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

  // Register the demo project
  console.log('\nRegistering demo project...')

  const projectId =
    '0x5265766974616c697a6174696f6e50726f746f636f6c00000000000000000001' as Hex

  const regHash = await net.walletClient.writeContract({
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
    registerTxHash: regHash,
    deployedAt: new Date().toISOString(),
  }

  const deploymentsDir = join(import.meta.dir, '..', 'deployments')
  mkdirSync(deploymentsDir, { recursive: true })
  const deploymentPath = join(deploymentsDir, `${net.network}-solvency.json`)
  writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2))

  console.log(`\nDeployment saved to: deployments/${net.network}-solvency.json`)

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
