import { beforeEach, describe, expect, it } from 'bun:test'
import {
  clearSessionEnvVars,
  deleteSessionEnvVar,
  getSessionEnvVars,
  setSessionEnvVar,
} from '../sessionEnvVars'

describe('sessionEnvVars', () => {
  // Reset state before each test
  beforeEach(() => {
    clearSessionEnvVars()
  })

  it('returns empty map initially', () => {
    const vars = getSessionEnvVars()
    expect(vars.size).toBe(0)
  })

  it('sets and retrieves a variable', () => {
    setSessionEnvVar('KEY', 'value')
    const vars = getSessionEnvVars()
    expect(vars.get('KEY')).toBe('value')
    expect(vars.size).toBe(1)
  })

  it('sets multiple variables', () => {
    setSessionEnvVar('A', '1')
    setSessionEnvVar('B', '2')
    const vars = getSessionEnvVars()
    expect(vars.size).toBe(2)
    expect(vars.get('A')).toBe('1')
    expect(vars.get('B')).toBe('2')
  })

  it('deletes a specific variable', () => {
    setSessionEnvVar('KEY', 'value')
    deleteSessionEnvVar('KEY')
    expect(getSessionEnvVars().size).toBe(0)
  })

  it('delete does not affect other keys', () => {
    setSessionEnvVar('A', '1')
    setSessionEnvVar('B', '2')
    deleteSessionEnvVar('A')
    expect(getSessionEnvVars().get('B')).toBe('2')
    expect(getSessionEnvVars().has('A')).toBe(false)
  })

  it('clears all variables', () => {
    setSessionEnvVar('A', '1')
    setSessionEnvVar('B', '2')
    clearSessionEnvVars()
    expect(getSessionEnvVars().size).toBe(0)
  })
})
