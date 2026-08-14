// Extracted from REPL.tsx — scroll/unseen-divider, message actions, input value,
// and remote/direct-connect/ssh session state. useREPLScrollInput is the third
// state block of the REPL component body.

import { feature } from 'bun:bundle'
import type * as React from 'react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useAwaySummary } from 'src/hooks/useAwaySummary.js'
import type { Command } from '../commands.js'
import { REMOTE_SAFE_COMMANDS } from '../commands.js'
import { computeUnseenDivider, useUnseenDivider } from '../components/FullscreenLayout.js'
import type { MessageActionsNav, MessageActionsState } from '../components/messageActions.js'
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import type { SpinnerMode } from '../components/Spinner.js'
import { useAssistantHistory } from '../hooks/useAssistantHistory.js'
import { useDeferredHookMessages } from '../hooks/useDeferredHookMessages.js'
import { useDirectConnect } from '../hooks/useDirectConnect.js'
import { useRemoteSession } from '../hooks/useRemoteSession.js'
import { useSSHSession } from '../hooks/useSSHSession.js'
import type { ScrollBoxHandle } from '../ink/components/ScrollBox.js'
import type { RemoteSessionConfig } from '../remote/RemoteSessionManager.js'
import type { DirectConnectConfig } from '../server/directConnectManager.js'
import type { AppState } from '../state/AppState.js'
import type { Tool } from '../Tool.js'
import type { HookResultMessage, Message as MessageType } from '../types/message.js'
import type { PromptInputMode } from '../types/textInputTypes.js'
import type { PastedContent } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import { consumeEarlyInput } from '../utils/earlyInput.js'
import { isHumanTurn } from '../utils/messagePredicates.js'
import type { StreamingToolUse } from '../utils/messages.js'

// Stable stub for useAssistantHistory's non-KAIROS branch — avoids a new
// function identity each render, which would break composedOnScroll's memo.
const HISTORY_STUB = {
  maybeLoadOlder: (_: ScrollBoxHandle) => {},
}
// Window after a user-initiated scroll during which type-into-empty does NOT
// repin to bottom. Josh Rosen's workflow: Claude emits long output → scroll
// up to read the start → start typing → before this fix, snapped to bottom.
// https://anthropic.slack.com/archives/C07VBSHV7EV/p1773545449871739
const RECENT_SCROLL_REPIN_WINDOW_MS = 3000

export interface UseREPLScrollInputParams {
  pendingHookMessages?: Promise<HookResultMessage[]>
  remoteSessionConfig?: RemoteSessionConfig
  directConnectConfig?: DirectConnectConfig
  // Typed as unknown: the REPL component declares sshSession as SSHSession from
  // '../ssh/createSSHSession.js', which does not resolve in this fork (TS2307 in
  // 3 pre-existing files). The block only forwards it to useSSHSession, so
  // unknown preserves exact pre-extraction behavior without a new broken import.
  sshSession?: unknown
  // from useREPLFoundation
  setAppState: (updater: (prev: AppState) => AppState) => void
  setLocalCommands: React.Dispatch<React.SetStateAction<Command[]>>
  combinedInitialTools: Tool[]
  trySuggestBgPRIntercept: (input: string, next: string) => boolean
  // from useREPLStreamState
  messages: MessageType[]
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>
  isLoading: boolean
  scrollRef: React.RefObject<ScrollBoxHandle | null>
  lastUserScrollTsRef: React.MutableRefObject<number>
  setIsExternalLoading: (value: boolean) => void
  setToolUseConfirmQueue: React.Dispatch<React.SetStateAction<ToolUseConfirm[]>>
  setStreamingToolUses: React.Dispatch<React.SetStateAction<StreamingToolUse[]>>
  setStreamMode: React.Dispatch<React.SetStateAction<SpinnerMode>>
  setIsPromptInputActive: React.Dispatch<React.SetStateAction<boolean>>
  PROMPT_SUPPRESSION_MS: number
}

export function useREPLScrollInput(params: UseREPLScrollInputParams) {
  const {
    pendingHookMessages,
    remoteSessionConfig,
    directConnectConfig,
    sshSession,
    setAppState,
    setLocalCommands,
    combinedInitialTools,
    trySuggestBgPRIntercept,
    messages,
    setMessages,
    isLoading,
    scrollRef,
    lastUserScrollTsRef,
    setIsExternalLoading,
    setToolUseConfirmQueue,
    setStreamingToolUses,
    setStreamMode,
    setIsPromptInputActive,
    PROMPT_SUPPRESSION_MS,
  } = params

  // Fullscreen: track the unseen-divider position. dividerIndex changes
  // only ~twice/scroll-session (first scroll-away + repin). pillVisible
  // and stickyPrompt now live in FullscreenLayout — they subscribe to
  // ScrollBox directly so per-frame scroll never re-renders REPL.
  const { dividerIndex, dividerYRef, onScrollAway, onRepin, jumpToNew, shiftDivider } =
    useUnseenDivider(messages.length)
  if (feature('AWAY_SUMMARY')) {
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useAwaySummary(messages, setMessages, isLoading)
  }
  const [cursor, setCursor] = useState<MessageActionsState | null>(null)
  const cursorNavRef = useRef<MessageActionsNav | null>(null)
  // Memoized so Messages' React.memo holds.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages.length (not messages) intentionally keys on append count; count-drop guard clears dividerIndex on replace/rewind
  const unseenDivider = useMemo(
    () => computeUnseenDivider(messages, dividerIndex),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- length change covers appends; useUnseenDivider's count-drop guard clears dividerIndex on replace/rewind
    [dividerIndex, messages.length],
  )
  // Re-pin scroll to bottom and clear the unseen-messages baseline. Called
  // on any user-driven return-to-live action (submit, type-into-empty,
  // overlay appear/dismiss).
  // biome-ignore lint/correctness/useExhaustiveDependencies: stable refs/setters/store (React identity-stable, not a real dependency)
  const repinScroll = useCallback(() => {
    scrollRef.current?.scrollToBottom()
    onRepin()
    setCursor(null)
  }, [onRepin])
  // Backstop for the submit-handler repin at onSubmit. If a buffered stdin
  // event (wheel/drag) races between handler-fire and state-commit, the
  // handler's scrollToBottom can be undone. This effect fires on the render
  // where the user's message actually lands — tied to React's commit cycle,
  // so it can't race with stdin. Keyed on lastMsg identity (not messages.length)
  // so useAssistantHistory's prepends don't spuriously repin.
  const lastMsg = messages.at(-1)
  const lastMsgIsHuman = lastMsg != null && isHumanTurn(lastMsg)
  // biome-ignore lint/correctness/useExhaustiveDependencies: lastMsg is an identity trigger to repin when the user's message lands, not read in the body
  useEffect(() => {
    if (lastMsgIsHuman) {
      repinScroll()
    }
  }, [lastMsgIsHuman, lastMsg, repinScroll])
  // Assistant-chat: lazy-load remote history on scroll-up. No-op unless
  // KAIROS build + config.viewerOnly. feature() is build-time constant so
  // the branch is dead-code-eliminated in non-KAIROS builds (same pattern
  // as useUnseenDivider above).
  const { maybeLoadOlder } = feature('KAIROS')
    ? // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
      useAssistantHistory({
        config: remoteSessionConfig,
        setMessages,
        scrollRef,
        onPrepend: shiftDivider,
      })
    : HISTORY_STUB
  // Compose useUnseenDivider's callbacks with the lazy-load trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stable refs/setters/store (React identity-stable, not a real dependency)
  const composedOnScroll = useCallback(
    (sticky: boolean, handle: ScrollBoxHandle) => {
      lastUserScrollTsRef.current = Date.now()
      if (sticky) {
        onRepin()
      } else {
        onScrollAway(handle)
        if (feature('KAIROS')) maybeLoadOlder(handle)
        // Dismiss the companion bubble on scroll — it's absolute-positioned
        // at bottom-right and covers transcript content. Scrolling = user is
        // trying to read something under it.
        setAppState((prev) =>
          prev.companionReaction === undefined
            ? prev
            : {
                ...prev,
                companionReaction: undefined,
              },
        )
      }
    },
    [onRepin, onScrollAway, maybeLoadOlder, setAppState],
  )
  // Deferred SessionStart hook messages — REPL renders immediately and
  // hook messages are injected when they resolve. awaitPendingHooks()
  // must be called before the first API call so the model sees hook context.
  const awaitPendingHooks = useDeferredHookMessages(pendingHookMessages, setMessages)

  // Deferred messages for the Messages component — renders at transition
  // priority so the reconciler yields every 5ms, keeping input responsive
  // while the expensive message processing pipeline runs.
  const deferredMessages = useDeferredValue(messages)
  const deferredBehind = messages.length - deferredMessages.length
  if (deferredBehind > 0) {
    logForDebugging(
      `[useDeferredValue] Messages deferred by ${deferredBehind} (${deferredMessages.length}→${messages.length})`,
    )
  }

  // Frozen state for transcript mode - stores lengths instead of cloning arrays for memory efficiency
  const [frozenTranscriptState, setFrozenTranscriptState] = useState<{
    messagesLength: number
    streamingToolUsesLength: number
  } | null>(null)
  // Initialize input with any early input that was captured before REPL was ready.
  // Using lazy initialization ensures cursor offset is set correctly in PromptInput.
  const [inputValue, setInputValueRaw] = useState(() => consumeEarlyInput())
  const inputValueRef = useRef(inputValue)
  inputValueRef.current = inputValue
  const insertTextRef = useRef<{
    insert: (text: string) => void
    setInputWithCursor: (value: string, cursor: number) => void
    cursorOffset: number
  } | null>(null)

  // Wrap setInputValue to co-locate suppression state updates.
  // Both setState calls happen in the same synchronous context so React
  // batches them into a single render, eliminating the extra render that
  // the previous useEffect → setState pattern caused.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stable refs/setters/store (React identity-stable, not a real dependency)
  const setInputValue = useCallback(
    (value: string) => {
      if (trySuggestBgPRIntercept(inputValueRef.current, value)) return
      // In fullscreen mode, typing into an empty prompt re-pins scroll to
      // bottom. Only fires on empty→non-empty so scrolling up to reference
      // something while composing a message doesn't yank the view back on
      // every keystroke. Restores the pre-fullscreen muscle memory of
      // typing to snap back to the end of the conversation.
      // Skipped if the user scrolled within the last 3s — they're actively
      // reading, not lost. lastUserScrollTsRef starts at 0 so the first-
      // ever keypress (no scroll yet) always repins.
      if (
        inputValueRef.current === '' &&
        value !== '' &&
        Date.now() - lastUserScrollTsRef.current >= RECENT_SCROLL_REPIN_WINDOW_MS
      ) {
        repinScroll()
      }
      // Sync ref immediately (like setMessages) so callers that read
      // inputValueRef before React commits — e.g. the auto-restore finally
      // block's `=== ''` guard — see the fresh value, not the stale render.
      inputValueRef.current = value
      setInputValueRaw(value)
      setIsPromptInputActive(value.trim().length > 0)
    },
    [setIsPromptInputActive, repinScroll, trySuggestBgPRIntercept],
  )

  // Schedule a timeout to stop suppressing dialogs after the user stops typing.
  // Only manages the timeout — the immediate activation is handled by setInputValue above.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stable refs/setters/store (React identity-stable, not a real dependency)
  useEffect(() => {
    if (inputValue.trim().length === 0) return
    const timer = setTimeout(setIsPromptInputActive, PROMPT_SUPPRESSION_MS, false)
    return () => clearTimeout(timer)
  }, [inputValue])
  const [inputMode, setInputMode] = useState<PromptInputMode>('prompt')
  const [stashedPrompt, setStashedPrompt] = useState<
    | {
        text: string
        cursorOffset: number
        pastedContents: Record<number, PastedContent>
      }
    | undefined
  >()

  // Callback to filter commands based on CCR's available slash commands
  const handleRemoteInit = useCallback(
    (remoteSlashCommands: string[]) => {
      const remoteCommandSet = new Set(remoteSlashCommands)
      // Keep commands that CCR lists OR that are in the local-safe set
      setLocalCommands((prev) =>
        prev.filter((cmd) => remoteCommandSet.has(cmd.name) || REMOTE_SAFE_COMMANDS.has(cmd)),
      )
    },
    [setLocalCommands],
  )
  const [inProgressToolUseIDs, setInProgressToolUseIDs] = useState<Set<string>>(new Set())
  const hasInterruptibleToolInProgressRef = useRef(false)

  // Remote session hook - manages WebSocket connection and message handling for --remote mode
  const remoteSession = useRemoteSession({
    config: remoteSessionConfig,
    setMessages,
    setIsLoading: setIsExternalLoading,
    onInit: handleRemoteInit,
    setToolUseConfirmQueue,
    tools: combinedInitialTools,
    setStreamingToolUses,
    setStreamMode,
    setInProgressToolUseIDs,
  })

  // Direct connect hook - manages WebSocket to a claude server for `claude connect` mode
  const directConnect = useDirectConnect({
    config: directConnectConfig,
    setMessages,
    setIsLoading: setIsExternalLoading,
    setToolUseConfirmQueue,
    tools: combinedInitialTools,
  })

  // SSH session hook - manages ssh child process for `claude ssh` mode.
  // Same callback shape as useDirectConnect; only the transport under the
  // hood differs (ChildProcess stdin/stdout vs WebSocket).
  const sshRemote = useSSHSession({
    session: sshSession,
    setMessages,
    setIsLoading: setIsExternalLoading,
    setToolUseConfirmQueue,
    tools: combinedInitialTools,
  })

  // Use whichever remote mode is active
  const activeRemote = sshRemote.isRemoteMode
    ? sshRemote
    : directConnect.isRemoteMode
      ? directConnect
      : remoteSession
  const [pastedContents, setPastedContents] = useState<Record<number, PastedContent>>({})
  const [submitCount, setSubmitCount] = useState(0)
  // Ref instead of state to avoid triggering React re-renders on every
  // streaming text_delta. The spinner reads this via its animation timer.
  const responseLengthRef = useRef(0)
  // API performance metrics ref for ant-only spinner display (TTFT/OTPS).
  // Accumulates metrics from all API requests in a turn for P50 aggregation.
  const apiMetricsRef = useRef<
    Array<{
      ttftMs: number
      firstTokenTime: number
      lastTokenTime: number
      responseLengthBaseline: number
      // Tracks responseLengthRef at the time of the last content addition.
      // Updated by both streaming deltas and subagent message content.
      // lastTokenTime is also updated at the same time, so the OTPS
      // denominator correctly includes subagent processing time.
      endResponseLength: number
    }>
  >([])
  const setResponseLength = useCallback((f: (prev: number) => number) => {
    const prev = responseLengthRef.current
    responseLengthRef.current = f(prev)
    // When content is added (not a compaction reset), update the latest
    // metrics entry so OTPS reflects all content generation activity.
    // Updating lastTokenTime here ensures the denominator includes both
    // streaming time AND subagent execution time, preventing inflation.
    if (responseLengthRef.current > prev) {
      const entries = apiMetricsRef.current
      if (entries.length > 0) {
        const lastEntry = entries.at(-1)!
        lastEntry.lastTokenTime = Date.now()
        lastEntry.endResponseLength = responseLengthRef.current
      }
    }
  }, [])
  return {
    dividerYRef,
    jumpToNew,
    cursor,
    setCursor,
    cursorNavRef,
    unseenDivider,
    repinScroll,
    composedOnScroll,
    awaitPendingHooks,
    deferredMessages,
    frozenTranscriptState,
    setFrozenTranscriptState,
    inputValue,
    setInputValue,
    setInputValueRaw,
    inputValueRef,
    insertTextRef,
    inputMode,
    setInputMode,
    stashedPrompt,
    setStashedPrompt,
    inProgressToolUseIDs,
    setInProgressToolUseIDs,
    hasInterruptibleToolInProgressRef,
    activeRemote,
    remoteSession,
    pastedContents,
    setPastedContents,
    submitCount,
    setSubmitCount,
    responseLengthRef,
    apiMetricsRef,
    setResponseLength,
  }
}
