// ============================================================================
// Types for the plugin command
// ============================================================================

export type ViewState =
  | { type: 'menu' }
  | { type: 'discover-plugins' }
  | {
      type: 'manage-plugins'
      targetPlugin?: string
      targetMarketplace?: string
      action?: 'enable' | 'disable' | 'uninstall'
    }
  | { type: 'manage-marketplaces' }
  | { type: 'browse-marketplace'; targetMarketplace: string }
  | { type: 'add-marketplace' }

export interface PluginSettingsProps {
  onComplete: () => void
  args: string
  showMcpRedirectMessage?: boolean
}
