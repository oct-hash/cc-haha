// Extracted from REPL.tsx — streaming text display, dialog/UI state, terminal
// focus, and theme. useREPLUiState is the fourth state block of the REPL
// component body.

import { randomUUID } from 'crypto'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Theme } from 'src/utils/theme.js'
import { hasCursorUpViewportYankBug } from '../ink/terminal.js'
import { useTerminalFocus, useTheme } from '../ink.js'
import { useAppState } from '../state/AppState.js'
import type { Message as MessageType, UserMessage } from '../types/message.js'
import type { VimMode } from '../types/textInputTypes.js'
import { getGlobalConfig } from '../utils/config.js'
import {
  type ContentReplacementRecord,
  provisionContentReplacementState,
} from '../utils/toolResultStorage.js'

export interface UseREPLUiStateParams {
  initialMessages?: MessageType[]
  initialContentReplacements?: ContentReplacementRecord[]
  // Typed as unknown: comes from the stream hook's useAppState selectors,
  // which resolve to unknown (untyped selector — see AppState.tsx). The
  // effect only truthiness-checks it, so unknown preserves exact behavior.
  ultraplanPendingChoice: unknown
}

export function useREPLUiState(params: UseREPLUiStateParams) {
  const { initialMessages, initialContentReplacements, ultraplanPendingChoice } = params
  // Streaming text display: set state directly per delta (Ink's 16ms render
  // throttle batches rapid updates). Cleared on message arrival (messages.ts)
  // so displayedMessages switches from deferredMessages to messages atomically.
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const reducedMotion = useAppState((s) => s.settings.prefersReducedMotion) ?? false
  const showStreamingText = !reducedMotion && !hasCursorUpViewportYankBug()
  const onStreamingText = useCallback(
    (f: (current: string | null) => string | null) => {
      if (!showStreamingText) return
      setStreamingText(f)
    },
    [showStreamingText],
  )

  // Hide the in-progress source line so text streams line-by-line, not
  // char-by-char. lastIndexOf returns -1 when no newline, giving '' → null.
  // Guard on showStreamingText so toggling reducedMotion mid-stream
  // immediately hides the streaming preview.
  const visibleStreamingText =
    streamingText && showStreamingText
      ? streamingText.substring(0, streamingText.lastIndexOf('\n') + 1) || null
      : null
  const [lastQueryCompletionTime, setLastQueryCompletionTime] = useState(0)
  const [spinnerMessage, setSpinnerMessage] = useState<string | null>(null)
  const [spinnerColor, setSpinnerColor] = useState<keyof Theme | null>(null)
  const [spinnerShimmerColor, setSpinnerShimmerColor] = useState<keyof Theme | null>(null)
  const [isMessageSelectorVisible, setIsMessageSelectorVisible] = useState(false)
  const [messageSelectorPreselect, setMessageSelectorPreselect] = useState<UserMessage | undefined>(
    undefined,
  )
  const [showCostDialog, setShowCostDialog] = useState(false)
  const [conversationId, setConversationId] = useState(randomUUID())

  // Idle-return dialog: shown when user submits after a long idle gap
  const [idleReturnPending, setIdleReturnPending] = useState<{
    input: string
    idleMinutes: number
  } | null>(null)
  const skipIdleCheckRef = useRef(false)
  const lastQueryCompletionTimeRef = useRef(lastQueryCompletionTime)
  lastQueryCompletionTimeRef.current = lastQueryCompletionTime

  // Aggregate tool result budget: per-conversation decision tracking.
  // When the GrowthBook flag is on, query.ts enforces the budget; when
  // off (undefined), enforcement is skipped entirely. Stale entries after
  // /clear, rewind, or compact are harmless (tool_use_ids are UUIDs, stale
  // keys are never looked up). Memory is bounded by total replacement count
  // × ~2KB preview over the REPL lifetime — negligible.
  //
  // Lazy init via useState initializer — useRef(expr) evaluates expr on every
  // render (React ignores it after first, but the computation still runs).
  // For large resumed sessions, reconstruction does O(messages × blocks)
  // work; we only want that once.
  const [contentReplacementStateRef] = useState(() => ({
    current: provisionContentReplacementState(initialMessages, initialContentReplacements),
  }))
  const [haveShownCostDialog, setHaveShownCostDialog] = useState(
    getGlobalConfig().hasAcknowledgedCostThreshold,
  )
  const [vimMode, setVimMode] = useState<VimMode>('INSERT')
  const [showBashesDialog, setShowBashesDialog] = useState<string | boolean>(false)
  const [isSearchingHistory, setIsSearchingHistory] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)

  // showBashesDialog is REPL-level so it survives PromptInput unmounting.
  // When ultraplan approval fires while the pill dialog is open, PromptInput
  // unmounts (focusedInputDialog → 'ultraplan-choice') but this stays true;
  // after accepting, PromptInput remounts into an empty "No tasks" dialog
  // (the completed ultraplan task has been filtered out). Close it here.
  useEffect(() => {
    if (ultraplanPendingChoice && showBashesDialog) {
      setShowBashesDialog(false)
    }
  }, [ultraplanPendingChoice, showBashesDialog])
  const isTerminalFocused = useTerminalFocus()
  const terminalFocusRef = useRef(isTerminalFocused)
  terminalFocusRef.current = isTerminalFocused
  const [theme] = useTheme()

  return {
    streamingText,
    setStreamingText,
    reducedMotion,
    showStreamingText,
    onStreamingText,
    visibleStreamingText,
    lastQueryCompletionTime,
    setLastQueryCompletionTime,
    spinnerMessage,
    setSpinnerMessage,
    spinnerColor,
    setSpinnerColor,
    spinnerShimmerColor,
    setSpinnerShimmerColor,
    isMessageSelectorVisible,
    setIsMessageSelectorVisible,
    messageSelectorPreselect,
    setMessageSelectorPreselect,
    showCostDialog,
    setShowCostDialog,
    conversationId,
    setConversationId,
    idleReturnPending,
    setIdleReturnPending,
    skipIdleCheckRef,
    lastQueryCompletionTimeRef,
    contentReplacementStateRef,
    haveShownCostDialog,
    setHaveShownCostDialog,
    vimMode,
    setVimMode,
    showBashesDialog,
    setShowBashesDialog,
    isSearchingHistory,
    setIsSearchingHistory,
    isHelpOpen,
    setIsHelpOpen,
    isTerminalFocused,
    terminalFocusRef,
    theme,
  }
}
