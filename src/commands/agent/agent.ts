import { listAgentKinds } from '../../services/agents/factory.js'
import { getSessionManager } from '../../services/agents/session-manager.js'
import type { AgentKind } from '../../services/agents/types.js'
import type { LocalCommandCall } from '../../types/command.js'

export const call: LocalCommandCall = async (args) => {
  const sm = getSessionManager()
  const kind = args?.trim().toLowerCase()

  // listAgentKinds() returns AgentKind[], so the cast is runtime-safe after includes()
  const validKinds = listAgentKinds() as readonly string[]
  if (!kind || !validKinds.includes(kind)) {
    return {
      type: 'text',
      value: `Invalid agent kind: "${kind || '(none)'}". Valid options: ${validKinds.join(', ')}`,
    }
  }

  const prev = sm.getActiveKind()
  if (prev === kind) {
    return { type: 'text', value: `Agent is already set to "${kind}". No change.` }
  }

  sm.setActiveKind(kind as AgentKind)
  return {
    type: 'text',
    value: `Switched agent from "${prev}" to "${kind}". New sessions will use this backend.`,
  }
}
