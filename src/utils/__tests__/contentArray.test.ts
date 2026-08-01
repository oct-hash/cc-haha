import { describe, expect, it } from 'bun:test'
import { insertBlockAfterToolResults } from '../contentArray'

describe('insertBlockAfterToolResults', () => {
  it('inserts block after last tool_result when tool_results exist', () => {
    const content = [
      { type: 'text', text: 'hello' },
      { type: 'tool_use', name: 'read' },
      { type: 'tool_result', content: 'result' },
      { type: 'text', text: 'trailing' },
    ]
    insertBlockAfterToolResults(content, { type: 'text', text: 'INSERTED' })
    expect(content).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'tool_use', name: 'read' },
      { type: 'tool_result', content: 'result' },
      { type: 'text', text: 'INSERTED' },
      { type: 'text', text: 'trailing' },
    ])
  })

  it('inserts after last tool_result when multiple tool_results exist', () => {
    const content = [
      { type: 'tool_result', content: 'first' },
      { type: 'tool_result', content: 'second' },
      { type: 'text', text: 'after' },
    ]
    insertBlockAfterToolResults(content, { type: 'text', text: 'INSERTED' })
    expect(content).toEqual([
      { type: 'tool_result', content: 'first' },
      { type: 'tool_result', content: 'second' },
      { type: 'text', text: 'INSERTED' },
      { type: 'text', text: 'after' },
    ])
  })

  it('appends text continuation when inserted block is last element', () => {
    const content = [
      { type: 'text', text: 'hello' },
      { type: 'tool_result', content: 'result' },
    ]
    insertBlockAfterToolResults(content, { type: 'text', text: 'INSERTED' })
    expect(content).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'tool_result', content: 'result' },
      { type: 'text', text: 'INSERTED' },
      { type: 'text', text: '.' },
    ])
  })

  it('inserts before last block when no tool_results exist', () => {
    const content = [
      { type: 'text', text: 'first' },
      { type: 'text', text: 'last' },
    ]
    insertBlockAfterToolResults(content, { type: 'text', text: 'INSERTED' })
    expect(content).toEqual([
      { type: 'text', text: 'first' },
      { type: 'text', text: 'INSERTED' },
      { type: 'text', text: 'last' },
    ])
  })

  it('inserts at position 0 for single-element array with no tool_results', () => {
    const content = [{ type: 'text', text: 'only' }]
    insertBlockAfterToolResults(content, { type: 'text', text: 'INSERTED' })
    expect(content).toEqual([
      { type: 'text', text: 'INSERTED' },
      { type: 'text', text: 'only' },
    ])
  })

  it('handles empty array', () => {
    const content: unknown[] = []
    insertBlockAfterToolResults(content, { type: 'text', text: 'INSERTED' })
    expect(content).toEqual([{ type: 'text', text: 'INSERTED' }])
  })

  it('ignores null items in array', () => {
    const content = [
      null,
      { type: 'tool_result', content: 'result' },
      { type: 'text', text: 'after' },
    ]
    insertBlockAfterToolResults(content, { type: 'text', text: 'INSERTED' })
    expect(content).toEqual([
      null,
      { type: 'tool_result', content: 'result' },
      { type: 'text', text: 'INSERTED' },
      { type: 'text', text: 'after' },
    ])
  })
})
