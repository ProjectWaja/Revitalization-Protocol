/**
 * Deploy ReserveVerifier.sol
 *
 * Usage:
 *   bun run scripts/deploy-reserve-verifier.ts
 *
 * Supports both Sepolia and Tenderly Virtual TestNet.
 * Set DEPLOY_NETWORK=tenderly in .env to use Tenderly.
 */

import { type Address, type Hex } from 'viem'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getNetworkConfig, printNetworkBanner, checkBalance, type NetworkConfig } from './lib/network'

// ---------------------------------------------------------------------------
// Config (contract-specific)
// ---------------------------------------------------------------------------

function loadFundingEngineAddress(net: NetworkConfig): Address {
  try {
    const fundingDeploy = JSON.parse(
      readFileSync(join(import.meta.dir, '..', 'deployments', `${net.network}-funding.json`), 'utf-8'),
    )
    return fundingDeploy.contractAddress as Address
  } catch {
    console.warn('No prior funding engine deployment found. Using zero address.')
    return '0x0000000000000000000000000000000000000000' as Address
  }
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
  const net = getNetworkConfig()
  const fundingEngineAddress = loadFundingEngineAddress(net)
  printNetworkBanner(net, 'ReserveVerifier Deployment')
  console.log(`Funding Engine: ${fundingEngineAddress}`)
  await checkBalance(net)

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

  const hash = await net.walletClient.deployContract({
    abi: RESERVE_VERIFIER_ABI,
    bytecode,
    args: [fundingEngineAddress],
  })

  console.log(`TX hash:   ${hash}`)
  console.log('Waiting for confirmation...')

  const receipt = await net.publicClient.waitForTransactionReceipt({ hash })
  const contractAddress = receipt.contractAddress!

  console.log(`\nDeployed!`)
  console.log(`Address:   ${contractAddress}`)
  console.log(`Block:     ${receipt.blockNumber}`)
  console.log(`Gas used:  ${receipt.gasUsed}`)

  // Configure demo project reserves
  console.log('\nConfiguring demo project reserves...')

  const projectId =
    '0x5265766974616c697a6174696f6e50726f746f636f6c00000000000000000001' as Hex

  const configHash = await net.walletClient.writeContract({
    address: contractAddress,
    abi: RESERVE_VERIFIER_ABI,
    functionName: 'configureProjectReserves',
    args: [
      projectId,
      '0x0000000000000000000000000000000000000000' as Address, // No PoR feed yet
      fundingEngineAddress,                                      // Engine as reserve wallet
      50_000_000n * 1_000_000n,                               // $50M claimed
      8000n,                                                   // 80% minimum ratio
    ],
  })

  const configReceipt = await net.publicClient.waitForTransactionReceipt({ hash: configHash })
  console.log(`Configured: TX ${configHash} (block ${configReceipt.blockNumber})`)

  // Save deployment info
  const deployment = {
    network: net.network,
    chainId: net.chain.id,
    contractAddress,
    fundingEngine: fundingEngineAddress,
    deployer: net.account.address,
    deployTxHash: hash,
    blockNumber: Number(receipt.blockNumber),
    demoProjectId: projectId,
    configTxHash: configHash,
    deployedAt: new Date().toISOString(),
  }

  const deploymentsDir = join(import.meta.dir, '..', 'deployments')
  mkdirSync(deploymentsDir, { recursive: true })
  const deploymentPath = join(deploymentsDir, `${net.network}-reserve-verifier.json`)
  writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2))

  console.log(`\nDeployment saved to: deployments/${net.network}-reserve-verifier.json`)

  console.log('\n' + '='.repeat(60))
  console.log('Deployment complete!')
  console.log('='.repeat(60))
}

main().catch((err) => {
  console.error('\nDeployment failed:', err.message ?? err)
  process.exit(1)
})
