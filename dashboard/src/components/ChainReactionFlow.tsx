'use client'

import { CONTRACT_COLORS, CONTRACT_SHORT, type ContractName, type DecodedEvent } from '@/lib/chain-events'

// ── Node positions (SVG coords) ──────────────────────────────────────────

interface NodeDef {
  name: ContractName
  x: number
  y: number
  w: number
  h: number
}

const NODES: NodeDef[] = [
  { name: 'CRE Workflow',           x: 20,  y: 60,  w: 120, h: 44 },
  { name: 'SolvencyConsumer',       x: 200, y: 20,  w: 140, h: 44 },
  { name: 'MilestoneConsumer',      x: 200, y: 110, w: 140, h: 44 },
  { name: 'TokenizedFundingEngine', x: 430, y: 60,  w: 168, h: 44 },
  { name: 'ReserveVerifier',        x: 430, y: 150, w: 140, h: 44 },
]

// ── Edge definitions ─────────────────────────────────────────────────────

interface EdgeDef {
  from: ContractName
  to: ContractName
  label: string
  id: string
}

const EDGES: EdgeDef[] = [
  { from: 'CRE Workflow',      to: 'SolvencyConsumer',       label: 'reports',      id: 'CRE Workflow→SolvencyConsumer' },
  { from: 'CRE Workflow',      to: 'MilestoneConsumer',      label: 'reports',      id: 'CRE Workflow→MilestoneConsumer' },
  { from: 'SolvencyConsumer',  to: 'TokenizedFundingEngine', label: 'rescue hook',  id: 'SolvencyConsumer→TokenizedFundingEngine' },
  { from: 'MilestoneConsumer', to: 'TokenizedFundingEngine', label: 'tranche hook', id: 'MilestoneConsumer→TokenizedFundingEngine' },
  { from: 'ReserveVerifier',   to: 'TokenizedFundingEngine', label: 'verifies',     id: 'ReserveVerifier→TokenizedFundingEngine' },
  { from: 'ReserveVerifier',   to: 'SolvencyConsumer',       label: 'verifies',     id: 'ReserveVerifier→SolvencyConsumer' },
]

// ── Component ────────────────────────────────────────────────────────────

interface Props {
  activeContracts: Set<string>
  activeEdges: Set<string>
  heroEvents: DecodedEvent[]
  hoveredContract?: string | null
}

export function ChainReactionFlow({ activeContracts, activeEdges, heroEvents, hoveredContract }: Props) {
  const nodeMap = Object.fromEntries(NODES.map(n => [n.name, n]))

  // Group hero events by the edge they belong to
  const edgeHeroLabels: Record<string, string[]> = {}
  for (const evt of heroEvents) {
    // Map certain events to specific edges
    if (evt.event === 'RescueFundingActivated' || evt.event === 'RescueFundingInitiated') {
      const key = 'SolvencyConsumer→TokenizedFundingEngine'
      if (!edgeHeroLabels[key]) edgeHeroLabels[key] = []
      if (!edgeHeroLabels[key].includes(evt.event)) edgeHeroLabels[key].push(evt.event)
    } else if (evt.event === 'TrancheReleased') {
      const key = 'MilestoneConsumer→TokenizedFundingEngine'
      if (!edgeHeroLabels[key]) edgeHeroLabels[key] = []
      if (!edgeHeroLabels[key].includes(evt.event)) edgeHeroLabels[key].push(evt.event)
    } else if (evt.event === 'FundingEngineVerified') {
      const key = 'ReserveVerifier→TokenizedFundingEngine'
      if (!edgeHeroLabels[key]) edgeHeroLabels[key] = []
      if (!edgeHeroLabels[key].includes(evt.event)) edgeHeroLabels[key].push(evt.event)
    }
  }

  return (
    <div className="bg-gray-800/30 rounded-lg p-4">
      <h4 className="text-xs text-gray-500 mb-3 uppercase tracking-wider">Contract Flow</h4>
      <svg viewBox="0 0 630 210" className="w-full" style={{ maxHeight: '240px' }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
          </marker>
          <marker id="arrow-active" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#60a5fa" />
          </marker>
        </defs>

        {/* Edges */}
        {EDGES.map((edge) => {
          const fromNode = nodeMap[edge.from]
          const toNode = nodeMap[edge.to]
          if (!fromNode || !toNode) return null

          const isActive = activeEdges.has(edge.id)
          const fromCx = fromNode.x + fromNode.w / 2
          const fromCy = fromNode.y + fromNode.h / 2
          const toCx = toNode.x + toNode.w / 2
          const toCy = toNode.y + toNode.h / 2

          // Compute edge endpoints on the node boundaries
          const dx = toCx - fromCx
          const dy = toCy - fromCy
          const angle = Math.atan2(dy, dx)
          const x1 = fromCx + Math.cos(angle) * (fromNode.w / 2)
          const y1 = fromCy + Math.sin(angle) * (fromNode.h / 2)
          const x2 = toCx - Math.cos(angle) * (toNode.w / 2 + 8) // gap for arrow
          const y2 = toCy - Math.sin(angle) * (toNode.h / 2 + 8)

          const midX = (x1 + x2) / 2
          const midY = (y1 + y2) / 2

          const heroLabels = edgeHeroLabels[edge.id]

          return (
            <g key={edge.id}>
              {/* Background line */}
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={isActive ? '#60a5fa' : '#374151'}
                strokeWidth={isActive ? 2 : 1}
                markerEnd={isActive ? 'url(#arrow-active)' : 'url(#arrow)'}
                strokeDasharray={isActive ? '6 4' : undefined}
                style={isActive ? { animation: 'edge-flow 0.8s linear infinite' } : undefined}
              />
              {/* Edge label */}
              <text
                x={midX} y={midY - 6}
                textAnchor="middle"
                className="text-[10px]"
                fill={isActive ? '#93c5fd' : '#6b7280'}
              >
                {edge.label}
              </text>
              {/* Hero event badges on edge */}
              {isActive && heroLabels?.map((label, i) => (
                <g key={label} transform={`translate(${midX - 40}, ${midY + 4 + i * 14})`}>
                  <rect x={0} y={0} width={80} height={12} rx={3} fill="#1e3a5f" stroke="#3b82f6" strokeWidth={0.5} />
                  <text x={40} y={9} textAnchor="middle" fill="#93c5fd" className="text-[9px] font-medium">
                    {label}
                  </text>
                </g>
              ))}
            </g>
          )
        })}

        {/* Nodes */}
        {NODES.map((node) => {
          const isActive = activeContracts.has(node.name)
          const isHovered = hoveredContract === node.name
          const colors = CONTRACT_COLORS[node.name]
          const short = CONTRACT_SHORT[node.name]

          return (
            <g
              key={node.name}
              style={{
                ...(isActive ? {
                  ['--glow-color' as string]: colors.hex,
                  animation: 'node-glow 2s ease-in-out infinite, node-pulse 2s ease-in-out infinite',
                } : {}),
                ...(isHovered && !isActive ? {
                  ['--glow-color' as string]: colors.hex,
                  animation: 'node-glow 1.5s ease-in-out infinite',
                } : {}),
              }}
            >
              <rect
                x={node.x} y={node.y}
                width={node.w} height={node.h}
                rx={8}
                fill={isActive || isHovered ? `${colors.hex}15` : '#1f2937'}
                stroke={isActive || isHovered ? colors.hex : '#374151'}
                strokeWidth={isActive ? 2 : 1}
              />
              <text
                x={node.x + node.w / 2}
                y={node.y + node.h / 2 - 4}
                textAnchor="middle"
                fill={isActive || isHovered ? colors.hex : '#9ca3af'}
                className="text-[11px] font-semibold"
              >
                {short}
              </text>
              <text
                x={node.x + node.w / 2}
                y={node.y + node.h / 2 + 9}
                textAnchor="middle"
                fill={isActive || isHovered ? `${colors.hex}cc` : '#6b7280'}
                className="text-[9px]"
              >
                {node.name === 'CRE Workflow' ? 'Chainlink CRE' : node.name.replace('Consumer', '').replace('Tokenized', '').replace('Engine', '')}
              </text>
              {/* Active indicator dot */}
              {isActive && (
                <circle
                  cx={node.x + node.w - 6}
                  cy={node.y + 6}
                  r={3}
                  fill={colors.hex}
                  style={{ animation: 'node-pulse 1.5s ease-in-out infinite' }}
                />
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
