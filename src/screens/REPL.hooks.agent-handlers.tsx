// Extracted from REPL.tsx — agent submit, auto-run/exit/restore handlers,
// message-action caps (edit/copy), and the REPL bridge hook.
// useREPLAgentHandlers owns onAgentSubmit, the auto-run /issue handlers,
// rate-limit/exit/message-selector handlers, conversation rewind/restore,
// messageActionCaps, and the useReplBridge replication. All externally
// captured values are passed via UseREPLAgentHandlersParams; only module-scope
// handler/component imports are resolved here directly.

import { feature } from 'bun:bundle'
import { spawnSync } from 'node:child_process'
import type * as React from 'react'
import { useCallback, useRef } from 'react'
import exit from '../commands/exit/index.js'
import type { Command } from '../commands.js'
import { ExitFlow } from '../components/ExitFlow.js'
import {
  messagesAfterAreOnlySynthetic,
  selectableUserMessagesFilter,
} from '../components/MessageSelector.js'
import {
  type MessageActionCaps,
  type MessageActionsNav,
  type MessageActionsState,
  useMessageActions,
} from '../components/messageActions.js'
import type { Notification } from '../context/notifications.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import { useReplBridge } from '../hooks/useReplBridge.js'
import { setClipboard } from '../ink/termio/osc.js'
import { Text } from '../ink.js'
import type { InProcessTeammateTaskState } from '../tasks/InProcessTeammateTask/types.js'
import type { LocalAgentTaskState } from '../tasks/LocalAgentTask/LocalAgentTask.js'
import type { Message as MessageType, UserMessage } from '../types/message.js'
import type { PromptInputMode } from '../types/textInputTypes.js'
import { type AutoRunIssueReason, getAutoRunCommand } from '../utils/autoRunIssue.js'
import { isBgSession } from '../utils/concurrentSessions.js'
import type { PastedContent } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { fileHistoryHasAnyChanges } from '../utils/fileHistory.js'
import type { PromptInputHelpers } from '../utils/handlePromptSubmit.js'
import type { SetAppState } from '../utils/messageQueueManager.js'
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'
import { getCurrentWorktreeSession } from '../utils/worktree.js'
import {
  handleAgentSubmit,
  handleRestoreMessageInput,
  handleRewindConversationTo,
} from './REPL.handlers.js'

export interface UseREPLAgentHandlersParams {
  // From useREPLFoundation
  setAppState: SetAppState
  mainLoopModel: string
  addNotification: (content: Notification) => void
  commands: Command[]
  // Typed as unknown: fileHistory comes from useAppState and is unknown in
  // REPL.tsx; it is forwarded to fileHistoryHasAnyChanges (which expects
  // FileHistoryState), matching the pre-extraction call site's TS2345.
  fileHistory: unknown
  // From useREPLStreamState
  sendBridgeResultRef: React.RefObject<() => void>
  restoreMessageSyncRef: React.RefObject<(message: UserMessage) => void>
  abortControllerRef: React.RefObject<AbortController | null>
  // From useREPLMessages
  messages: MessageType[]
  messagesRef: React.RefObject<MessageType[]>
  setMessages: (updater: React.SetStateAction<MessageType[]>) => void
  // From useREPLScrollInput
  setInputValue: (value: string) => void
  setInputMode: (mode: PromptInputMode) => void
  setPastedContents: React.Dispatch<React.SetStateAction<Record<number, PastedContent>>>
  cursor: MessageActionsState | null
  setCursor: React.Dispatch<React.SetStateAction<MessageActionsState | null>>
  cursorNavRef: React.RefObject<MessageActionsNav | null>
  // From useREPLUiState
  setConversationId: (id: string) => void
  setIsMessageSelectorVisible: React.Dispatch<React.SetStateAction<boolean>>
  setMessageSelectorPreselect: React.Dispatch<React.SetStateAction<UserMessage | undefined>>
  // From useREPLToolContext
  canUseTool: CanUseToolFn
  getToolUseContext: (
    messages: MessageType[],
    newMessages: MessageType[],
    abortController: AbortController,
    mainLoopModel: string,
  ) => ProcessUserInputContext
  // From useREPLDialogs
  setExitFlow: React.Dispatch<React.SetStateAction<React.ReactNode>>
  setIsExiting: React.Dispatch<React.SetStateAction<boolean>>
  onCancel: () => void
  // From REPL component state
  autoRunIssueReason: AutoRunIssueReason | null
  setAutoRunIssueReason: React.Dispatch<React.SetStateAction<AutoRunIssueReason | null>>
  onSubmit: (input: string, helpers: PromptInputHelpers) => Promise<void>
}

export function useREPLAgentHandlers(params: UseREPLAgentHandlersParams) {
  const {
    setAppState,
    mainLoopModel,
    addNotification,
    commands,
    fileHistory,
    sendBridgeResultRef,
    restoreMessageSyncRef,
    abortControllerRef,
    messages,
    messagesRef,
    setMessages,
    setInputValue,
    setInputMode,
    setPastedContents,
    cursor,
    setCursor,
    cursorNavRef,
    setConversationId,
    setIsMessageSelectorVisible,
    setMessageSelectorPreselect,
    canUseTool,
    getToolUseContext,
    setExitFlow,
    setIsExiting,
    onCancel,
    autoRunIssueReason,
    setAutoRunIssueReason,
    onSubmit,
  } = params

  // Callback for when user submits input while viewing a teammate's transcript
  const onAgentSubmit = useCallback(
    async (
      input: string,
      task: InProcessTeammateTaskState | LocalAgentTaskState,
      helpers: PromptInputHelpers,
    ) => {
      await handleAgentSubmit({
        input,
        task,
        helpers,
        setAppState,
        setInputValue,
        getToolUseContext,
        canUseTool,
        mainLoopModel,
        messagesRef,
        onResumeFailed: (agentId, errMsg) => {
          addNotification({
            key: `resume-agent-failed-${agentId}`,
            jsx: <Text color="error">Failed to resume agent: {errMsg}</Text>,
            priority: 'low',
          })
        },
      })
    },
    [setAppState, setInputValue, getToolUseContext, canUseTool, mainLoopModel, addNotification],
  )

  // Handlers for auto-run /issue or /good-claude (defined after onSubmit)
  const handleAutoRunIssue = useCallback(() => {
    const command = autoRunIssueReason ? getAutoRunCommand(autoRunIssueReason) : '/issue'
    setAutoRunIssueReason(null) // Clear the state
    onSubmit(command, {
      setCursorOffset: () => {},
      clearBuffer: () => {},
      resetHistory: () => {},
    }).catch((err) => {
      logForDebugging(`Auto-run ${command} failed: ${errorMessage(err)}`)
    })
  }, [onSubmit, autoRunIssueReason])
  const handleCancelAutoRunIssue = useCallback(() => {
    setAutoRunIssueReason(null)
  }, [])

  // Handler for when user presses 1 on survey thanks screen to share details
  const handleSurveyRequestFeedback = useCallback(() => {
    const command = process.env.USER_TYPE === 'ant' ? '/issue' : '/feedback'
    onSubmit(command, {
      setCursorOffset: () => {},
      clearBuffer: () => {},
      resetHistory: () => {},
    }).catch((err) => {
      logForDebugging(
        `Survey feedback request failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    })
  }, [onSubmit])

  // onSubmit is unstable (deps include `messages` which changes every turn).
  // `handleOpenRateLimitOptions` is prop-drilled to every MessageRow, and each
  // MessageRow fiber pins the closure (and transitively the entire REPL render
  // scope, ~1.8KB) at mount time. Using a ref keeps this callback stable so
  // old REPL scopes can be GC'd — saves ~35MB over a 1000-turn session.
  const onSubmitRef = useRef(onSubmit)
  onSubmitRef.current = onSubmit
  const handleOpenRateLimitOptions = useCallback(() => {
    void onSubmitRef.current('/rate-limit-options', {
      setCursorOffset: () => {},
      clearBuffer: () => {},
      resetHistory: () => {},
    })
  }, [])
  const handleExit = useCallback(async () => {
    setIsExiting(true)
    // In bg sessions, always detach instead of kill — even when a worktree is
    // active. Without this guard, the worktree branch below short-circuits into
    // ExitFlow (which calls gracefulShutdown) before exit.tsx is ever loaded.
    if (feature('BG_SESSIONS') && isBgSession()) {
      spawnSync('tmux', ['detach-client'], {
        stdio: 'ignore',
      })
      setIsExiting(false)
      return
    }
    const showWorktree = getCurrentWorktreeSession() !== null
    if (showWorktree) {
      setExitFlow(
        <ExitFlow
          showWorktree
          onDone={() => {}}
          onCancel={() => {
            setExitFlow(null)
            setIsExiting(false)
          }}
        />,
      )
      return
    }
    const exitMod = await exit.load()
    const exitFlowResult = await exitMod.call(() => {})
    setExitFlow(exitFlowResult)
    // If call() returned without killing the process (bg session detach),
    // clear isExiting so the UI is usable on reattach. No-op on the normal
    // path — gracefulShutdown's process.exit() means we never get here.
    if (exitFlowResult === null) {
      setIsExiting(false)
    }
  }, [setIsExiting, setExitFlow])
  const handleShowMessageSelector = useCallback(() => {
    setIsMessageSelectorVisible((prev) => !prev)
  }, [])

  // Rewind conversation state to just before `message`: slice messages,
  // reset conversation ID, microcompact state, permission mode, prompt suggestion.
  // Does NOT touch the prompt input. Index is computed from messagesRef (always
  // fresh via the setMessages wrapper) so callers don't need to worry about
  // stale closures.
  const rewindConversationTo = useCallback(
    (message: UserMessage) => {
      handleRewindConversationTo({
        message,
        messagesRef,
        setMessages,
        setConversationId,
        setAppState,
        onRewind: feature('CONTEXT_COLLAPSE')
          ? () => {
              /* eslint-disable @typescript-eslint/no-require-imports */
              ;(
                require('../services/contextCollapse/index.js') as typeof import('../services/contextCollapse/index.js')
              ).resetContextCollapse()
              /* eslint-enable @typescript-eslint/no-require-imports */
            }
          : undefined,
      })
    },
    [setMessages, setAppState, setConversationId],
  )

  // Synchronous rewind + input population. Used directly by auto-restore on
  // interrupt (so React batches with the abort's setMessages → single render,
  // no flicker). MessageSelector wraps this in setImmediate via handleRestoreMessage.
  const restoreMessageSync = useCallback(
    (message: UserMessage) => {
      rewindConversationTo(message)
      handleRestoreMessageInput({
        message,
        setInputValue,
        setInputMode: (mode: string) => setInputMode(mode as PromptInputMode),
        setPastedContents,
      })
    },
    [rewindConversationTo, setInputValue],
  )
  restoreMessageSyncRef.current = restoreMessageSync

  // MessageSelector path: defer via setImmediate so the "Interrupted" message
  // renders to static output before rewind — otherwise it remains vestigial
  // at the top of the screen.
  const handleRestoreMessage = useCallback(
    async (message: UserMessage) => {
      setImmediate((restore, message) => restore(message), restoreMessageSync, message)
    },
    [restoreMessageSync],
  )

  // Not memoized — hook stores caps via ref, reads latest closure at dispatch.
  // 24-char prefix: deriveUUID preserves first 24, renderable uuid prefix-matches raw source.
  const findRawIndex = (uuid: string) => {
    const prefix = uuid.slice(0, 24)
    return messages.findIndex((m) => m.uuid.slice(0, 24) === prefix)
  }
  const messageActionCaps: MessageActionCaps = {
    copy: (text) =>
      // setClipboard RETURNS OSC 52 — caller must stdout.write (tmux side-effects load-buffer, but that's tmux-only).
      void setClipboard(text).then((raw) => {
        if (raw) process.stdout.write(raw)
        addNotification({
          // Same key as text-selection copy — repeated copies replace toast, don't queue.
          key: 'selection-copied',
          text: 'copied',
          color: 'success',
          priority: 'immediate',
          timeoutMs: 2000,
        })
      }),
    edit: async (msg) => {
      // Same skip-confirm check as /rewind: lossless → direct, else confirm dialog.
      const rawIdx = findRawIndex(msg.uuid)
      const raw = rawIdx >= 0 ? messages[rawIdx] : undefined
      if (!raw || !selectableUserMessagesFilter(raw)) return
      const noFileChanges = !(await fileHistoryHasAnyChanges(fileHistory, raw.uuid))
      const onlySynthetic = messagesAfterAreOnlySynthetic(messages, rawIdx)
      if (noFileChanges && onlySynthetic) {
        // rewindConversationTo's setMessages races stream appends — cancel first (idempotent).
        onCancel()
        // handleRestoreMessage also restores pasted images.
        void handleRestoreMessage(raw)
      } else {
        // Dialog path: onPreRestore (= onCancel) fires when user CONFIRMS, not on nevermind.
        setMessageSelectorPreselect(raw)
        setIsMessageSelectorVisible(true)
      }
    },
  }
  const { enter: enterMessageActions, handlers: messageActionHandlers } = useMessageActions(
    cursor,
    setCursor,
    cursorNavRef,
    messageActionCaps,
  )

  // REPL Bridge: replicate user/assistant messages to the bridge session
  // for remote access via claude.ai. No-op in external builds or when not enabled.
  const { sendBridgeResult } = useReplBridge(
    messages,
    setMessages,
    abortControllerRef,
    commands,
    mainLoopModel,
  )
  sendBridgeResultRef.current = sendBridgeResult

  return {
    onAgentSubmit,
    handleAutoRunIssue,
    handleCancelAutoRunIssue,
    handleSurveyRequestFeedback,
    handleOpenRateLimitOptions,
    handleExit,
    handleShowMessageSelector,
    rewindConversationTo,
    restoreMessageSync,
    handleRestoreMessage,
    findRawIndex,
    messageActionCaps,
    enterMessageActions,
    messageActionHandlers,
    onSubmitRef,
    sendBridgeResult,
  }
}
