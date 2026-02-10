import { readFileSync } from 'fs'
import { join } from 'path'
import type { Abi, Hex } from 'viem'

// Cache loaded artifacts
const cache = new Map<string, { abi: Abi; bytecode: Hex }>()

export function loadArtifact(contractName: string): { abi: Abi; bytecode: Hex } {
  if (cache.has(contractName)) return cache.get(contractName)!

  // Resolve path relative to project root (parent of dashboard/)
  const projectRoot = join(process.cwd(), '..')
  const artifactPath = join(projectRoot, 'out', `${contractName}.sol`, `${contractName}.json`)

  const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'))
  const result = {
    abi: artifact.abi as Abi,
    bytecode: artifact.bytecode.object as Hex,
  }
  cache.set(contractName, result)
  return result
}

export function loadAbi(contractName: string): Abi {
  return loadArtifact(contractName).abi
}
