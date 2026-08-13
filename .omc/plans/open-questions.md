# Open Questions

---

## E2E Stress Tests - 2026-08-01

- [x] **LLM API 策略**: Pipeline 测试中是否允许真实 LLM API 调用？
  - **决定**: 纯 mock/short-circuit。L1 用 `--help`/`--version`(无 API) + `ANTHROPIC_BASE_URL=http://127.0.0.1:1` 验证错误处理。`E2E_LIVE_API=1` 可启用真实调用但默认不测。
  - 结果: L1 recovery CLI 用无效 endpoint 验证优雅失败，L2-L4 只用 `--help`/`--version`（零 API 成本）

- [x] **ECC hook chain 深度**: 是否测试完整 ECC 38-agent hook chain？
  - **决定**: 未直接测试 ECC hook chain。pipeline 测试验证 hook config 文件能正常加载不阻塞 CLI 启动。component 测试专注于 Skills/MCP/Hooks 引擎的纯函数 API。
  - `test-helpers.ts` 中保留了 `runECCHook()` 辅助函数供未来扩展。

- [x] **Bundled skills**: 测试使用真实还是合成 skills？
  - **决定**: 全部使用临时合成 skills（`writeSimpleSkill()` 创建最小化 SKILL.md）。pipeline 测试验证 skill 目录能被 CLI 识别且不崩溃。
  - 原因: 合成 skills 可控、稳定、不随版本变化。

- [x] **MCP server 真实连接**: 是否需要真实 MCP server 连接？
  - **决定**: 全部使用 mock InProcessTransport + `createMockMCPServer()`。pipeline 测试验证 MCP config JSON 文件能被 CLI 加载不崩溃。
  - 原因: mock 速度快、无网络依赖、CI 友好。

- [x] **Skill forked 调用测试范围**:
  - **决定**: component 测试中验证了 `context: 'fork'` 和 `context: 'inline'` 的解析和命令创建，但未 spawn 实际子进程 forked skill。
  - 原因: 保持测试在 in-process 范围内，避免 Windows 子进程不稳定。

- [x] **子进程超时阈值**:
  - **实际使用**: L1 子进程 30s 基础超时，L2 60-120s，L3 120-180s，L4 180-300s。
  - 结果: 全部 23 个 pipeline 测试在 67s 内完成（总执行 73s），远超预期。

- [x] **mcpRequest 并发支持**:
  - **问题**: 原始实现直接覆盖 `transport.onmessage`，导致并发请求互相干扰。
  - **修复**: 使用 WeakMap 维护每个 transport 的待处理请求映射，单一 onmessage 处理器按 request ID 路由响应。
  - 结果: 50 并发 MCP 调用全部通过。

- [x] **parseArgumentNames 分隔符**: 函数按空白符（`\s+`）分割而非逗号。测试需使用 `'file output'` 而非 `'file,output'`。

- [x] **createSkillCommand 的 context 字段**: `executionContext` 参数映射为命令的 `.context` 字段（不是 `.executionContext`）。
