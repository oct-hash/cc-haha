import { describe, expect, it } from 'bun:test'
import {
  getEssentialTrafficOnlyReason,
  getPrivacyLevel,
  isEssentialTrafficOnly,
  isTelemetryDisabled,
} from '../privacyLevel'

describe('getPrivacyLevel', () => {
  it('returns default when no env vars are set', () => {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    delete process.env.DISABLE_TELEMETRY
    expect(getPrivacyLevel()).toBe('default')
  })

  it('returns essential-traffic when CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC is set', () => {
    process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
    delete process.env.DISABLE_TELEMETRY
    expect(getPrivacyLevel()).toBe('essential-traffic')
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
  })

  it('returns no-telemetry when DISABLE_TELEMETRY is set', () => {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    process.env.DISABLE_TELEMETRY = '1'
    expect(getPrivacyLevel()).toBe('no-telemetry')
    delete process.env.DISABLE_TELEMETRY
  })

  it('essential-traffic takes priority over no-telemetry', () => {
    process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
    process.env.DISABLE_TELEMETRY = '1'
    expect(getPrivacyLevel()).toBe('essential-traffic')
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    delete process.env.DISABLE_TELEMETRY
  })
})

describe('isEssentialTrafficOnly', () => {
  it('returns true when level is essential-traffic', () => {
    process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
    expect(isEssentialTrafficOnly()).toBe(true)
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
  })

  it('returns false for no-telemetry', () => {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    process.env.DISABLE_TELEMETRY = '1'
    expect(isEssentialTrafficOnly()).toBe(false)
    delete process.env.DISABLE_TELEMETRY
  })

  it('returns false for default', () => {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    delete process.env.DISABLE_TELEMETRY
    expect(isEssentialTrafficOnly()).toBe(false)
  })
})

describe('isTelemetryDisabled', () => {
  it('returns true for essential-traffic', () => {
    process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
    expect(isTelemetryDisabled()).toBe(true)
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
  })

  it('returns true for no-telemetry', () => {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    process.env.DISABLE_TELEMETRY = '1'
    expect(isTelemetryDisabled()).toBe(true)
    delete process.env.DISABLE_TELEMETRY
  })

  it('returns false for default', () => {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    delete process.env.DISABLE_TELEMETRY
    expect(isTelemetryDisabled()).toBe(false)
  })
})

describe('getEssentialTrafficOnlyReason', () => {
  it('returns env var name when essential-traffic', () => {
    process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
    expect(getEssentialTrafficOnlyReason()).toBe('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC')
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
  })

  it('returns null for default level', () => {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    delete process.env.DISABLE_TELEMETRY
    expect(getEssentialTrafficOnlyReason()).toBeNull()
  })
})
