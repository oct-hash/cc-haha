// Extracted from REPL.tsx — stream/query state, permission queues, terminal title, tab status.
// useREPLStreamState is the second state block of the REPL component body.

import { feature } from 'bun:bundle'
import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { NetworkHostPattern } from '@anthropic-ai/sandbox-runtime'
import { getSessionId } from '../bootstrap/state.js'
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import type { SpinnerMode } from '../components/Spinner.js'
import type { Notification } from '../context/notifications.js'
import type { ScrollBoxHandle } from '../ink/components/ScrollBox.js'
import { useTabStatus } from '../ink.js'
import type { TabStatusKind } from '../ink/hooks/use-tab-status.js'
import type { RemoteSessionConfig } from '../remote/RemoteSessionManager.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { startPreventSleep, stopPreventSleep } from '../services/preventSleep.js'
import { useAppState } from '../state/AppState.js'
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import type { Message as MessageType, UserMessage } from '../types/message.js'
import type { PromptRequest, PromptResponse } from '../types/hooks.js'
import type { AutoUpdaterResult } from '../utils/autoUpdater.js'
import { getGlobalConfig } from '../utils/config.js'
import { updateSessionActivity } from '../utils/concurrentSessions.ts'
import { isFullscreenEnvEnabled, maybeGetTmuxMouseHint } from '../utils/fullscreen.js'
import type { StreamingThinking, StreamingToolUse } from '../utils/messages.js'
import { QueryGuard } from '../utils/QueryGuard.js'
import { getCurrentSessionTitle } from '../utils/sessionStorage.js'
import {
  registerLeaderToolUseConfirmQueue,
  unregisterLeaderToolUseConfirmQueue,
} from '../utils/swarm/leaderPermissionBridge.js'

export interface UseREPLStreamStateParams {
  initialMessages?: MessageType[]
  remoteSessionConfig?: RemoteSessionConfig
  addNotification: (content: Notification) => void
  mainThreadAgentDefinition?: AgentDefinition
  // Typed as unknown: these come from the foundation's useAppState selectors,
  // which currently resolve to unknown (untyped selector — see AppState.tsx).
  // The block only checks them for truthiness (isWaitingForApproval/waitingFor),
  // so unknown preserves the exact pre-extraction behavior without new errors.
  pendingWorkerRequest: unknown
  pendingSandboxRequest: unknown
  titleDisabled: boolean
}

export function useREPLStreamState(params: UseREPLStreamStateParams) {
  const {
    initialMessages,
    remoteSessionConfig,
    addNotification,
    mainThreadAgentDefinition,
    pendingWorkerRequest,
    pendingSandboxRequest,
    titleDisabled,
  } = params

  const [streamMode, setStreamMode] = useState<SpinnerMode>('responding')
  // Ref mirror so onSubmit can read the latest value without adding
  // streamMode to its deps. streamMode flips between
  // requesting/responding/tool-use ~10x per turn during streaming; having it
  // in onSubmit's deps was recreating onSubmit on every flip, which
  // cascaded into PromptInput prop churn and downstream useCallback/useMemo
  // invalidation. The only consumers inside callbacks are debug logging and
  // telemetry (handlePromptSubmit.ts), so a stale-by-one-render value is
  // harmless — but ref mirrors sync on every render anyway so it's fresh.
  const streamModeRef = useRef(streamMode)
  streamModeRef.current = streamMode
  const [streamingToolUses, setStreamingToolUses] = useState<StreamingToolUse[]>([])
  const [streamingThinking, setStreamingThinking] = useState<StreamingThinking | null>(null)

  // Auto-hide streaming thinking after 30 seconds of being completed
  useEffect(() => {
    if (streamingThinking && !streamingThinking.isStreaming && streamingThinking.streamingEndedAt) {
      const elapsed = Date.now() - streamingThinking.streamingEndedAt
      const remaining = 30000 - elapsed
      if (remaining > 0) {
        const timer = setTimeout(setStreamingThinking, remaining, null)
        return () => clearTimeout(timer)
      } else {
        setStreamingThinking(null)
      }
    }
  }, [streamingThinking])
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  // Ref that always points to the current abort controller, used by the
  // REPL bridge to abort the active query when a remote interrupt arrives.
  const abortControllerRef = useRef<AbortController | null>(null)
  abortControllerRef.current = abortController

  // Ref for the bridge result callback — set after useReplBridge initializes,
  // read in the onQuery finally block to notify mobile clients that a turn ended.
  const sendBridgeResultRef = useRef<() => void>(() => {})

  // Ref for the synchronous restore callback — set after restoreMessageSync is
  // defined, read in the onQuery finally block for auto-restore on interrupt.
  const restoreMessageSyncRef = useRef<(m: UserMessage) => void>(() => {})

  // Ref to the fullscreen layout's scroll box for keyboard scrolling.
  // Null when fullscreen mode is disabled (ref never attached).
  const scrollRef = useRef<ScrollBoxHandle>(null)
  // Separate ref for the modal slot's inner ScrollBox — passed through
  // FullscreenLayout → ModalContext so Tabs can attach it to its own
  // ScrollBox for tall content (e.g. /status's MCP-server list). NOT
  // keyboard-driven — ScrollKeybindingHandler stays on the outer ref so
  // PgUp/PgDn/wheel always scroll the transcript behind the modal.
  // Plumbing kept for future modal-scroll wiring.
  const modalScrollRef = useRef<ScrollBoxHandle>(null)
  // Timestamp of the last user-initiated scroll (wheel, PgUp/PgDn, ctrl+u,
  // End/Home, G, drag-to-scroll). Stamped in composedOnScroll — the single
  // chokepoint ScrollKeybindingHandler calls for every user scroll action.
  // Programmatic scrolls (repinScroll's scrollToBottom, sticky auto-follow)
  // do NOT go through composedOnScroll, so they don't stamp this. Ref not
  // state: no re-render on every wheel tick.
  const lastUserScrollTsRef = useRef(0)

  // Synchronous state machine for the query lifecycle. Replaces the
  // error-prone dual-state pattern where isLoading (React state, async
  // batched) and isQueryRunning (ref, sync) could desync. See QueryGuard.ts.
  const queryGuard = React.useRef(new QueryGuard()).current

  // Subscribe to the guard — true during dispatching or running.
  // This is the single source of truth for "is a local query in flight".
  const isQueryActive = React.useSyncExternalStore(queryGuard.subscribe, queryGuard.getSnapshot)

  // Separate loading flag for operations outside the local query guard:
  // remote sessions (useRemoteSession / useDirectConnect) and foregrounded
  // background tasks (useSessionBackgrounding). These don't route through
  // onQuery / queryGuard, so they need their own spinner-visibility state.
  // Initialize true if remote mode with initial prompt (CCR processing it).
  const [isExternalLoading, setIsExternalLoadingRaw] = React.useState(
    remoteSessionConfig?.hasInitialPrompt ?? false,
  )

  // Derived: any loading source active. Read-only — no setter. Local query
  // loading is driven by queryGuard (reserve/tryStart/end/cancelReservation),
  // external loading by setIsExternalLoading.
  const isLoading = isQueryActive || isExternalLoading

  // Elapsed time is computed by SpinnerWithVerb from these refs on each
  // animation frame, avoiding a useInterval that re-renders the entire REPL.
  const [userInputOnProcessing, setUserInputOnProcessingRaw] = React.useState<string | undefined>(
    undefined,
  )
  // messagesRef.current.length at the moment userInputOnProcessing was set.
  // The placeholder hides once displayedMessages grows past this — i.e. the
  // real user message has landed in the visible transcript.
  const userInputBaselineRef = React.useRef(0)
  // True while the submitted prompt is being processed but its user message
  // hasn't reached setMessages yet. setMessages uses this to keep the
  // baseline in sync when unrelated async messages (bridge status, hook
  // results, scheduled tasks) land during that window.
  const userMessagePendingRef = React.useRef(false)

  // Wall-clock time tracking refs for accurate elapsed time calculation
  const loadingStartTimeRef = React.useRef<number>(0)
  const totalPausedMsRef = React.useRef(0)
  const pauseStartTimeRef = React.useRef<number | null>(null)
  const resetTimingRefs = React.useCallback(() => {
    loadingStartTimeRef.current = Date.now()
    totalPausedMsRef.current = 0
    pauseStartTimeRef.current = null
  }, [])

  // Reset timing refs inline when isQueryActive transitions false→true.
  // queryGuard.reserve() (in executeUserInput) fires BEFORE processUserInput's
  // first await, but the ref reset in onQuery's try block runs AFTER. During
  // that gap, React renders the spinner with loadingStartTimeRef=0, computing
  // elapsedTimeMs = Date.now() - 0 ≈ 56 years. This inline reset runs on the
  // first render where isQueryActive is observed true — the same render that
  // first shows the spinner — so the ref is correct by the time the spinner
  // reads it. See INC-4549.
  const wasQueryActiveRef = React.useRef(false)
  if (isQueryActive && !wasQueryActiveRef.current) {
    resetTimingRefs()
  }
  wasQueryActiveRef.current = isQueryActive

  // Wrapper for setIsExternalLoading that resets timing refs on transition
  // to true — SpinnerWithVerb reads these for elapsed time, so they must be
  // reset for remote sessions / foregrounded tasks too (not just local
  // queries, which reset them in onQuery). Without this, a remote-only
  // session would show ~56 years elapsed (Date.now() - 0).
  const setIsExternalLoading = React.useCallback(
    (value: boolean) => {
      setIsExternalLoadingRaw(value)
      if (value) resetTimingRefs()
    },
    [resetTimingRefs],
  )

  // Start time of the first turn that had swarm teammates running
  // Used to compute total elapsed time (including teammate execution) for the deferred message
  const swarmStartTimeRef = React.useRef<number | null>(null)
  const swarmBudgetInfoRef = React.useRef<
    | {
        tokens: number
        limit: number
        nudges: number
      }
    | undefined
  >(undefined)

  // How long after the last keystroke before deferred dialogs are shown
  const PROMPT_SUPPRESSION_MS = 1500
  // True when user is actively typing — defers interrupt dialogs so keystrokes
  // don't accidentally dismiss or answer a permission prompt the user hasn't read yet.
  const [isPromptInputActive, setIsPromptInputActive] = React.useState(false)
  const [autoUpdaterResult, setAutoUpdaterResult] = useState<AutoUpdaterResult | null>(null)
  useEffect(() => {
    if (autoUpdaterResult?.notifications) {
      autoUpdaterResult.notifications.forEach((notification) => {
        addNotification({
          key: 'auto-updater-notification',
          text: notification,
          priority: 'low',
        })
      })
    }
  }, [autoUpdaterResult, addNotification])

  // tmux + fullscreen + `mouse off`: one-time hint that wheel won't scroll.
  // We no longer mutate tmux's session-scoped mouse option (it poisoned
  // sibling panes); tmux users already know this tradeoff from vim/less.
  useEffect(() => {
    if (isFullscreenEnvEnabled()) {
      void maybeGetTmuxMouseHint().then((hint) => {
        if (hint) {
          addNotification({
            key: 'tmux-mouse-hint',
            text: hint,
            priority: 'low',
          })
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [showUndercoverCallout, setShowUndercoverCallout] = useState(false)
  useEffect(() => {
    if ('external' === 'ant') {
      void (async () => {
        // Wait for repo classification to settle (memoized, no-op if primed).
        const { isInternalModelRepo } = await import('../utils/commitAttribution.js')
        await isInternalModelRepo()
        const { shouldShowUndercoverAutoNotice } = await import('../utils/undercover.js')
        if (shouldShowUndercoverAutoNotice()) {
          setShowUndercoverCallout(true)
        }
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [toolJSX, setToolJSXInternal] = useState<{
    jsx: React.ReactNode | null
    shouldHidePromptInput: boolean
    shouldContinueAnimation?: true
    showSpinner?: boolean
    isLocalJSXCommand?: boolean
    isImmediate?: boolean
  } | null>(null)

  // Track local JSX commands separately so tools can't overwrite them.
  // This enables "immediate" commands (like /btw) to persist while Claude is processing.
  const localJSXCommandRef = useRef<{
    jsx: React.ReactNode | null
    shouldHidePromptInput: boolean
    shouldContinueAnimation?: true
    showSpinner?: boolean
    isLocalJSXCommand: true
  } | null>(null)

  // Wrapper for setToolJSX that preserves local JSX commands (like /btw).
  // When a local JSX command is active, we ignore updates from tools
  // unless they explicitly set clearLocalJSX: true (from onDone callbacks).
  //
  // TO ADD A NEW IMMEDIATE COMMAND:
  // 1. Set `immediate: true` in the command definition
  // 2. Set `isLocalJSXCommand: true` when calling setToolJSX in the command's JSX
  // 3. In the onDone callback, use `setToolJSX({ jsx: null, shouldHidePromptInput: false, clearLocalJSX: true })`
  //    to explicitly clear the overlay when the user dismisses it
  const setToolJSX = useCallback(
    (
      args: {
        jsx: React.ReactNode | null
        shouldHidePromptInput: boolean
        shouldContinueAnimation?: true
        showSpinner?: boolean
        isLocalJSXCommand?: boolean
        clearLocalJSX?: boolean
      } | null,
    ) => {
      // If setting a local JSX command, store it in the ref
      if (args?.isLocalJSXCommand) {
        const { clearLocalJSX: _, ...rest } = args
        localJSXCommandRef.current = {
          ...rest,
          isLocalJSXCommand: true,
        }
        setToolJSXInternal(rest)
        return
      }

      // If there's an active local JSX command in the ref
      if (localJSXCommandRef.current) {
        // Allow clearing only if explicitly requested (from onDone callbacks)
        if (args?.clearLocalJSX) {
          localJSXCommandRef.current = null
          setToolJSXInternal(null)
          return
        }
        // Otherwise, keep the local JSX command visible - ignore tool updates
        return
      }

      // No active local JSX command, allow any update
      if (args?.clearLocalJSX) {
        setToolJSXInternal(null)
        return
      }
      setToolJSXInternal(args)
    },
    [],
  )
  const [toolUseConfirmQueue, setToolUseConfirmQueue] = useState<ToolUseConfirm[]>([])
  // Sticky footer JSX registered by permission request components (currently
  // only ExitPlanModePermissionRequest). Renders in FullscreenLayout's `bottom`
  // slot so response options stay visible while the user scrolls a long plan.
  const [permissionStickyFooter, setPermissionStickyFooter] = useState<React.ReactNode | null>(null)
  const [sandboxPermissionRequestQueue, setSandboxPermissionRequestQueue] = useState<
    Array<{
      hostPattern: NetworkHostPattern
      resolvePromise: (allowConnection: boolean) => void
    }>
  >([])
  const [promptQueue, setPromptQueue] = useState<
    Array<{
      request: PromptRequest
      title: string
      toolInputSummary?: string | null
      resolve: (response: PromptResponse) => void
      reject: (error: Error) => void
    }>
  >([])

  // Track bridge cleanup functions for sandbox permission requests so the
  // local dialog handler can cancel the remote prompt when the local user
  // responds first. Keyed by host to support concurrent same-host requests.
  const sandboxBridgeCleanupRef = useRef<Map<string, Array<() => void>>>(new Map())

  // -- Terminal title management
  // Session title (set via /rename or restored on resume) wins over
  // the agent name, which wins over the Haiku-extracted topic;
  // all fall back to the product name.
  const terminalTitleFromRename = useAppState((s) => s.settings.terminalTitleFromRename) !== false
  const sessionTitle = terminalTitleFromRename ? getCurrentSessionTitle(getSessionId()) : undefined
  const [haikuTitle, setHaikuTitle] = useState<string>()
  // Gates the one-shot Haiku call that generates the tab title. Seeded true
  // on resume (initialMessages present) so we don't re-title a resumed
  // session from mid-conversation context.
  const haikuTitleAttemptedRef = useRef((initialMessages?.length ?? 0) > 0)
  const agentTitle = mainThreadAgentDefinition?.agentType
  const terminalTitle = sessionTitle ?? agentTitle ?? haikuTitle ?? 'Claude Code'
  const isWaitingForApproval =
    toolUseConfirmQueue.length > 0 ||
    promptQueue.length > 0 ||
    pendingWorkerRequest ||
    pendingSandboxRequest
  // Local-jsx commands (like /plugin, /config) show user-facing dialogs that
  // wait for input. Require jsx != null — if the flag is stuck true but jsx
  // is null, treat as not-showing so TextInput focus and queue processor
  // aren't deadlocked by a phantom overlay.
  const isShowingLocalJSXCommand = toolJSX?.isLocalJSXCommand === true && toolJSX?.jsx != null
  const titleIsAnimating = isLoading && !isWaitingForApproval && !isShowingLocalJSXCommand
  // Title animation state lives in <AnimatedTerminalTitle> so the 960ms tick
  // doesn't re-render REPL. titleDisabled/terminalTitle are still computed
  // here because onQueryImpl reads them (background session description,
  // haiku title extraction gate).

  // Prevent macOS from sleeping while Claude is working
  useEffect(() => {
    if (isLoading && !isWaitingForApproval && !isShowingLocalJSXCommand) {
      startPreventSleep()
      return () => stopPreventSleep()
    }
  }, [isLoading, isWaitingForApproval, isShowingLocalJSXCommand])
  const sessionStatus: TabStatusKind =
    isWaitingForApproval || isShowingLocalJSXCommand ? 'waiting' : isLoading ? 'busy' : 'idle'
  const waitingFor =
    sessionStatus !== 'waiting'
      ? undefined
      : toolUseConfirmQueue.length > 0
        ? `approve ${toolUseConfirmQueue[0]!.tool.name}`
        : pendingWorkerRequest
          ? 'worker request'
          : pendingSandboxRequest
            ? 'sandbox request'
            : isShowingLocalJSXCommand
              ? 'dialog open'
              : 'input needed'

  // Push status to the PID file for `claude ps`. Fire-and-forget; ps falls
  // back to transcript-tail derivation when this is missing/stale.
  useEffect(() => {
    if (feature('BG_SESSIONS')) {
      void updateSessionActivity({
        status: sessionStatus,
        waitingFor,
      })
    }
  }, [sessionStatus, waitingFor])

  // 3P default: off — OSC 21337 is ant-only while the spec stabilizes.
  // Gated so we can roll back if the sidebar indicator conflicts with
  // the title spinner in terminals that render both. When the flag is
  // on, the user-facing config setting controls whether it's active.
  const tabStatusGateEnabled = getFeatureValue_CACHED_MAY_BE_STALE('tengu_terminal_sidebar', false)
  const showStatusInTerminalTab =
    tabStatusGateEnabled && (getGlobalConfig().showStatusInTerminalTab ?? false)
  useTabStatus(titleDisabled || !showStatusInTerminalTab ? null : sessionStatus)

  // Register the leader's setToolUseConfirmQueue for in-process teammates
  useEffect(() => {
    registerLeaderToolUseConfirmQueue(setToolUseConfirmQueue)
    return () => unregisterLeaderToolUseConfirmQueue()
  }, [setToolUseConfirmQueue])
  return {
    streamMode,
    setStreamMode,
    streamModeRef,
    streamingToolUses,
    setStreamingToolUses,
    streamingThinking,
    setStreamingThinking,
    abortController,
    setAbortController,
    abortControllerRef,
    sendBridgeResultRef,
    restoreMessageSyncRef,
    scrollRef,
    modalScrollRef,
    lastUserScrollTsRef,
    queryGuard,
    isExternalLoading,
    setIsExternalLoading,
    isLoading,
    userInputOnProcessing,
    setUserInputOnProcessingRaw,
    userInputBaselineRef,
    userMessagePendingRef,
    loadingStartTimeRef,
    totalPausedMsRef,
    pauseStartTimeRef,
    resetTimingRefs,
    swarmStartTimeRef,
    swarmBudgetInfoRef,
    PROMPT_SUPPRESSION_MS,
    isPromptInputActive,
    setIsPromptInputActive,
    autoUpdaterResult,
    setAutoUpdaterResult,
    showUndercoverCallout,
    setShowUndercoverCallout,
    toolJSX,
    setToolJSX,
    toolUseConfirmQueue,
    setToolUseConfirmQueue,
    permissionStickyFooter,
    setPermissionStickyFooter,
    sandboxPermissionRequestQueue,
    setSandboxPermissionRequestQueue,
    promptQueue,
    setPromptQueue,
    sandboxBridgeCleanupRef,
    sessionTitle,
    haikuTitle,
    setHaikuTitle,
    haikuTitleAttemptedRef,
    agentTitle,
    terminalTitle,
    isShowingLocalJSXCommand,
    titleIsAnimating,
    showStatusInTerminalTab,
  }
}
