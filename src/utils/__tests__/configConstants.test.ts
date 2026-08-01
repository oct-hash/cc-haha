import { describe, expect, it } from 'bun:test'
import { EDITOR_MODES, NOTIFICATION_CHANNELS, TEAMMATE_MODES } from '../configConstants'

describe('configConstants', () => {
  describe('NOTIFICATION_CHANNELS', () => {
    it('contains expected channels', () => {
      expect(NOTIFICATION_CHANNELS).toContain('auto')
      expect(NOTIFICATION_CHANNELS).toContain('iterm2')
      expect(NOTIFICATION_CHANNELS).toContain('notifications_disabled')
    })

    it('is a readonly tuple', () => {
      expect(Array.isArray(NOTIFICATION_CHANNELS)).toBe(true)
      expect(NOTIFICATION_CHANNELS.length).toBeGreaterThan(0)
    })
  })

  describe('EDITOR_MODES', () => {
    it('contains normal and vim', () => {
      expect(EDITOR_MODES).toContain('normal')
      expect(EDITOR_MODES).toContain('vim')
    })

    it('does not contain deprecated emacs', () => {
      expect(EDITOR_MODES).not.toContain('emacs')
    })
  })

  describe('TEAMMATE_MODES', () => {
    it('contains expected modes', () => {
      expect(TEAMMATE_MODES).toContain('auto')
      expect(TEAMMATE_MODES).toContain('tmux')
      expect(TEAMMATE_MODES).toContain('in-process')
    })
  })
})
