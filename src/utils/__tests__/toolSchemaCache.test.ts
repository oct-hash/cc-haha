import { beforeEach, describe, expect, it } from 'bun:test'
import { clearToolSchemaCache, getToolSchemaCache } from '../toolSchemaCache'

describe('toolSchemaCache', () => {
  beforeEach(() => {
    clearToolSchemaCache()
  })

  it('initially empty', () => {
    expect(getToolSchemaCache().size).toBe(0)
  })

  it('returns the same map instance', () => {
    expect(getToolSchemaCache()).toBe(getToolSchemaCache())
  })

  it('supports set and get operations', () => {
    const cache = getToolSchemaCache()
    cache.set('tool-1', { name: 'read' } as any)
    expect(cache.get('tool-1')).toEqual({ name: 'read' })
    expect(cache.size).toBe(1)
  })

  it('clear empties the cache', () => {
    getToolSchemaCache().set('key', { name: 'x' } as any)
    clearToolSchemaCache()
    expect(getToolSchemaCache().size).toBe(0)
  })

  it('is shared across calls (module-level singleton)', () => {
    getToolSchemaCache().set('shared', { name: 'data' } as any)
    expect(getToolSchemaCache().get('shared')).toEqual({ name: 'data' })
  })
})
