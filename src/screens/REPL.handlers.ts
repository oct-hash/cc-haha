import { feature } from 'bun:bundle'
import type { ContentBlockParam, ImageBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import { randomUUID } from 'crypto'
import type { RefObject } from 'react'
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import {
  getBudgetContinuationCount,
  getCurrentTurnTokenBudget,
  getTotalInputTokens,
  getTurnClassifierCount,
  getTurnClassifierDurationMs,
  getTurnHookCount,
  getTurnHookDurationMs,
  getTurnOutputTokens,
  getTurnToolCount,
  getTurnToolDurationMs,
  resetTurnClassifierDuration,
  resetTurnHookDuration,
  resetTurnToolDuration,
  snapshotOutputTokensForTurn,
} from '../bootstrap/state.js'
import { fireCompanionObserver } from '../buddy/observer.js'
import {
  type Command,
  type CommandResultDisplay,
  getCommandName,
  isCommandEnabled,
} from '../commands.js'
import {
  messagesAfterAreOnlySynthetic,
  selectableUserMessagesFilter,
} from '../components/MessageSelector.js'
import { prependModeCharacterToInput } from '../components/PromptInput/inputModes.js'
import type { SpinnerMode } from '../components/Spinner.js'
import { getSystemPrompt } from '../constants/prompts.js'
import {
  BASH_INPUT_TAG,
  COMMAND_MESSAGE_TAG,
  COMMAND_NAME_TAG,
  LOCAL_COMMAND_STDOUT_TAG,
} from '../constants/xml.js'
import { getSystemContext, getUserContext } from '../context.js'
import { addToHistory, expandPastedTextRefs, parseReferences } from '../history.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import { mergeClients } from '../hooks/useMergedClients.js'
import { maybeMarkProjectOnboardingComplete } from '../projectOnboardingState.js'
import { query } from '../query.js'
import { getSessionManager } from '../services/agents/session-manager.js'
import type { AgentKind } from '../services/agents/types.js'
import { resetMicrocompactState } from '../services/compact/microCompact.js'
import { diagnosticTracker } from '../services/diagnosticTracking.js'
import type { SetToolJSXFn } from '../Tool.js'
import {
  getAllInProcessTeammateTasks,
  injectUserMessageToTeammate,
} from '../tasks/InProcessTeammateTask/InProcessTeammateTask.js'
import type { InProcessTeammateTaskState } from '../tasks/InProcessTeammateTask/types.js'
import {
  appendMessageToLocalAgent,
  isLocalAgentTask,
  type LocalAgentTaskState,
  queuePendingMessage,
} from '../tasks/LocalAgentTask/LocalAgentTask.js'
import { startBackgroundSession } from '../tasks/LocalMainSessionTask.js'
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import { resumeAgentBackground } from '../tools/AgentTool/resumeAgent.js'
import type { Message as MessageType, UserMessage } from '../types/message.js'
import { createAbortController } from '../utils/abortController.js'
import { isAgentSwarmsEnabled } from '../utils/agentSwarmsEnabled.js'
import { count } from '../utils/array.js'
import { createAttachmentMessage, getQueuedCommandAttachments } from '../utils/attachments.js'
import type { PastedContent } from '../utils/config.js'
import { getGlobalConfig, getGlobalConfigWriteCount } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import type { EffortValue } from '../utils/effort.js'
import { errorMessage } from '../utils/errors.js'
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js'
import type { PromptInputHelpers } from '../utils/handlePromptSubmit.js'
import { closeOpenDiffs, getConnectedIdeClient } from '../utils/ide.js'
import {
  enqueue,
  enqueuePendingNotification,
  getCommandQueueLength,
  removeByFilter,
  type SetAppState,
} from '../utils/messageQueueManager.js'
import {
  createApiMetricsMessage,
  createCommandInputMessage,
  createTurnDurationMessage,
  createUserMessage,
  formatCommandInputTags,
  getContentText,
  getMessagesAfterCompactBoundary,
  handleMessageFromStream,
  isCompactBoundaryMessage,
  type StreamingThinking,
  type StreamingToolUse,
  textForResubmit,
} from '../utils/messages.js'
import {
  checkAndDisableAutoModeIfNeeded,
  checkAndDisableBypassPermissionsIfNeeded,
} from '../utils/permissions/bypassPermissionsKillswitch.js'
import { getScratchpadDir, isScratchpadEnabled } from '../utils/permissions/filesystem.js'
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js'
import { getQuerySourceForREPL } from '../utils/promptCategory.js'
import type { QueryGuard } from '../utils/QueryGuard.js'
import { logQueryProfileReport, queryCheckpoint } from '../utils/queryProfiler.js'
import {
  isEphemeralToolProgress,
  isLoggableMessage,
  removeTranscriptMessage,
} from '../utils/sessionStorage.js'
import { generateSessionTitle } from '../utils/sessionTitle.js'
import { prependToShellHistoryCache } from '../utils/suggestions/shellHistoryCompletion.js'
import { setMemberActive } from '../utils/swarm/teamHelpers.js'
import { buildEffectiveSystemPrompt } from '../utils/systemPrompt.js'
import { getAgentName, getTeamName } from '../utils/teammate.js'
import type { RemoteMessageContent } from '../utils/teleport/api.js'
import { parseTokenBudget } from '../utils/tokenBudget.js'
import { escapeXml } from '../utils/xml.js'
import { median } from './REPL.utils.js'

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

export interface HandleAgentSubmitParams {
  input: string
  task: InProcessTeammateTaskState | LocalAgentTaskState
  helpers: PromptInputHelpers
  setAppState: SetAppState
  setInputValue: (value: string) => void
  getToolUseContext: (
    messages: MessageType[],
    newMessages: MessageType[],
    abortController: AbortController,
    model: string,
  ) => ProcessUserInputContext
  canUseTool: CanUseToolFn
  mainLoopModel: string
  messagesRef: RefObject<MessageType[]>
  onResumeFailed: (agentId: string, errorMessage: string) => void
}

export async function handleAgentSubmit(params: HandleAgentSubmitParams): Promise<void> {
  const {
    input,
    task,
    helpers,
    setAppState,
    setInputValue,
    getToolUseContext,
    canUseTool,
    mainLoopModel,
    messagesRef,
    onResumeFailed,
  } = params

  if (isLocalAgentTask(task)) {
    appendMessageToLocalAgent(task.id, createUserMessage({ content: input }), setAppState)
    if (task.status === 'running') {
      queuePendingMessage(task.id, input, setAppState)
    } else {
      void resumeAgentBackground({
        agentId: task.id,
        prompt: input,
        toolUseContext: getToolUseContext(
          messagesRef.current,
          [],
          new AbortController(),
          mainLoopModel,
        ),
        canUseTool,
      }).catch((err) => {
        logForDebugging(`resumeAgentBackground failed: ${errorMessage(err)}`)
        onResumeFailed(task.id, errorMessage(err))
      })
    }
  } else {
    injectUserMessageToTeammate(task.id, input, setAppState)
  }
  setInputValue('')
  helpers.setCursorOffset(0)
  helpers.clearBuffer()
}

export interface HandleRewindConversationToParams {
  message: UserMessage
  messagesRef: RefObject<MessageType[]>
  setMessages: (updater: MessageType[] | ((prev: MessageType[]) => MessageType[])) => void
  setConversationId: (id: string) => void
  setAppState: SetAppState
  onRewind?: () => void
}

export function handleRewindConversationTo(params: HandleRewindConversationToParams): void {
  const { message, messagesRef, setMessages, setConversationId, setAppState, onRewind } = params
  const prev = messagesRef.current
  const messageIndex = prev.lastIndexOf(message)
  if (messageIndex === -1) return

  logEvent('tengu_conversation_rewind', {
    preRewindMessageCount: prev.length,
    postRewindMessageCount: messageIndex,
    messagesRemoved: prev.length - messageIndex,
    rewindToMessageIndex: messageIndex,
  })

  setMessages(prev.slice(0, messageIndex))
  // Careful, this has to happen after setMessages
  setConversationId(randomUUID())
  // Reset cached microcompact state so stale pinned cache edits
  // don't reference tool_use_ids from truncated messages
  resetMicrocompactState()

  onRewind?.()

  // Restore state from the message we're rewinding to
  setAppState((prev) => ({
    ...prev,
    // Restore permission mode from the message
    toolPermissionContext:
      message.permissionMode && prev.toolPermissionContext.mode !== message.permissionMode
        ? {
            ...prev.toolPermissionContext,
            mode: message.permissionMode,
          }
        : prev.toolPermissionContext,
    // Clear stale prompt suggestion from previous conversation state
    promptSuggestion: {
      text: null,
      promptId: null,
      shownAt: 0,
      acceptedAt: 0,
      generationRequestId: null,
    },
  }))
}

export interface HandleRestoreMessageInputParams {
  message: UserMessage
  setInputValue: (value: string) => void
  setInputMode: (mode: string) => void
  setPastedContents: (contents: Record<number, PastedContent>) => void
}

export function handleRestoreMessageInput(params: HandleRestoreMessageInputParams): void {
  const { message, setInputValue, setInputMode, setPastedContents } = params
  const r = textForResubmit(message)
  if (r) {
    setInputValue(r.text)
    setInputMode(r.mode)
  }

  // Restore pasted images
  if (
    Array.isArray(message.message.content) &&
    message.message.content.some((block: ContentBlockParam) => block.type === 'image')
  ) {
    const imageBlocks: Array<ImageBlockParam> = message.message.content.filter(
      (block: ContentBlockParam) => block.type === 'image',
    )
    if (imageBlocks.length > 0) {
      const newPastedContents: Record<number, PastedContent> = {}
      imageBlocks.forEach((block, index) => {
        if (block.source.type === 'base64') {
          const id = message.imagePasteIds?.[index] ?? index + 1
          newPastedContents[id] = {
            id,
            type: 'image',
            content: block.source.data,
            mediaType: block.source.media_type,
          }
        }
      })
      setPastedContents(newPastedContents)
    }
  }
}

export interface HandleBackgroundQueryParams {
  abortController: AbortController | null
  messagesRef: RefObject<MessageType[]>
  mainLoopModel: string
  getToolUseContext: (
    messages: MessageType[],
    newMessages: MessageType[],
    abortController: AbortController,
    mainLoopModel: string,
  ) => ProcessUserInputContext
  additionalWorkingDirectories: string[]
  mainThreadAgentDefinition: AgentDefinition | undefined
  customSystemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  canUseTool: CanUseToolFn
  setAppState: SetAppState
  terminalTitle: string
}

export async function handleBackgroundQuery(params: HandleBackgroundQueryParams): Promise<void> {
  const {
    abortController,
    messagesRef,
    mainLoopModel,
    getToolUseContext,
    additionalWorkingDirectories,
    mainThreadAgentDefinition,
    customSystemPrompt,
    appendSystemPrompt,
    canUseTool,
    setAppState,
    terminalTitle,
  } = params

  const agentKind = getSessionManager().getActiveKind()

  // Non-haha agents: delegate to SessionManager bridge stream
  if (agentKind !== 'claude-haha') {
    abortController?.abort('background')
    startBackgroundBridgeStream({
      kind: agentKind,
      userText: terminalTitle,
      messagesRef,
    })
    return
  }

  abortController?.abort('background')
  const removedNotifications = removeByFilter((cmd) => cmd.mode === 'task-notification')

  const toolUseContext = getToolUseContext(
    messagesRef.current,
    [],
    new AbortController(),
    mainLoopModel,
  )
  const [defaultSystemPrompt, userContext, systemContext] = await Promise.all([
    getSystemPrompt(
      toolUseContext.options.tools,
      mainLoopModel,
      additionalWorkingDirectories,
      toolUseContext.options.mcpClients,
    ),
    getUserContext(),
    getSystemContext(),
  ])
  const systemPrompt = buildEffectiveSystemPrompt({
    mainThreadAgentDefinition,
    toolUseContext,
    customSystemPrompt,
    defaultSystemPrompt,
    appendSystemPrompt,
  })
  toolUseContext.renderedSystemPrompt = systemPrompt
  const notificationAttachments = await getQueuedCommandAttachments(removedNotifications).catch(
    () => [],
  )
  const notificationMessages = notificationAttachments.map(createAttachmentMessage)

  const existingPrompts = new Set<string>()
  for (const m of messagesRef.current) {
    if (
      m.type === 'attachment' &&
      m.attachment.type === 'queued_command' &&
      m.attachment.commandMode === 'task-notification' &&
      typeof m.attachment.prompt === 'string'
    ) {
      existingPrompts.add(m.attachment.prompt)
    }
  }
  const uniqueNotifications = notificationMessages.filter(
    (m) =>
      m.attachment.type === 'queued_command' &&
      (typeof m.attachment.prompt !== 'string' || !existingPrompts.has(m.attachment.prompt)),
  )
  startBackgroundSession({
    messages: [...messagesRef.current, ...uniqueNotifications],
    queryParams: {
      systemPrompt,
      userContext,
      systemContext,
      canUseTool,
      toolUseContext,
      querySource: getQuerySourceForREPL(),
    },
    description: terminalTitle,
    setAppState,
    agentDefinition: mainThreadAgentDefinition,
  })
}

// -- Agent adapter bridge: converts NormalizedEvent → stream_event for onQueryEvent ---

type QueryEvent = Parameters<typeof handleMessageFromStream>[0]

function makeTextEvent(text: string): QueryEvent {
  return {
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text },
      index: 0,
    },
  }
}

async function bridgeAdapterStream(
  kind: AgentKind,
  userMessage: string,
  abortController: AbortController,
  onQueryEvent: (event: QueryEvent) => void,
): Promise<void> {
  const sm = getSessionManager()

  // Reuse existing session for this agent kind, or create one
  const existing = sm.listSessions().find((s) => s.agentKind === kind)
  const handle =
    existing ??
    sm.createSession(kind, {
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    })
  if (!existing) await sm.save()

  for await (const ev of handle.chatStream(userMessage, abortController)) {
    switch (ev.type) {
      case 'session':
        onQueryEvent(makeTextEvent(`\n🆔 Session: ${ev.sessionId}\n`))
        break
      case 'text_chunk':
        onQueryEvent(makeTextEvent(ev.content))
        break
      case 'tool_call_start':
        onQueryEvent(makeTextEvent(`\n🔧 ${ev.name}(${ev.inputPreview})\n`))
        break
      case 'tool_call_end':
        onQueryEvent(
          makeTextEvent(
            ev.isError
              ? `\n❌ ${ev.outputPreview || '(no output)'}\n`
              : `\n📋 ${ev.outputPreview || '(no output)'}\n`,
          ),
        )
        break
      case 'error':
        onQueryEvent(makeTextEvent(`\n⚠️ ${ev.message}\n`))
        break
      case 'done':
        break
    }
  }

  // Persist updated metadata (tokens, tool calls, errors)
  await sm.save()
}

// -- Background bridge for Ctrl+B with non-haha agents -----------------------

async function startBackgroundBridgeStream({
  kind,
  userText,
  messagesRef,
}: {
  kind: AgentKind
  userText: string
  messagesRef: RefObject<MessageType[]>
}): Promise<void> {
  const sm = getSessionManager()
  const handle = sm.createSession(kind, {
    cwd: process.cwd(),
    env: process.env as Record<string, string>,
  })
  await sm.save()

  const abortController = createAbortController()

  // Fire-and-forget: stream in background, notify on completion
  void (async () => {
    let output = ''
    try {
      for await (const ev of handle.chatStream(userText, abortController)) {
        switch (ev.type) {
          case 'text_chunk':
            output += ev.content
            break
          case 'tool_call_start':
            output += `\n${ev.name}(${ev.inputPreview})\n`
            break
          case 'tool_call_end':
            if (ev.isError) {
              output += `\n${ev.outputPreview || '(no output)'}\n`
            }
            break
          case 'error':
            output += `\n${ev.message}\n`
            break
          case 'done':
          case 'session':
            break
        }
      }

      if (output.trim()) {
        enqueuePendingNotification({
          value: output.trim(),
          mode: 'task-notification',
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      enqueuePendingNotification({
        value: `[${kind}] ${msg}`,
        mode: 'task-notification',
      })
    } finally {
      handle.destroy()
      sm.save().catch(() => {})
    }
  })()
}

export interface HandleQueryEventParams {
  event: QueryEvent
  setMessages: (updater: (prev: MessageType[]) => MessageType[]) => void
  setResponseLength: (updater: (length: number) => number) => void
  setStreamMode: (mode: SpinnerMode) => void
  setStreamingToolUses: (uses: StreamingToolUse[]) => void
  setStreamingThinking: (thinking: StreamingThinking | null) => void
  onStreamingText: (f: (current: string | null) => string | null) => void
  setConversationId: (value: string | ((prev: string) => string)) => void
  responseLengthRef: RefObject<number>
  apiMetricsRef: RefObject<
    {
      ttftMs: number
      firstTokenTime: number
      lastTokenTime: number
      responseLengthBaseline: number
      endResponseLength: number
    }[]
  >
  setContextBlocked?: (blocked: boolean) => void
}

export function handleQueryEvent(params: HandleQueryEventParams): void {
  const {
    event,
    setMessages,
    setResponseLength,
    setStreamMode,
    setStreamingToolUses,
    setStreamingThinking,
    onStreamingText,
    setConversationId,
    responseLengthRef,
    apiMetricsRef,
    setContextBlocked,
  } = params

  handleMessageFromStream(
    event,
    (newMessage) => {
      if (isCompactBoundaryMessage(newMessage)) {
        if (isFullscreenEnvEnabled()) {
          setMessages((old) => [
            ...getMessagesAfterCompactBoundary(old, {
              includeSnipped: true,
            }),
            newMessage,
          ])
        } else {
          setMessages(() => [newMessage])
        }
        setConversationId(randomUUID())
        setContextBlocked?.(false)
      } else if (newMessage.type === 'progress' && isEphemeralToolProgress(newMessage.data.type)) {
        setMessages((oldMessages) => {
          const last = oldMessages.at(-1)
          if (
            last?.type === 'progress' &&
            last.parentToolUseID === newMessage.parentToolUseID &&
            last.data.type === newMessage.data.type
          ) {
            const copy = oldMessages.slice()
            copy[copy.length - 1] = newMessage
            return copy
          }
          return [...oldMessages, newMessage]
        })
      } else {
        setMessages((oldMessages) => [...oldMessages, newMessage])
      }
      if (setContextBlocked) {
        if (
          newMessage.type === 'assistant' &&
          'isApiErrorMessage' in newMessage &&
          newMessage.isApiErrorMessage
        ) {
          setContextBlocked(true)
        } else if (newMessage.type === 'assistant') {
          setContextBlocked(false)
        }
      }
    },
    (newContent) => {
      setResponseLength((length) => length + newContent.length)
    },
    setStreamMode,
    setStreamingToolUses,
    (tombstonedMessage) => {
      setMessages((oldMessages) => oldMessages.filter((m) => m !== tombstonedMessage))
      void removeTranscriptMessage(tombstonedMessage.uuid)
    },
    setStreamingThinking,
    (metrics) => {
      const now = Date.now()
      const baseline = responseLengthRef.current
      apiMetricsRef.current.push({
        ...metrics,
        firstTokenTime: now,
        lastTokenTime: now,
        responseLengthBaseline: baseline,
        endResponseLength: baseline,
      })
    },
    onStreamingText,
  )
}

export interface HandleQueryImplParams {
  messagesIncludingNewMessages: MessageType[]
  newMessages: MessageType[]
  abortController: AbortController
  shouldQuery: boolean
  additionalAllowedTools: string[]
  mainLoopModelParam: string
  effort: EffortValue | undefined
  store: {
    getState: () => any
    setState: (updater: (prev: any) => any) => void
  }
  setMessages: (updater: (prev: MessageType[]) => MessageType[]) => void
  setAbortController: (controller: AbortController | null) => void
  setAppState: SetAppState
  setConversationId: (value: string | ((prev: string) => string)) => void
  setHaikuTitle: (title: string) => void
  getToolUseContext: (
    messages: MessageType[],
    newMessages: MessageType[],
    abortController: AbortController,
    mainLoopModel: string,
  ) => ProcessUserInputContext
  onQueryEvent: (event: QueryEvent) => void
  canUseTool: CanUseToolFn
  onTurnComplete: ((messages: MessageType[]) => void | Promise<void>) | undefined
  resetLoadingState: () => void
  messagesRef: RefObject<MessageType[]>
  haikuTitleAttemptedRef: RefObject<boolean>
  loadingStartTimeRef: RefObject<number>
  apiMetricsRef: RefObject<
    {
      ttftMs: number
      firstTokenTime: number
      lastTokenTime: number
      responseLengthBaseline: number
      endResponseLength: number
    }[]
  >
  terminalFocusRef: RefObject<boolean>
  initialMcpClients: readonly { name: string }[] | undefined
  mainThreadAgentDefinition: AgentDefinition | undefined
  customSystemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  titleDisabled: boolean
  sessionTitle: string | undefined
  agentTitle: string | undefined
  toolPermissionContext: {
    additionalWorkingDirectories: Map<string, unknown>
    alwaysAllowRules: { command: string[] | null }
    mode: string
  }
  proactiveModule:
    | {
        isProactiveActive: () => boolean
        setContextBlocked: (v: boolean) => void
      }
    | undefined
  getCoordinatorUserContext: (
    mcpClients: readonly { name: string }[],
    scratchpadDir?: string,
  ) => Record<string, string>
}

export async function handleQueryImpl(params: HandleQueryImplParams): Promise<void> {
  const {
    messagesIncludingNewMessages,
    newMessages,
    abortController,
    shouldQuery,
    additionalAllowedTools,
    mainLoopModelParam,
    effort,
    store,
    setMessages,
    setAbortController,
    setAppState,
    setConversationId,
    setHaikuTitle,
    getToolUseContext,
    onQueryEvent,
    canUseTool,
    onTurnComplete,
    resetLoadingState,
    messagesRef,
    haikuTitleAttemptedRef,
    loadingStartTimeRef,
    apiMetricsRef,
    terminalFocusRef,
    initialMcpClients,
    mainThreadAgentDefinition,
    customSystemPrompt,
    appendSystemPrompt,
    titleDisabled,
    sessionTitle,
    agentTitle,
    toolPermissionContext,
    proactiveModule,
    getCoordinatorUserContext,
  } = params

  if (shouldQuery) {
    const freshClients = mergeClients(initialMcpClients, store.getState().mcp.clients)
    void diagnosticTracker.handleQueryStart(freshClients)
    const ideClient = getConnectedIdeClient(freshClients)
    if (ideClient) {
      void closeOpenDiffs(ideClient)
    }
  }

  void maybeMarkProjectOnboardingComplete()

  if (!titleDisabled && !sessionTitle && !agentTitle && !haikuTitleAttemptedRef.current) {
    const firstUserMessage = newMessages.find((m) => m.type === 'user' && !m.isMeta)
    const text =
      firstUserMessage?.type === 'user' ? getContentText(firstUserMessage.message.content) : null
    if (
      text &&
      !text.startsWith(`<${LOCAL_COMMAND_STDOUT_TAG}>`) &&
      !text.startsWith(`<${COMMAND_MESSAGE_TAG}>`) &&
      !text.startsWith(`<${COMMAND_NAME_TAG}>`) &&
      !text.startsWith(`<${BASH_INPUT_TAG}>`)
    ) {
      haikuTitleAttemptedRef.current = true
      void generateSessionTitle(text, new AbortController().signal).then(
        (title) => {
          if (title) setHaikuTitle(title)
          else haikuTitleAttemptedRef.current = false
        },
        () => {
          haikuTitleAttemptedRef.current = false
        },
      )
    }
  }

  store.setState((prev: any) => {
    const cur = prev.toolPermissionContext.alwaysAllowRules.command
    if (
      cur === additionalAllowedTools ||
      (cur?.length === additionalAllowedTools.length &&
        cur.every((v: any, i: number) => v === additionalAllowedTools[i]))
    ) {
      return prev
    }
    return {
      ...prev,
      toolPermissionContext: {
        ...prev.toolPermissionContext,
        alwaysAllowRules: {
          ...prev.toolPermissionContext.alwaysAllowRules,
          command: additionalAllowedTools,
        },
      },
    }
  })

  if (!shouldQuery) {
    if (newMessages.some(isCompactBoundaryMessage)) {
      setConversationId(randomUUID())
      proactiveModule?.setContextBlocked(false)
    }
    resetLoadingState()
    setAbortController(null)
    return
  }
  const toolUseContext = getToolUseContext(
    messagesIncludingNewMessages,
    newMessages,
    abortController,
    mainLoopModelParam,
  )
  const { tools: freshTools, mcpClients: freshMcpClients } = toolUseContext.options

  if (effort !== undefined) {
    const previousGetAppState = toolUseContext.getAppState
    toolUseContext.getAppState = () => ({
      ...previousGetAppState(),
      effortValue: effort,
    })
  }
  queryCheckpoint('query_context_loading_start')
  const [, , defaultSystemPrompt, baseUserContext, systemContext] = await Promise.all([
    checkAndDisableBypassPermissionsIfNeeded(toolPermissionContext as any, setAppState),
    feature('TRANSCRIPT_CLASSIFIER')
      ? checkAndDisableAutoModeIfNeeded(
          toolPermissionContext as any,
          setAppState,
          store.getState().fastMode,
        )
      : undefined,
    getSystemPrompt(
      freshTools,
      mainLoopModelParam,
      Array.from(toolPermissionContext.additionalWorkingDirectories.keys()),
      freshMcpClients,
    ),
    getUserContext(),
    getSystemContext(),
  ])
  const userContext = {
    ...baseUserContext,
    ...getCoordinatorUserContext(
      freshMcpClients,
      isScratchpadEnabled() ? getScratchpadDir() : undefined,
    ),
    ...(proactiveModule?.isProactiveActive() && !terminalFocusRef.current
      ? {
          terminalFocus: 'The terminal is unfocused \u2014 the user is not actively watching.',
        }
      : {}),
  }
  queryCheckpoint('query_context_loading_end')
  const systemPrompt = buildEffectiveSystemPrompt({
    mainThreadAgentDefinition,
    toolUseContext,
    customSystemPrompt,
    defaultSystemPrompt,
    appendSystemPrompt,
  })
  toolUseContext.renderedSystemPrompt = systemPrompt
  queryCheckpoint('query_query_start')
  resetTurnHookDuration()
  resetTurnToolDuration()
  resetTurnClassifierDuration()
  const agentKind =
    (process.env.CLAUDE_CODE_AGENT_KIND as AgentKind | undefined) ??
    getSessionManager().getActiveKind()
  if (agentKind && agentKind !== 'claude-haha') {
    // Use external agent backend (claude-code or codex CLI)
    const lastUserMsg = [...messagesIncludingNewMessages].reverse().find((m) => m.type === 'user')
    const userText =
      lastUserMsg?.type === 'user' ? (getContentText(lastUserMsg.message.content) ?? '') : ''
    if (userText) {
      await bridgeAdapterStream(agentKind, userText, abortController, onQueryEvent)
    }
  } else {
    for await (const event of query({
      messages: messagesIncludingNewMessages,
      systemPrompt,
      userContext,
      systemContext,
      canUseTool,
      toolUseContext,
      querySource: getQuerySourceForREPL(),
    })) {
      onQueryEvent(event)
    }
  }
  void fireCompanionObserver(messagesRef.current, (reaction) =>
    setAppState((prev: any) =>
      prev.companionReaction === reaction
        ? prev
        : {
            ...prev,
            companionReaction: reaction,
          },
    ),
  )
  queryCheckpoint('query_end')

  if ('external' === 'ant' && apiMetricsRef.current.length > 0) {
    const entries = apiMetricsRef.current
    const ttfts = entries.map((e) => e.ttftMs)
    const otpsValues = entries.map((e) => {
      const delta = Math.round((e.endResponseLength - e.responseLengthBaseline) / 4)
      const samplingMs = e.lastTokenTime - e.firstTokenTime
      return samplingMs > 0 ? Math.round(delta / (samplingMs / 1000)) : 0
    })
    const isMultiRequest = entries.length > 1
    const hookMs = getTurnHookDurationMs()
    const hookCount = getTurnHookCount()
    const toolMs = getTurnToolDurationMs()
    const toolCount = getTurnToolCount()
    const classifierMs = getTurnClassifierDurationMs()
    const classifierCount = getTurnClassifierCount()
    const turnMs = Date.now() - loadingStartTimeRef.current
    setMessages((prev) => [
      ...prev,
      createApiMetricsMessage({
        ttftMs: isMultiRequest ? median(ttfts) : ttfts[0]!,
        otps: isMultiRequest ? median(otpsValues) : otpsValues[0]!,
        isP50: isMultiRequest,
        hookDurationMs: hookMs > 0 ? hookMs : undefined,
        hookCount: hookCount > 0 ? hookCount : undefined,
        turnDurationMs: turnMs > 0 ? turnMs : undefined,
        toolDurationMs: toolMs > 0 ? toolMs : undefined,
        toolCount: toolCount > 0 ? toolCount : undefined,
        classifierDurationMs: classifierMs > 0 ? classifierMs : undefined,
        classifierCount: classifierCount > 0 ? classifierCount : undefined,
        configWriteCount: getGlobalConfigWriteCount(),
      }),
    ])
  }
  resetLoadingState()

  logQueryProfileReport()

  await onTurnComplete?.(messagesRef.current)
}

export interface HandleQueryParams {
  newMessages: MessageType[]
  abortController: AbortController
  shouldQuery: boolean
  additionalAllowedTools: string[]
  mainLoopModelParam: string
  onBeforeQueryCallback?: (input: string, newMessages: MessageType[]) => Promise<boolean>
  input?: string
  effort?: EffortValue
  queryGuard: QueryGuard
  onQueryImpl: (
    messagesIncludingNewMessages: MessageType[],
    newMessages: MessageType[],
    abortController: AbortController,
    shouldQuery: boolean,
    additionalAllowedTools: string[],
    mainLoopModelParam: string,
    effort?: EffortValue,
  ) => Promise<void>
  setMessages: (updater: (prev: MessageType[]) => MessageType[]) => void
  setAppState: SetAppState
  setAbortController: (controller: AbortController | null) => void
  setStreamingToolUses: (uses: StreamingToolUse[]) => void
  setStreamingText: (text: string | null) => void
  messagesRef: RefObject<MessageType[]>
  responseLengthRef: RefObject<number>
  apiMetricsRef: RefObject<
    {
      ttftMs: number
      firstTokenTime: number
      lastTokenTime: number
      responseLengthBaseline: number
      endResponseLength: number
    }[]
  >
  loadingStartTimeRef: RefObject<number>
  totalPausedMsRef: RefObject<number>
  swarmStartTimeRef: RefObject<number | null>
  swarmBudgetInfoRef: RefObject<
    | {
        tokens: number
        limit: number
        nudges: number
      }
    | undefined
  >
  skipIdleCheckRef: RefObject<boolean>
  inputValueRef: RefObject<string>
  sendBridgeResultRef: RefObject<() => void>
  restoreMessageSyncRef: RefObject<(message: UserMessage) => void>
  store: {
    getState: () => any
    setState: (updater: (prev: any) => any) => void
  }
  resetTimingRefs: () => void
  resetLoadingState: () => void
  mrOnBeforeQuery: (input: string, messages: MessageType[], newCount: number) => Promise<void>
  mrOnTurnComplete: (messages: MessageType[], wasAborted: boolean) => Promise<void>
  removeLastFromHistory: () => void
  setLastQueryCompletionTime: (time: number) => void
  proactiveActive: boolean
}

export async function handleQuery(params: HandleQueryParams): Promise<void> {
  const {
    newMessages,
    abortController,
    shouldQuery,
    additionalAllowedTools,
    mainLoopModelParam,
    onBeforeQueryCallback,
    input,
    effort,
    queryGuard,
    onQueryImpl,
    setMessages,
    setAppState,
    setAbortController,
    setStreamingToolUses,
    setStreamingText,
    messagesRef,
    responseLengthRef,
    apiMetricsRef,
    loadingStartTimeRef,
    totalPausedMsRef,
    swarmStartTimeRef,
    swarmBudgetInfoRef,
    skipIdleCheckRef,
    inputValueRef,
    sendBridgeResultRef,
    restoreMessageSyncRef,
    store,
    resetTimingRefs,
    resetLoadingState,
    mrOnBeforeQuery,
    mrOnTurnComplete,
    removeLastFromHistory,
    setLastQueryCompletionTime,
    proactiveActive,
  } = params

  if (isAgentSwarmsEnabled()) {
    const teamName = getTeamName()
    const agentName = getAgentName()
    if (teamName && agentName) {
      void setMemberActive(teamName, agentName, true)
    }
  }

  const thisGeneration = queryGuard.tryStart()
  if (thisGeneration === null) {
    logEvent('tengu_concurrent_onquery_detected', {})

    newMessages
      .filter((m): m is UserMessage => m.type === 'user' && !m.isMeta)
      .map((_) => getContentText(_.message.content))
      .filter((_) => _ !== null)
      .forEach((msg, i) => {
        enqueue({
          value: msg,
          mode: 'prompt',
        })
        if (i === 0) {
          logEvent('tengu_concurrent_onquery_enqueued', {})
        }
      })
    return
  }
  try {
    resetTimingRefs()
    setMessages((oldMessages) => [...oldMessages, ...newMessages])
    responseLengthRef.current = 0
    if (feature('TOKEN_BUDGET')) {
      const parsedBudget = input ? parseTokenBudget(input) : null
      snapshotOutputTokensForTurn(parsedBudget ?? getCurrentTurnTokenBudget())
    }
    apiMetricsRef.current = []
    setStreamingToolUses([])
    setStreamingText(null)

    const latestMessages = messagesRef.current
    if (input) {
      await mrOnBeforeQuery(input, latestMessages, newMessages.length)
    }

    if (onBeforeQueryCallback && input) {
      const shouldProceed = await onBeforeQueryCallback(input, latestMessages)
      if (!shouldProceed) {
        return
      }
    }
    await onQueryImpl(
      latestMessages,
      newMessages,
      abortController,
      shouldQuery,
      additionalAllowedTools,
      mainLoopModelParam,
      effort,
    )
  } finally {
    if (queryGuard.end(thisGeneration)) {
      setLastQueryCompletionTime(Date.now())
      skipIdleCheckRef.current = false
      resetLoadingState()
      await mrOnTurnComplete(messagesRef.current, abortController.signal.aborted)

      sendBridgeResultRef.current()

      if ('external' === 'ant' && !abortController.signal.aborted) {
        setAppState((prev: any) => {
          if (prev.tungstenActiveSession === undefined) return prev
          if (prev.tungstenPanelAutoHidden === true) return prev
          return {
            ...prev,
            tungstenPanelAutoHidden: true,
          }
        })
      }

      let budgetInfo:
        | {
            tokens: number
            limit: number
            nudges: number
          }
        | undefined
      if (feature('TOKEN_BUDGET')) {
        if (
          getCurrentTurnTokenBudget() !== null &&
          getCurrentTurnTokenBudget()! > 0 &&
          !abortController.signal.aborted
        ) {
          budgetInfo = {
            tokens: getTurnOutputTokens(),
            limit: getCurrentTurnTokenBudget()!,
            nudges: getBudgetContinuationCount(),
          }
        }
        snapshotOutputTokensForTurn(null)
      }

      const turnDurationMs = Date.now() - loadingStartTimeRef.current - totalPausedMsRef.current
      if (
        (turnDurationMs > 30000 || budgetInfo !== undefined) &&
        !abortController.signal.aborted &&
        !proactiveActive
      ) {
        const hasRunningSwarmAgents = getAllInProcessTeammateTasks(store.getState().tasks).some(
          (t) => t.status === 'running',
        )
        if (hasRunningSwarmAgents) {
          if (swarmStartTimeRef.current === null) {
            swarmStartTimeRef.current = loadingStartTimeRef.current
          }
          if (budgetInfo) {
            swarmBudgetInfoRef.current = budgetInfo
          }
        } else {
          setMessages((prev) => [
            ...prev,
            createTurnDurationMessage(turnDurationMs, budgetInfo, count(prev, isLoggableMessage)),
          ])
        }
      }
      setAbortController(null)
    }

    if (
      abortController.signal.reason === 'user-cancel' &&
      !queryGuard.isActive &&
      inputValueRef.current === '' &&
      getCommandQueueLength() === 0 &&
      !store.getState().viewingAgentTaskId
    ) {
      const msgs = messagesRef.current
      const lastUserMsg = msgs.findLast(selectableUserMessagesFilter)
      if (lastUserMsg) {
        const idx = msgs.lastIndexOf(lastUserMsg)
        if (messagesAfterAreOnlySynthetic(msgs, idx)) {
          removeLastFromHistory()
          restoreMessageSyncRef.current(lastUserMsg)
        }
      }
    }
  }
}
