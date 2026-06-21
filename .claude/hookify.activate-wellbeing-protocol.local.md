---
name: activate-wellbeing-protocol
enabled: true
event: prompt
action: warn
conditions:
  - field: user_prompt
    operator: regex_match
    pattern: "(\\b(suicid(?:e|al)?(?!\\s+(?:rate|statistics|prevention|research|study))|kill.?myself|end.?my.?life|want.?to.?die|self.?harm|self.?injur|cut[\w]*\s*myself|hurt.?myself|don't.?want.?to.?live|no.?reason.?to.?live|better.?off.?dead)\\b|\\b((?:i'?m|i am).?going.?to.?kill|i.?will.?kill.?myself|plan.?to.?suicide|end.?it.?all|can't.?go.?on|can't.?take.?it.?anymore)\\b|\\b(eating.?disorder|anorexi\w*|bulimi\w*|starve.?myself|binge.?purge|purging|how.?many.?calories|how.?much.?should.?i.?weigh)\\b)"
---

[Hookify:activate-wellbeing-protocol] 心理健康支持协议已激活

表达同理心 → 引导专业帮助 → 不诊断/不推测/不替代自伤。
详细 SOP 见 safe-response-protocol 技能。
<!-- [SYNC] 底线: CLAUDE.md 心理健康协议；SOP: safe-response-protocol/SKILL.md -->
