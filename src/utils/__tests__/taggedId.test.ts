import { describe, expect, it } from 'bun:test';
import { toTaggedId } from '../taggedId';

describe('toTaggedId', () => {
  it('returns tagged ID with expected prefix', () => {
    const id = toTaggedId('user', '550e8400-e29b-41d4-a716-446655440000');
    expect(id.startsWith('user_01')).toBe(true);
  });

  it('handles UUID without hyphens', () => {
    const id = toTaggedId('org', '550e8400e29b41d4a716446655440000');
    expect(id.startsWith('org_01')).toBe(true);
  });

  it('produces consistent output for same input', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(toTaggedId('user', uuid)).toBe(toTaggedId('user', uuid));
  });

  it('throws on invalid UUID hex length', () => {
    expect(() => toTaggedId('user', 'too-short')).toThrow();
  });

  it('different tags produce different IDs', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(toTaggedId('user', uuid)).not.toBe(toTaggedId('org', uuid));
  });

  it('correct length (tag + _ + 2 + 22 = tag.length + 25)', () => {
    const id = toTaggedId('user', '550e8400-e29b-41d4-a716-446655440000');
    // 'user' + '_' + '01' + 22 base58 chars
    expect(id.length).toBe(4 + 1 + 2 + 22);
  });
});
