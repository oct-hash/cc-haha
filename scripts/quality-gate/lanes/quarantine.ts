// Quarantine governance: track and manage failing items

import { join } from 'node:path'
import { readJSON, runId, writeJSON } from '../utils/helpers'
import type { DetailItem, LaneExecutionContext, LaneResult, QuarantinedItem } from './types'

const QUARANTINE_PATH = 'scripts/quality-gate/data/quarantined-items.json'

function loadQuarantine(rootDir: string): QuarantinedItem[] {
  return readJSON<QuarantinedItem[]>(join(rootDir, QUARANTINE_PATH)) ?? []
}

function saveQuarantine(rootDir: string, items: QuarantinedItem[]): void {
  writeJSON(join(rootDir, QUARANTINE_PATH), items)
}

/** Check quarantine governance: any overdue items? */
export async function runQuarantine(ctx: LaneExecutionContext): Promise<LaneResult> {
  const started = Date.now()
  const items = loadQuarantine(ctx.rootDir)
  const now = new Date()
  const details: DetailItem[] = []

  const active = items.filter((i) => i.status === 'active')
  const overdue = items.filter((i) => i.status === 'overdue')
  const resolved = items.filter((i) => i.status === 'resolved')

  details.push({
    label: `Active: ${active.length}, Overdue: ${overdue.length}, Resolved: ${resolved.length}`,
    status: 'ok',
  })

  // Check for overdue items
  for (const item of active) {
    const reviewDate = new Date(item.reviewBy)
    if (reviewDate < now) {
      // Auto-upgrade to overdue
      item.status = 'overdue'
      details.push({
        label: `${item.id}: OVERDUE`,
        status: 'error',
        message: `"${item.title}" review date was ${item.reviewBy} (owner: ${item.owner})`,
      })
    }
  }

  // Save overdue upgrades
  if (active.some((i) => new Date(i.reviewBy) < now)) {
    saveQuarantine(ctx.rootDir, items)
  }

  const hasOverdue = items.filter((i) => i.status === 'overdue').length > 0

  // Release mode: zero active quarantine items allowed
  if (ctx.options.mode === 'release' && items.filter((i) => i.status !== 'resolved').length > 0) {
    details.push({
      label: 'Release block',
      status: 'error',
      message: `${items.filter((i) => i.status !== 'resolved').length} unresolved quarantine items — must be 0 for release`,
    })
  }

  const hasErrors = details.some((d) => d.status === 'error')

  return {
    id: 'quarantine',
    title: 'Quarantine Governance',
    status: hasErrors ? 'failed' : 'passed',
    durationMs: Date.now() - started,
    category: 'governance',
    description: `Quarantine check: ${active.length} active, ${overdue.length} overdue`,
    details,
  }
}

/** CLI sub-command: add a quarantined item */
export async function quarantineAdd(
  rootDir: string,
  params: {
    lane: string
    title: string
    owner: string
    reason?: string
    file?: string
    checkName?: string
  },
): Promise<void> {
  const items = loadQuarantine(rootDir)
  const now = new Date()
  const reviewBy = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const item: QuarantinedItem = {
    id: runId(),
    lane: params.lane,
    checkName: params.checkName || params.lane,
    title: params.title,
    owner: params.owner,
    reason: params.reason || 'No reason provided',
    file: params.file,
    quarantinedAt: now.toISOString(),
    reviewBy: reviewBy.toISOString().split('T')[0],
    status: 'active',
  }

  items.push(item)
  saveQuarantine(rootDir, items)

  console.log(`\n  Quarantined: ${item.title}`)
  console.log(`  ID:      ${item.id}`)
  console.log(`  Lane:    ${item.lane}`)
  console.log(`  Owner:   ${item.owner}`)
  console.log(`  Review:  ${item.reviewBy}\n`)
}

/** CLI sub-command: list quarantined items */
export async function quarantineList(rootDir: string): Promise<void> {
  const items = loadQuarantine(rootDir)
  const active = items.filter((i) => i.status !== 'resolved')

  if (active.length === 0) {
    console.log('\n  No active quarantined items.\n')
    return
  }

  console.log(`\n  ${active.length} quarantined item(s):\n`)
  for (const item of active) {
    const status = item.status === 'overdue' ? '⚠ OVERDUE' : '○ active'
    console.log(`  ${status}  ${item.id}`)
    console.log(`          Title:  ${item.title}`)
    console.log(`          Lane:   ${item.lane}`)
    console.log(`          Owner:  ${item.owner}`)
    console.log(`          Review: ${item.reviewBy}`)
    console.log()
  }
}

/** CLI sub-command: resolve a quarantined item */
export async function quarantineResolve(rootDir: string, id: string, note?: string): Promise<void> {
  const items = loadQuarantine(rootDir)
  const item = items.find((i) => i.id === id)

  if (!item) {
    console.log(`\n  Item not found: ${id}\n`)
    return
  }

  item.status = 'resolved'
  item.resolvedAt = new Date().toISOString()
  item.resolutionNote = note || 'Resolved manually'
  saveQuarantine(rootDir, items)

  console.log(`\n  Resolved: ${item.title}\n`)
}
