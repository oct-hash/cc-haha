import { getSessionManager } from '../../services/agents/session-manager.js'
import type { SessionManagerConfig } from '../../services/agents/types.js'
import type { LocalCommandCall } from '../../types/command.js'

const NUMERIC_KEYS = new Set<keyof SessionManagerConfig>([
  'maxSessions',
  'retryAttempts',
  'timeoutMs',
])

export const call: LocalCommandCall = async (args) => {
  const sm = getSessionManager()
  const trimmed = args?.trim() ?? ''

  // No args: show current config
  if (!trimmed) {
    const cfg = sm.getConfig()
    const lines = [
      `Current SessionManager configuration:`,
      `  maxSessions:    ${cfg.maxSessions ?? 10}`,
      `  retryAttempts:  ${cfg.retryAttempts ?? 0}`,
      `  timeoutMs:      ${cfg.timeoutMs ?? 0}${cfg.timeoutMs ? '' : ' (no timeout)'}`,
      `  defaultKind:    ${cfg.defaultKind ?? 'claude-haha'}`,
      `  activeKind:     ${sm.getActiveKind()}`,
      `  sessions:       ${sm.listSessions().length}`,
    ]
    return { type: 'text', value: lines.join('\n') }
  }

  // Parse key=value
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) {
    return {
      type: 'text',
      value: `Usage: /agent-config [key=value]\n\nValid keys: maxSessions, retryAttempts, timeoutMs, defaultKind\nExample: /agent-config retryAttempts=3`,
    }
  }

  const key = trimmed.slice(0, eqIdx).trim()
  const value = trimmed.slice(eqIdx + 1).trim()

  const validKeys: Array<keyof SessionManagerConfig> = [
    'maxSessions',
    'retryAttempts',
    'timeoutMs',
    'defaultKind',
  ]
  if (!validKeys.includes(key as keyof SessionManagerConfig)) {
    return {
      type: 'text',
      value: `Invalid key: "${key}". Valid keys: ${validKeys.join(', ')}`,
    }
  }

  if (NUMERIC_KEYS.has(key as keyof SessionManagerConfig)) {
    const num = Number(value)
    if (!Number.isFinite(num) || num < 0) {
      return { type: 'text', value: `"${key}" requires a non-negative number, got: "${value}"` }
    }
    sm.updateConfig({ [key]: num })
  } else if (key === 'defaultKind') {
    const validKinds = ['claude-haha', 'claude-code', 'codex']
    if (!validKinds.includes(value)) {
      return {
        type: 'text',
        value: `Invalid agent kind: "${value}". Valid options: ${validKinds.join(', ')}`,
      }
    }
    sm.updateConfig({ defaultKind: value as SessionManagerConfig['defaultKind'] })
  }

  return { type: 'text', value: `Updated ${key} = ${value}` }
}
