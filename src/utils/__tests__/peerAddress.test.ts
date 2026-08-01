import { describe, expect, it } from 'bun:test'
import { parseAddress } from '../peerAddress'

describe('parseAddress', () => {
  it('parses uds: scheme', () => {
    const result = parseAddress('uds:/tmp/socket')
    expect(result).toEqual({ scheme: 'uds', target: '/tmp/socket' })
  })

  it('parses bridge: scheme', () => {
    const result = parseAddress('bridge:session-123')
    expect(result).toEqual({ scheme: 'bridge', target: 'session-123' })
  })

  it('routes bare unix socket path as uds', () => {
    const result = parseAddress('/var/run/sock')
    expect(result).toEqual({ scheme: 'uds', target: '/var/run/sock' })
  })

  it('treats other strings as scheme "other"', () => {
    const result = parseAddress('hello')
    expect(result).toEqual({ scheme: 'other', target: 'hello' })
  })

  it('treats empty string as other', () => {
    const result = parseAddress('')
    expect(result).toEqual({ scheme: 'other', target: '' })
  })
})
