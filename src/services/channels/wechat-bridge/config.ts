/**
 * Shared WeChat Bridge configuration.
 *
 * All bridge variants (simple, cli, http) use these defaults.
 * Override via environment variables.
 */

export interface BridgeConfig {
  weixinMcpUrl: string
  weixinAccountId: string
  claudeApiKey: string
  claudeApiUrl: string
  claudeModel: string
  pollIntervalMs: number
  maxResponseTimeMs: number
}

const DEFAULT_WEIXIN_MCP_URL = 'http://localhost:3001/mcp'
const DEFAULT_CLAUDE_API_URL = 'https://api.minimaxi.com/anthropic/v1/messages'
const DEFAULT_CLAUDE_MODEL = 'MiniMax-M2.7'
const DEFAULT_POLL_INTERVAL_MS = 5000
const DEFAULT_MAX_RESPONSE_TIME_MS = 90_000

export function getBridgeConfig(overrides?: Partial<BridgeConfig>): BridgeConfig {
  return {
    weixinMcpUrl: DEFAULT_WEIXIN_MCP_URL,
    weixinAccountId: process.env.WEIXIN_ACCOUNT_ID || 'e87c180011fe-im-bot',
    claudeApiKey:
      process.env.ANTHROPIC_AUTH_TOKEN ||
      process.env.ANTHROPIC_API_KEY ||
      '',
    claudeApiUrl:
      process.env.ANTHROPIC_BASE_URL || DEFAULT_CLAUDE_API_URL,
    claudeModel:
      process.env.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    maxResponseTimeMs: DEFAULT_MAX_RESPONSE_TIME_MS,
    ...overrides,
  }
}
