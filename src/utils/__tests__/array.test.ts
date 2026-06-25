import { describe, expect, it } from 'bun:test';
import { count, intersperse, uniq } from '../array';

describe('intersperse', () => {
  it('returns empty array for empty input', () => {
    expect(intersperse([], () => ',')).toEqual([]);
  });

  it('returns single element unchanged', () => {
    expect(intersperse(['a'], () => ',')).toEqual(['a']);
  });

  it('inserts separator between elements', () => {
    expect(intersperse(['a', 'b', 'c'], (i) => `-${i}-`)).toEqual(['a', '-1-', 'b', '-2-', 'c']);
  });

  it('works with numbers', () => {
    expect(intersperse([1, 2, 3], () => 0)).toEqual([1, 0, 2, 0, 3]);
  });
});

describe('count', () => {
  it('returns 0 for empty array', () => {
    expect(count([], () => true)).toBe(0);
  });

  it('counts matching elements', () => {
    expect(count([1, 2, 3, 4, 5], (x) => x % 2 === 0)).toBe(2);
  });

  it('returns array length when all match', () => {
    expect(count([1, 2, 3], () => true)).toBe(3);
  });

  it('handles truthy non-boolean return values', () => {
    expect(count(['a', '', 'b', ''], (x) => x)).toBe(2);
  });
});

describe('uniq', () => {
  it('removes duplicate values', () => {
    expect(uniq([1, 2, 2, 3, 1, 4])).toEqual([1, 2, 3, 4]);
  });

  it('works with strings', () => {
    expect(uniq(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('returns empty for empty input', () => {
    expect(uniq([])).toEqual([]);
  });

  it('works with iterables', () => {
    expect(uniq(new Set([1, 2, 3]))).toEqual([1, 2, 3]);
  });
});
