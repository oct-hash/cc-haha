// Biome lint & format check lane

import type { LaneExecutionContext, LaneResult, DetailItem } from './types'

export async function runLintCheck(
  ctx: LaneExecutionContext,
): Promise<LaneResult> {
  const started = Date.now()

  try {
    const proc = Bun.spawn(['bun', 'run', 'lint:biome'], {
      cwd: ctx.rootDir,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    const details = parseBiomeOutput(stdout + '\n' + stderr)

    return {
      id: 'lint-check',
      title: 'Lint & Format Check',
      status: exitCode === 0 ? 'passed' : 'failed',
      durationMs: Date.now() - started,
      category: 'unit',
      description: `${details.filter((d) => d.status === 'error').length} issues`,
      details,
      exitCode,
    }
  } catch (err) {
    return {
      id: 'lint-check',
      title: 'Lint & Format Check',
      status: 'failed',
      durationMs: Date.now() - started,
      category: 'unit',
      error: err instanceof Error ? err.message : String(err),
      details: [
        {
          label: 'Lint check',
          status: 'error',
          message: `Failed to run: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    }
  }
}

function parseBiomeOutput(output: string): DetailItem[] {
  const details: DetailItem[] = []
  const lines = output.split(/\r?\n/)

  let errorCount = 0
  let warnCount = 0
  const MAX_DETAILS = 50

  for (const line of lines) {
    if (details.length >= MAX_DETAILS) break

    // Biome format: "  ✗  path/file.ts:123:45  message  [lint/style/rule]"
    // Also: "  !  path/file.ts:123:45  message  [lint/correctness/rule]"
    // And: "  ×  path/file.ts  message  [format]"
    const match = line.match(
      /^\s*([!×✗⚠])\s+(.+?)(?::(\d+)(?::(\d+))?)?\s{2,}(.+?)\s+\[(.+?)\]\s*$/,
    )
    if (!match) continue

    const [, marker, file, , , message, category] = match
    const status = marker === '×' || marker === '✗' ? 'error' : 'warn'

    if (status === 'error') errorCount++
    else warnCount++

    const shortFile = file
      .replace(/^.*\/src\//, 'src/')
      .replace(/^.*\/scripts\//, 'scripts/')

    details.push({
      label: shortFile,
      status,
      message: `[${category}] ${message.trim()}`,
    })
  }

  if (errorCount === 0 && warnCount === 0) {
    details.push({
      label: 'Biome lint & format',
      status: 'ok',
      message: 'No issues found',
    })
  }

  if (errorCount + warnCount > MAX_DETAILS) {
    details.push({
      label: `... and ${errorCount + warnCount - MAX_DETAILS} more issues`,
      status: 'warn',
    })
  }

  return details
}
