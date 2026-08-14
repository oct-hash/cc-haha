// Extracted from REPL.tsx — dialog/overlay focus resolution, the cancel
// (Escape) handler, and the CancelRequestHandler props. useREPLDialogs owns
// exitFlow/isExiting, getFocusedInputDialog (priority-ordered dialog focus),
// onCancel, and cancelRequestProps.

import { feature } from 'bun:bundle'
import * as React from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { snapshotOutputTokensForTurn } from '../bootstrap/state.js'
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import type { SpinnerMode } from '../components/Spinner.js'
import type { PromptRequest, PromptResponse } from '../types/hooks.js'
import type { Message as MessageType } from '../types/message.js'
import type { PromptInputMode, VimMode } from '../types/textInputTypes.js'
import type { PastedContent } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import { popAllEditable } from '../utils/messageQueueManager.js'
import { createAgentsKilledMessage, createAssistantMessage } from '../utils/messages.js'
import type { QueryGuard } from '../utils/QueryGuard.js'
import type { ToolJSXValue } from './REPL.render.js'
import type { Screen } from './REPL.types.js'

// Dead code elimination: conditional require (same pattern as REPL.tsx).
/* eslint-disable @typescript-eslint/no-require-imports */
const proactiveModule =
  feature('PROACTIVE') || feature('KAIROS') ? require('../proactive/index.js') : null
/* eslint-enable @typescript-eslint/no-require-imports */

type PromptQueueItem = {
  request: PromptRequest
  title: string
  toolInputSummary?: string | null
  resolve: (response: PromptResponse) => void
  reject: (error: Error) => void
}

type SandboxPermissionRequestItem = {
  hostPattern: unknown
  resolvePromise: (allowConnection: boolean) => void
}

export interface UseREPLDialogsParams {
  isLoading: boolean
  showCostDialog: boolean
  isMessageSelectorVisible: boolean
  isPromptInputActive: boolean
  sandboxPermissionRequestQueue: SandboxPermissionRequestItem[]
  toolJSX: ToolJSXValue | null
  toolUseConfirmQueue: ToolUseConfirm[]
  setToolUseConfirmQueue: React.Dispatch<React.SetStateAction<ToolUseConfirm[]>>
  promptQueue: PromptQueueItem[]
  setPromptQueue: React.Dispatch<React.SetStateAction<PromptQueueItem[]>>
  // Foundation selectors flow through as unknown (untyped useAppState
  // selector); narrowed to the queue access inside the hook.
  workerSandboxPermissions: unknown
  elicitation: unknown
  idleReturnPending: { input: string; idleMinutes: number } | null
  ultraplanPendingChoice: unknown
  ultraplanLaunchPending: unknown
  showIdeOnboarding: boolean
  showModelSwitchCallout: boolean
  showUndercoverCallout: boolean
  showEffortCallout: boolean
  showRemoteCallout: unknown
  lspRecommendation: unknown
  hintRecommendation: unknown
  showDesktopUpsellStartup: boolean
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>
  resetLoadingState: () => void
  streamMode: SpinnerMode
  queryGuard: QueryGuard
  skipIdleCheckRef: React.MutableRefObject<boolean>
  streamingText: string | null
  abortController: AbortController | null
  setAbortController: React.Dispatch<React.SetStateAction<AbortController | null>>
  activeRemote: { isRemoteMode: boolean; cancelRequest: () => void }
  mrOnTurnComplete: (all: MessageType[], aborted: boolean) => Promise<void>
  messagesRef: React.MutableRefObject<MessageType[]>
  inputValue: string
  setInputValue: (value: string) => void
  setInputMode: React.Dispatch<React.SetStateAction<PromptInputMode>>
  setPastedContents: React.Dispatch<React.SetStateAction<Record<number, PastedContent>>>
  repinScroll: () => void
  pauseStartTimeRef: React.MutableRefObject<number | null>
  totalPausedMsRef: React.MutableRefObject<number>
  screen: Screen
  vimMode: VimMode
  isSearchingHistory: boolean
  isHelpOpen: boolean
  inputMode: PromptInputMode
  showBashesDialog: string | boolean
}

export function useREPLDialogs(params: UseREPLDialogsParams) {
  const {
    isLoading,
    showCostDialog,
    isMessageSelectorVisible,
    isPromptInputActive,
    sandboxPermissionRequestQueue,
    toolJSX,
    toolUseConfirmQueue,
    setToolUseConfirmQueue,
    promptQueue,
    setPromptQueue,
    workerSandboxPermissions,
    elicitation,
    idleReturnPending,
    ultraplanPendingChoice,
    ultraplanLaunchPending,
    showIdeOnboarding,
    showModelSwitchCallout,
    showUndercoverCallout,
    showEffortCallout,
    showRemoteCallout,
    lspRecommendation,
    hintRecommendation,
    showDesktopUpsellStartup,
    setMessages,
    resetLoadingState,
    streamMode,
    queryGuard,
    skipIdleCheckRef,
    streamingText,
    abortController,
    setAbortController,
    activeRemote,
    mrOnTurnComplete,
    messagesRef,
    inputValue,
    setInputValue,
    setInputMode,
    setPastedContents,
    repinScroll,
    pauseStartTimeRef,
    totalPausedMsRef,
    screen,
    vimMode,
    isSearchingHistory,
    isHelpOpen,
    inputMode,
    showBashesDialog,
  } = params

  // Narrow the unknown foundation selectors to the queue access these
  // dialog checks need (truthiness of queue[0]).
  const workerSandboxPermissionQueue = (workerSandboxPermissions as { queue: unknown[] }).queue
  const elicitationQueue = (elicitation as { queue: unknown[] }).queue

  // State for exit feedback flow
  const [exitFlow, setExitFlow] = useState<React.ReactNode>(null)
  const [isExiting, setIsExiting] = useState(false)

  // Calculate if cost dialog should be shown
  const showingCostDialog = !isLoading && showCostDialog

  // Ref to track current focusedInputDialog for use in callbacks
  // This avoids stale closures when checking dialog state in timer callbacks
  const focusedInputDialogRef = React.useRef<ReturnType<typeof getFocusedInputDialog>>(undefined)

  // Determine which dialog should have focus (if any)
  // Permission and interactive dialogs can show even when toolJSX is set,
  // as long as shouldContinueAnimation is true. This prevents deadlocks when
  // agents set background hints while waiting for user interaction.
  function getFocusedInputDialog():
    | 'message-selector'
    | 'sandbox-permission'
    | 'tool-permission'
    | 'prompt'
    | 'worker-sandbox-permission'
    | 'elicitation'
    | 'cost'
    | 'idle-return'
    | 'init-onboarding'
    | 'ide-onboarding'
    | 'model-switch'
    | 'undercover-callout'
    | 'effort-callout'
    | 'remote-callout'
    | 'lsp-recommendation'
    | 'plugin-hint'
    | 'desktop-upsell'
    | 'ultraplan-choice'
    | 'ultraplan-launch'
    | undefined {
    // Exit states always take precedence
    if (isExiting || exitFlow) return undefined

    // High priority dialogs (always show regardless of typing)
    if (isMessageSelectorVisible) return 'message-selector'

    // Suppress interrupt dialogs while user is actively typing
    if (isPromptInputActive) return undefined
    if (sandboxPermissionRequestQueue[0]) return 'sandbox-permission'

    // Permission/interactive dialogs (show unless blocked by toolJSX)
    const allowDialogsWithAnimation = !toolJSX || toolJSX.shouldContinueAnimation
    if (allowDialogsWithAnimation && toolUseConfirmQueue[0]) return 'tool-permission'
    if (allowDialogsWithAnimation && promptQueue[0]) return 'prompt'
    // Worker sandbox permission prompts (network access) from swarm workers
    if (allowDialogsWithAnimation && workerSandboxPermissionQueue[0])
      return 'worker-sandbox-permission'
    if (allowDialogsWithAnimation && elicitationQueue[0]) return 'elicitation'
    if (allowDialogsWithAnimation && showingCostDialog) return 'cost'
    if (allowDialogsWithAnimation && idleReturnPending) return 'idle-return'
    if (feature('ULTRAPLAN') && allowDialogsWithAnimation && !isLoading && ultraplanPendingChoice)
      return 'ultraplan-choice'
    if (feature('ULTRAPLAN') && allowDialogsWithAnimation && !isLoading && ultraplanLaunchPending)
      return 'ultraplan-launch'

    // Onboarding dialogs (special conditions)
    if (allowDialogsWithAnimation && showIdeOnboarding) return 'ide-onboarding'

    // Model switch callout (ant-only, eliminated from external builds)
    if (process.env.USER_TYPE === 'ant' && allowDialogsWithAnimation && showModelSwitchCallout)
      return 'model-switch'

    // Undercover auto-enable explainer (ant-only, eliminated from external builds)
    if (process.env.USER_TYPE === 'ant' && allowDialogsWithAnimation && showUndercoverCallout)
      return 'undercover-callout'

    // Effort callout (shown once for Opus 4.6 users when effort is enabled)
    if (allowDialogsWithAnimation && showEffortCallout) return 'effort-callout'

    // Remote callout (shown once before first bridge enable)
    if (allowDialogsWithAnimation && showRemoteCallout) return 'remote-callout'

    // LSP plugin recommendation (lowest priority - non-blocking suggestion)
    if (allowDialogsWithAnimation && lspRecommendation) return 'lsp-recommendation'

    // Plugin hint from CLI/SDK stderr (same priority band as LSP rec)
    if (allowDialogsWithAnimation && hintRecommendation) return 'plugin-hint'

    // Desktop app upsell (max 3 launches, lowest priority)
    if (allowDialogsWithAnimation && showDesktopUpsellStartup) return 'desktop-upsell'
    return undefined
  }
  const focusedInputDialog = getFocusedInputDialog()

  // True when permission prompts exist but are hidden because the user is typing
  const hasSuppressedDialogs =
    isPromptInputActive &&
    (sandboxPermissionRequestQueue[0] ||
      toolUseConfirmQueue[0] ||
      promptQueue[0] ||
      workerSandboxPermissionQueue[0] ||
      elicitationQueue[0] ||
      showingCostDialog)

  // Keep ref in sync so timer callbacks can read the current value
  focusedInputDialogRef.current = focusedInputDialog

  // Immediately capture pause/resume when focusedInputDialog changes
  // This ensures accurate timing even under high system load, rather than
  // relying on the 100ms polling interval to detect state changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: stable refs/setters/store (React identity-stable, not a real dependency)
  useEffect(() => {
    if (!isLoading) return
    const isPaused = focusedInputDialog === 'tool-permission'
    const now = Date.now()
    if (isPaused && pauseStartTimeRef.current === null) {
      // Just entered pause state - record the exact moment
      pauseStartTimeRef.current = now
    } else if (!isPaused && pauseStartTimeRef.current !== null) {
      // Just exited pause state - accumulate paused time immediately
      totalPausedMsRef.current += now - pauseStartTimeRef.current
      pauseStartTimeRef.current = null
    }
  }, [focusedInputDialog, isLoading])

  // Re-pin scroll to bottom whenever the permission overlay appears or
  // dismisses. Overlay now renders below messages inside the same
  // ScrollBox (no remount), so we need an explicit scrollToBottom for:
  //  - appear: user may have been scrolled up (sticky broken) — the
  //    dialog is blocking and must be visible
  //  - dismiss: user may have scrolled up to read context during the
  //    overlay, and onScroll was suppressed so the pill state is stale
  // useLayoutEffect so the re-pin commits before the Ink frame renders —
  // no 1-frame flash of the wrong scroll position.
  const prevDialogRef = useRef(focusedInputDialog)
  useLayoutEffect(() => {
    const was = prevDialogRef.current === 'tool-permission'
    const now = focusedInputDialog === 'tool-permission'
    if (was !== now) repinScroll()
    prevDialogRef.current = focusedInputDialog
  }, [focusedInputDialog, repinScroll])
  function onCancel() {
    if (focusedInputDialog === 'elicitation') {
      // Elicitation dialog handles its own Escape, and closing it shouldn't affect any loading state.
      return
    }
    logForDebugging(`[onCancel] focusedInputDialog=${focusedInputDialog} streamMode=${streamMode}`)

    // Pause proactive mode so the user gets control back.
    // It will resume when they submit their next input (see onSubmit).
    if (feature('PROACTIVE') || feature('KAIROS')) {
      proactiveModule?.pauseProactive()
    }
    queryGuard.forceEnd()
    skipIdleCheckRef.current = false

    // Preserve partially-streamed text so the user can read what was
    // generated before pressing Esc. Pushed before resetLoadingState clears
    // streamingText, and before query.ts yields the async interrupt marker,
    // giving final order [user, partial-assistant, [Request interrupted by user]].
    if (streamingText?.trim()) {
      setMessages((prev) => [
        ...prev,
        createAssistantMessage({
          content: streamingText,
        }),
      ])
    }
    resetLoadingState()

    // Clear any active token budget so the backstop doesn't fire on
    // a stale budget if the query generator hasn't exited yet.
    if (feature('TOKEN_BUDGET')) {
      snapshotOutputTokensForTurn(null)
    }
    if (focusedInputDialog === 'tool-permission') {
      // Tool use confirm handles the abort signal itself
      toolUseConfirmQueue[0]?.onAbort()
      setToolUseConfirmQueue([])
    } else if (focusedInputDialog === 'prompt') {
      // Reject all pending prompts and clear the queue
      for (const item of promptQueue) {
        item.reject(new Error('Prompt cancelled by user'))
      }
      setPromptQueue([])
      abortController?.abort('user-cancel')
    } else if (activeRemote.isRemoteMode) {
      // Remote mode: send interrupt signal to CCR
      activeRemote.cancelRequest()
    } else {
      abortController?.abort('user-cancel')
    }

    // Clear the controller so subsequent Escape presses don't see a stale
    // aborted signal. Without this, canCancelRunningTask is false (signal
    // defined but .aborted === true), so isActive becomes false if no other
    // activating conditions hold — leaving the Escape keybinding inactive.
    setAbortController(null)

    // forceEnd() skips the finally path — fire directly (aborted=true).
    void mrOnTurnComplete(messagesRef.current, true)
  }

  // Function to handle queued command when canceling a permission request
  const handleQueuedCommandOnCancel = useCallback(() => {
    const result = popAllEditable(inputValue, 0)
    if (!result) return
    setInputValue(result.text)
    setInputMode('prompt')

    // Restore images from queued commands to pastedContents
    if (result.images.length > 0) {
      setPastedContents((prev) => {
        const newContents = {
          ...prev,
        }
        for (const image of result.images) {
          newContents[image.id] = image
        }
        return newContents
      })
    }
  }, [setInputValue, setInputMode, inputValue, setPastedContents])

  // CancelRequestHandler props - rendered inside KeybindingSetup
  const cancelRequestProps = {
    setToolUseConfirmQueue,
    onCancel,
    onAgentsKilled: () => setMessages((prev) => [...prev, createAgentsKilledMessage()]),
    isMessageSelectorVisible: isMessageSelectorVisible || !!showBashesDialog,
    screen,
    abortSignal: abortController?.signal,
    popCommandFromQueue: handleQueuedCommandOnCancel,
    vimMode,
    isLocalJSXCommand: toolJSX?.isLocalJSXCommand,
    isSearchingHistory,
    isHelpOpen,
    inputMode,
    inputValue,
    streamMode,
  }

  return {
    exitFlow,
    setExitFlow,
    isExiting,
    setIsExiting,
    showingCostDialog,
    focusedInputDialog,
    hasSuppressedDialogs,
    focusedInputDialogRef,
    handleQueuedCommandOnCancel,
    onCancel,
    cancelRequestProps,
  }
}
