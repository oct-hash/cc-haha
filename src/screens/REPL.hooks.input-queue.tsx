// Extracted from REPL.tsx — input-queue execution, incoming-prompt handling,
// and the onSubmit submit pipeline.
// useREPLInputQueue owns hasCountedQueueUseRef, executeQueuedInput,
// handleIncomingPrompt, and onSubmit. All externally captured values are
// passed via UseREPLInputQueueParams; only module-scope handler/component
// imports are resolved here directly.

import { feature } from 'bun:bundle'
import * as React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { getOriginalCwd } from '../bootstrap/state.js'
import type { Command } from '../commands.js'
import type { SpinnerMode } from '../components/Spinner.js'
import type { Notification } from '../context/notifications.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type { IDESelection } from '../hooks/useIdeSelection.js'
import {
  type ActiveSpeculationState,
  handleSpeculationAccept,
} from '../services/PromptSuggestion/speculation.js'
import type { AppStateStore } from '../state/AppState.js'
import type { SetToolJSXFn } from '../Tool.js'
import type { PromptInputMode, QueuedCommand } from '../types/textInputTypes.js'
import type { Message as MessageType } from '../types/message.js'
import { createAbortController } from '../utils/abortController.js'
import { incrementPromptCount } from '../utils/commitAttribution.js'
import type { PastedContent } from '../utils/config.js'
import { saveGlobalConfig } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import type { FileStateCache } from '../utils/fileStateCache.js'
import { handlePromptSubmit, type PromptInputHelpers } from '../utils/handlePromptSubmit.js'
import { getCommandQueue, type SetAppState } from '../utils/messageQueueManager.js'
import { createUserMessage } from '../utils/messages.js'
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'
import { getQuerySourceForREPL } from '../utils/promptCategory.js'
import type { QueryGuard } from '../utils/QueryGuard.js'
import { recordAttributionSnapshot } from '../utils/sessionStorage.js'
import type { RemoteMessageContent } from '../utils/teleport/api.js'
import {
  applySubmitStateReset,
  handleRemoteSubmit,
  resolveStashAfterSubmit,
  resolveStashBeforeSubmit,
  tryAddToHistory,
  tryHandleIdleReturnCheck,
  tryHandleImmediateCommand,
  tryHandleTaskDoneTrigger,
} from './REPL.handlers.js'

type ProactiveModule = {
  isProactiveActive: () => boolean
  setContextBlocked: (v: boolean) => void
  resumeProactive: () => void
}

// Local alias so the TS2322 at the tryHandleTaskDoneTrigger /
// tryHandleImmediateCommand call sites keeps the exact pre-extraction error
// message ("Type 'AddNotificationFn' is not assignable to ..."). The REPL.tsx
// source value is typed AddNotificationFn (from useNotifications); typing this
// param inline as `(content: Notification) => void` would reword the error and
// trip the normalized error-set comparison.
type AddNotificationFn = (content: Notification) => void

export interface UseREPLInputQueueParams {
  // From useREPLFoundation
  setAppState: SetAppState
  store: AppStateStore
  addNotification: AddNotificationFn
  commands: Command[]
  mainLoopModel: string
  ideSelection: IDESelection | undefined
  setIDESelection: React.Dispatch<React.SetStateAction<IDESelection | undefined>>
  queuedCommands: readonly QueuedCommand[]
  // Module-scope conditional-require value kept in REPL.tsx, passed in.
  proactiveModule: ProactiveModule | undefined
  // From useREPLStreamState
  queryGuard: QueryGuard
  isLoading: boolean
  isExternalLoading: boolean
  abortController: AbortController | null
  setAbortController: (controller: AbortController | null) => void
  setToolJSX: SetToolJSXFn
  streamModeRef: React.MutableRefObject<SpinnerMode>
  resetTimingRefs: () => void
  // From useREPLMessages
  messages: MessageType[]
  messagesRef: React.MutableRefObject<MessageType[]>
  setMessages: (updater: React.SetStateAction<MessageType[]>) => void
  // Typed as RefObject (not MutableRefObject) to preserve the exact baseline
  // error message at the tryHandleImmediateCommand call site — the REPL.tsx
  // source value's inferred MutableRefObject<string | false> is assignable to
  // this, and the comparison normalizes on the message text.
  idleHintShownRef: React.RefObject<string | false>
  setUserInputOnProcessing: (input: string | undefined) => void
  // From useREPLScrollInput
  repinScroll: () => void
  awaitPendingHooks: () => Promise<void>
  setInputValue: (value: string) => void
  inputValueRef: React.MutableRefObject<string>
  inputMode: PromptInputMode
  setInputMode: (mode: PromptInputMode) => void
  stashedPrompt:
    | { text: string; cursorOffset: number; pastedContents: Record<number, PastedContent> }
    | undefined
  setStashedPrompt: React.Dispatch<
    React.SetStateAction<
      | { text: string; cursorOffset: number; pastedContents: Record<number, PastedContent> }
      | undefined
    >
  >
  pastedContents: Record<number, PastedContent>
  setPastedContents: React.Dispatch<React.SetStateAction<Record<number, PastedContent>>>
  activeRemote: {
    isRemoteMode: boolean
    sendMessage: (content: RemoteMessageContent, opts?: { uuid?: string }) => Promise<boolean>
  }
  setSubmitCount: React.Dispatch<React.SetStateAction<number>>
  hasInterruptibleToolInProgressRef: React.MutableRefObject<boolean>
  // remoteSession only appears in onSubmit's dep array (never read in the
  // body), so it's typed unknown here to keep the dep list verbatim.
  remoteSession: unknown
  // From useREPLUiState
  setIdleReturnPending: React.Dispatch<
    React.SetStateAction<{ input: string; idleMinutes: number } | null>
  >
  skipIdleCheckRef: React.MutableRefObject<boolean>
  lastQueryCompletionTimeRef: React.MutableRefObject<number>
  // From useREPLIdleReset
  tipPickedThisTurnRef: React.MutableRefObject<boolean>
  // Component-local
  readFileState: React.MutableRefObject<FileStateCache>
  // Props
  onBeforeQuery?: (input: string, newMessages: MessageType[]) => Promise<boolean>
  // From useREPLToolContext
  canUseTool: CanUseToolFn
  getToolUseContext: (
    messages: MessageType[],
    newMessages: MessageType[],
    abortController: AbortController,
    mainLoopModel: string,
  ) => ProcessUserInputContext
  // From useREPLQueryCallbacks
  onQuery: (
    newMessages: MessageType[],
    abortController: AbortController,
    shouldQuery: boolean,
    additionalAllowedTools: string[],
    mainLoopModelParam: string,
  ) => Promise<void>
}

export function useREPLInputQueue(params: UseREPLInputQueueParams) {
  const {
    setAppState,
    store,
    addNotification,
    commands,
    mainLoopModel,
    ideSelection,
    setIDESelection,
    queuedCommands,
    proactiveModule,
    queryGuard,
    isLoading,
    isExternalLoading,
    abortController,
    setAbortController,
    setToolJSX,
    streamModeRef,
    resetTimingRefs,
    messages,
    messagesRef,
    setMessages,
    idleHintShownRef,
    setUserInputOnProcessing,
    repinScroll,
    awaitPendingHooks,
    setInputValue,
    inputValueRef,
    inputMode,
    setInputMode,
    stashedPrompt,
    setStashedPrompt,
    pastedContents,
    setPastedContents,
    activeRemote,
    setSubmitCount,
    hasInterruptibleToolInProgressRef,
    remoteSession,
    setIdleReturnPending,
    skipIdleCheckRef,
    lastQueryCompletionTimeRef,
    tipPickedThisTurnRef,
    readFileState,
    onBeforeQuery,
    canUseTool,
    getToolUseContext,
    onQuery,
  } = params

  const onSubmit = useCallback(
    async (
      input: string,
      helpers: PromptInputHelpers,
      speculationAccept?: {
        state: ActiveSpeculationState
        speculationSessionTimeSavedMs: number
        setAppState: SetAppState
      },
      options?: {
        fromKeybinding?: boolean
      },
    ) => {
      // Re-pin scroll to bottom on submit so the user always sees the new
      // exchange (matches OpenCode's auto-scroll behavior).
      repinScroll()

      // Resume loop mode if paused
      if (feature('PROACTIVE') || feature('KAIROS')) {
        proactiveModule?.resumeProactive()
      }

      // Task-done trigger: check for "任务完成", "done", etc.
      // Imported dynamically to avoid circular deps and enable tree-shaking.
      if (
        await tryHandleTaskDoneTrigger({
          input,
          pastedContents,
          speculationAccept,
          messagesRef,
          addNotification,
          setInputValue,
          helpers,
        })
      ) {
        return
      }

      // Handle immediate commands - these bypass the queue and execute right away
      // even while Claude is processing. Commands opt-in via `immediate: true`.
      // Commands triggered via keybindings are always treated as immediate.
      if (!speculationAccept && input.trim().startsWith('/')) {
        if (
          await tryHandleImmediateCommand({
            input,
            helpers,
            commands,
            queryGuard,
            pastedContents,
            inputValueRef,
            stashedPrompt,
            messagesRef,
            mainLoopModel,
            setInputValue,
            setPastedContents,
            setStashedPrompt,
            setToolJSX,
            setMessages,
            addNotification,
            getToolUseContext,
            idleHintShownRef,
            lastQueryCompletionTimeRef,
            options,
          })
        ) {
          return // Always return early - don't add to history or queue
        }
      }

      // Remote mode: skip empty input early before any state mutations
      if (activeRemote.isRemoteMode && !input.trim()) {
        return
      }

      // Idle-return: prompt returning users to start fresh when the
      // conversation is large and the cache is cold. tengu_willow_mode
      // controls treatment: "dialog" (blocking), "hint" (notification), "off".
      if (
        tryHandleIdleReturnCheck({
          input,
          speculationAccept,
          skipIdleCheckRef,
          lastQueryCompletionTimeRef,
          setIdleReturnPending,
          setInputValue,
          helpers,
        })
      ) {
        return
      }

      tryAddToHistory({
        fromKeybinding: options?.fromKeybinding,
        speculationAccept,
        input,
        inputMode,
        pastedContents,
      })

      const { isSlashCommand, submitsNow } = resolveStashBeforeSubmit({
        input,
        speculationAccept,
        isLoading,
        isRemoteMode: activeRemote.isRemoteMode,
        stashedPrompt,
        fromKeybinding: options?.fromKeybinding,
        setInputValue,
        setCursorOffset: helpers.setCursorOffset,
        setPastedContents,
        setStashedPrompt,
      })
      applySubmitStateReset({
        submitsNow,
        isSlashCommand,
        inputMode,
        input,
        speculationAccept,
        isRemoteMode: activeRemote.isRemoteMode,
        setInputMode: (mode: string) => setInputMode(mode as PromptInputMode),
        setIDESelection,
        setSubmitCount,
        clearBuffer: helpers.clearBuffer,
        tipPickedThisTurnRef,
        setUserInputOnProcessing,
        resetTimingRefs,
        incrementAttribution: feature('COMMIT_ATTRIBUTION')
          ? () => {
              setAppState((prev) => ({
                ...prev,
                attribution: incrementPromptCount(prev.attribution, (snapshot) => {
                  void recordAttributionSnapshot(snapshot).catch((error) => {
                    logForDebugging(`Attribution: Failed to save snapshot: ${error}`)
                  })
                }),
              }))
            }
          : undefined,
      })

      // Handle speculation acceptance
      if (speculationAccept) {
        const { queryRequired } = await handleSpeculationAccept(
          speculationAccept.state,
          speculationAccept.speculationSessionTimeSavedMs,
          speculationAccept.setAppState,
          input,
          {
            setMessages,
            readFileState,
            cwd: getOriginalCwd(),
          },
        )
        if (queryRequired) {
          const newAbortController = createAbortController()
          setAbortController(newAbortController)
          void onQuery([], newAbortController, true, [], mainLoopModel)
        }
        return
      }

      // Remote mode: send input via stream-json instead of local query.
      // local-jsx slash commands fall through to local handlePromptSubmit.
      if (
        await handleRemoteSubmit({
          input,
          isSlashCommand,
          commands,
          pastedContents,
          activeRemote,
          setMessages,
        })
      ) {
        return
      }

      // Ensure SessionStart hook context is available before the first API call.
      await awaitPendingHooks()
      await handlePromptSubmit({
        input,
        helpers,
        queryGuard,
        isExternalLoading,
        mode: inputMode,
        commands,
        onInputChange: setInputValue,
        setPastedContents,
        setToolJSX,
        getToolUseContext,
        messages: messagesRef.current,
        mainLoopModel,
        pastedContents,
        ideSelection,
        setUserInputOnProcessing,
        setAbortController,
        abortController,
        onQuery,
        setAppState,
        querySource: getQuerySourceForREPL(),
        onBeforeQuery,
        canUseTool,
        addNotification,
        setMessages,
        // Read via ref so streamMode can be dropped from onSubmit deps —
        // handlePromptSubmit only uses it for debug log + telemetry event.
        streamMode: streamModeRef.current,
        hasInterruptibleToolInProgress: hasInterruptibleToolInProgressRef.current,
      })

      resolveStashAfterSubmit({
        isSlashCommand,
        isLoading,
        stashedPrompt,
        setInputValue,
        setCursorOffset: helpers.setCursorOffset,
        setPastedContents,
        setStashedPrompt,
      })
    },
    [
      queryGuard,
      // isLoading is read at the !isLoading checks above for input-clearing
      // and submitCount gating. It's derived from isQueryActive || isExternalLoading,
      // so including it here ensures the closure captures the fresh value.
      isLoading,
      isExternalLoading,
      inputMode,
      commands,
      setInputValue,
      setInputMode,
      setPastedContents,
      setSubmitCount,
      setIDESelection,
      setToolJSX,
      getToolUseContext,
      // messages is read via messagesRef.current inside the callback to
      // keep onSubmit stable across message updates (see L2384/L2400/L2662).
      // Without this, each setMessages call (~30× per turn) recreates
      // onSubmit, pinning the REPL render scope (1776B) + that render's
      // messages array in downstream closures (PromptInput, handleAutoRunIssue).
      // Heap analysis showed ~9 REPL scopes and ~15 messages array versions
      // accumulating after #20174/#20175, all traced to this dep.
      mainLoopModel,
      pastedContents,
      ideSelection,
      setUserInputOnProcessing,
      setAbortController,
      addNotification,
      onQuery,
      stashedPrompt,
      setStashedPrompt,
      setAppState,
      onBeforeQuery,
      canUseTool,
      remoteSession,
      setMessages,
      awaitPendingHooks,
      repinScroll,
    ],
  )

  // Track prompt queue usage for analytics. Fire once per transition from
  // empty to non-empty, not on every length change -- otherwise a render loop
  // (concurrent onQuery thrashing, etc.) spams saveGlobalConfig, which hits
  // ELOCKED under concurrent sessions and falls back to unlocked writes.
  // That write storm is the primary trigger for ~/.claude.json corruption
  // (GH #3117).
  const hasCountedQueueUseRef = useRef(false)
  useEffect(() => {
    if (queuedCommands.length < 1) {
      hasCountedQueueUseRef.current = false
      return
    }
    if (hasCountedQueueUseRef.current) return
    hasCountedQueueUseRef.current = true
    saveGlobalConfig((current) => ({
      ...current,
      promptQueueUseCount: (current.promptQueueUseCount ?? 0) + 1,
    }))
  }, [queuedCommands.length])

  // Process queued commands when query completes and queue has items

  const executeQueuedInput = useCallback(
    async (queuedCommands: QueuedCommand[]) => {
      await handlePromptSubmit({
        helpers: {
          setCursorOffset: () => {},
          clearBuffer: () => {},
          resetHistory: () => {},
        },
        queryGuard,
        commands,
        onInputChange: () => {},
        setPastedContents: () => {},
        setToolJSX,
        getToolUseContext,
        messages,
        mainLoopModel,
        ideSelection,
        setUserInputOnProcessing,
        setAbortController,
        onQuery,
        setAppState,
        querySource: getQuerySourceForREPL(),
        onBeforeQuery,
        canUseTool,
        addNotification,
        setMessages,
        queuedCommands,
      })
    },
    [
      queryGuard,
      commands,
      setToolJSX,
      getToolUseContext,
      messages,
      mainLoopModel,
      ideSelection,
      setUserInputOnProcessing,
      canUseTool,
      setAbortController,
      onQuery,
      addNotification,
      setAppState,
      onBeforeQuery,
    ],
  )

  // Submits incoming prompts from teammate messages or tasks mode as new turns
  // Returns true if submission succeeded, false if a query is already running
  const handleIncomingPrompt = useCallback(
    (
      content: string,
      options?: {
        isMeta?: boolean
      },
    ): boolean => {
      if (queryGuard.isActive) return false

      // Defer to user-queued commands — user input always takes priority
      // over system messages (teammate messages, task list items, etc.)
      // Read from the module-level store at call time (not the render-time
      // snapshot) to avoid a stale closure — this callback's deps don't
      // include the queue.
      if (getCommandQueue().some((cmd) => cmd.mode === 'prompt' || cmd.mode === 'bash')) {
        return false
      }
      const newAbortController = createAbortController()
      setAbortController(newAbortController)

      // Create a user message with the formatted content (includes XML wrapper)
      const userMessage = createUserMessage({
        content,
        isMeta: options?.isMeta ? true : undefined,
      })
      void onQuery([userMessage], newAbortController, true, [], mainLoopModel)
      return true
    },
    [onQuery, mainLoopModel, store],
  )

  return {
    executeQueuedInput,
    handleIncomingPrompt,
    onSubmit,
    hasCountedQueueUseRef,
  }
}
