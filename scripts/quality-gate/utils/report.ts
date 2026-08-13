// Terminal report formatting using chalk

import chalk from 'chalk'
import type { LaneResult, QualityGateReport } from '../lanes/types'

function pad(n: number, width = 2): string {
  return String(n).padStart(width)
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function statusIcon(status: string): string {
  switch (status) {
    case 'passed':
      return chalk.green('✓')
    case 'failed':
      return chalk.red('✗')
    case 'skipped':
      return chalk.yellow('○')
    case 'warn':
      return chalk.yellow('△')
    default:
      return '?'
  }
}

function statusColor(status: string): typeof chalk.green {
  switch (status) {
    case 'passed':
      return chalk.green
    case 'failed':
      return chalk.red
    case 'skipped':
    case 'warn':
      return chalk.yellow
    default:
      return chalk.white
  }
}

export function printHeader(mode: string, runId: string): void {
  console.log('')
  console.log(
    chalk.bold.cyan('═══ Quality Gate ') + chalk.cyan(`[${mode}] `) + chalk.gray(`${runId}`),
  )
  console.log('')
}

export function printLaneResult(result: LaneResult, index: number): void {
  const icon = statusIcon(result.status)
  const color = statusColor(result.status)
  const num = chalk.gray(`${pad(index + 1)}.`)
  const title = color(result.title)
  const time = chalk.gray(formatDuration(result.durationMs))

  console.log(`  ${num} ${icon} ${title} ${time}`)

  if (result.error) {
    console.log(`     ${chalk.red('Error:')} ${result.error}`)
  }
  if (result.skipReason) {
    console.log(`     ${chalk.gray('Skipped:')} ${result.skipReason}`)
  }
  if (result.details) {
    for (const detail of result.details) {
      const dIcon =
        detail.status === 'ok'
          ? chalk.green('  ✓')
          : detail.status === 'warn'
            ? chalk.yellow('  △')
            : chalk.red('  ✗')
      const line = `${dIcon} ${detail.label}`
      if (detail.status === 'ok') {
        console.log(`     ${chalk.gray(line)}`)
      } else {
        console.log(`     ${line}`)
      }
      if (detail.message) {
        console.log(`       ${chalk.gray(detail.message)}`)
      }
    }
  }
}

export function printSummary(report: QualityGateReport): void {
  console.log('')
  console.log(chalk.bold('─── Summary ───'))
  console.log(
    `  ${chalk.green(`✓ ${report.summary.passed} passed`)}  ` +
      `${chalk.red(`✗ ${report.summary.failed} failed`)}  ` +
      `${chalk.yellow(`○ ${report.summary.skipped} skipped`)}`,
  )

  if (report.git.sha) {
    console.log(chalk.gray(`  git: ${report.git.sha}${report.git.dirty ? ' (dirty)' : ''}`))
  }

  console.log(
    chalk.gray(
      `  time: ${formatDuration(
        new Date(report.finishedAt).getTime() - new Date(report.startedAt).getTime(),
      )}`,
    ),
  )
  console.log('')

  if (report.summary.failed > 0) {
    console.log(chalk.red.bold('Quality gate FAILED'))
    console.log('')
  } else {
    console.log(chalk.green.bold('Quality gate PASSED'))
    console.log('')
  }
}

export function printError(message: string): void {
  console.error(chalk.red(`\n  Error: ${message}\n`))
}

export function printUsage(): void {
  console.log(`
  ${chalk.bold('Quality Gate CLI')}

  ${chalk.gray('Usage:')}
    bun run quality-gate [--mode <pr|baseline|release>] [options]

  ${chalk.gray('Options:')}
    --mode <mode>       Execution mode: pr, baseline, release (default: pr)
    --only <lanes>      Run only specified lanes (comma-separated)
    --skip <lanes>      Skip specified lanes (comma-separated)
    --allow-live        Enable live provider smoke tests
    --dry-run           Preview without executing
    --json              Output results as JSON
    --verbose           Show detailed output for all lanes
    --help              Show this help

  ${chalk.gray('Quarantine commands:')}
    bun run quality-gate quarantine list
    bun run quality-gate quarantine add --lane <id> --title "<text>" --owner "@user" [--reason "<text>"]
    bun run quality-gate quarantine resolve --id <uuid>
`)
}
