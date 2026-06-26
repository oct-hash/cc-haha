import { describe, it, expect } from 'bun:test'
import { EMPTY_USAGE } from '../emptyUsage'

describe('EMPTY_USAGE', () => {
  it('has zero tokens', () => {
    expect(EMPTY_USAGE.input_tokens).toBe(0)
    expect(EMPTY_USAGE.output_tokens).toBe(0)
    expect(EMPTY_USAGE.cache_creation_input_tokens).toBe(0)
    expect(EMPTY_USAGE.cache_read_input_tokens).toBe(0)
  })

  it('has standard service tier', () => {
    expect(EMPTY_USAGE.service_tier).toBe('standard')
  })

  it('has cache_creation sub-object', () => {
    expect(EMPTY_USAGE.cache_creation.ephemeral_1h_input_tokens).toBe(0)
    expect(EMPTY_USAGE.cache_creation.ephemeral_5m_input_tokens).toBe(0)
  })

  it('has empty server_tool_use', () => {
    expect(EMPTY_USAGE.server_tool_use.web_search_requests).toBe(0)
    expect(EMPTY_USAGE.server_tool_use.web_fetch_requests).toBe(0)
  })

  it('has expected shape with all fields present', () => {
    expect(EMPTY_USAGE).toHaveProperty('input_tokens')
    expect(EMPTY_USAGE).toHaveProperty('output_tokens')
    expect(EMPTY_USAGE).toHaveProperty('cache_creation')
    expect(EMPTY_USAGE).toHaveProperty('server_tool_use')
    expect(EMPTY_USAGE).toHaveProperty('inference_geo')
    expect(EMPTY_USAGE).toHaveProperty('speed')
  })
})
