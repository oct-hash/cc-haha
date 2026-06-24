---
name: warn-todo-fixme
enabled: true
event: file
pattern: TODO|FIXME|XXX|HACK
action: warn
---

📝 **TODO/FIXME comment detected**

You have an unresolved TODO or FIXME comment. Please:
- Complete the task before committing
- Create a GitHub issue if it's deferred
- Add a跟踪号 (issue number) if already tracked