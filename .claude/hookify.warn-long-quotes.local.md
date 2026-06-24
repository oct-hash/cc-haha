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

[Hookify:warn-long-quotes] 长引用检测 — 检查是否超过 15 词/来源上限

超过 15 词 → 转述；歌词/诗歌 → 零容忍；同一来源 → 只引用一次。
<!-- [SYNC] 权威数值源: CLAUDE.md 版权合规；Skill: copyright-compliance -->
