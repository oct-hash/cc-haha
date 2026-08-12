// Extracted from REPL.tsx — session resume flow (useREPLResume). Owns the
// resume callback plus the read-file-state / bash-tool caches that survive
// across turns and resume flows.

import { feature } from 'bun:bundle'
import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getOriginalCwd, setCostStateForRestore, switchSession } from '../bootstrap/state.js'
import type { ResumeEntrypoint } from '../commands.js'
import { getStoredSessionCosts, resetCostState, saveCurrentSessionCosts } from '../cost-tracker.js'
import { type UUID } from 'crypto'
import { dirname } from 'path'
import type { AppStateStore } from '../state/AppState.js'
import { restoreRemoteAgentTasks } from '../tasks/RemoteAgentTask/RemoteAgentTask.js'
import type { AgentDefinition, AgentDefinitionsResult } from '../tools/AgentTool/loadAgentsDir.js'
import { asSessionId } from '../types/ids.js'
import type { LogOption } from '../types/logs.js'
import type { Message as MessageType } from '../types/message.js'
import { updateSessionName } from '../utils/concurrentSessions.js'
import { deserializeMessages } from '../utils/conversationRecovery.js'
import { copyFileHistoryForResume } from '../utils/fileHistory.js'
import {
  createFileStateCacheWithSizeLimit,
  mergeFileStateCaches,
  READ_FILE_STATE_CACHE_SIZE,
} from '../utils/fileStateCache.js'
import { executeSessionEndHooks, getSessionEndHookTimeoutMs } from '../utils/hooks.js'
import type { SetAppState } from '../utils/messageQueueManager.js'
import { createSystemMessage } from '../utils/messages.js'
import { copyPlanForFork, copyPlanForResume } from '../utils/plans.js'
import { extractBashToolsFromMessages, extractReadFilesFromMessages } from '../utils/queryHelpers.js'
import {
  computeStandaloneAgentContext,
  exitRestoredWorktree,
  restoreAgentFromSession,
  restoreSessionStateFromLog,
  restoreWorktreeForResume,
} from '../utils/sessionRestore.js'
import { processSessionStartHooks } from '../utils/sessionStart.js'
import {
  adoptResumedSessionFile,
  clearSessionMetadata,
  resetSessionFilePointer,
  restoreSessionMetadata,
  saveWorktreeState,
} from '../utils/sessionStorage.js'
import type { ContentReplacementState } from '../utils/toolResultStorage.js'
import { reconstructContentReplacementState } from '../utils/toolResultStorage.js'
import { getCurrentWorktreeSession } from '../utils/worktree.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'

export interface UseREPLResumeParams {
  initialMessages?: MessageType[]
  initialMainThreadAgentDefinition?: AgentDefinition
  // Typed as unknown: the caller's value comes from an untyped useAppState
  // selector (see REPL.hooks.foundation.tsx), which resolves to unknown.
  // Cast to AgentDefinitionsResult inside the hook where consumed.
  agentDefinitions: unknown
  mainThreadAgentDefinition?: AgentDefinition
  setMainThreadAgentDefinition: React.Dispatch<React.SetStateAction<AgentDefinition | undefined>>
  mainLoopModel: string
  store: AppStateStore
  setAppState: SetAppState
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>
  resetLoadingState: () => void
  setAbortController: React.Dispatch<React.SetStateAction<AbortController | null>>
  setConversationId: (id: UUID) => void
  setToolJSX: (
    args: {
      jsx: React.ReactNode | null
      shouldHidePromptInput: boolean
      shouldContinueAnimation?: true
      showSpinner?: boolean
      isLocalJSXCommand?: boolean
      clearLocalJSX?: boolean
    } | null,
  ) => void
  setInputValue: (value: string) => void
  setHaikuTitle: React.Dispatch<React.SetStateAction<string | undefined>>
  haikuTitleAttemptedRef: React.MutableRefObject<boolean>
  contentReplacementStateRef: { current: ContentReplacementState | undefined }
}

export function useREPLResume(params: UseREPLResumeParams) {
  const {
    initialMessages,
    initialMainThreadAgentDefinition,
    agentDefinitions,
    mainThreadAgentDefinition,
    setMainThreadAgentDefinition,
    mainLoopModel,
    store,
    setAppState,
    setMessages,
    resetLoadingState,
    setAbortController,
    setConversationId,
    setToolJSX,
    setInputValue,
    setHaikuTitle,
    haikuTitleAttemptedRef,
    contentReplacementStateRef,
  } = params
  const resume = useCallback(
    async (sessionId: UUID, log: LogOption, entrypoint: ResumeEntrypoint) => {
      const resumeStart = performance.now()
      try {
        // Deserialize messages to properly clean up the conversation
        // This filters unresolved tool uses and adds a synthetic assistant message if needed
        const messages = deserializeMessages(log.messages)

        // Match coordinator/normal mode to the resumed session
        if (feature('COORDINATOR_MODE')) {
          /* eslint-disable @typescript-eslint/no-require-imports */
          const coordinatorModule =
            require('../coordinator/coordinatorMode.js') as typeof import('../coordinator/coordinatorMode.js')
          /* eslint-enable @typescript-eslint/no-require-imports */
          const warning = coordinatorModule.matchSessionMode(log.mode)
          if (warning) {
            // Re-derive agent definitions after mode switch so built-in agents
            // reflect the new coordinator/normal mode
            /* eslint-disable @typescript-eslint/no-require-imports */
            const { getAgentDefinitionsWithOverrides, getActiveAgentsFromList } =
              require('../tools/AgentTool/loadAgentsDir.js') as typeof import('../tools/AgentTool/loadAgentsDir.js')
            /* eslint-enable @typescript-eslint/no-require-imports */
            getAgentDefinitionsWithOverrides.cache.clear?.()
            const freshAgentDefs = await getAgentDefinitionsWithOverrides(getOriginalCwd())
            setAppState((prev) => ({
              ...prev,
              agentDefinitions: {
                ...freshAgentDefs,
                allAgents: freshAgentDefs.allAgents,
                activeAgents: getActiveAgentsFromList(freshAgentDefs.allAgents),
              },
            }))
            messages.push(createSystemMessage(warning, 'warning'))
          }
        }

        // Fire SessionEnd hooks for the current session before starting the
        // resumed one, mirroring the /clear flow in conversation.ts.
        const sessionEndTimeoutMs = getSessionEndHookTimeoutMs()
        await executeSessionEndHooks('resume', {
          getAppState: () => store.getState(),
          setAppState,
          signal: AbortSignal.timeout(sessionEndTimeoutMs),
          timeoutMs: sessionEndTimeoutMs,
        })

        // Process session start hooks for resume
        const hookMessages = await processSessionStartHooks('resume', {
          sessionId,
          agentType: mainThreadAgentDefinition?.agentType,
          model: mainLoopModel,
        })

        // Append hook messages to the conversation
        messages.push(...hookMessages)
        // For forks, generate a new plan slug and copy the plan content so the
        // original and forked sessions don't clobber each other's plan files.
        // For regular resumes, reuse the original session's plan slug.
        if (entrypoint === 'fork') {
          void copyPlanForFork(log, asSessionId(sessionId))
        } else {
          void copyPlanForResume(log, asSessionId(sessionId))
        }

        // Restore file history and attribution state from the resumed conversation
        restoreSessionStateFromLog(log, setAppState)
        if (log.fileHistorySnapshots) {
          void copyFileHistoryForResume(log)
        }

        // Restore agent setting from the resumed conversation
        // Always reset to the new session's values (or clear if none),
        // matching the standaloneAgentContext pattern below
        const { agentDefinition: restoredAgent } = restoreAgentFromSession(
          log.agentSetting,
          initialMainThreadAgentDefinition,
          agentDefinitions as AgentDefinitionsResult,
        )
        setMainThreadAgentDefinition(restoredAgent)
        setAppState((prev) => ({
          ...prev,
          agent: restoredAgent?.agentType,
        }))

        // Restore standalone agent context from the resumed conversation
        // Always reset to the new session's values (or clear if none)
        setAppState((prev) => ({
          ...prev,
          standaloneAgentContext: computeStandaloneAgentContext(log.agentName, log.agentColor),
        }))
        void updateSessionName(log.agentName)

        // Restore read file state from the message history
        restoreReadFileState(messages, log.projectPath ?? getOriginalCwd())

        // Clear any active loading state (no queryId since we're not in a query)
        resetLoadingState()
        setAbortController(null)
        setConversationId(sessionId)

        // Get target session's costs BEFORE saving current session
        // (saveCurrentSessionCosts overwrites the config, so we need to read first)
        const targetSessionCosts = getStoredSessionCosts(sessionId)

        // Save current session's costs before switching to avoid losing accumulated costs
        saveCurrentSessionCosts()

        // Reset cost state for clean slate before restoring target session
        resetCostState()

        // Switch session (id + project dir atomically). fullPath may point to
        // a different project (cross-worktree, /branch); null derives from
        // current originalCwd.
        switchSession(asSessionId(sessionId), log.fullPath ? dirname(log.fullPath) : null)
        // Rename asciicast recording to match the resumed session ID
        const { renameRecordingForSession } = await import('../utils/asciicast.js')
        await renameRecordingForSession()
        await resetSessionFilePointer()

        // Clear then restore session metadata so it's re-appended on exit via
        // reAppendSessionMetadata. clearSessionMetadata must be called first:
        // restoreSessionMetadata only sets-if-truthy, so without the clear,
        // a session without an agent name would inherit the previous session's
        // cached name and write it to the wrong transcript on first message.
        clearSessionMetadata()
        restoreSessionMetadata(log)
        // Resumed sessions shouldn't re-title from mid-conversation context
        // (same reasoning as the useRef seed), and the previous session's
        // Haiku title shouldn't carry over.
        haikuTitleAttemptedRef.current = true
        setHaikuTitle(undefined)

        // Exit any worktree a prior /resume entered, then cd into the one
        // this session was in. Without the exit, resuming from worktree B
        // to non-worktree C leaves cwd/currentWorktreeSession stale;
        // resuming B→C where C is also a worktree fails entirely
        // (getCurrentWorktreeSession guard blocks the switch).
        //
        // Skipped for /branch: forkLog doesn't carry worktreeSession, so
        // this would kick the user out of a worktree they're still working
        // in. Same fork skip as processResumedConversation for the adopt —
        // fork materializes its own file via recordTranscript on REPL mount.
        if (entrypoint !== 'fork') {
          exitRestoredWorktree()
          restoreWorktreeForResume(log.worktreeSession)
          adoptResumedSessionFile()
          void restoreRemoteAgentTasks({
            abortController: new AbortController(),
            getAppState: () => store.getState(),
            setAppState,
          })
        } else {
          // Fork: same re-persist as /clear (conversation.ts). The clear
          // above wiped currentSessionWorktree, forkLog doesn't carry it,
          // and the process is still in the same worktree.
          const ws = getCurrentWorktreeSession()
          if (ws) saveWorktreeState(ws)
        }

        // Persist the current mode so future resumes know what mode this session was in
        if (feature('COORDINATOR_MODE')) {
          /* eslint-disable @typescript-eslint/no-require-imports */
          const { saveMode } = require('../utils/sessionStorage.js')
          const { isCoordinatorMode } =
            require('../coordinator/coordinatorMode.js') as typeof import('../coordinator/coordinatorMode.js')
          /* eslint-enable @typescript-eslint/no-require-imports */
          saveMode(isCoordinatorMode() ? 'coordinator' : 'normal')
        }

        // Restore target session's costs from the data we read earlier
        if (targetSessionCosts) {
          setCostStateForRestore(targetSessionCosts)
        }

        // Reconstruct replacement state for the resumed session. Runs after
        // setSessionId so any NEW replacements post-resume write to the
        // resumed session's tool-results dir. Gated on ref.current: the
        // initial mount already read the feature flag, so we don't re-read
        // it here (mid-session flag flips stay unobservable in both
        // directions).
        //
        // Skipped for in-session /branch: the existing ref is already correct
        // (branch preserves tool_use_ids), so there's no need to reconstruct.
        // createFork() does write content-replacement entries to the forked
        // JSONL with the fork's sessionId, so `claude -r {forkId}` also works.
        if (contentReplacementStateRef.current && entrypoint !== 'fork') {
          contentReplacementStateRef.current = reconstructContentReplacementState(
            messages,
            log.contentReplacements ?? [],
          )
        }

        // Reset messages to the provided initial messages
        // Use a callback to ensure we're not dependent on stale state
        setMessages(() => messages)

        // Clear any active tool JSX
        setToolJSX(null)

        // Clear input to ensure no residual state
        setInputValue('')
        logEvent('tengu_session_resumed', {
          entrypoint: entrypoint as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          success: true,
          resume_duration_ms: Math.round(performance.now() - resumeStart),
        })
      } catch (error) {
        logEvent('tengu_session_resumed', {
          entrypoint: entrypoint as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          success: false,
        })
        throw error
      }
    },
    [resetLoadingState, setAppState],
  )

  // Lazy init: useRef(createX()) would call createX on every render and
  // discard the result. LRUCache construction inside FileStateCache is
  // expensive (~170ms), so we use useState's lazy initializer to create
  // it exactly once, then feed that stable reference into useRef.
  const [initialReadFileState] = useState(() =>
    createFileStateCacheWithSizeLimit(READ_FILE_STATE_CACHE_SIZE),
  )
  const readFileState = useRef(initialReadFileState)
  const bashTools = useRef(new Set<string>())
  const bashToolsProcessedIdx = useRef(0)
  // Session-scoped skill discovery tracking (feeds was_discovered on
  // tengu_skill_tool_invocation). Must persist across getToolUseContext
  // rebuilds within a session: turn-0 discovery writes via processUserInput
  // before onQuery builds its own context, and discovery on turn N must
  // still attribute a SkillTool call on turn N+k. Cleared in clearConversation.
  const discoveredSkillNamesRef = useRef(new Set<string>())
  // Session-level dedup for nested_memory CLAUDE.md attachments.
  // readFileState is a 100-entry LRU; once it evicts a CLAUDE.md path,
  // the next discovery cycle re-injects it. Cleared in clearConversation.
  const loadedNestedMemoryPathsRef = useRef(new Set<string>())

  // Helper to restore read file state from messages (used for resume flows)
  // This allows Claude to edit files that were read in previous sessions
  const restoreReadFileState = useCallback((messages: MessageType[], cwd: string) => {
    const extracted = extractReadFilesFromMessages(messages, cwd, READ_FILE_STATE_CACHE_SIZE)
    readFileState.current = mergeFileStateCaches(readFileState.current, extracted)
    for (const tool of extractBashToolsFromMessages(messages)) {
      bashTools.current.add(tool)
    }
  }, [])

  // Extract read file state from initialMessages on mount
  // This handles CLI flag resume (--resume-session) and ResumeConversation screen
  // where messages are passed as props rather than through the resume callback
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      restoreReadFileState(initialMessages, getOriginalCwd())
      void restoreRemoteAgentTasks({
        abortController: new AbortController(),
        getAppState: () => store.getState(),
        setAppState,
      })
    }
    // Only run on mount - initialMessages shouldn't change during component lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return {
    resume,
    restoreReadFileState,
    readFileState,
    bashTools,
    bashToolsProcessedIdx,
    discoveredSkillNamesRef,
    loadedNestedMemoryPathsRef,
  }
}
