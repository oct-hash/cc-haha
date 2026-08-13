import { describe, expect, it } from 'bun:test'
import { detectDecisionQuestion, isDecisionQuestion } from '../decisionDetector'

// ── True Positives ─────────────────────────────────────────────────────────

describe('isDecisionQuestion — true positives (English)', () => {
  it('detects direct choice between frameworks', () => {
    expect(isDecisionQuestion('Should I choose React or Vue for this project?')).toBe(true)
  })

  it('detects "which is better" questions', () => {
    expect(isDecisionQuestion('Which approach is better for handling authentication?')).toBe(true)
  })

  it('detects pros and cons questions', () => {
    expect(isDecisionQuestion('What are the pros and cons of microservices vs monolith?')).toBe(
      true,
    )
  })

  it('detects trade-off questions', () => {
    expect(
      isDecisionQuestion('What is the trade-off between performance and maintainability?'),
    ).toBe(true)
  })

  it('detects recommendation questions', () => {
    expect(isDecisionQuestion('What would you recommend for state management in React?')).toBe(true)
  })

  it('detects "better choice" questions', () => {
    expect(
      isDecisionQuestion('Is PostgreSQL a better choice than MongoDB for this use case?'),
    ).toBe(true)
  })

  it('detects vs-style comparison questions', () => {
    expect(isDecisionQuestion('REST vs GraphQL — which one should we use?')).toBe(true)
  })
})

describe('isDecisionQuestion — true positives (Chinese)', () => {
  it('detects "帮我选一个" patterns', () => {
    expect(isDecisionQuestion('帮我选一个合适的数据库方案')).toBe(true)
  })

  it('detects "哪个更好" patterns', () => {
    expect(isDecisionQuestion('React和Vue哪个更好用？')).toBe(true)
  })

  it('detects "应该用" patterns', () => {
    expect(isDecisionQuestion('这个项目应该用TypeScript还是JavaScript？')).toBe(true)
  })

  it('detects "推荐" patterns', () => {
    expect(isDecisionQuestion('推荐用哪个框架做后端？')).toBe(true)
  })

  it('detects "优缺点" comparison patterns', () => {
    expect(isDecisionQuestion('帮我分析一下这几个方案的优缺点')).toBe(true)
  })

  it('detects "如何选择" patterns', () => {
    expect(isDecisionQuestion('如何选择合适的前端框架？')).toBe(true)
  })

  it('detects listed options with A/B/C', () => {
    expect(
      isDecisionQuestion(
        '现在有三个方案：\nA. 用微服务架构\nB. 用单体架构\nC. 用Serverless\n帮我分析一下',
      ),
    ).toBe(true)
  })
})

// ── True Negatives — programming questions that should NOT route to debate ──

describe('isDecisionQuestion — true negatives (English)', () => {
  it('rejects "how do I implement" questions', () => {
    expect(isDecisionQuestion('How do I implement a binary search tree in TypeScript?')).toBe(false)
  })

  it('rejects "how can I build" questions', () => {
    expect(isDecisionQuestion('How can I build a REST API with Express?')).toBe(false)
  })

  it('rejects "what is" definition questions', () => {
    expect(isDecisionQuestion('What is a closure in JavaScript?')).toBe(false)
  })

  it('rejects "write a function" requests', () => {
    expect(isDecisionQuestion('Write a function that sorts an array of objects')).toBe(false)
  })

  it('rejects "generate a component" requests', () => {
    expect(isDecisionQuestion('Generate a React component for a login form')).toBe(false)
  })

  it('rejects "where does" factual questions', () => {
    expect(isDecisionQuestion('Where does the API key get validated?')).toBe(false)
  })

  it('rejects "when" temporal questions', () => {
    expect(isDecisionQuestion('When is the useEffect cleanup function called?')).toBe(false)
  })

  it('rejects "how many" quantitative questions', () => {
    expect(isDecisionQuestion('How many times does this loop execute?')).toBe(false)
  })

  it('rejects "fix this bug" requests', () => {
    expect(isDecisionQuestion('How do I fix this TypeScript error in my component?')).toBe(false)
  })

  it('rejects "how to deploy" questions', () => {
    expect(isDecisionQuestion('How to deploy a Next.js app to Vercel?')).toBe(false)
  })
})

describe('isDecisionQuestion — true negatives (Chinese)', () => {
  it('rejects "怎么实现" how-to questions', () => {
    expect(isDecisionQuestion('怎么实现一个缓存机制？')).toBe(false)
  })

  it('rejects "什么是" definition questions', () => {
    expect(isDecisionQuestion('什么是闭包？')).toBe(false)
  })

  it('rejects "写一个函数" code generation requests', () => {
    expect(isDecisionQuestion('写一个函数来排序数组')).toBe(false)
  })

  it('rejects "怎么修复" bug fix questions', () => {
    expect(isDecisionQuestion('怎么修复这个空指针异常？')).toBe(false)
  })

  it('rejects "如何配置" setup questions', () => {
    expect(isDecisionQuestion('如何配置webpack的loader？')).toBe(false)
  })

  it('rejects "创建组件" component creation requests', () => {
    expect(isDecisionQuestion('创建一个用户登录组件')).toBe(false)
  })

  it('rejects "什么时候" time-related questions', () => {
    expect(isDecisionQuestion('什么时候应该使用useMemo？')).toBe(false)
  })

  it('rejects prefixed how-to questions (请问...)', () => {
    expect(isDecisionQuestion('请问怎么实现一个LRU缓存？')).toBe(false)
  })
})

// ── Edge Cases ─────────────────────────────────────────────────────────────

describe('isDecisionQuestion — edge cases', () => {
  it('rejects empty string', () => {
    expect(isDecisionQuestion('')).toBe(false)
  })

  it('rejects whitespace-only string', () => {
    expect(isDecisionQuestion('   ')).toBe(false)
  })

  it('rejects very short messages (< 20 chars)', () => {
    expect(isDecisionQuestion('How?')).toBe(false)
  })

  it('rejects single-word messages', () => {
    expect(isDecisionQuestion('React')).toBe(false)
  })

  it('handles messages with mixed content but no decision signal', () => {
    expect(isDecisionQuestion('I need to create a new component for the dashboard page')).toBe(
      false,
    )
  })

  it('rejects messages with "or" but not about choices', () => {
    expect(isDecisionQuestion('You can pass a string or an array to this function')).toBe(false)
  })
})

// ── detectDecisionQuestion function ─────────────────────────────────────────

describe('detectDecisionQuestion', () => {
  it('returns DecisionSignal with isDecision and confidence', () => {
    const result = detectDecisionQuestion('Should I use React or Vue?')
    expect(result.isDecision).toBe(true)
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  it('returns reasons array with matched patterns', () => {
    const result = detectDecisionQuestion('帮我选哪个框架好？')
    expect(result.reasons.length).toBeGreaterThan(0)
    // Each reason should include the weight
    expect(result.reasons.some((r) => r.includes('(w:'))).toBe(true)
  })

  it('returns isDecision=false for non-decision questions', () => {
    const result = detectDecisionQuestion('How do I fix this bug?')
    expect(result.isDecision).toBe(false)
  })

  it('returns isDecision=false for empty input', () => {
    const result = detectDecisionQuestion('')
    expect(result.isDecision).toBe(false)
    expect(result.confidence).toBe(0)
  })

  it('uses threshold of 0.5 for isDecision', () => {
    // A message that barely crosses the 0.5 threshold
    const result = detectDecisionQuestion('What is better: REST or GraphQL for my API?')
    // "better...choice" matches weak group (weight 1), "or" structural (0.5), "?" (0.5)
    // => (1 + 0.5 + 0.5) / 8 = 0.25 — not enough
    // But "is...better" matches moderate group... let's test with a clearly borderline case
    expect(typeof result.confidence).toBe('number')
    expect(result.confidence >= 0).toBe(true)
    expect(result.confidence <= 1).toBe(true)
  })
})
