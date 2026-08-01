import { describe, expect, it } from 'bun:test'
import { type TreeNode, treeify } from '../treeify'

describe('treeify', () => {
  it('returns (empty) for empty object', () => {
    const result = treeify({})
    expect(result).toContain('empty')
  })

  it('renders a flat object', () => {
    const result = treeify({ name: 'test', count: 42 })
    expect(result).toContain('name')
    expect(result).toContain('test')
    expect(result).toContain('count')
    expect(result).toContain('42')
  })

  it('renders nested objects with tree characters', () => {
    const result = treeify({ user: { name: 'Alice' } })
    expect(result).toContain('user')
    expect(result).toContain('name')
    expect(result).toContain('Alice')
  })

  it('renders arrays as [Array(N)]', () => {
    const result = treeify({ items: [1, 2, 3] })
    expect(result).toContain('Array(3)')
  })

  it('renders functions as [Function]', () => {
    const result = treeify({ fn: () => {} })
    expect(result).toContain('Function')
  })

  it('hides functions when hideFunctions is true', () => {
    const result = treeify({ visible: 'yes', hidden: () => {} }, { hideFunctions: true })
    expect(result).toContain('visible')
    expect(result).not.toContain('hidden')
  })

  it('hides values when showValues is false', () => {
    const result = treeify({ key: 'secret' }, { showValues: false })
    expect(result).toContain('key')
    expect(result).not.toContain('secret')
  })

  it('handles null values', () => {
    const result = treeify({ key: null })
    expect(result).toContain('key')
    expect(result).toContain('null')
  })

  it('handles string root values via special case', () => {
    // treeify processes TreeNode which only has object values
    // but handles string leaf nodes
    const obj: TreeNode = { key: 'value' }
    const result = treeify(obj)
    expect(result).toContain('key')
    expect(result).toContain('value')
  })

  it('handles deeply nested objects', () => {
    const obj: TreeNode = {
      a: {
        b: {
          c: 'deep',
        },
      },
    }
    const result = treeify(obj)
    expect(result).toContain('a')
    expect(result).toContain('b')
    expect(result).toContain('c')
    expect(result).toContain('deep')
  })

  it('handles circular references', () => {
    const obj: Record<string, unknown> = { name: 'root' }
    obj.self = obj
    const result = treeify(obj)
    expect(result).toContain('Circular')
  })

  it('renders empty string key as just value', () => {
    // Special case for single empty/whitespace key
    const obj: TreeNode = { '': 'hello' }
    const result = treeify(obj)
    expect(result).toContain('hello')
  })

  it('handles undefined values', () => {
    const result = treeify({ key: undefined })
    // undefined as a value: showValues determines display
    expect(result).toContain('key')
  })

  it('handles boolean values', () => {
    const result = treeify({ active: true, disabled: false })
    expect(result).toContain('true')
    expect(result).toContain('false')
  })

  it('handles numeric values', () => {
    const result = treeify({ count: 0, price: 9.99 })
    expect(result).toContain('0')
    expect(result).toContain('9.99')
  })
})
