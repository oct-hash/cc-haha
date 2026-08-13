import type { APIError } from '@anthropic-ai/sdk'
import type {
  BetaContentBlock,
  BetaMessage,
  BetaUsage as Usage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { ContentBlockParam, } from '@anthropic-ai/sdk/resources/index.mjs'
import type { UUID } from 'crypto'
import type { SDKAssistantMessageError } from '../entrypoints/agentSdkTypes.js'
import type { PermissionMode } from '../utils/permissions/PermissionMode.js'

// ============================================================================
// Base / primitive types
// ============================================================================

/** Provenance of a message. undefined = human (keyboard). */
export type MessageOrigin =
  | { kind: 'human' }
  | { kind: 'task-notification' }
  | { kind: 'coordinator' }
  | { kind: 'channel'; server: string }

export type PartialCompactDirection = 'up' | 'down'

export type SystemMessageLevel = 'info' | 'error' | 'warn'

export type StopHookInfo = {
  command: string
  promptText?: string
  durationMs?: number
}

// ============================================================================
// Stream / Request events (yielded by the query generator)
// ============================================================================

export type StreamEvent = {
  type: 'stream'
  text: string
  delta?: { type: string; text: string }
}

export type RequestStartEvent = {
  type: 'request_start'
}

// ============================================================================
// Core message types
// ============================================================================

export interface UserMessage {
  type: 'user'
  message: {
    role: 'user'
    content: string | ContentBlockParam[]
  }
  uuid: UUID
  timestamp: string
  isMeta?: true
  isVisibleInTranscriptOnly?: true
  isVirtual?: true
  isCompactSummary?: true
  summarizeMetadata?: {
    messagesSummarized: number
    userContext?: string
    direction?: PartialCompactDirection
  }
  toolUseResult?: unknown
  mcpMeta?: {
    _meta?: Record<string, unknown>
    structuredContent?: Record<string, unknown>
  }
  imagePasteIds?: number[]
  sourceToolAssistantUUID?: UUID
  permissionMode?: PermissionMode
  origin?: MessageOrigin
}

export interface AssistantMessage {
  type: 'assistant'
  uuid: UUID
  timestamp: string
  message: BetaMessage
  requestId?: string
  apiError?: APIError
  error?: SDKAssistantMessageError
  errorDetails?: string
  isApiErrorMessage?: boolean
  isVirtual?: true
  isMeta?: true
  usage?: Usage
  advisorModel?: string
}

export interface ProgressMessage<P = unknown> {
  type: 'progress'
  data: P
  toolUseID: string
  parentToolUseID: string
  uuid: UUID
  timestamp: string
}

export interface AttachmentMessage<A = { type: string; [key: string]: unknown }> {
  type: 'attachment'
  attachment: A
  uuid: UUID
  timestamp: string
}

export interface TombstoneMessage {
  type: 'tombstone'
  message: Message
}

export interface ToolUseSummaryMessage {
  type: 'tool_use_summary'
  summary: string
  precedingToolUseIds: string[]
  uuid: UUID
  timestamp: string
}

// ============================================================================
// System message variants (all have type: 'system', discriminated by subtype)
// ============================================================================

export interface SystemInformationalMessage {
  type: 'system'
  subtype: 'informational'
  content: string
  isMeta: boolean
  timestamp: string
  uuid: UUID
  toolUseID?: string
  level: SystemMessageLevel
  preventContinuation?: boolean
}

export interface SystemPermissionRetryMessage {
  type: 'system'
  subtype: 'permission_retry'
  content: string
  commands: string[]
  level: SystemMessageLevel
  isMeta: boolean
  timestamp: string
  uuid: UUID
}

export interface SystemBridgeStatusMessage {
  type: 'system'
  subtype: 'bridge_status'
  content: string
  url: string
  upgradeNudge?: string
  isMeta: boolean
  timestamp: string
  uuid: UUID
}

export interface SystemScheduledTaskFireMessage {
  type: 'system'
  subtype: 'scheduled_task_fire'
  content: string
  isMeta: boolean
  timestamp: string
  uuid: UUID
}

export interface SystemStopHookSummaryMessage {
  type: 'system'
  subtype: 'stop_hook_summary'
  hookCount: number
  hookInfos: StopHookInfo[]
  hookErrors: string[]
  preventedContinuation: boolean
  stopReason?: string
  hasOutput: boolean
  level: SystemMessageLevel
  timestamp: string
  uuid: UUID
  toolUseID?: string
  hookLabel?: string
  totalDurationMs?: number
}

export interface SystemTurnDurationMessage {
  type: 'system'
  subtype: 'turn_duration'
  durationMs: number
  budgetTokens?: number
  budgetLimit?: number
  budgetNudges?: number
  messageCount?: number
  timestamp: string
  uuid: UUID
  isMeta: boolean
}

export interface SystemAwaySummaryMessage {
  type: 'system'
  subtype: 'away_summary'
  content: string
  timestamp: string
  uuid: UUID
  isMeta: boolean
}

export interface SystemMemorySavedMessage {
  type: 'system'
  subtype: 'memory_saved'
  writtenPaths: string[]
  timestamp: string
  uuid: UUID
  isMeta: boolean
}

export interface SystemAgentsKilledMessage {
  type: 'system'
  subtype: 'agents_killed'
  timestamp: string
  uuid: UUID
  isMeta: boolean
}

export interface SystemApiMetricsMessage {
  type: 'system'
  subtype: 'api_metrics'
  ttftMs: number
  otps: number
  isP50?: boolean
  hookDurationMs?: number
  turnDurationMs?: number
  toolDurationMs?: number
  classifierDurationMs?: number
  toolCount?: number
  hookCount?: number
  classifierCount?: number
  configWriteCount?: number
  timestamp: string
  uuid: UUID
  isMeta: boolean
}

export interface SystemLocalCommandMessage {
  type: 'system'
  subtype: 'local_command'
  content: string
  level: SystemMessageLevel
  timestamp: string
  uuid: UUID
  isMeta: boolean
}

export interface SystemCompactBoundaryMessage {
  type: 'system'
  subtype: 'compact_boundary'
  content: string
  isMeta: boolean
  timestamp: string
  uuid: UUID
  level: SystemMessageLevel
  compactMetadata: {
    trigger: 'manual' | 'auto'
    preTokens: number
    userContext?: string
    messagesSummarized?: number
  }
  logicalParentUuid?: UUID
}

export interface SystemMicrocompactBoundaryMessage {
  type: 'system'
  subtype: 'microcompact_boundary'
  content: string
  isMeta: boolean
  timestamp: string
  uuid: UUID
  level: SystemMessageLevel
  microcompactMetadata: {
    trigger: 'auto'
    preTokens: number
    tokensSaved: number
    compactedToolIds: string[]
    clearedAttachmentUUIDs: string[]
  }
}

export interface SystemAPIErrorMessage {
  type: 'system'
  subtype: 'api_error'
  level: SystemMessageLevel
  cause?: Error
  error: APIError
  retryInMs: number
  retryAttempt: number
  maxRetries: number
  timestamp: string
  uuid: UUID
}

// ============================================================================
// SystemMessage — union of all system message subtypes
// ============================================================================

export type SystemMessage =
  | SystemInformationalMessage
  | SystemPermissionRetryMessage
  | SystemBridgeStatusMessage
  | SystemScheduledTaskFireMessage
  | SystemStopHookSummaryMessage
  | SystemTurnDurationMessage
  | SystemAwaySummaryMessage
  | SystemMemorySavedMessage
  | SystemAgentsKilledMessage
  | SystemApiMetricsMessage
  | SystemLocalCommandMessage
  | SystemCompactBoundaryMessage
  | SystemMicrocompactBoundaryMessage
  | SystemAPIErrorMessage

// ============================================================================
// HookResultMessage — emitted by hook execution (alias of AttachmentMessage)
// ============================================================================

export type HookResultMessage = AttachmentMessage

// ============================================================================
// Message — the main discriminated union
// ============================================================================

export type Message =
  | UserMessage
  | AssistantMessage
  | ProgressMessage
  | AttachmentMessage
  | SystemMessage
  | TombstoneMessage
  | ToolUseSummaryMessage
  | HookResultMessage

// ============================================================================
// Normalized message types (single content block per message, for API/rendering)
// ============================================================================

export interface NormalizedUserMessage extends Omit<UserMessage, 'message'> {
  type: 'user'
  message: {
    role: 'user'
    content: [ContentBlockParam]
  }
}

export interface NormalizedAssistantMessage extends Omit<AssistantMessage, 'message'> {
  type: 'assistant'
  message: BetaMessage & { content: [BetaContentBlock] }
}

export type NormalizedMessage =
  | NormalizedUserMessage
  | NormalizedAssistantMessage
  | ProgressMessage
  | AttachmentMessage
  | SystemMessage
  | HookResultMessage

// ============================================================================
// RenderableMessage — messages that can be rendered in the TUI
// ============================================================================

export type RenderableMessage =
  | NormalizedUserMessage
  | NormalizedAssistantMessage
  | AttachmentMessage
  | SystemMessage
  | ProgressMessage
  | HookResultMessage
  | TombstoneMessage
  | ToolUseSummaryMessage
