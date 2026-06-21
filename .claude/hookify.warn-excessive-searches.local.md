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

🔍 **搜索操作提醒**

检测到搜索操作。请关注搜索策略：

- 简单问题 → 1 次搜索足够
- 中等问题 → 3-5 次搜索
- 复杂问题 → 5-10 次搜索
- **超过 15 次** → 搜索风暴，应重新评估策略

**搜索前先问自己：**
1. 这是静态知识吗？→ 直接回答，不搜索
2. 能用 1-6 个关键词吗？→ 保持查询简洁
3. 能用 Context7/GitHub 内源工具吗？→ 优先内源

> 详见 CLAUDE.md 搜索策略章节。
