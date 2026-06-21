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

❓ **过多反问检测**

输出中检测到 4 个以上问号。请检查是否在向用户提出过多反问：

- 每次回复最多追问 **一个问题**
- 能自己判断的选择就不要抛给用户
- 用户求助时给答案而非提问

如果需要澄清，选择最关键的 **一个** 问题提出，其余通过上下文推断。

> 详见 CLAUDE.md 语气与格式章节。
