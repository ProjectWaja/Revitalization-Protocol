# Demo Video Script — Revitalization Protocol

**Target length**: 3-5 minutes
**Setup**: Anvil running, dashboard open at localhost:3000

---

## Scene 1: The Problem (30 seconds)

**Show**: Title slide or dashboard header

**Say**: "Every year, billions of dollars in infrastructure projects stall or fail — not because of engineering problems, but because of opaque financial reporting, delayed funding, and zero real-time oversight. The 2021 Infrastructure Investment and Jobs Act allocated $1.2 trillion, but there's no transparent system to monitor whether that money is being spent effectively."

---

## Scene 2: The Solution (30 seconds)

**Show**: Scroll to Architecture Panel

**Say**: "Revitalization Protocol brings real-time, trustless monitoring to infrastructure projects using 7 Chainlink services working together. CRE Workflows orchestrate the entire pipeline — fetching off-chain data, computing risk scores with AI, verifying milestones via satellite imagery, and managing tokenized funding with milestone-gated releases."

---

## Scene 3: One-Click Deploy (30 seconds)

**Action**: Click **Deploy & Setup** button
**Show**: Watch the status indicator turn green, "Connected" badge appears, all panels populate with live data

**Say**: "With one click, we deploy all smart contracts to the blockchain, wire the cross-module hooks, register the project, create the first funding round, submit an initial solvency report, and deploy a Chainlink Data Feed for ETH/USD pricing. Everything is now live."

---

## Scene 4: Solvency Oracle + AI (45 seconds)

**Action**: Move the solvency slider to **85**, click Submit
**Show**: SolvencyPanel updates — score changes, risk level goes to LOW, component bars shift

**Say**: "The Solvency Oracle is the hero feature. A CRE Workflow fetches cost indices, reads on-chain financials, computes a weighted score using Confidential Compute, then calls Claude for AI risk assessment — all with DON consensus. Watch the score update in real time."

**Action**: Slide to **35**, click Submit
**Show**: Score drops, risk turns HIGH, orange bars

**Say**: "When the score drops below 50, risk escalates to HIGH. The system automatically flags the project for increased monitoring."

---

## Scene 5: Milestone Completion + Tranche Release (30 seconds)

**Action**: Select **Milestone 0: Foundation & Excavation**, click Complete
**Show**: MilestonePanel shows 100% green bar, FundingPanel shows first tranche released

**Say**: "When a milestone is verified — through satellite imagery analysis and permit data — the MilestoneConsumer automatically triggers a tranche release on the Funding Engine via cross-module hooks. No manual intervention needed."

---

## Scene 6: Investment + ETH/USD Pricing (30 seconds)

**Action**: Set round to **1**, amount to **5**, click Invest
**Show**: FundingPanel progress bar jumps, USD values appear next to ETH

**Action**: Change ETH price to **$4,000** using the quick buttons, click Update
**Show**: All USD values across the dashboard update

**Say**: "Investors purchase ERC-1155 fractional position tokens. Chainlink Data Feeds provide real-time ETH/USD conversion so stakeholders see USD values alongside ETH. Watch what happens when ETH price doubles — all funding amounts update instantly."

---

## Scene 7: Rescue Funding (30 seconds)

**Action**: Click **Trigger Rescue** (red button)
**Show**: SolvencyPanel shows CRITICAL, FundingPanel shows new RESCUE round appear

**Say**: "When solvency drops to critical — below 25 — the SolvencyConsumer automatically triggers emergency rescue funding through the cross-module hook. A new RESCUE round is created instantly, allowing emergency capital injection to prevent project failure."

---

## Scene 8: Confidential Compute (30 seconds)

**Action**: Click **Deploy CC Contract**, adjust the 4 sliders, click **Compute On-Chain**
**Show**: Attestation hash appears, score and risk level display

**Say**: "Confidential Compute enables privacy-preserving scoring. Raw financial inputs are never stored on-chain — only the weighted score and a keccak256 attestation hash are recorded. This proves the computation was done correctly without exposing sensitive data."

---

## Scene 9: CRE Workflow Simulation (30 seconds)

**Action**: Select **All 3 Workflows**, click Execute
**Show**: Step-by-step execution log fills in with green checkmarks

**Say**: "Here's what happens inside the CRE Workflows. Each step — HTTP fetch with consensus, EVM reads with BFT guarantees, Confidential Compute scoring, and signed report delivery — executes in sequence across the Chainlink DON. Three independent workflows, one unified pipeline."

---

## Scene 10: Proof of Reserves (20 seconds)

**Action**: Click **Verify Reserves**
**Show**: ReservePanel updates — engine verification status, coverage bar, USD values

**Say**: "Chainlink Proof of Reserves continuously verifies that the Funding Engine's on-chain balance matches reported deposits. Chainlink Automation runs these checks every 4 hours. Full collateral transparency, fully automated."

---

## Scene 11: Closing (20 seconds)

**Show**: Scroll through the full dashboard

**Say**: "Revitalization Protocol — 7 Chainlink services, 6 smart contracts, 87 passing tests, deployed on Sepolia. Real-time solvency monitoring with AI, tokenized funding with milestone-gated releases, privacy-preserving computation, and cross-chain interoperability. All orchestrated by CRE. Thank you."

---

## Quick Reference: Button Order

1. Deploy & Setup
2. Solvency → 85 → Submit
3. Solvency → 35 → Submit
4. Milestone 0 → Complete
5. Invest → Round 1, 5 ETH
6. ETH Price → $4,000
7. Trigger Rescue
8. Deploy CC → Adjust sliders → Compute
9. Workflow → All → Execute
10. Verify Reserves
11. Scroll through dashboard

## Pre-Recording Checklist

- [ ] Anvil running (`anvil --host 127.0.0.1`)
- [ ] Dashboard running (`cd dashboard && bun dev`)
- [ ] Browser at `http://localhost:3000`
- [ ] Screen recording software ready (OBS / Loom / QuickTime)
- [ ] Microphone tested
- [ ] Browser zoom at 90-100% so all panels fit
- [ ] No other tabs / notifications visible
