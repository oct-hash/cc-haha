/**
 * Agent Factory — create the right AgentAdapter for a given AgentKind.
 *
 * Usage:
 *   import { createAgentAdapter } from 'src/services/agents/factory.js'
 *   const agent = createAgentAdapter('claude-haha', { maxTurns: 20 })
 *   for await (const event of agent.chatStream("hello")) { ... }
 */

import type { AgentAdapter, AgentAdapterFactory } from './adapter.js'
import { createClaudeCodeAdapter } from './claude-code.js'
import { createClaudeHahaAdapter } from './claude-haha.js'
import { createCodexAdapter } from './codex.js'
import type { AgentConfig, AgentKind } from './types.js'

const registry: Record<AgentKind, AgentAdapterFactory> = {
  'claude-haha': createClaudeHahaAdapter,
  'claude-code': createClaudeCodeAdapter,
  codex: createCodexAdapter,
}

export function createAgentAdapter(kind: AgentKind, config?: AgentConfig): AgentAdapter {
  return registry[kind](config)
}

export function getAgentAdapterFactory(kind: AgentKind): AgentAdapterFactory {
  return registry[kind]
}

export function listAgentKinds(): AgentKind[] {
  return Object.keys(registry) as AgentKind[]
}
