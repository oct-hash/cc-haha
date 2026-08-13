import { VERIFICATION_AGENT_TYPE } from '../../tools/AgentTool/constants.js'
import type { Command, PromptCommand } from '../../types/command.js'

// Goal state machine
type GoalState = 'NEEDS_SPEC' | 'EXECUTION_READY' | 'BLOCKED' | 'DONE' | 'FAILED'

interface Goal {
  id: string
  description: string
  state: GoalState
  createdAt: number
  files?: string[]
  approach?: string
  verifierNotes?: string
  verdict?: 'PASS' | 'FAIL' | 'PARTIAL'
}

// In-memory goal store
const goals = new Map<string, Goal>()
let goalCounter = 0

function generateGoalId(): string {
  return `goal-${++goalCounter}`
}

function createGoal(description: string): Goal {
  const goal: Goal = {
    id: generateGoalId(),
    description,
    state: 'NEEDS_SPEC',
    createdAt: Date.now(),
  }
  goals.set(goal.id, goal)
  return goal
}

function formatGoal(goal: Goal): string {
  const stateIcon =
    goal.state === 'DONE'
      ? '✅'
      : goal.state === 'FAILED'
        ? '❌'
        : goal.state === 'BLOCKED'
          ? '⏳'
          : goal.state === 'NEEDS_SPEC'
            ? '📝'
            : '🚀'

  let result = `${stateIcon} **${goal.id}**: ${goal.description}\n`
  result += `   State: \`${goal.state}\`\n`

  if (goal.verdict) {
    result += `   Verdict: \`${goal.verdict}\`\n`
  }

  if (goal.files && goal.files.length > 0) {
    result += `   Files: ${goal.files.length}\n`
  }

  return result
}

// Goal Command implementation
export const goalCommand: Command = {
  type: 'prompt',
  name: 'goal',
  description: 'Closed-loop goal execution with verifier-gated completion',
  whenToUse: 'Use when you need to set and track specific goals with verification gates.',
  contentLength: 0,
  progressMessage: 'processing goal',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    const input = args.trim()
    const parts = input.split(/\s+/)
    const subcommand = parts[0]?.toLowerCase()
    const rest = parts.slice(1).join(' ')

    // Handle subcommands
    switch (subcommand) {
      case 'list': {
        const activeGoals = Array.from(goals.values()).filter(
          (g) => g.state !== 'DONE' && g.state !== 'FAILED',
        )
        if (activeGoals.length === 0) {
          return [
            {
              type: 'text',
              text: '📋 No active goals. Use `/goal [description]` to create one.',
            },
          ]
        }
        const output = ['📋 **Active Goals:**\n', ...activeGoals.map(formatGoal)].join('\n')
        return [{ type: 'text', text: output }]
      }

      case 'status': {
        const goalId = rest || parts[1]
        if (!goalId) {
          return [
            {
              type: 'text',
              text: '❌ Please specify a goal ID: `/goal status [goal-id]`',
            },
          ]
        }
        const goal = goals.get(goalId)
        if (!goal) {
          return [{ type: 'text', text: `❌ Goal \`${goalId}\` not found.` }]
        }
        let output = `📊 **Goal Status:**\n\n${formatGoal(goal)}\n`
        if (goal.verifierNotes) {
          output += `\n📝 **Verifier Notes:**\n\`\`\`\n${goal.verifierNotes}\n\`\`\`\n`
        }
        return [{ type: 'text', text: output }]
      }

      case 'verify': {
        const goalId = rest || parts[1]
        if (!goalId) {
          return [
            {
              type: 'text',
              text: '❌ Please specify a goal ID: `/goal verify [goal-id]`',
            },
          ]
        }
        const goal = goals.get(goalId)
        if (!goal) {
          return [{ type: 'text', text: `❌ Goal \`${goalId}\` not found.` }]
        }

        // Mark as blocked during verification
        goal.state = 'BLOCKED'

        // Build verification prompt
        const verificationPrompt = `## Verification Request for Goal: ${goal.id}

**Original Goal:** ${goal.description}

**Files Changed:** ${goal.files?.join(', ') || 'None recorded'}

**Approach:** ${goal.approach || 'Not specified'}

---

Spawn the verification agent with subagent_type="${VERIFICATION_AGENT_TYPE}" to verify this implementation. Report back with VERDICT: PASS, VERDICT: FAIL, or VERDICT: PARTIAL.

After verification completes, update the goal state based on the verdict:
- PASS → Set goal state to DONE
- FAIL → Set goal state to EXECUTION_READY and include fix notes
- PARTIAL → Set goal state to DONE (partial)

Record the verdict and verifier notes in the goal.`

        return [{ type: 'text', text: verificationPrompt }]
      }

      case 'done': {
        const goalId = rest || parts[1]
        if (!goalId) {
          return [
            {
              type: 'text',
              text: '❌ Please specify a goal ID: `/goal done [goal-id]`',
            },
          ]
        }
        const goal = goals.get(goalId)
        if (!goal) {
          return [{ type: 'text', text: `❌ Goal \`${goalId}\` not found.` }]
        }
        if (goal.verdict !== 'PASS' && goal.verdict !== 'PARTIAL') {
          return [
            {
              type: 'text',
              text: `⚠️ Goal \`${goalId}\` has verdict \`${goal.verdict || 'NONE'}\`. Run \`/goal verify ${goalId}\` first to verify completion.`,
            },
          ]
        }
        goal.state = 'DONE'
        return [
          {
            type: 'text',
            text: `✅ Goal \`${goalId}\` marked as DONE.`,
          },
        ]
      }

      case 'fail': {
        const [goalId, ...reasonParts] = rest.split(/\s+/)
        if (!goalId) {
          return [
            {
              type: 'text',
              text: '❌ Please specify a goal ID: `/goal fail [goal-id] [reason]`',
            },
          ]
        }
        const goal = goals.get(goalId)
        if (!goal) {
          return [{ type: 'text', text: `❌ Goal \`${goalId}\` not found.` }]
        }
        goal.state = 'FAILED'
        goal.verdict = 'FAIL'
        goal.verifierNotes = reasonParts.join(' ') || 'No reason provided'
        return [
          {
            type: 'text',
            text: `❌ Goal \`${goalId}\` marked as FAILED: ${goal.verifierNotes}`,
          },
        ]
      }

      case 'clear': {
        let cleared = 0
        for (const [id, goal] of goals) {
          if (goal.state === 'DONE' || goal.state === 'FAILED') {
            goals.delete(id)
            cleared++
          }
        }
        return [
          {
            type: 'text',
            text: `🧹 Cleared ${cleared} completed/failed goals.`,
          },
        ]
      }

      case 'track': {
        // Track files for a goal
        const [goalId, ...fileParts] = rest.split(/\s+/)
        if (!goalId || !fileParts.length) {
          return [
            {
              type: 'text',
              text: '❌ Please specify: `/goal track [goal-id] [files...]`',
            },
          ]
        }
        const goal = goals.get(goalId)
        if (!goal) {
          return [{ type: 'text', text: `❌ Goal \`${goalId}\` not found.` }]
        }
        goal.files = fileParts
        goal.state = 'EXECUTION_READY'
        return [
          {
            type: 'text',
            text: `📝 Goal \`${goalId}\` tracking ${fileParts.length} files. State: EXECUTION_READY`,
          },
        ]
      }

      default: {
        // Create new goal
        if (!input || subcommand === 'help') {
          return [
            {
              type: 'text',
              text: `📌 **Goal Command** — Verifier-gated goal execution

**Commands:**
- \`/goal [description]\` — Create a new goal
- \`/goal list\` — Show all active goals
- \`/goal status [goal-id]\` — Show goal details
- \`/goal track [goal-id] [files...]\` — Track files for a goal
- \`/goal verify [goal-id]\` — Run verification agent
- \`/goal done [goal-id]\` — Mark goal as done (requires PASS verdict)
- \`/goal fail [goal-id] [reason]\` — Mark goal as failed
- \`/goal clear\` — Clear completed/failed goals

**State Machine:**
\`\`\`
NEEDS_SPEC → EXECUTION_READY → BLOCKED → DONE/FAILED
                                ↓
                          [VERIFICATION_AGENT]
                                ↓
                          VERDICT: PASS/FAIL/PARTIAL
\`\`\`

**Automatic Verification:**
When 3+ files are edited or backend/API changes occur, the system automatically triggers VERIFICATION_AGENT for adversarial verification.`,
            },
          ]
        }

        // Create new goal
        const goalDesc = input
        const newGoal = createGoal(goalDesc)

        // Check if goal is specific enough
        if (goalDesc.length < 20) {
          newGoal.state = 'NEEDS_SPEC'
          return [
            {
              type: 'text',
              text: `📝 **Goal Created:** \`${newGoal.id}\`

⚠️ Goal description is vague. Please clarify:
- What specifically needs to be implemented?
- What are the acceptance criteria?
- What files/components are affected?

Use \`/goal status ${newGoal.id}\` to view and refine this goal.`,
            },
          ]
        }

        newGoal.state = 'EXECUTION_READY'
        return [
          {
            type: 'text',
            text: `🚀 **Goal Created:** \`${newGoal.id}\`

📋 **Description:** ${goalDesc}

**State:** EXECUTION_READY — Ready to begin implementation.

Track files with: \`/goal track ${newGoal.id} [files...]\`
When implementation is complete (3+ file edits), run: \`/goal verify ${newGoal.id}\``,
          },
        ]
      }
    }
  },
}

// Helper function to integrate with VERIFICATION_AGENT
export function spawnVerificationAgent(goal: Goal): { subagent_type: string; task: object } {
  return {
    subagent_type: VERIFICATION_AGENT_TYPE,
    task: {
      originalGoal: goal.description,
      filesChanged: goal.files || [],
      approach: goal.approach || 'Not specified',
    },
  }
}

export default goalCommand
