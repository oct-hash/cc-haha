# 手稿全面审核报告 — manuscript_R7_S4bref_v1.docx

审核日期: 2026-07-15
审核对象: `D:/肾脏虚拟细胞文章设计/manuscript/manuscript_R7_S4bref_v1.docx`（161 段）
交叉核对: `code/R_version/` 全部脚本 + `results/qc/*_R_v1.json` + `交付最终版/supplementary/`
性质: 只读审核，未修改任何手稿；下列为发现清单，待作者确认后再改。

---

## 严重度汇总

| 级别 | 数量 | 结论 |
|------|------|------|
| CRITICAL | 0 | 无数据造假/结论错误 |
| HIGH | 2 | 细胞计数内部矛盾；[49] 分组与 R 未对齐 |
| MEDIUM | 2 | 7 条孤儿参考文献；图注 vs 正文 Hmox1 口径不一 |
| LOW | 3 | 空间统计双值披露、bulk 归一化措辞、时序 n=4 稳健性 |

---

## HIGH-1 · GSE274819 细胞计数内部矛盾（正文 [3][24]）

- 正文 [24]: "Sham: 13,433 cells; early I/R: 38,875 cells pooled from three reperfusion timepoints (4 h, 12 h, 1 day)"
- 正文 [3][24]: "44,459 cells post-QC"
- **矛盾**: 13,433 + 38,875 = **52,308 ≠ 44,459**。两条数字无法同时为 post-QC。
- **R 实测** (`gse274819_keygene_R_v1.json`): post-QC 合计 **44,459**（与总数一致），其中 n_Sham=**10,371**，n_IR12h=12,128 → pooled early I/R post-QC = 44,459−10,371 = **34,088**。
- **判断**: 13,433/38,875 是旧 Python 流水线的 pre-QC 计数，与 post-QC 总数 44,459 混用。README 明确 "QC 保留 44,459 cells 完全一致"。
- **建议**: 改为 post-QC 口径 —— "Sham 10,371 cells; pooled early I/R (4 h/12 h/1 day) 34,088 cells; 44,459 total post-QC"，或明确标注 13,433/38,875 为 pre-QC。

## HIGH-2 · [49] scRNA 验证数值分组与 R 流水线未对齐

- 正文 [49]: "Ogt increased 60% from Sham to early I/R (4 h–1 day; 0.40 to 0.64), Gclc increased 41% (from 1.04 to 1.47)"
- 该句为 **pooled early I/R（3 时点合并）** 的旧 Python 值。
- **R 重算 (04 脚本)** 仅算 **Sham vs IR_12h**: Ogt 0.2506→0.4073 (**+62.5%**), Gclc 0.4686→0.6327 (**+35%**)。
- README §3「14 处外科替换」**不含** [49] 的 Ogt/Gclc pooled 值 → 该句仍停留在 Python，未纳入 R 溯源链。
- 同段相邻的 Hmox1 [45] 与 Figure 2 图注 [50] 已换成 R 的 Sham-vs-12h 值，导致**同一验证叙事里混用两种分组口径**。
- 绝对值也对不上：正文 Sham Ogt=0.40 vs R Sham=0.25；Gclc 1.04 vs 0.47。
- **建议**（二选一）:
  1. 若坚持 pooled early I/R 口径 → 补一个 R 的 pooled JSON（04 脚本已加载全部 4 样本，只需对 IR_4h/12h/1d 合并再算一次），用 R 值替换 [49]。
  2. 若统一为 Sham-vs-12h → 把 [49] 改成 Ogt +62.5% (0.25→0.41)、Gclc +35% (0.47→0.63)，与 [45][50] 一致。

---

## MEDIUM-1 · 7 条参考文献在正文从未被引用（孤儿引用）

参考表 51 条完整、无缺号、无重号，正文 44 个引用标记全部可解析。但以下 7 条列于 References 却正文零引用：

| 编号 | 文献 | 主题 |
|------|------|------|
| 24 | Belavgeni et al. Ferroptosis and necroptosis in the kidney | 肾铁死亡/坏死性凋亡 |
| 27 | Gerhardt et al. Single-nuclear transcriptomics | snRNA 方法 |
| 28 | Wu et al. Advantages of single-nucleus over single-cell | snRNA vs scRNA |
| 29 | Kfoury et al. Single-cell and spatial transcriptomics of kidney IRI | 肾 IRI 时空组学 |
| 33 | Riegman et al. Ferroptosis osmotic mechanism | 铁死亡机制 |
| 34 | Jang & Rabb. Immune cells in experimental AKI | AKI 免疫 |
| 40 | Paller et al. Role of iron in postischemic renal injury | 缺血后铁损伤 |

- **判断**: 均为主题高度相关的文献，应是删改正文时引用标记被移除、参考表未同步。投稿多数期刊会退回"未引用即删"。
- **建议**: 逐条决定 —— 在合适位置补引（如 [24][33] 补入铁死亡背景段 [15-18]，[27][28] 补入 snRNA 方法段 [19]，[29] 补入时空组学讨论，[34] 补入免疫段，[40] 补入铁稳态段），或从参考表删除。

## MEDIUM-2 · Figure 2 图注 Hmox1 口径与正文不一

- 正文 [45]: Hmox1 whole-kidney Sham→12h **+57.6%**（0.283→0.446，R=scanpy 逐位相同，已入 R 溯源）。
- 图注 [50]: "Hmox1 induced **3.1-fold** in injured proximal tubule, Sham to 12h"。
- **判断**: whole-kidney（+57.6%）与 injured-PT（3.1×）是两个口径，本身可并存，但 3.1× 是 cell-type-specific 值，需确认其数据源是否也已 R 复算（当前 R JSON 只有 whole-kidney）。
- **建议**: 图注注明"injured PT subset"以区别 whole-kidney，并确认 3.1× 的来源脚本。

---

## LOW（披露完整，非错误，建议保留现状或轻改）

- **LOW-1 空间统计双值**: [72] 主报 squidpy Spp1~receptor r=+0.403（Sham −0.030），R 给 +0.386/−0.016；Moran's I 主报 squidpy 0.39→0.61，R spdep 0.372→0.587。Methods/README 已披露"置换 z 依赖 RNG，squidpy 为主报值，spdep 点估计交叉核对 14/14 符号一致、最大绝对差 0.026"。**披露规范，无需改**，S4b 引用已在 [36][72] 补齐。
- **LOW-2 bulk 归一化**: GSE98622 源为已归一化 FPKM，无 raw counts，DESeq2/edgeR 不可用，R 仅复现均值。Methods/Limitations 已诚实说明。**保留**。
- **LOW-3 时序 n=4**: GSE139107 时序统计 n=4 脆弱、SCTransform 换 LogNormalize、跳过 DoubletFinder，已在 Limitations [92] 及 provenance 审计说明。**保留**。

---

## 已核对一致（无问题）

| 项 | 正文 | 图注 | R/JSON | 状态 |
|----|------|------|--------|------|
| 共表达边数 4→13→7 | [52] | Fig3 [53] 13 边 | coexpr JSON | ✓ 与摘要 [4] 一致 |
| Moran's I Spp1 0.39→0.61 | [72] | — | squidpy 0.3905/0.6136 | ✓ |
| Visium spots 2855/3392 | 隐含 | — | JSON 2855/3392 | ✓ |
| S4b 交叉核对 14/14, maxΔ0.026 | [36][72] | FigS4b | moran_spdep JSON | ✓ |
| PT GSH 5.1× (0.047→0.240) | [56] | Fig4 [58] | README §3 | ✓ |
| PT Iron 1.8× @12h | [56] | Fig4 [58] | README §3 | ✓ |
| scRNA Hmox1 +57.6% | [45] | — | JSON 0.283→0.446 | ✓（whole-kidney） |
| 时序协调 ρ 0.26–0.84 | [48][78] | Fig2 [50] | phase2 R JSON | ✓ |
| 通路协调 GSH0.39/Iron0.40/Lipid0.18 | [55] | Fig4 [58] | phase3a R JSON | ✓ |
| 细胞总数 44,459 post-QC | [3][24] | — | JSON n_cells_total 44459 | ✓（仅总数；见 HIGH-1） |
| §4.4 标题 Co-Regulation Peak | [86] | — | README §3 结论反转已落地 | ✓ |

---

## 故事线/逻辑评估

- 主线清晰: 发现（GSE139107 三波时序 + 12h 共表达峰）→ 机制（Boolean 网络 Nrf2 为主控）→ 空间/通讯（SPP1 12h 信号）→ 跨器官对比（肾 Fth1/Gclc vs 心 Gpx4）→ 三独立数据集验证。摘要三点结论与正文/结论段一一对应。
- "12h 从崩溃改为协调峰"的结论反转（R 重算）已在标题 [86]、摘要 [4]、正文 [52][86] 全线贯通，无残留旧措辞。
- 唯一逻辑断点即 HIGH-2: 验证段 [49] 的分组口径与相邻 [45][50] 及 R 溯源链不一致，会让审稿人质疑"到底用哪个分组"。修完即闭环。

---

## 优先处理顺序建议

1. **HIGH-1 / HIGH-2**（数据口径，投稿硬伤）—— 先定分组口径，再统一 [24][49] 的计数与数值。
2. **MEDIUM-1**（孤儿引用）—— 补引或删除，避免退稿。
3. **MEDIUM-2**（图注口径）—— 一句话注明 subset。
4. LOW 全部保留现状（披露已规范）。
