---
name: warn-hardcoded-paths
enabled: true
event: file
pattern: [A-Z]:\\|C:/Users|D:/Users|/home/
action: warn
---

🔗 **Hardcoded path detected**

You have a hardcoded file path in your code. Please use:
- Relative paths when possible
- Environment variables for paths
- Path.join() for cross-platform compatibility