// Extracted from REPL.handlers.ts — query domain

import { feature } from 'bun:bundle'
import { randomUUID } from 'crypto'
import type { RefObject } from 'react'
import { logEvent } from 'src/services/analytics/index.js'
import {
  getBudgetContinuationCount,
  getCurrentTurnTokenBudget,
  getTurnClassifierCount,
  getTurnClassifierDurationMs,
  getTurnHookCount,
  getTurnHookDurationMs,
  getTurnOutputTokens,
  getTurnToolCount,
  getTurnToolDurationMs,
  resetTurnClassifierDuration,
  resetTurnHookDuration,
  resetTurnToolDuration,
  snapshotOutputTokensForTurn,
} from '../bootstrap/state.js'
import { fireCompanionObserver } from '../buddy/observer.js'
import {
  messagesAfterAreOnlySynthetic,
  selectableUserMessagesFilter,
} from '../components/MessageSelector.js'
import { getSystemPrompt } from '../constants/prompts.js'
import {
  BASH_INPUT_TAG,
  COMMAND_MESSAGE_TAG,
  COMMAND_NAME_TAG,
  LOCAL_COMMAND_STDOUT_TAG,
} from '../constants/xml.js'
import { getSystemContext, getUserContext } from '../context.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import { mergeClients } from '../hooks/useMergedClients.js'
import { maybeMarkProjectOnboardingComplete } from '../projectOnboardingState.js'
import { query } from '../query.js'
import { getSessionManager } from '../services/agents/session-manager.js'
import type { AgentKind } from '../services/agents/types.js'
import { diagnosticTracker } from '../services/diagnosticTracking.js'
import { getAllInProcessTeammateTasks } from '../tasks/InProcessTeammateTask/InProcessTeammateTask.js'
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import type { Message as MessageType, UserMessage } from '../types/message.js'
import { isAgentSwarmsEnabled } from '../utils/agentSwarmsEnabled.js'
import { count } from '../utils/array.js'
import { getGlobalConfigWriteCount } from '../utils/config.js'
import type { EffortValue } from '../utils/effort.js'
import { closeOpenDiffs, getConnectedIdeClient } from '../utils/ide.js'
import { enqueue, getCommandQueueLength, type SetAppState } from '../utils/messageQueueManager.js'
import {
  createApiMetricsMessage,
  createTurnDurationMessage,
  getContentText,
  isCompactBoundaryMessage,
  type StreamingToolUse,
} from '../utils/messages.js'
import {
  checkAndDisableAutoModeIfNeeded,
  checkAndDisableBypassPermissionsIfNeeded,
} from '../utils/permissions/bypassPermissionsKillswitch.js'
import { getScratchpadDir, isScratchpadEnabled } from '../utils/permissions/filesystem.js'
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'
import { getQuerySourceForREPL } from '../utils/promptCategory.js'
import type { QueryGuard } from '../utils/QueryGuard.js'
import { logQueryProfileReport, queryCheckpoint } from '../utils/queryProfiler.js'
import { isLoggableMessage } from '../utils/sessionStorage.js'
import { generateSessionTitle } from '../utils/sessionTitle.js'
import { setMemberActive } from '../utils/swarm/teamHelpers.js'
import { buildEffectiveSystemPrompt } from '../utils/systemPrompt.js'
import { getAgentName, getTeamName } from '../utils/teammate.js'
import { parseTokenBudget } from '../utils/tokenBudget.js'
import { bridgeAdapterStream, type QueryEvent } from './REPL.handlers.stream.js'
import { median } from './REPL.utils.js'

export interface HandleQueryImplParams {
  messagesIncludingNewMessages: MessageType[]
  newMessages: MessageType[]
  abortController: AbortController
  shouldQuery: boolean
  additionalAllowedTools: string[]
  mainLoopModelParam: string
  effort: EffortValue | undefined
  store: {
    getState: () => any
    setState: (updater: (prev: any) => any) => void
  }
  setMessages: (updater: (prev: MessageType[]) => MessageType[]) => void
  setAbortController: (controller: AbortController | null) => void
  setAppState: SetAppState
  setConversationId: (value: string | ((prev: string) => string)) => void
  setHaikuTitle: (title: string) => void
  getToolUseContext: (
    messages: MessageType[],
    newMessages: MessageType[],
    abortController: AbortController,
    mainLoopModel: string,
  ) => ProcessUserInputContext
  onQueryEvent: (event: QueryEvent) => void
  canUseTool: CanUseToolFn
  onTurnComplete: ((messages: MessageType[]) => void | Promise<void>) | undefined
  resetLoadingState: () => void
  messagesRef: RefObject<MessageType[]>
  haikuTitleAttemptedRef: RefObject<boolean>
  loadingStartTimeRef: RefObject<number>
  apiMetricsRef: RefObject<
    {
      ttftMs: number
      firstTokenTime: number
      lastTokenTime: number
      responseLengthBaseline: number
      endResponseLength: number
    }[]
  >
  terminalFocusRef: RefObject<boolean>
  initialMcpClients: readonly { name: string }[] | undefined
  mainThreadAgentDefinition: AgentDefinition | undefined
  customSystemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  titleDisabled: boolean
  sessionTitle: string | undefined
  agentTitle: string | undefined
  toolPermissionContext: {
    additionalWorkingDirectories: Map<string, unknown>
    alwaysAllowRules: { command: string[] | null }
    mode: string
  }
  proactiveModule:
    | {
        isProactiveActive: () => boolean
        setContextBlocked: (v: boolean) => void
      }
    | undefined
  getCoordinatorUserContext: (
    mcpClients: readonly { name: string }[],
    scratchpadDir?: string,
  ) => Record<string, string>
}

export async function handleQueryImpl(params: HandleQueryImplParams): Promise<void> {
  const {
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
    setConversationId,
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
    toolPermissionContext,
    proactiveModule,
    getCoordinatorUserContext,
  } = params

  if (shouldQuery) {
    const freshClients = mergeClients(initialMcpClients, store.getState().mcp.clients)
    void diagnosticTracker.handleQueryStart(freshClients)
    const ideClient = getConnectedIdeClient(freshClients)
    if (ideClient) {
      void closeOpenDiffs(ideClient)
    }
  }

  void maybeMarkProjectOnboardingComplete()

  if (!titleDisabled && !sessionTitle && !agentTitle && !haikuTitleAttemptedRef.current) {
    const firstUserMessage = newMessages.find((m) => m.type === 'user' && !m.isMeta)
    const text =
      firstUserMessage?.type === 'user' ? getContentText(firstUserMessage.message.content) : null
    if (
      text &&
      !text.startsWith(`<${LOCAL_COMMAND_STDOUT_TAG}>`) &&
      !text.startsWith(`<${COMMAND_MESSAGE_TAG}>`) &&
      !text.startsWith(`<${COMMAND_NAME_TAG}>`) &&
      !text.startsWith(`<${BASH_INPUT_TAG}>`)
    ) {
      haikuTitleAttemptedRef.current = true
      void generateSessionTitle(text, new AbortController().signal).then(
        (title) => {
          if (title) setHaikuTitle(title)
          else haikuTitleAttemptedRef.current = false
        },
        () => {
          haikuTitleAttemptedRef.current = false
        },
      )
    }
  }

  store.setState((prev: any) => {
    const cur = prev.toolPermissionContext.alwaysAllowRules.command
    if (
      cur === additionalAllowedTools ||
      (cur?.length === additionalAllowedTools.length &&
        cur.every((v: any, i: number) => v === additionalAllowedTools[i]))
    ) {
      return prev
    }
    return {
      ...prev,
      toolPermissionContext: {
        ...prev.toolPermissionContext,
        alwaysAllowRules: {
          ...prev.toolPermissionContext.alwaysAllowRules,
          command: additionalAllowedTools,
        },
      },
    }
  })

  if (!shouldQuery) {
    if (newMessages.some(isCompactBoundaryMessage)) {
      setConversationId(randomUUID())
      proactiveModule?.setContextBlocked(false)
    }
    resetLoadingState()
    setAbortController(null)
    return
  }
  const toolUseContext = getToolUseContext(
    messagesIncludingNewMessages,
    newMessages,
    abortController,
    mainLoopModelParam,
  )
  const { tools: freshTools, mcpClients: freshMcpClients } = toolUseContext.options

  if (effort !== undefined) {
    const previousGetAppState = toolUseContext.getAppState
    toolUseContext.getAppState = () => ({
      ...previousGetAppState(),
      effortValue: effort,
    })
  }
  queryCheckpoint('query_context_loading_start')
  const [, , defaultSystemPrompt, baseUserContext, systemContext] = await Promise.all([
    checkAndDisableBypassPermissionsIfNeeded(toolPermissionContext as any, setAppState),
    feature('TRANSCRIPT_CLASSIFIER')
      ? checkAndDisableAutoModeIfNeeded(
          toolPermissionContext as any,
          setAppState,
          store.getState().fastMode,
        )
      : undefined,
    getSystemPrompt(
      freshTools,
      mainLoopModelParam,
      Array.from(toolPermissionContext.additionalWorkingDirectories.keys()),
      freshMcpClients,
    ),
    getUserContext(),
    getSystemContext(),
  ])
  const userContext = {
    ...baseUserContext,
    ...getCoordinatorUserContext(
      freshMcpClients,
      isScratchpadEnabled() ? getScratchpadDir() : undefined,
    ),
    ...(proactiveModule?.isProactiveActive() && !terminalFocusRef.current
      ? {
          terminalFocus: 'The terminal is unfocused \u2014 the user is not actively watching.',
        }
      : {}),
  }
  queryCheckpoint('query_context_loading_end')
  const systemPrompt = buildEffectiveSystemPrompt({
    mainThreadAgentDefinition,
    toolUseContext,
    customSystemPrompt,
    defaultSystemPrompt,
    appendSystemPrompt,
  })
  toolUseContext.renderedSystemPrompt = systemPrompt
  queryCheckpoint('query_query_start')
  resetTurnHookDuration()
  resetTurnToolDuration()
  resetTurnClassifierDuration()
  const agentKind =
    (process.env.CLAUDE_CODE_AGENT_KIND as AgentKind | undefined) ??
    getSessionManager().getActiveKind()
  if (agentKind && agentKind !== 'claude-haha') {
    // Use external agent backend (claude-code or codex CLI)
    const lastUserMsg = [...messagesIncludingNewMessages].reverse().find((m) => m.type === 'user')
    const userText =
      lastUserMsg?.type === 'user' ? (getContentText(lastUserMsg.message.content) ?? '') : ''
    if (userText) {
      await bridgeAdapterStream(agentKind, userText, abortController, onQueryEvent)
    }
  } else {
    for await (const event of query({
      messages: messagesIncludingNewMessages,
      systemPrompt,
      userContext,
      systemContext,
      canUseTool,
      toolUseContext,
      querySource: getQuerySourceForREPL(),
    })) {
      onQueryEvent(event)
    }
  }
  void fireCompanionObserver(messagesRef.current, (reaction) =>
    setAppState((prev: any) =>
      prev.companionReaction === reaction
        ? prev
        : {
            ...prev,
            companionReaction: reaction,
          },
    ),
  )
  queryCheckpoint('query_end')

  if (process.env.USER_TYPE === 'ant' && apiMetricsRef.current.length > 0) {
    const entries = apiMetricsRef.current
    const ttfts = entries.map((e) => e.ttftMs)
    const otpsValues = entries.map((e) => {
      const delta = Math.round((e.endResponseLength - e.responseLengthBaseline) / 4)
      const samplingMs = e.lastTokenTime - e.firstTokenTime
      return samplingMs > 0 ? Math.round(delta / (samplingMs / 1000)) : 0
    })
    const isMultiRequest = entries.length > 1
    const hookMs = getTurnHookDurationMs()
    const hookCount = getTurnHookCount()
    const toolMs = getTurnToolDurationMs()
    const toolCount = getTurnToolCount()
    const classifierMs = getTurnClassifierDurationMs()
    const classifierCount = getTurnClassifierCount()
    const turnMs = Date.now() - loadingStartTimeRef.current
    setMessages((prev) => [
      ...prev,
      createApiMetricsMessage({
        ttftMs: isMultiRequest ? median(ttfts) : ttfts[0]!,
        otps: isMultiRequest ? median(otpsValues) : otpsValues[0]!,
        isP50: isMultiRequest,
        hookDurationMs: hookMs > 0 ? hookMs : undefined,
        hookCount: hookCount > 0 ? hookCount : undefined,
        turnDurationMs: turnMs > 0 ? turnMs : undefined,
        toolDurationMs: toolMs > 0 ? toolMs : undefined,
        toolCount: toolCount > 0 ? toolCount : undefined,
        classifierDurationMs: classifierMs > 0 ? classifierMs : undefined,
        classifierCount: classifierCount > 0 ? classifierCount : undefined,
        configWriteCount: getGlobalConfigWriteCount(),
      }),
    ])
  }
  resetLoadingState()

  logQueryProfileReport()

  await onTurnComplete?.(messagesRef.current)
}

export interface HandleQueryParams {
  newMessages: MessageType[]
  abortController: AbortController
  shouldQuery: boolean
  additionalAllowedTools: string[]
  mainLoopModelParam: string
  onBeforeQueryCallback?: (input: string, newMessages: MessageType[]) => Promise<boolean>
  input?: string
  effort?: EffortValue
  queryGuard: QueryGuard
  onQueryImpl: (
    messagesIncludingNewMessages: MessageType[],
    newMessages: MessageType[],
    abortController: AbortController,
    shouldQuery: boolean,
    additionalAllowedTools: string[],
    mainLoopModelParam: string,
    effort?: EffortValue,
  ) => Promise<void>
  setMessages: (updater: (prev: MessageType[]) => MessageType[]) => void
  setAppState: SetAppState
  setAbortController: (controller: AbortController | null) => void
  setStreamingToolUses: (uses: StreamingToolUse[]) => void
  setStreamingText: (text: string | null) => void
  messagesRef: RefObject<MessageType[]>
  responseLengthRef: RefObject<number>
  apiMetricsRef: RefObject<
    {
      ttftMs: number
      firstTokenTime: number
      lastTokenTime: number
      responseLengthBaseline: number
      endResponseLength: number
    }[]
  >
  loadingStartTimeRef: RefObject<number>
  totalPausedMsRef: RefObject<number>
  swarmStartTimeRef: RefObject<number | null>
  swarmBudgetInfoRef: RefObject<
    | {
        tokens: number
        limit: number
        nudges: number
      }
    | undefined
  >
  skipIdleCheckRef: RefObject<boolean>
  inputValueRef: RefObject<string>
  sendBridgeResultRef: RefObject<() => void>
  restoreMessageSyncRef: RefObject<(message: UserMessage) => void>
  store: {
    getState: () => any
    setState: (updater: (prev: any) => any) => void
  }
  resetTimingRefs: () => void
  resetLoadingState: () => void
  mrOnBeforeQuery: (input: string, messages: MessageType[], newCount: number) => Promise<void>
  mrOnTurnComplete: (messages: MessageType[], wasAborted: boolean) => Promise<void>
  removeLastFromHistory: () => void
  setLastQueryCompletionTime: (time: number) => void
  proactiveActive: boolean
}

export async function handleQuery(params: HandleQueryParams): Promise<void> {
  const {
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
    mrOnBeforeQuery,
    mrOnTurnComplete,
    removeLastFromHistory,
    setLastQueryCompletionTime,
    proactiveActive,
  } = params

  if (isAgentSwarmsEnabled()) {
    const teamName = getTeamName()
    const agentName = getAgentName()
    if (teamName && agentName) {
      void setMemberActive(teamName, agentName, true)
    }
  }

  const thisGeneration = queryGuard.tryStart()
  if (thisGeneration === null) {
    logEvent('tengu_concurrent_onquery_detected', {})

    newMessages
      .filter((m): m is UserMessage => m.type === 'user' && !m.isMeta)
      .map((_) => getContentText(_.message.content))
      .filter((_) => _ !== null)
      .forEach((msg, i) => {
        enqueue({
          value: msg,
          mode: 'prompt',
        })
        if (i === 0) {
          logEvent('tengu_concurrent_onquery_enqueued', {})
        }
      })
    return
  }
  try {
    resetTimingRefs()
    setMessages((oldMessages) => [...oldMessages, ...newMessages])
    responseLengthRef.current = 0
    if (feature('TOKEN_BUDGET')) {
      const parsedBudget = input ? parseTokenBudget(input) : null
      snapshotOutputTokensForTurn(parsedBudget ?? getCurrentTurnTokenBudget())
    }
    apiMetricsRef.current = []
    setStreamingToolUses([])
    setStreamingText(null)

    const latestMessages = messagesRef.current
    if (input) {
      await mrOnBeforeQuery(input, latestMessages, newMessages.length)
    }

    if (onBeforeQueryCallback && input) {
      const shouldProceed = await onBeforeQueryCallback(input, latestMessages)
      if (!shouldProceed) {
        return
      }
    }
    await onQueryImpl(
      latestMessages,
      newMessages,
      abortController,
      shouldQuery,
      additionalAllowedTools,
      mainLoopModelParam,
      effort,
    )
  } finally {
    if (queryGuard.end(thisGeneration)) {
      setLastQueryCompletionTime(Date.now())
      skipIdleCheckRef.current = false
      resetLoadingState()
      await mrOnTurnComplete(messagesRef.current, abortController.signal.aborted)

      sendBridgeResultRef.current()

      if (process.env.USER_TYPE === 'ant' && !abortController.signal.aborted) {
        setAppState((prev: any) => {
          if (prev.tungstenActiveSession === undefined) return prev
          if (prev.tungstenPanelAutoHidden === true) return prev
          return {
            ...prev,
            tungstenPanelAutoHidden: true,
          }
        })
      }

      let budgetInfo:
        | {
            tokens: number
            limit: number
            nudges: number
          }
        | undefined
      if (feature('TOKEN_BUDGET')) {
        if (
          getCurrentTurnTokenBudget() !== null &&
          getCurrentTurnTokenBudget()! > 0 &&
          !abortController.signal.aborted
        ) {
          budgetInfo = {
            tokens: getTurnOutputTokens(),
            limit: getCurrentTurnTokenBudget()!,
            nudges: getBudgetContinuationCount(),
          }
        }
        snapshotOutputTokensForTurn(null)
      }

      const turnDurationMs = Date.now() - loadingStartTimeRef.current - totalPausedMsRef.current
      if (
        (turnDurationMs > 30000 || budgetInfo !== undefined) &&
        !abortController.signal.aborted &&
        !proactiveActive
      ) {
        const hasRunningSwarmAgents = getAllInProcessTeammateTasks(store.getState().tasks).some(
          (t) => t.status === 'running',
        )
        if (hasRunningSwarmAgents) {
          if (swarmStartTimeRef.current === null) {
            swarmStartTimeRef.current = loadingStartTimeRef.current
          }
          if (budgetInfo) {
            swarmBudgetInfoRef.current = budgetInfo
          }
        } else {
          setMessages((prev) => [
            ...prev,
            createTurnDurationMessage(turnDurationMs, budgetInfo, count(prev, isLoggableMessage)),
          ])
        }
      }
      setAbortController(null)
    }

    if (
      abortController.signal.reason === 'user-cancel' &&
      !queryGuard.isActive &&
      inputValueRef.current === '' &&
      getCommandQueueLength() === 0 &&
      !store.getState().viewingAgentTaskId
    ) {
      const msgs = messagesRef.current
      const lastUserMsg = msgs.findLast(selectableUserMessagesFilter)
      if (lastUserMsg) {
        const idx = msgs.lastIndexOf(lastUserMsg)
        if (messagesAfterAreOnlySynthetic(msgs, idx)) {
          removeLastFromHistory()
          restoreMessageSyncRef.current(lastUserMsg)
        }
      }
    }
  }
}
