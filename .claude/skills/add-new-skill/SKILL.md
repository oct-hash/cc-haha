---
name: add-new-skill
description: 创建新的 Claude Code skill
---

# Add New Skill

Create a new skill for claude-code-haha.

## Skill Structure

Skills are markdown files with frontmatter:

```markdown
---
name: my-skill
description: What this skill does
---

# My Skill

Description and usage instructions...
```

## Where to Add Skills

### 1. Bundled Skills (built-in)

Add to `src/skills/bundled/`:
- `src/skills/bundled/mySkill.ts` - TypeScript implementation
- `src/skills/bundled/index.ts` - Export the skill

### 2. Project Skills (reusable workflows)

Add to `.claude/skills/`:
- `my-skill.md` - Markdown based skill
- Referenced automatically when present

## Skill Frontmatter

```yaml
---
name: skill-name           # Unique identifier
description: What it does  # Brief description
tools: [Bash, Read, Edit]   # Required tools (optional)
mode: interactive          # Skill mode (optional)
---
```

## Example: Simple Markdown Skill

```markdown
---
name: explain-code
description: Explain what code does
---

# Explain Code

You are a code explainer. When the user provides code, explain:
1. What it does
2. How it works
3. Potential issues

Be concise and use simple language.
```

## Example: TypeScript Skill

```typescript
// src/skills/bundled/mySkill.ts
export const mySkill = {
  name: 'my-skill',
  description: 'Does something useful',

  async run(context) {
    // Skill logic
    return { result: 'done' }
  },
}
```

## Testing Skills

```bash
# List all available skills
openclaw skills list

# Run a skill directly
/skill-name
```

## Best Practices

- Keep skill descriptions concise (< 50 words)
- Use clear, actionable names
- Add examples in the skill body
- Document required tools
