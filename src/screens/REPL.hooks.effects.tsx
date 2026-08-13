// Extracted from REPL.tsx — side effects and misc logic: the onInit startup
// handler, cost-summary tracker, transcript recording, after-first-render exit
// hook, queue processor, last-interaction-time + background-housekeeping
// effects, idle desktop notification, and the idle-return hint.
// useREPLEffects owns the effects block between useREPLAgentHandlers and
// useREPLInteraction. All externally captured values are passed via
// UseREPLEffectsParams; only module-scope handler/component imports are
// resolved here directly.

import type * as React from 'react'
import { useEffect } from 'react'
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import {
  getLastInteractionTime,
  getTotalInputTokens,
  updateLastInteractionTime,
} from '../bootstrap/state.js'
import { useFpsMetrics } from '../context/fpsMetrics.js'
import type { Notification } from '../context/notifications.js'
import { useCostSummary } from '../costHook.js'
import { useAfterFirstRender } from '../hooks/useAfterFirstRender.js'
import { useLogMessages } from '../hooks/useLogMessages.js'
import { useQueueProcessor } from '../hooks/useQueueProcessor.js'
import type { TerminalNotification } from '../ink/useTerminalNotification.js'
import { Text } from '../ink.js'
import { sendNotification } from '../services/notifier.js'
import type { Message as MessageType } from '../types/message.js'
import type { QueuedCommand } from '../types/textInputTypes.js'
import { activityManager } from '../utils/activityManager.js'
import { startBackgroundHousekeeping } from '../utils/backgroundHousekeeping.js'
import { getMemoryFiles } from '../utils/claudemd.js'
import { getGlobalConfig } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import type { FileStateCache } from '../utils/fileStateCache.js'
import { formatTokens } from '../utils/format.js'
import type { QueryGuard } from '../utils/QueryGuard.js'
import type { ToolJSXValue } from './REPL.render.js'

export interface UseREPLEffectsParams {
  // From useREPLFoundation
  addNotification: (content: Notification) => void
  removeNotification: (key: string) => void
  terminal: TerminalNotification
  // From useREPLMessages
  messages: MessageType[]
  messagesRef: React.MutableRefObject<MessageType[]>
  idleHintShownRef: React.MutableRefObject<string | false>
  // From useREPLInputQueue
  executeQueuedInput: (commands: QueuedCommand[]) => Promise<void>
  // From useREPLScrollInput
  inputValue: string
  submitCount: number
  // From useREPLStreamState
  isLoading: boolean
  toolJSX: ToolJSXValue | null
  isShowingLocalJSXCommand: boolean
  queryGuard: QueryGuard
  // From useREPLUiState
  lastQueryCompletionTime: number
  // From useREPLDialogs
  focusedInputDialogRef: React.MutableRefObject<string | undefined>
  // From useApiKeyVerification
  reverify: () => Promise<void>
  // From REPL component state
  readFileState: React.MutableRefObject<FileStateCache>
  initialMessages: MessageType[] | undefined
}

export interface UseREPLEffectsResult {
  onInit: () => Promise<void>
}

export function useREPLEffects(params: UseREPLEffectsParams): UseREPLEffectsResult {
  const {
    addNotification,
    removeNotification,
    terminal,
    messages,
    messagesRef,
    idleHintShownRef,
    executeQueuedInput,
    inputValue,
    submitCount,
    isLoading,
    toolJSX,
    isShowingLocalJSXCommand,
    queryGuard,
    lastQueryCompletionTime,
    focusedInputDialogRef,
    reverify,
    readFileState,
    initialMessages,
  } = params

  async function onInit() {
    // Always verify API key on startup, so we can show the user an error in the
    // bottom right corner of the screen if the API key is invalid.
    void reverify()

    // Populate readFileState with CLAUDE.md files at startup
    const memoryFiles = await getMemoryFiles()
    if (memoryFiles.length > 0) {
      const fileList = memoryFiles
        .map(
          (f) =>
            `  [${f.type}] ${f.path} (${f.content.length} chars)${f.parent ? ` (included by ${f.parent})` : ''}`,
        )
        .join('\n')
      logForDebugging(`Loaded ${memoryFiles.length} CLAUDE.md/rules files:\n${fileList}`)
    } else {
      logForDebugging('No CLAUDE.md/rules files found')
    }
    for (const file of memoryFiles) {
      // When the injected content doesn't match disk (stripped HTML comments,
      // stripped frontmatter, MEMORY.md truncation), cache the RAW disk bytes
      // with isPartialView so Edit/Write require a real Read first while
      // getChangedFiles + nested_memory dedup still work.
      readFileState.current.set(file.path, {
        content: file.contentDiffersFromDisk ? (file.rawContent ?? file.content) : file.content,
        timestamp: Date.now(),
        offset: undefined,
        limit: undefined,
        isPartialView: file.contentDiffersFromDisk,
      })
    }

    // Initial message handling is done via the initialMessage effect
  }

  // Register cost summary tracker
  useCostSummary(useFpsMetrics())

  // Record transcripts locally, for debugging and conversation recovery
  // Don't record conversation if we only have initial messages; optimizes
  // the case where user resumes a conversation then quites before doing
  // anything else
  useLogMessages(messages, messages.length === initialMessages?.length)

  useAfterFirstRender()

  useQueueProcessor({
    executeQueuedInput,
    hasActiveLocalJsxUI: isShowingLocalJSXCommand,
    queryGuard,
  })

  // We'll use the global lastInteractionTime from state.ts

  // Update last interaction time when input changes.
  // Must be immediate because useEffect runs after the Ink render cycle flush.
  useEffect(() => {
    activityManager.recordUserActivity()
    updateLastInteractionTime(true)
  }, [inputValue, submitCount])
  useEffect(() => {
    if (submitCount === 1) {
      startBackgroundHousekeeping()
    }
  }, [submitCount])

  // Show notification when Claude is done responding and user is idle
  useEffect(() => {
    // Don't set up notification if Claude is busy
    if (isLoading) return

    // Only enable notifications after the first new interaction in this session
    if (submitCount === 0) return

    // No query has completed yet
    if (lastQueryCompletionTime === 0) return

    // Set timeout to check idle state
    const timer = setTimeout(
      (lastQueryCompletionTime, isLoading, toolJSX, focusedInputDialogRef, terminal) => {
        // Check if user has interacted since the response ended
        const lastUserInteraction = getLastInteractionTime()
        if (lastUserInteraction > lastQueryCompletionTime) {
          // User has interacted since Claude finished - they're not idle, don't notify
          return
        }

        // User hasn't interacted since response ended, check other conditions
        const idleTimeSinceResponse = Date.now() - lastQueryCompletionTime
        if (
          !isLoading &&
          !toolJSX &&
          // Use ref to get current dialog state, avoiding stale closure
          focusedInputDialogRef.current === undefined &&
          idleTimeSinceResponse >= getGlobalConfig().messageIdleNotifThresholdMs
        ) {
          void sendNotification(
            {
              message: 'Claude is waiting for your input',
              notificationType: 'idle_prompt',
            },
            terminal,
          )
        }
      },
      getGlobalConfig().messageIdleNotifThresholdMs,
      lastQueryCompletionTime,
      isLoading,
      toolJSX,
      focusedInputDialogRef,
      terminal,
    )
    return () => clearTimeout(timer)
  }, [isLoading, toolJSX, submitCount, lastQueryCompletionTime, terminal])

  // Idle-return hint: show notification when idle threshold is exceeded.
  // Timer fires after the configured idle period; notification persists until
  // dismissed or the user submits.
  useEffect(() => {
    if (lastQueryCompletionTime === 0) return
    if (isLoading) return
    const willowMode: string = getFeatureValue_CACHED_MAY_BE_STALE('tengu_willow_mode', 'off')
    if (willowMode !== 'hint' && willowMode !== 'hint_v2') return
    if (getGlobalConfig().idleReturnDismissed) return
    const tokenThreshold = Number(process.env.CLAUDE_CODE_IDLE_TOKEN_THRESHOLD ?? 100_000)
    if (getTotalInputTokens() < tokenThreshold) return
    const idleThresholdMs = Number(process.env.CLAUDE_CODE_IDLE_THRESHOLD_MINUTES ?? 75) * 60_000
    const elapsed = Date.now() - lastQueryCompletionTime
    const remaining = idleThresholdMs - elapsed
    const timer = setTimeout(
      (lqct, addNotif, msgsRef, mode, hintRef) => {
        if (msgsRef.current.length === 0) return
        const totalTokens = getTotalInputTokens()
        const formattedTokens = formatTokens(totalTokens)
        const idleMinutes = (Date.now() - lqct) / 60_000
        addNotif({
          key: 'idle-return-hint',
          jsx:
            mode === 'hint_v2' ? (
              <>
                <Text dimColor>new task? </Text>
                <Text color="suggestion">/clear</Text>
                <Text dimColor> to save </Text>
                <Text color="suggestion">{formattedTokens} tokens</Text>
              </>
            ) : (
              <Text color="warning">new task? /clear to save {formattedTokens} tokens</Text>
            ),
          priority: 'medium',
          // Persist until submit — the hint fires at T+75min idle, user may
          // not return for hours. removeNotification in useEffect cleanup
          // handles dismissal. 0x7FFFFFFF = setTimeout max (~24.8 days).
          timeoutMs: 0x7fffffff,
        })
        hintRef.current = mode
        logEvent('tengu_idle_return_action', {
          action: 'hint_shown' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          variant: mode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          idleMinutes: Math.round(idleMinutes),
          messageCount: msgsRef.current.length,
          totalInputTokens: totalTokens,
        })
      },
      Math.max(0, remaining),
      lastQueryCompletionTime,
      addNotification,
      messagesRef,
      willowMode,
      idleHintShownRef,
    )
    return () => {
      clearTimeout(timer)
      removeNotification('idle-return-hint')
      idleHintShownRef.current = false
    }
  }, [lastQueryCompletionTime, isLoading, addNotification, removeNotification])

  return { onInit }
}
