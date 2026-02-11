export type VariantKey = 'good' | 'neutral' | 'bad'

export interface ScenarioVariant {
  key: VariantKey
  label: string
  tagline: string
  preview: {
    solvency: string
    risk: string
    financials: string
    burn: string
    milestone: string
    funding: string
  }
  triggers: string[]
  outcomes: string[]
}

export interface StageDefinition {
  id: 1 | 2 | 3
  label: string
  period: string
  narrative: string
  variants: Record<VariantKey, ScenarioVariant>
}

export const STAGES: StageDefinition[] = [
  {
    id: 1,
    label: 'Foundation',
    period: '2015-2017',
    narrative:
      'Oceanwide Holdings launches a $1.2B mixed-use development in downtown LA. Capital flows from China, construction begins on a 49-story tower. How well does the foundation phase go?',
    variants: {
      good: {
        key: 'good',
        label: 'On Track',
        tagline: 'On budget, strong fundamentals, milestone on time',
        preview: {
          solvency: '85 (LOW)',
          risk: 'LOW',
          financials: '$400M / $800M remaining',
          burn: '$1.5M/mo',
          milestone: 'Foundation complete, tranche released',
          funding: '10 ETH invested, round FUNDED',
        },
        triggers: ['No alerts fire', 'Tranche auto-released on milestone'],
        outcomes: [
          'Solvency gauge shows green (85)',
          'Milestone 0 shows VERIFIED',
          'Round #1 fully funded, 25% released',
          'Reserves verified',
        ],
      },
      neutral: {
        key: 'neutral',
        label: 'Minor Delays',
        tagline: 'Slightly over budget, milestone behind schedule',
        preview: {
          solvency: '68 (MEDIUM)',
          risk: 'MEDIUM',
          financials: '$480M / $720M remaining',
          burn: '$2.2M/mo',
          milestone: '80% progress, tranche LOCKED',
          funding: '7 ETH invested, round still OPEN',
        },
        triggers: ['No alerts (MEDIUM stays below alert threshold)', 'Tranche stays locked (not approved)'],
        outcomes: [
          'Solvency gauge turns yellow (68)',
          'Milestone 0 shows IN_PROGRESS at 80%',
          'Round #1 partially funded (7/10 ETH)',
          'First signs of concern in financials',
        ],
      },
      bad: {
        key: 'bad',
        label: 'Budget Overruns',
        tagline: 'Significant overruns, solvency deteriorating fast',
        preview: {
          solvency: '48 -> 42 (HIGH)',
          risk: 'HIGH',
          financials: '$580M / $620M remaining',
          burn: '$3.8M/mo',
          milestone: '60% progress, tranche LOCKED',
          funding: '5 ETH invested, round still OPEN',
        },
        triggers: ['HIGH risk alert fires (riskLevel >= 2)', 'Two consecutive solvency drops'],
        outcomes: [
          'Solvency drops to orange HIGH (42)',
          'Milestone 0 stuck at 60%',
          'Round #1 underfunded (5/10 ETH)',
          'Dashboard shows first warning signs',
        ],
      },
    },
  },
  {
    id: 2,
    label: 'Construction',
    period: '2017-2019',
    narrative:
      "Construction reaches the steel framing phase, but external pressures mount. China's capital controls tighten, funding velocity slows, and cost overruns accumulate. How does the project weather the storm?",
    variants: {
      good: {
        key: 'good',
        label: 'Steady Progress',
        tagline: 'Costs managed, solvency holds, milestone on track',
        preview: {
          solvency: '62 -> 58 (MEDIUM)',
          risk: 'MEDIUM',
          financials: '$700M / $500M remaining',
          burn: '$2.5M/mo',
          milestone: 'Steel Framing complete, tranche released',
          funding: 'Second 25% tranche released',
        },
        triggers: ['No alerts (MEDIUM stays stable)', 'Tranche released on milestone completion'],
        outcomes: [
          'Solvency stays yellow but stable (58)',
          'Milestone 1 shows VERIFIED',
          '50% of tranches now released',
          'Reserves still verified',
        ],
      },
      neutral: {
        key: 'neutral',
        label: 'Slowdown',
        tagline: 'Funding velocity drops, costs rising, liens appearing',
        preview: {
          solvency: '42 -> 38 (HIGH)',
          risk: 'HIGH',
          financials: '$950M / $250M remaining',
          burn: '$5.2M/mo',
          milestone: 'Steel Framing done at inflated cost',
          funding: 'Tranche released but costs outpacing',
        },
        triggers: ['2x HIGH risk alerts fire', 'Approaching rescue threshold (25)'],
        outcomes: [
          'Solvency turns orange HIGH (38)',
          'Milestone 1 complete but at cost overrun',
          'Financial panel shows burn > velocity',
          'Reserve coverage declining',
        ],
      },
      bad: {
        key: 'bad',
        label: 'Capital Crisis',
        tagline: 'Capital controls hit, liens mount, construction stalls',
        preview: {
          solvency: '35 -> 28 (HIGH)',
          risk: 'HIGH (near CRITICAL)',
          financials: '$1.05B / $150M remaining',
          burn: '$6.8M/mo',
          milestone: 'Steel Framing 85% — STUCK',
          funding: 'No tranche released (milestone incomplete)',
        },
        triggers: ['2x HIGH risk alerts', 'Score 28 dangerously close to rescue threshold (25)'],
        outcomes: [
          'Solvency deep orange (28), one step from rescue',
          'Milestone 1 stuck at 85%',
          'Burn rate consuming remaining reserves',
          'Dashboard screams warning — $150M left of $1.2B',
        ],
      },
    },
  },
  {
    id: 3,
    label: 'Resolution',
    period: '2019-2026',
    narrative:
      'The project reaches a critical juncture. Can it recover on its own, or does it need external rescue capital? The protocol responds differently depending on the severity — and the rescue premium mechanism incentivizes outside investors to step in.',
    variants: {
      good: {
        key: 'good',
        label: 'Recovery',
        tagline: 'Project stabilizes, new standard funding round succeeds',
        preview: {
          solvency: '52 -> 58 (MEDIUM)',
          risk: 'MEDIUM (recovering)',
          financials: '$1B / $200M remaining',
          burn: '$3.0M/mo',
          milestone: 'MEP Systems complete, tranche released',
          funding: 'New 8 ETH standard round FUNDED',
        },
        triggers: ['No rescue triggered (above threshold)', 'Standard round created normally'],
        outcomes: [
          'Solvency recovers to yellow (58)',
          'Milestone 2 shows VERIFIED',
          'New funding round in FundingPanel',
          'Protocol monitors but does not intervene',
        ],
      },
      neutral: {
        key: 'neutral',
        label: 'Rescue Funded',
        tagline: 'Solvency hits 22 — rescue triggered with 39% premium',
        preview: {
          solvency: '22 -> 48 (CRITICAL -> MEDIUM)',
          risk: 'CRITICAL then recovering',
          financials: 'Rescue round: 7.8 ETH target',
          burn: 'Premium pool: 3.042 ETH (39%)',
          milestone: 'Rescue tranche released at 100%',
          funding: 'Investor gets 7.8 + 3.042 = 10.842 ETH',
        },
        triggers: ['CRITICAL alert fires', 'Rescue round auto-created', '39% premium configured'],
        outcomes: [
          'Solvency flashes red CRITICAL (22), then recovers',
          'Rescue round appears with +39% Bonus badge',
          'Premium pool shows 3.042 ETH',
          'Investor earns 39% return on rescue capital',
        ],
      },
      bad: {
        key: 'bad',
        label: 'Desperate Measures',
        tagline: 'Solvency crashes to 10 — maximum premium 45% needed',
        preview: {
          solvency: '10 -> 35 (CRITICAL -> HIGH)',
          risk: 'CRITICAL (most severe)',
          financials: 'Rescue round: 9.0 ETH target',
          burn: 'Premium pool: 4.05 ETH (45%)',
          milestone: 'Rescue tranche released at 100%',
          funding: 'Investor gets 9.0 + 4.05 = 13.05 ETH',
        },
        triggers: ['CRITICAL alert (most severe)', 'Largest rescue round created', '45% premium — near maximum (50% cap)'],
        outcomes: [
          'Solvency deep red CRITICAL (10)',
          'Rescue round with +45% Bonus badge',
          'Huge premium pool (4.05 ETH)',
          'Recovery only to HIGH (35) — late intervention is expensive',
        ],
      },
    },
  },
]
