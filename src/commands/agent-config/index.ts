import type { Command } from '../../commands.js'

const agentConfig = {
  type: 'local',
  name: 'agent-config',
  description:
    'View or update SessionManager configuration (retryAttempts, timeoutMs, maxSessions, defaultKind)',
  argumentHint: '[key=value]',
  supportsNonInteractive: true,
  load: () => import('./agent-config.js'),
} satisfies Command

export default agentConfig
