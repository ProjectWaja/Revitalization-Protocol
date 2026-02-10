# Revitalization Protocol — Presentation & Demo Brief

Use this document to generate a hackathon presentation in Claude.ai.
Prompt: "Create a professional slide deck from this briefing document for a Chainlink hackathon submission."

---

## SECTION 1: THE STORY (Slides 1-4)

### Slide 1: Title
- **Revitalization Protocol**
- Real-time solvency monitoring + tokenized rescue funding for stalled infrastructure projects
- Chainlink Convergence 2026 Hackathon
- Built by Willis

### Slide 2: The Problem
- Large infrastructure projects ($100M-$1B+) routinely stall mid-construction
- California High-Speed Rail: $100B+ in cost overruns, decades delayed
- Oceanwide Plaza (LA): $1B+ skyscraper abandoned at 80% completion
- When projects stall: capital is trapped, communities lose economic opportunity, investors have no recourse
- **No automated system exists** to detect failing projects early, trigger emergency funding, or verify rescue capital reaches actual construction

### Slide 3: Why This Matters
- $13 trillion global infrastructure gap (World Economic Forum)
- 35% of mega-projects experience cost overruns >50%
- Stalled projects create urban blight, wasted materials, legal battles
- Current process is manual: months of negotiations, no transparency, no accountability

### Slide 4: Our Solution
Revitalization Protocol is a Chainlink-powered oracle platform that:
1. **DETECTS** financial distress in real time (AI-powered solvency scoring)
2. **TRIGGERS** tokenized rescue funding rounds automatically (ERC-1155)
3. **VERIFIES** construction progress via satellite/drone data (rule-based scoring)
4. **PROTECTS** sensitive financial data (Confidential Compute)
5. **BRIDGES** cross-chain capital (CCIP: Sepolia <-> Polygon Amoy)

---

## SECTION 2: HOW IT WORKS (Slides 5-10)

### Slide 5: Architecture Overview
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
              ConfidentialSolvencyCompute.sol (attestations)
```

Data flows from oracles → consumer contracts → funding engine → reserve verification.
Cross-module hooks use typed interfaces with try/catch for graceful degradation.

### Slide 6: 7 Chainlink Services
| # | Service | Where | What It Does |
|---|---------|-------|--------------|
| 1 | CRE Workflows | All 3 modules | Orchestration layer — triggers, consensus, signed reports |
| 2 | AI Agents (Claude) | Solvency Oracle | Risk narrative + rescue trigger decision (temp=0, identical consensus) |
| 3 | Data Feeds | Solvency Oracle | Commodity cost indices (steel, concrete, labor) via HTTP proxy |
| 4 | CCIP | Funding Engine | Cross-chain token transfers between Sepolia and Polygon Amoy |
| 5 | Automation | Funding Engine + Reserve Verifier | Auto-expire stale rounds, periodic reserve re-verification (4h interval) |
| 6 | Proof of Reserves | Reserve Verifier | Verify project reserves match claimed deposits on-chain |
| 7 | Confidential Compute | Solvency Compute | Privacy-preserving weighted scoring with attestation hashes |

### Slide 7: Solvency Oracle (Hero Feature — AI + CRE)
- The ONLY module using AI — deliberate design choice
- Calls Anthropic Claude inside CRE via `runInNodeMode`
- `identical` consensus aggregation: every DON node runs the same prompt, produces the same structured JSON
- Temperature = 0, structured output schema enforced
- Scores 4 dimensions: Financial Health (35%), Cost Exposure (20%), Funding Momentum (25%), Runway Adequacy (20%)
- If overall score < 25 → triggers rescue funding automatically via cross-module hook
- Strong fallback: if AI call fails, falls back to rule-based scoring

### Slide 8: Tokenized Funding Engine (DeFi)
- ERC-1155 multi-token standard: each funding round + investor position = unique token
- Two round types: STANDARD (normal funding) and RESCUE (emergency, triggered by solvency oracle)
- Milestone-gated tranche release: funds locked until construction milestones verified
- Example: 4 milestones × 25% each — 25% of funds released per verified milestone
- Investors deposit ETH, receive ERC-1155 position tokens, claim pro-rata on tranche release
- Chainlink Automation: checkUpkeep scans for expired OPEN rounds, performUpkeep cancels them
- AccessControl roles: SOLVENCY_ORACLE_ROLE, MILESTONE_ORACLE_ROLE, DEFAULT_ADMIN_ROLE

### Slide 9: Milestone Oracle + Reserve Verifier
**Milestone Oracle (Rule-Based)**:
- Receives satellite/drone imagery data + permit records from CRE workflow
- Deterministic scoring: structural change detection + image similarity + site activity + permits
- If progress >= threshold AND permits 100% → approved → triggers tranche release on Funding Engine

**Reserve Verifier (Proof of Reserves + Automation)**:
- Verifies project reserves match claimed deposits using Chainlink PoR feeds
- Also verifies the Funding Engine's ETH balance matches reported deposits (self-audit)
- Chainlink Automation: checkUpkeep checks 4-hour interval, performUpkeep calls verifyFundingEngineReserves
- 5 verification states: UNVERIFIED, VERIFIED, UNDER_RESERVED, STALE_DATA, FEED_UNAVAILABLE

### Slide 10: Confidential Compute + Privacy
- ConfidentialSolvencyCompute.sol: privacy-preserving solvency scoring
- Weighted score calculation: Financial Health (35%), Cost Exposure (20%), Funding Momentum (25%), Runway Adequacy (20%)
- Attestation hashes stored on-chain — proves computation was done in enclave without revealing raw data
- Roles: COMPUTE_OPERATOR_ROLE (submits), ENCLAVE_ROLE (attests)
- Solvency Oracle workflow reads CC attestation hash if confidentialComputeAddress is configured

---

## SECTION 3: WHAT WE BUILT (Slides 11-13)

### Slide 11: Smart Contracts (6 contracts, 87 tests)
| Contract | Lines | Tests | Key Features |
|----------|-------|-------|--------------|
| SolvencyConsumer.sol | ~300 | 17 | Ownable, receives CRE reports, rescue trigger hook |
| MilestoneConsumer.sol | ~280 | 21 | Ownable, receives CRE reports, tranche trigger hook |
| TokenizedFundingEngine.sol | ~550 | 13 | ERC-1155, AccessControl, ReentrancyGuard, Pausable, Automation |
| ReserveVerifier.sol | ~380 | 14 | PoR integration, Automation, engine self-audit |
| ConfidentialSolvencyCompute.sol | ~200 | 15 | AccessControl, weighted scoring, attestation hashes |
| FundingBridgeReceiver.sol | ~120 | — | CCIP receiver stub (architecture demo) |
| **Integration Test** | — | 7 | Full lifecycle E2E including automation + cross-module hooks |
| **TOTAL** | ~1830 | **87** | All passing |

### Slide 12: CRE Workflows (3 TypeScript workflows)
| Workflow | AI? | Steps | What It Does |
|----------|-----|-------|--------------|
| solvency-oracle.ts | YES (Claude) | 6 | Fetch financials → Data Feeds → AI risk scoring → Confidential Compute → Encode report → Sign |
| milestone-oracle.ts | No (rule-based) | 5 | Fetch imagery → Structural analysis → Site activity → Permit check → Encode report |
| funding-engine.ts | No (rule-based) | 5 | Read contracts → Investor analysis → Concentration/velocity risk → Health status → Encode report |

All workflows have fallback paths if any external call fails.

### Slide 13: Dashboard + Infrastructure
- **Dashboard**: Next.js 15 + Tailwind CSS 4, reads live Sepolia contract data via viem
  - 5 panels: Solvency (circular score ring), Milestones (4-card grid), Funding (round cards with progress bars), Reserves (ratio bar with threshold), Architecture (data flow diagram)
  - Auto-polls every 10 seconds, shows Live/Demo indicator
- **Deploy scripts**: 4 scripts that deploy in order and wire cross-module hooks
- **Demo simulation**: Full E2E lifecycle on local Anvil (11 steps)
- **Mock API server**: Simulates CRE external data sources on port 3001

### Slide 14: Deployed on Sepolia
| Contract | Address |
|----------|---------|
| SolvencyConsumer | 0x4127a05f683d02ec7c691d295261f8298bfdb20d |
| MilestoneConsumer | 0x510046808d7f20e7e3cb0f23038461c99eb62da3 |
| TokenizedFundingEngine | 0x96dbe5f3cf891a6a8da49e27568ae817c471d719 |
| ReserveVerifier | 0x59b214722d632191921551ce59431acf65c05f0d |

All verified on Sepolia Etherscan. Cross-module hooks wired and operational.

---

## SECTION 4: DEMO GUIDE (Slides 15-18)

### Slide 15: Demo Option A — Local Anvil (Recommended for Video)
This runs the full lifecycle in ~30 seconds on your local machine.

**Prerequisites**:
- Foundry installed (provides `anvil` and `forge`)
- Bun installed

**Steps**:
```
# Terminal 1: Start local blockchain
anvil

# Terminal 2: Compile contracts + run demo
cd "C:\Dev\Chainlink Hackathon Feb 2026"
forge build
bun run scripts/demo-simulation.ts
```

**What happens** (11 automated steps):
1. Deploys all 4 contracts to local Anvil
2. Wires cross-module hooks (SolvencyConsumer → FundingEngine, MilestoneConsumer → FundingEngine)
3. Registers demo project ($50M budget, 4 milestones)
4. Creates standard funding round (10 ETH target, 4 tranches × 25%)
5. Investor 1 deposits 6 ETH (60%), Investor 2 deposits 4 ETH (40%)
6. Milestone oracle reports milestone 0 at 100% → first tranche (2.5 ETH) released automatically
7. Investors claim their pro-rata share of released funds
8. Solvency oracle reports CRITICAL score (15/100) → rescue funding round created automatically
9. Investor 1 funds the rescue round
10. ReserveVerifier validates the engine's ETH balance matches deposits
11. Completes remaining milestones 1-3 → all tranches released → round COMPLETED

**Expected output**: Clean step-by-step console log showing each transaction, balances, and status changes.

### Slide 16: Demo Option B — Dashboard Visual
```
# Terminal 1: Start Anvil
anvil

# Terminal 2: Run demo (populates contracts with data)
cd "C:\Dev\Chainlink Hackathon Feb 2026"
forge build
bun run scripts/demo-simulation.ts

# Terminal 3: Start dashboard (pointed at Anvil)
cd dashboard
# Create .env.local with Anvil addresses from demo output:
#   NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
#   NEXT_PUBLIC_SOLVENCY_ADDRESS=<from demo output>
#   NEXT_PUBLIC_MILESTONE_ADDRESS=<from demo output>
#   NEXT_PUBLIC_FUNDING_ADDRESS=<from demo output>
#   NEXT_PUBLIC_RESERVE_ADDRESS=<from demo output>
bun dev
# Open http://localhost:3000
```

Dashboard will show live data from the local Anvil contracts after the demo simulation runs.

### Slide 17: Demo Option C — Sepolia Live
The contracts are already deployed on Sepolia. The dashboard defaults to these addresses.

```
cd "C:\Dev\Chainlink Hackathon Feb 2026\dashboard"
bun dev
# Open http://localhost:3000
```

Dashboard connects to Sepolia and reads live contract state. Since no solvency/milestone reports have been submitted to the Sepolia contracts yet, it will show default values (score 0, no milestones verified, no funding rounds).

To submit data to Sepolia contracts, you'd use `cast` commands:
```
# Example: Submit a solvency report to Sepolia
cast send 0x4127a05f683d02ec7c691d295261f8298bfdb20d \
  "receiveSolvencyReport(bytes)" \
  <encoded-report-bytes> \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY
```

### Slide 18: Running Tests
```
cd "C:\Dev\Chainlink Hackathon Feb 2026"
forge test
```
Expected: 87 tests passing across 6 test suites + 1 integration suite.

Individual suites:
```
forge test --match-contract SolvencyConsumerTest     # 17 tests
forge test --match-contract MilestoneConsumerTest    # 21 tests
forge test --match-contract TokenizedFundingEngineTest # 13 tests
forge test --match-contract ReserveVerifierTest      # 14 tests
forge test --match-contract ConfidentialSolvencyComputeTest # 15 tests
forge test --match-contract IntegrationTest          # 7 tests
```

---

## SECTION 5: HACKATHON FIT (Slides 19-20)

### Slide 19: Four Categories
| Category | Prize | Our Integration |
|----------|-------|-----------------|
| **DeFi & Tokenization** | $20K | ERC-1155 funding positions, milestone-gated tranches, CCIP cross-chain bridging |
| **CRE & AI** | $17K | AI risk scoring (Claude) inside CRE with identical consensus — hero feature |
| **Risk & Compliance** | $16K | Real-time solvency monitoring, Proof of Reserves, Automation audit trails |
| **Privacy** | $16K | Confidential Compute for sensitive financials + attestation architecture |

Total potential: $69K across 4 categories

### Slide 20: Why We Win
- **7 Chainlink services** integrated (more than most teams)
- **87 tests passing** — production-quality code, not a hackathon prototype
- **Deployed to Sepolia** — not just local, actually on testnet with hooks wired
- **Real-world problem** — $13T infrastructure gap, not a toy use case
- **AI done right** — one powerful integration (Solvency Oracle) instead of AI everywhere
- **Cross-module hooks** — contracts talk to each other automatically (rescue trigger, tranche release)
- **Full lifecycle demo** — funding → milestones → tranches → rescue → verification, all automated

---

## SECTION 6: TECH SPECS (Reference)

### Tech Stack
- Solidity 0.8.24 via Foundry
- OpenZeppelin v5.5.0 (ERC-1155, AccessControl, ReentrancyGuard, Pausable, Ownable)
- Chainlink CRE SDK (TypeScript, compiled to WASM)
- Bun runtime
- Next.js 15 + Tailwind CSS 4
- viem (Ethereum client library)
- zod (schema validation)
- Anthropic Claude (Solvency Oracle only, temp=0, structured JSON)
- Ethereum Sepolia + Polygon Amoy testnets

### Key Design Decisions
1. **Only Solvency Oracle uses AI** — Milestone and Funding Engine are 100% rule-based for demo reliability
2. **ERC-1155 over ERC-20** — single contract manages all funding positions (gas efficient, composable)
3. **Typed interfaces for hooks** — not low-level `.call()`, compiler-checked with try/catch safety
4. **Automation for cleanup** — expired rounds cancelled automatically, reserves checked every 4 hours
5. **Confidential Compute as attestation layer** — proves computation without revealing raw financials

### GitHub
https://github.com/ProjectWaja/Revitalization-Protocol
