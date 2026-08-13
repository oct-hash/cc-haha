// Extracted from REPL.tsx — query callbacks plus session backgrounding.
// useREPLQueryCallbacks owns handleBackgroundQuery, the useSessionBackgrounding
// hook (returning handleBackgroundSession), and the onQueryEvent/onQueryImpl/
// onQuery pipeline. All externally captured values are passed via
// UseREPLQueryCallbacksParams; only module-scope handler imports are resolved
// here directly.

import { feature } from 'bun:bundle'
import type { UUID } from 'node:crypto'
import type * as React from 'react'
import { useCallback } from 'react'
import type { SpinnerMode } from '../components/Spinner.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import { useSessionBackgrounding } from '../hooks/useSessionBackgrounding.js'
import type { AppStateStore } from '../state/AppState.js'
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import type { Message as MessageType, UserMessage } from '../types/message.js'
import type { EffortValue } from '../utils/effort.js'
import type { SetAppState } from '../utils/messageQueueManager.js'
import type {
  handleMessageFromStream,
  StreamingThinking,
  StreamingToolUse,
} from '../utils/messages.js'
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'
import type { QueryGuard } from '../utils/QueryGuard.js'
import {
  handleBackgroundQuery as handleBackgroundQueryFn,
  handleQueryEvent,
  handleQuery as handleQueryFn,
  handleQueryImpl,
} from './REPL.handlers.js'

type ApiMetricsEntry = {
  ttftMs: number
  firstTokenTime: number
  lastTokenTime: number
  responseLengthBaseline: number
  endResponseLength: number
}

type ProactiveModule = {
  isProactiveActive: () => boolean
  setContextBlocked: (v: boolean) => void
}

export interface UseREPLQueryCallbacksParams {
  // From useREPLFoundation
  toolPermissionContext: unknown
  setAppState: SetAppState
  store: AppStateStore
  mainLoopModel: string
  // Typed as unknown: proactiveActive comes from the foundation's
  // useSyncExternalStore (untyped selector), which resolves to unknown, and
  // proactiveActive is only ever forwarded as `as any` to the query handler.
  proactiveActive: unknown
  titleDisabled: boolean
  mainThreadAgentDefinition: AgentDefinition | undefined
  // Module-scope conditional-require values kept in REPL.tsx, passed in.
  proactiveModule: ProactiveModule | undefined
  getCoordinatorUserContext: (
    mcpClients: readonly { name: string }[],
    scratchpadDir?: string,
  ) => Record<string, string>
  // From useREPLStreamState
  setStreamMode: (mode: SpinnerMode) => void
  setStreamingToolUses: (uses: StreamingToolUse[]) => void
  setStreamingThinking: (thinking: StreamingThinking | null) => void
  abortController: AbortController | null
  setAbortController: (controller: AbortController | null) => void
  sendBridgeResultRef: React.RefObject<() => void>
  restoreMessageSyncRef: React.RefObject<(message: UserMessage) => void>
  queryGuard: QueryGuard
  setIsExternalLoading: (value: boolean) => void
  loadingStartTimeRef: React.RefObject<number>
  totalPausedMsRef: React.RefObject<number>
  resetTimingRefs: () => void
  swarmStartTimeRef: React.RefObject<number | null>
  swarmBudgetInfoRef: React.RefObject<
    | {
        tokens: number
        limit: number
        nudges: number
      }
    | undefined
  >
  sessionTitle: string | undefined
  setHaikuTitle: (title: string) => void
  haikuTitleAttemptedRef: React.RefObject<boolean>
  agentTitle: string | undefined
  terminalTitle: string
  // From useREPLMessages
  messagesRef: React.RefObject<MessageType[]>
  setMessages: (updater: React.SetStateAction<MessageType[]>) => void
  // From useREPLScrollInput
  responseLengthRef: React.RefObject<number>
  apiMetricsRef: React.RefObject<ApiMetricsEntry[]>
  setResponseLength: (updater: (length: number) => number) => void
  inputValueRef: React.RefObject<string>
  // From useREPLUiState
  setStreamingText: (text: string | null) => void
  onStreamingText: (f: (current: string | null) => string | null) => void
  setLastQueryCompletionTime: (time: number) => void
  setConversationId: (id: UUID) => void
  skipIdleCheckRef: React.RefObject<boolean>
  terminalFocusRef: React.RefObject<boolean>
  // From useREPLToolContext
  canUseTool: CanUseToolFn
  getToolUseContext: (
    messages: MessageType[],
    newMessages: MessageType[],
    abortController: AbortController,
    mainLoopModel: string,
  ) => ProcessUserInputContext
  // From useREPLIdleReset
  resetLoadingState: () => void
  // From useMoreRight. The external stub types these with M = any and
  // onBeforeQuery returns Promise<boolean>, so mrOnBeforeQuery is forwarded
  // `as any` to the query handler (matching the pre-extraction call site).
  mrOnBeforeQuery: unknown
  mrOnTurnComplete: (messages: MessageType[], wasAborted: boolean) => Promise<void>
  // From props
  onTurnComplete: ((messages: MessageType[]) => void | Promise<void>) | undefined
  initialMcpClients: readonly { name: string }[] | undefined
  customSystemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  // Module import kept in REPL.tsx, passed in.
  removeLastFromHistory: () => void
}

export function useREPLQueryCallbacks(params: UseREPLQueryCallbacksParams) {
  const {
    toolPermissionContext,
    setAppState,
    store,
    mainLoopModel,
    proactiveActive,
    titleDisabled,
    mainThreadAgentDefinition,
    proactiveModule,
    getCoordinatorUserContext,
    setStreamMode,
    setStreamingToolUses,
    setStreamingThinking,
    abortController,
    setAbortController,
    sendBridgeResultRef,
    restoreMessageSyncRef,
    queryGuard,
    setIsExternalLoading,
    loadingStartTimeRef,
    totalPausedMsRef,
    resetTimingRefs,
    swarmStartTimeRef,
    swarmBudgetInfoRef,
    sessionTitle,
    setHaikuTitle,
    haikuTitleAttemptedRef,
    agentTitle,
    terminalTitle,
    messagesRef,
    setMessages,
    responseLengthRef,
    apiMetricsRef,
    setResponseLength,
    inputValueRef,
    setStreamingText,
    onStreamingText,
    setLastQueryCompletionTime,
    setConversationId,
    skipIdleCheckRef,
    terminalFocusRef,
    canUseTool,
    getToolUseContext,
    resetLoadingState,
    mrOnBeforeQuery,
    mrOnTurnComplete,
    onTurnComplete,
    initialMcpClients,
    customSystemPrompt,
    appendSystemPrompt,
    removeLastFromHistory,
  } = params

  // Session backgrounding (Ctrl+B to background/foreground)
  const handleBackgroundQuery = useCallback(() => {
    void handleBackgroundQueryFn({
      abortController,
      messagesRef,
      mainLoopModel,
      getToolUseContext,
      additionalWorkingDirectories: Array.from(
        toolPermissionContext.additionalWorkingDirectories.keys(),
      ),
      mainThreadAgentDefinition,
      customSystemPrompt,
      appendSystemPrompt,
      canUseTool,
      setAppState,
      terminalTitle,
    })
  }, [
    abortController,
    mainLoopModel,
    toolPermissionContext,
    mainThreadAgentDefinition,
    getToolUseContext,
    customSystemPrompt,
    appendSystemPrompt,
    canUseTool,
    setAppState,
    terminalTitle,
  ])
  const { handleBackgroundSession } = useSessionBackgrounding({
    setMessages,
    setIsLoading: setIsExternalLoading,
    resetLoadingState,
    setAbortController,
    onBackgroundQuery: handleBackgroundQuery,
  })
  const onQueryEvent = useCallback(
    (event: Parameters<typeof handleMessageFromStream>[0]) => {
      handleQueryEvent({
        event,
        setMessages,
        setResponseLength,
        setStreamMode,
        setStreamingToolUses,
        setStreamingThinking,
        onStreamingText,
        setConversationId: setConversationId as any,
        responseLengthRef,
        apiMetricsRef,
        setContextBlocked:
          feature('PROACTIVE') || feature('KAIROS')
            ? (blocked: boolean) => proactiveModule?.setContextBlocked(blocked)
            : undefined,
      })
    },
    [
      setMessages,
      setResponseLength,
      setStreamMode,
      setStreamingToolUses,
      setStreamingThinking,
      onStreamingText,
      setConversationId,
    ],
  )
  const onQueryImpl = useCallback(
    async (
      messagesIncludingNewMessages: MessageType[],
      newMessages: MessageType[],
      abortController: AbortController,
      shouldQuery: boolean,
      additionalAllowedTools: string[],
      mainLoopModelParam: string,
      effort?: EffortValue,
    ) => {
      await handleQueryImpl({
        messagesIncludingNewMessages,
        newMessages,
        abortController,
        shouldQuery,
        additionalAllowedTools,
        mainLoopModelParam,
        effort,
        store,
        setMessages,
        setAbortController,
        setAppState,
        setConversationId: setConversationId as any,
        setHaikuTitle,
        getToolUseContext,
        onQueryEvent,
        canUseTool,
        onTurnComplete,
        resetLoadingState,
        messagesRef,
        haikuTitleAttemptedRef,
        loadingStartTimeRef,
        apiMetricsRef,
        terminalFocusRef,
        initialMcpClients,
        mainThreadAgentDefinition,
        customSystemPrompt,
        appendSystemPrompt,
        titleDisabled,
        sessionTitle,
        agentTitle,
        toolPermissionContext: toolPermissionContext as any,
        proactiveModule: feature('PROACTIVE') || feature('KAIROS') ? proactiveModule : undefined,
        getCoordinatorUserContext,
      })
    },
    [
      initialMcpClients,
      resetLoadingState,
      getToolUseContext,
      toolPermissionContext,
      setAppState,
      customSystemPrompt,
      onTurnComplete,
      appendSystemPrompt,
      canUseTool,
      mainThreadAgentDefinition,
      onQueryEvent,
      sessionTitle,
      titleDisabled,
    ],
  )
  const onQuery = useCallback(
    async (
      newMessages: MessageType[],
      abortController: AbortController,
      shouldQuery: boolean,
      additionalAllowedTools: string[],
      mainLoopModelParam: string,
      onBeforeQueryCallback?: (input: string, newMessages: MessageType[]) => Promise<boolean>,
      input?: string,
      effort?: EffortValue,
    ): Promise<void> => {
      await handleQueryFn({
        newMessages,
        abortController,
        shouldQuery,
        additionalAllowedTools,
        mainLoopModelParam,
        onBeforeQueryCallback,
        input,
        effort,
        queryGuard,
        onQueryImpl,
        setMessages,
        setAppState,
        setAbortController,
        setStreamingToolUses,
        setStreamingText,
        messagesRef,
        responseLengthRef,
        apiMetricsRef,
        loadingStartTimeRef,
        totalPausedMsRef,
        swarmStartTimeRef,
        swarmBudgetInfoRef,
        skipIdleCheckRef,
        inputValueRef,
        sendBridgeResultRef,
        restoreMessageSyncRef,
        store,
        resetTimingRefs,
        resetLoadingState,
        mrOnBeforeQuery: mrOnBeforeQuery as any,
        mrOnTurnComplete,
        removeLastFromHistory,
        setLastQueryCompletionTime,
        proactiveActive: proactiveActive as any,
      })
    },
    [onQueryImpl, setAppState, resetLoadingState, queryGuard, mrOnBeforeQuery, mrOnTurnComplete],
  )

  return {
    onQuery,
    handleBackgroundSession,
  }
}
