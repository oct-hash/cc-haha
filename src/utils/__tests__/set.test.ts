import { describe, expect, it } from 'bun:test';
import { difference, every, intersects, union } from '../set';

describe('difference', () => {
  it('returns elements in a not in b', () => {
    const a = new Set([1, 2, 3, 4]);
    const b = new Set([3, 4, 5]);
    expect(difference(a, b)).toEqual(new Set([1, 2]));
  });

  it('returns empty set when a is subset of b', () => {
    const a = new Set([1, 2]);
    const b = new Set([1, 2, 3]);
    expect(difference(a, b)).toEqual(new Set());
  });

  it('returns all of a when disjoint', () => {
    const a = new Set([1, 2]);
    const b = new Set([3, 4]);
    expect(difference(a, b)).toEqual(new Set([1, 2]));
  });
});

describe('intersects', () => {
  it('returns true when sets share elements', () => {
    expect(intersects(new Set([1, 2, 3]), new Set([3, 4, 5]))).toBe(true);
  });

  it('returns false when sets are disjoint', () => {
    expect(intersects(new Set([1, 2]), new Set([3, 4]))).toBe(false);
  });

  it('returns false when both empty', () => {
    expect(intersects(new Set(), new Set())).toBe(false);
  });

  it('returns false when one is empty', () => {
    expect(intersects(new Set([1, 2]), new Set())).toBe(false);
    expect(intersects(new Set(), new Set([1, 2]))).toBe(false);
  });
});

describe('every', () => {
  it('returns true when all elements of a are in b', () => {
    expect(every(new Set([1, 2]), new Set([1, 2, 3]))).toBe(true);
  });

  it('returns false when some element missing', () => {
    expect(every(new Set([1, 2, 4]), new Set([1, 2, 3]))).toBe(false);
  });

  it('returns true for empty a (vacuously true)', () => {
    expect(every(new Set(), new Set([1, 2]))).toBe(true);
  });
});

describe('union', () => {
  it('combines two sets', () => {
    const a = new Set([1, 2]);
    const b = new Set([3, 4]);
    expect(union(a, b)).toEqual(new Set([1, 2, 3, 4]));
  });

  it('handles overlapping sets', () => {
    const a = new Set([1, 2, 3]);
    const b = new Set([3, 4, 5]);
    expect(union(a, b)).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it('handles empty sets', () => {
    expect(union(new Set(), new Set([1, 2]))).toEqual(new Set([1, 2]));
  });
});
