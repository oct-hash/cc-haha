// Quality Gate CLI entry point + orchestration

import { join } from 'node:path'
import { runConfigAudit } from './lanes/config-audit'
import { runCoverage } from './lanes/coverage'
import { runDepHealth } from './lanes/dep-health'
import { runDocChecks } from './lanes/doc-checks'
import { runFileHygiene } from './lanes/file-hygiene'
import { runImpactReport } from './lanes/impact-report'
import { runLintCheck } from './lanes/lint-check'
import { runPolicyChecks } from './lanes/policy-checks'
import { runProviderSmoke } from './lanes/provider-smoke'
import { quarantineAdd, quarantineList, quarantineResolve, runQuarantine } from './lanes/quarantine'
import { runSecurityScan } from './lanes/security-scan'
import { runServerChecks } from './lanes/server-checks'
import { runTestResults } from './lanes/test-results'
import { runTypeCheck } from './lanes/typecheck'
import type {
  LaneExecutionContext,
  LaneResult,
  QualityGateMode,
  QualityGateOptions,
  QualityGateReport,
} from './lanes/types'
import { filterLanes, getLaneById, getLanesForMode } from './modes'
import { getGitSha, isGitDirty, isGitRepo, runId } from './utils/helpers'
import { printError, printHeader, printLaneResult, printSummary, printUsage } from './utils/report'

// ── Lane runner registry ───────────────────────────────────────

const LANE_RUNNERS: Record<string, (ctx: LaneExecutionContext) => Promise<LaneResult>> = {
  'impact-report': runImpactReport,
  'policy-checks': runPolicyChecks,
  typecheck: runTypeCheck,
  'lint-check': runLintCheck,
  'test-results': runTestResults,
  'file-hygiene': runFileHygiene,
  'doc-checks': runDocChecks,
  'config-audit': runConfigAudit,
  'security-scan': runSecurityScan,
  'dep-health': runDepHealth,
  coverage: runCoverage,
  quarantine: runQuarantine,
  'server-checks': runServerChecks,
  'provider-smoke': runProviderSmoke,
}

// ── CLI Argument Parsing ───────────────────────────────────────

function parseArgs(raw: string[]): {
  mode: QualityGateMode
  dryRun: boolean
  allowLive: boolean
  onlyLanes?: string[]
  skipLanes?: string[]
  jsonOutput: boolean
  verbose: boolean
  quarantineCmd?: string
  quarantineArgs: Record<string, string>
  showHelp: boolean
} {
  const args = raw.slice(2) // skip bun + script path
  const result: ReturnType<typeof parseArgs> = {
    mode: 'pr',
    dryRun: false,
    allowLive: false,
    jsonOutput: false,
    verbose: false,
    quarantineArgs: {},
    showHelp: false,
  }

  let i = 0
  while (i < args.length) {
    const arg = args[i]

    switch (arg) {
      case '--mode': {
        const v = args[++i]
        if (v === 'pr' || v === 'baseline' || v === 'release') {
          result.mode = v
        }
        break
      }
      case '--only':
        result.onlyLanes = (args[++i] || '').split(',').map((s) => s.trim())
        break
      case '--skip':
        result.skipLanes = (args[++i] || '').split(',').map((s) => s.trim())
        break
      case '--allow-live':
        result.allowLive = true
        break
      case '--dry-run':
        result.dryRun = true
        break
      case '--json':
        result.jsonOutput = true
        break
      case '--verbose':
        result.verbose = true
        break
      case '--help':
        result.showHelp = true
        break
      case 'quarantine': {
        result.quarantineCmd = args[++i] // list | add | resolve
        // Parse remaining sub-args into a flat map
        let j = i + 1
        while (j < args.length) {
          if (
            args[j] === '--lane' ||
            args[j] === '--title' ||
            args[j] === '--owner' ||
            args[j] === '--reason' ||
            args[j] === '--id' ||
            args[j] === '--note'
          ) {
            const key = args[j].replace(/^--/, '')
            result.quarantineArgs[key] = args[j + 1] || ''
            j += 2
          } else {
            j++
          }
        }
        i = args.length // consume rest
        break
      }
    }
    i++
  }

  return result
}

// ── Main Orchestrator ──────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(Bun.argv)

  if (args.showHelp) {
    printUsage()
    process.exit(0)
  }

  const rootDir = process.cwd()
  const startedAt = new Date()

  // ── Handle quarantine sub-commands ──
  if (args.quarantineCmd) {
    await handleQuarantineCmd(args.quarantineCmd, args.quarantineArgs, rootDir)
    return
  }

  const options: QualityGateOptions = {
    mode: args.mode,
    dryRun: args.dryRun,
    allowLive: args.allowLive,
    rootDir,
    runId: runId(),
    onlyLanes: args.onlyLanes,
    skipLanes: args.skipLanes,
  }

  const ctx: LaneExecutionContext = {
    options,
    rootDir,
    outputDir: join(rootDir, 'scripts', 'quality-gate', 'data'),
  }

  // JSON output: suppress terminal formatting
  if (!args.jsonOutput) {
    printHeader(options.mode, options.runId!)
  }

  // ── Determine lanes to run ──
  let laneIds = getLanesForMode(options.mode)
  laneIds = filterLanes(laneIds, options.onlyLanes, options.skipLanes)

  if (args.dryRun) {
    if (!args.jsonOutput) {
      console.log('  Dry run — would execute:')
      for (const id of laneIds) {
        const lane = getLaneById(id)
        console.log(`    - ${lane?.title || id}`)
      }
      console.log('')
    } else {
      console.log(JSON.stringify({ mode: options.mode, lanes: laneIds, dryRun: true }))
    }
    process.exit(0)
  }

  // ── Run impact-report first (unless skipped via --only/--skip) ──
  let impactResult: LaneResult | null = null
  let triggeredLaneIds: string[] = []

  if (laneIds.includes('impact-report')) {
    impactResult = await LANE_RUNNERS['impact-report'](ctx)
  }

  // Extract triggered lane IDs from impact-report details
  if (impactResult && impactResult.details) {
    // Look for the "Required lanes" detail to get the canonical list
    const requiredDetail = impactResult.details.find((d) => d.label === 'Required lanes')
    if (requiredDetail?.message && requiredDetail.message !== 'none (docs-only change)') {
      triggeredLaneIds = requiredDetail.message.split(', ').filter(Boolean)
    }
  }

  // ── Run remaining lanes ──
  const results: LaneResult[] = []
  if (impactResult) results.push(impactResult)

  for (const laneId of laneIds) {
    if (laneId === 'impact-report') continue

    const lane = getLaneById(laneId)
    if (!lane) continue

    // Skip live lanes without --allow-live
    if (lane.live && !options.allowLive) {
      results.push({
        id: laneId,
        title: lane.title,
        status: 'skipped',
        durationMs: 0,
        category: lane.category,
        skipReason: 'Live checks require --allow-live',
        live: true,
      })
      continue
    }

    // Skip lanes not triggered by impact (unless forced via --only or always-run)
    const alwaysRun = !lane.impactTrigger || lane.id === 'quarantine'
    if (!alwaysRun && !options.onlyLanes && triggeredLaneIds.length > 0) {
      if (!triggeredLaneIds.includes(laneId)) {
        results.push({
          id: laneId,
          title: lane.title,
          status: 'skipped',
          durationMs: 0,
          category: lane.category,
          skipReason: `Not impacted (no matching file changes)`,
        })
        continue
      }
    }

    const runner = LANE_RUNNERS[laneId]
    if (!runner) continue

    const result = await runner(ctx)
    results.push(result)
  }

  // ── Build report ──
  const finishedAt = new Date()
  const isRepo = await isGitRepo(rootDir)

  const report: QualityGateReport = {
    schemaVersion: 1,
    runId: options.runId!,
    mode: options.mode,
    dryRun: options.dryRun,
    allowLive: options.allowLive,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    rootDir,
    git: {
      sha: isRepo ? await getGitSha(rootDir) : null,
      dirty: isRepo ? await isGitDirty(rootDir) : false,
    },
    results,
    summary: {
      passed: results.filter((r) => r.status === 'passed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    },
  }

  // ── Output ──
  if (args.jsonOutput) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    results.forEach((r, i) => {
      if (args.verbose || r.status !== 'skipped' || r.skipReason) {
        printLaneResult(r, i)
      }
    })
    printSummary(report)
  }

  process.exit(report.summary.failed > 0 ? 1 : 0)
}

// ── Quarantine Sub-commands ────────────────────────────────────

async function handleQuarantineCmd(
  cmd: string,
  args: Record<string, string>,
  rootDir: string,
): Promise<void> {
  switch (cmd) {
    case 'list':
      await quarantineList(rootDir)
      break
    case 'add':
      if (!args.lane || !args.title || !args.owner) {
        printError('quarantine add requires --lane, --title, and --owner')
        process.exit(1)
      }
      await quarantineAdd(rootDir, {
        lane: args.lane,
        title: args.title,
        owner: args.owner,
        reason: args.reason,
      })
      break
    case 'resolve':
      if (!args.id) {
        printError('quarantine resolve requires --id')
        process.exit(1)
      }
      await quarantineResolve(rootDir, args.id, args.note)
      break
    default:
      printError(`Unknown quarantine command: ${cmd}`)
      printUsage()
      process.exit(1)
  }
}

main().catch((err) => {
  printError(err instanceof Error ? err.message : String(err))
  process.exit(2)
})
