/**
 * Loop Template — generates .claude/loop.md with debate MCP hooks.
 *
 * Reads the loop-haha.md template and substitutes environment-variable-driven
 * hook placeholders. Used to inject debate MCP tools into LoopX tick cycles
 * without modifying LoopX upstream.
 *
 * Usage:
 *   import { generateLoopMd } from 'src/services/agents/loop-template.js'
 *   const loopMd = generateLoopMd({ goalId: 'g1', agentId: 'cc' })
 *   await Bun.write('.claude/loop.md', loopMd)
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const TEMPLATE_PATH = join(import.meta.dir, 'loop-haha.md')

export interface LoopMdOptions {
  goalId?: string
  agentId?: string
  /** Override the pre-work hook (defaults to LOOPX_PRE_WORK_HOOK env var). */
  preWorkHook?: string
  /** Override the post-work hook (defaults to LOOPX_POST_WORK_HOOK env var). */
  postWorkHook?: string
}

/**
 * Default pre-work hook: calls debate_approach if the env var is set.
 */
function resolvePreWorkHook(override?: string): string {
  if (override !== undefined) return override

  const envHook = process.env.LOOPX_PRE_WORK_HOOK
  if (envHook) return envHook

  // Default: no pre-work debate
  return '_(No pre-work debate hook configured. Set LOOPX_PRE_WORK_HOOK to enable.)_'
}

/**
 * Default post-work hook: calls debate_review if the env var is set.
 */
function resolvePostWorkHook(override?: string): string {
  if (override !== undefined) return override

  const envHook = process.env.LOOPX_POST_WORK_HOOK
  if (envHook) return envHook

  // Default: no post-work debate
  return '_(No post-work review hook configured. Set LOOPX_POST_WORK_HOOK to enable.)_'
}

/**
 * Generate the content of .claude/loop.md from the haha-enhanced template.
 *
 * Placeholders:
 *   {goal_id}  — replaced with options.goalId (default: 'goal-1')
 *   {agent_id} — replaced with options.agentId (default: 'cc')
 *   {PRE_WORK_HOOK}  — replaced with preWorkHook or LOOPX_PRE_WORK_HOOK env var
 *   {POST_WORK_HOOK} — replaced with postWorkHook or LOOPX_POST_WORK_HOOK env var
 */
export function generateLoopMd(options: LoopMdOptions = {}): string {
  const goalId = options.goalId ?? 'goal-1'
  const agentId = options.agentId ?? 'cc'

  let template: string
  try {
    template = readFileSync(TEMPLATE_PATH, 'utf-8')
  } catch {
    // Fallback: inline minimal template if the file is missing
    template = `<!-- loopx:armed {"goal_id":"{goal_id}","agent_id":"{agent_id}"} -->

## Loop Protocol (haha-enhanced)

### Tick Cycle
1. Call \`should_run()\`. If false, stop.
2. Call \`list_todos()\`. Pick the next available.
3. Call \`claim_task(todo_id, agent_id)\`.

### Pre-Work Gate
{PRE_WORK_HOOK}

### Bounded Work
- Implement ONE logical segment per tick (≤1 file, ≤100 lines).
- Run tests before and after changes.
- Fix failures before proceeding.

### Post-Work Gate
{POST_WORK_HOOK}

### Completion
Call \`complete_task(todo_id, agent_id, evidence)\` with diff + test results.
`
  }

  return template
    .replace('{goal_id}', goalId)
    .replace('{agent_id}', agentId)
    .replace('{PRE_WORK_HOOK}', resolvePreWorkHook(options.preWorkHook))
    .replace('{POST_WORK_HOOK}', resolvePostWorkHook(options.postWorkHook))
}

/**
 * Convenience: write the generated loop.md to a file path.
 * Defaults to .claude/loop.md in the current working directory.
 */
export async function writeLoopMd(
  options: LoopMdOptions & { outputPath?: string } = {},
): Promise<string> {
  const outputPath = options.outputPath ?? '.claude/loop.md'
  const content = generateLoopMd(options)
  await Bun.write(outputPath, content)
  return outputPath
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────

// When run directly: `bun run src/services/agents/loop-template.ts`
// Generates .claude/loop.md with env-var-driven debate hooks.
if (import.meta.main) {
  const outputPath = await writeLoopMd()
  console.error(`[loop-template] Generated ${outputPath}`)

  const preWork = process.env.LOOPX_PRE_WORK_HOOK
  const postWork = process.env.LOOPX_POST_WORK_HOOK
  if (preWork || postWork) {
    console.error(`[loop-template] Debate hooks active: pre=${!!preWork}, post=${!!postWork}`)
  } else {
    console.error(
      '[loop-template] No debate hooks configured. Set LOOPX_PRE_WORK_HOOK / LOOPX_POST_WORK_HOOK to enable.',
    )
  }
}
