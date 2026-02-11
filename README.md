# Revitalization Protocol

**Chainlink Convergence Hackathon 2026 | DeFi & Tokenization | Risk & Compliance | CRE & AI | Privacy**

A decentralized infrastructure monitoring and funding protocol that uses Chainlink services to bring transparency, automation, and trust to construction project finance.

## What It Does

Revitalization Protocol monitors the financial health of large infrastructure projects (bridges, highways, public buildings) and automates funding decisions based on verifiable onchain data. When a project's solvency drops critically, the protocol can autonomously trigger rescue funding rounds. When construction milestones are verified complete, tranche payments are released to investors.

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

## Chainlink Services Used

| # | Service | Integration Status | Details |
|---|---------|-------------------|---------|
| 1 | **CRE Workflows** | Real | Two full workflows (solvency + milestone) using `@chainlink/cre-sdk` with HTTPClient, EVMClient, consensus aggregation, cron triggers, and signed report delivery |
| 2 | **AI Agent (CRE)** | Real | Solvency Oracle calls Claude via HTTP inside the CRE workflow for narrative risk assessment -- the only AI-powered workflow, serving as the hero feature for CRE & AI track |
| 3 | **Data Feeds** | Real + Gap | `AggregatorV3Interface` imported from `@chainlink/contracts`. ETH/USD price feed integrated into TokenizedFundingEngine for USD valuations. See [Data Feed Gaps](#data-feed-gaps) below |
| 4 | **CCIP** | Real | `CCIPReceiver` from `@chainlink/contracts-ccip`, `Client.EVM2AnyMessage` for cross-chain funding. FundingBridgeReceiver inherits real CCIPReceiver. Tested with `CCIPLocalSimulator` from `@chainlink/local` |
| 5 | **Automation** | Real Interface | `checkUpkeep`/`performUpkeep` on TokenizedFundingEngine (expired round cancellation) and ReserveVerifier (periodic reserve checks). Ready to register at automation.chain.link |
| 6 | **Proof of Reserves** | Real Interface + Gap | Uses real `AggregatorV3Interface` to read PoR feeds. See [PoR Gaps](#proof-of-reserves-gaps) below |
| 7 | **Confidential Compute** | Placeholder + Onchain Hook | `ConfidentialSolvencyCompute.sol` is production-ready with roles, attestation hashes, and enclave verification. TypeScript placeholder wraps computation boundary. See [CC Gaps](#confidential-compute-gaps) below |

### Real vs Mock Philosophy

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
| `TokenizedFundingEngine.sol` | ERC-1155 tokenized funding rounds, CCIP cross-chain, Automation, Data Feeds, Rescue Premium | 19 |
| `FundingBridgeReceiver.sol` | Real CCIPReceiver for cross-chain funding messages | 9 |
| `ReserveVerifier.sol` | Chainlink PoR + Automation for periodic reserve verification | 14 |
| `ConfidentialSolvencyCompute.sol` | Privacy-preserving solvency scoring with attestation hashes | 15 |
| `Integration.t.sol` | End-to-end lifecycle: deploy, fund, milestone, tranche, rescue, automation, CC | 8 |
| **Total** | | **103** |

## Tech Stack

- **Solidity 0.8.24** -- Foundry (forge build, forge test)
- **Chainlink Contracts** -- `@chainlink/contracts`, `@chainlink/contracts-ccip`, `@chainlink/local`
- **OpenZeppelin v5.5.0** -- ERC-1155, AccessControl, ReentrancyGuard, Pausable, Ownable
- **CRE SDK** -- `@chainlink/cre-sdk` for TypeScript workflows
- **Bun** -- TypeScript runtime for workflows, deploy scripts, mock API
- **Next.js 15 + Tailwind 4** -- Dashboard at `dashboard/`

## Quick Start

```bash
# Install dependencies
bun install

# Build contracts
forge build

# Run all 103 tests
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
  solvency-oracle.config.json
  milestone-oracle.config.json
scripts/
  mock-api-server.ts
  deploy-solvency.ts
  deploy-milestone.ts
  deploy-funding.ts
dashboard/                        # Next.js 15 monitoring dashboard
```

## Deployment (Sepolia)

```bash
# Deploy SolvencyConsumer
bun run scripts/deploy-solvency.ts

# Deploy MilestoneConsumer
bun run scripts/deploy-milestone.ts

# Deploy TokenizedFundingEngine (uses real ETH/USD feed on Sepolia)
bun run scripts/deploy-funding.ts
```

## Team

**Willis** -- Revitalization Protocol

## License

MIT
