import { describe, expect, it } from 'bun:test'
import type { Message } from '../../types/message'
import { isHumanTurn } from '../messagePredicates'

function makeUserMessage(overrides: Partial<Message> = {}): Message {
  return {
    type: 'user',
    isMeta: false,
    message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    ...overrides,
  } as Message
}

describe('isHumanTurn', () => {
  it('returns true for a plain user message', () => {
    const msg = makeUserMessage()
    expect(isHumanTurn(msg)).toBe(true)
  })

  it('returns false for assistant type messages', () => {
    const msg = makeUserMessage({ type: 'assistant' })
    expect(isHumanTurn(msg)).toBe(false)
  })

  it('returns false for meta messages', () => {
    const msg = makeUserMessage({ isMeta: true })
    expect(isHumanTurn(msg)).toBe(false)
  })

  it('returns false when toolUseResult is present', () => {
    const msg = makeUserMessage({ toolUseResult: {} as Message['toolUseResult'] })
    expect(isHumanTurn(msg)).toBe(false)
  })

  it('returns false for messages that are both meta and have toolUseResult', () => {
    const msg = makeUserMessage({
      isMeta: true,
      toolUseResult: {} as Message['toolUseResult'],
    })
    expect(isHumanTurn(msg)).toBe(false)
  })
})
