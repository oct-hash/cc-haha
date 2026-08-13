export type UnifiedInstalledItem = {
  type: 'plugin' | 'failed-plugin' | 'flagged-plugin' | 'mcp' | 'mcp-scope-header'
  id?: string
  name?: string
  scope?: string
  indented?: boolean
  isLast?: boolean
}
