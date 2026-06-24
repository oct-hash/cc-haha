---
name: search-best-practices
description: 搜索最佳实践 — 决策树、查询优化、工具选择、复杂度匹配
when_to_use: 需要决定是否搜索时、选择搜索工具时、搜索策略不清晰时、信息可能过时时
---

# 搜索最佳实践

<!-- [SYNC] 此为详细决策树。底线规则见 CLAUDE.md 搜索策略。Hook: hookify.warn-excessive-searches -->

## 是否需要搜索？

```
遇到问题
├── 静态知识/历史事实/数学公式 → 直接回答，不搜索
├── 当前状态（API版本/事件/人物职位）→ 必须搜索
├── 库/框架文档 → 优先 Context7 MCP
├── 代码示例/项目模板 → 优先 GitHub Search
└── 不确定信息是否过时 → 搜索验证
```

## 搜索次数匹配

| 复杂度 | 搜索次数 | 示例 |
|--------|---------|------|
| 简单 | 1 次 | "React 19 最新版本号" |
| 中等 | 3-5 次 | "Next.js App Router 数据获取的最佳实践" |
| 复杂 | 5-10 次 | "对比三大云服务商的 serverless 方案" |

**超过 15 次** → 搜索风暴，STOP 并重新评估策略。

## 查询格式优化

- **1-6 个关键词** 最佳
- 使用英文搜索（除非用户用中文提问且明确需要中文来源）
- **不要** 用自然语言问题作为搜索词

```
✅ 好: "React 19 useOptimistic example"
❌ 差: "Can you show me how to use the new useOptimistic hook in React version 19?"
```

## 工具选择优先级

1. **GitHub Search** (`gh search code/repos`) — 代码、项目、模板
2. **Context7** (`mcp__context7__query-docs`) — 库/框架最新文档
3. **WebSearch** — 通用网络搜索
4. **WebFetch** — 特定页面深度阅读

## 搜索后处理

- 基于搜索结果的声明 **必须标注来源**
- 不编造引用 — 只标注实际查阅的来源
- 搜索结果相互矛盾时，标注不确定性
