# REPL.tsx 模块化拆分 Loop

## 目标

将 REPL.tsx (4491行) 和 REPL.handlers.ts (1842行) 拆到每个文件 < 800 行。

## 循环模式

- **Pattern**: sequential
- **Mode**: safe
- **停止条件**: REPL.tsx < 800 && REPL.handlers.ts < 800 && tsc clean && tests green

## 当前基线

| 文件 | 行数 | 目标 |
|------|------|------|
| REPL.tsx | 3817 | < 800 |
| REPL.handlers.ts | 1842 → barrel | < 800 |
| REPL.hooks.foundation.tsx | 401 | - |
| REPL.hooks.stream.tsx | 486 | - |
| REPL.hooks.scroll.tsx | 379 | - |
| REPL.hooks.ui.tsx | 152 | - |
| REPL.components.tsx | 269 | - |
| REPL.render.tsx | 存在 | - |
| REPL.utils.ts | 29 | - |
| REPL.types.ts | 60 | - |

## 进度

- R1 ✅ `2871f93` — REPL.handlers.ts 拆为 5 个 domain 模块，主体变 barrel re-export
- R2 S1 ✅ `e323161` — foundation 状态块 → `useREPLFoundation` (REPL.tsx 4491 → 4343)
- R2 S2 ✅ `0bc68f4` — stream/query 状态块 → `useREPLStreamState` (REPL.tsx 4343 → 4044)
  - tsc 5127 与 foundation 后基线一致（无净新增），tests 72/1/1 与基线一致
- R2 S3 ✅ `28bde4b` — scroll/input/remote 状态块 → `useREPLScrollInput` (REPL.tsx 4044 → 3846)
  - tsc 5127 与基线一致，tests 72/1/1 与基线一致
- R2 S4 ✅ `d0d02df` — streaming/dialog UI 状态块 → `useREPLUiState` (REPL.tsx 3846 → 3817)
  - tsc 5127 与基线一致，tests 72/1/1 与基线一致
- R2 S5 ⏳ — messages hub（当前 698-751 附近）→ `useREPLMessages`

## 门禁（每轮迭代）

```
bun tsc --noEmit 2>&1 | tail -3   # 0 errors
bun test src/screens/__tests__/ 2>&1 | tail -5  # all pass
```

失败 → 回退该轮提取 → 分析原因 → 重试（不同策略）

## 提取顺序

1. REPL.handlers.ts — 先拆（更独立，handler 函数边界清晰）
2. REPL.tsx — 后拆（依赖更复杂）

## 提取策略

- 按功能域分组：command handlers / message handlers / tool handlers / rendering helpers / state hooks
- 新建文件命名：`REPL.<domain>.ts` 或 `REPL.<domain>.tsx`
- 每次提取 200-500 行
- 保持所有 import 路径正确
- 确保从 REPL.tsx 或 REPL.handlers.ts 的 re-export 正确

## 预计轮数

- REPL.handlers.ts: 1842 → 2-3 轮（每轮 ~400-600 行提取）
- REPL.tsx: 4491 → 5-7 轮（每轮 ~500-600 行提取）
- 总计: 7-10 轮

## 应急

- 保留 git stash 快速回退
- 每轮 submit 一个 commit（便于 revert）
- 如果某轮失败 2 次，暂停 loop 让人工介入
