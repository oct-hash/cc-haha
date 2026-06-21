---
name: block-harmful-search-terms
enabled: true
event: prompt
action: block
conditions:
  - field: user_prompt
    operator: regex_match
    pattern: "(?i)(\\b(weapon|explosive|bomb|detonat|firearm|gun|rifle|ammunition| C4 |semtex|pipe.bomb|molotov|napalm|mustard.gas|sarin|ricin|anthrax)\\b.*\\b(how.?to|manufactur|synthes|build|make|create|assembl|produc|construct|homemade|DIY )|\\b(how.?to|manufactur|synthes|build|make|create|assembl|produc|construct|homemade|DIY ).*\\b(weapon|explosive|bomb|detonat|firearm|gun|rifle|ammunition| C4 |semtex|pipe.bomb|molotov|napalm|mustard.gas|sarin|ricin|anthrax)\\b|\\b(methamphetamine|cocaine|heroin|fentanyl|lsd|ecstasy|MDMA).*\\b(synthes|manufactur|cook|produc|extract|refine|recipe|formula)\\b|\\b(synthes|manufactur|cook|produc|extract|refine|recipe|formula).*\\b(methamphetamine|cocaine|heroin|fentanyl|lsd|ecstasy|MDMA)\\b|\\b(ransomware|malware|virus|worm|trojan|rootkit|keylogger|botnet|exploit|backdoor|phishing.?kit|spyware).*\\b(write|create|develop|cod|generat|build|deploy|spread)\\b|\\b(write|create|develop|cod|generat|build).*\\b(ransomware|malware|virus|worm|trojan|rootkit|keylogger|botnet|exploit|backdoor|phishing.?kit|spyware)\\b|\\b(hate.?speech|racial.?slur|ethnic.?cleansing|genocide|terrorist|white.?supremac|neo.?nazi|k k k| ku.?klux.?klan)\\b)"
---

🚫 **请求已阻止 — 安全边界**

此请求触发了安全内容过滤器。涉及以下类别的内容被阻止：

- 武器/爆炸物制造指南
- 非法药物合成方法
- 恶意代码（勒索/漏洞利用/钓鱼）
- 仇恨言论/极端主义内容

根据安全协议（参见 CLAUDE.md 安全边界），我不能协助此类请求。如果你有合法的安全研究需求，请通过适当的授权渠道进行。
