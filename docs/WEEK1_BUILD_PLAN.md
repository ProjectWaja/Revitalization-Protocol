# Revitalization Protocol — Week 1 Build Plan

## 🎯 Week 1 Goal
Stand up the CRE project scaffold, deploy the core Solvency Oracle workflow, and lay the foundation for the Milestone Verification Oracle. By end of Week 1 you should have:
- A working CRE TypeScript project that compiles to WASM and simulates locally
- The **Real-Time Solvency Oracle** workflow running on CRE (cron-triggered, fetches data feeds, calls AI risk scorer, writes solvency report onchain)
- A **SolvencyConsumer.sol** deployed to Ethereum Sepolia that receives solvency reports
- The **Milestone Oracle** workflow stubbed with satellite API integration (USGS/Earth Engine mock)
- A **MilestoneConsumer.sol** that stores verified milestone progress scores
- All config, secrets, and testnet deployment scripts ready

---

## Day 1 (Thu Feb 6): Project Scaffold + CRE Setup

### Tasks
| # | Task | Est. Time | Output |
|---|------|-----------|--------|
| 1.1 | Register at [cre.chain.link](https://cre.chain.link), install CRE CLI | 30 min | CLI ready, account linked |
| 1.2 | `cre init revitalization-protocol --lang typescript` | 10 min | Project scaffold |
| 1.3 | Install dependencies: `@chainlink/cre-sdk`, `zod`, `viem` | 10 min | `package.json` |
| 1.4 | Create `.env` + secrets config for API keys (Anthropic, Alchemy, mock satellite API) | 20 min | `config/secrets.json` |
| 1.5 | Set up GitHub repo, `.gitignore`, basic README shell | 20 min | Public repo live |
| 1.6 | Configure Ethereum Sepolia + Polygon Amoy RPC endpoints (Alchemy free tier) | 15 min | RPC URLs in config |
| 1.7 | Fund testnet wallets (Sepolia ETH + LINK faucets) | 15 min | Wallets funded |

### External Resources Needed
- **CRE Account**: [cre.chain.link](https://cre.chain.link)
- **Alchemy**: Free API key for Sepolia + Polygon Amoy RPC
- **Faucets**: [faucets.chain.link](https://faucets.chain.link) for Sepolia ETH + LINK
- **Anthropic API Key**: For Claude-based risk scoring (you already have this)
- **Bun runtime**: CRE TypeScript SDK requires Bun (`curl -fsSL https://bun.sh/install | bash`)

---

## Day 2 (Fri Feb 7): Solvency Oracle CRE Workflow

### Tasks
| # | Task | Est. Time | Output |
|---|------|-----------|--------|
| 2.1 | Write `src/workflows/solvency-oracle.ts` — the core CRE workflow | 2 hr | Workflow file |
| 2.2 | Define Zod config schema + `config/solvency-oracle.config.json` | 30 min | Config ready |
| 2.3 | Implement `fetchCostIndices()` — HTTP call to Chainlink Data Feed proxy / mock commodity API | 1 hr | Data fetching logic |
| 2.4 | Implement `computeSolvencyScore()` — pure function for weighted scoring | 30 min | Scoring logic |
| 2.5 | Implement AI risk agent call — HTTP POST to Anthropic Claude API for risk narrative | 1 hr | AI integration |
| 2.6 | Run `cre workflow simulate` — validate full workflow locally | 30 min | Passing simulation |

### Key Architecture Decisions
- **Trigger**: Cron (every 5 min in dev, every 1 hr in prod)
- **Data Sources**: ETH/USD feed (via Sepolia Data Feed address), mock commodity index API, mock funding velocity API
- **AI Agent**: Claude API via x402-style HTTP call (simulated — actual x402 requires Base mainnet, so we use direct API call with Confidential Compute placeholder for the secret key)
- **Output**: `runtime.report()` generates a signed solvency report written to `SolvencyConsumer.sol`
- **Privacy placeholder**: Solvency calculation wrapped in a function annotated for future Confidential Compute migration

---

## Day 3 (Sat Feb 8): SolvencyConsumer.sol + Testnet Deployment

### Tasks
| # | Task | Est. Time | Output |
|---|------|-----------|--------|
| 3.1 | Write `SolvencyConsumer.sol` — receives & stores solvency reports | 1.5 hr | Contract |
| 3.2 | Write deployment script (`scripts/deploy-solvency.ts`) using viem | 1 hr | Deploy script |
| 3.3 | Deploy to Ethereum Sepolia | 30 min | Verified contract address |
| 3.4 | Generate CRE EVM bindings: `cre evm generate-bindings` | 20 min | Type-safe bindings |
| 3.5 | Wire workflow to write solvency report onchain | 1 hr | End-to-end flow |
| 3.6 | Test full loop: trigger → fetch → score → AI → write onchain | 1 hr | Working pipeline |

### Contract Design
```
SolvencyConsumer.sol
├── receiveSolvencyReport(bytes report) — Keystone-compatible receive
├── getLatestSolvency(bytes32 projectId) → (uint8 score, uint8 riskLevel, uint256 timestamp)
├── getSolvencyHistory(bytes32 projectId, uint256 count) → SolvencyReport[]
├── Events: SolvencyUpdated, RiskAlertTriggered
└── Modifiers: onlyAuthorizedWorkflow (workflow DON address)
```

---

## Day 4 (Sun Feb 9): Milestone Oracle Workflow

### Tasks
| # | Task | Est. Time | Output |
|---|------|-----------|--------|
| 4.1 | Write `src/workflows/milestone-oracle.ts` — CRE workflow for milestone verification | 2 hr | Workflow file |
| 4.2 | Implement mock satellite data fetcher (USGS Earth Explorer API or static fixtures) | 1.5 hr | External data integration |
| 4.3 | Implement AI-powered progress scoring (image analysis mock + Claude narrative) | 1 hr | AI milestone scorer |
| 4.4 | Implement `MilestoneConsumer.sol` contract | 1.5 hr | Contract |

### Milestone Oracle Architecture
- **Trigger**: HTTP trigger (called when a project submits milestone claim) + Cron backup (weekly audit sweep)
- **Data Sources**:
  - Mock satellite imagery: pre-staged USGS image URLs with metadata
  - Permit status API: mock JSON endpoint simulating city permit database
  - Drone feed placeholder: base64-encoded static image for progress comparison
- **AI Agent**: Claude API for image analysis narrative + progress percentage estimation
- **Output**: Milestone verification report → `MilestoneConsumer.sol`
- **Privacy**: Drone/satellite imagery URLs and analysis details wrapped for Confidential Compute

---

## Day 5 (Mon Feb 10): MilestoneConsumer Deploy + Integration

### Tasks
| # | Task | Est. Time | Output |
|---|------|-----------|--------|
| 5.1 | Deploy `MilestoneConsumer.sol` to Sepolia | 30 min | Contract address |
| 5.2 | Wire milestone workflow to write onchain | 1 hr | Working E2E |
| 5.3 | Create inter-workflow link: Solvency reads milestone status for scoring | 1.5 hr | Cross-workflow data |
| 5.4 | Implement `src/lib/confidential-compute-placeholder.ts` | 1 hr | CC abstraction layer |
| 5.5 | Write basic test suite for both workflows | 1.5 hr | `test/` files |

### Confidential Compute Strategy
Since CC SDK drops Feb 14, 2026, we build a clean abstraction:
```typescript
// All sensitive compute goes through this wrapper
// Week 3: swap implementation to real CC SDK
export function confidentialCompute<T>(
  fn: () => T,
  metadata: { sensitivity: 'high' | 'medium' | 'low' }
): T {
  // TODO: Replace with actual Confidential Compute when SDK is available
  // For now, execute locally with audit log
  console.log(`[CC_PLACEHOLDER] Executing ${metadata.sensitivity} computation`)
  return fn()
}
```

---

## Day 6-7 (Tue-Wed Feb 11-12): Polish, Docs, Week 2 Prep

### Tasks
| # | Task | Est. Time | Output |
|---|------|-----------|--------|
| 6.1 | Write comprehensive README with architecture diagram | 2 hr | README.md |
| 6.2 | Create Mermaid architecture diagram | 1 hr | `docs/architecture.mermaid` |
| 6.3 | Verify both workflows simulate cleanly | 1 hr | Green simulations |
| 6.4 | Prepare deployment for CRE mainnet DON (if quota available) | 1 hr | Deployed workflows |
| 6.5 | Plan Week 2 tokenization + funding engine specs | 1 hr | Week 2 spec doc |
| 6.6 | Create mock data fixtures for demo scenarios | 1 hr | `config/fixtures/` |

---

## Files Created This Week

```
revitalization-protocol/
├── package.json
├── tsconfig.json
├── bun.lockb
├── .gitignore
├── README.md
├── config/
│   ├── solvency-oracle.config.json
│   ├── milestone-oracle.config.json
│   ├── secrets.json (gitignored)
│   └── fixtures/
│       ├── mock-satellite-data.json
│       ├── mock-permit-status.json
│       └── mock-funding-velocity.json
├── src/
│   ├── workflows/
│   │   ├── solvency-oracle.ts          ← FIRST DELIVERABLE
│   │   └── milestone-oracle.ts
│   ├── contracts/
│   │   ├── SolvencyConsumer.sol
│   │   └── MilestoneConsumer.sol
│   ├── lib/
│   │   ├── confidential-compute-placeholder.ts
│   │   ├── risk-scoring.ts
│   │   └── data-normalization.ts
│   └── types/
│       ├── solvency.ts
│       └── milestone.ts
├── scripts/
│   ├── deploy-solvency.ts
│   └── deploy-milestone.ts
├── test/
│   ├── solvency-oracle.test.ts
│   └── milestone-oracle.test.ts
└── docs/
    ├── WEEK1_BUILD_PLAN.md
    ├── architecture.mermaid
    └── product-spec.md
```

---

## Risk Factors & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| CRE TypeScript SDK instability (v1.0.7) | Workflow compilation failures | Pin exact version, keep Go SDK as fallback |
| Confidential Compute SDK not ready by Feb 14 | Can't integrate CC | Abstraction layer already built, swap in when ready |
| Testnet faucet rate limits | Can't deploy/test | Pre-fund multiple wallets, use Tenderly Virtual TestNets |
| x402 requires Base mainnet for real payments | Can't demo live x402 | Mock x402 flow with standard HTTP + document real integration path |
| LLM non-determinism breaks CRE consensus | AI calls fail in DON | Use `runInNodeMode` with `identicalAggregation` on structured JSON output, pin model + temperature=0 |

---

## Key Technical Notes

1. **CRE uses Bun, not Node.js** — All TypeScript compiles via Javy/QuickJS to WASM. No `node:*` modules.
2. **No async/await for SDK ops** — Use `.result()` pattern for all capabilities.
3. **Secrets via CRE secrets manager** — Use `runtime.getSecret()`, not env vars.
4. **`runtime.log()` only** — `console.log` doesn't work in WASM.
5. **`runtime.now()` for time** — `Date.now()` breaks consensus across nodes.
6. **Reports for onchain writes** — Use `runtime.report()` + Keystone consumer pattern.
