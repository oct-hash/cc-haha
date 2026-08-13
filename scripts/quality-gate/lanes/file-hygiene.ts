// File hygiene lane: large files, console.log, debugger, TODO/FIXME, hardcoded paths
// Uses a ratcheted baseline so existing issues are grandfathered.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, } from 'node:path'
import { readJSON, writeJSON } from '../utils/helpers'
import type { DetailItem, LaneExecutionContext, LaneResult, TypeCheckBaseline } from './types'

const BASELINE_PATH = 'scripts/quality-gate/data/hygiene-baseline.json'
const MAX_LINES_WARN = 800
const MAX_LINES_ERROR = 2000

interface HygieneCounts {
  largeFiles: number
  hugeFiles: number
  consoleLog: number
  hardcodedPaths: number
  todoCount: number
  emptyFiles: number
}

export async function runFileHygiene(ctx: LaneExecutionContext): Promise<LaneResult> {
  const started = Date.now()
  const rootDir = ctx.rootDir
  const baselinePath = join(rootDir, BASELINE_PATH)

  const srcDir = join(rootDir, 'src')
  const details: DetailItem[] = []

  const counts: HygieneCounts = {
    largeFiles: 0,
    hugeFiles: 0,
    consoleLog: 0,
    hardcodedPaths: 0,
    todoCount: 0,
    emptyFiles: 0,
  }

  try {
    const files = collectSourceFiles(srcDir)

    // Count
    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf8')
        const lines = content.split(/\r?\n/).length

        if (lines > MAX_LINES_ERROR) counts.hugeFiles++
        else if (lines > MAX_LINES_WARN) counts.largeFiles++

        counts.consoleLog += (content.match(/\bconsole\.(log|warn|error|debug)\b/g) || []).length
        counts.hardcodedPaths += (
          content.match(/(["'`])(\/home\/|C:\\Users\\|\/Users\/)/g) || []
        ).length
        counts.todoCount += (content.match(/\b(TODO|FIXME|XXX|HACK)\b/g) || []).length

        if (statSync(file).size === 0) counts.emptyFiles++
      } catch {
        /* skip unreadable */
      }
    }

    // Also scan .claude directory for console.log
    const hookScripts = collectSourceFiles(join(rootDir, '.claude'))
    for (const file of hookScripts) {
      try {
        const content = readFileSync(file, 'utf8')
        counts.consoleLog += (content.match(/\bconsole\.(log|warn|error|debug)\b/g) || []).length
      } catch {
        /* skip */
      }
    }
  } catch (err) {
    return {
      id: 'file-hygiene',
      title: 'File Hygiene',
      status: 'failed',
      durationMs: Date.now() - started,
      category: 'governance',
      error: `Scan failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // ── Ratchet baseline ──────────────────────────────────────

  let baseline = readJSON<TypeCheckBaseline & { counts: Record<string, number> }>(baselinePath)
  if (!baseline) {
    baseline = {
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      totalErrors: counts.hugeFiles,
      totalWarnings: counts.consoleLog,
      perFile: {},
      counts: { ...counts },
    }
    writeJSON(baselinePath, baseline)
  }

  const baselineCounts = baseline.counts || {
    largeFiles: 0,
    hugeFiles: 0,
    consoleLog: 0,
    hardcodedPaths: 0,
    todoCount: 0,
    emptyFiles: 0,
  }
  const hasBaseline = Object.keys(baselineCounts).length > 0

  // Compare each metric
  const metrics: Array<{
    key: keyof HygieneCounts
    label: string
    severity: 'error' | 'warn' | 'ok'
  }> = [
    { key: 'hugeFiles', label: 'Files >2000 lines', severity: 'error' },
    { key: 'largeFiles', label: 'Files >800 lines', severity: 'warn' },
    { key: 'consoleLog', label: 'console.log statements', severity: 'warn' },
    { key: 'hardcodedPaths', label: 'Hardcoded user paths', severity: 'warn' },
    { key: 'emptyFiles', label: 'Empty source files', severity: 'warn' },
  ]

  let hasRegressions = false
  for (const { key, label, severity } of metrics) {
    const cur = counts[key]
    const base = baselineCounts[key] ?? 0
    const delta = cur - base

    if (hasBaseline && delta > 0) {
      hasRegressions = true
      details.push({
        label: `${label}: +${delta}`,
        status: 'error',
        message: `Increased from ${base} to ${cur} — regression`,
      })
    } else if (delta < 0) {
      details.push({
        label: `${label}: ${cur}`,
        status: 'ok',
        message: `Improved: ${base} → ${cur} (${delta})`,
      })
    } else {
      details.push({
        label: `${label}: ${cur}`,
        status: severity !== 'ok' && cur > 0 ? 'warn' : 'ok',
      })
    }
  }

  // TODO count is informational only — never blocks
  details.push({
    label: 'TODO/FIXME/XXX/HACK',
    status: 'ok',
    message: `${counts.todoCount} occurrences`,
  })

  // Baseline mode: update
  if (ctx.options.mode === 'baseline') {
    baseline.totalErrors = counts.hugeFiles
    baseline.totalWarnings = counts.consoleLog
    baseline.counts = { ...counts }
    baseline.updated_at = new Date().toISOString()
    writeJSON(baselinePath, baseline)
    details.push({ label: 'Baseline updated', status: 'ok', message: new Date().toISOString() })
  }

  return {
    id: 'file-hygiene',
    title: 'File Hygiene',
    status: hasRegressions ? 'failed' : counts.hugeFiles > 0 ? 'warn' : 'passed',
    durationMs: Date.now() - started,
    category: 'governance',
    description: `${counts.hugeFiles} huge files, ${counts.consoleLog} console.log, ${counts.largeFiles} large files`,
    details,
  }
}

function collectSourceFiles(dir: string): string[] {
  const files: string[] = []
  if (!existsSync(dir)) return files
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (
          entry.name === '__tests__' ||
          entry.name === 'node_modules' ||
          entry.name.startsWith('.')
        )
          continue
        files.push(...collectSourceFiles(fullPath))
      } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
        files.push(fullPath)
      }
    }
  } catch {
    /* skip inaccessible */
  }
  return files
}
