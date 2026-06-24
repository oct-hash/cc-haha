/**
 * Session Context Bridge
 *
 * Provides GSD/OMC-compatible APIs over the existing session hooks and state system.
 * This is a thin bridging layer - actual persistence flows through existing mechanisms.
 */

import type { SessionState, SessionContext, SessionMetadata } from './sessionContext.js'
import { createSessionManager, getSessionManager } from './sessionContext.js'

// Re-export types for convenience
export type { SessionState, SessionContext, SessionMetadata } from './sessionContext.js'

/**
 * Lightweight context carrier for cross-session handoff.
 * Used by OMC agents and CLI workers to preserve working context.
 */
export interface SessionHandoff {
  task: string
  branch: string
  lastStep: string
  pendingDecisions: string[]
  keyFiles: string[]
  artifactSummary: string
}

/**
 * Bridge to existing session state - provides simplified API
 * that maps to the existing AppState/session hooks system.
 */
export class SessionContextBridge {
  private manager: ReturnType<typeof createSessionManager> | null = null

  /**
   * Initialize session context for a branch
   */
  initSession(branch: string, taskDescription?: string): SessionState {
    this.manager = createSessionManager()
    const session = this.manager.createSession(branch, taskDescription)
    return session
  }

  /**
   * Get current session
   */
  getCurrentSession(): SessionState | null {
    if (!this.manager) {
      this.manager = getSessionManager()
    }
    return this.manager.getSession()
  }

  /**
   * Load recent session (for resume)
   */
  loadSession(branch?: string): SessionState | null {
    this.manager = getSessionManager()
    return this.manager.loadRecentSession(branch)
  }

  /**
   * Update working context
   */
  updateWorkingContext(updates: {
    currentTask?: string
    lastAgent?: string
    lastToolUsed?: string
  }): void {
    if (!this.manager) return
    this.manager.updateContext(updates)
  }

  /**
   * Record completed step for handoff
   */
  recordStep(name: string, result: string): void {
    if (!this.manager) return
    this.manager.recordToolUse(name, {}, result)
  }

  /**
   * Add pending task
   */
  addTask(id: string, description: string): void {
    if (!this.manager) return
    this.manager.addPendingTask(id, description)
  }

  /**
   * Update task status
   */
  updateTask(taskId: string, status: 'pending' | 'in_progress' | 'blocked'): void {
    if (!this.manager) return
    this.manager.updateTaskStatus(taskId, status)
  }

  /**
   * Save current artifact
   */
  saveArtifact(type: 'code' | 'config' | 'doc' | 'output', content: string, description: string, path?: string): void {
    if (!this.manager) return
    this.manager.addArtifact(type, content, description, path)
  }

  /**
   * Get handoff summary for external agents
   */
  getHandoff(): SessionHandoff | null {
    const session = this.getCurrentSession()
    if (!session) return null

    const lastTool = session.context.recentTools[0]
    const pendingTasks = session.context.pendingTasks.filter(t => t.status !== 'pending')

    return {
      task: session.metadata.taskDescription || session.context.currentTask || 'Unknown task',
      branch: session.metadata.branch,
      lastStep: lastTool?.name || 'None',
      pendingDecisions: pendingTasks.map(t => t.description),
      keyFiles: session.context.recentFiles.slice(0, 5),
      artifactSummary: session.context.artifacts.length > 0
        ? `${session.context.artifacts.length} artifacts saved`
        : 'No artifacts yet',
    }
  }

  /**
   * Persist session to disk
   */
  persist(): void {
    if (this.manager) {
      this.manager.save()
    }
  }

  /**
   * Stop auto-save and cleanup
   */
  stop(): void {
    if (this.manager) {
      this.manager.stop()
    }
  }
}

// Singleton bridge instance
let bridgeInstance: SessionContextBridge | null = null

export function getSessionBridge(): SessionContextBridge {
  if (!bridgeInstance) {
    bridgeInstance = new SessionContextBridge()
  }
  return bridgeInstance
}