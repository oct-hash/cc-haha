// Extracted from REPL.tsx — the remaining misc logic blocks:
// 1. useREPLTeammateHints — teammate/turn-duration message, auto-permissions
//    warning, worktree sparse-checkout tip, and the sleep-only spinner rule.
// 2. useREPLSurveys — feedback / skill-improvement / issue-flag / post-compact /
//    memory / frustration surveys plus IDE integration init and the auto-run
//    /issue state.
// 3. useREPLInitialMessage — the pending initial-message effect (CLI args or
//    plan-mode exit with context clear).
// All externally captured values are passed via the UseREPLXxxParams interfaces;
// only module-scope handler/component imports are resolved here directly.

import { feature } from 'bun:bundle'
import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getSessionId } from '../bootstrap/state.js'
import { buildPermissionUpdates } from '../components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.js'
import { useFeedbackSurvey } from 'src/components/FeedbackSurvey/useFeedbackSurvey.js'
import { useMemorySurvey } from 'src/components/FeedbackSurvey/useMemorySurvey.js'
import { usePostCompactSurvey } from 'src/components/FeedbackSurvey/usePostCompactSurvey.js'
import { useIssueFlagBanner } from '../hooks/useIssueFlagBanner.js'
import { useSkillImprovementSurvey } from '../hooks/useSkillImprovementSurvey.js'
import type { AppState, AppStateStore } from '../state/AppState.js'
import { getAllInProcessTeammateTasks } from '../tasks/InProcessTeammateTask/InProcessTeammateTask.js'
import type { TaskState } from '../tasks/types.js'
import type { Tool, ToolPermissionContext } from '../Tool.js'
import { SLEEP_TOOL_NAME } from '../tools/SleepTool/prompt.js'
import type { Message as MessageType, UserMessage } from '../types/message.js'
import { createAbortController } from '../utils/abortController.js'
import { count } from '../utils/array.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { type FileHistorySnapshot, type FileHistoryState, fileHistoryEnabled, fileHistoryMakeSnapshot } from '../utils/fileHistory.js'
import type { FileStateCache } from '../utils/fileStateCache.js'
import { type PromptInputHelpers } from '../utils/handlePromptSubmit.js'
import type { IDEExtensionInstallationStatus, IdeType } from '../utils/ide.js'
import type { SetAppState } from '../utils/messageQueueManager.js'
import { createSystemMessage, createTurnDurationMessage } from '../utils/messages.js'
import { applyPermissionUpdates } from '../utils/permissions/PermissionUpdate.js'
import { stripDangerousPermissionsForAutoMode } from '../utils/permissions/permissionSetup.js'
import { getPlanSlug, setPlanSlug } from '../utils/plans.js'
import type { ScopedMcpServerConfig } from '../services/mcp/types.js'
import { isLoggableMessage } from '../utils/sessionStorage.js'
import { getCurrentWorktreeSession } from '../utils/worktree.js'
import { useIDEIntegration } from '../hooks/useIDEIntegration.js'
import { useFileHistorySnapshotInit } from 'src/hooks/useFileHistorySnapshotInit.js'
import {
  type AutoRunIssueReason,
  shouldAutoRunIssue,
} from '../utils/autoRunIssue.js'
import { AUTO_MODE_DESCRIPTION } from 'src/components/AutoModeOptInDialog.js'

// Dead code elimination: conditional import for frustration detection
/* eslint-disable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
// Frustration detection is ant-only (dogfooding). Conditional require so external
// builds eliminate the module entirely (including its two O(n) useMemos that run
// on every messages change, plus the GrowthBook fetch).
const useFrustrationDetection: typeof import('../components/FeedbackSurvey/useFrustrationDetection.js').useFrustrationDetection =
  'external' === 'ant'
    ? require('../components/FeedbackSurvey/useFrustrationDetection.js').useFrustrationDetection
    : () => ({
        state: 'closed',
        handleTranscriptSelect: () => {},
      })
/* eslint-enable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */

export interface UseREPLTeammateHintsParams {
  tasks: { [taskId: string]: TaskState }
  swarmStartTimeRef: React.MutableRefObject<number | null>
  swarmBudgetInfoRef: React.MutableRefObject<
    | {
        tokens: number
        limit: number
        nudges: number
      }
    | undefined
  >
  setMessages: (updater: React.SetStateAction<MessageType[]>) => void
  toolPermissionContext: ToolPermissionContext
  messages: MessageType[]
  inProgressToolUseIDs: ReadonlySet<string>
}

export function useREPLTeammateHints(params: UseREPLTeammateHintsParams) {
  const {
    tasks,
    swarmStartTimeRef,
    swarmBudgetInfoRef,
    setMessages,
    toolPermissionContext,
    messages,
    inProgressToolUseIDs,
  } = params

  const hasRunningTeammates = useMemo(
    () => getAllInProcessTeammateTasks(tasks).some((t) => t.status === 'running'),
    [tasks],
  )

  // Show deferred turn duration message once all swarm teammates finish
  useEffect(() => {
    if (!hasRunningTeammates && swarmStartTimeRef.current !== null) {
      const totalMs = Date.now() - swarmStartTimeRef.current
      const deferredBudget = swarmBudgetInfoRef.current
      swarmStartTimeRef.current = null
      swarmBudgetInfoRef.current = undefined
      setMessages((prev) => [
        ...prev,
        createTurnDurationMessage(
          totalMs,
          deferredBudget,
          // Count only what recordTranscript will persist — ephemeral
          // progress ticks and non-ant attachments are filtered by
          // isLoggableMessage and never reach disk. Using raw prev.length
          // would make checkResumeConsistency report false delta<0 for
          // every turn that ran a progress-emitting tool.
          count(prev, isLoggableMessage),
        ),
      ])
    }
  }, [hasRunningTeammates, setMessages])

  // Show auto permissions warning when entering auto mode
  // (either via Shift+Tab toggle or on startup). Debounced to avoid
  // flashing when the user is cycling through modes quickly.
  // Only shown 3 times total across sessions.
  const safeYoloMessageShownRef = useRef(false)
  useEffect(() => {
    if (feature('TRANSCRIPT_CLASSIFIER')) {
      if (toolPermissionContext.mode !== 'auto') {
        safeYoloMessageShownRef.current = false
        return
      }
      if (safeYoloMessageShownRef.current) return
      const config = getGlobalConfig()
      const count = config.autoPermissionsNotificationCount ?? 0
      if (count >= 3) return
      const timer = setTimeout(
        (ref, setMessages) => {
          ref.current = true
          saveGlobalConfig((prev) => {
            const prevCount = prev.autoPermissionsNotificationCount ?? 0
            if (prevCount >= 3) return prev
            return {
              ...prev,
              autoPermissionsNotificationCount: prevCount + 1,
            }
          })
          setMessages((prev) => [...prev, createSystemMessage(AUTO_MODE_DESCRIPTION, 'warning')])
        },
        800,
        safeYoloMessageShownRef,
        setMessages,
      )
      return () => clearTimeout(timer)
    }
  }, [toolPermissionContext.mode, setMessages])

  // If worktree creation was slow and sparse-checkout isn't configured,
  // nudge the user toward settings.worktree.sparsePaths.
  const worktreeTipShownRef = useRef(false)
  useEffect(() => {
    if (worktreeTipShownRef.current) return
    const wt = getCurrentWorktreeSession()
    if (!wt?.creationDurationMs || wt.usedSparsePaths) return
    if (wt.creationDurationMs < 15_000) return
    worktreeTipShownRef.current = true
    const secs = Math.round(wt.creationDurationMs / 1000)
    setMessages((prev) => [
      ...prev,
      createSystemMessage(
        `Worktree creation took ${secs}s. For large repos, set \`worktree.sparsePaths\` in .claude/settings.json to check out only the directories you need — e.g. \`{"worktree": {"sparsePaths": ["src", "packages/foo"]}}\`.`,
        'info',
      ),
    ])
  }, [setMessages])

  // Hide spinner when the only in-progress tool is Sleep
  const onlySleepToolActive = useMemo(() => {
    const lastAssistant = messages.findLast((m) => m.type === 'assistant')
    if (lastAssistant?.type !== 'assistant') return false
    const inProgressToolUses = lastAssistant.message.content.filter(
      (b) => b.type === 'tool_use' && inProgressToolUseIDs.has(b.id),
    )
    return (
      inProgressToolUses.length > 0 &&
      inProgressToolUses.every((b) => b.type === 'tool_use' && b.name === SLEEP_TOOL_NAME)
    )
  }, [messages, inProgressToolUseIDs])

  return {
    hasRunningTeammates,
    onlySleepToolActive,
  }
}

export interface UseREPLSurveysParams {
  // Prompt-visibility state used to gate survey opening
  toolUseConfirmQueue: readonly unknown[]
  promptQueue: readonly unknown[]
  sandboxPermissionRequestQueue: readonly unknown[]
  elicitation: { queue: readonly unknown[] }
  workerSandboxPermissions: { queue: readonly unknown[] }
  // Survey inputs
  messages: MessageType[]
  isLoading: boolean
  submitCount: number
  setMessages: (updater: React.SetStateAction<MessageType[]>) => void
  isRemoteSession: boolean
  // IDE integration
  autoConnectIdeFlag?: boolean
  ideToInstallExtension: IdeType | null
  setDynamicMcpConfig: React.Dispatch<
    React.SetStateAction<Record<string, ScopedMcpServerConfig> | undefined>
  >
  setShowIdeOnboarding: React.Dispatch<React.SetStateAction<boolean>>
  setIDEInstallationStatus: React.Dispatch<
    React.SetStateAction<IDEExtensionInstallationStatus | null>
  >
  // File history snapshot init
  initialFileHistorySnapshots?: FileHistorySnapshot[]
  fileHistory: FileHistoryState
  setAppState: SetAppState
}

export function useREPLSurveys(params: UseREPLSurveysParams) {
  const {
    toolUseConfirmQueue,
    promptQueue,
    sandboxPermissionRequestQueue,
    elicitation,
    workerSandboxPermissions,
    messages,
    isLoading,
    submitCount,
    setMessages,
    isRemoteSession,
    autoConnectIdeFlag,
    ideToInstallExtension,
    setDynamicMcpConfig,
    setShowIdeOnboarding,
    setIDEInstallationStatus,
    initialFileHistorySnapshots,
    fileHistory,
    setAppState,
  } = params

  // Check if any permission or ask question prompt is currently visible
  // This is used to prevent the survey from opening while prompts are active
  const hasActivePrompt =
    toolUseConfirmQueue.length > 0 ||
    promptQueue.length > 0 ||
    sandboxPermissionRequestQueue.length > 0 ||
    elicitation.queue.length > 0 ||
    workerSandboxPermissions.queue.length > 0
  const feedbackSurveyOriginal = useFeedbackSurvey(
    messages,
    isLoading,
    submitCount,
    'session',
    hasActivePrompt,
  )
  const skillImprovementSurvey = useSkillImprovementSurvey(setMessages)
  const showIssueFlagBanner = useIssueFlagBanner(messages, submitCount)

  // Wrap feedback survey handler to trigger auto-run /issue
  const feedbackSurvey = useMemo(
    () => ({
      ...feedbackSurveyOriginal,
      handleSelect: (selected: 'dismissed' | 'bad' | 'fine' | 'good') => {
        // Reset the ref when a new survey response comes in
        didAutoRunIssueRef.current = false
        const showedTranscriptPrompt = feedbackSurveyOriginal.handleSelect(selected)
        // Auto-run /issue for "bad" if transcript prompt wasn't shown
        if (
          selected === 'bad' &&
          !showedTranscriptPrompt &&
          shouldAutoRunIssue('feedback_survey_bad')
        ) {
          setAutoRunIssueReason('feedback_survey_bad')
          didAutoRunIssueRef.current = true
        }
      },
    }),
    [feedbackSurveyOriginal],
  )

  // Post-compact survey: shown after compaction if feature gate is enabled
  const postCompactSurvey = usePostCompactSurvey(messages, isLoading, hasActivePrompt, {
    enabled: !isRemoteSession,
  })

  // Memory survey: shown when the assistant mentions memory and a memory file
  // was read this conversation
  const memorySurvey = useMemorySurvey(messages, isLoading, hasActivePrompt, {
    enabled: !isRemoteSession,
  })

  // Frustration detection: show transcript sharing prompt after detecting frustrated messages
  const frustrationDetection = useFrustrationDetection(
    messages,
    isLoading,
    hasActivePrompt,
    feedbackSurvey.state !== 'closed' ||
      postCompactSurvey.state !== 'closed' ||
      memorySurvey.state !== 'closed',
  )

  // Initialize IDE integration
  useIDEIntegration({
    autoConnectIdeFlag,
    ideToInstallExtension,
    setDynamicMcpConfig,
    setShowIdeOnboarding,
    setIDEInstallationState: setIDEInstallationStatus,
  })
  useFileHistorySnapshotInit(initialFileHistorySnapshots, fileHistory, (fileHistoryState) =>
    setAppState((prev) => ({
      ...prev,
      fileHistory: fileHistoryState,
    })),
  )

  // Auto-run /issue state
  const [autoRunIssueReason, setAutoRunIssueReason] = useState<AutoRunIssueReason | null>(null)
  // Ref to track if autoRunIssue was triggered this survey cycle,
  // so we can suppress the [1] follow-up prompt even after
  // autoRunIssueReason is cleared.
  const didAutoRunIssueRef = useRef(false)

  return {
    feedbackSurvey,
    skillImprovementSurvey,
    showIssueFlagBanner,
    postCompactSurvey,
    memorySurvey,
    frustrationDetection,
    autoRunIssueReason,
    setAutoRunIssueReason,
    didAutoRunIssueRef,
  }
}

export interface UseREPLInitialMessageParams {
  // Plan-mode exit attaches planContent metadata to the message at runtime,
  // which AppState's UserMessage typing doesn't model — widen it locally.
  initialMessage:
    | (Omit<NonNullable<AppState['initialMessage']>, 'message'> & {
        message: UserMessage & { planContent?: string }
      })
    | null
  isLoading: boolean
  setMessages: (updater: React.SetStateAction<MessageType[]>) => void
  setAppState: SetAppState
  onQuery: (
    newMessages: MessageType[],
    abortController: AbortController,
    shouldQuery: boolean,
    additionalAllowedTools: string[],
    mainLoopModelParam: string,
  ) => Promise<void>
  mainLoopModel: string
  tools: readonly Tool[]
  readFileState: React.MutableRefObject<FileStateCache>
  discoveredSkillNamesRef: React.MutableRefObject<Set<string>>
  loadedNestedMemoryPathsRef: React.MutableRefObject<Set<string>>
  setConversationId: React.Dispatch<
    React.SetStateAction<`${string}-${string}-${string}-${string}-${string}`>
  >
  haikuTitleAttemptedRef: React.MutableRefObject<boolean>
  setHaikuTitle: React.Dispatch<React.SetStateAction<string | undefined>>
  bashTools: React.MutableRefObject<Set<string>>
  bashToolsProcessedIdx: React.MutableRefObject<number>
  store: AppStateStore
  awaitPendingHooks: () => Promise<void>
  onSubmit: (input: string, helpers: PromptInputHelpers) => void | Promise<void>
  setAbortController: (controller: AbortController | null) => void
}

export function useREPLInitialMessage(params: UseREPLInitialMessageParams) {
  const {
    initialMessage,
    isLoading,
    setMessages,
    setAppState,
    onQuery,
    mainLoopModel,
    tools,
    readFileState,
    discoveredSkillNamesRef,
    loadedNestedMemoryPathsRef,
    setConversationId,
    haikuTitleAttemptedRef,
    setHaikuTitle,
    bashTools,
    bashToolsProcessedIdx,
    store,
    awaitPendingHooks,
    onSubmit,
    setAbortController,
  } = params

  // Handle initial message (from CLI args or plan mode exit with context clear)
  // This effect runs when isLoading becomes false and there's a pending message
  const initialMessageRef = useRef(false)
  useEffect(() => {
    const pending = initialMessage
    if (!pending || isLoading || initialMessageRef.current) return

    // Mark as processing to prevent re-entry
    initialMessageRef.current = true
    async function processInitialMessage(initialMsg: NonNullable<typeof pending>) {
      // Clear context if requested (plan mode exit)
      if (initialMsg.clearContext) {
        // Preserve the plan slug before clearing context, so the new session
        // can access the same plan file after regenerateSessionId()
        const oldPlanSlug = initialMsg.message.planContent ? getPlanSlug() : undefined
        const { clearConversation } = await import('../commands/clear/conversation.js')
        await clearConversation({
          setMessages,
          readFileState: readFileState.current,
          discoveredSkillNames: discoveredSkillNamesRef.current,
          loadedNestedMemoryPaths: loadedNestedMemoryPathsRef.current,
          getAppState: () => store.getState(),
          setAppState,
          setConversationId,
        })
        haikuTitleAttemptedRef.current = false
        setHaikuTitle(undefined)
        bashTools.current.clear()
        bashToolsProcessedIdx.current = 0

        // Restore the plan slug for the new session so getPlan() finds the file
        if (oldPlanSlug) {
          setPlanSlug(getSessionId(), oldPlanSlug)
        }
      }

      // Atomically: clear initial message, set permission mode and rules, and store plan for verification
      const shouldStorePlanForVerification =
        initialMsg.message.planContent && 'external' === 'ant' && isEnvTruthy(undefined)
      setAppState((prev) => {
        // Build and apply permission updates (mode + allowedPrompts rules)
        let updatedToolPermissionContext = initialMsg.mode
          ? applyPermissionUpdates(
              prev.toolPermissionContext,
              buildPermissionUpdates(initialMsg.mode, initialMsg.allowedPrompts),
            )
          : prev.toolPermissionContext
        // For auto, override the mode (buildPermissionUpdates maps
        // it to 'default' via toExternalPermissionMode) and strip dangerous rules
        if (feature('TRANSCRIPT_CLASSIFIER') && initialMsg.mode === 'auto') {
          updatedToolPermissionContext = stripDangerousPermissionsForAutoMode({
            ...updatedToolPermissionContext,
            mode: 'auto',
            prePlanMode: undefined,
          })
        }
        return {
          ...prev,
          initialMessage: null,
          toolPermissionContext: updatedToolPermissionContext,
          ...(shouldStorePlanForVerification && {
            pendingPlanVerification: {
              plan: initialMsg.message.planContent!,
              verificationStarted: false,
              verificationCompleted: false,
            },
          }),
        }
      })

      // Create file history snapshot for code rewind
      if (fileHistoryEnabled()) {
        void fileHistoryMakeSnapshot((updater: (prev: FileHistoryState) => FileHistoryState) => {
          setAppState((prev) => ({
            ...prev,
            fileHistory: updater(prev.fileHistory),
          }))
        }, initialMsg.message.uuid)
      }

      // Ensure SessionStart hook context is available before the first API
      // call. onSubmit calls this internally but the onQuery path below
      // bypasses onSubmit — hoist here so both paths see hook messages.
      await awaitPendingHooks()

      // Route all initial prompts through onSubmit to ensure UserPromptSubmit hooks fire
      // TODO: Simplify by always routing through onSubmit once it supports
      // ContentBlockParam arrays (images) as input
      const content = initialMsg.message.message.content

      // Route all string content through onSubmit to ensure hooks fire
      // For complex content (images, etc.), fall back to direct onQuery
      // Plan messages bypass onSubmit to preserve planContent metadata for rendering
      if (typeof content === 'string' && !initialMsg.message.planContent) {
        // Route through onSubmit for proper processing including UserPromptSubmit hooks
        void onSubmit(content, {
          setCursorOffset: () => {},
          clearBuffer: () => {},
          resetHistory: () => {},
        })
      } else {
        // Plan messages or complex content (images, etc.) - send directly to model
        // Plan messages use onQuery to preserve planContent metadata for rendering
        // TODO: Once onSubmit supports ContentBlockParam arrays, remove this branch
        const newAbortController = createAbortController()
        setAbortController(newAbortController)
        void onQuery(
          [initialMsg.message],
          newAbortController,
          true,
          // shouldQuery
          [],
          // additionalAllowedTools
          mainLoopModel,
        )
      }

      // Reset ref after a delay to allow new initial messages
      setTimeout(
        (ref) => {
          ref.current = false
        },
        100,
        initialMessageRef,
      )
    }
    void processInitialMessage(pending)
  }, [initialMessage, isLoading, setMessages, setAppState, onQuery, mainLoopModel, tools])
}
