import { describe, expect, it, beforeEach } from 'bun:test';
import {
  getSessionSettingsCache,
  setSessionSettingsCache,
  getCachedSettingsForSource,
  setCachedSettingsForSource,
  getCachedParsedFile,
  setCachedParsedFile,
  getPluginSettingsBase,
  setPluginSettingsBase,
  clearPluginSettingsBase,
  resetSettingsCache,
} from '../settingsCache';

describe('settingsCache', () => {
  beforeEach(() => {
    resetSettingsCache();
  });

  describe('sessionSettingsCache', () => {
    it('returns null initially', () => {
      expect(getSessionSettingsCache()).toBeNull();
    });

    it('returns the value after set', () => {
      const value = { settings: {} as any, errors: [] };
      setSessionSettingsCache(value);
      expect(getSessionSettingsCache()).toBe(value);
    });

    it('is cleared by resetSettingsCache', () => {
      setSessionSettingsCache({ settings: {} as any, errors: [] });
      resetSettingsCache();
      expect(getSessionSettingsCache()).toBeNull();
    });
  });

  describe('perSourceCache', () => {
    it('returns undefined for unknown source (cache miss)', () => {
      expect(getCachedSettingsForSource('user' as any)).toBeUndefined();
    });

    it('returns null for cached "no settings" entry', () => {
      setCachedSettingsForSource('user' as any, null);
      expect(getCachedSettingsForSource('user' as any)).toBeNull();
    });

    it('returns cached settings object', () => {
      const settings = { permissions: {} } as any;
      setCachedSettingsForSource('user' as any, settings);
      expect(getCachedSettingsForSource('user' as any)).toBe(settings);
    });

    it('is cleared by resetSettingsCache', () => {
      setCachedSettingsForSource('user' as any, {} as any);
      resetSettingsCache();
      expect(getCachedSettingsForSource('user' as any)).toBeUndefined();
    });
  });

  describe('parseFileCache', () => {
    it('returns undefined for unknown path', () => {
      expect(getCachedParsedFile('/nonexistent')).toBeUndefined();
    });

    it('returns cached parsed result', () => {
      const parsed = { settings: {} as any, errors: [] };
      setCachedParsedFile('/path/to/settings.json', parsed);
      expect(getCachedParsedFile('/path/to/settings.json')).toBe(parsed);
    });

    it('returns cached null settings', () => {
      setCachedParsedFile('/empty.json', { settings: null, errors: [] });
      expect(getCachedParsedFile('/empty.json')).toEqual({ settings: null, errors: [] });
    });

    it('is cleared by resetSettingsCache', () => {
      setCachedParsedFile('/test.json', { settings: {} as any, errors: [] });
      resetSettingsCache();
      expect(getCachedParsedFile('/test.json')).toBeUndefined();
    });
  });

  describe('pluginSettingsBase', () => {
    it('returns undefined initially', () => {
      expect(getPluginSettingsBase()).toBeUndefined();
    });

    it('returns the value after set', () => {
      const base = { theme: 'dark' };
      setPluginSettingsBase(base);
      expect(getPluginSettingsBase()).toBe(base);
    });

    it('is cleared by clearPluginSettingsBase', () => {
      setPluginSettingsBase({ theme: 'dark' });
      clearPluginSettingsBase();
      expect(getPluginSettingsBase()).toBeUndefined();
    });

    it('is not cleared by resetSettingsCache (independent lifecycle)', () => {
      setPluginSettingsBase({ theme: 'dark' });
      resetSettingsCache();
      // Plugin base survives settings cache reset
      expect(getPluginSettingsBase()).toEqual({ theme: 'dark' });
    });
  });

  describe('resetSettingsCache', () => {
    it('clears all caches at once', () => {
      setSessionSettingsCache({ settings: {} as any, errors: [] });
      setCachedSettingsForSource('user' as any, {} as any);
      setCachedParsedFile('/test.json', { settings: {} as any, errors: [] });

      resetSettingsCache();

      expect(getSessionSettingsCache()).toBeNull();
      expect(getCachedSettingsForSource('user' as any)).toBeUndefined();
      expect(getCachedParsedFile('/test.json')).toBeUndefined();
    });
  });
});
