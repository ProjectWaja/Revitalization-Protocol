# Revitalization Protocol

**Real-time solvency monitoring and tokenized rescue funding for stalled infrastructure projects.**

[![Chainlink Convergence 2026](https://img.shields.io/badge/Hackathon-Chainlink_Convergence_2026-375BD2)](https://chain.link/hackathon)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636)](https://soliditylang.org)
[![Tests](https://img.shields.io/badge/Tests-87_passing-brightgreen)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Problem

Large infrastructure projects — skyscrapers, bridges, transit systems, renewable energy facilities — routinely stall due to funding shortages, cost overruns, or bankruptcy. When a $1B project stops at 60% completion, capital is trapped, communities lose economic opportunity, and investors have no recourse. Examples include California High-Speed Rail ($100B+ overruns) and LA's Oceanwide Plaza (abandoned at 80% completion).

There is no automated system to detect failing projects early, trigger emergency funding, or verify that rescue capital is being spent on actual construction progress.

## Solution

Revitalization Protocol uses **7 Chainlink services** to build an end-to-end infrastructure rescue system:

1. **Detect** — Real-time solvency monitoring with AI-powered risk scoring inside CRE workflows
2. **Fund** — Tokenized rescue funding via ERC-1155 positions with milestone-gated tranche release
3. **Verify** — Satellite/drone-verified construction progress with deterministic scoring
4. **Protect** — Confidential Compute for sensitive financial data and investor privacy
5. **Bridge** — Cross-chain funding via CCIP (Sepolia to Polygon Amoy)

## Chainlink Services Used

| Service | Where | Purpose |
|---------|-------|---------|
| **CRE Workflows** | All 3 workflows | Orchestration layer — triggers, consensus, signed reports |
| **AI Agents (Claude)** | Solvency Oracle | Risk narrative + rescue trigger decision inside CRE |
| **Data Feeds** | Solvency Oracle | Commodity cost indices via proxy (steel, concrete, labor) |
| **CCIP** | Funding Engine | Cross-chain token transfers (Sepolia <-> Polygon Amoy) |
| **Automation** | Funding Engine, Reserve Verifier | Expire stale rounds, periodic reserve checks |
| **Proof of Reserves** | Reserve Verifier | Verify project reserves match claimed deposits |
| **Confidential Compute** | Solvency Compute | Privacy-preserving scoring with attestation hashes |

## Architecture

Six smart contracts connected by typed cross-module hooks:

```
Solvency Oracle (CRE + AI)          Milestone Oracle (CRE)
       |                                    |
       v                                    v
SolvencyConsumer.sol ----+      MilestoneConsumer.sol ---+
  (rescue trigger)       |       (tranche trigger)       |
                         v                               v
                  TokenizedFundingEngine.sol (ERC-1155)
                         |
                         v
                  ReserveVerifier.sol (Proof of Reserves)
                         |
                         v
              ConfidentialSolvencyCompute.sol (CC attestations)
```

### Deployed Contracts (Ethereum Sepolia)

| Contract | Address |
|----------|---------|
| SolvencyConsumer | [`0x4127a05f683d02ec7c691d295261f8298bfdb20d`](https://sepolia.etherscan.io/address/0x4127a05f683d02ec7c691d295261f8298bfdb20d) |
| MilestoneConsumer | [`0x510046808d7f20e7e3cb0f23038461c99eb62da3`](https://sepolia.etherscan.io/address/0x510046808d7f20e7e3cb0f23038461c99eb62da3) |
| TokenizedFundingEngine | [`0x96dbe5f3cf891a6a8da49e27568ae817c471d719`](https://sepolia.etherscan.io/address/0x96dbe5f3cf891a6a8da49e27568ae817c471d719) |
| ReserveVerifier | [`0x59b214722d632191921551ce59431acf65c05f0d`](https://sepolia.etherscan.io/address/0x59b214722d632191921551ce59431acf65c05f0d) |

Cross-module hooks are wired: SolvencyConsumer triggers rescue funding, MilestoneConsumer triggers tranche release, both via typed interfaces with try/catch.

## Tech Stack

- **Smart Contracts**: Solidity 0.8.24 via Foundry, OpenZeppelin v5.5.0
- **Workflows**: Chainlink CRE SDK (TypeScript), compiled to WASM
- **Runtime**: Bun
- **Frontend**: Next.js 15, Tailwind CSS 4
- **Libraries**: viem, zod
- **AI**: Anthropic Claude (Solvency Oracle only — hero feature)
- **Testnets**: Ethereum Sepolia, Polygon Amoy

## Setup & Deployment

### Prerequisites

- [Bun](https://bun.sh) runtime
- [Foundry](https://getfoundry.sh) (forge, cast)
- Sepolia ETH ([faucet](https://faucets.chain.link))

### Install

```bash
git clone https://github.com/ProjectWaja/Revitalization-Protocol.git
cd Revitalization-Protocol
bun install
forge install
```

### Configure

```bash
cp .env.example .env
# Edit .env with your keys:
#   DEPLOYER_PRIVATE_KEY  — Sepolia wallet private key
#   SEPOLIA_RPC_URL       — Alchemy or Infura Sepolia endpoint
#   ANTHROPIC_API_KEY     — For Solvency Oracle AI
```

### Run Tests (87 passing)

```bash
forge test
```

### Deploy to Sepolia

Contracts must be deployed in order (each script wires hooks to prior deployments):

```bash
bun run scripts/deploy-solvency.ts
bun run scripts/deploy-milestone.ts
bun run scripts/deploy-funding.ts
bun run scripts/deploy-reserve-verifier.ts
```

Deployment artifacts are saved to `deployments/` (gitignored).

### Run Dashboard

```bash
cd dashboard
bun install
bun dev
```

### Local Simulation

```bash
# Start mock API server (port 3001)
bun run scripts/mock-api-server.ts

# Run end-to-end demo
bun run scripts/demo-simulation.ts
```

## Project Structure

```
src/
  contracts/              # 6 Solidity smart contracts
    SolvencyConsumer.sol        Receives solvency reports from CRE
    MilestoneConsumer.sol       Receives milestone verification reports
    TokenizedFundingEngine.sol  ERC-1155 funding with tranches + automation
    ReserveVerifier.sol         Proof of Reserves + automation
    ConfidentialSolvencyCompute.sol  Privacy-preserving scoring
    FundingBridgeReceiver.sol   CCIP cross-chain receiver stub
  workflows/              # 3 CRE TypeScript workflows
    solvency-oracle.ts         AI-powered risk monitoring (hero feature)
    milestone-oracle.ts        Rule-based progress verification
    funding-engine.ts          Rule-based funding health monitoring
  lib/                    # Shared scoring libraries
  types/                  # TypeScript type definitions
test/                     # 87 Foundry tests (6 suites + integration)
scripts/                  # Deploy scripts, mock API, demo simulation
config/                   # Workflow configs, fixtures
dashboard/                # Next.js 15 monitoring dashboard
docs/                     # Architecture diagrams
```

## AI Approach

Only the **Solvency Oracle** uses AI (Claude) — this is the hero feature for the CRE & AI track. It runs inside CRE via `runInNodeMode` with identical consensus and structured JSON output at temperature=0.

The Milestone Oracle and Funding Engine use **pure deterministic rule-based scoring** — no AI, no consensus risk, 100% demo-reliable. This gives us the best balance of narrative impact and demo stability.

All three workflows have strong fallback paths if any external call fails.

## Hackathon Categories

| Category | Prize | Our Integration |
|----------|-------|-----------------|
| **DeFi & Tokenization** | $20K | ERC-1155 funding positions, milestone-gated tranches, CCIP cross-chain |
| **CRE & AI** | $17K | AI risk scoring inside CRE with consensus (Solvency Oracle) |
| **Risk & Compliance** | $16K | Real-time solvency monitoring, Proof of Reserves, Automation |
| **Privacy** | $16K | Confidential Compute for sensitive financials + attestations |

## Team

**Willis** — Product Manager & Full-Stack Developer

## License

MIT
