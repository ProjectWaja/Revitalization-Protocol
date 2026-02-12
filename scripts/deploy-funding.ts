/**
 * Deploy TokenizedFundingEngine.sol
 *
 * Usage:
 *   bun run scripts/deploy-funding.ts
 *
 * Supports both Sepolia and Tenderly Virtual TestNet.
 * Set DEPLOY_NETWORK=tenderly in .env to use Tenderly.
 */

import { type Address, type Hex } from 'viem'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getNetworkConfig, printNetworkBanner, checkBalance, type NetworkConfig } from './lib/network'

// ---------------------------------------------------------------------------
// Config (contract-specific settings beyond network)
// ---------------------------------------------------------------------------

interface FundingDeployConfig {
  ccipRouterAddress: Address
  polygonChainSelector: bigint
  solvencyConsumerAddress?: Address
  milestoneConsumerAddress?: Address
}

function loadFundingConfig(net: NetworkConfig): FundingDeployConfig {
  const ccipRouterAddress = (
    process.env.CCIP_ROUTER_ADDRESS ??
    '0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59' // Sepolia CCIP Router
  ) as Address

  const polygonChainSelector = BigInt(
    process.env.POLYGON_CHAIN_SELECTOR ?? '16281711391670634445' // Polygon Amoy
  )

  // Load cross-module addresses from prior deployments (network-aware)
  let solvencyConsumerAddress: Address | undefined
  let milestoneConsumerAddress: Address | undefined

  try {
    const solvencyDeploy = JSON.parse(
      readFileSync(join(import.meta.dir, '..', 'deployments', `${net.network}-solvency.json`), 'utf-8'),
    )
    solvencyConsumerAddress = solvencyDeploy.contractAddress as Address
  } catch {
    // No prior solvency deployment
  }

  try {
    const milestoneDeploy = JSON.parse(
      readFileSync(join(import.meta.dir, '..', 'deployments', `${net.network}-milestone.json`), 'utf-8'),
    )
    milestoneConsumerAddress = milestoneDeploy.contractAddress as Address
  } catch {
    // No prior milestone deployment
  }

  return {
    ccipRouterAddress,
    polygonChainSelector,
    solvencyConsumerAddress,
    milestoneConsumerAddress,
  }
}

// ---------------------------------------------------------------------------
// Contract ABI & Bytecode
// ---------------------------------------------------------------------------

const FUNDING_ENGINE_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: 'uri_', type: 'string' },
      { name: '_ccipRouter', type: 'address' },
      { name: '_polygonChainSelector', type: 'uint64' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    name: 'grantRole',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'SOLVENCY_ORACLE_ROLE',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'MILESTONE_ORACLE_ROLE',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'createFundingRound',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'projectId', type: 'bytes32' },
      { name: 'targetAmount', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'milestoneIds', type: 'uint8[]' },
      { name: 'trancheBasisPoints', type: 'uint16[]' },
    ],
    outputs: [],
  },
] as const

const SOLVENCY_CONSUMER_ABI = [
  {
    name: 'setRescueFundingEngine',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_engine', type: 'address' }],
    outputs: [],
  },
] as const

const MILESTONE_CONSUMER_ABI = [
  {
    name: 'setFundingEngine',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_engine', type: 'address' }],
    outputs: [],
  },
] as const

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

async function main() {
  const net = getNetworkConfig()
  const config = loadFundingConfig(net)
  printNetworkBanner(net, 'TokenizedFundingEngine Deployment')
  console.log(`CCIP Router: ${config.ccipRouterAddress}`)
  console.log(`Polygon Selector: ${config.polygonChainSelector}`)
  await checkBalance(net)

  // Load compiled bytecode
  let bytecode: Hex

  try {
    const artifactPath = join(
      import.meta.dir,
      '..',
      'out',
      'TokenizedFundingEngine.sol',
      'TokenizedFundingEngine.json',
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
  console.log('\nDeploying TokenizedFundingEngine...')

  const hash = await net.walletClient.deployContract({
    abi: FUNDING_ENGINE_ABI,
    bytecode,
    args: [
      'https://rvp.example.com/metadata/{id}.json',
      config.ccipRouterAddress,
      config.polygonChainSelector,
    ],
  })

  console.log(`TX hash:   ${hash}`)
  console.log('Waiting for confirmation...')

  const receipt = await net.publicClient.waitForTransactionReceipt({ hash })
  const contractAddress = receipt.contractAddress!

  console.log(`\nDeployed!`)
  console.log(`Address:   ${contractAddress}`)
  console.log(`Block:     ${receipt.blockNumber}`)
  console.log(`Gas used:  ${receipt.gasUsed}`)

  // Grant roles to cross-module contracts
  if (config.solvencyConsumerAddress) {
    console.log(`\nGranting SOLVENCY_ORACLE_ROLE to ${config.solvencyConsumerAddress}...`)

    const solvencyRole = await net.publicClient.readContract({
      address: contractAddress,
      abi: FUNDING_ENGINE_ABI,
      functionName: 'SOLVENCY_ORACLE_ROLE',
    })

    const grantHash = await net.walletClient.writeContract({
      address: contractAddress,
      abi: FUNDING_ENGINE_ABI,
      functionName: 'grantRole',
      args: [solvencyRole, config.solvencyConsumerAddress],
    })
    await net.publicClient.waitForTransactionReceipt({ hash: grantHash })
    console.log(`Granted: TX ${grantHash}`)

    // Wire SolvencyConsumer to call this funding engine
    console.log(`Wiring SolvencyConsumer.setRescueFundingEngine(${contractAddress})...`)
    const wireHash = await net.walletClient.writeContract({
      address: config.solvencyConsumerAddress,
      abi: SOLVENCY_CONSUMER_ABI,
      functionName: 'setRescueFundingEngine',
      args: [contractAddress],
    })
    await net.publicClient.waitForTransactionReceipt({ hash: wireHash })
    console.log(`Wired: TX ${wireHash}`)
  }

  if (config.milestoneConsumerAddress) {
    console.log(`\nGranting MILESTONE_ORACLE_ROLE to ${config.milestoneConsumerAddress}...`)

    const milestoneRole = await net.publicClient.readContract({
      address: contractAddress,
      abi: FUNDING_ENGINE_ABI,
      functionName: 'MILESTONE_ORACLE_ROLE',
    })

    const grantHash = await net.walletClient.writeContract({
      address: contractAddress,
      abi: FUNDING_ENGINE_ABI,
      functionName: 'grantRole',
      args: [milestoneRole, config.milestoneConsumerAddress],
    })
    await net.publicClient.waitForTransactionReceipt({ hash: grantHash })
    console.log(`Granted: TX ${grantHash}`)

    // Wire MilestoneConsumer to call this funding engine
    console.log(`Wiring MilestoneConsumer.setFundingEngine(${contractAddress})...`)
    const wireHash = await net.walletClient.writeContract({
      address: config.milestoneConsumerAddress,
      abi: MILESTONE_CONSUMER_ABI,
      functionName: 'setFundingEngine',
      args: [contractAddress],
    })
    await net.publicClient.waitForTransactionReceipt({ hash: wireHash })
    console.log(`Wired: TX ${wireHash}`)
  }

  // Create demo funding round (4 tranches, 25% each, 10 ETH target)
  console.log('\nCreating demo funding round...')

  const projectId =
    '0x5265766974616c697a6174696f6e50726f746f636f6c00000000000000000001' as Hex

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60) // 30 days

  const demoHash = await net.walletClient.writeContract({
    address: contractAddress,
    abi: FUNDING_ENGINE_ABI,
    functionName: 'createFundingRound',
    args: [
      projectId,
      10_000_000_000_000_000_000n, // 10 ETH
      deadline,
      [0, 1, 2, 3],               // 4 milestones
      [2500, 2500, 2500, 2500],    // 25% each
    ],
  })

  const demoReceipt = await net.publicClient.waitForTransactionReceipt({ hash: demoHash })
  console.log(`Demo round created: TX ${demoHash} (block ${demoReceipt.blockNumber})`)

  // Save deployment info
  const deployment = {
    network: net.network,
    chainId: net.chain.id,
    contractAddress,
    ccipRouter: config.ccipRouterAddress,
    polygonChainSelector: config.polygonChainSelector.toString(),
    solvencyConsumer: config.solvencyConsumerAddress ?? null,
    milestoneConsumer: config.milestoneConsumerAddress ?? null,
    deployer: net.account.address,
    deployTxHash: hash,
    blockNumber: Number(receipt.blockNumber),
    demoProjectId: projectId,
    demoRoundTxHash: demoHash,
    deployedAt: new Date().toISOString(),
  }

  const deploymentsDir = join(import.meta.dir, '..', 'deployments')
  mkdirSync(deploymentsDir, { recursive: true })
  const deploymentPath = join(deploymentsDir, `${net.network}-funding.json`)
  writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2))

  console.log(`\nDeployment saved to: deployments/${net.network}-funding.json`)

  // Update the workflow config with the deployed address
  const configPath = join(
    import.meta.dir,
    '..',
    'config',
    'funding-engine.config.json',
  )
  const workflowConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
  workflowConfig.fundingEngineAddress = contractAddress
  if (config.solvencyConsumerAddress) {
    workflowConfig.solvencyConsumerAddress = config.solvencyConsumerAddress
  }
  if (config.milestoneConsumerAddress) {
    workflowConfig.milestoneConsumerAddress = config.milestoneConsumerAddress
  }
  writeFileSync(configPath, JSON.stringify(workflowConfig, null, 2))

  console.log(`Updated config/funding-engine.config.json with contract address`)

  console.log('\n' + '='.repeat(60))
  console.log('Deployment complete!')
  console.log('='.repeat(60))
  console.log(`
Next steps:
  1. Compile contracts:       forge build
  2. Run tests:               forge test
  3. Fund the workflow:        Send LINK to the DON subscription
  4. Deploy the workflow:      bun run deploy:funding-workflow
  5. Simulate locally:         bun run simulate:funding
  `)
}

main().catch((err) => {
  console.error('\nDeployment failed:', err.message ?? err)
  process.exit(1)
})
