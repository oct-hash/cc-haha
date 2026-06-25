// File hygiene lane: check large files, console.log, debugger, TODO/FIXME, hardcoded paths

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { LaneExecutionContext, LaneResult, DetailItem } from './types'

const MAX_LINES_WARN = 800
const MAX_LINES_ERROR = 2000

export async function runFileHygiene(
  ctx: LaneExecutionContext,
): Promise<LaneResult> {
  const started = Date.now()
  const details: DetailItem[] = []
  let hasErrors = false

  const srcDir = join(ctx.rootDir, 'src')

  try {
    const files = collectSourceFiles(srcDir)
    details.push({ label: `Scanning ${files.length} source files`, status: 'ok' })

    // 1. Large file detection
    const largeFiles = checkLargeFiles(files, srcDir)
    if (largeFiles.length > 0) {
      hasErrors = largeFiles.some((d) => d.status === 'error')
      details.push(...largeFiles)
    }

    // 2. console.log detection
    const consoleLogCount = countPatternInFiles(files, /\bconsole\.(log|warn|error|debug)\b/g, false)
    if (consoleLogCount > 0) {
      details.push({
        label: 'console.log statements',
        status: consoleLogCount > 50 ? 'warn' : 'ok',
        message: `${consoleLogCount} occurrences (use bun run lint:biome:fix to auto-remove)`,
      })
    }

    // 3. debugger detection
    const debuggerCount = countPatternInFiles(files, /\bdebugger\b/g, false)
    if (debuggerCount > 0) {
      hasErrors = true
      details.push({
        label: 'debugger statements',
        status: 'error',
        message: `${debuggerCount} debugger; statements found`,
      })
    }

    // 4. TODO/FIXME count
    const todoCount = countPatternInFiles(
      files,
      /\b(TODO|FIXME|XXX|HACK)\b/g,
      true, // comments only
    )
    details.push({
      label: 'TODO/FIXME/XXX/HACK comments',
      status: todoCount > 200 ? 'warn' : 'ok',
      message: `${todoCount} occurrences`,
    })

    // 5. Hardcoded paths
    const hardcodedPathCount = countPatternInFiles(
      files,
      /(["'`])(\/home\/|C:\\Users\\|\/Users\/)/g,
      false,
    )
    if (hardcodedPathCount > 0) {
      details.push({
        label: 'Hardcoded user paths',
        status: 'warn',
        message: `${hardcodedPathCount} occurrences`,
      })
    }

    // 6. Empty source files
    const emptyFiles = files.filter((f) => statSync(f).size === 0)
    if (emptyFiles.length > 0) {
      details.push({
        label: 'Empty source files',
        status: 'warn',
        message: `${emptyFiles.length} files (${emptyFiles.slice(0, 3).map((f) => relative(srcDir, f)).join(', ')}${emptyFiles.length > 3 ? '...' : ''})`,
      })
    }

    if (details.length <= 1) {
      details.push({ label: 'File hygiene', status: 'ok', message: 'All checks passed' })
    }
  } catch (err) {
    details.push({
      label: 'File hygiene scan',
      status: 'error',
      message: `Scan failed: ${err instanceof Error ? err.message : String(err)}`,
    })
    hasErrors = true
  }

  const errorCount = details.filter((d) => d.status === 'error').length
  const warnCount = details.filter((d) => d.status === 'warn').length

  return {
    id: 'file-hygiene',
    title: 'File Hygiene',
    status: hasErrors ? 'failed' : warnCount > 0 ? 'warn' : 'passed',
    durationMs: Date.now() - started,
    category: 'governance',
    description: `${errorCount} errors, ${warnCount} warnings`,
    details,
  }
}

function collectSourceFiles(dir: string): string[] {
  const files: string[] = []
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name.startsWith('.')) continue
        files.push(...collectSourceFiles(fullPath))
      } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
        files.push(fullPath)
      }
    }
  } catch {
    // Skip inaccessible directories
  }
  return files
}

function checkLargeFiles(files: string[], baseDir: string): DetailItem[] {
  const results: DetailItem[] = []
  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    const lines = content.split(/\r?\n/).length
    const shortPath = relative(baseDir, file)

    if (lines > MAX_LINES_ERROR) {
      results.push({
        label: `${shortPath} (${lines} lines)`,
        status: 'error',
        message: `Exceeds ${MAX_LINES_ERROR} line limit`,
      })
    } else if (lines > MAX_LINES_WARN) {
      results.push({
        label: `${shortPath} (${lines} lines)`,
        status: 'warn',
        message: `Exceeds ${MAX_LINES_WARN} line recommendation`,
      })
    }
  }
  // Sort by severity then size
  results.sort((a, b) => {
    const sa = a.status === 'error' ? 0 : 1
    const sb = b.status === 'error' ? 0 : 1
    return sa - sb
  })
  // Cap at 20 results
  return results.slice(0, 20)
}

function countPatternInFiles(
  files: string[],
  pattern: RegExp,
  commentsOnly: boolean,
): number {
  let count = 0
  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf8')
      if (commentsOnly) {
        // Extract only comment lines (// comments)
        const commentLines = content
          .split(/\r?\n/)
          .filter((l) => l.trim().startsWith('//') || l.includes('/*'))
          .join('\n')
        count += (commentLines.match(pattern) || []).length
      } else {
        count += (content.match(pattern) || []).length
      }
    } catch {
      // Skip unreadable files
    }
  }
  return count
}
