# LLM Agent 指令遵循问题：诊断、学术研究、工业方案

> 研究日期: 2026-08-01
> 问题: Agent 配置了 100+ agents、156+ skills、14 MCP servers，但实际使用率极低
> 结论: 这是 LLM agent 的系统性限制，不是本项目特例

---

## 1. 问题诊断

### 1.1 根本原因

| 机制 | 解释 | 来源 |
|------|------|------|
| **Attention Drift** | 上下文超过 50K tokens 后，system prompt 进入"注意力死区"，模型不再关注早期指令 | Bento Labs 2026 |
| **Prospective Memory Failure** | 任务负载下格式化合规率下降 2-21%，terminal constraints 最脆弱（下降可达 50%） | ACL 2026 TrustNLP |
| **Control Illusion** | System message 的"权威"基本是幻觉，模型经常忽略层级指令，优先跟随社会性线索 | arXiv 2502.15851 |
| **Instruction Hierarchy 脆弱** | 即使显式标记优先级，模型仍频繁 revert 到内在偏好 | ACL 2026 |
| **Lost-in-the-Middle** | 长上下文中间的指令被模型注意力机制忽略 | 多篇论文确认 |

### 1.2 Anthropic 官方确认

> **"Unguided Claude Code sessions succeed only 33% of the time."**
> **"CLAUDE.md is advisory — Claude follows it about 80% of the time."**
>
> — Claude Code in Production (2026): 12 Patterns

> *"If something must happen, it belongs in a hook. Guardrails go in hooks; everything else is a polite suggestion."*
>
> — Claude Code Best Practices 2026

### 1.3 关键数据

| 基准 | 发现 |
|------|------|
| **AGENTIF** (NeurIPS 2025) | 707 条 agent 指令，平均 11.9 约束/条，模型普遍表现差 |
| **CCTU** | 严格遵循所有约束时，**没有模型达到 20%+** 完成率 |
| **256 LLM 测试** | 指令遵循总通过率仅 **43.7%** |
| **IFEval++** | 同义改写后性能下降最高达 **61.8%**（GPT-5 也降 18.3%） |
| **ReliabilityBench** | 扰动下 agent 从 96.9% 降到 88.1%（ε=0.2） |

---

## 2. 学术解决方案

### 2.1 运行时强制执行

| 方案 | 机制 | 效果 |
|------|------|------|
| **AgentLTL** (2026.07 最新) | FO-LTL 形式化规范 → trace verification → block-and-warn online enforcement | 5/7 模型改善合规性；微调 +38pp |
| **SARC** (2026.05) | Pre-Action Gate + Action-Time Monitor + Post-Action Auditor + Escalation Router | 零 hard-constraint 违规 |
| **AgentAssert/ABC** | YAML 行为契约 DSL + (p,δ,k)-Satisfaction 概率保证 + JS Divergence drift detection | 捕获传统 guardrail 漏掉的违规 |
| **ToolGuard (IBM)** | 自然语言政策 → 自动生成 ToolGuard 验证器 → Pre-tool 拦截 | τ-bench Airlines 域验证 |
| **PCAS** | Reference monitor 在 causal context 中检查 policy → deny + structured feedback | 消除 executed policy violations |

### 2.2 架构改进

| 方案 | 机制 |
|------|------|
| **AgentOrca** | 双系统: Program System (oracle, 代码强制执行) + Prompt System (自然语言), DAG 验证 |
| **FAMA** | Failure-Aware Meta-Agent — 错误分析 agents 并行 → orchestrator 归因 → mitigation agent 选择最小修复子集 |
| **MAT Trace Framework** | Message-Action Traces + step/trace contracts + 确定性 replay + budgeted fuzzing |
| **External State Machine** | 动态控制架构 (CPU/ESM) 达到 WAR 0.88 vs Baseline，延迟 ~2.9s/turn |

### 2.3 训练改进

| 方案 | 效果 |
|------|------|
| **AgentLTL finetuning** | +38pp accuracy, +17.5pp compliance on held-out patterns |
| **Reasoning for Instruction Hierarchy (VerIH)** | ~20% absolute gain under conflict settings |
| **Salience-enhanced formatting** | 恢复合规率到 90-100% |

---

## 3. 工业解决方案（可直接借鉴）

### 3.1 核心原则

```
Prompt 规则可被忽略 → Hooks 不可被绕过
"必须做" → Hook (PreToolUse/PostToolUse/Stop)
"应该做" → CLAUDE.md / Skills
```

### 3.2 三层防御架构

```
Layer 1: PreToolUse Hooks (事前拦截)
  ├─ Write/Edit 前 → 检查 planner 是否已执行
  ├─ Bash(git commit) 前 → 检查 code-reviewer 是否已运行
  ├─ 危险命令前 → 强制确认或阻止
  └─ 敏感文件写前 → 阻止

Layer 2: PostToolUse Hooks (事后注入)
  ├─ Write/Edit 后 → 注入提醒「运行 code-reviewer」
  ├─ 任务完成后 → 注入检查清单
  └─ 错误发生后 → 注入相关 memory 教训

Layer 3: Stop Hook (会话门禁)
  ├─ 验证所有强制检查项已完成
  ├─ 未完成 → followup_message 阻止会话结束
  └─ 耗尽重试 → 记录 incident 带入下一会话
```

### 3.3 可复用的开源项目

| 项目 | 核心机制 | 复用价值 |
|------|---------|---------|
| **Harmonist** | Stop hook 门禁：验证 reviewer/memory 后才允许结束 | ⭐⭐⭐ Stop hook 模式 |
| **a-team** | SessionStart 注入技能触发映射表 + PostToolUse 提醒 | ⭐⭐⭐ 技能自动路由 |
| **agent-pr-flow** | "漏斗技巧" — 封堵原始 `gh pr merge`，只让通过脚本 merge | ⭐⭐ Bash 命令拦截 |
| **opencode-review-enforcement** | Pre-push hook 检查每个 commit 是否有 review note | ⭐⭐ Git hook 门禁 |
| **agent-tools + rig** | Agent-hooks + CI gates + git hooks 三层 | ⭐⭐⭐ 多层防御 |
| **hook-driven-workflow-enforcement** | 分类决策框架 + CLI command surfaces 提供 hook 拦截点 | ⭐⭐⭐ 决策框架 |
| **forge** | Guardrails middleware: rescue parsing + retry + required_steps/prerequisites | ⭐⭐ 工具调用可靠性 |
| **Orchestral AI** | Pre/post hooks + context protection + cost limits + MCP integration | ⭐⭐ 框架参考 |

### 3.4 Anthropic 官方推荐架构

| 层级 | 机制 | 可靠性 |
|------|------|--------|
| CLAUDE.md | 项目指令 | ~80%（ advisory） |
| Skills | 可复用任务指令 | 按需加载 |
| Hooks | 确定性自动化 | **100%**（系统级） |
| Subagents | 对抗性审查（独立上下文） | 新鲜视角 |
| Workflows | 多 agent 编排 | 结构化执行 |
| Permission Modes | 操作权限控制 | 硬限制 |

---

## 4. 本项目落地方案

### 4.1 诊断结论

本项目的工具利用率低下**不是更新导致，是 LLM agent 的通用限制**：
- CLAUDE.md 写了 agent 编排规则但 model 经常不遵守
- 100+ agents、156+ skills、14 MCP servers 的基础设施是完整的
- 问题在于 **Prompt 层指令没有 Hook 层强制执行**

### 4.2 修复优先级

| 优先级 | 措施 | 类型 |
|--------|------|------|
| **P0** | PreToolUse: Write/Edit 后强制提醒 code-reviewer | PostToolUse hook |
| **P0** | PreToolUse: git commit 前检查 code-reviewer 已运行 | PreToolUse hook |
| **P1** | SessionStart: 注入 agent/skill 触发映射表 | SessionStart hook |
| **P1** | Stop: 验证强制检查项完成 | Stop hook |
| **P2** | PreToolUse: 阻止危险 git 操作 | PreToolUse hook |
| **P2** | PostToolUse: 错误后注入 memory 教训 | PostToolUse hook |

### 4.3 实现路径

1. 创建 `hooks/workflow-enforcement/` 目录
2. 实现 PreToolUse check-reviewer 脚本
3. 实现 PostToolUse remind-reviewer 脚本
4. 实现 SessionStart inject-skill-map 脚本
5. 实现 Stop gate 脚本
6. 更新 `~/.claude/settings.json` 注册 hooks
7. 测试验证拦截效果

---

## 5. 参考文献

### 学术论文

1. ElKoussy & Perez. "AgentLTL: A Trace-Verification Framework for Measuring, Enforcing, and Training Procedural Compliance in Tool-Using LLM Agents." arXiv:2607.02599, 2026.07.
2. Qi et al. "AGENTIF: Benchmarking Instruction Following of Large Language Models in Agentic Scenarios." NeurIPS 2025.
3. Ye et al. "CCTU: A Benchmark for Tool Use under Complex Constraints." arXiv:2603.15309, 2026.
4. Zhou et al. "Revisiting the Reliability of Language Models in Instruction-Following." ACL 2026.
5. Geng et al. "Control Illusion: The Failure of Instruction Hierarchies in Large Language Models." arXiv:2502.15851, 2025.
6. Palumbo et al. "PCAS: Policy-Compliant Agent Systems." arXiv:2602.16708, 2026.
7. Besanson. "SARC: A Governance-by-Architecture Framework for Agentic AI Systems." arXiv:2605.07728, 2026.
8. Young et al. "When Models Can't Follow: Testing Instruction Adherence Across 256 LLMs." arXiv:2510.18892, 2025.
9. "Towards Enforcing Company Policy Adherence in Agentic Workflows." EMNLP 2025 Industry.
10. "FAMA: Failure-Aware Meta-Agentic Framework." ACL 2026 Findings.
11. "Did You Forget What I Asked? Prospective Memory Failures in LLMs." ACL 2026 TrustNLP.
12. "Beyond Blind Following: MIRAGE Benchmark." EACL 2026.
13. Păduraru et al. "A Trace-Based Assurance Framework for Agentic AI Orchestration." arXiv:2603.18096, 2026.
14. "AgentOrca: A Dual-System Framework." arXiv:2503.08669, 2025.
15. "Towards Reliable Instruction-Following in LLM Multi-Turn Workflows." AAI Labs, 2026.

### 开源项目

1. [Harmonist](https://github.com/gammalabtechnologies/harmonist) — Stop hook 门禁
2. [a-team](https://github.com/RBraga01/a-team) — SessionStart 技能自动路由
3. [agent-pr-flow](https://github.com/jasonjgarcia24/agent-pr-flow) — 漏斗技巧 + CI 门禁
4. [opencode-review-enforcement](https://github.com/CodeDeficient/opencode-review-enforcement) — Git note + pre-push gate
5. [agent-tools + rig](https://github.com/alex-mextner/agent-tools) — Agent-hooks + CI + git hooks
6. [hook-driven-workflow-enforcement](https://github.com/kookr-ai/kookr) — 决策框架
7. [forge](https://github.com/antoinezambelli/forge) — Guardrails middleware
8. [AgentAssert/ABC](https://github.com/qualixar/agentassert-abc) — 行为契约 DSL
9. [Orchestral AI](https://github.com/) — 类型安全 agent 框架
10. [AgentIF](https://github.com/THU-KEG/AgentIF) — Agent 指令遵循基准
11. [CCTU](https://github.com/Junjie-Ye/CCTU) — 工具使用约束基准

### 官方文档

1. [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices)
2. [Claude Code Hooks Guide](https://code.claude.com/docs/en/hooks-guide)
3. [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)
4. [Claude Code Workflows](https://code.claude.com/docs/en/workflows)
5. [Anthropic Agent SDK Hooks](https://code.claude.com/docs/en/agent-sdk/hooks)
6. "Claude Code in Production (2026): 12 Patterns" — danarmustafa
