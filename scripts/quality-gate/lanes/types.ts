// Shared types for quality gate lanes

export type QualityGateMode = 'pr' | 'baseline' | 'release'

export type LaneStatus = 'passed' | 'failed' | 'skipped' | 'warn'
export type LaneKind = 'command' | 'baseline-case' | 'provider-smoke' | 'desktop-smoke'

export interface LaneDefinition {
  id: string
  title: string
  description: string
  kind: LaneKind
  requiredForModes: QualityGateMode[]
  category: LaneCategory
  command?: string[]
  /** Only run when impact-report says this check is needed */
  impactTrigger?: string
  live?: boolean
}

export type LaneCategory = 'scope' | 'governance' | 'unit' | 'coverage' | 'smoke' | 'integration'

export interface LaneResult {
  id: string
  title: string
  description?: string
  status: LaneStatus
  durationMs: number
  command?: string[]
  category?: LaneCategory
  details?: DetailItem[]
  error?: string
  skipReason?: string
  exitCode?: number
  logPath?: string
  live?: boolean
}

export interface DetailItem {
  label: string
  status: 'ok' | 'error' | 'warn'
  message?: string
}

export interface CoverageBaseline {
  version: 1
  created_at: string
  updated_at: string
  metrics: {
    statements: { pct: number; covered: number; total: number }
    branches: { pct: number; covered: number; total: number }
    functions: { pct: number; covered: number; total: number }
    lines: { pct: number; covered: number; total: number }
  }
}

export interface QuarantinedItem {
  id: string
  lane: string
  checkName: string
  title: string
  file?: string
  owner: string
  reason: string
  quarantinedAt: string
  reviewBy: string
  status: 'active' | 'overdue' | 'resolved'
  resolutionNote?: string
  resolvedAt?: string
}

export interface QualityGateReport {
  schemaVersion: 1
  runId: string
  mode: QualityGateMode
  dryRun: boolean
  allowLive: boolean
  startedAt: string
  finishedAt: string
  rootDir: string
  git: { sha: string | null; dirty: boolean }
  results: LaneResult[]
  impact?: ImpactSummary
  coverage?: CoverageSummary
  summary: { passed: number; failed: number; skipped: number }
}

export interface ImpactSummary {
  changedFiles?: number
  areas: string[]
  labels: string[]
  blocked?: boolean
  requiredChecks: string[]
}

export interface CoverageSuiteSummary {
  id: string
  title: string
  status: string
  lines?: { pct: number; covered: number; total: number }
  functions?: { pct: number; covered: number; total: number }
  branches?: { pct: number; covered: number; total: number }
  statements?: { pct: number; covered: number; total: number }
}

export interface CoverageSummary {
  reportPath: string
  suites: CoverageSuiteSummary[]
  failures: string[]
}

export interface QualityGateOptions {
  mode: QualityGateMode
  dryRun: boolean
  allowLive: boolean
  rootDir: string
  runId?: string
  onlyLanes?: string[]
  skipLanes?: string[]
  baselineTarget?: string
}

export interface LaneExecutionContext {
  options: QualityGateOptions
  rootDir: string
  outputDir: string
}

// Trigger patterns: which file changes trigger which lane ids
export const LANE_TRIGGERS: Record<string, string[]> = {
  coverage: ['src/**/*.ts', 'src/**/*.tsx'],
  'policy-checks': [
    '.claude/hookify.*.local.md',
    '.claude/agents/**/*.md',
    '.claude/skills/**/*.md',
    '.claude/hooks/**',
    '.claude/settings*.json',
  ],
  'server-checks': ['.claude/mcp.json'],
}
