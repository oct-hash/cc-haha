---
name: warn-excessive-searches
enabled: true
event: bash
action: warn
conditions:
  - field: command
    operator: regex_match
    pattern: "(WebSearch|web_search|mcp__.*search|gh search|grep|rg\\s|find\\s)"
---

[Hookify:warn-excessive-searches] 搜索操作提醒 — 匹配复杂度：简单 1 次 / 中等 3-5 次 / 复杂 5-10 次

超过 15 次 → 搜索风暴，重新评估策略。优先 Context7/GitHub 内源工具。
<!-- [SYNC] CLAUDE.md 搜索策略；Skill: search-best-practices -->
