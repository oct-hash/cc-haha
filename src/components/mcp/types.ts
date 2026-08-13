import type { McpServerConfig } from '../../services/mcp/types.js'

export type ServerInfo = {
  name: string
  scope: string
  config: McpServerConfig
}

export type MCPViewState = 'list' | 'detail' | 'settings'

export type AgentMcpServerInfo = {
  name: string
  type: string
}

export type StdioServerInfo = ServerInfo
export type ClaudeAIServerInfo = ServerInfo
export type HTTPServerInfo = ServerInfo
export type SSEServerInfo = ServerInfo
