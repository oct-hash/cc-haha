/**
 * Session Context Manager
 * Auto-save/restore for context preservation across sessions
 * Inspired by GSD (Get Shit Done) context preservation
 */

import fs from 'node:fs'
import path from 'node:path'

export interface SessionMetadata {
  id: string
  createdAt: number
  updatedAt: number
  branch: string
  projectPath: string
  model?: string
  taskDescription?: string
}

export interface SessionContext {
  // Working context
  currentTask?: string
  lastAgent?: string
  lastToolUsed?: string

  // Recent history (for handoff)
  recentTools: Array<{
    name: string
    args: Record<string, unknown>
    result: string
    timestamp: number
  }>
  recentFiles: string[]

  // Pending work
  pendingTasks: Array<{
    id: string
    description: string
    status: 'pending' | 'in_progress' | 'blocked'
    createdAt: number
  }>

  // Artifacts (important outputs to preserve)
  artifacts: Array<{
    type: 'code' | 'config' | 'doc' | 'output'
    path?: string
    content?: string
    description: string
    createdAt: number
  }>

  // Task reviews (for improvement tracking)
  reviews: Array<{
    id: string
    taskDescription: string
    timestamp: number
    toolUsage: {
      stats: Array<{ name: string; count: number; purpose: string }>
      shouldHaveUsed: Array<{ tool: string; reason: string; suggestion: string }>
      misused: Array<{ tool: string; reason: string; betterAlternative: string }>
      redundant: Array<{ tool: string; reason: string }>
    }
    flow: {
      reasonable: Array<{ pattern: string; description: string }>
      optimizable: Array<{ pattern: string; issue: string; suggestion: string }>
    }
    errors: Array<{ severity: string; description: string; fix: string }>
    goodPractices: Array<{ pattern: string; example: string }>
  }>
}

export interface SessionState {
  metadata: SessionMetadata
  context: SessionContext

  // App state snapshot (serializable parts)
  appSnapshot?: {
    agentDefinitions?: unknown
    tasks?: unknown
    todos?: unknown
  }
}

const SESSIONS_DIR = '.claude/sessions'
const AUTO_SAVE_INTERVAL = 5 * 60 * 1000 // 5 minutes
const MAX_SESSIONS = 50

/**
 * Session manager for auto-save/restore
 */
export class SessionManager {
  private currentSession: SessionState | null = null
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null
  private dirty = false

  constructor(private projectPath: string = process.cwd()) {
    this.ensureSessionsDir()
  }

  private ensureSessionsDir(): void {
    const dir = path.join(this.projectPath, SESSIONS_DIR)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  /**
   * Create a new session
   */
  createSession(branch: string, taskDescription?: string): SessionState {
    const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()

    this.currentSession = {
      metadata: {
        id,
        createdAt: now,
        updatedAt: now,
        branch,
        projectPath: this.projectPath,
        taskDescription,
      },
      context: {
        recentTools: [],
        recentFiles: [],
        pendingTasks: [],
        artifacts: [],
      },
    }

    this.startAutoSave()
    this.save() // Initial save

    return this.currentSession
  }

  /**
   * Load most recent session for current branch
   */
  loadRecentSession(branch?: string): SessionState | null {
    const dir = path.join(this.projectPath, SESSIONS_DIR)

    if (!fs.existsSync(dir)) return null

    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(dir, f)).mtimeMs,
      }))
      .sort((a, b) => b.time - a.time)

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file.name), 'utf-8')
        const session: SessionState = JSON.parse(content)

        // Filter by branch if provided
        if (branch && session.metadata.branch !== branch) continue

        this.currentSession = session
        this.startAutoSave()
        return session
      } catch {
        continue
      }
    }

    return null
  }

  /**
   * Get current session
   */
  getSession(): SessionState | null {
    return this.currentSession
  }

  /**
   * Update session context
   */
  updateContext(updates: Partial<SessionContext>): void {
    if (!this.currentSession) return

    this.currentSession.context = {
      ...this.currentSession.context,
      ...updates,
    }
    this.dirty = true
  }

  /**
   * Record a tool usage
   */
  recordToolUse(name: string, args: Record<string, unknown>, result: string): void {
    if (!this.currentSession) return

    this.currentSession.context.recentTools.unshift({
      name,
      args,
      result,
      timestamp: Date.now(),
    })

    // Keep only last 50 tool uses
    if (this.currentSession.context.recentTools.length > 50) {
      this.currentSession.context.recentTools = this.currentSession.context.recentTools.slice(0, 50)
    }

    this.dirty = true
  }

  /**
   * Add a pending task
   */
  addPendingTask(id: string, description: string): void {
    if (!this.currentSession) return

    this.currentSession.context.pendingTasks.unshift({
      id,
      description,
      status: 'pending',
      createdAt: Date.now(),
    })

    this.dirty = true
  }

  /**
   * Update task status
   */
  updateTaskStatus(taskId: string, status: 'pending' | 'in_progress' | 'blocked'): void {
    if (!this.currentSession) return

    const task = this.currentSession.context.pendingTasks.find(t => t.id === taskId)
    if (task) {
      task.status = status
      this.dirty = true
    }
  }

  /**
   * Add an artifact
   */
  addArtifact(type: SessionContext['artifacts'][0]['type'], content: string, description: string, filePath?: string): void {
    if (!this.currentSession) return

    this.currentSession.context.artifacts.unshift({
      type,
      content,
      description,
      path: filePath,
      createdAt: Date.now(),
    })

    // Keep only last 20 artifacts
    if (this.currentSession.context.artifacts.length > 20) {
      this.currentSession.context.artifacts = this.currentSession.context.artifacts.slice(0, 20)
    }

    this.dirty = true
  }

  /**
   * Add a task review
   */
  addReview(review: Omit<SessionContext['reviews'][0], 'id' | 'timestamp'>): void {
    if (!this.currentSession) return

    this.currentSession.context.reviews.unshift({
      ...review,
      id: `review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    })

    // Keep only last 50 reviews
    if (this.currentSession.context.reviews.length > 50) {
      this.currentSession.context.reviews = this.currentSession.context.reviews.slice(0, 50)
    }

    this.dirty = true
  }

  /**
   * Save current session to disk
   */
  save(): void {
    if (!this.currentSession) return

    this.currentSession.metadata.updatedAt = Date.now()

    const fileName = `${this.currentSession.metadata.id}.json`
    const filePath = path.join(this.projectPath, SESSIONS_DIR, fileName)

    try {
      fs.writeFileSync(filePath, JSON.stringify(this.currentSession, null, 2), 'utf-8')
      this.dirty = false

      // Cleanup old sessions
      this.cleanupOldSessions()
    } catch (error) {
      console.error('[SessionManager] Failed to save session:', error)
    }
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer)
    }

    this.autoSaveTimer = setInterval(() => {
      if (this.dirty) {
        this.save()
      }
    }, AUTO_SAVE_INTERVAL)
  }

  /**
   * Stop auto-save timer
   */
  stop(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer)
      this.autoSaveTimer = null
    }

    // Final save if dirty
    if (this.dirty) {
      this.save()
    }
  }

  /**
   * Remove old sessions to stay within limit
   */
  private cleanupOldSessions(): void {
    const dir = path.join(this.projectPath, SESSIONS_DIR)
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(dir, f),
        time: fs.statSync(path.join(dir, f)).mtimeMs,
      }))
      .sort((a, b) => b.time - a.time)

    // Remove oldest files beyond MAX_SESSIONS
    for (let i = MAX_SESSIONS; i < files.length; i++) {
      try {
        fs.unlinkSync(files[i].path)
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Get session file path for external access
   */
  getSessionFilePath(): string | null {
    if (!this.currentSession) return null
    return path.join(this.projectPath, SESSIONS_DIR, `${this.currentSession.metadata.id}.json`)
  }
}

// Singleton instance
let sessionManager: SessionManager | null = null

export function getSessionManager(): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager()
  }
  return sessionManager
}

export function createSessionManager(projectPath?: string): SessionManager {
  sessionManager = new SessionManager(projectPath)
  return sessionManager
}