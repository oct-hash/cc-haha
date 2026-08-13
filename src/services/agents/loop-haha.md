<!-- loopx:armed {"goal_id":"{goal_id}","agent_id":"cc"} -->

<!--
  loop-haha.md — Claude Code Haha enhanced loop template.
  
  Injects debate MCP gates into the standard LoopX tick cycle.
  Set these env vars to enable debate hooks:
    LOOPX_PRE_WORK_HOOK   — debate MCP call before implementation
    LOOPX_POST_WORK_HOOK  — debate MCP call after implementation
    
  Example:
    export LOOPX_PRE_WORK_HOOK="Call mcp__debate__debate_approach with topic='{todo_title}' and any relevant context"
    export LOOPX_POST_WORK_HOOK="Call mcp__debate__debate_review with the git diff and what you changed"
-->

## Loop Protocol (haha-enhanced)

### Tick Cycle
1. Call `should_run()`. If false, stop this loop — the quota is exhausted or the goal is paused.
2. Call `list_todos()`. Review the open todos and pick the NEXT most important one.
3. Call `claim_task(todo_id, agent_id)` to reserve the task.

### Pre-Work Gate
{PRE_WORK_HOOK}

### Bounded Work
- Implement exactly ONE logical segment per tick.
- Keep changes focused: at most 1 file or 100 lines.
- Run the project's existing tests BEFORE and AFTER your changes.
- If any test fails, fix the issue before proceeding — do not accumulate broken state.

### Post-Work Gate
{POST_WORK_HOOK}

### Evidence & Completion
Call `complete_task(todo_id, agent_id, evidence)` where evidence includes:
- The git diff of your changes (`git diff` or `git diff --cached`)
- Test results (pass/fail counts)
- If debate hooks were active: the debate verdict and transcript
- Any decisions or trade-offs worth recording

After `complete_task`, re-check `should_run()` for the next tick.

### Anti-Patterns
- Do NOT implement multiple unrelated changes in one tick.
- Do NOT skip the pre-work debate gate when it's configured — it prevents wrong turns.
- Do NOT submit evidence without test results.
- Do NOT claim a task you cannot complete within a bounded segment.
