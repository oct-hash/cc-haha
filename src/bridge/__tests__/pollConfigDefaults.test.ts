import { describe, it, expect } from 'bun:test'
import { DEFAULT_POLL_CONFIG } from '../pollConfigDefaults'

describe('DEFAULT_POLL_CONFIG', () => {
  it('has all required keys', () => {
    expect(DEFAULT_POLL_CONFIG.poll_interval_ms_not_at_capacity).toBeGreaterThan(0)
    expect(DEFAULT_POLL_CONFIG.poll_interval_ms_at_capacity).toBeGreaterThan(0)
    expect(typeof DEFAULT_POLL_CONFIG.non_exclusive_heartbeat_interval_ms).toBe('number')
    expect(DEFAULT_POLL_CONFIG.multisession_poll_interval_ms_not_at_capacity).toBeGreaterThan(0)
    expect(typeof DEFAULT_POLL_CONFIG.reclaim_older_than_ms).toBe('number')
    expect(typeof DEFAULT_POLL_CONFIG.session_keepalive_interval_v2_ms).toBe('number')
  })

  it('at-capacity poll interval is larger than not-at-capacity', () => {
    expect(DEFAULT_POLL_CONFIG.poll_interval_ms_at_capacity).toBeGreaterThan(
      DEFAULT_POLL_CONFIG.poll_interval_ms_not_at_capacity,
    )
  })

  it('not-at-capacity is 2 seconds', () => {
    expect(DEFAULT_POLL_CONFIG.poll_interval_ms_not_at_capacity).toBe(2000)
  })

  it('at-capacity is 10 minutes', () => {
    expect(DEFAULT_POLL_CONFIG.poll_interval_ms_at_capacity).toBe(600_000)
  })

  it('keepalive interval is 2 minutes', () => {
    expect(DEFAULT_POLL_CONFIG.session_keepalive_interval_v2_ms).toBe(120_000)
  })
})
