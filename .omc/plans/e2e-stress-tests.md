# E2E Stress Tests: Full Tool Chain (Skills + MCP + ECC + Hooks)

## Context

当前 E2E 测试覆盖仅限：
- `__tests__/hooks-stress.test.ts` — workflow-enforcement 的 4 个 bash 脚本
- `services/agents/__tests__/session-save-stress.test.ts` — SessionManager 序列化

缺失覆盖：
- **Skills** 加载/匹配/调用（`src/skills/loadSkillsDir.ts`）
- **MCP** client 连接/工具发现/工具调用（`src/services/mcp/client.ts`, `InProcessTransport`）
- **ECC** hook 链执行（bootstrap → dispatcher → 各 hook 脚本）
- **Hooks** 引擎 PreToolUse/PostToolUse/Stop 触发（`src/utils/hooks.ts`）
- 以上四个系统的 **组合流水线**（skill → MCP tool → hook trigger）

## Work Objectives

创建两个新的 E2E 压力测试文件，分别覆盖组件级（in-process）和流水线级（subprocess）测试，采用 L1→L4 渐进难度模式（遵循现有 hooks-stress.test.ts 惯例）。

---

## Guardrails

### MUST HAVE
1. 两个测试文件：`component-stress.test.ts` + `pipeline-stress.test.ts`
2. L1→L4 渐进难度（sequential → 10-20 → 30-50 → 50-100 concurrent）
3. 隔离：每次运行使用临时 HOME/CLAUDE_CONFIG_DIR
4. 兼容 Windows（Bun.spawn 用 bash，no Playwright）
5. `bun test --isolate` 可运行（每个测试文件独立进程）
6. 合理的超时时间（in-process: 10-60s, subprocess: 60-300s）
7. 每个步骤有明确的验收标准（断言/exitCode/输出校验）

### MUST NOT
1. 不使用 Playwright（遵循现有 Bun.spawn 模式）
2. Subprocess 测试默认不调用真实 LLM API（用 mock/short-circuit 避免 CI 烧钱）
3. 不修改被测源码（只添加测试文件）——除非需要暴露内部 API
4. 不创建 >1000 行的测试文件
5. 不引入新的 npm 依赖

---

## Task Flow

### Step 1: Create reusable test utilities
**File:** `src/__tests__/e2e-stress/test-helpers.ts`

提供两个测试文件共享的工具：
- **Isolation helpers**: `createTempHome()`, `createTempConfigDir()`, `cleanupTemp()`
- **Skill file writers**: `writeSkillFile(dir, name, content)`, `writeSimpleSkill()` — 在临时 skills/ 目录创建最小化 SKILL.md
- **MCP mock factory**: `createMockMCPServer()` — 基于 InProcessTransport 构建最小化 MCP server，暴露 `listTools`/`callTool` 方法
- **CLI spawn helper**: `spawnHeadlessCLI(prompt, env?)` → `{ stdout, stderr, exitCode }` — 封装 `Bun.spawn` 调用 `bun ./src/localRecoveryCli.ts`
- **Hook exec helpers**: `runHookScript(script, stdin)` — 从 hooks-stress.test.ts 抽取出通用模式
- **Concurrency orchestrator**: `runConcurrently(n, fn)`, `runBurst(n, fn)` — Promise.all 封装带统计
- **Result validators**: `assertAllSucceed(results)`, `assertSurvivalRate(results, minRate)` — 统计 exitCode/成功率

**验收标准:**
- [ ] 所有 helper 函数有类型签名
- [ ] `createMockMCPServer()` 能通过 InProcessTransport 建立 client-server 连接
- [ ] `spawnHeadlessCLI()` 能成功退出（即使只是 `--help`）

### Step 2: Build component-stress.test.ts (in-process tests)
**File:** `src/__tests__/e2e-stress/component-stress.test.ts`

直接调用 TypeScript API（no subprocess），覆盖 Skills、MCP、Hooks 引擎的组件级压测。

#### describe('L1 — Basic'): 基础功能正确性（~20 tests）
- **Skills 块:**
  - `getSkillDirCommands()` 加载 managed/user/project 三层 skill 目录
  - `createSkillCommand()` 解析 SKILL.md frontmatter
  - `parseSkillFrontmatterFields()` 提取 name/description/allowed-tools
  - `addSkillDirectories()` / `clearDynamicSkills()` 动态注册/注销
  - 边界：空目录、损坏的 frontmatter、循环引用
- **MCP 块:**
  - `createLinkedTransportPair()` 创建客户端/服务端对
  - 通过 transport 发送 `initialize` / `tools/list` / `tools/call` JSON-RPC 消息
  - Mock server 注册 3 个工具，验证 list/call 往返
  - 边界：transport close、重复 close、空 response
- **Hooks 引擎块:**
  - `getMatchingHooks()` 匹配 PreToolUse/PostToolUse hook 配置
  - `createBaseHookInput()` 生成 hook 输入 JSON
  - `shouldSkipHookDueToTrust()` 信任模式跳过逻辑

#### describe('L2 — Medium stress'): 10-20 并发（~10 tests）
- **Skills:** 15 个并行 `getSkillDirCommands()` 调用，验证缓存不损坏
- **MCP:** 10 个并发 `tools/call` 往返，InProcessTransport 消息排序验证
- **Hooks:** 20 个并发 `getMatchingHooks()` 查询，验证结果一致性
- **混合:** 10 个并发 (skill 加载 + MCP tool 调用)，交叉污染检测

#### describe('L3 — High stress'): 30-50 并发 + 混沌注入（~8 tests）
- **Skills:** 30 并发加载 + 中途 `clearSkillCaches()`
- **MCP:** 50 并发 tool 调用，中途 transport close
- **Hooks:** 40 并发 hook 匹配 + 中途修改 hook 配置
- **混沌:** 删除 skill 目录 mid-load、关闭 transport mid-call、修改 hook config mid-query

#### describe('L4 — Extreme stress'): 50-100 并发 + 恢复（~6 tests）
- **Skills:** 100 并发加载/清理/重新加载周期
- **MCP:** 100 并发 tool 调用（消息队列压力）
- **全系统:** Skills + MCP + Hooks 三系统并发 80 操作混合
- **恢复:** 极限压力后验证正常功能（load skill → call tool → match hook）

**验收标准:**
- [ ] 所有 L1 测试通过（exitCode 0，断言精确）
- [ ] L2 成功率 >= 90%
- [ ] L3 成功率 >= 70%，无进程崩溃
- [ ] L4 成功率 >= 50%，恢复后 L1 测试重新通过
- [ ] 无内存泄漏（Bun 进程在测试后正常退出）

### Step 3: Build pipeline-stress.test.ts (subprocess tests)
**File:** `src/__tests__/e2e-stress/pipeline-stress.test.ts`

通过 `Bun.spawn` 启动 headless CLI，验证真实工具链。

> **LLM API 策略**: 默认使用 mock/short-circuit 模式避免 CI 中真实 API 调用。
> - `L1`: 用 `--help` / `-v` 验证 CLI 启动，或用极短 prompt（`"reply OK"`，不触发工具调用）
> - `L2-L4`: 设置 `ANTHROPIC_BASE_URL=http://localhost:1`（无效 endpoint）验证错误处理路径，或设置 `CLAUDE_CODE_FORCE_RECOVERY_CLI=1` 只用 recovery 模式
> - 如需真实 LLM 验证，环境变量 `E2E_LIVE_API=1` 启用

#### describe('L1 — Basic CLI pipeline'): CLI 启动 + 基本流程（~12 tests）
- CLI 启动: `--help`, `--version` 验证退出码 0 + 输出包含预期文本
- Recovery CLI: `-p "reply OK" --output-format json` 验证 JSON 输出格式
- Skills 路径: 设置 `CLAUDE_CONFIG_DIR` 指向含 skill 的 temp 目录，验证 CLI 能启动
- MCP 配置: 设置 `MCP_JSON` 环境变量指向空配置，验证不崩溃
- Hook 配置: 设置 hook settings 指向 workflow-enforcement 脚本，验证不阻塞启动
- 组合: Skill + MCP config + Hook config 同时存在，CLI 正常启动

#### describe('L2 — Medium stress'): 10-20 并发 CLI spawn（~6 tests）
- 10 个并行 `--help` 调用，验证全部成功
- 10 个并行 `-v` 调用，验证全部成功
- 15 个并行 recovery CLI 调用（短 prompt），验证 JSON 输出一致性
- 不同环境变量组合并发: 有的带 skill dir，有的带 MCP config，有的带 hook config

#### describe('L3 — High stress'): 30-50 并发 + 环境混沌（~6 tests）
- 30 个并行 CLI 启动（短 prompt），timeout 控制
- 50 个并行 `--help` 压力测试
- 混沌: 中途删除 skill 目录、修改 MCP config、截断 hook script 文件
- 混合操作: 同时 CLI spawn + 文件写入 + 目录操作

#### describe('L4 — Extreme stress'): 50-100 并发 + 恢复（~5 tests）
- 80 个并行 recovery CLI 调用
- 100 个并行 `--help` 调用
- 资源耗尽模拟: tmp 目录满（创建 500 junk files）
- 灾后恢复: 极限压力后执行 L1 测试序列验证系统恢复

**验收标准:**
- [ ] L1 所有 CLI 基本操作通过
- [ ] L2 并发成功率 >= 90%
- [ ] L3 生存率 >= 70%，无僵尸进程
- [ ] L4 生存率 >= 50%，灾后 L1 恢复测试通过
- [ ] `bun test --isolate` 运行后无挂起进程

### Step 4: Write open questions and document edge cases
**File:** `.omc/plans/open-questions.md` (append)

记录计划执行中需要决策的问题。

---

## Detailed File Structure

```
src/__tests__/e2e-stress/
├── test-helpers.ts              # ~300 lines — 共享工具
├── component-stress.test.ts     # ~600 lines — 组件级压测（in-process）
└── pipeline-stress.test.ts      # ~500 lines — 流水线压测（subprocess）
```

**总计**: ~1400 lines across 3 files

---

## Success Criteria (for the work)

1. `bun test src/__tests__/e2e-stress/component-stress.test.ts --isolate` passes on Windows
2. `bun test src/__tests__/e2e-stress/pipeline-stress.test.ts --isolate` passes on Windows
3. L1 tests: 100% pass rate required
4. L2 tests: >= 90% success rate
5. L3 tests: >= 70% survival rate
6. L4 tests: >= 50% survival rate with recovery verification
7. No test file exceeds 800 lines
8. Tests do not leave zombie bun/bash processes
9. Zero new npm dependencies
10. Temp directories are cleaned up after tests (even on failure)

---

## Key Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| MCP mock server 复杂度过高 | block | 使用最小化 InProcessTransport handler，不实现完整 MCP 协议 |
| Skills `loadSkillsDir` 需要真实文件系统 | medium | 使用 temp dir + `SKILL.md` 模板文件 |
| ECC hooks.js 依赖完整 hook chain | high | 只测 hooks.js 入口（Node spawn），不测完整 ECC 38-agent 链 |
| CLI subprocess 在 Windows 上启动慢 | medium | 超时设为 60s-120s 基础 + 并发加成 |
| `--isolate` 与 temp dir 冲突 | low | 每个 test 内使用独立子目录 |
| Skill forked 调用 spawn 子进程 | medium | L1 只测 inline skills；L2+ 谨慎测试 forked |

---

## Open Questions

See `.omc/plans/open-questions.md` for pending decisions. Key items:

1. **LLM API 策略**: Pipeline 测试中是否允许真实 LLM API 调用？（推荐：默认 mock，`E2E_LIVE_API=1` 启用真实调用）
2. **ECC hook chain 深度**: 是否测试完整 ECC 38-agent hook chain，还是仅验证 hooks.js dispatcher 入口？（推荐：仅 dispatcher 入口 + 选择 2-3 个代表性 agent）
3. **Bundled skills**: 测试使用真实 bundled skills（`src/skills/bundled/`）还是临时合成 skills？（推荐：L1 用真实 bundled，L2+ 用合成）
4. **MCP server 真实连接**: 是否需要测试真实 MCP server（如 gbrain/test-mcp）连接？（推荐：L1 用 mock transport，L3+ 可选真实连接）

---

## Verification Strategy

```bash
# Run individual test file
bun test src/__tests__/e2e-stress/component-stress.test.ts --isolate --timeout 120000

# Run pipeline tests
bun test src/__tests__/e2e-stress/pipeline-stress.test.ts --isolate --timeout 300000

# Run all e2e-stress tests
bun test src/__tests__/e2e-stress/ --isolate --timeout 300000

# Run with live API (if opting in)
E2E_LIVE_API=1 bun test src/__tests__/e2e-stress/pipeline-stress.test.ts --isolate --timeout 300000
```

Confirmation checklist:
1. No test timeouts (all finish within configured timeout)
2. L1 blocks: 0 failures
3. No leftover files in system temp dirs
4. No GPU/subprocess orphan on Windows (check Task Manager)
