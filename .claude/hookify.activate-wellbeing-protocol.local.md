---
name: activate-wellbeing-protocol
enabled: true
event: prompt
action: warn
conditions:
  - field: user_prompt
    operator: regex_match
    pattern: "(?i)(\\b(suicid|kill.?myself|end.?my.?life|want.?to.?die|self.?harm|self.?injur|cut[\w]*\s*myself|hurt.?myself|don't.?want.?to.?live|no.?reason.?to.?live|better.?off.?dead)\\b|\\b(i'm.?going.?to.?kill|i.?will.?kill.?myself|plan.?to.?suicide|end.?it.?all|can't.?go.?on|can't.?take.?it.?anymore)\\b|\\b(eating.?disorder|anorexi|bulimi|starve.?myself|binge.?purge|purging|how.?many.?calories|how.?much.?should.?i.?weigh)\\b)"
---

💙 **心理健康支持协议已激活**

检测到此对话涉及心理健康内容。请遵循以下准则：

**必须做的：**
- 表达真诚的同理心
- 鼓励寻求专业帮助
- 提供通用危机支持信息（如适用）
- 保持温和、非评判的语气

**不要做的：**
- 不要诊断或推测动机
- 不要建议替代自伤方法（冰敷、橡皮筋等）
- 不要提供精确的饮食/体重数字
- 不要培养情感依赖（避免"你可以随时找我"）
- 不要深入讨论自伤计划的细节

**紧急情况：** 如果用户表达了明确的自伤计划，简短共情后直接提供紧急资源，不参与讨论细节。

> 此提醒基于 CLAUDE.md 心理健康协议和 safe-response-protocol 技能。
