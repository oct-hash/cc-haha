import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { RefObject } from 'react'
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import { getTotalInputTokens } from '../bootstrap/state.js'
import {
  type Command,
  type CommandResultDisplay,
  getCommandName,
  isCommandEnabled,
} from '../commands.js'
import { prependModeCharacterToInput } from '../components/PromptInput/inputModes.js'
import { LOCAL_COMMAND_STDOUT_TAG } from '../constants/xml.js'
import { addToHistory, expandPastedTextRefs, parseReferences } from '../history.js'
import type { SetToolJSXFn } from '../Tool.js'
import type { Message as MessageType } from '../types/message.js'
import { createAbortController } from '../utils/abortController.js'
import type { PastedContent } from '../utils/config.js'
import { getGlobalConfig } from '../utils/config.js'
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js'
import type { PromptInputHelpers } from '../utils/handlePromptSubmit.js'
import {
  createCommandInputMessage,
  createUserMessage,
  formatCommandInputTags,
} from '../utils/messages.js'
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'
import type { QueryGuard } from '../utils/QueryGuard.js'
import { prependToShellHistoryCache } from '../utils/suggestions/shellHistoryCompletion.js'
import type { RemoteMessageContent } from '../utils/teleport/api.js'
import { escapeXml } from '../utils/xml.js'

export interface HandleImmediateCommandParams {
  input: string
  helpers: PromptInputHelpers
  commands: Command[]
  queryGuard: QueryGuard
  pastedContents: Record<number, PastedContent>
  inputValueRef: RefObject<string>
  stashedPrompt:
    | {
        text: string
        cursorOffset: number
        pastedContents: Record<number, PastedContent>
      }
    | undefined
  messagesRef: RefObject<MessageType[]>
  mainLoopModel: string
  setInputValue: (value: string) => void
  setPastedContents: (value: Record<number, PastedContent>) => void
  setStashedPrompt: (
    value:
      | {
          text: string
          cursorOffset: number
          pastedContents: Record<number, PastedContent>
        }
      | undefined,
  ) => void
  setToolJSX: SetToolJSXFn
  setMessages: (updater: MessageType[] | ((prev: MessageType[]) => MessageType[])) => void
  addNotification: (notification: {
    key: string
    text: string
    priority: string
    timeoutMs?: number
  }) => void
  getToolUseContext: (
    messages: MessageType[],
    newMessages: MessageType[],
    abortController: AbortController,
    model: string,
  ) => ProcessUserInputContext
  idleHintShownRef: RefObject<boolean>
  lastQueryCompletionTimeRef: RefObject<number>
  options?: { fromKeybinding?: boolean }
}

/**
 * Try to handle a slash command as an immediate command (executed while the
 * model is processing). Commands opt in via `immediate: true`, or are treated
 * as immediate when triggered via keybinding.
 *
 * @returns true if the command was handled (caller should return early),
 *          false to continue normal submit flow.
 */
export async function tryHandleImmediateCommand(
  params: HandleImmediateCommandParams,
): Promise<boolean> {
  const {
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
  } = params

  // Expand [Pasted text #N] refs so immediate commands (e.g. /btw) receive
  // the pasted content, not the placeholder. The non-immediate path gets
  // this expansion later in handlePromptSubmit.
  const trimmedInput = expandPastedTextRefs(input, pastedContents).trim()
  const spaceIndex = trimmedInput.indexOf(' ')
  const commandName = spaceIndex === -1 ? trimmedInput.slice(1) : trimmedInput.slice(1, spaceIndex)
  const commandArgs = spaceIndex === -1 ? '' : trimmedInput.slice(spaceIndex + 1).trim()

  // Find matching command - treat as immediate if:
  // 1. Command has `immediate: true`, OR
  // 2. Command was triggered via keybinding (fromKeybinding option)
  const matchingCommand = commands.find(
    (cmd) =>
      isCommandEnabled(cmd) &&
      (cmd.name === commandName ||
        cmd.aliases?.includes(commandName) ||
        getCommandName(cmd) === commandName),
  )
  if (matchingCommand?.name === 'clear' && idleHintShownRef.current) {
    logEvent('tengu_idle_return_action', {
      action: 'hint_converted' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      variant:
        idleHintShownRef.current as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      idleMinutes: Math.round((Date.now() - lastQueryCompletionTimeRef.current) / 60_000),
      messageCount: messagesRef.current.length,
      totalInputTokens: getTotalInputTokens(),
    })
    idleHintShownRef.current = false
  }
  const shouldTreatAsImmediate =
    queryGuard.isActive && (matchingCommand?.immediate || options?.fromKeybinding)
  if (matchingCommand && shouldTreatAsImmediate && matchingCommand.type === 'local-jsx') {
    // Only clear input if the submitted text matches what's in the prompt.
    // When a command keybinding fires, input is "/<command>" but the actual
    // input value is the user's existing text - don't clear it in that case.
    if (input.trim() === inputValueRef.current.trim()) {
      setInputValue('')
      helpers.setCursorOffset(0)
      helpers.clearBuffer()
      setPastedContents({})
    }
    const pastedTextRefs = parseReferences(input).filter(
      (r) => pastedContents[r.id]?.type === 'text',
    )
    const pastedTextCount = pastedTextRefs.length
    const pastedTextBytes = pastedTextRefs.reduce(
      (sum, r) => sum + (pastedContents[r.id]?.content.length ?? 0),
      0,
    )
    logEvent('tengu_paste_text', {
      pastedTextCount,
      pastedTextBytes,
    })
    logEvent('tengu_immediate_command_executed', {
      commandName:
        matchingCommand.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      fromKeybinding: options?.fromKeybinding ?? false,
    })

    // Execute the command directly
    const executeImmediateCommand = async (): Promise<void> => {
      let doneWasCalled = false
      const onDone = (
        result?: string,
        doneOptions?: {
          display?: CommandResultDisplay
          metaMessages?: string[]
        },
      ): void => {
        doneWasCalled = true
        setToolJSX({
          jsx: null,
          shouldHidePromptInput: false,
          clearLocalJSX: true,
        })
        const newMessages: MessageType[] = []
        if (result && doneOptions?.display !== 'skip') {
          addNotification({
            key: `immediate-${matchingCommand.name}`,
            text: result,
            priority: 'immediate',
          })
          // In fullscreen the command just showed as a centered modal
          // pane — the notification above is enough feedback. Adding
          // "❯ /config" + "⎿ dismissed" to the transcript is clutter
          // (those messages are type:system subtype:local_command —
          // user-visible but NOT sent to the model, so skipping them
          // doesn't change model context). Outside fullscreen the
          // transcript entry stays so scrollback shows what ran.
          if (!isFullscreenEnvEnabled()) {
            newMessages.push(
              createCommandInputMessage(
                formatCommandInputTags(getCommandName(matchingCommand), commandArgs),
              ),
              createCommandInputMessage(
                `<${LOCAL_COMMAND_STDOUT_TAG}>${escapeXml(result)}</${LOCAL_COMMAND_STDOUT_TAG}>`,
              ),
            )
          }
        }
        // Inject meta messages (model-visible, user-hidden) into the transcript
        if (doneOptions?.metaMessages?.length) {
          newMessages.push(
            ...doneOptions.metaMessages.map((content) =>
              createUserMessage({
                content,
                isMeta: true,
              }),
            ),
          )
        }
        if (newMessages.length) {
          setMessages((prev) => [...prev, ...newMessages])
        }
        // Restore stashed prompt after local-jsx command completes.
        // The normal stash restoration path (below) is skipped because
        // local-jsx commands return early from onSubmit.
        if (stashedPrompt !== undefined) {
          setInputValue(stashedPrompt.text)
          helpers.setCursorOffset(stashedPrompt.cursorOffset)
          setPastedContents(stashedPrompt.pastedContents)
          setStashedPrompt(undefined)
        }
      }

      // Build context for the command (reuses existing getToolUseContext).
      // Read messages via ref to keep onSubmit stable across message
      // updates — matches the pattern at L2384/L2400/L2662 and avoids
      // pinning stale REPL render scopes in downstream closures.
      const context = getToolUseContext(
        messagesRef.current,
        [],
        createAbortController(),
        mainLoopModel,
      )
      const mod = await matchingCommand.load()
      const jsx = await mod.call(onDone, context, commandArgs)

      // Skip if onDone already fired — prevents stuck isLocalJSXCommand
      // (see processSlashCommand.tsx local-jsx case for full mechanism).
      if (jsx && !doneWasCalled) {
        // shouldHidePromptInput: false keeps Notifications mounted
        // so the onDone result isn't lost
        setToolJSX({
          jsx,
          shouldHidePromptInput: false,
          isLocalJSXCommand: true,
        })
      }
    }
    void executeImmediateCommand()
    return true // Always return early - don't add to history or queue
  }

  return false
}

// ── Remote mode submit ───────────────────────────────────────────────

export interface HandleRemoteSubmitParams {
  input: string
  isSlashCommand: boolean
  commands: Command[]
  pastedContents: Record<number, PastedContent>
  activeRemote: {
    isRemoteMode: boolean
    sendMessage: (content: RemoteMessageContent, opts?: { uuid?: string }) => Promise<boolean>
  }
  setMessages: (updater: MessageType[] | ((prev: MessageType[]) => MessageType[])) => void
}

/**
 * Send user input to a remote session via WebSocket instead of processing
 * it locally. Pasted images are built into ContentBlockParam arrays for
 * both the local transcript and the remote transport.
 *
 * local-jsx slash commands (e.g. /agents, /config) render UI in THIS
 * process — they have no remote equivalent. Those fall through (return
 * false) so they execute locally via handlePromptSubmit.
 *
 * @returns true if the input was sent to remote (caller should return
 *          early), false to continue with local submit.
 */
export async function handleRemoteSubmit(params: HandleRemoteSubmitParams): Promise<boolean> {
  const { input, isSlashCommand, commands, pastedContents, activeRemote, setMessages } = params

  // local-jsx slash commands fall through to local execution
  if (
    !activeRemote.isRemoteMode ||
    (isSlashCommand &&
      commands.find((c) => {
        const name = input.trim().slice(1).split(/\s/)[0]
        return (
          isCommandEnabled(c) &&
          (c.name === name || c.aliases?.includes(name!) || getCommandName(c) === name)
        )
      })?.type === 'local-jsx')
  ) {
    return false
  }

  // Build content blocks when there are pasted attachments (images)
  const pastedValues = Object.values(pastedContents)
  const imageContents = pastedValues.filter((c) => c.type === 'image')
  const imagePasteIds = imageContents.length > 0 ? imageContents.map((c) => c.id) : undefined
  let messageContent: string | ContentBlockParam[] = input.trim()
  let remoteContent: RemoteMessageContent = input.trim()
  if (pastedValues.length > 0) {
    const contentBlocks: ContentBlockParam[] = []
    const remoteBlocks: Array<{ type: string; [key: string]: unknown }> = []
    const trimmedInput = input.trim()
    if (trimmedInput) {
      contentBlocks.push({ type: 'text', text: trimmedInput })
      remoteBlocks.push({ type: 'text', text: trimmedInput })
    }
    for (const pasted of pastedValues) {
      if (pasted.type === 'image') {
        const source = {
          type: 'base64' as const,
          media_type: (pasted.mediaType ?? 'image/png') as
            | 'image/jpeg'
            | 'image/png'
            | 'image/gif'
            | 'image/webp',
          data: pasted.content,
        }
        contentBlocks.push({ type: 'image', source })
        remoteBlocks.push({ type: 'image', source })
      } else {
        contentBlocks.push({ type: 'text', text: pasted.content })
        remoteBlocks.push({ type: 'text', text: pasted.content })
      }
    }
    messageContent = contentBlocks
    remoteContent = remoteBlocks
  }

  // Create and add user message to UI
  const userMessage = createUserMessage({
    content: messageContent,
    imagePasteIds,
  })
  setMessages((prev) => [...prev, userMessage])

  // Send to remote session
  await activeRemote.sendMessage(remoteContent, {
    uuid: userMessage.uuid,
  })
  return true
}

// ── Idle return check ───────────────────────────────────────────────

export interface HandleIdleReturnCheckParams {
  input: string
  speculationAccept: unknown
  skipIdleCheckRef: RefObject<boolean>
  lastQueryCompletionTimeRef: RefObject<number>
  setIdleReturnPending: (value: { input: string; idleMinutes: number }) => void
  setInputValue: (value: string) => void
  helpers: PromptInputHelpers
}

/**
 * Check idle-return conditions: if the conversation is large, the cache is
 * cold, and the user has been idle long enough, show a dialog prompting them
 * to start fresh. Controlled by tengu_willow_mode feature flag: "dialog"
 * (blocking), "hint" (notification), "off".
 *
 * @returns true if idle dialog was triggered (caller should return early),
 *          false to continue normal submit flow.
 */
export function tryHandleIdleReturnCheck(params: HandleIdleReturnCheckParams): boolean {
  const {
    input,
    speculationAccept,
    skipIdleCheckRef,
    lastQueryCompletionTimeRef,
    setIdleReturnPending,
    setInputValue,
    helpers,
  } = params

  const willowMode = getFeatureValue_CACHED_MAY_BE_STALE('tengu_willow_mode', 'off')
  const idleThresholdMin = Number(process.env.CLAUDE_CODE_IDLE_THRESHOLD_MINUTES ?? 75)
  const tokenThreshold = Number(process.env.CLAUDE_CODE_IDLE_TOKEN_THRESHOLD ?? 100_000)
  if (
    willowMode !== 'off' &&
    !getGlobalConfig().idleReturnDismissed &&
    !skipIdleCheckRef.current &&
    !speculationAccept &&
    !input.trim().startsWith('/') &&
    lastQueryCompletionTimeRef.current > 0 &&
    getTotalInputTokens() >= tokenThreshold
  ) {
    const idleMs = Date.now() - lastQueryCompletionTimeRef.current
    const idleMinutes = idleMs / 60_000
    if (idleMinutes >= idleThresholdMin && willowMode === 'dialog') {
      setIdleReturnPending({
        input,
        idleMinutes,
      })
      setInputValue('')
      helpers.setCursorOffset(0)
      helpers.clearBuffer()
      return true
    }
  }
  return false
}

// ── Task-done trigger ────────────────────────────────────────────────

export interface HandleTaskDoneTriggerParams {
  input: string
  pastedContents: Record<number, PastedContent>
  speculationAccept: unknown
  messagesRef: RefObject<MessageType[]>
  addNotification: (notification: {
    key: string
    text: string
    priority: string
    timeoutMs?: number
  }) => void
  setInputValue: (value: string) => void
  helpers: PromptInputHelpers
}

/**
 * Task-done trigger: check for "任务完成", "done", etc. in user input.
 * When triggered, generates a review notification and clears the input.
 *
 * Imported dynamically to avoid circular deps and enable tree-shaking.
 *
 * @returns true if task-done was triggered (caller should return early),
 *          false to continue normal submit flow.
 */
export async function tryHandleTaskDoneTrigger(
  params: HandleTaskDoneTriggerParams,
): Promise<boolean> {
  const {
    input,
    pastedContents,
    speculationAccept,
    messagesRef,
    addNotification,
    setInputValue,
    helpers,
  } = params

  const trimmedInput = expandPastedTextRefs(input, pastedContents).trim()
  if (!speculationAccept && !input.trim().startsWith('/')) {
    const { checkTaskDoneTrigger } = await import('../hooks/taskDoneTrigger.js')
    if (checkTaskDoneTrigger && checkTaskDoneTrigger(trimmedInput)) {
      const { processTaskDoneTrigger } = await import('../hooks/taskDoneTrigger.js')
      if (processTaskDoneTrigger) {
        const reviewText = await processTaskDoneTrigger({
          messages: messagesRef.current,
          input: trimmedInput,
        })
        if (reviewText) {
          addNotification({
            key: 'task-done-review',
            text: reviewText,
            priority: 'high',
          })
          setInputValue('')
          helpers.setCursorOffset(0)
          helpers.clearBuffer()
          return true
        }
      }
    }
  }
  return false
}

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
