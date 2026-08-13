// Biome lint & format check lane with per-file ratcheted baseline

import { join } from 'node:path'
import { readJSON, writeJSON } from '../utils/helpers'
import type { DetailItem, LaneExecutionContext, LaneResult, TypeCheckBaseline } from './types'

const BASELINE_PATH = 'scripts/quality-gate/data/lint-baseline.json'

// ── Biome output parsing ──────────────────────────────────────────

interface LintIssue {
  file: string
  line?: number
  category: string // e.g. "lint/suspicious/noConsoleLog" or "format"
  message: string
  severity: 'error' | 'warn' | 'format'
}

function parseBiomeIssues(output: string): LintIssue[] {
  const issues: LintIssue[] = []
  const lines = output.split(/\r?\n/)

  // Biome output format:
  //   path/to/file.ts:line:col category [SEVERITY]
  //     marker message
  // or for format issues:
  //   path/to/file.ts format ━━...
  //     × Formatter would have printed...

  let currentFile: string | null = null
  let currentCategory = ''

  for (const line of lines) {
    // Section header: "path/to/file.ts format ━━━..." or "path/to/file.ts:1:2 lint/rule ━━━..."
    const headerMatch = line.match(/^(.+?\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml))\s+(.+?)\s+━/)
    if (headerMatch) {
      currentFile = normalizePath(headerMatch[1]!)
      currentCategory = headerMatch[2]!
      continue
    }

    // Also handle: "path/to/file.ts:158:1 lint/suspicious/noConsoleLog  FIXABLE  ━━..."
    const headerMatch2 = line.match(
      /^(.+?\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml)):(\d+):\d+\s+([\w/]+)(?:\s+\w+)?\s+━/,
    )
    if (headerMatch2) {
      currentFile = normalizePath(headerMatch2[1]!)
      currentCategory = headerMatch2[3]!
      continue
    }

    // Detail line: "  × message" or "  ! message" or "  i message"
    const detailMatch = line.match(/^\s{2}([×!✗⚠✔])\s+(.+)$/)
    if (!detailMatch || !currentFile) continue

    const [, marker, message] = detailMatch
    let severity: LintIssue['severity']
    if (currentCategory === 'format') {
      severity = 'format'
    } else if (marker === '×' || marker === '✗') {
      severity = 'error'
    } else if (marker === '!' || marker === '⚠') {
      severity = 'warn'
    } else {
      continue
    }

    issues.push({
      file: currentFile,
      category: currentCategory,
      message: message.trim(),
      severity,
    })
  }

  return issues
}

function normalizePath(path: string): string {
  return path
    .replace(/^.*[\\/]src[\\/]/, 'src/')
    .replace(/^.*[\\/]scripts[\\/]/, 'scripts/')
    .replace(/^.*[\\/]\.claude[\\/]/, '.claude/')
    .replace(/\\/g, '/')
}

// ── Per-file counting ─────────────────────────────────────────────

function countByFile(issues: LintIssue[]): {
  perFile: Record<string, number>
  totalErrors: number
  totalFormat: number
} {
  const perFile: Record<string, number> = {}
  let totalErrors = 0
  let totalFormat = 0
  for (const i of issues) {
    if (i.severity === 'format') {
      totalFormat++
      continue
    }
    if (i.severity === 'error') {
      perFile[i.file] = (perFile[i.file] || 0) + 1
      totalErrors++
    }
  }
  return { perFile, totalErrors, totalFormat }
}

// ── Ratchet ───────────────────────────────────────────────────────

function compareRatchet(
  current: Record<string, number>,
  baseline: Record<string, number>,
): DetailItem[] {
  const details: DetailItem[] = []
  const allFiles = new Set([...Object.keys(current), ...Object.keys(baseline)])
  let _regressions = 0

  for (const file of [...allFiles].sort()) {
    const cur = current[file] || 0
    const base = baseline[file] || 0
    const delta = cur - base

    if (delta > 0) {
      _regressions++
      details.push({
        label: `${file}: +${delta} lint errors`,
        status: 'error',
        message: `Was ${base}, now ${cur} — regression`,
      })
    } else if (delta < 0 && delta <= -3) {
      details.push({
        label: `${file}: ${delta} errors`,
        status: 'ok',
        message: `Improved: ${base} → ${cur}`,
      })
    }
  }
  return details
}

// ── Main ──────────────────────────────────────────────────────────

export async function runLintCheck(ctx: LaneExecutionContext): Promise<LaneResult> {
  const started = Date.now()
  const rootDir = ctx.rootDir
  const baselinePath = join(rootDir, BASELINE_PATH)

  // 1. Run Biome
  let issues: LintIssue[] = []
  let exitCode = 0
  try {
    const proc = Bun.spawn(['bun', 'run', 'lint:biome'], {
      cwd: rootDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    exitCode = await proc.exited
    issues = parseBiomeIssues(`${stdout}\n${stderr}`)
  } catch (err) {
    return {
      id: 'lint-check',
      title: 'Lint & Format Check',
      status: 'failed',
      durationMs: Date.now() - started,
      category: 'unit',
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const { perFile, totalErrors, totalFormat } = countByFile(issues)

  // 2. Load or create baseline
  let baseline = readJSON<TypeCheckBaseline>(baselinePath)
  if (!baseline) {
    baseline = {
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      totalErrors: totalErrors,
      totalWarnings: totalFormat,
      perFile: {},
    }
    writeJSON(baselinePath, baseline)
  }

  // 3. Ratchet
  const hasBaseline = Object.keys(baseline.perFile).length > 0
  const ratchetDetails = hasBaseline ? compareRatchet(perFile, baseline.perFile) : []
  const hasRegressions = ratchetDetails.some((d) => d.status === 'error')

  // 4. Baseline mode: update
  if (ctx.options.mode === 'baseline') {
    baseline.totalErrors = totalErrors
    baseline.totalWarnings = totalFormat
    baseline.perFile = perFile
    baseline.updated_at = new Date().toISOString()
    writeJSON(baselinePath, baseline)
  }

  // 5. Determine status
  let status: LaneResult['status']
  if (totalErrors === 0 && totalFormat === 0) {
    status = 'passed'
  } else if (hasRegressions) {
    status = 'failed'
  } else {
    status = 'warn'
  }

  // 6. Build details
  const details: DetailItem[] = []
  details.push({
    label: 'Summary',
    status: totalErrors === 0 ? 'ok' : hasRegressions ? 'error' : 'warn',
    message: `${totalErrors} lint errors, ${totalFormat} format issues`,
  })

  if (hasBaseline) {
    const delta = totalErrors - baseline.totalErrors
    details.push({
      label: 'vs baseline',
      status: delta > 0 ? 'error' : 'ok',
      message: `${delta >= 0 ? '+' : ''}${delta} lint errors (was ${baseline.totalErrors})`,
    })
    details.push(...ratchetDetails.slice(0, 15))
    if (ctx.options.mode === 'baseline') {
      details.push({ label: 'Baseline updated', status: 'ok' })
    }
  } else {
    // No baseline: show sample issues
    for (const i of issues.slice(0, 15)) {
      details.push({
        label: i.file,
        status: i.severity === 'error' ? 'error' : 'warn',
        message: `[${i.category}] ${i.message}`,
      })
    }
  }

  return {
    id: 'lint-check',
    title: 'Lint & Format Check',
    status,
    durationMs: Date.now() - started,
    category: 'unit',
    description: `${totalErrors} errors, ${totalFormat} format — ratchet check`,
    details,
    exitCode,
  }
}
