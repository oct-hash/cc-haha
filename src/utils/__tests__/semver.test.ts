import { describe, it, expect } from 'bun:test'
import { gt, gte, lt, lte, satisfies, order } from '../semver'

describe('gt', () => {
  it('2.0.0 > 1.0.0', () => expect(gt('2.0.0', '1.0.0')).toBe(true))
  it('1.0.0 not > 2.0.0', () => expect(gt('1.0.0', '2.0.0')).toBe(false))
  it('1.0.0 not > 1.0.0', () => expect(gt('1.0.0', '1.0.0')).toBe(false))
  it('1.0.0 > 1.0.0-alpha', () => expect(gt('1.0.0', '1.0.0-alpha')).toBe(true))
})

describe('gte', () => {
  it('2.0.0 >= 1.0.0', () => expect(gte('2.0.0', '1.0.0')).toBe(true))
  it('1.0.0 >= 1.0.0', () => expect(gte('1.0.0', '1.0.0')).toBe(true))
  it('1.0.0 not >= 2.0.0', () => expect(gte('1.0.0', '2.0.0')).toBe(false))
})

describe('lt', () => {
  it('1.0.0 < 2.0.0', () => expect(lt('1.0.0', '2.0.0')).toBe(true))
  it('2.0.0 not < 1.0.0', () => expect(lt('2.0.0', '1.0.0')).toBe(false))
  it('1.0.0 not < 1.0.0', () => expect(lt('1.0.0', '1.0.0')).toBe(false))
})

describe('lte', () => {
  it('1.0.0 <= 2.0.0', () => expect(lte('1.0.0', '2.0.0')).toBe(true))
  it('1.0.0 <= 1.0.0', () => expect(lte('1.0.0', '1.0.0')).toBe(true))
  it('2.0.0 not <= 1.0.0', () => expect(lte('2.0.0', '1.0.0')).toBe(false))
})

describe('satisfies', () => {
  it('1.5.0 satisfies >=1.0.0', () =>
    expect(satisfies('1.5.0', '>=1.0.0')).toBe(true))
  it('1.5.0 satisfies ^1.0.0', () =>
    expect(satisfies('1.5.0', '^1.0.0')).toBe(true))
  it('2.0.0 does not satisfy ^1.0.0', () =>
    expect(satisfies('2.0.0', '^1.0.0')).toBe(false))
})

describe('order', () => {
  it('returns 1 when a > b', () => expect(order('2.0.0', '1.0.0')).toBe(1))
  it('returns -1 when a < b', () => expect(order('1.0.0', '2.0.0')).toBe(-1))
  it('returns 0 when equal', () => expect(order('1.0.0', '1.0.0')).toBe(0))
})
