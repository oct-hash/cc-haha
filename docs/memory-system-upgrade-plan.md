# 记忆系统升级计划 (Memory System Upgrade Plan)

## 总览

```
Layer 3: 按需叠加（阶段三）
│  agentmemory（检索增强）/ engram-mcp（类型化记忆）
├────────────────────────────────────────────────────┤
│  Layer 2: 主力记忆引擎（阶段二）
│  claude-mem-lite MCP
│  ├─ 4 Hook 自动抓取（fire-and-forget, <20ms）
│  ├─ FTS5 + BM25 稀疏向量 混合检索 + CJK N-gram
│  ├─ Episode Batching（LLM 调用减少 7-10x）
│  ├─ Cross-Session Handoff（贪心背包 2K token）
│  └─ 单 SQLite + Bun 运行时，零外部依赖
├────────────────────────────────────────────────────┤
│  Layer 1: 修复后的内置记忆（阶段一）
│  ├─ 4 条记忆全部索引 + 交叉引用
│  ├─ user/feedback 类型补齐
│  └─ Dreaming 验证修复
└────────────────────────────────────────────────────┘
```

---

## 阶段一：修复内置记忆（Layer 1）

### 当前状态诊断

| 问题 | 现状 | 影响 |
|------|------|------|
| 条目少 | 仅 ~10 条 | 覆盖不了日常工作上下文 |
| 类型失衡 | feedback 4条、project 5条，user 类型 0 条 | 缺乏用户角色/偏好建模 |
| 交叉引用缺失 | PaperTree 和 AI-Scientist 应链接但未链接 | 相关知识孤岛 |
| Dreaming 存疑 | 每日 03:00 触发，Windows 大概率休眠未执行 | 记忆整合从未生效 |

### 任务清单

- [ ] **1.1** 补全 user 类型记忆：角色、技术栈偏好、工作习惯
- [ ] **1.2** 补全 feedback 类型记忆：审查现有反馈是否完整（中文回复、不杀bun进程、版本化输出、删除task、步审计）
- [ ] **1.3** 添加交叉引用：在 PaperTree 和 AI-Scientist-setup 之间添加双向链接
- [ ] **1.4** 清理过期 project 记忆（2026世界杯分析等已完成内容）
- [ ] **1.5** 验证 Dreaming：手动触发一次确保能跑通，或调整触发时间为 session 活跃时段
- [ ] **1.6** 给记忆分类打 tag 做可观测性：确认检索命中率基线

### 验收标准

- user 类型至少 1 条
- 所有已有记忆间存在至少一条交叉引用
- Dreaming 功能确认可执行

---

## 阶段二：claude-mem-lite MCP（Layer 2）

### 设计决策（已讨论确定）

#### Episode Batching

```
触发条件（先到先触发）：
  1. 缓冲区累积 5-10 条 related operations → flush
  2. 每次 hook 检查 now - last_flush > 60s → flush（不依赖后台定时器）

进程模型：短命进程
  PostToolUse → 打开 SQLite → 读写 → 退出
  无守护进程，无僵尸进程风险

flush 路径：
  非 flush: <20ms（纯写入缓冲区）
  flush:    ~2-5s（含 Haiku 单轮调用）→ 每 5-10 次操作卡一下
  可优化:   flush 时 fork 子进程做 LLM 调用，主进程立即返回
```

**待解决**：
- [ ] flush 过程中 fork 子进程 vs 同步阻塞的最终选择
- [ ] 时间窗口检测在 hook 事件驱动模型下的实现方案（方案A：每次检查 last_flush_time；方案B：独立 timer 子进程）

#### Cross-Session Handoff

```
SessionEnd (Stop hook) 写入：
  ├─ session_id
  ├─ git_sha_start / git_sha_end  ← 修正：两个 SHA 都存，避免中途 commit 导致 miss
  ├─ request（本次会话的任务）
  ├─ completed_work（完成了什么）
  ├─ next_steps（下一步）
  ├─ key_files（涉及的关键文件）
  ├─ blockers（阻塞项）
  └─ mental_model：固定模板，不超过两句话
       "正在{阶段} {任务名}，当前方案是{X}，关键决策是{Y}，已知坑是{Z}"

SessionStart 注入：
  贪心背包算法 → 2K token budget
  优先级：最近 handoff > 语义搜索结果 > 关键词搜索结果 > 最近 observations
```

#### 检索架构

```
FTS5 BM25（关键词） + BM25 稀疏向量（语义） → RRF 融合 → 上下文重排序

修正项（基于讨论）：
  - TF-IDF 512维 → BM25 稀疏向量 2048-4096 维（同源打分，RRF 更合理）
  - CJK 分词：N-gram（bigram）起步，后期升级 ICU tokenizer
  - Layer 1 内置记忆 与 Layer 2 自动记忆：并存互补，划分职责避免重复
    - Layer 1 → 手工编写的长期事实（user 偏好、reference 资料）
    - Layer 2 → 自动抓取的短期 observations（工具调用、决策、bugfix）

数据池：
  ┌──────────┬─────────────────────────────┬──────────────────────────────┐
  │   维度   │        Layer 1 内置          │     Layer 2 claude-mem-lite   │
  ├──────────┼─────────────────────────────┼──────────────────────────────┤
  │ 数据源   │ memory/*.md（手工记忆）       │ SQLite（自动抓取）            │
  │ 检索算法 │ 黑盒 hybrid+MMR+时间衰减      │ 白盒 BM25 双路 + RRF          │
  │ 触发方式 │ 系统自动                     │ SessionStart hook + stderr    │
  │ 覆盖范围 │ 长期事实                     │ 工具调用、决策、bugfix        │
  └──────────┴─────────────────────────────┴──────────────────────────────┘
```

#### Hook 触发点

```
SessionStart:
  [同步] 创建新 session 记录
  [同步] 贪心背包 → 2K token additionalContext → stderr → 注入模型
  [同步] 进程退出 (< 1s)

UserPromptSubmit:
  [同步] 记录用户 prompt（意图追踪）
  [同步] 自动检索（仅供参考，无注入能力）
  [同步] 进程退出 (< 100ms)
  ⚠️ 此 hook 不支持 additionalContext，考虑换方案：
     A) 只依赖 SessionStart 一次性注入
     B) 写入缓存文件 → PostToolUse 检测
     C) 注册为 MCP tool（recall），模型主动调用

PostToolUse（高频）:
  [同步] Tier 1 代码过滤（跳过 TodoWrite/AskUserQuestion 等）
  [同步] observation 入队 → 检查 flush 条件 → 可能触发 Haiku 调用
  [同步] 进程退出 (< 20ms 或 2-5s)
  
  Tier 1 过滤规则：
    - 跳过: TodoWrite, AskUserQuestion, Skill, TaskCreate, TaskUpdate
    - 保留: Read, Write, Edit, Bash, Grep, Glob, Agent

Stop / SessionEnd:
  [同步] 强制 flush 剩余 observation
  [同步] Haiku 生成会话摘要
  [同步] 写入 handoff 记录
  [同步] 标记 session 完成
  [同步] 进程退出 (< 5s)
```

### 崩溃安全性

```
防护层：
  1. 原子写入: write-to-tmp + rename，不产生半截文件
  2. 原子事务: observations / observation_files / observation_vectors
     三表在同一 db.transaction() 中操作
  3. LLM 失败降级: flush 时 LLM 挂了 → 降级元数据直接存储，不丢原始数据
  4. WAL 恢复: 启动时自动检测并清理损坏的 WAL/SHM 文件
  5. PID 锁: >30s 或死 PID 自动清理
  6. 短命进程: 无守护进程，进程级隔离

丢失容忍度：未 flush 的最后一批（最多 5-10 条 observation，几秒的
数据）可能丢失。已 flush 数据受原子事务保护，绝不丢失。
```

### 任务清单

- [ ] **2.1** SQLite schema：observations, sessions, files, vectors 四表 + FTS5 虚拟表
- [ ] **2.2** PostToolUse hook：Tier 1 过滤 + observation 入队 + flush 检测
- [ ] **2.3** Episode Batching 核心：相关性分组 + Haiku 单轮调用 + 原子写入
- [ ] **2.4** FTS5 N-gram CJK 分词 + BM25 稀疏向量检索
- [ ] **2.5** RRF 融合 + 上下文重排序
- [ ] **2.6** SessionStart hook：贪心背包 + additionalContext 注入
- [ ] **2.7** Stop/SessionEnd hook：强制 flush + 摘要生成 + handoff 写入
- [ ] **2.8** UserPromptSubmit hook：意图追踪（+ 后续升级 MCP tool 主动召回）
- [ ] **2.9** 崩溃恢复：WAL 清理 + PID 锁 + 降级路径
- [ ] **2.10** `mcp.json` 注册 + Hook 注册到 `settings.json`

### 文件结构

```
~/.claude/claude-mem-lite/
├── mcp-server.ts          # MCP server 入口（stdio transport）
├── schema.sql             # SQLite schema
├── hooks/
│   ├── session-start.ts   # SessionStart hook
│   ├── post-tool-use.ts   # PostToolUse hook（fire-and-forget）
│   ├── session-end.ts     # Stop hook（强制 flush + handoff）
│   └── user-prompt.ts     # UserPromptSubmit hook（意图追踪）
├── core/
│   ├── buffer.ts          # 内存缓冲区 + flush 逻辑
│   ├── episode.ts         # Episode 分组 + LLM 调用
│   ├── retrieval.ts       # FTS5 + BM25 向量 + RRF
│   ├── handoff.ts         # Session handoff 读写
│   └── knapsack.ts        # 贪心背包算法
├── utils/
│   ├── filter.ts          # Tier 1 代码过滤规则
│   ├── cjk-tokenizer.ts   # N-gram CJK 分词
│   ├── atomic.ts          # 原子写入工具
│   └── lock.ts            # PID 锁
└── claude-mem-lite.sqlite # 运行时数据库
```

### 技术栈

- **Runtime**: Bun（与 claude-code-haha 一致）
- **数据库**: `bun:sqlite`（零外部依赖）
- **LLM**: Haiku（通过 DeepSeek API 端点）
- **协议**: MCP stdio transport
- **Hook 模型**: Claude Code PreToolUse / PostToolUse / Stop / UserPromptSubmit

---

## 阶段三：按需叠加（Layer 3）

### 触发条件

以下情况才激活 Layer 3：
- Layer 2 检索精度不够（recall@10 < 80%）
- 需要类型化记忆（情节/语义/程序分离）
- 需要更强的向量语义搜索

### 候选方案

| 方案 | 适用场景 | 引入时机 |
|------|---------|---------|
| **agentmemory** | 向量语义搜索增强 | Layer 2 FTS5+BM25 检索精度不足时 |
| **engram-mcp** | 类型化记忆（ENGRAM 论文实现） | 需要情节/语义/程序记忆分离时 |

---

## 风险评估

| 风险 | 等级 | 缓解 |
|------|------|------|
| FTS5 CJK 分词不准 | 中 | N-gram 起步，后期升级 ICU |
| PostToolUse hook 抖动 | 低 | 非 flush 路径 <20ms，flush 可 fork 异步 |
| UserPromptSubmit 无法注入 | 中 | 备选 MCP tool 召回方案 |
| 每 5-10 次操作卡 2-5s | 低 | fork 子进程异步 flush |
| Hook 进程堆积 | 低 | 短命进程模型 + PID 锁 |
