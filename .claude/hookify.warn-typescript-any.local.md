---
name: warn-typescript-any
enabled: true
event: file
pattern: :\s*any\b
action: warn
---

🔍 **TypeScript 'any' type detected**

Using 'any' defeats the purpose of TypeScript's type system. Consider:
- Using 'unknown' instead for truly unknown types
- Defining proper interfaces/types
- Using generics where applicable