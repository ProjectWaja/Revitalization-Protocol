# Revitalization Protocol

**Real-time solvency monitoring + tokenized rescue funding for stalled infrastructure projects**

[![Chainlink](https://img.shields.io/badge/Built%20with-Chainlink-00A6FF?style=flat&logo=chainlink)](https://chain.link)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?style=flat&logo=solidity)](https://soliditylang.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat&logo=next.js)](https://nextjs.org)
[![Tests](https://img.shields.io/badge/Tests-87_passing-brightgreen)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Problem

High-value infrastructure projects (skyscrapers, bridges, transit, renewables) frequently stall due to:

- Funding shortages & cost overruns
- Lack of early financial health detection
- No automated rescue mechanisms
- Trapped capital, urban blight & lost community value

Real-world examples:
- **California High-Speed Rail** — $100B+ overruns, decades delayed
- **Oceanwide Plaza (LA)** — $1B+ skyscraper abandoned mid-construction

There is currently **no trustless, automated system** to detect distress early, trigger emergency funding, and verify that rescue capital is actually used for progress.

## Solution

Revitalization Protocol is a Chainlink-powered oracle platform that:

1. **Detects** financial distress in real time using AI-enhanced solvency scoring
2. **Triggers** tokenized rescue funding rounds automatically
3. **Verifies** construction progress via satellite/drone data
4. **Protects** sensitive data with Confidential Compute
5. **Enables** cross-chain capital movement via CCIP

## Chainlink Services Used (7 total)

| Service | Used In | Purpose |
|---------|---------|---------|
| **CRE Workflows** | All 3 modules | Orchestration, cron triggers, consensus, signed reports |
| **AI Agents (Claude)** | Solvency Oracle | Risk narrative & rescue trigger decision (structured JSON, temp=0) |
| **Data Feeds** | Solvency Oracle | Commodity cost indices (steel, concrete, labor) via HTTP proxy |
| **CCIP** | Funding Engine | Cross-chain token transfers (Sepolia <-> Polygon Amoy) |
| **Automation** | Funding Engine, Reserve Verifier | Auto-expire rounds, periodic reserve re-verification |
| **Proof of Reserves** | ReserveVerifier.sol | On-chain verification of project reserves |
| **Confidential Compute** | Solvency Compute | Privacy-preserving scoring + attestation hashes |

## Architecture Overview

Six smart contracts connected by typed cross-module hooks:

```
Solvency Oracle (CRE + AI)          Milestone Oracle (CRE)
       │                                    │
       ▼                                    ▼
SolvencyConsumer.sol ────┬──── MilestoneConsumer.sol
  (rescue trigger)       │      (tranche trigger)
                         ▼
              TokenizedFundingEngine.sol (ERC-1155)
                         │
                         ▼
              ReserveVerifier.sol (PoR + Automation)
                         │
                         ▼
        ConfidentialSolvencyCompute.sol (attestations)
```

Cross-module hooks are wired with typed interfaces and try/catch safety.

## Deployed Contracts (Sepolia)

| Contract | Address |
|----------|---------|
| SolvencyConsumer | [`0x4127...b20d`](https://sepolia.etherscan.io/address/0x4127a05f683d02ec7c691d295261f8298bfdb20d) |
| MilestoneConsumer | [`0x5100...2da3`](https://sepolia.etherscan.io/address/0x510046808d7f20e7e3cb0f23038461c99eb62da3) |
| TokenizedFundingEngine | [`0x96db...d719`](https://sepolia.etherscan.io/address/0x96dbe5f3cf891a6a8da49e27568ae817c471d719) |
| ReserveVerifier | [`0x59b2...f0d`](https://sepolia.etherscan.io/address/0x59b214722d632191921551ce59431acf65c05f0d) |

## Tech Stack

- **Smart Contracts**: Solidity 0.8.24 (Foundry), OpenZeppelin v5.5.0
- **Oracles**: Chainlink CRE SDK (TypeScript, compiled to WASM)
- **Runtime**: Bun
- **Frontend**: Next.js 15 + Tailwind CSS 4 + viem
- **AI**: Anthropic Claude (Solvency Oracle only)
- **Testnets**: Ethereum Sepolia + Polygon Amoy (CCIP)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [Foundry](https://getfoundry.sh) (latest)
- Sepolia testnet wallet with ETH ([faucet](https://faucets.chain.link))

### Installation

```bash
git clone https://github.com/ProjectWaja/Revitalization-Protocol.git
cd Revitalization-Protocol
bun install
forge install
```

### Configuration

```bash
cp .env.example .env
# Fill in:
#   DEPLOYER_PRIVATE_KEY  = 0x... (Sepolia deployer key)
#   SEPOLIA_RPC_URL       = https://eth-sepolia.g.alchemy.com/v2/...
#   ANTHROPIC_API_KEY     = sk-ant-api03-...
```

### Run Tests (87 passing)

```bash
forge test
```

### Deploy to Sepolia

```bash
# Deploy in order (each script wires previous addresses)
bun run scripts/deploy-solvency.ts         # 1. SolvencyConsumer
bun run scripts/deploy-milestone.ts        # 2. MilestoneConsumer
bun run scripts/deploy-funding.ts          # 3. TokenizedFundingEngine
bun run scripts/deploy-reserve-verifier.ts # 4. ReserveVerifier
```

Artifacts saved to `deployments/` (gitignored).

### Dashboard

```bash
cd dashboard && bun install && bun dev
# Open http://localhost:3000
```

### Local Simulation

```bash
# Mock API server (required for CRE simulation)
bun run scripts/mock-api-server.ts

# End-to-end demo (solvency → rescue → milestone → tranche)
bun run scripts/demo-simulation.ts
```

## AI Implementation

> **Hero feature** — only the Solvency Oracle uses Claude (inside CRE with `identical` consensus and `temp=0`).

Every DON node runs the same prompt and produces the same structured JSON result — deterministic AI with on-chain consensus. The Milestone Oracle and Funding Engine are **purely rule-based** (no AI calls, no consensus risk) for maximum demo reliability.

One powerful AI integration beats three fragile ones.

## Project Structure

```
src/
  contracts/                          # 6 Solidity smart contracts
    SolvencyConsumer.sol              # Receives solvency reports from CRE
    MilestoneConsumer.sol             # Receives milestone verification reports
    TokenizedFundingEngine.sol        # ERC-1155 funding + tranches + automation
    ReserveVerifier.sol               # Proof of Reserves + automation
    ConfidentialSolvencyCompute.sol   # Privacy-preserving scoring
    FundingBridgeReceiver.sol         # CCIP cross-chain receiver stub
  workflows/                          # 3 CRE TypeScript workflows
    solvency-oracle.ts               # AI-powered risk monitoring (hero feature)
    milestone-oracle.ts              # Rule-based progress verification
    funding-engine.ts                # Rule-based funding health monitoring
  lib/                                # Shared scoring libraries
  types/                              # TypeScript type definitions
test/                                 # 87 Foundry tests (6 suites + integration)
scripts/                              # Deploy scripts, mock API, demo
config/                               # Workflow configs, fixtures
dashboard/                            # Next.js 15 monitoring dashboard
```

## Hackathon Categories

| Category | Prize | Our Fit |
|----------|-------|---------|
| **DeFi & Tokenization** | $20K | ERC-1155 positions, milestone-gated tranches, CCIP bridging |
| **CRE & AI** | $17K | AI risk scoring inside CRE (Solvency), consensus handling |
| **Risk & Compliance** | $16K | Real-time solvency, Proof of Reserves, Automation, audit trails |
| **Privacy** | $16K | Confidential Compute + attestation architecture |

## Team

**Willis** — Product, Full-Stack, Smart Contracts

## License

MIT
