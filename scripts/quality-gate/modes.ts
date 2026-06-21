// Mode → lane mapping + lane registry

import type { LaneDefinition, QualityGateMode } from './lanes/types'

// ── Lane Registry ──────────────────────────────────────────────

export const ALL_LANES: LaneDefinition[] = [
  {
    id: 'impact-report',
    title: 'Impact Report',
    description: 'Analyze changed files to decide which checks to run',
    kind: 'command',
    requiredForModes: ['pr', 'baseline', 'release'],
    category: 'scope',
  },
  {
    id: 'policy-checks',
    title: 'Policy Checks',
    description: 'Validate hookify rules, agents, skills, hooks, settings',
    kind: 'command',
    requiredForModes: ['pr', 'baseline', 'release'],
    category: 'governance',
    impactTrigger: 'policy-checks',
  },
  {
    id: 'coverage',
    title: 'Coverage Gate',
    description: 'Ratcheted coverage check against baseline',
    kind: 'command',
    requiredForModes: ['pr', 'baseline', 'release'],
    category: 'coverage',
    impactTrigger: 'coverage',
  },
  {
    id: 'quarantine',
    title: 'Quarantine Governance',
    description: 'Track and manage quarantined items',
    kind: 'command',
    requiredForModes: ['pr', 'baseline', 'release'],
    category: 'governance',
  },
  {
    id: 'server-checks',
    title: 'MCP Server Checks',
    description: 'Probe MCP server connectivity',
    kind: 'command',
    requiredForModes: ['release'],
    category: 'integration',
    impactTrigger: 'server-checks',
  },
  {
    id: 'provider-smoke',
    title: 'Provider Smoke',
    description: 'Live API provider connectivity check',
    kind: 'provider-smoke',
    requiredForModes: ['release'],
    category: 'smoke',
    live: true,
  },
]

// ── Mode → Lane Mapping ────────────────────────────────────────

const MODE_LANES: Record<QualityGateMode, string[]> = {
  pr: ['impact-report', 'policy-checks', 'coverage', 'quarantine'],
  baseline: ['impact-report', 'policy-checks', 'coverage', 'quarantine'],
  release: [
    'impact-report',
    'policy-checks',
    'coverage',
    'quarantine',
    'server-checks',
    'provider-smoke',
  ],
}

/** Get lane IDs that should run for a given mode */
export function getLanesForMode(mode: QualityGateMode): string[] {
  return [...MODE_LANES[mode]]
}

/** Look up a lane definition by ID */
export function getLaneById(id: string): LaneDefinition | undefined {
  return ALL_LANES.find((l) => l.id === id)
}

/** Filter lanes: onlyLanes takes priority; skipLanes removes */
export function filterLanes(
  laneIds: string[],
  onlyLanes?: string[],
  skipLanes?: string[],
): string[] {
  let result = laneIds

  if (onlyLanes && onlyLanes.length > 0) {
    result = result.filter((id) => onlyLanes.includes(id))
  }

  if (skipLanes && skipLanes.length > 0) {
    result = result.filter((id) => !skipLanes.includes(id))
  }

  return result
}
