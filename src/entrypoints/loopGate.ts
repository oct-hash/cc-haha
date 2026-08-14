/**
 * Loop Gate CLI — pre-commit hard-block gate.
 *
 * Reads the staged diff (`git diff --cached`), runs the LoopManager review
 * loop in standalone mode (direct API, no REPL query executor), and hard-blocks
 * (exit 2) when the post-review council gate produces a critical/high finding
 * at or above the confidence threshold. A `// GATE-IGNORE: <hash>` override in
 * the staged diff skips the block.
 *
 * Fail-open: infrastructure errors (API down, no key) exit 0 so a broken gate
 * can never wedge a commit. Only a genuine block verdict exits 2.
 *
 * Usage (from the pre-commit hook):
 *   bun --env-file=.env ./src/entrypoints/loopGate.ts
 */

import { execSync } from 'node:child_process'
import { LoopManager } from '../services/agents/loop-manager.js'

function readStagedDiff(): string {
  try {
    return execSync('git diff --cached', {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch {
    return ''
  }
}

function hasIgnoreOverride(diff: string, hash: string): boolean {
  return new RegExp(`GATE-IGNORE\\s*:\\s*${hash}`).test(diff)
}

function printBlock(
  severity: string,
  confidence: number,
  verdict: string,
  ignoreHash: string,
): void {
  const rule = `${severity} severity, confidence ${confidence.toFixed(2)}`
  const finding = verdict.slice(0, 500) || '(no verdict text)'
  process.stderr.write('\n[loopGate] ╔══════════════════════════════════════════════╗\n')
  process.stderr.write('[loopGate] ║  PRE-COMMIT GATE — BLOCKED                 ║\n')
  process.stderr.write('[loopGate] ╚══════════════════════════════════════════════╝\n')
  process.stderr.write(`[loopGate] ❌ 原因: ${finding}\n`)
  process.stderr.write(`[loopGate] 🔒 触发规则: ${rule}\n`)
  process.stderr.write('[loopGate] 🆘 建议: 修复上述问题后重新提交，或显式声明已人工复核：\n')
  process.stderr.write(`[loopGate]    // GATE-IGNORE: ${ignoreHash}\n`)
}

async function main(): Promise<number> {
  const diff = readStagedDiff().trim()
  if (!diff) {
    // Nothing staged — nothing to gate.
    return 0
  }

  const manager = new LoopManager({ loopType: 'review', gateKind: 'pre-commit' })

  let blocked = false
  let blockSeverity = 'low'
  let blockConfidence = 0
  let ignoreHash = ''
  let verdict = ''

  try {
    for await (const event of manager.run(diff)) {
      if (event.type === 'gate_result' && event.gate === 'post') {
        verdict = event.verdict
        if (event.unavailable) {
          process.stderr.write(
            '[loopGate] GATE UNAVAILABLE — allowing commit (fail-open).\n',
          )
          continue
        }
        if (!event.passed) {
          blocked = true
          blockSeverity = event.severity
          blockConfidence = event.confidence
          ignoreHash = event.ignoreHash ?? ''
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    process.stderr.write(`[loopGate] gate failed (fail-open): ${msg}\n`)
    return 0
  } finally {
    manager.dispose()
  }

  if (!blocked) {
    return 0
  }

  if (ignoreHash && hasIgnoreOverride(diff, ignoreHash)) {
    process.stderr.write(`[loopGate] GATE-IGNORE override present — allowing commit.\n`)
    return 0
  }

  printBlock(blockSeverity, blockConfidence, verdict, ignoreHash)
  return 2
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    process.stderr.write(`[loopGate] Fatal (fail-open): ${msg}\n`)
    process.exit(0)
  })
