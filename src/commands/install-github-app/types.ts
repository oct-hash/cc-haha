// ============================================================================
// Types for the install-github-app command
// ============================================================================

export type Workflow = 'claude' | 'claude-review'

export interface Warning {
  title: string
  message: string
  instructions: string[]
}

export interface State {
  step:
    | 'check-gh'
    | 'warnings'
    | 'choose-repo'
    | 'error'
    | 'creating'
    | 'success'
    | 'install-app'
    | 'check-existing-secret'
    | 'existing-workflow'
    | 'api-key'
    | 'oauth-flow'
    | 'select-workflows'
  selectedRepoName: string
  currentRepo: string
  useCurrentRepo: boolean
  apiKeyOrOAuthToken: string
  useExistingKey: boolean
  currentWorkflowInstallStep: number
  warnings: Warning[]
  secretExists: boolean
  secretName: string
  useExistingSecret: boolean
  workflowExists: boolean
  selectedWorkflows: Workflow[]
  selectedApiKeyOption: 'existing' | 'new' | 'oauth'
  authType: 'api_key' | 'oauth_token'
  error?: string
  errorReason?: string
  errorInstructions?: string[]
  workflowAction?: 'update' | 'skip'
}
