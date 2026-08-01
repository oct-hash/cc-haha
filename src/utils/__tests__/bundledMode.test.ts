import { describe, expect, it } from 'bun:test'
import { isInBundledMode, isRunningWithBun } from '../bundledMode'

describe('isRunningWithBun', () => {
  it('returns true when running under Bun', () => {
    // We're running tests with Bun, so process.versions.bun should be defined
    expect(isRunningWithBun()).toBe(true)
  })

  it('returns boolean', () => {
    expect(typeof isRunningWithBun()).toBe('boolean')
  })
})

describe('isInBundledMode', () => {
  it('returns boolean', () => {
    expect(typeof isInBundledMode()).toBe('boolean')
  })
})
