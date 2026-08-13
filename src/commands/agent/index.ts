import type { Command } from '../../commands.js'

const agent = {
  type: 'local',
  name: 'agent',
  description: 'Switch the active AI agent kind (claude-haha, claude-code, codex)',
  argumentHint: '<claude-haha|claude-code|codex>',
  supportsNonInteractive: true, // Safe: only updates SessionManager state, no UI side effects
  load: () => import('./agent.js'),
} satisfies Command

export default agent
