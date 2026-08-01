import { describe, expect, it } from 'bun:test'
import type { RenderableMessage } from '../../types/message.js'
import { collapseTeammateShutdowns } from '../collapseTeammateShutdowns'

function shutdownMsg(uuid?: string): RenderableMessage {
  return {
    type: 'attachment',
    uuid: uuid ?? 'uuid-1',
    timestamp: new Date().toISOString(),
    attachment: {
      type: 'task_status',
      taskType: 'in_process_teammate',
      status: 'completed',
    },
  } as RenderableMessage
}

function textMsg(text: string): RenderableMessage {
  return { type: 'text', text } as RenderableMessage
}

describe('collapseTeammateShutdowns', () => {
  it('passes through non-shutdown messages unchanged', () => {
    const msgs: RenderableMessage[] = [textMsg('hello'), textMsg('world')]
    expect(collapseTeammateShutdowns(msgs)).toEqual(msgs)
  })

  it('keeps a single shutdown message unchanged', () => {
    const msg = shutdownMsg()
    const msgs: RenderableMessage[] = [msg]
    expect(collapseTeammateShutdowns(msgs)).toEqual([msg])
  })

  it('collapses consecutive shutdowns into batch', () => {
    const msgs: RenderableMessage[] = [
      textMsg('before'),
      shutdownMsg('a'),
      shutdownMsg('b'),
      shutdownMsg('c'),
      textMsg('after'),
    ]
    const result = collapseTeammateShutdowns(msgs)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(textMsg('before'))
    expect(result[1]).toMatchObject({
      type: 'attachment',
      attachment: { type: 'teammate_shutdown_batch', count: 3 },
    })
    expect(result[2]).toEqual(textMsg('after'))
  })

  it('treats separated shutdown groups independently', () => {
    const msgs: RenderableMessage[] = [
      shutdownMsg('a'),
      shutdownMsg('b'),
      textMsg('separator'),
      shutdownMsg('c'),
      shutdownMsg('d'),
      shutdownMsg('e'),
    ]
    const result = collapseTeammateShutdowns(msgs)
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ attachment: { type: 'teammate_shutdown_batch', count: 2 } })
    expect(result[1]).toEqual(textMsg('separator'))
    expect(result[2]).toMatchObject({ attachment: { type: 'teammate_shutdown_batch', count: 3 } })
  })

  it('returns empty array for empty input', () => {
    expect(collapseTeammateShutdowns([])).toEqual([])
  })

  it('preserves uuid and timestamp from first shutdown in batch', () => {
    const msgs: RenderableMessage[] = [shutdownMsg('first'), shutdownMsg('second')]
    const result = collapseTeammateShutdowns(msgs)
    expect(result[0]).toMatchObject({ uuid: 'first' })
  })
})
