import { describe, expect, it } from 'bun:test';
import { objectGroupBy } from '../objectGroupBy';

describe('objectGroupBy', () => {
  it('groups numbers by parity', () => {
    const result = objectGroupBy([1, 2, 3, 4, 5], (n) => (n % 2 === 0 ? 'even' : 'odd'));
    expect(result).toEqual({ odd: [1, 3, 5], even: [2, 4] });
  });

  it('groups strings by first letter', () => {
    const result = objectGroupBy(['apple', 'banana', 'avocado', 'blueberry'], (s) => s[0]!);
    expect(result).toEqual({ a: ['apple', 'avocado'], b: ['banana', 'blueberry'] });
  });

  it('returns empty object for empty iterable', () => {
    expect(objectGroupBy([], (x) => x)).toEqual({});
  });

  it('provides index to keySelector', () => {
    const keys: number[] = [];
    objectGroupBy(['a', 'b', 'c'], (_, i) => {
      keys.push(i);
      return 'x';
    });
    expect(keys).toEqual([0, 1, 2]);
  });

  it('handles single element', () => {
    expect(objectGroupBy([42], () => 'answer')).toEqual({ answer: [42] });
  });

  it('works with Set as iterable', () => {
    const result = objectGroupBy(new Set(['x', 'y']), (s) => s);
    expect(result).toEqual({ x: ['x'], y: ['y'] });
  });
});
