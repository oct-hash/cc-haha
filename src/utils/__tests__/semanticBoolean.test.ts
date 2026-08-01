import { describe, expect, it } from 'bun:test'
import { z } from 'zod/v4'
import { semanticBoolean } from '../semanticBoolean'

describe('semanticBoolean', () => {
  const schema = semanticBoolean()

  it('accepts boolean true', () => {
    expect(schema.parse(true)).toBe(true)
  })

  it('accepts boolean false', () => {
    expect(schema.parse(false)).toBe(false)
  })

  it('accepts string "true"', () => {
    expect(schema.parse('true')).toBe(true)
  })

  it('accepts string "false"', () => {
    expect(schema.parse('false')).toBe(false)
  })

  it('rejects string "yes"', () => {
    expect(() => schema.parse('yes')).toThrow()
  })

  it('rejects number input', () => {
    expect(() => schema.parse(1)).toThrow()
  })

  it('rejects null', () => {
    expect(() => schema.parse(null)).toThrow()
  })

  it('accepts undefined when optional chained inside', () => {
    const optionalSchema = semanticBoolean(z.boolean().optional())
    expect(optionalSchema.parse(undefined)).toBeUndefined()
  })

  it('defaults when inner schema has .default()', () => {
    const defaultSchema = semanticBoolean(z.boolean().default(false))
    expect(defaultSchema.parse(undefined)).toBe(false)
  })
})
