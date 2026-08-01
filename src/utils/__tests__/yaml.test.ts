import { describe, expect, it } from 'bun:test'
import { parseYaml } from '../yaml'

describe('parseYaml', () => {
  it('parses simple key-value YAML', () => {
    const result = parseYaml('name: test')
    expect(result).toEqual({ name: 'test' })
  })

  it('parses nested objects', () => {
    const result = parseYaml('person:\n  name: Alice\n  age: 30')
    expect(result).toEqual({ person: { name: 'Alice', age: 30 } })
  })

  it('parses arrays', () => {
    const result = parseYaml('- a\n- b\n- c')
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('parses numbers and booleans', () => {
    const result = parseYaml('count: 42\nenabled: true')
    expect(result).toEqual({ count: 42, enabled: true })
  })

  it('parses null values', () => {
    const result = parseYaml('value: null')
    expect(result).toEqual({ value: null })
  })

  it('returns null for empty string', () => {
    const result = parseYaml('')
    expect(result).toBeNull()
  })
})
