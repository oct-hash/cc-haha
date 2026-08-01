import { describe, expect, it } from 'bun:test'
import type { RenderableMessage, SystemStopHookSummaryMessage } from '../../types/message.js'
import { collapseHookSummaries } from '../collapseHookSummaries'

function hookSummary(opts: {
  hookLabel: string
  hookCount?: number
  hookInfos?: string[]
  hookErrors?: string[]
  preventedContinuation?: boolean
  hasOutput?: boolean
  totalDurationMs?: number
}): RenderableMessage {
  return {
    type: 'system',
    subtype: 'stop_hook_summary',
    hookLabel: opts.hookLabel,
    hookCount: opts.hookCount ?? 1,
    hookInfos: opts.hookInfos ?? [],
    hookErrors: opts.hookErrors ?? [],
    preventedContinuation: opts.preventedContinuation ?? false,
    hasOutput: opts.hasOutput ?? false,
    totalDurationMs: opts.totalDurationMs ?? 0,
  } as SystemStopHookSummaryMessage
}

function textMsg(text: string): RenderableMessage {
  return { type: 'text', text } as RenderableMessage
}

describe('collapseHookSummaries', () => {
  it('passes through non-hook-summary messages unchanged', () => {
    const msgs: RenderableMessage[] = [textMsg('hello'), textMsg('world')]
    expect(collapseHookSummaries(msgs)).toEqual(msgs)
  })

  it('keeps a single hook summary unchanged', () => {
    const msg = hookSummary({ hookLabel: 'PostToolUse' })
    expect(collapseHookSummaries([msg])).toEqual([msg])
  })

  it('collapses consecutive summaries with same label', () => {
    const msgs: RenderableMessage[] = [
      textMsg('before'),
      hookSummary({ hookLabel: 'PostToolUse', hookCount: 2 }),
      hookSummary({ hookLabel: 'PostToolUse', hookCount: 3 }),
      textMsg('after'),
    ]
    const result = collapseHookSummaries(msgs)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(textMsg('before'))
    const collapsed = result[1] as SystemStopHookSummaryMessage
    expect(collapsed.type).toBe('system')
    expect(collapsed.subtype).toBe('stop_hook_summary')
    expect(collapsed.hookCount).toBe(5)
    expect(result[2]).toEqual(textMsg('after'))
  })

  it('does not merge summaries with different labels', () => {
    const msgs: RenderableMessage[] = [
      hookSummary({ hookLabel: 'PostToolUse', hookCount: 1 }),
      hookSummary({ hookLabel: 'Stop', hookCount: 2 }),
      hookSummary({ hookLabel: 'PostToolUse', hookCount: 3 }),
    ]
    const result = collapseHookSummaries(msgs)
    expect(result).toHaveLength(3)
    expect((result[0] as SystemStopHookSummaryMessage).hookLabel).toBe('PostToolUse')
    expect((result[1] as SystemStopHookSummaryMessage).hookLabel).toBe('Stop')
    expect((result[2] as SystemStopHookSummaryMessage).hookLabel).toBe('PostToolUse')
  })

  it('merges hookErrors via flatMap', () => {
    const msgs: RenderableMessage[] = [
      hookSummary({ hookLabel: 'PostToolUse', hookErrors: ['e1'] }),
      hookSummary({ hookLabel: 'PostToolUse', hookErrors: ['e2', 'e3'] }),
    ]
    const result = collapseHookSummaries(msgs)
    const collapsed = result[0] as SystemStopHookSummaryMessage
    expect(collapsed.hookErrors).toEqual(['e1', 'e2', 'e3'])
  })

  it('merges hookInfos via flatMap', () => {
    const msgs: RenderableMessage[] = [
      hookSummary({ hookLabel: 'PostToolUse', hookInfos: ['info1'] }),
      hookSummary({ hookLabel: 'PostToolUse', hookInfos: ['info2'] }),
    ]
    const result = collapseHookSummaries(msgs)
    const collapsed = result[0] as SystemStopHookSummaryMessage
    expect(collapsed.hookInfos).toEqual(['info1', 'info2'])
  })

  it('preventedContinuation is true if any in group', () => {
    const msgs: RenderableMessage[] = [
      hookSummary({ hookLabel: 'PostToolUse', preventedContinuation: false }),
      hookSummary({ hookLabel: 'PostToolUse', preventedContinuation: true }),
    ]
    const result = collapseHookSummaries(msgs)
    expect((result[0] as SystemStopHookSummaryMessage).preventedContinuation).toBe(true)
  })

  it('hasOutput is true if any in group', () => {
    const msgs: RenderableMessage[] = [
      hookSummary({ hookLabel: 'PostToolUse', hasOutput: false }),
      hookSummary({ hookLabel: 'PostToolUse', hasOutput: true }),
    ]
    const result = collapseHookSummaries(msgs)
    expect((result[0] as SystemStopHookSummaryMessage).hasOutput).toBe(true)
  })

  it('totalDurationMs takes max from group', () => {
    const msgs: RenderableMessage[] = [
      hookSummary({ hookLabel: 'PostToolUse', totalDurationMs: 100 }),
      hookSummary({ hookLabel: 'PostToolUse', totalDurationMs: 500 }),
      hookSummary({ hookLabel: 'PostToolUse', totalDurationMs: 300 }),
    ]
    const result = collapseHookSummaries(msgs)
    expect((result[0] as SystemStopHookSummaryMessage).totalDurationMs).toBe(500)
  })

  it('skips hook summaries without hookLabel', () => {
    const unlabeled = {
      type: 'system',
      subtype: 'stop_hook_summary',
      hookCount: 1,
      hookInfos: [],
      hookErrors: [],
      preventedContinuation: false,
      hasOutput: false,
      totalDurationMs: 0,
    } as SystemStopHookSummaryMessage
    const msgs: RenderableMessage[] = [unlabeled]
    expect(collapseHookSummaries(msgs)).toEqual(msgs)
  })

  it('returns empty array for empty input', () => {
    expect(collapseHookSummaries([])).toEqual([])
  })
})
