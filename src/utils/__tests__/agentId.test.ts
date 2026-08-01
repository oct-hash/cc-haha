import { describe, expect, it } from 'bun:test'
import { formatAgentId, generateRequestId, parseAgentId, parseRequestId } from '../agentId'

describe('formatAgentId', () => {
  it('joins agent and team with @', () => {
    expect(formatAgentId('researcher', 'my-project')).toBe('researcher@my-project')
  })

  it('handles empty strings', () => {
    expect(formatAgentId('', '')).toBe('@')
  })
})

describe('parseAgentId', () => {
  it('parses valid agent ID', () => {
    const result = parseAgentId('team-lead@my-project')
    expect(result).toEqual({
      agentName: 'team-lead',
      teamName: 'my-project',
    })
  })

  it('handles agent name with no special chars', () => {
    const result = parseAgentId('simple@team')
    expect(result).toEqual({ agentName: 'simple', teamName: 'team' })
  })

  it('returns null for string without @', () => {
    expect(parseAgentId('no-separator')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseAgentId('')).toBeNull()
  })

  it('parses ID with multiple @ symbols (first @ is separator)', () => {
    const result = parseAgentId('agent@team@extra')
    expect(result).toEqual({
      agentName: 'agent',
      teamName: 'team@extra',
    })
  })
})

describe('generateRequestId', () => {
  it('formats request ID with expected structure', () => {
    const id = generateRequestId('shutdown', 'agent@team')
    // Format: shutdown-{timestamp}@agent@team
    expect(id).toMatch(/^shutdown-\d+@agent@team$/)
  })

  it('includes the request type', () => {
    const id = generateRequestId('plan-approval', 'agent@team')
    expect(id.startsWith('plan-approval-')).toBe(true)
  })
})

describe('parseRequestId', () => {
  it('parses valid request ID', () => {
    const result = parseRequestId('shutdown-1702500000000@agent@team')
    expect(result).toEqual({
      requestType: 'shutdown',
      timestamp: 1702500000000,
      agentId: 'agent@team',
    })
  })

  it('returns null for string without @', () => {
    expect(parseRequestId('no-at-sign')).toBeNull()
  })

  it('returns null for missing dash in prefix', () => {
    expect(parseRequestId('nodash@agent@team')).toBeNull()
  })

  it('returns null for non-numeric timestamp', () => {
    const result = parseRequestId('type-abc123@agent@team')
    expect(result).toBeNull()
  })

  it('handles request ID with multiple dashes', () => {
    const result = parseRequestId('some-request-type-1702500000000@agent@team')
    expect(result).toEqual({
      requestType: 'some-request-type',
      timestamp: 1702500000000,
      agentId: 'agent@team',
    })
  })
})
