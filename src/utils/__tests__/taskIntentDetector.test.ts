import { describe, expect, it } from 'bun:test'
import { isImplementationTask, isReviewRequest } from '../taskIntentDetector'

// ── isReviewRequest: true positives ─────────────────────────────────────────

describe('isReviewRequest — true positives', () => {
  it('detects 审查一下', () => {
    expect(isReviewRequest('审查一下这段代码')).toBe(true)
  })

  it('detects 帮我看看', () => {
    expect(isReviewRequest('帮我看看这段代码有没有问题')).toBe(true)
  })

  it('detects 评审', () => {
    expect(isReviewRequest('帮我评审这个 PR')).toBe(true)
  })

  it('detects English code review', () => {
    expect(isReviewRequest('code review this diff')).toBe(true)
  })
})

describe('isReviewRequest — negatives', () => {
  it('does not flag an implementation request', () => {
    expect(isReviewRequest('帮我实现一个登录功能')).toBe(false)
  })

  it('does not flag a should-style question', () => {
    expect(isReviewRequest('should I review this change')).toBe(false)
  })
})

// ── isImplementationTask: true positives ────────────────────────────────────

describe('isImplementationTask — true positives', () => {
  it('detects 帮我实现', () => {
    expect(isImplementationTask('帮我实现一个登录功能')).toBe(true)
  })

  it('detects 帮我写', () => {
    expect(isImplementationTask('帮我写一个工具函数')).toBe(true)
  })

  it('detects 帮我重构', () => {
    expect(isImplementationTask('帮我重构这个模块')).toBe(true)
  })

  it('detects imperative English implement', () => {
    expect(isImplementationTask('Please implement a caching layer for this service')).toBe(true)
  })
})

describe('isImplementationTask — negatives', () => {
  it('does not flag a how-to question', () => {
    expect(isImplementationTask('怎么实现一个登录功能')).toBe(false)
  })

  it('does not flag 如何实现', () => {
    expect(isImplementationTask('如何实现缓存')).toBe(false)
  })

  it('does not flag a definition question', () => {
    expect(isImplementationTask('什么是依赖注入')).toBe(false)
  })

  it('does not flag a decision question', () => {
    expect(isImplementationTask('帮我选 React 还是 Vue')).toBe(false)
  })

  it('does not flag trivial one-off code-gen (no 帮我 prefix)', () => {
    expect(isImplementationTask('写一个函数')).toBe(false)
  })

  it('does not flag a bare weight-2 change (score < 3)', () => {
    expect(isImplementationTask('新增一个功能')).toBe(false)
  })
})

// ── Mutual exclusion ────────────────────────────────────────────────────────

describe('review vs implement mutual exclusion', () => {
  it('a review request is not an implementation task', () => {
    expect(isReviewRequest('审查一下这段代码')).toBe(true)
    expect(isImplementationTask('审查一下这段代码')).toBe(false)
  })

  it('an implementation request is not a review request', () => {
    expect(isReviewRequest('帮我实现一个功能')).toBe(false)
    expect(isImplementationTask('帮我实现一个功能')).toBe(true)
  })
})

// ── Empty / whitespace ──────────────────────────────────────────────────────

describe('empty and whitespace input', () => {
  it('returns false for empty string', () => {
    expect(isReviewRequest('')).toBe(false)
    expect(isImplementationTask('')).toBe(false)
  })

  it('returns false for whitespace-only string', () => {
    expect(isReviewRequest('   ')).toBe(false)
    expect(isImplementationTask('   ')).toBe(false)
  })
})
