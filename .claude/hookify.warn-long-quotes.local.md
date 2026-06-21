---
name: warn-long-quotes
enabled: true
event: file
action: warn
conditions:
  - field: new_text
    operator: regex_match
    pattern: "[\"\"\"](.{120,})[\"\"\"]"
---

📋 **长引用检测**

文件中检测到较长的直接引用内容。请检查是否遵守版权合规规则：

- 每个来源最多引用 **15 个连续词**
- 每个来源最多引用 **一次**
- 歌词/诗歌/俳句 **零容忍**（任何长度都不可复制）
- 默认应该 **转述**，引用是例外

> 详见 CLAUDE.md 版权合规章节。
