---
name: project-brief
description: Generate a quick summary of the current project — directory structure, key files, recent git activity, and tech stack.
argumentHint: "[focus-area]"
---

# Project Brief

Generate a concise project overview.

## Steps

1. **Top-level scan**: Run `ls -la` at the project root.

2. **Recent git activity**: Run `git log --oneline -10` for the last 10 commits.

3. **Project type**: Check for package.json, environment.yml, Cargo.toml, setup.py, CLAUDE.md.

4. **Entry points**: Find how to run/build the project.

5. **Output**:

```
## Project Brief

**Tech Stack**: <languages/frameworks>
**Last Activity**: <date>
**Key Directories**:
  src/     — <purpose>
  scripts/ — <purpose>
**How to Run**: <command>
**Recent Work**: <3-5 bullets>
```
