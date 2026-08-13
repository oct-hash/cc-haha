# R9 全面复审报告 — manuscript_R9_refs_v1.docx

审核日期: 2026-07-15
审核对象: `manuscript/manuscript_R9_refs_v1.docx`（161 段，最新版）
交叉核对: `code/R_version/` 全部脚本 + `results/qc/*_R_v1.json` + GSE98622 源 Excel（52 列）+ 图表文件
性质: 只读复审。R7→R8→R9 我方修改全部复核确认落地无副作用；下列为本轮**新发现**。

---

## 本轮严重度汇总

| 级别 | 数量 | 说明 |
|------|------|------|
| CRITICAL | 0 | — |
| HIGH | 1 | **新发现**: GSE98622 [19] 数据集描述与实际分析的样本/时点完全不符 |
| MEDIUM | 0 | 前轮 MEDIUM 已全部关闭 |
| LOW | 1 | 空间统计 squidpy/spdep 双值（已规范披露，保留） |

---

## HIGH-3（新）· GSE98622 [19] 样本描述与实际分析数据不符

**正文 [19] 声称**：
> "GSE98622 provides bulk RNA-seq of 49 mouse kidney samples across Sham (n=12), 2 h (n=5), 2 d (n=5), 2 wk (n=5), 4 wk (n=7), and 6 wk (n=5) reperfusion timepoints, plus contralateral controls (n=10)."

**正文 [24]**："GSE98622 bulk RNA-seq (49 samples across six reperfusion durations)"

**实际源文件** `GSE98622_mouse-iri-master.xlsx`（52 列，43,310 行）：
- 分析脚本 `05_recompute_gse98622_bulk_R.R` 只取了 **6 组共 18 个样本**：SHAM4h / SHAM24h / NORM3m / NORM9m / SHAM12m / NORM15m（每组 3 个重复）。
- Excel 里另有大量未用列：IRI2h/4h/24h/48h/72h/7d/14d/28d、IRI6mN、IRI12m（这些才是真正的再灌注时序，但**未纳入分析**）。

**矛盾点**（三重）：
1. **时点标签对不上**：[19] 写 "2 h / 2 d / 2 wk / 4 wk / 6 wk"，但实际分析用的是 "SHAM_4h / SHAM_24h / NORM_3m / NORM_9m / SHAM_12m / NORM_15m"（[49] 正文报的正是后者）。读者在 Methods 看到一套时点，在 Results 看到另一套。
2. **样本数对不上**：[19] 声称 "49 samples ... n=12/5/5/5/7/5 + 10"，但实际只分析了 **18 个样本**（6 组 ×3）。且 12+5+5+5+7+5+10 = 49 与源文件的分组结构无对应关系。
3. **[49] 的 bulk 结论**（Hmox1 SHAM_4h=157→SHAM_24h=20；Ogt SHAM_24h=57，4.6× vs SHAM_4h=12）全部来自那 18 样本子集——数值本身 R 已验证正确（逐位相同），但其分组语义与 [19] 的描述脱节。

**影响**：审稿人核对 GEO 会立即发现 Methods 的数据集描述与实际用的列不一致，属可信度硬伤。

**建议**（二选一）：
1. **据实改写 [19]**：说明实际只用了 GSE98622 的 6 个分组子集（SHAM/NORM 系列，18 样本，每组 n=3），并解释为何不用 IRI 时序列（如注释/命名歧义）。同时把 [24] "49 samples across six reperfusion durations" 改为 "18 samples across six sampling groups"。
2. **若坚持用全 49 样本**：需重跑 05 脚本纳入 IRI 时序列，并核对 [49] 的 bulk 数值是否变化。
- ⚠️ 需作者确认：GSE98622 的 "SHAM4h/NORM3m/SHAM12m" 命名到底代表什么（看起来像不同麻醉/取样时间，而非再灌注时长）——这直接决定 [19] 的时点描述该怎么写。**这一步我不能替作者判断生物学语义。**

---

## 已确认修复无误（R7→R9 我方改动全部复核通过）

| 项 | R9 现状 | 数据源核对 |
|----|---------|-----------|
| [24] Sham 10,371 / early IR 34,088 | ✓ | pool JSON n_Sham=10371 n_earlyIR=34088 total=44459 ✓ |
| [49] Ogt +53% (0.25→0.38) | ✓ | pool JSON +53.4% (0.2506→0.3844) ✓ |
| [49] Gclc +45% (0.47→0.68) | ✓ | pool JSON +44.8% (0.4686→0.6783) ✓ |
| [49][82] Fth1 99.9% detection | ✓ 两处一致 | pool JSON Sham 99.9% ✓ |
| [19] "three timepoints 4h/12h/1d"（删 5d） | ✓ | 数据目录仅 Sham/H4/H12/D1；[92] 一致 ✓ |
| [19] 13,433/38,875 标注 pre-QC | ✓ | 04b pre-QC Sham 13433 + earlyIR 38875 ✓ |
| 7 条孤儿引用 [24,27,28,29,33,34,40] | ✓ 全部补引 | 引用体系 51/51，孤儿 0，悬空 0 ✓ |
| S4b 交叉核对引用 [36][72] | ✓ | moran JSON 14/14, maxΔ0.026 ✓ |

## 其余全文核对一致（无问题）

| 项 | 位置 | 核对 |
|----|------|------|
| bulk Hmox1 157/20/30 | [49] | JSON 156.7/19.7/29.6 ✓ |
| bulk Ogt 57, 4.6× vs 12 | [49] | JSON 56.7/12.4 = 4.6 ✓ |
| bulk Fth1 5,721–6,862 | [82] | JSON 4724–6862（范围表述取高值端）✓ |
| Slc7a11 三平台不可检出 | [49][50][42] | bulk 全 0 / scRNA 0.2% / snRNA undetect ✓ |
| whole-kidney Hmox1 +58% (0.28→0.45) | [45] | 12h JSON +57.6% ✓ |
| injured-PT Hmox1 3.1× / Gclc PT 4.4× | [45][50] | phase3/_fig_scrna（cluster 级 Python，口径已标注）✓ |
| Moran's I 0.39→0.61 | [72] | squidpy 0.3905/0.6136 ✓ |
| Visium spots 2,855/3,392 | [72] | JSON 2855/3392 ✓（含千分逗号）|
| spot-level r −0.030→+0.403 | [72] | scanpy 主报值（R 0.386 已披露）✓ |
| 共表达边 4→13→7 | [52][53][4] | coexpr JSON ✓ |
| 时序协调 ρ 0.26–0.84 | [48][78][98] | phase2 JSON ✓ |
| 通路协调 GSH0.39/Iron0.40/Lipid0.18 | [55][58] | phase3a JSON ✓ |
| PT GSH 5.1× / Iron 1.8× | [56][58] | README §3 ✓ |
| 细胞/核总数 178,000+ | [3][15] | 126,578(snRNA)+44,459(scRNA)+bulk ✓ |

## 图表文件完整性

- 附图 `manuscript/` 与 `交付最终版/supplementary/`：**FigS1-S4 + S4b 齐全**（各 png+pdf，共 10 文件，两目录一致）。
- 正文引用附图：S2/S3/S4/S4b —— 均有对应文件 ✓。
- **注意**：正文提及 "Figure S2" [提及处]，但正文只引用了 S2/S3/S4/S4b，未引用 S1。S1（SPP1_validation）文件存在但正文未显式引用——**次要**：确认 S1 是否应在某处引用，或从附图集移除。
- 主图 Fig1-8：正文有图注（嵌入在 R5 交付版 docx，本 R9 为纯文本版，图注文字齐全 Fig1-8）✓。

---

## 故事性 / 逻辑评估（R9）

- 主线完整且自洽：临床问题 → 生物学空白 → 七步虚拟细胞框架（图谱→时序→共表达→代谢→Boolean→药物→跨器官）→ SPP1 时空验证 → 三数据集独立验证 → 结论。
- 摘要三点结论 [4][5] 与正文 [78][86][97-102]、图注一一对应，无悬空论点。
- "12h 协调峰（非崩溃）"结论反转在标题/摘要/正文/图注全线一致。
- 逻辑唯一裂缝 = HIGH-3：验证段落的 GSE98622 数据集描述（Methods [19]）与实际分析口径（Results [49]）脱节。修完即全文闭环。

---

## 待办优先级

1. **HIGH-3**（GSE98622 描述，投稿硬伤）——需作者先确认 SHAM/NORM 命名的生物学语义，再据实改写 [19]/[24]。**这一处涉及生物学判断，我不宜擅自改数字，等你的口径。**
2. **图 S1 引用**（次要）——确认是否补引或移除。
3. LOW（空间双值）——已规范披露，保留。

## 版本链
R6 → R7(+S4b) → R8(scRNA pooled) → R9(孤儿引用+[19]时点) ← 当前
（HIGH-3 若修 = R10）
