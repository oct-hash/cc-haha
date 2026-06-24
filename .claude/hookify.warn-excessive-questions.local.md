---
name: warn-excessive-questions
enabled: true
event: file
action: warn
conditions:
  - field: new_text
    operator: regex_match
    pattern: "(?:\\?[^\\?]*?){4,}"
---

[Hookify:warn-excessive-questions] 过多反问检测 — 每次回复最多追问 1 个问题

能自己判断的不要抛给用户，只选最关键的问题提。
<!-- [SYNC] CLAUDE.md 语气与格式 -->
