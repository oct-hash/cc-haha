# Changelog

## haha-v1.2 (2026-06-22)

### Quality Gate: 质量门禁系统

新增 `scripts/quality-gate/` 完整质量门禁系统，纯增量、零冲突。

#### 三模式设计

| 模式 | 触发时机 | 通道 | 实时调用 |
|------|---------|------|:---:|
| `pr` | `git push` 前 (pre-push hook) | impact-report + policy-checks + coverage + quarantine | 否 |
| `baseline` | 手动定期快照 | 同上，自动更新覆盖率基线 | 可选 |
| `release` | 发布前 | 全部 6 通道 + 零隔离项 + 必过实时冒烟 | 是 |

#### 六通道详解

1. **impact-report** — `git diff` 分析变更文件，决定后续跑哪些通道（仅 .md 变更 → 跳过 coverage/server）
2. **policy-checks** — 验证 11 条 hookify 规则、16 agents、195 skills、hooks 配置、settings JSON 有效性
3. **coverage** — 棘轮覆盖率检查（`bun test --coverage`），覆盖率只升不降，当前基线 34% funcs / 45% lines
4. **quarantine** — 隔离项管理（增/列/解），30 天最大隔离期，逾期自动升级，release 模式零容忍
5. **server-checks** — MCP 服务器连通性探测（HTTP HEAD + stdio 二进制存在性）
6. **provider-smoke** — 实时 API 端点冒烟测试（需 `--allow-live`），自动遮蔽密钥

#### 新增 npm scripts

```bash
bun run quality-gate               # PR 模式（默认）
bun run quality-gate:baseline      # 基线模式
bun run quality-gate:release       # 发布模式
bun run quality-gate:policy        # 仅策略检查
bun run quality-gate:smoke         # 仅 API 冒烟
bun run quality-gate:setup-pre-push # 安装 pre-push hook
bun run test                       # 运行测试
bun run test:coverage              # 测试 + 覆盖率
```

#### 文件清单 (15 files, +2218 lines)

```
scripts/quality-gate/
├── index.ts          ← CLI 入口 + 编排
├── modes.ts          ← 模式→通道映射
├── setup-pre-push.ts ← Git hook 安装器
├── lanes/
│   ├── types.ts          ← 共享类型
│   ├── impact-report.ts  ← 变更分析
│   ├── policy-checks.ts  ← 配置验证
│   ├── coverage.ts       ← 棘轮覆盖率
│   ├── quarantine.ts     ← 隔离管理
│   ├── server-checks.ts  ← MCP 连通性
│   └── provider-smoke.ts ← API 冒烟
├── utils/
│   ├── helpers.ts    ← 工具函数
│   └── report.ts     ← 终端报告
└── data/
    ├── coverage-baseline.json
    └── quarantined-items.json
```

---

## haha-v1.1 (2026-06-21)

### Five-Layer Defense: 5 层防御系统

从 Fable 5 系统提示工程提取并落地，增强 AI 行为安全和输出质量。

#### 五层架构

| 层 | 组件 | 数量 | 用途 |
|----|------|:---:|------|
| 1 | Hookify Rules | 5 | 实时行为拦截（有害搜索/过度提问/长引用/版权/心理健康） |
| 2 | Skills | 8 | 详细 SOP（安全响应/平衡讨论/引用格式/搜索策略/版权/图片/文档写作） |
| 3 | Custom Agents | 3 | 专门化代理（引用管理/强力搜索/心理健康响应） |
| 4 | CLAUDE.md | 1 | 集中式行为准则（安全边界/版权/心理健康/搜索/语气） |
| 5 | Hooks 配置 | — | PreToolUse/PostToolUse/Stop 生命周期集成 |

#### 新增文件

```
.claude/
├── hookify.activate-wellbeing-protocol.local.md  ← 心理健康协议
├── hookify.block-harmful-search-terms.local.md   ← 有害搜索拦截
├── hookify.warn-excessive-questions.local.md     ← 连续提问警告
├── hookify.warn-excessive-searches.local.md      ← 过度搜索警告
├── hookify.warn-long-quotes.local.md             ← 长引用合规警告
├── agents/
│   ├── citation_agent.md     ← 引用管理代理
│   ├── power-searcher.md     ← 强力搜索代理
│   └── wellbeing-responder.md ← 心理健康响应代理
├── skills/
│   ├── safe-response-protocol/SKILL.md  ← 安全响应 SOP
│   ├── balanced-discussion/SKILL.md     ← 均衡讨论指南
│   ├── citation-format/SKILL.md         ← 引用格式规范
│   ├── search-best-practices/SKILL.md   ← 搜索策略最佳实践
│   ├── copyright-compliance/SKILL.md    ← 版权合规指南
│   ├── image-search-guidelines/SKILL.md ← 图片搜索准则
│   ├── document-writing/SKILL.md        ← 文档写作规范
│   └── safe-response-protocol/          ← 心理健康 SOP
└── settings.local.json                   ← 本地 hook 配置
```

---

## haha-v1.0 (2026-06-21)

### Baseline: 可本地运行的 cc-haha

基于 Anthropic Claude Code 泄露源码，使项目可在本地 Windows 环境下用 Bun 运行。

#### 核心改进

- **可本地运行**: 修复 ColorDiff 启动失败问题
- **双语 README**: 中英文架构分析 + Windows 安装指南
- **CLAUDE.md**: 完整的项目行为准则文档
- **多模型支持**: MiniMax / OpenRouter 等多模型 API 端点
- **Ink TUI**: React 兼容终端界面 (Ink 7)
- **Agent 系统**: systematic review 写作能力
- **GitHub 基础设施**: Issue 模板、FUNDING.yml、@dosubot 配置

#### 项目结构概要

```
src/
├── cli.tsx              ← Windows 入口
├── main.tsx             ← TUI 渲染
├── screens/REPL.tsx     ← 交互界面
├── query.ts             ← LLM 编排
├── tools/               ← Agent Tools
└── services/            ← API/MCP/OAuth
```

#### 技术栈

| 组件 | 技术 |
|------|------|
| Runtime | Bun |
| TUI | Ink (React) |
| Language | TypeScript |
| MCP | @modelcontextprotocol/sdk |
| AI | Anthropic SDK + Multi-Model |

---

## 版本关系

```
main (原始源码)
  ├── haha-v1.0 (基线 — 可运行 + 文档)
  │     └── haha-v1.1 (5层防御系统)
  │           └── haha-v1.2 (质量门禁) ← 当前
```

## 向上游同步

```bash
git remote add upstream https://github.com/NanmiCoder/cc-haha.git
git fetch upstream
git checkout main && git merge upstream/main   # 拉取上游更新
git checkout haha-v1.2 && git merge main        # 合并到当前版本
```
