// Extracted from REPL.tsx — voice integration, inbox/mailbox/scheduled-task
// pollers, abort-priority + initial-load effects, suspend/resume remount key,
// stop-hook spinner suffix, transcript enter/exit callbacks, and the
// transcript search state / resize-abort / escape-hatch keybindings.
// useREPLInteraction owns the trailing interaction block of REPL(). All
// externally captured values are passed via UseREPLInteractionParams; only
// module-scope handler/component imports are resolved here directly.

import { feature } from 'bun:bundle'
import { writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JumpHandle } from '../components/VirtualMessageList.js'
import { useInboxPoller } from '../hooks/useInboxPoller.js'
import { useMailboxBridge } from '../hooks/useMailboxBridge.js'
import { useTaskListWatcher } from '../hooks/useTaskListWatcher.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { useSearchHighlight } from '../ink/hooks/use-search-highlight.js'
import { useInput, useStdin } from '../ink.js'
import { diagnosticTracker } from '../services/diagnosticTracking.js'
import type { Tool } from '../Tool.js'
import type { HookProgress } from '../types/hooks.js'
import type {
  Message as MessageType,
  ProgressMessage,
} from '../types/message.js'
import type { QueuedCommand } from '../types/textInputTypes.js'
import { count } from '../utils/array.js'
import { isAgentSwarmsEnabled } from '../utils/agentSwarmsEnabled.js'
import { openFileInExternalEditor } from '../utils/editor.js'
import { renderMessagesToPlainText } from '../utils/exportRenderer.js'
import { truncateToWidth } from '../utils/format.js'
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js'
import { enqueue } from '../utils/messageQueueManager.js'
import type { StreamingToolUse } from '../utils/messages.js'
import type { Screen } from './REPL.types.js'

// Dead code elimination: conditional imports
/* eslint-disable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
const useVoiceIntegration: typeof import('../hooks/useVoiceIntegration.js').useVoiceIntegration =
  feature('VOICE_MODE')
    ? require('../hooks/useVoiceIntegration.js').useVoiceIntegration
    : () => ({
        stripTrailing: () => 0,
        handleKeyEvent: () => {},
        resetAnchor: () => {},
      })
const useScheduledTasks = feature('AGENT_TRIGGERS')
  ? require('../hooks/useScheduledTasks.js').useScheduledTasks
  : null
const useProactive =
  feature('PROACTIVE') || feature('KAIROS')
    ? require('../proactive/useProactive.js').useProactive
    : null
/* eslint-enable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */

export interface UseREPLInteractionParams {
  // from useREPLScrollInput
  setInputValueRaw: React.Dispatch<React.SetStateAction<string>>
  inputValueRef: React.RefObject<string>
  insertTextRef: React.RefObject<{
    insert: (text: string) => void
    setInputWithCursor: (value: string, cursor: number) => void
    cursorOffset: number
  } | null>
  deferredMessages: MessageType[]
  setFrozenTranscriptState: React.Dispatch<
    React.SetStateAction<{
      messagesLength: number
      streamingToolUsesLength: number
    } | null>
  >
  // from useREPLMessages
  messages: MessageType[]
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>
  // from useREPLStreamState
  isLoading: boolean
  streamingToolUses: StreamingToolUse[]
  abortControllerRef: React.MutableRefObject<AbortController | null>
  isShowingLocalJSXCommand: boolean
  // from useREPLDialogs
  focusedInputDialog: string | undefined
  // from useREPLInputQueue
  handleIncomingPrompt: (
    content: string,
    options?: { isMeta?: boolean },
  ) => boolean
  // from useREPLFoundation / props
  store: { getState: () => { kairosEnabled: boolean } }
  queuedCommands: readonly QueuedCommand[]
  initialMessage: unknown
  toolPermissionContext: unknown
  disableVirtualScroll: boolean
  screen: Screen
  dumpMode: boolean
  setDumpMode: React.Dispatch<React.SetStateAction<boolean>>
  setShowAllInTranscript: React.Dispatch<React.SetStateAction<boolean>>
  editorGenRef: React.MutableRefObject<number>
  editorTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | undefined>
  editorRenderingRef: React.MutableRefObject<boolean>
  setEditorStatus: React.Dispatch<React.SetStateAction<string>>
  tools: readonly Tool[]
  taskListId?: string
  // defined in REPL.tsx (onInit)
  onInit: () => Promise<void>
}

export function useREPLInteraction(params: UseREPLInteractionParams) {
  const {
    setInputValueRaw,
    inputValueRef,
    insertTextRef,
    deferredMessages,
    setFrozenTranscriptState,
    messages,
    setMessages,
    isLoading,
    streamingToolUses,
    abortControllerRef,
    isShowingLocalJSXCommand,
    focusedInputDialog,
    handleIncomingPrompt,
    store,
    queuedCommands,
    initialMessage,
    toolPermissionContext,
    disableVirtualScroll,
    screen,
    dumpMode,
    setDumpMode,
    setShowAllInTranscript,
    editorGenRef,
    editorTimerRef,
    editorRenderingRef,
    setEditorStatus,
    tools,
    taskListId,
    onInit,
  } = params

  // Voice input integration (VOICE_MODE builds only)
  const voice = feature('VOICE_MODE')
    ? // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
      useVoiceIntegration({
        setInputValueRaw,
        inputValueRef,
        insertTextRef,
      })
    : {
        stripTrailing: () => 0,
        handleKeyEvent: () => {},
        resetAnchor: () => {},
        interimRange: null,
      }
  useInboxPoller({
    enabled: isAgentSwarmsEnabled(),
    isLoading,
    focusedInputDialog,
    onSubmitMessage: handleIncomingPrompt,
  })
  useMailboxBridge({
    isLoading,
    onSubmitMessage: handleIncomingPrompt,
  })

  // Scheduled tasks from .claude/scheduled_tasks.json (CronCreate/Delete/List)
  if (feature('AGENT_TRIGGERS')) {
    // Assistant mode bypasses the isLoading gate (the proactive tick →
    // Sleep → tick loop would otherwise starve the scheduler).
    // kairosEnabled is set once in initialState (main.tsx) and never mutated — no
    // subscription needed. The tengu_kairos_cron runtime gate is checked inside
    // useScheduledTasks's effect (not here) since wrapping a hook call in a dynamic
    // condition would break rules-of-hooks.
    const assistantMode = store.getState().kairosEnabled
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useScheduledTasks!({
      isLoading,
      assistantMode,
      setMessages,
    })
  }

  // Note: Permission polling is now handled by useInboxPoller
  // - Workers receive permission responses via mailbox messages
  // - Leaders receive permission requests via mailbox messages

  if ('external' === 'ant') {
    // Tasks mode: watch for tasks and auto-process them
    // eslint-disable-next-line react-hooks/rules-of-hooks
    // biome-ignore lint/correctness/useHookAtTopLevel: conditional for dead code elimination in external builds
    useTaskListWatcher({
      taskListId,
      isLoading,
      onSubmitTask: handleIncomingPrompt,
    })

    // Loop mode: auto-tick when enabled (via /job command)
    // eslint-disable-next-line react-hooks/rules-of-hooks
    // biome-ignore lint/correctness/useHookAtTopLevel: conditional for dead code elimination in external builds
    useProactive?.({
      // Suppress ticks while an initial message is pending — the initial
      // message will be processed asynchronously and a premature tick would
      // race with it, causing concurrent-query enqueue of expanded skill text.
      isLoading: isLoading || initialMessage !== null,
      queuedCommandsLength: queuedCommands.length,
      hasActiveLocalJsxUI: isShowingLocalJSXCommand,
      isInPlanMode: toolPermissionContext.mode === 'plan',
      onSubmitTick: (prompt: string) =>
        handleIncomingPrompt(prompt, {
          isMeta: true,
        }),
      onQueueTick: (prompt: string) =>
        enqueue({
          mode: 'prompt',
          value: prompt,
          isMeta: true,
        }),
    })
  }

  // Abort the current operation when a 'now' priority message arrives
  // (e.g. from a chat UI client via UDS).
  useEffect(() => {
    if (queuedCommands.some((cmd) => cmd.priority === 'now')) {
      abortControllerRef.current?.abort('interrupt')
    }
  }, [queuedCommands])

  // Initial load — onInit is captured via ref so the effect runs once on
  // mount but always calls the latest onInit (avoiding stale closures).
  const onInitRef = useRef(onInit)
  onInitRef.current = onInit
  useEffect(() => {
    void onInitRef.current()

    // Cleanup on unmount
    return () => {
      void diagnosticTracker.shutdown()
    }
  }, [])

  // Listen for suspend/resume events
  const { internal_eventEmitter } = useStdin()
  const [remountKey, setRemountKey] = useState(0)
  useEffect(() => {
    const handleSuspend = () => {
      // Print suspension instructions
      process.stdout.write(
        `\nClaude Code has been suspended. Run \`fg\` to bring Claude Code back.\nNote: ctrl + z now suspends Claude Code, ctrl + _ undoes input.\n`,
      )
    }
    const handleResume = () => {
      // Force complete component tree replacement instead of terminal clear
      // Ink now handles line count reset internally on SIGCONT
      setRemountKey((prev) => prev + 1)
    }
    internal_eventEmitter?.on('suspend', handleSuspend)
    internal_eventEmitter?.on('resume', handleResume)
    return () => {
      internal_eventEmitter?.off('suspend', handleSuspend)
      internal_eventEmitter?.off('resume', handleResume)
    }
  }, [internal_eventEmitter])

  // Derive stop hook spinner suffix from messages state
  const stopHookSpinnerSuffix = useMemo(() => {
    if (!isLoading) return null

    // Find stop hook progress messages
    const progressMsgs = messages.filter(
      (m): m is ProgressMessage<HookProgress> =>
        m.type === 'progress' &&
        m.data.type === 'hook_progress' &&
        (m.data.hookEvent === 'Stop' || m.data.hookEvent === 'SubagentStop'),
    )
    if (progressMsgs.length === 0) return null

    // Get the most recent stop hook execution
    const currentToolUseID = progressMsgs.at(-1)?.toolUseID
    if (!currentToolUseID) return null

    // Check if there's already a summary message for this execution (hooks completed)
    const hasSummaryForCurrentExecution = messages.some(
      (m) =>
        m.type === 'system' &&
        m.subtype === 'stop_hook_summary' &&
        m.toolUseID === currentToolUseID,
    )
    if (hasSummaryForCurrentExecution) return null
    const currentHooks = progressMsgs.filter((p) => p.toolUseID === currentToolUseID)
    const total = currentHooks.length

    // Count completed hooks
    const completedCount = count(messages, (m) => {
      if (m.type !== 'attachment') return false
      const attachment = m.attachment
      return (
        'hookEvent' in attachment &&
        (attachment.hookEvent === 'Stop' || attachment.hookEvent === 'SubagentStop') &&
        'toolUseID' in attachment &&
        attachment.toolUseID === currentToolUseID
      )
    })

    // Check if any hook has a custom status message
    const customMessage = currentHooks.find((p) => p.data.statusMessage)?.data.statusMessage
    if (customMessage) {
      // Use custom message with progress counter if multiple hooks
      return total === 1 ? `${customMessage}…` : `${customMessage}… ${completedCount}/${total}`
    }

    // Fall back to default behavior
    const hookType = currentHooks[0]?.data.hookEvent === 'SubagentStop' ? 'subagent stop' : 'stop'
    if ('external' === 'ant') {
      const cmd = currentHooks[completedCount]?.data.command
      const label = cmd ? ` '${truncateToWidth(cmd, 40)}'` : ''
      return total === 1
        ? `running ${hookType} hook${label}`
        : `running ${hookType} hook${label}\u2026 ${completedCount}/${total}`
    }
    return total === 1
      ? `running ${hookType} hook`
      : `running stop hooks… ${completedCount}/${total}`
  }, [messages, isLoading])

  // Callback to capture frozen state when entering transcript mode
  const handleEnterTranscript = useCallback(() => {
    setFrozenTranscriptState({
      messagesLength: messages.length,
      streamingToolUsesLength: streamingToolUses.length,
    })
  }, [messages.length, streamingToolUses.length])

  // Callback to clear frozen state when exiting transcript mode
  const handleExitTranscript = useCallback(() => {
    setFrozenTranscriptState(null)
  }, [])

  // Props for GlobalKeybindingHandlers component (rendered inside KeybindingSetup)
  const virtualScrollActive = isFullscreenEnvEnabled() && !disableVirtualScroll

  // Transcript search state. Hooks must be unconditional so they live here
  // (not inside the `if (screen === 'transcript')` branch below); isActive
  // gates the useInput. Query persists across bar open/close so n/N keep
  // working after Enter dismisses the bar (less semantics).
  const jumpRef = useRef<JumpHandle | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchCount, setSearchCount] = useState(0)
  const [searchCurrent, setSearchCurrent] = useState(0)
  const onSearchMatchesChange = useCallback((count: number, current: number) => {
    setSearchCount(count)
    setSearchCurrent(current)
  }, [])
  useInput(
    (input, key, event) => {
      if (key.ctrl || key.meta) return
      // No Esc handling here — less has no navigating mode. Search state
      // (highlights, n/N) is just state. Esc/q/ctrl+c → transcript:exit
      // (ungated). Highlights clear on exit via the screen-change effect.
      if (input === '/') {
        // Capture scrollTop NOW — typing is a preview, 0-matches snaps
        // back here. Synchronous ref write, fires before the bar's
        // mount-effect calls setSearchQuery.
        jumpRef.current?.setAnchor()
        setSearchOpen(true)
        event.stopImmediatePropagation()
        return
      }
      // Held-key batching: tokenizer coalesces to 'nnn'. Same uniform-batch
      // pattern as modalPagerAction in ScrollKeybindingHandler.tsx. Each
      // repeat is a step (n isn't idempotent like g).
      const c = input[0]
      if ((c === 'n' || c === 'N') && input === c.repeat(input.length) && searchCount > 0) {
        const fn = c === 'n' ? jumpRef.current?.nextMatch : jumpRef.current?.prevMatch
        if (fn) for (let i = 0; i < input.length; i++) fn()
        event.stopImmediatePropagation()
      }
    },
    // Search needs virtual scroll (jumpRef drives VirtualMessageList). [
    // kills it, so !dumpMode — after [ there's nothing to jump in.
    {
      isActive: screen === 'transcript' && virtualScrollActive && !searchOpen && !dumpMode,
    },
  )
  const { setQuery: setHighlight, scanElement, setPositions } = useSearchHighlight()

  // Resize → abort search. Positions are (msg, query, WIDTH)-keyed —
  // cached positions are stale after a width change (new layout, new
  // wrapping). Clearing searchQuery triggers VML's setSearchQuery('')
  // which clears positionsCache + setPositions(null). Bar closes.
  // User hits / again → fresh everything.
  const transcriptCols = useTerminalSize().columns
  const prevColsRef = React.useRef(transcriptCols)
  React.useEffect(() => {
    if (prevColsRef.current !== transcriptCols) {
      prevColsRef.current = transcriptCols
      if (searchQuery || searchOpen) {
        setSearchOpen(false)
        setSearchQuery('')
        setSearchCount(0)
        setSearchCurrent(0)
        jumpRef.current?.disarmSearch()
        setHighlight('')
      }
    }
  }, [transcriptCols, searchQuery, searchOpen, setHighlight])

  // Transcript escape hatches. Bare letters in modal context (no prompt
  // competing for input) — same class as g/G/j/k in ScrollKeybindingHandler.
  useInput(
    (input, key, event) => {
      if (key.ctrl || key.meta) return
      if (input === 'q') {
        // less: q quits the pager. ctrl+o toggles; q is the lineage exit.
        handleExitTranscript()
        event.stopImmediatePropagation()
        return
      }
      if (input === '[' && !dumpMode) {
        // Force dump-to-scrollback. Also expand + uncap — no point dumping
        // a subset. Terminal/tmux cmd-F can now find anything. Guard here
        // (not in isActive) so v still works post-[ — dump-mode footer at
        // ~4898 wires editorStatus, confirming v is meant to stay live.
        setDumpMode(true)
        setShowAllInTranscript(true)
        event.stopImmediatePropagation()
      } else if (input === 'v') {
        // less-style: v opens the file in $VISUAL/$EDITOR. Render the full
        // transcript (same path /export uses), write to tmp, hand off.
        // openFileInExternalEditor handles alt-screen suspend/resume for
        // terminal editors; GUI editors spawn detached.
        event.stopImmediatePropagation()
        // Drop double-taps: the render is async and a second press before it
        // completes would run a second parallel render (double memory, two
        // tempfiles, two editor spawns). editorGenRef only guards
        // transcript-exit staleness, not same-session concurrency.
        if (editorRenderingRef.current) return
        editorRenderingRef.current = true
        // Capture generation + make a staleness-aware setter. Each write
        // checks gen (transcript exit bumps it → late writes from the
        // async render go silent).
        const gen = editorGenRef.current
        const setStatus = (s: string): void => {
          if (gen !== editorGenRef.current) return
          clearTimeout(editorTimerRef.current)
          setEditorStatus(s)
        }
        setStatus(`rendering ${deferredMessages.length} messages…`)
        void (async () => {
          try {
            // Width = terminal minus vim's line-number gutter (4 digits +
            // space + slack). Floor at 80. PassThrough has no .columns so
            // without this Ink defaults to 80. Trailing-space strip: right-
            // aligned timestamps still leave a flexbox spacer run at EOL.
            // eslint-disable-next-line custom-rules/prefer-use-terminal-size -- one-shot at keypress time, not a reactive render dep
            const w = Math.max(80, (process.stdout.columns ?? 80) - 6)
            const raw = await renderMessagesToPlainText(deferredMessages, tools, w)
            const text = raw.replace(/[ \t]+$/gm, '')
            const path = join(tmpdir(), `cc-transcript-${Date.now()}.txt`)
            await writeFile(path, text)
            const opened = openFileInExternalEditor(path)
            setStatus(opened ? `opening ${path}` : `wrote ${path} · no $VISUAL/$EDITOR set`)
          } catch (e) {
            setStatus(`render failed: ${e instanceof Error ? e.message : String(e)}`)
          }
          editorRenderingRef.current = false
          if (gen !== editorGenRef.current) return
          editorTimerRef.current = setTimeout((s) => s(''), 4000, setEditorStatus)
        })()
      }
    },
    // !searchOpen: typing 'v' or '[' in the search bar is search input, not
    // a command. No !dumpMode here — v should work after [ (the [ handler
    // guards itself inline).
    {
      isActive: screen === 'transcript' && virtualScrollActive && !searchOpen,
    },
  )

  return {
    voice,
    remountKey,
    stopHookSpinnerSuffix,
    handleEnterTranscript,
    handleExitTranscript,
    virtualScrollActive,
    jumpRef,
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    searchCount,
    setSearchCount,
    searchCurrent,
    setSearchCurrent,
    onSearchMatchesChange,
    setHighlight,
    scanElement,
    setPositions,
    transcriptCols,
  }
}
