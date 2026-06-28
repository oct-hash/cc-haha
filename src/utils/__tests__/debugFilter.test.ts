import { describe, expect, it } from 'bun:test';
import {
  parseDebugFilter,
  extractDebugCategories,
  shouldShowDebugCategories,
  shouldShowDebugMessage,
  type DebugFilter,
} from '../debugFilter';

describe('parseDebugFilter', () => {
  it('returns null for undefined input', () => {
    expect(parseDebugFilter(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseDebugFilter('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseDebugFilter('   ')).toBeNull();
  });

  it('returns null for empty filter list (trailing commas)', () => {
    expect(parseDebugFilter(',,,')).toBeNull();
  });

  it('parses inclusive filters', () => {
    const result = parseDebugFilter('api,hooks');
    expect(result).not.toBeNull();
    expect(result!.include).toEqual(['api', 'hooks']);
    expect(result!.exclude).toEqual([]);
    expect(result!.isExclusive).toBe(false);
  });

  it('parses exclusive filters', () => {
    const result = parseDebugFilter('!1p,!file');
    expect(result).not.toBeNull();
    expect(result!.exclude).toEqual(['1p', 'file']);
    expect(result!.include).toEqual([]);
    expect(result!.isExclusive).toBe(true);
  });

  it('trims whitespace from individual filters', () => {
    const result = parseDebugFilter(' api , hooks ');
    expect(result!.include).toEqual(['api', 'hooks']);
  });

  it('lowercases filter values', () => {
    const result = parseDebugFilter('API,HOOKS');
    expect(result!.include).toEqual(['api', 'hooks']);
  });

  it('lowercases exclusive filter values', () => {
    const result = parseDebugFilter('!API,!HOOKS');
    expect(result!.exclude).toEqual(['api', 'hooks']);
  });

  it('returns null for mixed inclusive/exclusive (ambiguous)', () => {
    expect(parseDebugFilter('api,!hooks')).toBeNull();
  });

  it('handles single filter', () => {
    const result = parseDebugFilter('api');
    expect(result!.include).toEqual(['api']);
    expect(result!.isExclusive).toBe(false);
  });

  it('handles single exclusive filter', () => {
    const result = parseDebugFilter('!api');
    expect(result!.exclude).toEqual(['api']);
    expect(result!.isExclusive).toBe(true);
  });
});

describe('extractDebugCategories', () => {
  it('extracts category from "category: message" pattern', () => {
    const cats = extractDebugCategories('api: fetch failed');
    expect(cats).toContain('api');
  });

  it('extracts category from "[CATEGORY] message" pattern', () => {
    const cats = extractDebugCategories('[HOOKS] before-use fired');
    expect(cats).toContain('hooks');
  });

  it('extracts categories from MCP server pattern', () => {
    const cats = extractDebugCategories('MCP server "context7": connected');
    expect(cats).toContain('mcp');
    expect(cats).toContain('context7');
  });

  it('extracts 1p category from "1P event:" messages', () => {
    const cats = extractDebugCategories('[ANT-ONLY] 1P event: tengu_timer');
    expect(cats).toContain('ant-only');
    expect(cats).toContain('1p');
  });

  it('returns lowercase categories', () => {
    const cats = extractDebugCategories('API: fetch failed');
    expect(cats).toContain('api');
  });

  it('deduplicates categories', () => {
    const cats = extractDebugCategories('api: api: retry');
    const apiCount = cats.filter(c => c === 'api').length;
    expect(apiCount).toBe(1);
  });

  it('returns empty array for unparseable message', () => {
    const cats = extractDebugCategories('just a plain message');
    expect(cats).toEqual([]);
  });
});

describe('shouldShowDebugCategories', () => {
  const inclusiveFilter: DebugFilter = { include: ['api', 'hooks'], exclude: [], isExclusive: false };
  const exclusiveFilter: DebugFilter = { include: [], exclude: ['1p', 'file'], isExclusive: true };

  it('returns true when no filter', () => {
    expect(shouldShowDebugCategories(['api'], null)).toBe(true);
  });

  it('returns false for uncategorized messages with any filter', () => {
    expect(shouldShowDebugCategories([], inclusiveFilter)).toBe(false);
    expect(shouldShowDebugCategories([], exclusiveFilter)).toBe(false);
  });

  it('inclusive: shows matching categories', () => {
    expect(shouldShowDebugCategories(['api'], inclusiveFilter)).toBe(true);
  });

  it('inclusive: hides non-matching categories', () => {
    expect(shouldShowDebugCategories(['file'], inclusiveFilter)).toBe(false);
  });

  it('exclusive: shows non-excluded categories', () => {
    expect(shouldShowDebugCategories(['hooks'], exclusiveFilter)).toBe(true);
  });

  it('exclusive: hides excluded categories', () => {
    expect(shouldShowDebugCategories(['1p'], exclusiveFilter)).toBe(false);
    expect(shouldShowDebugCategories(['file'], exclusiveFilter)).toBe(false);
  });

  it('exclusive: shows if any category is not excluded', () => {
    expect(shouldShowDebugCategories(['hooks', '1p'], exclusiveFilter)).toBe(false);
    expect(shouldShowDebugCategories(['hooks', 'api'], exclusiveFilter)).toBe(true);
  });
});

describe('shouldShowDebugMessage', () => {
  it('returns true when no filter', () => {
    expect(shouldShowDebugMessage('any message', null)).toBe(true);
  });

  it('returns true for matching inclusive filter', () => {
    const filter: DebugFilter = { include: ['api'], exclude: [], isExclusive: false };
    expect(shouldShowDebugMessage('api: request sent', filter)).toBe(true);
  });

  it('returns false for non-matching message with inclusive filter', () => {
    const filter: DebugFilter = { include: ['api'], exclude: [], isExclusive: false };
    expect(shouldShowDebugMessage('hooks: event fired', filter)).toBe(false);
  });

  it('returns true for non-excluded message with exclusive filter', () => {
    const filter: DebugFilter = { include: [], exclude: ['1p'], isExclusive: true };
    expect(shouldShowDebugMessage('api: request sent', filter)).toBe(true);
  });

  it('returns false for excluded message with exclusive filter', () => {
    const filter: DebugFilter = { include: [], exclude: ['1p'], isExclusive: true };
    expect(shouldShowDebugMessage('[ANT-ONLY] 1P event: tick', filter)).toBe(false);
  });
});
