// Extracted from REPL.handlers.ts — stash domain

import type { RefObject } from 'react'
import { prependModeCharacterToInput } from '../components/PromptInput/inputModes.js'
import { addToHistory } from '../history.js'
import type { PastedContent } from '../utils/config.js'
import { prependToShellHistoryCache } from '../utils/suggestions/shellHistoryCompletion.js'

// ── Stash types ───────────────────────────────────────────────────────

export interface StashedPrompt {
  text: string
  cursorOffset: number
  pastedContents: Record<number, PastedContent>
}

// ── Pre-submit stash resolution ───────────────────────────────────────

export interface ResolveStashBeforeSubmitParams {
  input: string
  speculationAccept: unknown
  isLoading: boolean
  isRemoteMode: boolean
  stashedPrompt: StashedPrompt | undefined
  fromKeybinding?: boolean
  setInputValue: (value: string) => void
  setCursorOffset: (offset: number) => void
  setPastedContents: (value: Record<number, PastedContent>) => void
  setStashedPrompt: (value: StashedPrompt | undefined) => void
}

export interface StashBeforeSubmitResult {
  isSlashCommand: boolean
  submitsNow: boolean
}

/**
 * Restore stashed prompt or clear input before a new submit.
 * Returns isSlashCommand and submitsNow for use by downstream logic.
 */
export function resolveStashBeforeSubmit(
  params: ResolveStashBeforeSubmitParams,
): StashBeforeSubmitResult {
  const {
    input,
    speculationAccept,
    isLoading,
    isRemoteMode,
    stashedPrompt,
    fromKeybinding,
    setInputValue,
    setCursorOffset,
    setPastedContents,
    setStashedPrompt,
  } = params

  const isSlashCommand = !speculationAccept && input.trim().startsWith('/')
  // Submit runs "now" (not queued) when not already loading, or when
  // accepting speculation, or in remote mode (which sends via WS and
  // returns early without calling handlePromptSubmit).
  const submitsNow = !isLoading || !!speculationAccept || isRemoteMode

  if (stashedPrompt !== undefined && !isSlashCommand && submitsNow) {
    setInputValue(stashedPrompt.text)
    setCursorOffset(stashedPrompt.cursorOffset)
    setPastedContents(stashedPrompt.pastedContents)
    setStashedPrompt(undefined)
  } else if (submitsNow) {
    if (!fromKeybinding) {
      // Clear input when not loading or accepting speculation.
      // Preserve input for keybinding-triggered commands.
      setInputValue('')
      setCursorOffset(0)
    }
    setPastedContents({})
  }

  return { isSlashCommand, submitsNow }
}

// ── Submit state reset ────────────────────────────────────────────────

export interface ApplySubmitStateResetParams {
  submitsNow: boolean
  isSlashCommand: boolean
  inputMode: string
  input: string
  speculationAccept: unknown
  isRemoteMode: boolean
  setInputMode: (mode: string) => void
  setIDESelection: (value: undefined) => void
  setSubmitCount: (updater: (n: number) => number) => void
  clearBuffer: () => void
  tipPickedThisTurnRef: RefObject<boolean>
  setUserInputOnProcessing: (input: string) => void
  resetTimingRefs: () => void
  incrementAttribution: (() => void) | undefined
}

/**
 * Reset UI state on submit: clear buffer, reset modes, show placeholder,
 * and optionally increment attribution counter.
 */
export function applySubmitStateReset(params: ApplySubmitStateResetParams): void {
  const {
    submitsNow,
    isSlashCommand,
    inputMode,
    input,
    speculationAccept,
    isRemoteMode,
    setInputMode,
    setIDESelection,
    setSubmitCount,
    clearBuffer,
    tipPickedThisTurnRef,
    setUserInputOnProcessing,
    resetTimingRefs,
    incrementAttribution,
  } = params

  if (!submitsNow) return

  setInputMode('prompt')
  setIDESelection(undefined)
  setSubmitCount((_) => _ + 1)
  clearBuffer()
  tipPickedThisTurnRef.current = false

  // Show the placeholder in the same React batch as setInputValue('').
  // Skip for slash/bash (they have their own echo), speculation and remote
  // mode (both setMessages directly with no gap to bridge).
  if (!isSlashCommand && inputMode === 'prompt' && !speculationAccept && !isRemoteMode) {
    setUserInputOnProcessing(input)
    // showSpinner includes userInputOnProcessing, so the spinner appears
    // on this render. Reset timing refs now (before queryGuard.reserve()
    // would) so elapsed time doesn't read as Date.now() - 0.
    resetTimingRefs()
  }

  // Increment prompt count for attribution tracking and save snapshot.
  // The snapshot persists promptCount so it survives compaction.
  incrementAttribution?.()
}

// ── Post-submit deferred stash restoration ────────────────────────────

export interface ResolveStashAfterSubmitParams {
  isSlashCommand: boolean
  isLoading: boolean
  stashedPrompt: StashedPrompt | undefined
  setInputValue: (value: string) => void
  setCursorOffset: (offset: number) => void
  setPastedContents: (value: Record<number, PastedContent>) => void
  setStashedPrompt: (value: StashedPrompt | undefined) => void
}

/**
 * Restore stash that was deferred before submit. Two cases:
 * - Slash command: handlePromptSubmit awaited the full command execution
 *   (including interactive pickers). Restoring now places the stash back in
 *   the visible input.
 * - Loading (queued): handlePromptSubmit enqueued + cleared input, then
 *   returned quickly. Restoring now places the stash back after the clear.
 */
export function resolveStashAfterSubmit(params: ResolveStashAfterSubmitParams): void {
  const {
    isSlashCommand,
    isLoading,
    stashedPrompt,
    setInputValue,
    setCursorOffset,
    setPastedContents,
    setStashedPrompt,
  } = params

  if ((isSlashCommand || isLoading) && stashedPrompt !== undefined) {
    setInputValue(stashedPrompt.text)
    setCursorOffset(stashedPrompt.cursorOffset)
    setPastedContents(stashedPrompt.pastedContents)
    setStashedPrompt(undefined)
  }
}

// ── Add to history ──────────────────────────────────────────────────────

export interface AddToHistoryParams {
  fromKeybinding: boolean | undefined
  speculationAccept: unknown
  input: string
  inputMode: string
  pastedContents: Record<number, PastedContent>
}

/**
 * Add the submitted input to arrow-key history.
 * Skipped for keybinding-triggered commands (user didn't type the command)
 * and for queued-command flows (which don't call onSubmit).
 */
export function tryAddToHistory(params: AddToHistoryParams): void {
  const { fromKeybinding, speculationAccept, input, inputMode, pastedContents } = params

  if (fromKeybinding) return

  addToHistory({
    display: speculationAccept ? input : prependModeCharacterToInput(input, inputMode),
    pastedContents: speculationAccept ? {} : pastedContents,
  })

  // Add the just-submitted command to the front of the ghost-text
  // cache so it's suggested immediately (not after the 60s TTL).
  if (inputMode === 'bash') {
    prependToShellHistoryCache(input.trim())
  }
}
