import type { NormalizedMessage } from './message.js'

// ============================================================================
// Tool progress data types (discriminated union on `type`)
// ============================================================================

/** Progress emitted by BashTool during long-running commands. */
export interface BashProgress {
  type: 'bash_progress'
  output: string
  fullOutput: string
  elapsedTimeSeconds: number
  totalLines: number
  totalBytes: number
}

/** Progress emitted by PowerShellTool during long-running commands. */
export interface PowerShellProgress {
  type: 'powershell_progress'
  output: string
  fullOutput: string
  elapsedTimeSeconds: number
  totalLines: number
  totalBytes: number
}

/** Union of shell progress types (Bash or PowerShell). */
export type ShellProgress = BashProgress | PowerShellProgress

/** Progress emitted by AgentTool when a sub-agent produces a message. */
export interface AgentToolProgress {
  type: 'agent_progress'
  message: NormalizedMessage
  prompt: string
  agentId: string
}

/** Progress emitted by MCPTool (structured counter + optional message). */
export interface MCPProgress {
  type: 'mcp_progress'
  progress: number
  total?: number
  progressMessage?: string
}

/** Progress emitted during web search tool execution. */
export type WebSearchProgress =
  | { type: 'query_update'; query: string }
  | { type: 'search_results_received'; resultCount: number; query: string }

/** Progress emitted by SkillTool when a sub-agent produces a message. */
export interface SkillToolProgress {
  type: 'skill_progress'
  message: NormalizedMessage
  prompt: string
  agentId: string
}

/** Progress emitted by TaskOutputTool when blocking on a task. */
export interface TaskOutputProgress {
  type: 'waiting_for_task'
  taskDescription: string
  taskType: string
}

/** Progress emitted by the REPL tool. */
export interface REPLToolProgress {
  type: 'repl_tool_progress'
  [key: string]: unknown
}

/** Delta batch of workflow state changes for SDK task_progress events. */
export interface SdkWorkflowProgress {
  type: string
  index: number
  phaseIndex: number
  [key: string]: unknown
}

// ============================================================================
// Master union
// ============================================================================

export type ToolProgressData =
  | BashProgress
  | PowerShellProgress
  | AgentToolProgress
  | MCPProgress
  | WebSearchProgress
  | SkillToolProgress
  | TaskOutputProgress
  | REPLToolProgress
  | SdkWorkflowProgress
