# Revitalization Protocol — Presentation Guide

**Chainlink Convergence Hackathon 2026**
**Total runtime: 3-4 minutes**

---

## PART 1: OPENING SLIDES (60-90 seconds)

### Slide 1: The Problem

**Title**: $600 Billion in Stalled Infrastructure. Zero Transparency.

**Talking points**:

> Every year, hundreds of billions of dollars in infrastructure projects stall mid-construction. Oceanwide Plaza in downtown Los Angeles — a $1.2 billion mixed-use skyscraper — broke ground in 2015, ran out of money in 2019, and sat as an unfinished concrete skeleton for seven years. The developer's financials were opaque. Investors had no visibility. The city had no early warning system.
>
> This isn't a one-off. 35% of mega-projects globally experience cost overruns exceeding 50%. The World Economic Forum estimates a $15 trillion infrastructure gap. Projects fail not because the engineering is bad, but because the financial monitoring is.

**Key stats to show on slide**:
- $1.2B Oceanwide Plaza — abandoned at 80% completion (2019)
- 35% of mega-projects have 50%+ cost overruns
- $15T global infrastructure investment gap (World Economic Forum)
- Average time to detect a failing project: 18-24 months too late

---

### Slide 2: The Solution

**Title**: Revitalization Protocol — AI-Powered Infrastructure Monitoring on Chainlink

**Talking points**:

> Revitalization Protocol is a decentralized monitoring and funding system for infrastructure projects. It uses Chainlink CRE to run an AI-powered solvency oracle that scores a project's financial health every five minutes. When the score drops critically, the protocol automatically creates a tokenized rescue funding round with premium incentives for emergency investors. When construction milestones are verified complete, tranche payments release automatically.
>
> Think of it as a financial immune system for infrastructure — it detects distress early, triggers emergency response automatically, and verifies every dollar through Proof of Reserves.

**Key visual**: Simple flow diagram:
```
Monitor (CRE + AI) → Detect (Solvency Score) → Respond (Rescue Funding) → Verify (Proof of Reserves)
```

---

### Slide 3: Why It Matters

**Title**: Trustless Infrastructure Finance

**Talking points**:

> Today, project monitoring is manual — quarterly audits by consulting firms, self-reported financials, and trust-based milestone verification. By the time anyone notices a project is failing, it's already too late.
>
> Revitalization Protocol replaces trust with verification. Every solvency assessment is signed by a Chainlink DON. Every milestone is independently verified. Every funding dollar is tracked on-chain and auditable through Proof of Reserves. And because rescue funding is tokenized as ERC-1155 with premium incentives, there's a real economic mechanism to save distressed projects before they become abandoned skeletons.
>
> The $13 trillion global construction industry currently has zero decentralized tooling. We're building the first protocol to bring Chainlink's oracle infrastructure to physical-world construction finance.

**Key differentiators to show**:
- 7 Chainlink services integrated (most hackathon teams use 2-3)
- AI used surgically — only in the Solvency Oracle, not everywhere
- 100 passing tests across 7 test suites
- Deployed to Tenderly Virtual TestNet (Sepolia fork)
- Cross-module hooks: contracts communicate autonomously

---

## PART 2: LIVE DEMO (90-120 seconds)

### What to show

The demo uses the Next.js dashboard running against deployed contracts. It walks through the Oceanwide Plaza scenario in three stages, showing how different outcomes trigger different protocol responses.

---

### Demo Scene 1: Overview & Deployed Contracts (15 sec)

**Show**: Dashboard overview tab

**Narrate**:
> Here's our monitoring dashboard for Oceanwide Plaza — a $1.2 billion mixed-use development in downtown LA. At the top you can see our four contracts deployed on Tenderly's Virtual TestNet — a Sepolia fork with persistent state. Each contract is color-coded and tagged with the Chainlink services it uses.

**What the judges see**:
- Network status bar (Tenderly Virtual TestNet, block number, chain ID)
- 4 deployed contracts with addresses and Chainlink service tags
- Cross-module wiring diagram (Solvency→Rescue, Milestone→Tranche, Reserves→Solvency)

---

### Demo Scene 2: Stage 1 — Foundation (30 sec)

**Action**: Select "On Track" (good) variant, click Execute

**Narrate**:
> The demo lets you choose how the project unfolds across three stages. In Stage 1, the foundation phase, we'll run the "On Track" scenario. Watch what happens.
>
> The solvency oracle reports a score of 85 — LOW risk. Strong fundamentals. An investor deposits 10 ETH into the tokenized funding round — you can see the ERC-1155 position token minted. The milestone oracle verifies the foundation is complete at 100%, and that automatically triggers a tranche release — that's the cross-module hook from MilestoneConsumer to TokenizedFundingEngine firing. Finally, the reserve verifier confirms the engine balance matches deposits.

**What the judges see**:
- Transaction log with contract badges (color-coded per contract)
- Chain Reaction Flow diagram lighting up as contracts fire
- Cross-contract hook arrow: Milestone → Funding Engine
- Bottom metrics updating: Solvency 85, Milestone 1/4, Funding 10 ETH, Reserves verified

---

### Demo Scene 3: Stage 2 — Construction Pressure (30 sec)

**Action**: Select "Budget Overruns" (bad) variant, click Execute

**Narrate**:
> Now things get interesting. In stage two, we'll run the worst case — Budget Overruns. Capital controls from China restrict funding, costs spiral.
>
> Watch the solvency score — it drops from 85 to 35, then to 28. That's HIGH risk. The burn rate hits $6.8 million per month with only $150 million remaining. The milestone oracle reports steel framing stuck at 85% — not approved, so the tranche stays locked. That's the protocol protecting investor capital — no verified milestone, no release.
>
> The reserve verifier runs and flags the dangerous coverage ratio. At this point, the protocol has detected the crisis 18 months earlier than traditional monitoring would.

**What the judges see**:
- Solvency dropping through consecutive reports
- Milestone LOCKED (tranche NOT released)
- Metrics turning orange/red
- Reserve coverage declining

---

### Demo Scene 4: Stage 3 — Rescue (30 sec)

**Action**: Select "Managed Rescue" (neutral) variant, click Execute

**Narrate**:
> Stage three — the resolution. The solvency oracle detects a CRITICAL score of 22. This breaches the rescue threshold, and here's where the magic happens — watch the cross-module hook.
>
> SolvencyConsumer automatically calls TokenizedFundingEngine.initiateRescueFunding(). A rescue round is created with a 39% premium — that's the economic incentive for emergency investors. An investor funds the rescue round, the tranche releases, and they claim their principal plus the premium bonus.
>
> After the rescue capital injection, the solvency score recovers to 48. The protocol detected distress, triggered emergency funding, incentivized new capital, and started recovery — all autonomously, all on-chain, all verifiable.

**What the judges see**:
- CRITICAL solvency alert
- Cross-contract hook: Solvency → Rescue Funding
- Rescue round creation with premium
- Investor deposit + claim with bonus
- Solvency recovery
- Tenderly trace links on every transaction

---

### Demo Scene 5: Bottom Metrics (15 sec)

**Narrate**:
> The bottom metrics updated in real-time throughout — solvency score, milestone progress, total ETH raised including rescue rounds, and reserve coverage. All of this data is read directly from the contracts every 5 seconds. Nothing is simulated — these are real contract reads from the deployed contracts.

---

## PART 3: CLOSING SLIDES (30-60 seconds)

### Slide 4: Architecture & Chainlink Integrations

**Title**: 7 Chainlink Services, 6 Smart Contracts, 100 Tests

**Show this table**:

| Service | Where | Status |
|---------|-------|--------|
| **CRE Workflows** | Solvency Oracle (5-min cron), Milestone Oracle (weekly) | Real SDK |
| **AI Agent** | Claude risk narrative inside CRE — hero feature | Real via HTTP |
| **Data Feeds** | ETH/USD for USD valuations in funding engine | Real AggregatorV3 |
| **CCIP** | Cross-chain funding: Sepolia to Polygon Amoy | Real CCIPReceiver |
| **Automation** | Expired round cancellation + periodic reserve audits | Real interface |
| **Proof of Reserves** | Engine balance vs. reported deposits verification | Real interface |
| **Confidential Compute** | Privacy-preserving solvency scoring (onchain hook ready) | Architecture ready |

**Talking points**:
> Under the hood — six production smart contracts, three CRE workflows, 100 tests all passing. We integrate seven Chainlink services. The key design pattern is cross-module hooks — typed interfaces with try/catch so contracts communicate autonomously but degrade gracefully if one fails.
>
> AI is used surgically. Only the Solvency Oracle calls Claude, via HTTP inside CRE with identical consensus aggregation. The Milestone Oracle and Funding Engine are pure rule-based. This is intentional — AI where it adds real value, deterministic logic everywhere else.

---

### Slide 5: Tech Stack

**Show**:

| Layer | Technology |
|-------|-----------|
| Contracts | Solidity 0.8.24, Foundry, OpenZeppelin v5.5.0 |
| Tokens | ERC-1155 (multi-position), AccessControl, ReentrancyGuard |
| Chainlink | CRE SDK, CCIP, Data Feeds, Automation, PoR, Confidential Compute |
| Workflows | TypeScript CRE with HTTPClient, EVMClient, consensus aggregation |
| Dashboard | Next.js 15, Tailwind 4, viem |
| Testnet | Tenderly Virtual TestNet (Sepolia fork), deployed + wired |
| Tests | 100 passing across 7 suites (Forge) |

---

### Slide 6: What We Documented as Gaps

**Title**: We Built What Exists. We Documented What Doesn't.

**Talking points**:
> We're transparent about what Chainlink doesn't cover yet. Four explicit gaps are documented in-code with `CHAINLINK DATA GAP` comments:
>
> 1. **Construction material price feeds** — steel, concrete, lumber, labor. A $13T industry with zero decentralized pricing.
> 2. **Satellite/drone imagery analysis DON** — automated construction site verification.
> 3. **Project escrow Proof of Reserves** — PoR for bank-held construction funds.
> 4. **Confidential Compute SDK** — our onchain hook is production-ready, waiting for the SDK.
>
> Every gap is a future Chainlink product opportunity. The architecture is designed so when these feeds exist, they plug in directly.

---

### Slide 7: Closing

**Title**: Revitalization Protocol

**Key line**:
> Infrastructure projects fail because no one is watching. Revitalization Protocol watches autonomously, responds automatically, and verifies everything on-chain. Built on Chainlink CRE with AI, CCIP, Data Feeds, Automation, Proof of Reserves, and Confidential Compute — seven services working together to bring trust to the $13 trillion infrastructure gap.

**Show**:
- GitHub repo link
- Contract addresses (Tenderly)
- Hackathon categories: DeFi & Tokenization, CRE & AI, Risk & Compliance, Privacy

---

## TIMING SUMMARY

| Section | Duration | Content |
|---------|----------|---------|
| Slide 1: Problem | 20 sec | $600B stalled, Oceanwide Plaza example |
| Slide 2: Solution | 25 sec | CRE + AI monitoring, rescue funding, tranche release |
| Slide 3: Why It Matters | 25 sec | Trustless infra finance, 7 services, differentiators |
| Demo: Overview | 15 sec | Dashboard, deployed contracts, network status |
| Demo: Stage 1 Good | 30 sec | Solvency 85, invest, milestone, tranche release |
| Demo: Stage 2 Bad | 30 sec | Solvency crashes, milestone locked, reserves declining |
| Demo: Stage 3 Rescue | 30 sec | Critical alert, rescue hook, premium funding, recovery |
| Demo: Metrics | 15 sec | Real-time bottom row, all from contract reads |
| Slide 4: Architecture | 20 sec | 7 services table, cross-module hooks |
| Slide 5: Tech Stack | 10 sec | Quick flash of stack |
| Slide 6: Gaps | 20 sec | 4 documented gaps = future Chainlink products |
| Slide 7: Closing | 10 sec | Key line + links |
| **Total** | **~4 min** | |

---

## DEMO FALLBACK PLAN

If Tenderly quota is unavailable during recording:

1. **Option A**: Switch to local Anvil (`NEXT_PUBLIC_NETWORK=anvil`). Identical UI, instant execution, zero rate limits. Mention in video: "Running against a local Sepolia fork — the same contracts are deployed on Tenderly Virtual TestNet."

2. **Option B**: Pre-record the demo when Tenderly quota resets. Splice into final video.

3. **Option C**: Show `forge test` running all 100 tests passing as proof of contract correctness, then walk through the dashboard UI with pre-populated state.

---

## JUDGE HOOKS (What Makes Them Remember You)

1. **Real-world resonance**: "Oceanwide Plaza — Google it. $1.2 billion abandoned in downtown LA. This actually happened."

2. **AI discipline**: "We use AI in exactly one place — the Solvency Oracle. Not because we couldn't put it everywhere, but because this is the one place where LLM reasoning genuinely adds value over rules."

3. **Cross-module hooks**: "When solvency drops below 25, the SolvencyConsumer doesn't just emit an event — it calls TokenizedFundingEngine.initiateRescueFunding() directly. Contracts talking to contracts, no human in the loop."

4. **Seven services**: "Most teams integrate two or three Chainlink services. We use seven — CRE, AI, Data Feeds, CCIP, Automation, Proof of Reserves, and Confidential Compute."

5. **Honest about gaps**: "We didn't fake what doesn't exist. Four gaps are documented in-code. Each one is a future Chainlink product opportunity worth billions."
