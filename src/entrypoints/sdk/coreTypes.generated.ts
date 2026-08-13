// Generated TypeScript types from Zod schemas in coreSchemas.ts.
// Edit schemas in coreSchemas.ts, then regenerate this file.
// Run: bun scripts/generate-sdk-types.ts

import type { z } from 'zod/v4'
import type {
  AccountInfoSchema,
  AgentDefinitionSchema,
  AgentInfoSchema,
  AgentMcpServerSpecSchema,
  ApiKeySourceSchema,
  AsyncHookJSONOutputSchema,
  BaseHookInputSchema,
  BaseOutputFormatSchema,
  ConfigChangeHookInputSchema,
  ConfigScopeSchema,
  CwdChangedHookInputSchema,
  CwdChangedHookSpecificOutputSchema,
  ElicitationHookInputSchema,
  ElicitationHookSpecificOutputSchema,
  ElicitationResultHookInputSchema,
  ElicitationResultHookSpecificOutputSchema,
  ExitReasonSchema,
  FastModeStateSchema,
  FileChangedHookInputSchema,
  FileChangedHookSpecificOutputSchema,
  HookEventSchema,
  HookInputSchema,
  HookJSONOutputSchema,
  InstructionsLoadedHookInputSchema,
  JsonSchemaOutputFormatSchema,
  McpClaudeAIProxyServerConfigSchema,
  McpHttpServerConfigSchema,
  McpSdkServerConfigSchema,
  McpServerConfigForProcessTransportSchema,
  McpServerStatusConfigSchema,
  McpServerStatusSchema,
  McpSetServersResultSchema,
  McpSSEServerConfigSchema,
  McpStdioServerConfigSchema,
  ModelInfoSchema,
  ModelUsageSchema,
  NotificationHookInputSchema,
  NotificationHookSpecificOutputSchema,
  OutputFormatSchema,
  OutputFormatTypeSchema,
  PermissionBehaviorSchema,
  PermissionDecisionClassificationSchema,
  PermissionDeniedHookInputSchema,
  PermissionDeniedHookSpecificOutputSchema,
  PermissionModeSchema,
  PermissionRequestHookInputSchema,
  PermissionRequestHookSpecificOutputSchema,
  PermissionResultSchema,
  PermissionRuleValueSchema,
  PermissionUpdateDestinationSchema,
  PermissionUpdateSchema,
  PostCompactHookInputSchema,
  PostToolUseFailureHookInputSchema,
  PostToolUseFailureHookSpecificOutputSchema,
  PostToolUseHookInputSchema,
  PostToolUseHookSpecificOutputSchema,
  PreCompactHookInputSchema,
  PreToolUseHookInputSchema,
  PreToolUseHookSpecificOutputSchema,
  PromptRequestOptionSchema,
  PromptRequestSchema,
  PromptResponseSchema,
  RewindFilesResultSchema,
  SDKAPIRetryMessageSchema,
  SDKAssistantMessageErrorSchema,
  SDKAssistantMessageSchema,
  SDKAuthStatusMessageSchema,
  SDKCompactBoundaryMessageSchema,
  SDKElicitationCompleteMessageSchema,
  SDKFilesPersistedEventSchema,
  SDKHookProgressMessageSchema,
  SDKHookResponseMessageSchema,
  SDKHookStartedMessageSchema,
  SDKLocalCommandOutputMessageSchema,
  SDKMessageSchema,
  SDKPartialAssistantMessageSchema,
  SDKPermissionDenialSchema,
  SDKPostTurnSummaryMessageSchema,
  SDKPromptSuggestionMessageSchema,
  SDKRateLimitEventSchema,
  SDKRateLimitInfoSchema,
  SDKResultErrorSchema,
  SDKResultMessageSchema,
  SDKResultSuccessSchema,
  SDKSessionInfoSchema,
  SDKSessionStateChangedMessageSchema,
  SDKStatusMessageSchema,
  SDKStatusSchema,
  SDKStreamlinedTextMessageSchema,
  SDKStreamlinedToolUseSummaryMessageSchema,
  SDKSystemMessageSchema,
  SDKTaskNotificationMessageSchema,
  SDKTaskProgressMessageSchema,
  SDKTaskStartedMessageSchema,
  SDKToolProgressMessageSchema,
  SDKToolUseSummaryMessageSchema,
  SDKUserMessageReplaySchema,
  SDKUserMessageSchema,
  SdkBetaSchema,
  SdkPluginConfigSchema,
  SessionEndHookInputSchema,
  SessionStartHookInputSchema,
  SessionStartHookSpecificOutputSchema,
  SettingSourceSchema,
  SetupHookInputSchema,
  SetupHookSpecificOutputSchema,
  SlashCommandSchema,
  StopFailureHookInputSchema,
  StopHookInputSchema,
  SubagentStartHookInputSchema,
  SubagentStartHookSpecificOutputSchema,
  SubagentStopHookInputSchema,
  SyncHookJSONOutputSchema,
  TaskCompletedHookInputSchema,
  TaskCreatedHookInputSchema,
  TeammateIdleHookInputSchema,
  ThinkingAdaptiveSchema,
  ThinkingConfigSchema,
  ThinkingDisabledSchema,
  ThinkingEnabledSchema,
  UserPromptSubmitHookInputSchema,
  UserPromptSubmitHookSpecificOutputSchema,
  WorktreeCreateHookInputSchema,
  WorktreeCreateHookSpecificOutputSchema,
  WorktreeRemoveHookInputSchema,
} from './coreSchemas.js'

// ============================================================================
// Usage & Model Types
// ============================================================================

export type ModelUsage = z.infer<typeof ModelUsageSchema>

// ============================================================================
// Output Format Types
// ============================================================================

export type OutputFormatType = z.infer<typeof OutputFormatTypeSchema>
export type BaseOutputFormat = z.infer<typeof BaseOutputFormatSchema>
export type JsonSchemaOutputFormat = z.infer<typeof JsonSchemaOutputFormatSchema>
export type OutputFormat = z.infer<typeof OutputFormatSchema>

// ============================================================================
// Config Types
// ============================================================================

export type ApiKeySource = z.infer<typeof ApiKeySourceSchema>
export type ConfigScope = z.infer<typeof ConfigScopeSchema>
export type SdkBeta = z.infer<typeof SdkBetaSchema>
export type ThinkingAdaptive = z.infer<typeof ThinkingAdaptiveSchema>
export type ThinkingEnabled = z.infer<typeof ThinkingEnabledSchema>
export type ThinkingDisabled = z.infer<typeof ThinkingDisabledSchema>
export type ThinkingConfig = z.infer<typeof ThinkingConfigSchema>

// ============================================================================
// MCP Server Config Types
// ============================================================================

export type McpStdioServerConfig = z.infer<typeof McpStdioServerConfigSchema>
export type McpSSEServerConfig = z.infer<typeof McpSSEServerConfigSchema>
export type McpHttpServerConfig = z.infer<typeof McpHttpServerConfigSchema>
export type McpSdkServerConfig = z.infer<typeof McpSdkServerConfigSchema>
export type McpServerConfigForProcessTransport = z.infer<
  typeof McpServerConfigForProcessTransportSchema
>
export type McpClaudeAIProxyServerConfig = z.infer<typeof McpClaudeAIProxyServerConfigSchema>
export type McpServerStatusConfig = z.infer<typeof McpServerStatusConfigSchema>
export type McpServerStatus = z.infer<typeof McpServerStatusSchema>
export type McpSetServersResult = z.infer<typeof McpSetServersResultSchema>

// ============================================================================
// Permission Types
// ============================================================================

export type PermissionUpdateDestination = z.infer<typeof PermissionUpdateDestinationSchema>
export type PermissionBehavior = z.infer<typeof PermissionBehaviorSchema>
export type PermissionRuleValue = z.infer<typeof PermissionRuleValueSchema>
export type PermissionUpdate = z.infer<typeof PermissionUpdateSchema>
export type PermissionDecisionClassification = z.infer<
  typeof PermissionDecisionClassificationSchema
>
export type PermissionResult = z.infer<typeof PermissionResultSchema>
export type PermissionMode = z.infer<typeof PermissionModeSchema>

// ============================================================================
// Hook Types
// ============================================================================

export type HookEvent = z.infer<typeof HookEventSchema>
export type BaseHookInput = z.infer<typeof BaseHookInputSchema>
export type PreToolUseHookInput = z.infer<typeof PreToolUseHookInputSchema>
export type PermissionRequestHookInput = z.infer<typeof PermissionRequestHookInputSchema>
export type PostToolUseHookInput = z.infer<typeof PostToolUseHookInputSchema>
export type PostToolUseFailureHookInput = z.infer<typeof PostToolUseFailureHookInputSchema>
export type PermissionDeniedHookInput = z.infer<typeof PermissionDeniedHookInputSchema>
export type NotificationHookInput = z.infer<typeof NotificationHookInputSchema>
export type UserPromptSubmitHookInput = z.infer<typeof UserPromptSubmitHookInputSchema>
export type SessionStartHookInput = z.infer<typeof SessionStartHookInputSchema>
export type SetupHookInput = z.infer<typeof SetupHookInputSchema>
export type StopHookInput = z.infer<typeof StopHookInputSchema>
export type StopFailureHookInput = z.infer<typeof StopFailureHookInputSchema>
export type SubagentStartHookInput = z.infer<typeof SubagentStartHookInputSchema>
export type SubagentStopHookInput = z.infer<typeof SubagentStopHookInputSchema>
export type PreCompactHookInput = z.infer<typeof PreCompactHookInputSchema>
export type PostCompactHookInput = z.infer<typeof PostCompactHookInputSchema>
export type TeammateIdleHookInput = z.infer<typeof TeammateIdleHookInputSchema>
export type TaskCreatedHookInput = z.infer<typeof TaskCreatedHookInputSchema>
export type TaskCompletedHookInput = z.infer<typeof TaskCompletedHookInputSchema>
export type ElicitationHookInput = z.infer<typeof ElicitationHookInputSchema>
export type ElicitationResultHookInput = z.infer<typeof ElicitationResultHookInputSchema>
export type ConfigChangeHookInput = z.infer<typeof ConfigChangeHookInputSchema>
export type InstructionsLoadedHookInput = z.infer<typeof InstructionsLoadedHookInputSchema>
export type WorktreeCreateHookInput = z.infer<typeof WorktreeCreateHookInputSchema>
export type WorktreeRemoveHookInput = z.infer<typeof WorktreeRemoveHookInputSchema>
export type CwdChangedHookInput = z.infer<typeof CwdChangedHookInputSchema>
export type FileChangedHookInput = z.infer<typeof FileChangedHookInputSchema>
export type ExitReason = z.infer<typeof ExitReasonSchema>
export type SessionEndHookInput = z.infer<typeof SessionEndHookInputSchema>
export type HookInput = z.infer<typeof HookInputSchema>
export type AsyncHookJSONOutput = z.infer<typeof AsyncHookJSONOutputSchema>
export type PreToolUseHookSpecificOutput = z.infer<typeof PreToolUseHookSpecificOutputSchema>
export type UserPromptSubmitHookSpecificOutput = z.infer<
  typeof UserPromptSubmitHookSpecificOutputSchema
>
export type SessionStartHookSpecificOutput = z.infer<typeof SessionStartHookSpecificOutputSchema>
export type SetupHookSpecificOutput = z.infer<typeof SetupHookSpecificOutputSchema>
export type SubagentStartHookSpecificOutput = z.infer<typeof SubagentStartHookSpecificOutputSchema>
export type PostToolUseHookSpecificOutput = z.infer<typeof PostToolUseHookSpecificOutputSchema>
export type PostToolUseFailureHookSpecificOutput = z.infer<
  typeof PostToolUseFailureHookSpecificOutputSchema
>
export type PermissionDeniedHookSpecificOutput = z.infer<
  typeof PermissionDeniedHookSpecificOutputSchema
>
export type NotificationHookSpecificOutput = z.infer<typeof NotificationHookSpecificOutputSchema>
export type PermissionRequestHookSpecificOutput = z.infer<
  typeof PermissionRequestHookSpecificOutputSchema
>
export type CwdChangedHookSpecificOutput = z.infer<typeof CwdChangedHookSpecificOutputSchema>
export type FileChangedHookSpecificOutput = z.infer<typeof FileChangedHookSpecificOutputSchema>
export type SyncHookJSONOutput = z.infer<typeof SyncHookJSONOutputSchema>
export type ElicitationHookSpecificOutput = z.infer<typeof ElicitationHookSpecificOutputSchema>
export type ElicitationResultHookSpecificOutput = z.infer<
  typeof ElicitationResultHookSpecificOutputSchema
>
export type WorktreeCreateHookSpecificOutput = z.infer<
  typeof WorktreeCreateHookSpecificOutputSchema
>
export type HookJSONOutput = z.infer<typeof HookJSONOutputSchema>

// ============================================================================
// Prompt Types
// ============================================================================

export type PromptRequestOption = z.infer<typeof PromptRequestOptionSchema>
export type PromptRequest = z.infer<typeof PromptRequestSchema>
export type PromptResponse = z.infer<typeof PromptResponseSchema>

// ============================================================================
// Skill/Command Types
// ============================================================================

export type SlashCommand = z.infer<typeof SlashCommandSchema>
export type AgentInfo = z.infer<typeof AgentInfoSchema>
export type ModelInfo = z.infer<typeof ModelInfoSchema>
export type AccountInfo = z.infer<typeof AccountInfoSchema>

// ============================================================================
// Agent Definition Types
// ============================================================================

export type AgentMcpServerSpec = z.infer<typeof AgentMcpServerSpecSchema>
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>

// ============================================================================
// Settings Types
// ============================================================================

export type SettingSource = z.infer<typeof SettingSourceSchema>
export type SdkPluginConfig = z.infer<typeof SdkPluginConfigSchema>

// ============================================================================
// Rewind Types
// ============================================================================

export type RewindFilesResult = z.infer<typeof RewindFilesResultSchema>

// ============================================================================
// SDK Message Types
// ============================================================================

export type SDKAssistantMessageError = z.infer<typeof SDKAssistantMessageErrorSchema>
export type SDKStatus = z.infer<typeof SDKStatusSchema>
export type SDKUserMessage = z.infer<typeof SDKUserMessageSchema>
export type SDKUserMessageReplay = z.infer<typeof SDKUserMessageReplaySchema>
export type SDKRateLimitInfo = z.infer<typeof SDKRateLimitInfoSchema>
export type SDKAssistantMessage = z.infer<typeof SDKAssistantMessageSchema>
export type SDKRateLimitEvent = z.infer<typeof SDKRateLimitEventSchema>
export type SDKStreamlinedTextMessage = z.infer<typeof SDKStreamlinedTextMessageSchema>
export type SDKStreamlinedToolUseSummaryMessage = z.infer<
  typeof SDKStreamlinedToolUseSummaryMessageSchema
>
export type SDKPermissionDenial = z.infer<typeof SDKPermissionDenialSchema>
export type SDKResultSuccess = z.infer<typeof SDKResultSuccessSchema>
export type SDKResultError = z.infer<typeof SDKResultErrorSchema>
export type SDKResultMessage = z.infer<typeof SDKResultMessageSchema>
export type SDKSystemMessage = z.infer<typeof SDKSystemMessageSchema>
export type SDKPartialAssistantMessage = z.infer<typeof SDKPartialAssistantMessageSchema>
export type SDKCompactBoundaryMessage = z.infer<typeof SDKCompactBoundaryMessageSchema>
export type SDKStatusMessage = z.infer<typeof SDKStatusMessageSchema>
export type SDKPostTurnSummaryMessage = z.infer<typeof SDKPostTurnSummaryMessageSchema>
export type SDKAPIRetryMessage = z.infer<typeof SDKAPIRetryMessageSchema>
export type SDKLocalCommandOutputMessage = z.infer<typeof SDKLocalCommandOutputMessageSchema>
export type SDKHookStartedMessage = z.infer<typeof SDKHookStartedMessageSchema>
export type SDKHookProgressMessage = z.infer<typeof SDKHookProgressMessageSchema>
export type SDKHookResponseMessage = z.infer<typeof SDKHookResponseMessageSchema>
export type SDKToolProgressMessage = z.infer<typeof SDKToolProgressMessageSchema>
export type SDKAuthStatusMessage = z.infer<typeof SDKAuthStatusMessageSchema>
export type SDKFilesPersistedEvent = z.infer<typeof SDKFilesPersistedEventSchema>
export type SDKTaskNotificationMessage = z.infer<typeof SDKTaskNotificationMessageSchema>
export type SDKTaskStartedMessage = z.infer<typeof SDKTaskStartedMessageSchema>
export type SDKSessionStateChangedMessage = z.infer<typeof SDKSessionStateChangedMessageSchema>
export type SDKTaskProgressMessage = z.infer<typeof SDKTaskProgressMessageSchema>
export type SDKToolUseSummaryMessage = z.infer<typeof SDKToolUseSummaryMessageSchema>
export type SDKElicitationCompleteMessage = z.infer<typeof SDKElicitationCompleteMessageSchema>
export type SDKPromptSuggestionMessage = z.infer<typeof SDKPromptSuggestionMessageSchema>
export type SDKSessionInfo = z.infer<typeof SDKSessionInfoSchema>
export type SDKMessage = z.infer<typeof SDKMessageSchema>
export type FastModeState = z.infer<typeof FastModeStateSchema>
