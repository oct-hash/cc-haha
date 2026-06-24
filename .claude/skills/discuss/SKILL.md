---
name: discuss
description: 文件对话系统 - 与 OpenClaw 进行技术讨论
user-invocable: true
allowedTools: [Bash, Read, Write, Grep]
shell: powershell
---

# 文件对话系统 (File-Based Discussion)

与 OpenClaw 通过共享的 Markdown 文件进行技术讨论。所有对话记录在 Git 中，可追溯。

## 命令格式

### 发起讨论
```
/discuss "消息内容"
```
将你的消息作为 OpenClaw 发言追加到讨论文件，然后 Claude Code 自动回复。

### 创建新讨论
```
/discuss new <项目名>
```
创建新的 `PROJECT_DISCUSSION.md` 文件并初始化格式。

### 查看状态
```
/discuss status
```
查看当前讨论文件的发言数量和最后发言时间。

### 追加 Claude Code 发言（手动）
```
/discuss cc "消息内容"
```
以 Claude Code 角色追加发言（用于人工介入对话）。

## 文件格式

```markdown
# 项目：xxx · 技术讨论

`[2026-05-21 20:00:00]` **OpenClaw**:
消息内容

`[2026-05-21 20:00:05]` **Claude Code**:
回复内容
```

## 工作流

1. 你写入 OpenClaw 的发言（通过 `/discuss "..."`）
2. 脚本追加时间戳和角色标记到文件
3. Claude Code 读取文件并生成技术回复
4. 回复追加到文件末尾
5. OpenClaw（WSDL）定时扫描并自动追问

## 快捷命令

- `/d "..."` - 等同于 `/discuss "..."`
- `/d new <项目>` - 等同于 `/discuss new <项目>`
- `/d status` - 等同于 `/discuss status`

## 示例

```
/discuss "我想讨论一下多代理系统的架构设计"
/discuss new 智能会议室系统
/d status
```

## 注意

- 讨论文件位于项目根目录 `PROJECT_DISCUSSION.md`
- Token 限制：只传递最近 20 条对话
- 所有讨论自动提交到 Git 版本控制