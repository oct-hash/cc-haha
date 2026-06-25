// TypeScript type checking lane: runs tsc --noEmit and parses errors

import type { LaneExecutionContext, LaneResult, DetailItem } from './types'

/**
 * Parse tsc output lines into structured DetailItems.
 * tsc format: "src/path/file.ts(123,45): error TS2345: message"
 */
function parseTscErrors(
  stdout: string,
  stderr: string,
): { details: DetailItem[]; errorCount: number; warnCount: number } {
  const details: DetailItem[] = []
  let errorCount = 0
  let warnCount = 0

  const combined = stdout + '\n' + stderr
  const lines = combined.split(/\r?\n/)

  // tsc error format: file(line,col): level TSCode: message
  const tscPattern = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/

  // Group errors by file for compact output
  const byFile = new Map<string, DetailItem[]>()

  for (const line of lines) {
    const match = line.match(tscPattern)
    if (!match) continue

    const [, file, lineNum, , level, code, message] = match
    const status = level === 'error' ? 'error' : 'warn'

    if (status === 'error') errorCount++
    else warnCount++

    const shortFile = file.replace(/^.*\/src\//, 'src/').replace(/^.*\/scripts\//, 'scripts/')

    if (!byFile.has(shortFile)) {
      byFile.set(shortFile, [])
    }
    byFile.get(shortFile)!.push({
      label: `${shortFile}:${lineNum}`,
      status,
      message: `TS${code}: ${message}`,
    })
  }

  // Cap detail output at 50 files, summarize the rest
  const entries = [...byFile.entries()]
  if (entries.length <= 50) {
    for (const [, items] of entries) {
      details.push(...items)
    }
  } else {
    for (const [, items] of entries.slice(0, 50)) {
      details.push(...items)
    }
    details.push({
      label: `... and ${entries.length - 50} more files with errors`,
      status: 'error',
      message: 'Run "bun run typecheck" to see full output',
    })
  }

  return { details, errorCount, warnCount }
}

export async function runTypeCheck(
  ctx: LaneExecutionContext,
): Promise<LaneResult> {
  const started = Date.now()

  try {
    const proc = Bun.spawn(['bun', 'run', 'typecheck'], {
      cwd: ctx.rootDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    const { details, errorCount, warnCount } = parseTscErrors(stdout, stderr)

    const hasErrors = exitCode !== 0 || errorCount > 0

    if (exitCode === 0 && errorCount === 0) {
      details.push({
        label: 'TypeScript compilation',
        status: 'ok',
        message: 'No type errors',
      })
    }

    return {
      id: 'typecheck',
      title: 'TypeScript Type Check',
      status: hasErrors ? 'failed' : warnCount > 0 ? 'warn' : 'passed',
      durationMs: Date.now() - started,
      category: 'unit',
      description: `${errorCount} errors, ${warnCount} warnings`,
      details,
      exitCode,
    }
  } catch (err) {
    return {
      id: 'typecheck',
      title: 'TypeScript Type Check',
      status: 'failed',
      durationMs: Date.now() - started,
      category: 'unit',
      error: err instanceof Error ? err.message : String(err),
      details: [
        {
          label: 'TypeScript check',
          status: 'error',
          message: `Failed to run: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    }
  }
}
