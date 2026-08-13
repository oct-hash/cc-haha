// ============================================================================
// SDK Control Types — inferred from Zod schemas in controlSchemas.ts
// ============================================================================

import type { z } from 'zod/v4'
import type {
  ControlErrorResponseSchema,
  ControlResponseSchema,
  SDKControlApplyFlagSettingsRequestSchema,
  SDKControlCancelAsyncMessageRequestSchema,
  SDKControlCancelAsyncMessageResponseSchema,
  SDKControlCancelRequestSchema,
  SDKControlElicitationRequestSchema,
  SDKControlElicitationResponseSchema,
  SDKControlGetContextUsageRequestSchema,
  SDKControlGetContextUsageResponseSchema,
  SDKControlGetSettingsRequestSchema,
  SDKControlGetSettingsResponseSchema,
  SDKControlInitializeRequestSchema,
  SDKControlInitializeResponseSchema,
  SDKControlInterruptRequestSchema,
  SDKControlMcpMessageRequestSchema,
  SDKControlMcpReconnectRequestSchema,
  SDKControlMcpSetServersRequestSchema,
  SDKControlMcpSetServersResponseSchema,
  SDKControlMcpStatusRequestSchema,
  SDKControlMcpStatusResponseSchema,
  SDKControlMcpToggleRequestSchema,
  SDKControlPermissionRequestSchema,
  SDKControlReloadPluginsRequestSchema,
  SDKControlReloadPluginsResponseSchema,
  SDKControlRequestInnerSchema,
  SDKControlRequestSchema,
  SDKControlResponseSchema,
  SDKControlRewindFilesRequestSchema,
  SDKControlRewindFilesResponseSchema,
  SDKControlSeedReadStateRequestSchema,
  SDKControlSetMaxThinkingTokensRequestSchema,
  SDKControlSetModelRequestSchema,
  SDKControlSetPermissionModeRequestSchema,
  SDKControlStopTaskRequestSchema,
  SDKHookCallbackMatcherSchema,
  SDKHookCallbackRequestSchema,
  SDKKeepAliveMessageSchema,
  SDKUpdateEnvironmentVariablesMessageSchema,
  StdinMessageSchema,
  StdoutMessageSchema,
} from './controlSchemas.js'

// Re-export type that consumers import from here
export type { SDKPartialAssistantMessage } from './coreTypes.js'

export type SDKHookCallbackMatcher = z.infer<typeof SDKHookCallbackMatcherSchema>
export type SDKControlInitializeRequest = z.infer<typeof SDKControlInitializeRequestSchema>
export type SDKControlInitializeResponse = z.infer<typeof SDKControlInitializeResponseSchema>
export type SDKControlInterruptRequest = z.infer<typeof SDKControlInterruptRequestSchema>
export type SDKControlPermissionRequest = z.infer<typeof SDKControlPermissionRequestSchema>
export type SDKControlSetPermissionModeRequest = z.infer<
  typeof SDKControlSetPermissionModeRequestSchema
>
export type SDKControlSetModelRequest = z.infer<typeof SDKControlSetModelRequestSchema>
export type SDKControlSetMaxThinkingTokensRequest = z.infer<
  typeof SDKControlSetMaxThinkingTokensRequestSchema
>
export type SDKControlMcpStatusRequest = z.infer<typeof SDKControlMcpStatusRequestSchema>
export type SDKControlMcpStatusResponse = z.infer<typeof SDKControlMcpStatusResponseSchema>
export type SDKControlGetContextUsageRequest = z.infer<
  typeof SDKControlGetContextUsageRequestSchema
>
export type SDKControlGetContextUsageResponse = z.infer<
  typeof SDKControlGetContextUsageResponseSchema
>
export type SDKControlRewindFilesRequest = z.infer<typeof SDKControlRewindFilesRequestSchema>
export type SDKControlRewindFilesResponse = z.infer<typeof SDKControlRewindFilesResponseSchema>
export type SDKControlCancelAsyncMessageRequest = z.infer<
  typeof SDKControlCancelAsyncMessageRequestSchema
>
export type SDKControlCancelAsyncMessageResponse = z.infer<
  typeof SDKControlCancelAsyncMessageResponseSchema
>
export type SDKControlSeedReadStateRequest = z.infer<typeof SDKControlSeedReadStateRequestSchema>
export type SDKHookCallbackRequest = z.infer<typeof SDKHookCallbackRequestSchema>
export type SDKControlMcpMessageRequest = z.infer<typeof SDKControlMcpMessageRequestSchema>
export type SDKControlMcpSetServersRequest = z.infer<typeof SDKControlMcpSetServersRequestSchema>
export type SDKControlMcpSetServersResponse = z.infer<typeof SDKControlMcpSetServersResponseSchema>
export type SDKControlReloadPluginsRequest = z.infer<typeof SDKControlReloadPluginsRequestSchema>
export type SDKControlReloadPluginsResponse = z.infer<typeof SDKControlReloadPluginsResponseSchema>
export type SDKControlMcpReconnectRequest = z.infer<typeof SDKControlMcpReconnectRequestSchema>
export type SDKControlMcpToggleRequest = z.infer<typeof SDKControlMcpToggleRequestSchema>
export type SDKControlStopTaskRequest = z.infer<typeof SDKControlStopTaskRequestSchema>
export type SDKControlApplyFlagSettingsRequest = z.infer<
  typeof SDKControlApplyFlagSettingsRequestSchema
>
export type SDKControlGetSettingsRequest = z.infer<typeof SDKControlGetSettingsRequestSchema>
export type SDKControlGetSettingsResponse = z.infer<typeof SDKControlGetSettingsResponseSchema>
export type SDKControlElicitationRequest = z.infer<typeof SDKControlElicitationRequestSchema>
export type SDKControlElicitationResponse = z.infer<typeof SDKControlElicitationResponseSchema>
export type SDKControlRequestInner = z.infer<typeof SDKControlRequestInnerSchema>
export type SDKControlRequest = z.infer<typeof SDKControlRequestSchema>
export type ControlResponse = z.infer<typeof ControlResponseSchema>
export type ControlErrorResponse = z.infer<typeof ControlErrorResponseSchema>
export type SDKControlResponse = z.infer<typeof SDKControlResponseSchema>
export type SDKControlCancelRequest = z.infer<typeof SDKControlCancelRequestSchema>
export type SDKKeepAliveMessage = z.infer<typeof SDKKeepAliveMessageSchema>
export type SDKUpdateEnvironmentVariablesMessage = z.infer<
  typeof SDKUpdateEnvironmentVariablesMessageSchema
>
export type StdoutMessage = z.infer<typeof StdoutMessageSchema>
export type StdinMessage = z.infer<typeof StdinMessageSchema>
