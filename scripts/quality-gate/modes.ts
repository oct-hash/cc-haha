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
  {
    id: 'typecheck',
    title: 'TypeScript Type Check',
    description: 'Run tsc --noEmit to verify type safety',
    kind: 'command',
    requiredForModes: ['pr', 'baseline', 'release'],
    category: 'unit',
    impactTrigger: 'typecheck',
  },
  {
    id: 'lint-check',
    title: 'Lint & Format Check',
    description: 'Run Biome lint and format validation',
    kind: 'command',
    requiredForModes: ['pr', 'baseline', 'release'],
    category: 'unit',
    impactTrigger: 'lint-check',
  },
  {
    id: 'test-results',
    title: 'Test Results',
    description: 'Validate all tests pass (not just coverage)',
    kind: 'command',
    requiredForModes: ['pr', 'baseline', 'release'],
    category: 'unit',
    impactTrigger: 'test-results',
  },
  {
    id: 'file-hygiene',
    title: 'File Hygiene',
    description: 'Check large files, console.log, TODO/FIXME, hardcoded paths',
    kind: 'command',
    requiredForModes: ['pr', 'baseline', 'release'],
    category: 'governance',
    impactTrigger: 'file-hygiene',
  },
  {
    id: 'doc-checks',
    title: 'Documentation Checks',
    description: 'Validate README, CHANGELOG, CLAUDE.md completeness and sync',
    kind: 'command',
    requiredForModes: ['pr', 'baseline'],
    category: 'governance',
    impactTrigger: 'doc-checks',
  },
  {
    id: 'config-audit',
    title: 'Configuration Audit',
    description: 'Deep validation of .env, .mcp.json, settings.json',
    kind: 'command',
    requiredForModes: ['pr', 'baseline', 'release'],
    category: 'governance',
    impactTrigger: 'config-audit',
  },
  {
    id: 'security-scan',
    title: 'Security Scan',
    description: 'Scan for hardcoded secrets, sensitive files, vulnerabilities',
    kind: 'command',
    requiredForModes: ['pr', 'baseline', 'release'],
    category: 'governance',
    impactTrigger: 'security-scan',
  },
  {
    id: 'dep-health',
    title: 'Dependency Health',
    description: 'Check outdated packages, license compliance, duplicate deps',
    kind: 'command',
    requiredForModes: ['release'],
    category: 'integration',
    impactTrigger: 'dep-health',
  },
]

// ── Mode → Lane Mapping ────────────────────────────────────────

const MODE_LANES: Record<QualityGateMode, string[]> = {
  pr: [
    'impact-report',
    'policy-checks',
    'typecheck',
    'lint-check',
    'test-results',
    'file-hygiene',
    'coverage',
    'quarantine',
  ],
  baseline: [
    'impact-report',
    'policy-checks',
    'typecheck',
    'lint-check',
    'test-results',
    'file-hygiene',
    'coverage',
    'quarantine',
  ],
  release: [
    'impact-report',
    'policy-checks',
    'typecheck',
    'lint-check',
    'test-results',
    'coverage',
    'quarantine',
    'file-hygiene',
    'doc-checks',
    'config-audit',
    'security-scan',
    'dep-health',
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
