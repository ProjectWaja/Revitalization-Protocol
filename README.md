# Revitalization Protocol

**Chainlink Convergence Hackathon 2026 | DeFi & Tokenization | CRE & AI | Risk & Compliance | Privacy**

A decentralized infrastructure monitoring and funding protocol that uses Chainlink services to bring transparency, automation, and trust to construction project finance.

## The Problem

Every year, hundreds of billions of dollars in infrastructure projects stall mid-construction. Oceanwide Plaza in downtown Los Angeles -- a $1.2 billion mixed-use skyscraper -- broke ground in 2015, ran out of money in 2019, and sat as an unfinished concrete skeleton for seven years. 35% of mega-projects globally experience cost overruns exceeding 50%. The World Economic Forum estimates a $15 trillion infrastructure investment gap. Projects fail not because the engineering is bad, but because the financial monitoring is.

## The Solution

Revitalization Protocol monitors the financial health of large infrastructure projects and automates funding decisions based on verifiable onchain data. A CRE-powered AI solvency oracle scores project health every five minutes. When the score drops critically, the protocol automatically creates a tokenized rescue funding round with premium incentives for emergency investors. When construction milestones are verified complete, tranche payments release automatically. Every dollar is tracked on-chain and auditable through Proof of Reserves.

## Why It Matters

The $13 trillion global construction industry currently has zero decentralized tooling. Project monitoring is manual -- quarterly audits by consulting firms, self-reported financials, and trust-based milestone verification. By the time anyone notices a project is failing, it's 18-24 months too late. Revitalization Protocol replaces trust with verification: every solvency assessment is signed by a Chainlink DON, every milestone is independently verified, and every funding dollar is tracked on-chain.

## Architecture

```
                    +-----------------------+
                    |   CRE Solvency Oracle |  <- AI risk assessment (Claude)
                    |   (cron: 5 min)       |  <- Cost index APIs
                    +-----------+-----------+  <- Onchain financials (EVMClient)
                                |
                    +-----------v-----------+
                    |   SolvencyConsumer.sol |
                    |   (receives reports)   |----> Rescue trigger
                    +-----------+-----------+       |
                                |                   v
+-----------------------+       |       +-----------+-----------+
| CRE Milestone Oracle  |       |       | TokenizedFundingEngine|
| (cron: weekly)        |       |       | (ERC-1155 + CCIP)     |
| Satellite + permits   |       |       | Automation: expired   |
+-----------+-----------+       |       +-----------+-----------+
            |                   |                   |
+-----------v-----------+       |       +-----------v-----------+
| MilestoneConsumer.sol |-------+       | FundingBridgeReceiver |
| (tranche release)     |              | (real CCIPReceiver)    |
+-----------------------+              +------------------------+
            |
+-----------v-----------+       +-----------------------+
|   ReserveVerifier.sol |       | ConfidentialSolvency  |
|   (PoR + Automation)  |       | Compute.sol (CC)      |
+-----------------------+       +-----------------------+
```

### Cross-Module Hooks

Contracts communicate autonomously via typed interfaces with try/catch for graceful degradation:

- **SolvencyConsumer** -> `TokenizedFundingEngine.initiateRescueFunding()` when solvency drops below rescue threshold
- **MilestoneConsumer** -> `TokenizedFundingEngine.releaseTranche()` when a milestone is verified complete
- **SolvencyConsumer** -> `ConfidentialSolvencyCompute.getLatestResult()` for privacy-preserving score read-through
- **ReserveVerifier** -> verifies funding engine balance matches reported deposits

## Chainlink Services Used (7)

| # | Service | Integration Status | Details |
|---|---------|-------------------|---------|
| 1 | **CRE Workflows** | Real | Three workflows (solvency + milestone + funding) using `@chainlink/cre-sdk` with HTTPClient, EVMClient, consensus aggregation, cron triggers, and signed report delivery |
| 2 | **AI Agent (CRE)** | Real | Solvency Oracle calls Claude via HTTP inside the CRE workflow for narrative risk assessment -- the only AI-powered workflow, serving as the hero feature for CRE & AI track |
| 3 | **Data Feeds** | Real + Gap | `AggregatorV3Interface` imported from `@chainlink/contracts`. ETH/USD price feed integrated into TokenizedFundingEngine for USD valuations. See [Data Feed Gaps](#data-feed-gaps) below |
| 4 | **CCIP** | Real | `CCIPReceiver` from `@chainlink/contracts-ccip`, `Client.EVM2AnyMessage` for cross-chain funding. FundingBridgeReceiver inherits real CCIPReceiver. Tested with `CCIPLocalSimulator` from `@chainlink/local` |
| 5 | **Automation** | Real Interface | `checkUpkeep`/`performUpkeep` on TokenizedFundingEngine (expired round cancellation) and ReserveVerifier (periodic reserve checks). Ready to register at automation.chain.link |
| 6 | **Proof of Reserves** | Real Interface + Gap | Uses real `AggregatorV3Interface` to read PoR feeds. See [PoR Gaps](#proof-of-reserves-gaps) below |
| 7 | **Confidential Compute** | Placeholder + Onchain Hook | `ConfidentialSolvencyCompute.sol` is production-ready with roles, attestation hashes, and enclave verification. See [CC Gaps](#confidential-compute-gaps) below |

## Chainlink File Index

Every file in this project that uses Chainlink, organized by service.

### Smart Contracts

| File | Chainlink Services | Description |
|------|-------------------|-------------|
| [`src/contracts/SolvencyConsumer.sol`](src/contracts/SolvencyConsumer.sol) | CRE, Confidential Compute | Receives signed solvency reports from CRE workflow; triggers rescue funding via cross-module hook |
| [`src/contracts/MilestoneConsumer.sol`](src/contracts/MilestoneConsumer.sol) | CRE | Consumes milestone verification reports from CRE workflow; releases tranches on approval |
| [`src/contracts/TokenizedFundingEngine.sol`](src/contracts/TokenizedFundingEngine.sol) | Data Feeds, CCIP, Automation | ERC-1155 funding with `AggregatorV3Interface` (ETH/USD), `IRouterClient` (CCIP), `checkUpkeep`/`performUpkeep` |
| [`src/contracts/FundingBridgeReceiver.sol`](src/contracts/FundingBridgeReceiver.sol) | CCIP | Real `CCIPReceiver` implementation; receives cross-chain funding messages from Sepolia |
| [`src/contracts/ReserveVerifier.sol`](src/contracts/ReserveVerifier.sol) | Proof of Reserves, Automation | Reads PoR feeds via `AggregatorV3Interface`; automated verification via `checkUpkeep`/`performUpkeep` |
| [`src/contracts/ConfidentialSolvencyCompute.sol`](src/contracts/ConfidentialSolvencyCompute.sol) | Confidential Compute | Privacy-preserving solvency scoring with attestation hashes; ready for CC SDK |

### CRE Workflows

| File | Chainlink Services | Description |
|------|-------------------|-------------|
| [`src/workflows/solvency-oracle.ts`](src/workflows/solvency-oracle.ts) | CRE (HTTPClient, EVMClient, Cron), AI Agent, Data Feeds, Confidential Compute | Fetches cost indices, reads onchain financials, calls Claude AI for risk narrative, computes solvency score, writes signed report |
| [`src/workflows/milestone-oracle.ts`](src/workflows/milestone-oracle.ts) | CRE (HTTPClient, EVMClient, Cron), Confidential Compute | Fetches satellite/drone data, reads permit status, computes progress score, writes milestone report |
| [`src/workflows/funding-engine.ts`](src/workflows/funding-engine.ts) | CRE (EVMClient, Cron), Confidential Compute | Reads funding round state, solvency scores, milestone status; computes funding health metrics |
| [`src/lib/confidential-compute-placeholder.ts`](src/lib/confidential-compute-placeholder.ts) | Confidential Compute | CC SDK abstraction layer; swap `confidentialCompute()` for `ccRuntime.execute()` when SDK ships |

### Test Suites (100 tests)

| File | Chainlink Services Tested | Tests |
|------|--------------------------|-------|
| [`test/SolvencyConsumer.t.sol`](test/SolvencyConsumer.t.sol) | CRE report simulation, cross-module rescue hook | 17 |
| [`test/MilestoneConsumer.t.sol`](test/MilestoneConsumer.t.sol) | CRE report simulation, tranche release hook | 21 |
| [`test/TokenizedFundingEngine.t.sol`](test/TokenizedFundingEngine.t.sol) | Data Feeds (MockV3Aggregator), Automation (checkUpkeep/performUpkeep) | 16 |
| [`test/FundingBridgeReceiver.t.sol`](test/FundingBridgeReceiver.t.sol) | CCIP (`CCIPLocalSimulator`, `IRouterClient`, `Client.Any2EVMMessage`) | 9 |
| [`test/ReserveVerifier.t.sol`](test/ReserveVerifier.t.sol) | Proof of Reserves (MockPoRFeed via AggregatorV3Interface), Automation | 14 |
| [`test/ConfidentialSolvencyCompute.t.sol`](test/ConfidentialSolvencyCompute.t.sol) | Confidential Compute (attestation hashing, enclave role simulation) | 15 |
| [`test/Integration.t.sol`](test/Integration.t.sol) | Full lifecycle: CRE, Data Feeds, Automation, Confidential Compute, cross-module hooks | 8 |

### Configuration

| File | Purpose |
|------|---------|
| [`config/solvency-oracle.config.json`](config/solvency-oracle.config.json) | CRE workflow config: schedule, thresholds, API endpoints |
| [`config/solvency-oracle.local.config.json`](config/solvency-oracle.local.config.json) | Local/testnet config pointing to Sepolia + mock API |
| [`config/milestone-oracle.config.json`](config/milestone-oracle.config.json) | CRE workflow config: weekly schedule, satellite API endpoints |
| [`config/milestone-oracle.local.config.json`](config/milestone-oracle.local.config.json) | Local/testnet config for milestone verification |
| [`config/funding-engine.config.json`](config/funding-engine.config.json) | CRE workflow config: 10-minute funding health monitoring |
| [`config/funding-engine.local.config.json`](config/funding-engine.local.config.json) | Local/testnet config for funding engine monitoring |

### Deploy Scripts

| File | Chainlink Services | Description |
|------|-------------------|-------------|
| [`scripts/deploy-solvency.ts`](scripts/deploy-solvency.ts) | CRE | Deploys SolvencyConsumer; registers project; writes addresses to config |
| [`scripts/deploy-milestone.ts`](scripts/deploy-milestone.ts) | CRE | Deploys MilestoneConsumer; registers 4 milestones |
| [`scripts/deploy-funding.ts`](scripts/deploy-funding.ts) | Data Feeds, CCIP, Automation | Deploys TokenizedFundingEngine with Sepolia ETH/USD feed + CCIP router; wires cross-module hooks |
| [`scripts/deploy-reserve-verifier.ts`](scripts/deploy-reserve-verifier.ts) | Proof of Reserves, Automation | Deploys ReserveVerifier with PoR feed config and automation interval |

### Support Files

| File | Purpose |
|------|---------|
| [`scripts/mock-api-server.ts`](scripts/mock-api-server.ts) | Mock HTTP API for local CRE workflow testing (cost indices, funding metrics, satellite data, AI scoring) |
| [`scripts/lib/network.ts`](scripts/lib/network.ts) | Shared network config for Sepolia/Tenderly deployment |

## Real vs Mock Philosophy

This project uses real Chainlink contracts and libraries wherever they exist:

- **Where a real Chainlink tool exists** -- we import and use it (`CCIPReceiver`, `AggregatorV3Interface`, `Client` library, `CCIPLocalSimulator`, CRE SDK)
- **Where a real tool doesn't exist yet** -- we build the mock, clearly comment the gap, and show the data schema that a future Chainlink service could fill

Every gap is documented in-code with a `CHAINLINK DATA GAP` or `CHAINLINK CONFIDENTIAL COMPUTE GAP` comment block explaining what doesn't exist yet and why it matters for this use case.

### Data Feed Gaps

Chainlink Data Feeds don't yet cover **construction material prices** (steel, concrete, lumber, labor rates, diesel fuel). The Solvency Oracle's `fetchCostIndices` function demonstrates the exact data schema these feeds would need:

```
What we need (doesn't exist yet):
  - Steel price per ton (regional)
  - Concrete price per cubic yard (regional)
  - Lumber price per board foot (futures-based)
  - Construction labor index (BLS-derived)
  - Diesel fuel price (regional)
```

These are real-world price feeds that major construction lenders, insurers, and government agencies currently pay for through proprietary services. A Chainlink DON providing these feeds would bring decentralized, tamper-proof pricing to a $13T global construction industry.

We **do** integrate the real ETH/USD Chainlink Data Feed (`0x694AA1769357215DE4FAC081bf1f309aDC325306` on Sepolia) for USD valuations of funding rounds via `TokenizedFundingEngine.getEthPriceUsd()` and `getRoundValueUsd()`.

### Proof of Reserves Gaps

No Chainlink Proof of Reserves feed currently exists for **construction project escrow accounts**. The ReserveVerifier demonstrates the PoR pattern using the standard `AggregatorV3Interface` -- when a dedicated PoR feed for project escrow is available, it plugs in directly. This represents a real-world gap where Chainlink PoR could enable trustless verification of project financial backing.

### Confidential Compute Gaps

The Chainlink Confidential Compute SDK is expected in early 2026 as part of CRE. Our architecture is ready:

- **Onchain**: `ConfidentialSolvencyCompute.sol` accepts enclave-signed results via `submitEnclaveResult()`, stores attestation hashes, and provides read-through via `SolvencyConsumer.getConfidentialSolvencyScore()`
- **Offchain**: `confidential-compute-placeholder.ts` wraps the computation boundary -- swap `confidentialCompute()` for `ccRuntime.execute()` when the SDK ships

### Milestone Oracle Gaps

No Chainlink oracle service currently covers **satellite/drone imagery analysis** for construction site verification. The Milestone Oracle demonstrates the data pipeline -- change-detection scoring, structural footprint analysis, permit compliance tracking -- that a specialized Chainlink DON could natively provide, bringing trustless verification to physical-world construction progress.

## Smart Contracts

| Contract | Description | Tests |
|----------|-------------|-------|
| `SolvencyConsumer.sol` | Receives CRE solvency reports, triggers rescue funding via cross-module hook | 17 |
| `MilestoneConsumer.sol` | Receives milestone reports, releases tranches via cross-module hook | 21 |
| `TokenizedFundingEngine.sol` | ERC-1155 tokenized funding rounds, CCIP cross-chain, Automation, Data Feeds, Rescue Premium | 16 |
| `FundingBridgeReceiver.sol` | Real CCIPReceiver for cross-chain funding messages | 9 |
| `ReserveVerifier.sol` | Chainlink PoR + Automation for periodic reserve verification | 14 |
| `ConfidentialSolvencyCompute.sol` | Privacy-preserving solvency scoring with attestation hashes | 15 |
| `Integration.t.sol` | End-to-end lifecycle: deploy, fund, milestone, tranche, rescue, automation, CC | 8 |
| **Total** | | **100** |

## Deployment

Contracts are deployed to Tenderly Virtual TestNet (Sepolia fork) with persistent state.

| Contract | Tenderly Address |
|----------|-----------------|
| SolvencyConsumer | `0x93418d8e21827d2fd9408a4961da414d2a171a7c` |
| MilestoneConsumer | `0x99537d70fac4ef92ef67738c70da4eba7b90d77c` |
| TokenizedFundingEngine | `0x2366f7592366ef355127a5ebdca75cd8b20fb3a0` |
| ReserveVerifier | `0xf1965e5104d9915a2651f82bbefac187734a1f64` |

**Tenderly Explorer**: [View deployed contracts and transaction history](https://dashboard.tenderly.co/explorer/vnet/df3660db-4c22-4884-a9fd-01949990bf66)

```bash
# Deploy all contracts to Tenderly Virtual TestNet (or Sepolia)
bun run deploy:all-contracts

# Or deploy individually
bun run scripts/deploy-solvency.ts
bun run scripts/deploy-milestone.ts
bun run scripts/deploy-funding.ts
bun run scripts/deploy-reserve-verifier.ts
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.24, Foundry (forge build, forge test) |
| Token Standard | ERC-1155 (multi-position), AccessControl, ReentrancyGuard, Pausable, Ownable |
| Chainlink | `@chainlink/contracts`, `@chainlink/contracts-ccip`, `@chainlink/local`, `@chainlink/cre-sdk` |
| OpenZeppelin | v5.5.0 via git submodule |
| CRE Workflows | TypeScript with HTTPClient, EVMClient, CronCapability, consensus aggregation |
| Runtime | Bun (TypeScript), Forge (Solidity) |
| Dashboard | Next.js 15, Tailwind 4, viem |
| Testnet | Tenderly Virtual TestNet (Sepolia fork) |
| Tests | 100 passing across 7 suites |

## Quick Start

```bash
# Install dependencies
bun install

# Build contracts
forge build

# Run all 100 tests
forge test

# Run with verbose output
forge test -vvv

# Start mock API server (for local CRE workflow testing)
bun run scripts/mock-api-server.ts

# Start dashboard
cd dashboard && bun run dev
```

## Project Structure

```
src/
  contracts/
    SolvencyConsumer.sol          # CRE report consumer + rescue hook
    MilestoneConsumer.sol         # CRE report consumer + tranche hook
    TokenizedFundingEngine.sol    # ERC-1155 + CCIP + Automation + Data Feeds
    FundingBridgeReceiver.sol     # Real CCIPReceiver
    ReserveVerifier.sol           # PoR + Automation
    ConfidentialSolvencyCompute.sol  # CC placeholder
  workflows/
    solvency-oracle.ts            # CRE workflow: AI + solvency monitoring
    milestone-oracle.ts           # CRE workflow: satellite + permit verification
    funding-engine.ts             # CRE workflow: funding health monitoring
  lib/
    confidential-compute-placeholder.ts  # CC SDK abstraction layer
test/
  SolvencyConsumer.t.sol          # 17 tests
  MilestoneConsumer.t.sol         # 21 tests
  TokenizedFundingEngine.t.sol    # 16 tests
  FundingBridgeReceiver.t.sol     # 9 tests (CCIPLocalSimulator)
  ReserveVerifier.t.sol           # 14 tests
  ConfidentialSolvencyCompute.t.sol  # 15 tests
  Integration.t.sol               # 8 tests (full lifecycle E2E)
config/
  solvency-oracle.config.json     # CRE workflow configs
  milestone-oracle.config.json
  funding-engine.config.json
scripts/
  mock-api-server.ts              # Mock API for local CRE testing
  deploy-solvency.ts              # Deployment scripts
  deploy-milestone.ts
  deploy-funding.ts
  deploy-reserve-verifier.ts
  lib/network.ts                  # Shared Sepolia/Tenderly network config
dashboard/                        # Next.js 15 monitoring dashboard
```

## Team

**Willis** -- Revitalization Protocol

## License

MIT
