import { beforeEach, describe, expect, it, vi } from 'bun:test'

// ── Mock dependencies used by handlers.ts ───────────────────────────────
vi.mock('../../utils/messages.js', () => ({
  handleMessageFromStream: vi.fn(),
  isCompactBoundaryMessage: vi.fn(() => false),
  isEphemeralToolProgress: vi.fn(() => false),
  getMessagesAfterCompactBoundary: vi.fn(() => []),
  createUserMessage: vi.fn((data: any) => ({
    type: 'user' as const,
    message: data,
    content: data.content,
  })),
  createCommandInputMessage: vi.fn((content: string) => ({
    type: 'command_input' as const,
    content,
  })),
  createApiMetricsMessage: vi.fn(),
  createTurnDurationMessage: vi.fn(),
  formatCommandInputTags: vi.fn((name: string, args: string) => `${name} ${args}`),
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
  expandPastedTextRefs: vi.fn((input: string) => input),
  parseReferences: vi.fn(() => []),
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
  resumeAgentBackground: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../tools/AgentTool/loadAgentsDir.js', () => ({}))
vi.mock('../../utils/promptCategory.js', () => ({
  getQuerySourceForREPL: vi.fn(() => 'repl'),
}))
vi.mock('../../utils/attachments.js', () => ({
  createAttachmentMessage: vi.fn((att: any) => ({
    type: 'attachment' as const,
    attachment: {
      type: 'queued_command' as const,
      commandMode: 'task-notification' as const,
      prompt: att.prompt,
    },
  })),
  getQueuedCommandAttachments: vi.fn(() => Promise.resolve([])),
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
import {
  handleAgentSubmit,
  handleBackgroundQuery,
  handleQuery,
  handleQueryEvent,
  handleQueryImpl,
  tryHandleImmediateCommand,
} from '../REPL.handlers.js'

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

// ── tryHandleImmediateCommand tests ───────────────────────────────────────

describe('tryHandleImmediateCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createImmediateParams(overrides: Record<string, any> = {}) {
    return {
      input: '/test-cmd arg1',
      helpers: {
        setCursorOffset: vi.fn(),
        clearBuffer: vi.fn(),
        resetHistory: vi.fn(),
      } as any,
      commands: [
        {
          name: 'test-cmd',
          type: 'local-jsx' as const,
          immediate: true,
          load: vi.fn(() =>
            Promise.resolve({
              call: vi.fn(() => Promise.resolve(null)),
            }),
          ),
        },
      ],
      queryGuard: { isActive: true, tryStart: vi.fn(), end: vi.fn() } as any,
      pastedContents: {},
      inputValueRef: createMockRef('/test-cmd arg1'),
      stashedPrompt: undefined,
      messagesRef: createMockRef([]),
      mainLoopModel: 'test-model',
      setInputValue: vi.fn(),
      setPastedContents: vi.fn(),
      setStashedPrompt: vi.fn(),
      setToolJSX: vi.fn(),
      setMessages: vi.fn(),
      addNotification: vi.fn(),
      getToolUseContext: vi.fn(() => ({
        options: { tools: [], mcpClients: [], systemPrompt: '', userContext: {} },
        renderedSystemPrompt: '',
      })),
      idleHintShownRef: createMockRef(false),
      lastQueryCompletionTimeRef: createMockRef(0),
      options: undefined,
      ...overrides,
    }
  }

  it('returns false when no matching command is found', async () => {
    const params = createImmediateParams({
      commands: [],
    })

    const result = await tryHandleImmediateCommand(params as any)

    expect(result).toBe(false)
  })

  it('returns false when queryGuard is not active', async () => {
    const params = createImmediateParams({
      queryGuard: { isActive: false, tryStart: vi.fn(), end: vi.fn() } as any,
    })

    const result = await tryHandleImmediateCommand(params as any)

    expect(result).toBe(false)
  })

  it('returns false when command is not marked as immediate', async () => {
    const params = createImmediateParams({
      commands: [{ name: 'test-cmd', type: 'local-jsx' as const, immediate: false }],
    })

    const result = await tryHandleImmediateCommand(params as any)

    expect(result).toBe(false)
  })

  it('treats command as immediate when triggered from keybinding', async () => {
    const loadFn = vi.fn(() => Promise.resolve({ call: vi.fn(() => Promise.resolve(null)) }))
    const params = createImmediateParams({
      commands: [{ name: 'test-cmd', type: 'local-jsx' as const, immediate: false, load: loadFn }],
      options: { fromKeybinding: true },
    })

    const result = await tryHandleImmediateCommand(params as any)

    expect(result).toBe(true)
    expect(loadFn).toHaveBeenCalled()
  })

  it('logs idle return event when clear command is used with idleHintShown', async () => {
    const loadFn = vi.fn(() => Promise.resolve({ call: vi.fn((onDone: any) => onDone('cleared')) }))
    const params = createImmediateParams({
      input: '/clear',
      commands: [{ name: 'clear', type: 'local-jsx' as const, immediate: true, load: loadFn }],
      idleHintShownRef: createMockRef(true),
      lastQueryCompletionTimeRef: createMockRef(Date.now() - 120_000),
    })

    await tryHandleImmediateCommand(params as any)

    expect(logEvent).toHaveBeenCalledWith(
      'tengu_idle_return_action',
      expect.objectContaining({
        action: 'hint_converted',
      }),
    )
    expect(params.idleHintShownRef.current).toBe(false)
  })

  it('clears input when submitted text matches current input value', async () => {
    const params = createImmediateParams({
      input: '/test-cmd arg1',
      inputValueRef: createMockRef('/test-cmd arg1'),
    })

    await tryHandleImmediateCommand(params as any)

    expect(params.setInputValue).toHaveBeenCalledWith('')
    expect(params.helpers.setCursorOffset).toHaveBeenCalledWith(0)
    expect(params.helpers.clearBuffer).toHaveBeenCalled()
    expect(params.setPastedContents).toHaveBeenCalledWith({})
  })

  it('does NOT clear input when submitted text differs from current input (keybinding scenario)', async () => {
    const params = createImmediateParams({
      input: '/test-cmd',
      inputValueRef: createMockRef('user was typing something'),
    })

    await tryHandleImmediateCommand(params as any)

    expect(params.setInputValue).not.toHaveBeenCalled()
  })

  it('executes command and renders JSX when onDone is not called synchronously', async () => {
    const mockJsx = { type: 'div' }
    const callFn = vi.fn((_onDone: any) => {
      // Don't call onDone — returns JSX instead
      return mockJsx
    })
    const loadFn = vi.fn(() => Promise.resolve({ call: callFn }))
    const params = createImmediateParams({
      commands: [{ name: 'test-cmd', type: 'local-jsx' as const, immediate: true, load: loadFn }],
    })

    await tryHandleImmediateCommand(params as any)

    // executeImmediateCommand is void-invoked — wait for async inner function
    await new Promise((r) => setTimeout(r, 10))

    expect(loadFn).toHaveBeenCalled()
    expect(callFn).toHaveBeenCalled()
    expect(params.setToolJSX).toHaveBeenCalledWith({
      jsx: mockJsx,
      shouldHidePromptInput: false,
      isLocalJSXCommand: true,
    })
  })

  it('skips JSX rendering when onDone was already called', async () => {
    const callFn = vi.fn((onDone: any) => {
      onDone('result text')
      return { type: 'div' }
    })
    const loadFn = vi.fn(() => Promise.resolve({ call: callFn }))
    const params = createImmediateParams({
      commands: [{ name: 'test-cmd', type: 'local-jsx' as const, immediate: true, load: loadFn }],
    })

    await tryHandleImmediateCommand(params as any)

    // setToolJSX is called to clear (by onDone), but NOT to set JSX
    expect(params.setToolJSX).toHaveBeenCalledTimes(1)
    expect(params.setToolJSX).toHaveBeenCalledWith({
      jsx: null,
      shouldHidePromptInput: false,
      clearLocalJSX: true,
    })
  })

  it('onDone restores stashed prompt after command completes', async () => {
    const stashedPrompt = {
      text: 'stashed',
      cursorOffset: 5,
      pastedContents: { 0: { type: 'text' as const, content: 'pasted' } },
    }
    const callFn = vi.fn((onDone: any) => {
      onDone('done')
    })
    const loadFn = vi.fn(() => Promise.resolve({ call: callFn }))
    const params = createImmediateParams({
      commands: [{ name: 'test-cmd', type: 'local-jsx' as const, immediate: true, load: loadFn }],
      stashedPrompt,
    })

    await tryHandleImmediateCommand(params as any)

    expect(params.setInputValue).toHaveBeenCalledWith('stashed')
    expect(params.helpers.setCursorOffset).toHaveBeenCalledWith(5)
    expect(params.setPastedContents).toHaveBeenCalledWith({
      0: { type: 'text', content: 'pasted' },
    })
    expect(params.setStashedPrompt).toHaveBeenCalledWith(undefined)
  })

  it('onDone skips notification when display is skip', async () => {
    const callFn = vi.fn((onDone: any) => {
      onDone('result', { display: 'skip' })
    })
    const loadFn = vi.fn(() => Promise.resolve({ call: callFn }))
    const params = createImmediateParams({
      commands: [{ name: 'test-cmd', type: 'local-jsx' as const, immediate: true, load: loadFn }],
    })

    await tryHandleImmediateCommand(params as any)

    expect(params.addNotification).not.toHaveBeenCalled()
  })

  it('onDone injects meta messages into transcript', async () => {
    const callFn = vi.fn((onDone: any) => {
      onDone('result', { metaMessages: ['meta msg 1', 'meta msg 2'] })
    })
    const loadFn = vi.fn(() => Promise.resolve({ call: callFn }))
    const params = createImmediateParams({
      commands: [{ name: 'test-cmd', type: 'local-jsx' as const, immediate: true, load: loadFn }],
    })

    await tryHandleImmediateCommand(params as any)

    const setMessagesCall = params.setMessages.mock.calls[0][0]
    const prev: any[] = []
    const updated = typeof setMessagesCall === 'function' ? setMessagesCall(prev) : setMessagesCall
    expect(updated.length).toBe(4) // 2 command messages + 2 meta messages
  })

  it('returns false when matching command type is not local-jsx', async () => {
    const params = createImmediateParams({
      commands: [{ name: 'test-cmd', type: 'local' as any, immediate: true }],
    })

    const result = await tryHandleImmediateCommand(params as any)

    expect(result).toBe(false)
  })
})

// ── handleBackgroundQuery tests ────────────────────────────────────────────

describe('handleBackgroundQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createBgParams(overrides: Record<string, any> = {}) {
    return {
      abortController: new AbortController(),
      messagesRef: createMockRef([]),
      mainLoopModel: 'test-model',
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
      additionalWorkingDirectories: [],
      mainThreadAgentDefinition: undefined,
      customSystemPrompt: undefined,
      appendSystemPrompt: undefined,
      canUseTool: vi.fn(),
      setAppState: vi.fn(),
      terminalTitle: 'Test Session',
      ...overrides,
    }
  }

  it('aborts existing abortController with background reason', async () => {
    const ctrl = new AbortController()
    const abortSpy = vi.spyOn(ctrl, 'abort')
    const params = createBgParams({ abortController: ctrl })

    await handleBackgroundQuery(params as any)

    expect(abortSpy).toHaveBeenCalledWith('background')
  })

  it('handles null abortController without error', async () => {
    const params = createBgParams({ abortController: null })

    await handleBackgroundQuery(params as any)
    // Should not throw
  })

  it('removes task-notification messages from queue', async () => {
    const { removeByFilter } = await import('../../utils/messageQueueManager.js')
    const params = createBgParams()

    await handleBackgroundQuery(params as any)

    expect(removeByFilter).toHaveBeenCalled()
    const filterFn = (removeByFilter as any).mock.calls[0][0]
    expect(filterFn({ mode: 'task-notification' })).toBe(true)
    expect(filterFn({ mode: 'prompt' })).toBe(false)
  })

  it('fetches system prompt, user context, and system context', async () => {
    const { getSystemPrompt } = await import('../../constants/prompts.js')
    const { getUserContext, getSystemContext } = await import('../../context.js')
    const params = createBgParams()

    await handleBackgroundQuery(params as any)

    expect(getSystemPrompt).toHaveBeenCalled()
    expect(getUserContext).toHaveBeenCalled()
    expect(getSystemContext).toHaveBeenCalled()
  })

  it('calls buildEffectiveSystemPrompt with correct params', async () => {
    const { buildEffectiveSystemPrompt } = await import('../../utils/systemPrompt.js')
    const params = createBgParams()

    await handleBackgroundQuery(params as any)

    expect(buildEffectiveSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        mainThreadAgentDefinition: undefined,
        customSystemPrompt: undefined,
        appendSystemPrompt: undefined,
      }),
    )
  })

  it('calls startBackgroundSession with messages and query params', async () => {
    const { startBackgroundSession } = await import('../../tasks/LocalMainSessionTask.js')
    const params = createBgParams()

    await handleBackgroundQuery(params as any)

    expect(startBackgroundSession).toHaveBeenCalledTimes(1)
    const callArgs = (startBackgroundSession as any).mock.calls[0][0]
    expect(callArgs.messages).toEqual([])
    expect(callArgs.queryParams).toBeDefined()
    expect(callArgs.description).toBe('Test Session')
    expect(callArgs.agentDefinition).toBeUndefined()
  })

  it('deduplicates notification attachments against existing messages', async () => {
    const { createAttachmentMessage, getQueuedCommandAttachments } = await import(
      '../../utils/attachments.js'
    )
    const { startBackgroundSession } = await import('../../tasks/LocalMainSessionTask.js')
    ;(getQueuedCommandAttachments as any).mockResolvedValue([
      { prompt: 'task-1', other: 'data' },
      { prompt: 'task-2', other: 'data' },
    ])
    ;(createAttachmentMessage as any).mockImplementation((att: any) => ({
      type: 'attachment' as const,
      attachment: {
        type: 'queued_command' as const,
        commandMode: 'task-notification',
        prompt: att.prompt,
      },
    }))

    const params = createBgParams({
      messagesRef: createMockRef([
        {
          type: 'attachment' as const,
          attachment: {
            type: 'queued_command' as const,
            commandMode: 'task-notification',
            prompt: 'task-1',
          },
        },
      ]),
    })

    await handleBackgroundQuery(params as any)

    const callArgs = (startBackgroundSession as any).mock.calls[0][0]
    // messages = existing (task-1) + unique notifications (task-2 only)
    const attachmentMessages = callArgs.messages.filter((m: any) => m.type === 'attachment')
    expect(attachmentMessages.length).toBe(2)
    const prompts = attachmentMessages.map((m: any) => m.attachment.prompt)
    expect(prompts).toContain('task-1') // from messagesRef
    expect(prompts).toContain('task-2') // new unique notification
  })

  it('handles getQueuedCommandAttachments error gracefully', async () => {
    const { getQueuedCommandAttachments } = await import('../../utils/attachments.js')
    ;(getQueuedCommandAttachments as any).mockRejectedValue(new Error('fetch failed'))

    const params = createBgParams()

    await expect(handleBackgroundQuery(params as any)).resolves.toBeUndefined()
  })
})

// ── handleAgentSubmit tests ────────────────────────────────────────────────

describe('handleAgentSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createAgentSubmitParams(overrides: Record<string, any> = {}) {
    return {
      input: 'test message',
      task: {
        id: 'agent-1',
        status: 'running',
        type: 'local',
      },
      helpers: {
        setCursorOffset: vi.fn(),
        clearBuffer: vi.fn(),
        resetHistory: vi.fn(),
      } as any,
      setAppState: vi.fn(),
      setInputValue: vi.fn(),
      getToolUseContext: vi.fn(() => ({
        options: { tools: [], mcpClients: [], systemPrompt: '', userContext: {} },
        renderedSystemPrompt: '',
      })),
      canUseTool: vi.fn(),
      mainLoopModel: 'test-model',
      messagesRef: createMockRef([]),
      onResumeFailed: vi.fn(),
      ...overrides,
    }
  }

  it('appends message and queues pending when local task is running', async () => {
    const { appendMessageToLocalAgent, queuePendingMessage, isLocalAgentTask } = await import(
      '../../tasks/LocalAgentTask/LocalAgentTask.js'
    )
    ;(isLocalAgentTask as any).mockReturnValue(true)

    const params = createAgentSubmitParams({
      task: { id: 'agent-1', status: 'running', type: 'local' },
    })

    await handleAgentSubmit(params as any)

    expect(appendMessageToLocalAgent).toHaveBeenCalledWith(
      'agent-1',
      expect.any(Object),
      params.setAppState,
    )
    expect(queuePendingMessage).toHaveBeenCalledWith('agent-1', 'test message', params.setAppState)
  })

  it('resumes agent in background when local task is stopped', async () => {
    const { appendMessageToLocalAgent, isLocalAgentTask } = await import(
      '../../tasks/LocalAgentTask/LocalAgentTask.js'
    )
    const { resumeAgentBackground } = await import('../../tools/AgentTool/resumeAgent.js')
    ;(isLocalAgentTask as any).mockReturnValue(true)

    const params = createAgentSubmitParams({
      task: { id: 'agent-1', status: 'stopped', type: 'local' },
    })

    await handleAgentSubmit(params as any)

    expect(appendMessageToLocalAgent).toHaveBeenCalled()
    expect(resumeAgentBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        prompt: 'test message',
      }),
    )
  })

  it('calls onResumeFailed when resumeAgentBackground throws', async () => {
    const { isLocalAgentTask } = await import('../../tasks/LocalAgentTask/LocalAgentTask.js')
    const { resumeAgentBackground } = await import('../../tools/AgentTool/resumeAgent.js')
    ;(isLocalAgentTask as any).mockReturnValue(true)
    ;(resumeAgentBackground as any).mockRejectedValue(new Error('resume failed'))

    const params = createAgentSubmitParams({
      task: { id: 'agent-1', status: 'stopped', type: 'local' },
    })

    await handleAgentSubmit(params as any)

    // The .catch() handler is a microtask — flush with a short delay
    await new Promise((r) => setTimeout(r, 10))

    expect(params.onResumeFailed).toHaveBeenCalledWith('agent-1', 'Error: resume failed')
  })

  it('calls injectUserMessageToTeammate for non-local tasks', async () => {
    const { injectUserMessageToTeammate } = await import(
      '../../tasks/InProcessTeammateTask/InProcessTeammateTask.js'
    )
    const { isLocalAgentTask } = await import('../../tasks/LocalAgentTask/LocalAgentTask.js')
    ;(isLocalAgentTask as any).mockReturnValue(false)

    const params = createAgentSubmitParams({
      task: { id: 'swarm-agent-1', status: 'running', type: 'swarm' },
    })

    await handleAgentSubmit(params as any)

    expect(injectUserMessageToTeammate).toHaveBeenCalledWith(
      'swarm-agent-1',
      'test message',
      params.setAppState,
    )
  })

  it('clears input after submission', async () => {
    const { isLocalAgentTask } = await import('../../tasks/LocalAgentTask/LocalAgentTask.js')
    ;(isLocalAgentTask as any).mockReturnValue(true)

    const params = createAgentSubmitParams()

    await handleAgentSubmit(params as any)

    expect(params.setInputValue).toHaveBeenCalledWith('')
    expect(params.helpers.setCursorOffset).toHaveBeenCalledWith(0)
    expect(params.helpers.clearBuffer).toHaveBeenCalled()
  })
})
