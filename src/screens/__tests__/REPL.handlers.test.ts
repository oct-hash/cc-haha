import { beforeEach, describe, expect, it, vi } from 'bun:test'

// ── Mock dependencies used by handlers.ts ───────────────────────────────
vi.mock('../../utils/messages.js', () => ({
  handleMessageFromStream: vi.fn(),
  isCompactBoundaryMessage: vi.fn(() => false),
  isEphemeralToolProgress: vi.fn(() => false),
  getMessagesAfterCompactBoundary: vi.fn(() => []),
  createUserMessage: vi.fn(),
  createCommandInputMessage: vi.fn(),
  createApiMetricsMessage: vi.fn(),
  createTurnDurationMessage: vi.fn(),
  formatCommandInputTags: vi.fn(),
  getContentText: vi.fn((content: any) => {
    if (Array.isArray(content)) {
      return content.find((c: any) => c.type === 'text')?.text ?? null
    }
    return typeof content === 'string' ? content : null
  }),
}))

vi.mock('../../utils/fullscreen.js', () => ({
  isFullscreenEnvEnabled: vi.fn(() => false),
}))

vi.mock('../../utils/sessionStorage.js', () => ({
  removeTranscriptMessage: vi.fn(),
  isLoggableMessage: vi.fn(() => true),
}))

vi.mock('../../bootstrap/state.js', () => ({
  getBudgetContinuationCount: vi.fn(() => 0),
  getCurrentTurnTokenBudget: vi.fn(() => null),
  getTotalInputTokens: vi.fn(() => 0),
  getTurnClassifierCount: vi.fn(() => 0),
  getTurnClassifierDurationMs: vi.fn(() => 0),
  getTurnHookCount: vi.fn(() => 0),
  getTurnHookDurationMs: vi.fn(() => 0),
  getTurnOutputTokens: vi.fn(() => 0),
  getTurnToolCount: vi.fn(() => 0),
  getTurnToolDurationMs: vi.fn(() => 0),
  resetTurnClassifierDuration: vi.fn(),
  resetTurnHookDuration: vi.fn(),
  resetTurnToolDuration: vi.fn(),
  snapshotOutputTokensForTurn: vi.fn(),
}))

vi.mock('../../utils/messageQueueManager.js', () => ({
  enqueue: vi.fn(),
  getCommandQueueLength: vi.fn(() => 0),
  removeByFilter: vi.fn(() => []),
}))

vi.mock('../../services/analytics/index.js', () => ({
  logEvent: vi.fn(),
}))

vi.mock('../../utils/queryProfiler.js', () => ({
  logQueryProfileReport: vi.fn(),
  queryCheckpoint: vi.fn(),
}))

vi.mock('../../utils/agentSwarmsEnabled.js', () => ({
  isAgentSwarmsEnabled: vi.fn(() => false),
}))

vi.mock('../../utils/tokenBudget.js', () => ({
  parseTokenBudget: vi.fn(() => null),
}))

vi.mock('../../utils/teammate.js', () => ({
  getAgentName: vi.fn(() => null),
  getTeamName: vi.fn(() => null),
}))

vi.mock('../../utils/swarm/teamHelpers.js', () => ({
  setMemberActive: vi.fn(),
}))

vi.mock('../../tasks/InProcessTeammateTask/InProcessTeammateTask.js', () => ({
  getAllInProcessTeammateTasks: vi.fn(() => []),
  injectUserMessageToTeammate: vi.fn(),
}))

vi.mock('../../utils/permissions/bypassPermissionsKillswitch.js', () => ({
  checkAndDisableAutoModeIfNeeded: vi.fn(),
  checkAndDisableBypassPermissionsIfNeeded: vi.fn(),
  resetAutoModeGateCheck: vi.fn(),
  resetBypassPermissionsCheck: vi.fn(),
  useKickOffCheckAndDisableAutoModeIfNeeded: vi.fn(),
  useKickOffCheckAndDisableBypassPermissionsIfNeeded: vi.fn(),
}))

// Minimal mocks for modules that handlers.ts imports but tests don't exercise
vi.mock('../../utils/teleport/api.js', () => ({}))
vi.mock('../../utils/debug.js', () => ({ logForDebugging: vi.fn() }))
vi.mock('../../utils/editor.js', () => ({}))
vi.mock('../../utils/permissions/filesystem.js', () => ({
  getScratchpadDir: vi.fn(),
  isScratchpadEnabled: vi.fn(),
}))
vi.mock('../../utils/abortController.js', () => ({
  createAbortController: vi.fn(() => new AbortController()),
}))
vi.mock('../../utils/array.js', () => ({ count: vi.fn(() => 0) }))
vi.mock('../../utils/config.js', () => ({
  getGlobalConfig: vi.fn(() => ({})),
  getGlobalConfigWriteCount: vi.fn(() => 0),
}))
vi.mock('../../history.js', () => ({
  addToHistory: vi.fn(),
  expandPastedTextRefs: vi.fn(),
  parseReferences: vi.fn(),
}))
vi.mock('../../context.js', () => ({
  getSystemContext: vi.fn(() => ({})),
  getUserContext: vi.fn(() => ({})),
}))
vi.mock('../../constants/prompts.js', () => ({
  getSystemPrompt: vi.fn(() => ''),
}))
vi.mock('../../utils/systemPrompt.js', () => ({
  buildEffectiveSystemPrompt: vi.fn(() => ''),
}))
vi.mock('../../projectOnboardingState.js', () => ({
  maybeMarkProjectOnboardingComplete: vi.fn(),
}))
vi.mock('../../services/diagnosticTracking.js', () => ({
  diagnosticTracker: { handleQueryStart: vi.fn() },
}))
vi.mock('../../hooks/useMergedClients.js', () => ({
  mergeClients: vi.fn(() => []),
}))
vi.mock('../../utils/ide.js', () => ({
  closeOpenDiffs: vi.fn(),
  getConnectedIdeClient: vi.fn(() => null),
}))
vi.mock('../../utils/sessionTitle.js', () => ({
  generateSessionTitle: vi.fn(() => Promise.resolve('Test Title')),
}))
vi.mock('../../tasks/LocalAgentTask/LocalAgentTask.js', () => ({
  appendMessageToLocalAgent: vi.fn(),
  isLocalAgentTask: vi.fn(() => false),
  queuePendingMessage: vi.fn(),
}))
vi.mock('../../tasks/LocalMainSessionTask.js', () => ({
  startBackgroundSession: vi.fn(),
}))
vi.mock('../../tools/AgentTool/resumeAgent.js', () => ({
  resumeAgentBackground: vi.fn(),
}))
vi.mock('../../tools/AgentTool/loadAgentsDir.js', () => ({}))
vi.mock('../../utils/promptCategory.js', () => ({
  getQuerySourceForREPL: vi.fn(() => 'repl'),
}))
vi.mock('../../utils/attachments.js', () => ({
  createAttachmentMessage: vi.fn(),
  getQueuedCommandAttachments: vi.fn(() => []),
}))
vi.mock('../../services/analytics/growthbook.js', () => ({
  getFeatureValue_CACHED_MAY_BE_STALE: vi.fn(),
}))
vi.mock('../../query.js', () => ({
  query: vi.fn(() => (async function* () {})()),
}))
vi.mock('../../services/compact/microCompact.js', () => ({
  resetMicrocompactState: vi.fn(),
}))
vi.mock('../../utils/telemetry/sessionTracing.js', () => ({
  endInteractionSpan: vi.fn(),
}))
vi.mock('../../buddy/observer.js', () => ({
  fireCompanionObserver: vi.fn(),
}))
vi.mock('../../constants/xml.js', () => ({
  BASH_INPUT_TAG: 'bash-input',
  COMMAND_MESSAGE_TAG: 'command-message',
  COMMAND_NAME_TAG: 'command-name',
  LOCAL_COMMAND_STDOUT_TAG: 'local-command-stdout',
}))
vi.mock('../../commands.js', () => ({
  getCommandName: vi.fn((c: any) => c?.name ?? 'unknown'),
  isCommandEnabled: vi.fn(() => true),
}))
vi.mock('../../utils/xml.js', () => ({
  escapeXml: vi.fn((s: string) => s),
}))
vi.mock('../../utils/errors.js', () => ({
  errorMessage: vi.fn((e: unknown) => String(e)),
}))
vi.mock('../../components/PromptInput/inputModes.js', () => ({
  prependModeCharacterToInput: vi.fn(),
}))
vi.mock('../../components/MessageSelector.js', () => ({
  messagesAfterAreOnlySynthetic: vi.fn(() => false),
  selectableUserMessagesFilter: vi.fn(() => false),
}))
vi.mock('./REPL.utils.js', () => ({
  median: vi.fn((arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }),
  EMPTY_MCP_CLIENTS: [],
  HISTORY_STUB: {},
}))
vi.mock('../../utils/suggestions/shellHistoryCompletion.js', () => ({
  prependToShellHistoryCache: vi.fn(),
}))
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => '00000000-0000-0000-0000-000000000000'),
}))

import { logEvent } from '../../services/analytics/index.js'
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'
import { enqueue } from '../../utils/messageQueueManager.js'
// ── Imports after all mocks ──────────────────────────────────────────────
import { handleMessageFromStream } from '../../utils/messages.js'
import { handleQuery, handleQueryEvent, handleQueryImpl } from '../REPL.handlers.js'

function createMockRef<T>(current: T): { current: T } {
  return { current }
}

// ── handleQueryEvent tests ──────────────────────────────────────────────

describe('handleQueryEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls handleMessageFromStream with the event', () => {
    const setMessages = vi.fn()
    const setResponseLength = vi.fn()
    const setStreamMode = vi.fn()
    const setStreamingToolUses = vi.fn()
    const setStreamingThinking = vi.fn()
    const onStreamingText = vi.fn()
    const setConversationId = vi.fn()
    const responseLengthRef = createMockRef(0)
    const apiMetricsRef = createMockRef<any[]>([])
    const event = { type: 'assistant' as const, message: { content: 'hello' } }

    handleQueryEvent({
      event: event as any,
      setMessages: setMessages as any,
      setResponseLength: setResponseLength as any,
      setStreamMode,
      setStreamingToolUses,
      setStreamingThinking,
      onStreamingText: onStreamingText as any,
      setConversationId,
      responseLengthRef,
      apiMetricsRef,
    })

    expect(handleMessageFromStream).toHaveBeenCalledTimes(1)
    expect((handleMessageFromStream as any).mock.calls[0][0]).toBe(event)
  })

  it('wires setContextBlocked callback when provided', () => {
    const setMessages = vi.fn()
    const setResponseLength = vi.fn()
    const setStreamMode = vi.fn()
    const setStreamingToolUses = vi.fn()
    const setStreamingThinking = vi.fn()
    const onStreamingText = vi.fn()
    const setConversationId = vi.fn()
    const setContextBlocked = vi.fn()
    const responseLengthRef = createMockRef(0)
    const apiMetricsRef = createMockRef<any[]>([])
    const event = { type: 'assistant' as const, message: { content: 'hello' } }

    handleQueryEvent({
      event: event as any,
      setMessages: setMessages as any,
      setResponseLength: setResponseLength as any,
      setStreamMode,
      setStreamingToolUses,
      setStreamingThinking,
      onStreamingText: onStreamingText as any,
      setConversationId,
      responseLengthRef,
      apiMetricsRef,
      setContextBlocked,
    })

    // arg[1] = onNewMessage callback
    const newMessageCallback = (handleMessageFromStream as any).mock.calls[0][1]
    newMessageCallback({ type: 'assistant', isApiErrorMessage: true })
    expect(setContextBlocked).toHaveBeenCalledWith(true)

    newMessageCallback({ type: 'assistant' })
    expect(setContextBlocked).toHaveBeenCalledWith(false)
  })

  it('passes response length updater to handleMessageFromStream', () => {
    const setResponseLength = vi.fn()
    const setMessages = vi.fn()
    const setStreamMode = vi.fn()
    const setStreamingToolUses = vi.fn()
    const setStreamingThinking = vi.fn()
    const onStreamingText = vi.fn()
    const setConversationId = vi.fn()
    const responseLengthRef = createMockRef(0)
    const apiMetricsRef = createMockRef<any[]>([])
    const event = { type: 'assistant' as const, message: {} }

    handleQueryEvent({
      event: event as any,
      setMessages: setMessages as any,
      setResponseLength: setResponseLength as any,
      setStreamMode,
      setStreamingToolUses,
      setStreamingThinking,
      onStreamingText: onStreamingText as any,
      setConversationId,
      responseLengthRef,
      apiMetricsRef,
    })

    // arg[2] = onContent callback
    const onContentCallback = (handleMessageFromStream as any).mock.calls[0][2]
    setResponseLength.mockImplementation((fn: any) => fn(0))
    onContentCallback({ length: 5 })
    expect(setResponseLength).toHaveBeenCalled()
  })

  it('wires tombstoned message removal callback', () => {
    const setMessages = vi.fn()
    const setResponseLength = vi.fn()
    const setStreamMode = vi.fn()
    const setStreamingToolUses = vi.fn()
    const setStreamingThinking = vi.fn()
    const onStreamingText = vi.fn()
    const setConversationId = vi.fn()
    const responseLengthRef = createMockRef(0)
    const apiMetricsRef = createMockRef<any[]>([])
    const event = { type: 'assistant' as const, message: {} }

    handleQueryEvent({
      event: event as any,
      setMessages: setMessages as any,
      setResponseLength: setResponseLength as any,
      setStreamMode,
      setStreamingToolUses,
      setStreamingThinking,
      onStreamingText: onStreamingText as any,
      setConversationId,
      responseLengthRef,
      apiMetricsRef,
    })

    // arg[5] = onTombstone callback
    const tombstoneCallback = (handleMessageFromStream as any).mock.calls[0][5]
    const tombstonedMsg = { uuid: 'test-uuid', type: 'user' }
    setMessages.mockImplementation((fn: any) =>
      fn([tombstonedMsg, { uuid: 'other', type: 'assistant' }]),
    )
    tombstoneCallback(tombstonedMsg)
    expect(setMessages).toHaveBeenCalled()
  })

  it('passes streaming thinking and stream mode to handleMessageFromStream', () => {
    const setStreamingThinking = vi.fn()
    const setStreamMode = vi.fn()
    const setMessages = vi.fn()
    const setResponseLength = vi.fn()
    const setStreamingToolUses = vi.fn()
    const onStreamingText = vi.fn()
    const setConversationId = vi.fn()
    const responseLengthRef = createMockRef(0)
    const apiMetricsRef = createMockRef<any[]>([])
    const event = { type: 'assistant' as const, message: {} }

    handleQueryEvent({
      event: event as any,
      setMessages: setMessages as any,
      setResponseLength: setResponseLength as any,
      setStreamMode,
      setStreamingToolUses,
      setStreamingThinking,
      onStreamingText: onStreamingText as any,
      setConversationId,
      responseLengthRef,
      apiMetricsRef,
    })

    const call = (handleMessageFromStream as any).mock.calls[0]
    // arg[3] = setStreamMode, arg[6] = setStreamingThinking
    expect(call[3]).toBe(setStreamMode)
    expect(call[6]).toBe(setStreamingThinking)
  })

  it('wires metrics callback that pushes to apiMetricsRef', () => {
    const setMessages = vi.fn()
    const setResponseLength = vi.fn()
    const setStreamMode = vi.fn()
    const setStreamingToolUses = vi.fn()
    const setStreamingThinking = vi.fn()
    const onStreamingText = vi.fn()
    const setConversationId = vi.fn()
    const responseLengthRef = createMockRef(100)
    const apiMetricsRef = createMockRef<any[]>([])
    const event = { type: 'assistant' as const, message: {} }

    handleQueryEvent({
      event: event as any,
      setMessages: setMessages as any,
      setResponseLength: setResponseLength as any,
      setStreamMode,
      setStreamingToolUses,
      setStreamingThinking,
      onStreamingText: onStreamingText as any,
      setConversationId,
      responseLengthRef,
      apiMetricsRef,
    })

    // arg[7] = onMetrics callback
    const metricsCallback = (handleMessageFromStream as any).mock.calls[0][7]
    metricsCallback({ ttftMs: 42 })
    expect(apiMetricsRef.current.length).toBe(1)
    expect(apiMetricsRef.current[0].ttftMs).toBe(42)
    expect(apiMetricsRef.current[0].responseLengthBaseline).toBe(100)
    expect(apiMetricsRef.current[0].endResponseLength).toBe(100)
  })
})

// ── handleQuery tests ───────────────────────────────────────────────────

describe('handleQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createBasicParams(overrides: Record<string, any> = {}) {
    return {
      newMessages: [],
      abortController: new AbortController(),
      shouldQuery: true,
      additionalAllowedTools: [],
      mainLoopModelParam: 'test-model',
      queryGuard: {
        tryStart: () => 1,
        end: () => false,
        isActive: false,
      } as any,
      onQueryImpl: vi.fn(() => Promise.resolve()),
      setMessages: vi.fn(),
      setAppState: vi.fn(),
      setAbortController: vi.fn(),
      setStreamingToolUses: vi.fn(),
      setStreamingText: vi.fn(),
      messagesRef: createMockRef([]),
      responseLengthRef: createMockRef(0),
      apiMetricsRef: createMockRef([]),
      loadingStartTimeRef: createMockRef(Date.now()),
      totalPausedMsRef: createMockRef(0),
      swarmStartTimeRef: createMockRef(null),
      swarmBudgetInfoRef: createMockRef(undefined),
      skipIdleCheckRef: createMockRef(false),
      inputValueRef: createMockRef(''),
      sendBridgeResultRef: createMockRef(vi.fn()),
      restoreMessageSyncRef: createMockRef(vi.fn()),
      store: {
        getState: () => ({ tasks: {}, viewingAgentTaskId: undefined }),
        setState: vi.fn(),
      },
      resetTimingRefs: vi.fn(),
      resetLoadingState: vi.fn(),
      mrOnBeforeQuery: vi.fn(() => Promise.resolve()),
      mrOnTurnComplete: vi.fn(() => Promise.resolve()),
      removeLastFromHistory: vi.fn(),
      setLastQueryCompletionTime: vi.fn(),
      proactiveActive: false,
      ...overrides,
    }
  }

  it('returns early when queryGuard rejects (concurrent query)', async () => {
    const params = createBasicParams({
      queryGuard: {
        tryStart: () => null,
        end: () => false,
        isActive: false,
      } as any,
      newMessages: [
        {
          type: 'user',
          message: { role: 'user', content: [{ type: 'text', text: 'test' }] },
          isMeta: false,
        },
      ],
    })

    await handleQuery(params as any)

    expect(params.onQueryImpl).not.toHaveBeenCalled()
  })

  it('enqueues user messages when concurrent query is detected', async () => {
    const params = createBasicParams({
      queryGuard: {
        tryStart: () => null,
        end: () => false,
        isActive: false,
      } as any,
      newMessages: [
        {
          type: 'user',
          message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
          isMeta: false,
        },
      ],
    })

    await handleQuery(params as any)

    expect(enqueue).toHaveBeenCalledWith({ value: expect.any(String), mode: 'prompt' })
    expect(logEvent).toHaveBeenCalledWith('tengu_concurrent_onquery_detected', {})
  })

  it('resets timing refs and sets messages when query starts', async () => {
    const params = createBasicParams({
      newMessages: [{ type: 'user', message: { role: 'user', content: 'hello' }, uuid: 'msg-1' }],
    })

    await handleQuery(params as any)

    expect(params.resetTimingRefs).toHaveBeenCalled()
    expect(params.setMessages).toHaveBeenCalled()
    expect(params.setStreamingToolUses).toHaveBeenCalledWith([])
    expect(params.setStreamingText).toHaveBeenCalledWith(null)
    expect(params.onQueryImpl).toHaveBeenCalled()
  })

  it('calls mrOnBeforeQuery when input is provided', async () => {
    const params = createBasicParams({
      input: 'test input',
      newMessages: [{ type: 'user', message: { role: 'user', content: 'hello' } }],
    })

    await handleQuery(params as any)

    expect(params.mrOnBeforeQuery).toHaveBeenCalledWith('test input', expect.any(Array), 1)
  })

  it('skips mrOnBeforeQuery when input is not provided', async () => {
    const params = createBasicParams({
      input: undefined,
      newMessages: [{ type: 'user', message: { role: 'user', content: 'hello' } }],
    })

    await handleQuery(params as any)

    expect(params.mrOnBeforeQuery).not.toHaveBeenCalled()
  })

  it('calls onBeforeQueryCallback and returns early when it returns false', async () => {
    const onBeforeQueryCallback = vi.fn(() => Promise.resolve(false))
    const params = createBasicParams({
      input: 'test',
      onBeforeQueryCallback,
      newMessages: [{ type: 'user', message: { role: 'user', content: 'hello' } }],
    })

    await handleQuery(params as any)

    expect(onBeforeQueryCallback).toHaveBeenCalled()
    expect(params.onQueryImpl).not.toHaveBeenCalled()
  })

  it('calls onBeforeQueryCallback and proceeds when it returns true', async () => {
    const onBeforeQueryCallback = vi.fn(() => Promise.resolve(true))
    const params = createBasicParams({
      input: 'test',
      onBeforeQueryCallback,
      newMessages: [{ type: 'user', message: { role: 'user', content: 'hello' } }],
    })

    await handleQuery(params as any)

    expect(onBeforeQueryCallback).toHaveBeenCalled()
    expect(params.onQueryImpl).toHaveBeenCalled()
  })

  it('calls mrOnTurnComplete and resets state when queryGuard.end returns true', async () => {
    const params = createBasicParams({
      queryGuard: {
        tryStart: () => 1,
        end: () => true,
        isActive: false,
      } as any,
    })

    await handleQuery(params as any)

    expect(params.mrOnTurnComplete).toHaveBeenCalled()
    expect(params.setLastQueryCompletionTime).toHaveBeenCalled()
    expect(params.resetLoadingState).toHaveBeenCalled()
    expect(params.setAbortController).toHaveBeenCalledWith(null)
  })

  it('skips post-query logic when queryGuard.end returns false', async () => {
    const params = createBasicParams({
      queryGuard: {
        tryStart: () => 1,
        end: () => false,
        isActive: false,
      } as any,
    })

    await handleQuery(params as any)

    expect(params.mrOnTurnComplete).not.toHaveBeenCalled()
    expect(params.setLastQueryCompletionTime).not.toHaveBeenCalled()
  })

  it('activates swarm member when agent swarms are enabled', async () => {
    ;(isAgentSwarmsEnabled as any).mockReturnValue(true)
    const { getAgentName, getTeamName } = await import('../../utils/teammate.js')
    const { setMemberActive } = await import('../../utils/swarm/teamHelpers.js')
    ;(getTeamName as any).mockReturnValue('test-team')
    ;(getAgentName as any).mockReturnValue('test-agent')

    const params = createBasicParams()
    await handleQuery(params as any)

    expect(setMemberActive).toHaveBeenCalledWith('test-team', 'test-agent', true)
  })
})

// ── handleQueryImpl tests ────────────────────────────────────────────────

describe('handleQueryImpl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createBasicParams(overrides: Record<string, any> = {}) {
    return {
      messagesIncludingNewMessages: [],
      newMessages: [],
      abortController: new AbortController(),
      shouldQuery: true,
      additionalAllowedTools: [],
      mainLoopModelParam: 'test-model',
      store: {
        getState: () => ({
          mcp: { clients: [] },
          toolPermissionContext: { alwaysAllowRules: { command: [] } },
          fastMode: false,
        }),
        setState: vi.fn(),
      },
      setMessages: vi.fn(),
      setAbortController: vi.fn(),
      setAppState: vi.fn(),
      setConversationId: vi.fn(),
      setHaikuTitle: vi.fn(),
      getToolUseContext: vi.fn(() => ({
        options: {
          tools: [],
          mcpClients: [],
          systemPrompt: '',
          userContext: {},
          abortController: new AbortController(),
          shouldSend: true,
          verbose: false,
        },
        renderedSystemPrompt: '',
      })),
      onQueryEvent: vi.fn(),
      canUseTool: vi.fn(),
      onTurnComplete: vi.fn(() => Promise.resolve()),
      resetLoadingState: vi.fn(),
      messagesRef: createMockRef([]),
      haikuTitleAttemptedRef: createMockRef(false),
      loadingStartTimeRef: createMockRef(Date.now()),
      apiMetricsRef: createMockRef([]),
      terminalFocusRef: createMockRef({}),
      initialMcpClients: [],
      mainThreadAgentDefinition: undefined,
      customSystemPrompt: undefined,
      appendSystemPrompt: undefined,
      titleDisabled: false,
      sessionTitle: undefined,
      agentTitle: undefined,
      toolPermissionContext: {
        additionalWorkingDirectories: new Map(),
        alwaysAllowRules: { command: [] },
      },
      proactiveModule: undefined,
      getCoordinatorUserContext: vi.fn(() => ({})),
      ...overrides,
    }
  }

  it('resets loading state when shouldQuery is false', async () => {
    const params = createBasicParams({ shouldQuery: false })

    await handleQueryImpl(params as any)

    expect(params.resetLoadingState).toHaveBeenCalled()
  })

  it('sets conversation ID when compact boundary message present and shouldQuery is false', async () => {
    const { isCompactBoundaryMessage } = await import('../../utils/messages.js')
    ;(isCompactBoundaryMessage as any).mockReturnValue(true)

    const params = createBasicParams({
      shouldQuery: false,
      newMessages: [{ type: 'user', message: { role: 'user', content: 'test' }, uuid: 'm1' }],
    })

    await handleQueryImpl(params as any)

    expect(params.setConversationId).toHaveBeenCalled()
  })

  it('skips title generation when title is disabled', async () => {
    const params = createBasicParams({
      titleDisabled: true,
      newMessages: [{ type: 'user', message: { role: 'user', content: 'hello' }, isMeta: false }],
    })

    await handleQueryImpl(params as any)

    expect(params.haikuTitleAttemptedRef.current).toBe(false)
  })

  it('skips title generation when sessionTitle already exists', async () => {
    const params = createBasicParams({
      sessionTitle: 'Existing Title',
      newMessages: [{ type: 'user', message: { role: 'user', content: 'hello' }, isMeta: false }],
    })

    await handleQueryImpl(params as any)

    expect(params.haikuTitleAttemptedRef.current).toBe(false)
  })

  it('sets haikuTitleAttempted flag for first user message', async () => {
    const params = createBasicParams({
      newMessages: [
        {
          type: 'user',
          message: { role: 'user', content: [{ type: 'text', text: 'hello world' }] },
          isMeta: false,
        },
      ],
    })

    await handleQueryImpl(params as any)

    expect(params.haikuTitleAttemptedRef.current).toBe(true)
  })

  it('skips title for meta messages', async () => {
    const params = createBasicParams({
      newMessages: [{ type: 'user', message: { role: 'user', content: 'test' }, isMeta: true }],
    })

    await handleQueryImpl(params as any)

    expect(params.haikuTitleAttemptedRef.current).toBe(false)
  })

  it('resets loading state and abort controller when shouldQuery is false', async () => {
    const params = createBasicParams({ shouldQuery: false })

    await handleQueryImpl(params as any)

    expect(params.resetLoadingState).toHaveBeenCalled()
    expect(params.setAbortController).toHaveBeenCalledWith(null)
  })

  it('calls query with expected messages when shouldQuery is true', async () => {
    const { query } = await import('../../query.js')
    const messages = [{ type: 'user', message: { role: 'user', content: 'hello' }, uuid: 'm1' }]
    const params = createBasicParams({
      shouldQuery: true,
      messagesIncludingNewMessages: messages,
    })

    await handleQueryImpl(params as any)

    expect(query).toHaveBeenCalledTimes(1)
    const queryParams = (query as any).mock.calls[0][0]
    expect(queryParams.messages).toBe(messages)
  })

  it('resets abort controller when shouldQuery is false', async () => {
    const params = createBasicParams({ shouldQuery: false })

    await handleQueryImpl(params as any)

    expect(params.setAbortController).toHaveBeenCalledWith(null)
  })
})
