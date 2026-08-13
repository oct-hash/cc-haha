# Plan: Four Critical Fixes for the Three-Agent Debate System

**Created:** 2026-08-05
**Status:** Awaiting user confirmation
**Scope:** 4 fixes across ~7 source files + test updates, estimated 300-400 lines of net code change

---

## Context

The three-agent debate system at `src/services/agents/` has 31 debate-specific tests + ~149 other agent tests (180 total passing). The system supports 4 modes (council, debate, relay, auto) with 3 agent kinds (claude-haha, claude-code, codex). Four critical flaws exist per 2026 research.

**Key files and their current state:**

| File | Lines | Role |
|------|-------|------|
| `types.ts` | 79 | Core types (AgentConfig lacks model field) |
| `autoDebateEntry.ts` | 151 | Bridge: query layer to debate system |
| `debate.ts` | 815 | Orchestrator: 4 modes, extractConfidence, judge |
| `claude-haha.ts` | 201 | Wraps query() via QueryExecutor closure |
| `claude-code.ts` | 229 | Spawns claude CLI (no --model flag) |
| `codex.ts` | 226 | Spawns codex CLI (no model flag) |
| `query.ts:239-260` | — | Auto-debate routing gate (bakes in caller's model) |
| `__tests__/debate.test.ts` | 880 | 31 debate tests |

---

## Work Objectives

1. **P2 - Input Sanitization:** Block prompt injection of CONFIDENCE/FINAL ANSWER markers
2. **P0.1 - Model Heterogeneity:** Let each agent use a different model
3. **P0.2 - Anti-Conformity:** Add dissent/independence mechanisms to prompts and roles
4. **P1 - Faithfulness Collapse:** Replace regex confidence extraction with anchored structured parsing

---

## Guardrails

### Must Have

- All 180 existing tests continue to pass (some expectations will be updated, not tests removed)
- Each fix is independently testable and committable
- The `QueryExecutor` closure pattern in claude-haha.ts must be preserved (avoids circular imports)
- Immutable data patterns (spread, new objects, no in-place mutation)
- Backward compatible: structured confidence parse falls back to 0.5 with warning, not throw

### Must NOT Have

- No breaking changes to the `AgentAdapter` interface (external consumers)
- No changes to `DebateMode` enum or `DebateEvent` types (TUI/consumer contracts)
- No architecture redesign or new dependencies
- No changes to `query.ts:queryLoop()` or any non-debate code paths
- No removal of existing tests — only update expectations when behavior intentionally changes

---

## Task Flow

### Phase 1: P2 — Input Sanitization (smallest, unblocks everything)

**Files touched:** `debate.ts`, `autoDebateEntry.ts`

**Step 1a:** Add `sanitizeDebateInput()` to `debate.ts`
- New exported function ~30 lines
- Trims input to 4000 chars max
- Strips lines containing `CONFIDENCE:` or `FINAL ANSWER:` or `FINAL VERDICT:` or `WINNER:` markers (case-insensitive)
- Escapes any remaining `CONFIDENCE:` substring that appears mid-text by replacing with `CONFIDENCE_STRIPPED`
- Returns sanitized string

**Step 1b:** Call sanitizer in `autoDebateEntry.ts:runAutoDebate()` line 106
- Before passing `userMessage` to `orchestrator.run()`, sanitize it
- Add: `const sanitizedTopic = sanitizeDebateInput(userMessage)`
- Pass `sanitizedTopic` to `orchestrator.run()`

**Step 1c:** Call sanitizer in `DebateOrchestrator.run()` as defense-in-depth
- In `run()` method, line 341, sanitize the `topic` parameter before it's stored or used
- This catches direct `DebateOrchestrator` usage that bypasses `runAutoDebate`

**Test impact:**
- Add 3-4 new test cases in `debate.test.ts`:
  1. `'CONFIDENCE: 1.0'` injected in user topic is stripped
  2. `'FINAL ANSWER: X'` injected markers are stripped
  3. Long topic (>4000 chars) is truncated
  4. Normal topic passes through unchanged
- No existing tests need modification since user topics in tests are clean

**Verification:**
```bash
bun test src/services/agents/__tests__/debate.test.ts
# All 31 existing + 3-4 new tests pass
```

---

### Phase 2: P0.1 — Model Heterogeneity (infrastructure, enables P0.2 testing)

**Files touched:** `types.ts`, `claude-haha.ts`, `claude-code.ts`, `codex.ts`, `autoDebateEntry.ts`, `query.ts`

**Step 2a:** Add `model?: string` to `AgentConfig` in `types.ts`
- `AgentConfig` interface (line 26): add `model?: string` field
- This field is optional and backward-compatible — all existing code treats undefined model as "use default"

**Step 2b:** Extend `QueryExecutor` type in `claude-haha.ts` to accept model parameter
- Current signature (line 31-34):
  ```typescript
  export type QueryExecutor = (
    userMessage: string,
    abortController: AbortController,
  ) => AsyncGenerator<RawEvent, void, unknown>
  ```
- New signature: add optional third param:
  ```typescript
  export type QueryExecutor = (
    userMessage: string,
    abortController: AbortController,
    modelOverride?: string,
  ) => AsyncGenerator<RawEvent, void, unknown>
  ```
- This is backward-compatible (optional param)

**Step 2c:** Update `claude-haha.ts` adapter to pass model from config to QueryExecutor
- In `chatStream()` (line 64-96), extract model from config, pass to `queryExecutor()`
- Read `config?.model` at adapter creation time, store in closure
- On `queryExecutor(userMessage, abortController, model)`, pass the model parameter

**Step 2d:** Update `claude-code.ts` to emit `--model` flag in buildArgs
- In `buildArgs()` (line 26-47), add: if `config?.model`, append `['--model', config.model]`
- Place before `extraArgs` so user can override via extraArgs

**Step 2e:** Update `codex.ts` to emit model flag in buildArgs
- In `buildArgs()` (line 22-34), same pattern: if `config?.model`, append model flag
- Check codex CLI flag name (use `--model` by convention, same as claude)

**Step 2f:** Extend `QueryFn` type in `autoDebateEntry.ts` to accept optional model
- Current signature (line 28-31):
  ```typescript
  export type QueryFn = (
    prompt: string,
    abortController: AbortController,
  ) => AsyncGenerator<{ type: string; text?: string; [k: string]: unknown }, void, unknown>
  ```
- Add optional third param `modelOverride?: string`
- Update `queryExecutor` wrapper in `runAutoDebate()` (line 64-69) to forward model

**Step 2g:** Update `query.ts` gate (line 242-252) to forward model override
- The `queryFn` closure creates innerParams — add a `model` field usage
- Accept model in the queryFn's third parameter
- Store the model in `innerParams` for the inner `query()` call to use
- This requires adding `model?: string` to `QueryParams` type (line 193)

**Step 2h:** Assign different models per agent kind in `autoDebateEntry.ts`
- Define a model mapping:
  ```typescript
  const DEBATE_MODELS: Partial<Record<AgentKind, string>> = {
    'claude-haha': process.env.DEBATE_MODEL_HAHA ?? undefined,  // undefined = use default
    'claude-code': process.env.DEBATE_MODEL_CLAUDE ?? 'sonnet',
    codex: process.env.DEBATE_MODEL_CODEX ?? 'gpt-4o',
  }
  ```
- Pass `model: DEBATE_MODELS[kind]` when creating each adapter (lines 75-91)
- When falling back to claude-haha for CLI agents (line 87-90), also pass the fallback model
- The queryExecutor (used by claude-haha) gets model from config

**Test impact:**
- No existing tests break because `model` is optional and `undefined` = "use default"
- Add 3-4 new test cases:
  1. Adapter created with model config passes it to buildArgs (claude-code)
  2. Adapter created without model config omits --model flag (backward compat)
  3. claude-haha adapter forwards model to QueryExecutor
  4. autoDebateEntry assigns different models to different agent kinds

**Verification:**
```bash
bun test src/services/agents/__tests__/debate.test.ts
# All existing tests pass (model=undefined behaves as default)
bun test src/services/agents/__tests__/
# All 180 tests pass
```

---

### Phase 3: P0.2 — Anti-Conformity Mechanism (prompt/role changes)

**Files touched:** `debate.ts`

**Step 3a:** Add `devilsAdvocate` position to council and auto probe rounds
- In ROLES constant (line 111-132), update labels:
  - Council: `'Analyst A'`, `'Analyst B'` (with dissenting instructions), `'Analyst C'`
  - Auto probe: One label becomes `'Devil\'s Advocate'`
- Add a new `devilsAdvocate` prompt instruction block in `buildSystemPrompt()`:
  ```
  You are the Devil\'s Advocate. Your job is to find the strongest counter-argument
  to the consensus position. If everyone agrees, you MUST disagree on principle
  — find a genuine weakness or alternative interpretation. Do not concede easily.
  ```

**Step 3b:** Add independence prompt instructions to all agent prompts
- In `buildSystemPrompt()` (line 256), add to `base`:
  ```
  IMPORTANT: You are an independent thinker. Do NOT simply agree with other agents.
  If you disagree, state your disagreement explicitly and explain why. Your
  value comes from diverse perspectives, not from consensus. Rank your arguments
  by quality, not by agreement with others.
  ```

**Step 3c:** Shuffle agent order per round
- In `runCouncil()`, `runDebate()`, and `runAuto()` methods:
  - At the start of each round, shuffle the order of `positions` using Fisher-Yates
  - Use a seeded random based on round number for reproducibility
  - Track the original position labels so event consumers still see the right labels

**Step 3d:** Add minority-opinion tracking in `judge()` method
- In `judge()` (line 770), before selecting winner:
  - Identify agents whose position differs most from the group (by Jaccard distance)
  - If a minority opinion agent has well-argued reasoning (confidence > 0.6, response > 100 chars), flag it in the verdict text:
    ```
    [MINORITY OPINION: <agent-kind> presents a dissenting but well-argued view — consider this before accepting the majority.]
    ```
  - This does NOT change winner selection (that's P1 territory) — just surfaces the minority view

**Step 3e:** Update convergence criteria to not trigger on uniform agreement alone
- In `runDebate()` line 544 and `runAuto()` line 764, the early-convergence check:
  ```typescript
  if (roundStatements.every((s) => s.confidence >= 0.8)) break
  ```
- Add secondary condition: also check that responses are NOT identical (compute pairwise Jaccard)
- If all agents are highly confident AND highly similar (>0.9 Jaccard on pairs) → likely groupthink, continue one more round
- New logic:
  ```typescript
  const allHighConfidence = roundStatements.every((s) => s.confidence >= 0.8)
  const tooSimilar = computeAgreement(roundStatements.map(s => s.content)) > 0.9
  if (allHighConfidence && !tooSimilar) break
  ```

**Test impact:**
- Update existing tests that assert exact agent labels (search for `'Analyst A'`, `'Probe A'` in test file)
  - `councilResponse('Analyst A', ...)` — these are mock factories, labels come from ROLES, check if tests hardcode labels
  - Tests in the file use response factories, not direct label assertions, so minimal impact
- Add 3-4 new test cases:
  1. Devil's Advocate role is included in council mode agent list
  2. Agent order changes between rounds (test with fixed seed)
  3. Minority opinion is flagged in verdict when present
  4. Groupthink (high confidence + high similarity) prevents early convergence

**Verification:**
```bash
bun test src/services/agents/__tests__/debate.test.ts
# ~33 existing + ~4 new tests pass
```

---

### Phase 4: P1 — Faithfulness Collapse (replace extractConfidence)

**Files touched:** `debate.ts`, `debate.test.ts`

**Step 4a:** Replace `extractConfidence()` with anchored structured parser
- Remove current `extractConfidence()` implementation (lines 167-190, 24 lines)
- Add new `extractConfidence()` (~45 lines):
  ```typescript
  function extractConfidence(text: string): number {
    // Only match CONFIDENCE: in the trailing portion of the response (last 500 chars)
    const tail = text.slice(-500)
    // Anchored: must appear as its own line, near the end, with numeric value
    const anchored = tail.match(/^CONFIDENCE:\s*(0\.\d+|1\.0|1|0)(?:\s*$|\s*\n)/im)
    if (anchored) {
      const n = parseFloat(anchored[1])
      if (!isNaN(n)) return Math.max(0, Math.min(1, n))
    }
    // Log warning that structured parse failed
    console.warn('[Debate] No structured CONFIDENCE found in tail, defaulting to 0.5')
    return 0.5
  }
  ```
- Remove the 4 unanchored regex patterns, the word-based mapping (high/medium/low), and the percentage parsing
- Keep only: anchored match of `CONFIDENCE: <0.0-1.0>` in the last 500 chars

**Step 4b:** Add `reasoningQuality` heuristic as secondary signal
- New function `computeReasoningQuality(text: string): number` (~25 lines):
  - Response length diversity: normalize text length against expected range (100-3000 chars), map to 0-1
  - Internal consistency: check for presence of both claims AND evidence (look for patterns like "because", "therefore", "evidence", numbered lists)
  - Returns a score 0-1 that reflects structural quality, NOT argument correctness
- This is stored as a SEPARATE field — it does NOT replace confidence but can be exposed in events/debugging
- Add optional `reasoningQuality?: number` to `AgentStatement` type (line 50-55)

**Step 4c:** Update `judge()` to use fallback on structured parse failure
- In `judge()` (line 770), when doing majority vote:
  - If all agents have confidence 0.5 (default/fallback), add to verdict: `[WARNING: All agents returned default confidence — no structured CONFIDENCE markers found. Winner selected arbitrarily.]`
- In `buildJudgePrompt()` (line 295), add instruction:
  ```
  5. CONFIDENCE scores of exactly 0.5 may indicate the agent failed to provide a structured confidence rating — treat these as uncertain.
  ```

**Step 4d:** Update `determineWinner()` to not purely rely on confidence
- Current implementation (line 793) picks max confidence
- New implementation: if only one agent has non-default confidence (>0.5), that agent wins. If all/default, pick the agent with longest response (proxy for thoroughness). If tied, pick first.

**Test impact — this phase has the most test changes:**

Tests that need EXPECTATION UPDATES (behavior changed, tests preserved):
1. Line 181: Council winner assertion — `codex (confidence 0.91)` — still wins with structured format since factories emit `CONFIDENCE: X` in the tail. No change needed.
2. Line 480-483: Confidence extraction test — the `'I am 92% confident'` pattern will NO longer parse (not in tail `CONFIDENCE:` format). This test MUST be updated:
   - Change the third mock to use format: `'Analysis.\n\nCONFIDENCE: 0.92\nFINAL ANSWER: Done.'`
   - Assert it extracts 0.92
3. Line 489-507: "Defaults to 0.5 when no confidence found" — this test's behavior is CORRECT (no change needed), but add assertion that warning was logged

Tests that need NEW test cases:
1. "ignores CONFIDENCE: in middle of text (only matches tail)" — inject `CONFIDENCE: 0.99` in the middle, real `CONFIDENCE: 0.3` at end → should return 0.3
2. "reasoningQuality is computed for each agent statement" — verify quality > 0 for well-formed responses
3. "winner uses longest response when all confidences are default 0.5" — all agents at 0.5, longest response wins

**Verification:**
```bash
bun test src/services/agents/__tests__/debate.test.ts
# Updated tests pass, new tests pass
bun test src/services/agents/__tests__/
# All 180+ tests pass
```

---

## Success Criteria

1. `sanitizeDebateInput()` blocks all 4 known injection vectors (CONFIDENCE, FINAL ANSWER, FINAL VERDICT, WINNER)
2. Each agent in a debate can use a different model, configured via `DEBATE_MODEL_*` env vars or `AgentConfig.model`
3. Anti-conformity prompts increase response divergence (measured by reduced pairwise Jaccard in council mode by >0.05)
4. `extractConfidence()` no longer parses mid-text or percentage formats — only anchored `CONFIDENCE:` in tail 500 chars
5. All ~180 existing tests still pass (with intentional expectation updates documented above)
6. Each of the 4 fixes can be merged independently

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CLI agents (claude-code/codex) don't support `--model` flag | Low | Medium — model heterogeneity can't work for CLI agents | The `--model` flag is standard; verify with `claude --help` before implementing. If unsupported, fall back to environment variables |
| Structured confidence format breaks existing prompt templates | Low | Low — only affects test mocks | Test mocks already use the `CONFIDENCE: X` format in the tail; only 1 test (92% confident) needs updating |
| Anti-conformity prompts make agents too argumentative, degrading output quality | Medium | Medium — output quality is subjective | The prompts are additive (new instructions) and can be tuned via `extraArgs` per agent. Measure output quality in integration tests |
| Adding `model` to `QueryParams` touches the hot path | Low | High — all queries go through QueryParams | `model` is optional (undefined = no change). The only modified path is the auto-debate gate, which already branches early. Non-debate queries are completely unaffected |
| 180 test suite has flakes that complicate verification | Low | Medium — need stable baseline | Run test suite 3x before starting to establish baseline pass rate. Recent commits (4565525, 33a654d, 98d38c7) already fixed flaky tests |

---

## Dependency Graph

```
Phase 1 (P2: Sanitization)
  |
  v
Phase 2 (P0.1: Model Heterogeneity)
  |
  v
Phase 3 (P0.2: Anti-Conformity) ── depends on P0.1 for model diversity
  |
  v
Phase 4 (P1: Faithfulness) ── depends on sanitization (P2) to block injection
```

Phases 1 and 2 are independent of each other and could be parallelized. Phases 3 and 4 are sequential after their dependencies.

---

## Open Questions

None — all technical decisions are specified above. Execution only requires:
1. Verifying `claude --model` and `codex --model` CLI flag syntax (trivial — test with `--help`)
2. Choosing default model names in the `DEBATE_MODELS` mapping (current defaults: sonnet for claude-code, gpt-4o for codex, undefined/default for claude-haha)
