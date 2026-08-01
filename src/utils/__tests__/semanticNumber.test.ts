import { describe, expect, it } from 'bun:test'
import { z } from 'zod/v4'
import { semanticNumber } from '../semanticNumber'

describe('semanticNumber', () => {
  const schema = semanticNumber()

  it('accepts number input', () => {
    expect(schema.parse(42)).toBe(42)
  })

  it('accepts integer string "30"', () => {
    expect(schema.parse('30')).toBe(30)
  })

  it('accepts negative integer string "-5"', () => {
    expect(schema.parse('-5')).toBe(-5)
  })

  it('accepts decimal string "3.14"', () => {
    expect(schema.parse('3.14')).toBe(3.14)
  })

  it('accepts zero', () => {
    expect(schema.parse(0)).toBe(0)
  })

  it('accepts negative number', () => {
    expect(schema.parse(-10)).toBe(-10)
  })

  it('rejects non-numeric string "abc"', () => {
    expect(() => schema.parse('abc')).toThrow()
  })

  it('rejects empty string', () => {
    expect(() => schema.parse('')).toThrow()
  })

  it('rejects Infinity-like string', () => {
    // "Infinity" matches the regex ^-?\d+(\.\d+)?$ but Number.isFinite rejects it
    expect(() => schema.parse('Infinity')).toThrow()
  })

  it('rejects boolean', () => {
    expect(() => schema.parse(true)).toThrow()
  })

  it('rejects null', () => {
    expect(() => schema.parse(null)).toThrow()
  })

  it('accepts undefined when optional chained inside', () => {
    const optionalSchema = semanticNumber(z.number().optional())
    expect(optionalSchema.parse(undefined)).toBeUndefined()
  })

  it('defaults when inner schema has .default()', () => {
    const defaultSchema = semanticNumber(z.number().default(0))
    expect(defaultSchema.parse(undefined)).toBe(0)
  })
})
