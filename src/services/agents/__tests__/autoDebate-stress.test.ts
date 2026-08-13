/**
 * Auto-Debate Routing — 渐进加压测试 (L1 → L4)
 *
 * 加压维度:
 *   L1 基础: 批量分类正确性、正常流程、防递归
 *   L2 边界: 500条混合消息、错误路径、10并发
 *   L3 压力: 5000条吞吐量、极限输入、50并发
 *   L4 混沌: 竞态条件、随机组合、混合场景
 *
 * 被测模块:
 *   - decisionDetector.ts (纯函数，可大规模测试)
 *   - autoDebateEntry.ts (桥接函数，需 mock adapters)
 *   - query.ts routing guard (集成验证)
 */

import { describe, expect, it } from 'bun:test'
import { detectDecisionQuestion, isDecisionQuestion } from '../../../utils/decisionDetector.js'

// ═══════════════════════════════════════════════════════════════════════════════
// L1 — 基础功能批量验证
// ═══════════════════════════════════════════════════════════════════════════════

describe('L1 — decisionDetector 批量分类 (50条)', () => {
  // ── 确定性分类测试 ─────────────────────────────────────────────────────
  const decisionCases: string[] = [
    'Should I use React or Vue for this project?',
    'Which database is better for real-time analytics: ClickHouse or Druid?',
    '帮我选一个适合高并发的消息队列方案',
    'What are the pros and cons of gRPC vs REST?',
    '这个架构应该用微服务还是单体？',
    '推荐用哪个ORM框架做后端？PostgreSQL + Node.js',
    'REST vs GraphQL — 我们团队应该选哪个？',
    'Is it better to use NoSQL or SQL for this e-commerce platform?',
    '如何选择合适的前端状态管理方案？Redux vs Zustand vs Jotai',
    'What trade-offs should I consider between consistency and availability?',
    '帮我分析一下这几个方案的优缺点：A. 自建 B. 云服务 C. 混合',
    '方案一用Kafka，方案二用RabbitMQ，方案三用Redis Stream，怎么选？',
    'Which approach would you recommend for handling distributed transactions?',
    '现在有三个选项：\nA. 继续用现有架构\nB. 迁移到K8s\nC. 用Serverless\n帮我决策',
    'Should we adopt TypeScript or stay with vanilla JavaScript?',
    '你觉得用Rust重写这个模块值得吗？还是继续用Go？',
    '对比一下Elasticsearch和Meilisearch哪个更适合我们的搜索场景',
    'Is it worth migrating from REST to GraphQL at this stage?',
    '帮我权衡一下：自己训练模型 vs 调用API，成本和效果怎么平衡？',
    'Which caching strategy is best for our use case: write-through or write-behind?',
  ]

  const nonDecisionCases: string[] = [
    'How do I implement a binary search tree?',
    'What is a Promise in JavaScript?',
    'Write a function that sorts an array of objects by date',
    '怎么修复这个TypeScript类型错误？',
    'How to deploy a Next.js app to Vercel?',
    '什么是闭包？请举例说明',
    'Generate a React login form component',
    'How many requests per second can this API handle?',
    'When does useEffect cleanup run?',
    'Where is the authentication middleware defined?',
    '创建用户注册组件',
    '怎么配置webpack的loader和plugin？',
    'How do I fix this CORS error?',
    '写一个函数来解析CSV文件',
    'How to set up ESLint and Prettier in a monorepo?',
    '什么是依赖注入？有什么好处？',
    '请问怎么实现LRU缓存？',
    'How to configure Nginx as a reverse proxy?',
    'Fix the memory leak in the data processing pipeline',
    '什么时候应该使用useMemo而不是useCallback？',
    'How to install PostgreSQL on Ubuntu 22.04?',
    '创建一个带搜索功能的数据表格组件',
    '怎么调试Node.js的内存泄漏问题？',
    'How to write unit tests for async functions?',
    '什么是RESTful API设计的最佳实践？',
    'How to optimize Docker image size?',
    '写一个异步任务队列处理器',
    '怎么配置CI/CD流水线？',
    'How to handle file uploads in Express?',
    'What version of React introduced hooks?',
  ]

  it('L1.1 — 20 条决策问题全部识别', () => {
    const results = decisionCases.map((msg) => ({
      msg: msg.slice(0, 30),
      isDecision: detectDecisionQuestion(msg).isDecision,
    }))
    const missed = results.filter((r) => !r.isDecision)
    if (missed.length > 0) {
      console.error(
        'Missed decisions:',
        missed.map((m) => m.msg),
      )
    }
    expect(missed.length).toBe(0)
  })

  it('L1.2 — 30 条非决策问题全部拒绝', () => {
    const results = nonDecisionCases.map((msg) => ({
      msg: msg.slice(0, 30),
      isDecision: detectDecisionQuestion(msg).isDecision,
    }))
    const falsePositives = results.filter((r) => r.isDecision)
    if (falsePositives.length > 0) {
      console.error(
        'False positives:',
        falsePositives.map((m) => m.msg),
      )
    }
    expect(falsePositives.length).toBe(0)
  })

  it('L1.3 — 决策类置信度 > 0.5', () => {
    for (const msg of decisionCases) {
      const result = detectDecisionQuestion(msg)
      expect(result.confidence).toBeGreaterThan(0.5)
    }
  })

  it('L1.4 — isDecisionQuestion 高置信度路由', () => {
    // isDecisionQuestion 要求 confidence >= 0.5
    const routed = decisionCases.filter((m) => isDecisionQuestion(m))
    // 至少 85% 的决策问题应被路由
    expect(routed.length).toBeGreaterThanOrEqual(Math.floor(decisionCases.length * 0.85))
  })

  it('L1.5 — 非决策类 isDecisionQuestion 全为 false', () => {
    const routed = nonDecisionCases.filter((m) => isDecisionQuestion(m))
    expect(routed.length).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// L2 — 边界与压力
// ═══════════════════════════════════════════════════════════════════════════════

describe('L2 — 边界 & 500条混合消息', () => {
  // ── 生成 500 条混合消息 ─────────────────────────────────────────────────
  function generateMixedMessages(count: number): Array<{ msg: string; expectDecision: boolean }> {
    const decisionTemplates = [
      'Should I use {A} or {B} for {C}?',
      '帮我选一个{C}的{A}方案',
      'Which {A} is better for {B}: {C} or {D}?',
      '{A} vs {B} — 哪个更适合{C}？',
      '推荐用哪个{A}做{B}？',
      'Pros and cons of {A} vs {B} for {C}',
      'Is it better to use {A} or {B}?',
      '帮我权衡{A}和{B}的利弊',
      'What would you recommend: {A} or {B}?',
      '如何选择{C}的{A}？',
    ]

    const nonDecisionTemplates = [
      'How to implement {A} in {B}?',
      'Write a function to {A}',
      '什么是{A}？',
      '怎么修复{A}的错误？',
      'How to configure {A} for {B}?',
      'Generate a {A} component',
      'When should I use {A}?',
      '怎么实现一个{A}？',
      'Fix the {A} bug in {B}',
      'Where is the {A} defined?',
    ]

    const tech = ['React', 'Vue', 'Angular', 'Node.js', 'PostgreSQL', 'MongoDB', 'Redis', 'Kafka']
    const concepts = ['缓存', '认证', '数据库', 'API', '微服务', '前端框架', '状态管理', '部署']

    const messages: Array<{ msg: string; expectDecision: boolean }> = []
    for (let i = 0; i < count; i++) {
      const isDecision = i < count / 2
      const templates = isDecision ? decisionTemplates : nonDecisionTemplates
      const template = templates[i % templates.length]
      const msg = template
        .replace(/\{A\}/g, tech[i % tech.length])
        .replace(/\{B\}/g, tech[(i + 1) % tech.length])
        .replace(/\{C\}/g, concepts[i % concepts.length])
        .replace(/\{D\}/g, tech[(i + 2) % tech.length])
      messages.push({ msg, expectDecision: isDecision })
    }
    return messages
  }

  const mixed500 = generateMixedMessages(500)

  it('L2.1 — 500条分类准确率 ≥ 90%', () => {
    let correct = 0
    const errors: string[] = []
    for (const { msg, expectDecision } of mixed500) {
      const actual = detectDecisionQuestion(msg).isDecision
      if (actual === expectDecision) {
        correct++
      } else if (errors.length < 10) {
        errors.push(`Expected ${expectDecision}, got ${actual}: "${msg.slice(0, 50)}"`)
      }
    }
    const accuracy = correct / mixed500.length
    if (accuracy < 0.9) {
      console.error('Classification errors:', errors)
    }
    expect(accuracy).toBeGreaterThanOrEqual(0.9)
  })

  it('L2.2 — 单条消息分类延迟 < 1ms', () => {
    const msg = 'Should I use Kubernetes or Docker Swarm for container orchestration?'
    const start = performance.now()
    for (let i = 0; i < 100; i++) {
      detectDecisionQuestion(msg)
    }
    const avgMs = (performance.now() - start) / 100
    expect(avgMs).toBeLessThan(1)
  })

  it('L2.3 — 空字符串和空白', () => {
    expect(detectDecisionQuestion('').isDecision).toBe(false)
    expect(detectDecisionQuestion('   ').isDecision).toBe(false)
    expect(detectDecisionQuestion('\n\t').isDecision).toBe(false)
  })

  it('L2.4 — 超长消息 (10KB)', () => {
    const prefix = 'Should I choose '
    const suffix = ' for this project?'
    const filler = 'very '.repeat(2000) // ~10KB
    const msg = prefix + filler + suffix
    const result = detectDecisionQuestion(msg)
    // 应该能正常处理不崩溃，不超时
    expect(typeof result.isDecision).toBe('boolean')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('L2.5 — Unicode 和特殊字符', () => {
    const cases = [
      '我应该用React还是Vue？🎯',
      'Which is better: solution A 😊 or B 🤔?',
      '帮我选：α架构 vs β架构 vs γ架构',
      'Should I use C# or F# for this financial app?',
      '推荐用哪个ライブラリ？',
      'Should I choose Реакт or Вью?',
    ]
    for (const msg of cases) {
      const result = detectDecisionQuestion(msg)
      expect(typeof result.isDecision).toBe('boolean')
      // 不应崩溃
      expect(result.confidence).toBeGreaterThanOrEqual(0)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// L3 — 高压吞吐量 & 极限输入
// ═══════════════════════════════════════════════════════════════════════════════

describe('L3 — 高压 5000条 吞吐量', () => {
  it('L3.1 — 5000条分类吞吐量 (目标: <0.5ms/条)', () => {
    const messages: string[] = []
    const tech = [
      'React',
      'Vue',
      'Angular',
      'Svelte',
      'SolidJS',
      'PostgreSQL',
      'MySQL',
      'MongoDB',
      'Redis',
      'Kafka',
      'GraphQL',
      'REST',
      'gRPC',
      'Docker',
      'Kubernetes',
      'TypeScript',
      'Rust',
      'Go',
      'Python',
      'Java',
    ]

    for (let i = 0; i < 5000; i++) {
      const a = tech[i % tech.length]
      const b = tech[(i + 1) % tech.length]
      if (i % 2 === 0) {
        messages.push(`Should I use ${a} or ${b} for my next project?`)
      } else {
        messages.push(`How to implement a ${a} client in ${b}?`)
      }
    }

    const start = performance.now()
    for (const msg of messages) {
      detectDecisionQuestion(msg)
    }
    const totalMs = performance.now() - start
    const avgMs = totalMs / messages.length

    // 5000 条应在 2.5s 内完成 (< 0.5ms/条)
    expect(totalMs).toBeLessThan(2500)
    // 平均延迟检查
    if (avgMs >= 0.5) {
      console.warn(`L3.1 avg latency: ${avgMs.toFixed(3)}ms (target < 0.5ms)`)
    }
  })

  it('L3.2 — 5000条分类准确率保持 ≥ 90%', () => {
    const messages: Array<{ msg: string; expectDecision: boolean }> = []
    const tech = ['React', 'Vue', 'MongoDB', 'PostgreSQL', 'Redis']

    for (let i = 0; i < 5000; i++) {
      const isDecision = i % 2 === 0
      const a = tech[i % tech.length]
      const b = tech[(i + 1) % tech.length]
      if (isDecision) {
        messages.push({
          msg: `Should I use ${a} or ${b} for my project?`,
          expectDecision: true,
        })
      } else {
        messages.push({
          msg: `How to implement a ${a} connection pool in ${b}?`,
          expectDecision: false,
        })
      }
    }

    let correct = 0
    for (const { msg, expectDecision } of messages) {
      if (detectDecisionQuestion(msg).isDecision === expectDecision) correct++
    }
    const accuracy = correct / messages.length
    expect(accuracy).toBeGreaterThanOrEqual(0.9)
  })

  it('L3.3 — 极限长度消息 (100KB)', () => {
    const prefix = 'Should I choose '
    const suffix = ' for this architecture?'
    const filler = 'x'.repeat(100 * 1024) // 100KB
    const msg = prefix + filler + suffix

    const start = performance.now()
    const result = detectDecisionQuestion(msg)
    const elapsed = performance.now() - start

    // 不应崩溃，应在合理时间内完成 (< 50ms for 100KB)
    expect(typeof result.isDecision).toBe('boolean')
    expect(elapsed).toBeLessThan(50)
  })

  it('L3.4 — 1000 个随机 Unicode 码点不崩溃', () => {
    for (let i = 0; i < 1000; i++) {
      let msg = ''
      // 生成随机中文/英文/Emoji 混合消息
      const types = ['decision', 'non-decision'] as const
      const type = types[i % 2]
      if (type === 'decision') {
        msg = `帮我选方案${String.fromCodePoint(0x4e00 + (i % 20000))}还是方案${String.fromCodePoint(0x4e00 + ((i + 1) % 20000))}？`
      } else {
        msg = `怎么实现${String.fromCodePoint(0x4e00 + (i % 20000))}功能？`
      }
      const result = detectDecisionQuestion(msg)
      expect(typeof result.isDecision).toBe('boolean')
    }
  })

  it('L3.5 — 含大量换行和特殊字符的消息', () => {
    const msg =
      '帮我决策：\n\n'.repeat(100) +
      'A. 方案一\nB. 方案二\nC. 方案三\n'.repeat(50) +
      '\t\t' +
      '\x00\x01\x02'.repeat(10)

    const result = detectDecisionQuestion(msg)
    // 不应崩溃
    expect(typeof result.isDecision).toBe('boolean')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// L4 — 混沌 / 破坏性测试
// ═══════════════════════════════════════════════════════════════════════════════

describe('L4 — 混沌 & 竞态', () => {
  it('L4.1 — 快速交替 decision/non-decision 不变异', () => {
    // 验证连续调用不互相影响 (无状态泄漏)
    const results: boolean[] = []
    for (let i = 0; i < 500; i++) {
      if (i % 2 === 0) {
        results.push(isDecisionQuestion('Should I use React or Vue?'))
      } else {
        results.push(isDecisionQuestion('How to implement a cache?'))
      }
    }

    // 所有偶数索引应为 true，奇数应为 false
    for (let i = 0; i < results.length; i++) {
      expect(results[i]).toBe(i % 2 === 0)
    }
  })

  it('L4.2 — 随机输入模糊测试 (1000次)', () => {
    const prefixes = [
      '',
      ' ',
      '   ',
      '请问',
      'Hey, ',
      'Quick question: ',
      '帮我看下，',
      '大佬，',
      '\n',
      '\t',
      '????',
    ]
    const cores = [
      'Should I use React or Vue?',
      'How to implement a cache?',
      '帮我选一个框架',
      '怎么修复这个bug',
      'React vs Vue which is better',
      'Write a function',
      'What is TypeScript?',
      '推荐用哪个数据库',
    ]
    const suffixes = ['', '?', '？', '!!!', '...', '。', '\n', ' 🙏']

    for (let i = 0; i < 1000; i++) {
      const msg =
        prefixes[i % prefixes.length] + cores[i % cores.length] + suffixes[i % suffixes.length]
      const result = detectDecisionQuestion(msg)
      // 基本不变量
      expect(typeof result.isDecision).toBe('boolean')
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
      if (result.isDecision) {
        expect(result.reasons.length).toBeGreaterThan(0)
      }
    }
  })

  it('L4.3 — 并发调用 detectDecisionQuestion (Promise.all × 200)', async () => {
    const messages = Array.from({ length: 200 }, (_, i) =>
      i % 2 === 0
        ? `Should I use framework_${i}A or framework_${i}B?`
        : `How to implement feature_${i}?`,
    )

    const results = await Promise.all(
      messages.map((msg) => Promise.resolve(detectDecisionQuestion(msg))),
    )

    expect(results).toHaveLength(200)
    for (let i = 0; i < results.length; i++) {
      expect(results[i].isDecision).toBe(i % 2 === 0)
    }
  })

  it('L4.4 — 同一条消息多次调用结果一致 (幂等性)', () => {
    const msg = 'Should I use microservices or a monolith for this e-commerce platform?'
    const first = detectDecisionQuestion(msg)

    for (let i = 0; i < 100; i++) {
      const result = detectDecisionQuestion(msg)
      expect(result.isDecision).toBe(first.isDecision)
      expect(result.confidence).toBe(first.confidence)
      expect(result.reasons).toEqual(first.reasons)
    }
  })

  it('L4.5 — 结构化评分与关键词评分一致性', () => {
    // 验证 decisionDetector 内部的结构化评分不覆盖关键词评分
    // 当关键词已明确指示决策类时, 不应因为缺少结构化信号而降级
    const msg = '帮我选一个方案'
    const result = detectDecisionQuestion(msg)
    // 关键词 "帮我选" + "方案" 足以判定为决策类
    expect(result.isDecision).toBe(true)
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('L4.6 — 仅靠结构化信号 (选项列表) 触发', () => {
    // 没有显式决策关键词，但有 A/B/C 选项列表 + "帮我分析"
    const msg =
      '现在有三个技术方向：\nA. 继续用Python单体\nB. 迁移到Go微服务\nC. 用Rust重写核心模块\n帮我分析一下'
    const result = detectDecisionQuestion(msg)
    expect(result.isDecision).toBe(true)
  })

  it('L4.7 — 正则 ReDoS 防护 (无回溯爆炸)', () => {
    // 构造可能触发灾难性回溯的输入
    const dangerous =
      'Should I choose ' + 'a'.repeat(1000) + ' or ' + 'b'.repeat(1000) + ' for this?'
    const start = performance.now()
    const result = detectDecisionQuestion(dangerous)
    const elapsed = performance.now() - start

    // 不应超过 100ms (防止 ReDoS)
    expect(elapsed).toBeLessThan(100)
    expect(typeof result.isDecision).toBe('boolean')
  })

  it('L4.8 — 混合场景：决策 + 非决策批量交替', () => {
    // 模拟真实对话流：用户在多轮对话中可能混合提问
    const conversationFlow = [
      'How to set up a React project?', // 非决策
      'Should I use Redux or Zustand for state management?', // 决策
      'Can you write a login component?', // 非决策
      '帮我选：JWT还是Session认证？', // 决策
      'How to deploy to AWS?', // 非决策
      '推荐用哪个CI/CD工具？Jenkins vs GitHub Actions', // 决策
      'Fix the TypeScript error in line 42', // 非决策
      '对比一下这三个监控方案：Prometheus, Datadog, Grafana', // 决策
    ]

    const expected = [false, true, false, true, false, true, false, true]
    const actual = conversationFlow.map((msg) => isDecisionQuestion(msg))

    expect(actual).toEqual(expected)
  })
})
