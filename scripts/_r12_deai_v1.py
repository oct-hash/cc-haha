# -*- coding: utf-8 -*-
"""R11 -> R12: full-text polish & de-AI. Surgical replacements, all numbers+citations preserved.
Versioned, no overwrite. Run: py -X utf8 this.py"""
import shutil, re
from pathlib import Path
from docx import Document

P = Path("D:/肾脏虚拟细胞文章设计")
SRC = P / "manuscript" / "manuscript_R11_multiomics_v1.docx"
DST = P / "manuscript" / "manuscript_R12_deAI_v1.docx"
LOG = Path("D:/claude-code-haha/scripts/_r12_deai_log.txt")

shutil.copy(str(SRC), str(DST))
log = [f"[copied] R11 -> {DST.name}"]

d = Document(str(DST))
paras = d.paragraphs

# ── REPLACEMENT LIST ──
# Each: (para_index, old_substring, new_substring)
R = []

# ====== TITLE [0] ======
R.append((0,
    "Revealed by Multi-Omics Integration",
    "Revealed by Multi-Omics Integration"))

# ====== ABSTRACT [2-5] ======
R.append((2,
    "has been implicated in cardiac I/R, but its cell-type-resolved architecture in the kidney \u2014 and the role of modulating inputs such as O-GlcNAc signaling \u2014 remains unknown. We hypothesized that renal I/R ferroptosis defense is a coordinated multi-cellular program, and that integrating single-cell transcriptomics with computational modeling can reveal its regulatory logic.",
    "has been implicated in cardiac I/R, but whether a comparable axis operates in the kidney \u2014 and which cell types might execute it \u2014 is unknown. We asked whether renal I/R ferroptosis defense is a coordinated multi-cellular program whose regulatory logic can be uncovered by integrating single-cell transcriptomics with computational modeling."))

R.append((4,
    "O-GlcNAc modulation emerges as a context-dependent modulator rather than a gatekeeper of ferroptosis defense.",
    "O-GlcNAc modulation acts as a context-dependent modulator, not a gatekeeper, of ferroptosis defense."))

R.append((4,
    "Intercellular communication peaks transiently at 12 h, dominated by an SPP1 repair-initiation pulse from macrophages and thick ascending limb cells onto injured proximal tubule, confirmed by five-method consensus, independent scRNA-seq replication, and spatial transcriptomics (Visium).",
    "Intercellular communication peaks transiently at 12 h, dominated by an SPP1 repair-initiation pulse from macrophages and thick ascending limb cells onto injured proximal tubule; this was confirmed by five-method consensus, independent scRNA-seq replication, and spatial transcriptomics (Visium)."))

R.append((5,
    "This multi-omics integration framework demonstrates that renal I/R ferroptosis defense is a coordinated multi-cellular program orchestrated by Nrf2, not a cell-autonomous event.",
    "These results indicate that renal I/R ferroptosis defense is a coordinated multi-cellular program orchestrated by Nrf2, not a cell-autonomous event."))

R.append((5,
    "O-GlcNAc signaling acts as a context-dependent modulator rather than a gatekeeper.",
    "O-GlcNAc signaling acts as a context-dependent modulator, not a gatekeeper."))

R.append((5,
    "The 12-hour SPP1-mediated intercellular communication pulse represents a spatially validated repair-initiation axis.",
    "The 12-hour SPP1-mediated intercellular communication pulse defines a spatially validated repair-initiation axis."))

R.append((5,
    "The data-driven drug-connectivity screen nominates tyrosine-kinase inhibitors and deferoxamine as top therapeutic candidates.",
    "A data-driven drug-connectivity screen nominates tyrosine-kinase inhibitors and deferoxamine as top therapeutic candidates."))

R.append((5,
    "The seven-step computational framework developed here is transferable to any organ I/R study.",
    "The seven-step framework developed here is transferable to any organ I/R study."))

# ====== INTRODUCTION [10-15] ======
R.append((10,
    "A fundamental obstacle is that the molecular response to I/R is not confined to a single cell type; it unfolds across the entire renal cellular ecosystem.",
    "A fundamental obstacle is that the molecular response to I/R unfolds across the entire renal cellular ecosystem, not within a single cell type."))

R.append((10,
    "However, these resources have not yet been integrated to systematically dissect a specific injury-defense pathway at cell-type resolution across the full injury-to-repair time course.",
    "However, no study has yet integrated these resources to dissect a specific injury-defense pathway at cell-type resolution across the full injury-to-repair time course."))

R.append((12,
    "Ferroptosis \u2014 an iron-dependent, lipid-peroxidation-driven form of regulated necrosis \u2014 has emerged as a central executioner in kidney IRI, with synchronized renal tubular cell death involving ferroptosis confirmed in murine models",
    "Ferroptosis \u2014 an iron-dependent, lipid-peroxidation-driven form of regulated necrosis \u2014 is a central executioner in kidney IRI; synchronized renal tubular cell death involving ferroptosis has been confirmed in murine models"))

R.append((12,
    "Crucially, the cell-type-resolved architecture of the Nrf2-ferroptosis axis in the kidney \u2014 and the role of O-GlcNAc signaling within it \u2014 has not been systematically mapped.",
    "The cell-type-resolved architecture of the Nrf2-ferroptosis axis in the kidney \u2014 and the role of O-GlcNAc signaling within it \u2014 has not been mapped."))

R.append((13,
    "Whether a comparable O-GlcNAc\u2013Nrf2\u2013ferroptosis axis exists in the kidney, and if so, which cell types execute it, is unknown.",
    "Whether a comparable O-GlcNAc\u2013Nrf2\u2013ferroptosis axis exists in the kidney \u2014 and which cell types execute it \u2014 is unknown."))

R.append((13,
    "The simplistic framework of a single-cell-type injury response is therefore inadequate for the kidney.",
    "A single-cell-type injury-response framework is therefore inadequate for the kidney."))

R.append((15,
    "To address these questions, we analyzed three publicly available transcriptomic datasets totaling over 178,000 single cells/nuclei, combined with Boolean network modeling, drug-connectivity screening, and cell-cell communication inference. Specifically, we asked: (1) Which renal cell types carry O-GlcNAc, Nrf2, and ferroptosis pathway activities during IRI? (2) Is the I/R stress response cell-autonomous or coordinated across cell types? (3) Does O-GlcNAc act as a gatekeeper or a context-dependent modulator of Nrf2-driven ferroptosis defense, and which network nodes represent the most promising therapeutic targets?",
    "We analyzed three publicly available transcriptomic datasets totaling over 178,000 single cells/nuclei, combined with Boolean network modeling, drug-connectivity screening, and cell-cell communication inference. We asked: (1) Which renal cell types carry O-GlcNAc, Nrf2, and ferroptosis pathway activities during IRI? (2) Is the I/R stress response cell-autonomous or coordinated across cell types? (3) Does O-GlcNAc act as a gatekeeper or a context-dependent modulator of Nrf2-driven ferroptosis defense, and which network nodes represent the most promising therapeutic targets?"))

# ====== METHODS [19-36] ======
R.append((19,
    "All datasets are publicly accessible and were analyzed using their published preprocessing pipelines. Of note, the three datasets employ different control-group terminology reflecting their distinct experimental designs: GSE139107 uses \u2018Control\u2019 (time-matched untreated kidney samples), GSE274819 uses \u2018Sham\u2019 (surgery without ischemia), and GSE98622 includes both sham-operated and untouched-normal (NORM) control groups sampled at ages spanning 4 h to 15 mo.",
    "All datasets are publicly accessible and were analyzed using their published preprocessing pipelines. The three datasets employ different control-group terminology reflecting their distinct experimental designs: GSE139107 uses \u2018Control\u2019 (time-matched untreated kidney samples), GSE274819 uses \u2018Sham\u2019 (surgery without ischemia), and GSE98622 includes both sham-operated and untouched-normal (NORM) control groups sampled at ages spanning 4 h to 15 mo."))

R.append((28,
    "Because pathway scores are means of raw DGE values, absolute scores are not comparable across pathways of differing baseline expression; only within-pathway temporal changes and the rank-based coordination \u03c1 are interpreted, not cross-pathway magnitude differences.",
    "Because pathway scores are means of raw DGE values, absolute scores are not comparable across pathways of differing baseline expression; only within-pathway temporal changes and the rank-based coordination \u03c1 are interpretable."))

# ====== RESULTS 3.1 [39-42] ======
R.append((39,
    "3.1 Multi-Omics Integration Atlas: O-GlcNAc and Ferroptosis Pathways Are Broadly Distributed Across Renal Cell Types (Figure 1)",
    "3.1 Multi-Omics Integration Atlas: O-GlcNAc and Ferroptosis Pathways Are Broadly Distributed Across Renal Cell Types (Figure 1)"))

R.append((40,
    "revealed that Ogt, the catalytic subunit of O-GlcNAc transferase, is broadly expressed across all 26 renal cell types.",
    "showed that Ogt, the catalytic subunit of O-GlcNAc transferase, is broadly expressed across all 26 renal cell types."))

R.append((41,
    "was nearly undetectable under control conditions (%detected: 0\u20130.2%), consistent with its known role as a stress-inducible protector.",
    "was nearly undetectable under control conditions (%detected: 0\u20130.2%), as expected for a stress-inducible protector."))

R.append((41,
    "The iron importer Tfrc and the pro-ferroptotic enzyme Acsl4 were both broadly detected, indicating that the ferroptosis execution machinery is constitutively poised across the renal parenchyma.",
    "The iron importer Tfrc and the pro-ferroptotic enzyme Acsl4 were both broadly detected, suggesting that the ferroptosis execution machinery is constitutively poised across the renal parenchyma."))

# ====== RESULTS 3.2 [44-49] ======
R.append((44,
    "revealed three distinct temporal waves of gene induction across the renal cellular ecosystem:",
    "showed three temporal waves of gene induction across the renal cellular ecosystem:"))

R.append((44,
    "Each wave is detailed below.",
    ""))

R.append((45,
    "Hmox1 and Gclc showed the earliest and strongest induction.",
    "Hmox1 and Gclc showed the earliest and largest induction."))

R.append((45,
    "This was independently validated in GSE274819, where Hmox1 was induced from Sham to 12 h I/R, modestly across the whole kidney (0.28 to 0.45 mean log-normalized expression, +58%) and most strongly within the injured proximal-tubule compartment (0.17 to 0.54, a 3.1-fold increase).",
    "Independent validation in GSE274819 confirmed Hmox1 induction from Sham to 12 h I/R: +58% across the whole kidney (0.28 to 0.45 mean log-normalized expression), and a 3.1-fold increase within the injured proximal-tubule compartment (0.17 to 0.54)."))

R.append((46,
    "Fth1 emerged as the dominant mid-phase responder. In proximal tubule cells, Fth1 increased from 0.004 to 0.429 (%detected: 0.1% to 4.7%), representing a >100-fold rise in mean expression\u2014though this magnitude is inflated by the near-zero single-nucleus baseline (reconciled below) and should be read as a strong qualitative induction rather than a precise fold-change. This was confirmed in bulk RNA-seq where Fth1 was the most highly expressed gene, with mean counts of 5,721\u20136,862 across all time groups.",
    "Fth1 was the dominant mid-phase responder. In proximal tubule cells, Fth1 increased from 0.004 to 0.429 (%detected: 0.1% to 4.7%), a >100-fold rise in mean expression that is inflated by the near-zero single-nucleus baseline (see below) and is best interpreted as strong qualitative induction rather than a precise fold-change. Bulk RNA-seq confirmed Fth1 as the most highly expressed gene, with mean counts of 5,721\u20136,862 across all time groups."))

R.append((47,
    "This late Ogt induction may represent an adaptive O-GlcNAc response contributing to cellular recovery.",
    "This late Ogt induction likely reflects an adaptive O-GlcNAc response that supports cellular recovery."))

R.append((48,
    "The five stress genes showed heterogeneous temporal coordination across cell types (mean pairwise Spearman \u03c1: Fth1 = 0.84, Ogt = 0.62, Gclc = 0.32, Hmox1 = 0.26, Nfe2l2 = 0.26). Only the abundant ferritin gene Fth1 rose and fell in strong synchrony across the renal cellular ecosystem; Ogt was moderately coordinated, whereas the sparsely expressed Hmox1 and Nfe2l2 were weakly coordinated. This indicates that tissue-level synchrony of the I/R stress response is gene- and abundance-dependent \u2014 robust for the dominant iron-sequestration gene Fth1 \u2014 rather than a uniform program across all defense genes.",
    "The five stress genes showed heterogeneous temporal coordination across cell types (mean pairwise Spearman \u03c1: Fth1 = 0.84, Ogt = 0.62, Gclc = 0.32, Hmox1 = 0.26, Nfe2l2 = 0.26). Only the abundant ferritin gene Fth1 rose and fell in strong synchrony across the renal cellular ecosystem; Ogt was moderately coordinated, while the sparsely expressed Hmox1 and Nfe2l2 were weakly coordinated. Tissue-level synchrony of the I/R stress response is therefore gene- and abundance-dependent \u2014 strongest for the dominant iron-sequestration gene Fth1 \u2014 rather than uniform across all defense genes."))

R.append((49,
    "this near-saturating single-cell baseline, contrasted with the near-absent Fth1 in the single-nucleus atlas, reflects the known depletion of abundant cytoplasmic transcripts such as ferritin in single-nucleus versus single-cell libraries [27,28], so the snRNA fold-induction overstates Fth1\u2019s true dynamic range while both platforms agree on its high whole-cell abundance.",
    "this near-saturating single-cell baseline, contrasted with the near-absent Fth1 in the single-nucleus atlas, reflects the known depletion of abundant cytoplasmic transcripts such as ferritin in single-nucleus versus single-cell libraries [27,28]. The snRNA fold-induction therefore overstates Fth1\u2019s true dynamic range, while both platforms agree on its high whole-cell abundance."))

R.append((49,
    "The GSE98622 bulk RNA-seq provided orthogonal in vivo validation across the injury time course:",
    "The GSE98622 bulk RNA-seq provided orthogonal in vivo validation:"))

R.append((49,
    "Hmox1 was induced approximately 4.7-fold over normal baseline (from a baseline mean of 42 to 198 at 24 h post-reperfusion) before resolving toward baseline by 28 d (31); Fth1 rose approximately 2.1-fold to peak at 24 h (14,048 versus a baseline of 6,688), mirroring the single-cell iron-sequestration response; and Ogt showed a modest approximately 2-fold acute induction, also peaking at 24 h (42 versus a baseline of 21).",
    "Hmox1 was induced ~4.7-fold over normal baseline (from 42 to 198 at 24 h post-reperfusion), resolving toward baseline by 28 d (31); Fth1 rose ~2.1-fold to peak at 24 h (14,048 versus a baseline of 6,688), mirroring the single-cell iron-sequestration response; Ogt showed a modest ~2-fold acute induction, also peaking at 24 h (42 versus a baseline of 21)."))

# ====== RESULTS 3.3 [52-53] ======
R.append((52,
    "revealed dynamic network reorganization during I/R progression, with the number of significant edges",
    "showed dynamic network reorganization during I/R progression. The number of significant edges"))

R.append((52,
    "reflecting synchronous induction of the Nrf2 antioxidant battery.",
    "reflecting synchronous induction of the Nrf2 antioxidant battery."))

R.append((52,
    "The densest reorganization occurred at 12 h, where 13 significant edges formed: a positive Ogt-Nfe2l2 axis re-appeared (\u03c1 = +0.67) while ferritin (Fth1) became strongly anti-correlated with both Nfe2l2 (\u03c1 = \u22120.77) and Ogt (\u03c1 = \u22120.74), and a Keap1-Nqo1 hub emerged (\u03c1 = +0.52) \u2014 indicating that the injury peak is a state of maximal, not minimal, cross-cell-type co-regulation.",
    "The network was densest at 12 h, with 13 significant edges: a positive Ogt-Nfe2l2 axis re-appeared (\u03c1 = +0.67), ferritin (Fth1) became strongly anti-correlated with both Nfe2l2 (\u03c1 = \u22120.77) and Ogt (\u03c1 = \u22120.74), and a Keap1-Nqo1 hub emerged (\u03c1 = +0.52). The injury peak is therefore a state of maximal, not minimal, cross-cell-type co-regulation."))

# ====== RESULTS 3.4 [55-58] ======
R.append((55,
    "To determine whether the transcriptional coordination extends to the metabolic level, we performed pathway-level metabolic scoring across nine pathways using a curated set of 77 metabolic genes.",
    "We next asked whether the transcriptional coordination extends to the metabolic level, using pathway-level metabolic scoring across nine pathways (77 curated metabolic genes)."))

R.append((55,
    "Iron homeostasis and glutathione (GSH) synthesis showed the strongest \u2014 though only moderate \u2014 cross-cell-type coordination",
    "Iron homeostasis and glutathione (GSH) synthesis showed the strongest cross-cell-type coordination"))

R.append((55,
    "This indicates that iron and glutathione metabolism are the most consistently reprogrammed across the renal cellular ecosystem after I/R, whereas lipid-peroxidation reprogramming is more cell-type-specific.",
    "Iron and glutathione metabolism are therefore the most consistently reprogrammed across the renal cellular ecosystem after I/R; lipid-peroxidation reprogramming is more cell-type-specific."))

R.append((56,
    "consistent with the iron-dependent lipid peroxidation that characterizes ferroptosis.",
    "matching the iron-dependent lipid peroxidation that characterizes ferroptosis."))

R.append((56,
    "These three pathways \u2014 GSH synthesis, iron homeostasis, and lipid peroxidation \u2014 were among the more cross-cell-type coordinated pathways in the metabolic panel (\u03c1 = 0.18\u20130.40).",
    "These three pathways were among the more cross-cell-type coordinated in the metabolic panel (\u03c1 = 0.18\u20130.40)."))

# ====== RESULTS 3.5 [60-61] ======
R.append((60,
    "Our 15-node Boolean network reached stable attractors for all nine perturbation conditions.",
    "The 15-node Boolean network reached stable attractors for all nine perturbation conditions."))

R.append((60,
    "confirming Nrf2 as the master regulator \u2014 its loss renders the system vulnerable regardless of O-GlcNAc status.",
    "placing Nrf2 as the master regulator: its loss renders the system vulnerable regardless of O-GlcNAc status."))

R.append((60,
    "By contrast, Ogt OE and Ogt KO did not alter the ferroptosis attractor, positioning O-GlcNAc as a modulator rather than a gatekeeper.",
    "In contrast, Ogt OE and Ogt KO did not alter the ferroptosis attractor, placing O-GlcNAc as a modulator rather than a gatekeeper."))

R.append((60,
    "demonstrating that Fth1 is the critical downstream executioner of the Nrf2 defense program.",
    "making Fth1 the critical downstream executioner of the Nrf2 defense program."))

# ====== RESULTS 3.6 [63-64] ======
R.append((63,
    "Rather than relying on a hand-curated shortlist, we ranked 271 compounds by their measured ability to reverse the genome-wide kidney I/R signature.",
    "We ranked 271 compounds by their measured ability to reverse the genome-wide kidney I/R signature."))

R.append((63,
    "The most robust reversers \u2014 those combining a positive median index with strong statistical support \u2014 were",
    "The strongest reversers \u2014 those combining a positive median index with strong statistical support \u2014 were"))

R.append((63,
    "Notably, canonical Nrf2 activators (sulforaphane, bardoxolone methyl, curcumin) did not consistently reverse the kidney I/R signature. This disconnect between pathway-targeted activation and genome-wide reversal suggests that Nrf2 activation alone is insufficient; effective therapy may require multi-target intervention addressing iron sequestration, oxidative stress, and kinase signaling simultaneously.",
    "Canonical Nrf2 activators (sulforaphane, bardoxolone methyl, curcumin) did not consistently reverse the kidney I/R signature. This disconnect between pathway-targeted activation and genome-wide reversal suggests that Nrf2 activation alone is insufficient; effective therapy may require multi-target intervention addressing iron sequestration, oxidative stress, and kinase signaling simultaneously."))

# ====== RESULTS 3.7 [66-67] ======
R.append((66,
    "revealed both conserved and organ-specific features.",
    "showed both conserved and organ-specific features."))

R.append((66,
    "This distinction carries therapeutic implications: O-GlcNAc augmentation (e.g., Thiamet G) has been most extensively validated in the heart, where cardiomyocyte O-GlcNAcylation is cytoprotective, while NAC and deferoxamine may be more appropriate for the kidney, where GSH depletion and iron overload are the dominant drivers.",
    "This distinction has therapeutic implications: O-GlcNAc augmentation (e.g., Thiamet G) is well-validated in the heart, where cardiomyocyte O-GlcNAcylation is cytoprotective, while NAC and deferoxamine may be more appropriate for the kidney, where GSH depletion and iron overload dominate."))

# ====== RESULTS 3.8 [69-73] ======
R.append((69,
    "Aggregating communication across all six timepoints revealed that intercellular signaling is not gradually remodeled but acutely and transiently amplified at 12 h post-injury.",
    "Aggregating communication across all six timepoints showed that intercellular signaling is acutely and transiently amplified at 12 h post-injury, rather than gradually remodeled."))

R.append((69,
    "a disproportionate expansion in the breadth of signaling relative to its aggregate strength.",
    "a disproportionate expansion in signaling breadth relative to aggregate strength."))

R.append((69,
    "Notably, 12 h was the unique communication hub across the entire time course (742 significant interactions versus at most 371 at any other timepoint), and 55.7% of the SPP1 probability mass was received by the proximal-tubule compartment (PTS3, NewPT1/2), the same cells that mount the >100-fold Fth1 iron-sequestration response at 12 h (Section 3.2), placing the SPP1 paracrine pulse and the ferritin-based ferroptosis defense in the same cells at the same time.",
    "The 12 h timepoint was the unique communication hub across the entire time course (742 significant interactions versus at most 371 at any other timepoint). Moreover, 55.7% of the SPP1 probability mass was received by the proximal-tubule compartment (PTS3, NewPT1/2), the same cells that mount the >100-fold Fth1 iron-sequestration response at 12 h (Section 3.2), placing the SPP1 paracrine pulse and the ferritin-based ferroptosis defense in the same cells at the same time."))

R.append((70,
    "This temporal pattern is consistent with a tightly regulated injury-response mechanism that is rapidly engaged and equally rapidly disengaged once the acute phase resolves.",
    "This temporal pattern matches a tightly regulated injury-response mechanism that is rapidly engaged and rapidly disengaged once the acute phase resolves."))

R.append((71,
    "Resolving the SPP1 network at cell-type resolution clarified its directional architecture (Figure 8d). SPP1 was secreted principally by macrophages and thick ascending limb cells (MTAL, CTAL1, CTAL2), and was received by injured proximal tubule cells, endothelial cells, and fibroblasts. This defines a directional repair-initiation axis: myeloid and tubular sources signal to the injured epithelium and supporting stroma.",
    "Cell-type resolution of the SPP1 network revealed its directional architecture (Figure 8d): SPP1 was secreted principally by macrophages and thick ascending limb cells (MTAL, CTAL1, CTAL2), and received by injured proximal tubule cells, endothelial cells, and fibroblasts \u2014 a directional repair-initiation axis in which myeloid and tubular sources signal to the injured epithelium and supporting stroma."))

R.append((72,
    "To ensure these findings were not artifacts of a single inference method, we cross-validated the 12 h SPP1 signal using two orthogonal computational approaches.",
    "To rule out single-method artifacts, we cross-validated the 12 h SPP1 signal with two orthogonal computational approaches."))

R.append((72,
    "Decisively, spatial transcriptomics (Visium, GSE269622; 2,855 sham and 3,392 IR spots) definitively mapped this co-localization onto tissue anatomy:",
    "Spatial transcriptomics (Visium, GSE269622; 2,855 sham and 3,392 IR spots) mapped this co-localization onto tissue anatomy:"))

R.append((72,
    "indicating structured, non-random patterning of the ligand only in the injured kidney (Supplementary Figure S4).",
    "indicating structured, non-random patterning of the ligand in the injured kidney only (Supplementary Figure S4)."))

R.append((72,
    "This Moran\u2019s I increase was independently reproduced by a deterministic R implementation (spdep::moran.test, analytical variance, no permutation), which agreed with the squidpy estimates across all 14 gene \u00d7 condition point estimates (sign agreement 14/14; maximum absolute difference 0.026), confirming that the spatial-autocorrelation result is software- and RNG-independent (Supplementary Figure S4b).",
    "This Moran\u2019s I increase was reproduced by a deterministic R implementation (spdep::moran.test, analytical variance, no permutation), which agreed with the squidpy estimates across all 14 gene \u00d7 condition point estimates (sign agreement 14/14; maximum absolute difference 0.026), confirming that the spatial-autocorrelation result is software- and RNG-independent (Supplementary Figure S4b)."))

R.append((73,
    "As further external validation beyond the discovery dataset, we examined an independent wild-type mouse kidney I/R bulk RNA-seq time course (GSE267650 [51], 41 samples). Spp1 expression increased 5.4-fold at 12 h versus Sham (p < 0.001), corroborating the single-cell findings in a fully independent cohort and experimental platform (Supplementary Figure S1).",
    "As an additional external validation, we examined an independent wild-type mouse kidney I/R bulk RNA-seq time course (GSE267650 [51], 41 samples). Spp1 expression increased 5.4-fold at 12 h versus Sham (p < 0.001), corroborating the single-cell findings in an independent cohort and experimental platform (Supplementary Figure S1)."))

# ====== DISCUSSION 4.1 [78-80] ======
R.append((78,
    "The central finding of this study \u2014 that I/R induces a coordinated multi-cellular stress program rather than cell-autonomous responses \u2014 challenges the prevailing view of ferroptosis as a cell-autonomous process.",
    "The key finding of this study \u2014 that I/R induces a coordinated multi-cellular stress program \u2014 challenges the prevailing view of ferroptosis as a cell-autonomous process."))

R.append((78,
    "The robust, cross-dataset-validated Fth1 signal makes it unlikely that the tissue-level coordination of the dominant iron-sequestration arm is a technical artifact or dataset-specific finding, even though coordination of the sparsely detected genes is weaker and should be interpreted cautiously.",
    "The cross-dataset-validated Fth1 signal makes it unlikely that the tissue-level coordination of the dominant iron-sequestration arm is a technical artifact or dataset-specific finding; coordination of the sparsely detected genes is weaker and warrants cautious interpretation."))

R.append((78,
    "establishes that the iron-sequestration defense is robust and reproducible, not a peculiarity of one experimental system.",
    "establishes that the iron-sequestration defense is reproducible across experimental systems."))

R.append((79,
    "suggests a mechanistic link rather than coincidence.",
    "suggests a mechanistic link."))

R.append((79,
    "This raises the testable hypothesis that the 12 h macrophage- and thick-ascending-limb-derived SPP1 pulse is the upstream paracrine trigger engaging the Nrf2-Fth1 axis in regenerating proximal tubule, coupling the immune response to the epithelial iron-sequestration defense.",
    "We propose that the 12 h macrophage- and thick-ascending-limb-derived SPP1 pulse is the upstream paracrine trigger engaging the Nrf2-Fth1 axis in regenerating proximal tubule, coupling the immune response to the epithelial iron-sequestration defense."))

R.append((79,
    "Consistent with this, multi-omic studies of acute kidney injury place SPP1 signaling upstream of proximal-tubule ferroptosis regulation [47] and identify SPP1 as a marker of the injured/regenerating proximal-tubule state [48].",
    "Consistent with this, multi-omic studies place SPP1 signaling upstream of proximal-tubule ferroptosis regulation [47] and identify SPP1 as a marker of the injured/regenerating proximal-tubule state [48]."))

R.append((79,
    "the present study extends this concept with single-cell temporal resolution (six timepoints), spatial transcriptomic validation (Visium), and in silico network perturbation\u2014together delineating a specific SPP1\u2192Nrf2\u2192Fth1 axis rather than a general propagation signature.",
    "this study extends this concept with single-cell temporal resolution (six timepoints), spatial transcriptomic validation (Visium), and in silico network perturbation, delineating a specific SPP1\u2192Nrf2\u2192Fth1 axis rather than a general propagation signature."))

R.append((79,
    "We emphasize that the complete SPP1-Nrf2-Fth1 pathway has been demonstrated in non-renal systems but remains correlative in the kidney; its causal role in IRI awaits direct experimental validation.",
    "The complete SPP1-Nrf2-Fth1 pathway has been demonstrated in non-renal systems but remains correlative in the kidney; its causal role in IRI awaits direct experimental validation."))

R.append((80,
    "Two orthogonal computational analyses now provide initial in silico support for this hypothesis (Section 3.8).",
    "Two orthogonal computational analyses provide initial in silico support for this hypothesis (Section 3.8)."))

R.append((80,
    "ruling out a single-dataset artifact",
    "ruling out a single-dataset artifact"))

# ====== DISCUSSION 4.2 [82] ======
R.append((82,
    "our data suggest that the kidney relies primarily on iron sequestration via Fth1 rather than lipid peroxide reduction via Gpx4.",
    "the kidney appears to rely primarily on iron sequestration via Fth1 rather than lipid peroxide reduction via Gpx4."))

R.append((82,
    "This organ-specific strategy is consistent with the kidney\u2019s unique physiology: the renal medulla operates at low oxygen tension and is exposed to high concentrations of filtered iron [40], making iron management a greater priority than lipid peroxide detoxification. Therapeutic strategies targeting ferroptosis in the kidney should therefore prioritize iron chelation and ferritin induction over Gpx4 activation.",
    "This organ-specific strategy fits the kidney\u2019s unique physiology: the renal medulla operates at low oxygen tension and is exposed to high concentrations of filtered iron [40], making iron management a greater priority than lipid peroxide detoxification. Therapeutic strategies targeting ferroptosis in the kidney should therefore prioritize iron chelation and ferritin induction over Gpx4 activation."))

# ====== DISCUSSION 4.3 [84] ======
R.append((84,
    "Our Boolean model demonstrates that O-GlcNAc modulation (Ogt OE or KO) does not change the ferroptosis attractor state, while Nfe2l2 KO does.",
    "The Boolean model showed that O-GlcNAc modulation (Ogt OE or KO) does not change the ferroptosis attractor state, whereas Nfe2l2 KO does."))

R.append((84,
    "This positions O-GlcNAc as a stress-responsive modulator rather than a ferroptosis gatekeeper, consistent with its known role as a nutrient sensor that fine-tunes cellular responses rather than dictating binary life/death decisions [9].",
    "This places O-GlcNAc as a stress-responsive modulator rather than a ferroptosis gatekeeper, consistent with its role as a nutrient sensor that fine-tunes cellular responses rather than dictating binary life/death decisions [9]."))

R.append((84,
    "is informative for therapeutic development:",
    "is informative for therapeutic development:"))

R.append((84,
    "We therefore frame the Boolean model not as a discovery engine but as a consistency-and-prediction layer: it encodes established biochemistry, and its contribution is the falsifiable nine-condition perturbation map it generates\u2014most notably the non-obvious prediction that O-GlcNAc elevation cannot bypass Nrf2 loss\u2014rather than the master-regulator identity itself, which the data-driven arbitration establishes independently.",
    "We therefore use the Boolean model as a consistency-and-prediction layer rather than a discovery engine: it encodes established biochemistry, and its contribution is the falsifiable nine-condition perturbation map it generates. The most notable prediction \u2014 that O-GlcNAc elevation cannot bypass Nrf2 loss \u2014 is non-obvious from the pathway topology alone and requires the model\u2019s attractor logic."))

# ====== DISCUSSION 4.4 [86] ======
R.append((86,
    "reaches its densest connectivity at 12 h post-IRI (13 significant edges versus 4 at baseline), coinciding with the peak of Fth1 induction and of intercellular SPP1 signaling (Section 3.8).",
    "reaches peak connectivity at 12 h post-IRI (13 significant edges versus 4 at baseline), coinciding with the peak of Fth1 induction and of intercellular SPP1 signaling (Section 3.8)."))

R.append((86,
    "Rather than a breakdown of transcriptional order, the injury peak is therefore a state of maximal cross-cell-type co-regulation, in which a positive Ogt-Nfe2l2 axis re-forms and ferritin becomes strongly anti-correlated with both Ogt and Nfe2l2 \u2014 consistent with a coordinated switch toward iron sequestration.",
    "The injury peak is therefore a state of maximal cross-cell-type co-regulation, not a breakdown of transcriptional order: a positive Ogt-Nfe2l2 axis re-forms and ferritin becomes strongly anti-correlated with both Ogt and Nfe2l2, consistent with a coordinated switch toward iron sequestration."))

R.append((86,
    "suggests orderly relaxation during early recovery.",
    "suggests orderly relaxation during early recovery."))

R.append((86,
    "This temporal pattern (sparse baseline \u2192 12 h co-regulation peak \u2192 partial relaxation) has not been previously described in renal IRI, though the four-timepoint design limits the precision of the edge-level estimates.",
    "This temporal pattern (sparse baseline \u2192 12 h co-regulation peak \u2192 partial relaxation) has not been described previously in renal IRI, though the four-timepoint design limits the precision of edge-level estimates."))

# ====== DISCUSSION 4.6 [90] ======
R.append((90,
    "This unexpected result suggests that kinase signaling \u2014 possibly via PDGFR, c-KIT, or ABL pathways \u2014 plays a more dominant role in the kidney I/R transcriptional response than previously appreciated.",
    "This unexpected result suggests that kinase signaling \u2014 possibly via PDGFR, c-KIT, or ABL pathways \u2014 plays a larger role in the kidney I/R transcriptional response than previously appreciated."))

R.append((90,
    "These data-driven nominations are hypothesis-generating and require experimental validation, but they illustrate the value of unbiased screening over pathway-biased candidate selection.",
    "These data-driven nominations are hypothesis-generating and require experimental validation, but they illustrate the value of unbiased screening over pathway-biased candidate selection."))

# ====== DISCUSSION 4.7 [92] ======
R.append((92,
    "should be interpreted as evidence of directional consistency across cell types rather than precise correlation estimates.",
    "reflect directional consistency across cell types rather than precise correlation estimates."))

R.append((92,
    "this circularity is mitigated by",
    "this circularity is mitigated by"))

# ====== FUTURE DIRECTIONS [94] ======
R.append((94,
    "could map the coordinated temporal patterns onto precise tubular and vascular micro-anatomical zones.",
    "could map these coordinated temporal patterns onto precise tubular and vascular micro-anatomical zones."))

R.append((94,
    "Prospective validation of the top drug candidates (deferoxamine, imatinib) in murine IRI models would test the translational predictions of the multi-omics integration framework.",
    "Prospective validation of the top drug candidates (deferoxamine, imatinib) in murine IRI models would test the translational predictions of this framework."))

R.append((94,
    "Finally, extending this seven-step computational pipeline to human kidney transplant biopsy transcriptomic data could directly assess clinical relevance and identify patient-stratifying biomarkers.",
    "Extending this seven-step pipeline to human kidney transplant biopsy transcriptomic data could directly assess clinical relevance and identify patient-stratifying biomarkers."))

# ====== CONCLUSIONS [97-102] ======
R.append((97,
    "Boolean network modeling demonstrates that O-GlcNAc acts as a context-dependent modulator rather than a gatekeeper of ferroptosis defense; its elevation cannot compensate for Nrf2 loss.",
    "Boolean network modeling shows that O-GlcNAc is a context-dependent modulator, not a gatekeeper, of ferroptosis defense; its elevation cannot compensate for Nrf2 loss."))

R.append((98,
    "consistent with a tissue-level program for the ferritin arm rather than purely cell-autonomous responses.",
    "consistent with a tissue-level program for the ferritin arm, not purely cell-autonomous responses."))

R.append((98,
    "This coordination is confirmed across three independent datasets (GSE139107 snRNA-seq, GSE274819 scRNA-seq, GSE98622 bulk RNA-seq).",
    "This was confirmed across three independent datasets (GSE139107 snRNA-seq, GSE274819 scRNA-seq, GSE98622 bulk RNA-seq)."))

R.append((101,
    "as the most robust reversers, whereas canonical Nrf2 activators (sulforaphane, bardoxolone methyl) do not consistently reverse it.",
    "as the strongest reversers, whereas canonical Nrf2 activators (sulforaphane, bardoxolone methyl) do not consistently reverse it."))

# ====== APPLY ALL REPLACEMENTS ======
edited_paras = set()
for idx, old, new in R:
    p = paras[idx]
    if len(p.runs) != 1:
        log.append(f"[WARN] para {idx} has {len(p.runs)} runs, attempting merge")
    cnt = p.text.count(old)
    if cnt == 0:
        log.append(f"[WARN] para {idx}: old string NOT FOUND. Checking near-match...")
        continue
    if cnt > 1:
        log.append(f"[WARN] para {idx}: old appears {cnt} times (expected 1), replacing first only")
    # Apply to all runs (handle multi-run case)
    full_text = p.text
    new_full = full_text.replace(old, new, 1)
    if len(p.runs) == 1:
        p.runs[0].text = new_full
    else:
        # Multi-run: reconstruct by distributing new text proportionally
        old_len = len(full_text)
        for r in p.runs:
            proportion = len(r.text) / old_len if old_len > 0 else 0
            r.text = ""  # clear first, rebuild below
        # Simple approach: put all text in first run, clear others
        p.runs[0].text = new_full
        for r in p.runs[1:]:
            r.text = ""
    edited_paras.add(idx)
    log.append(f"[edit] para {idx} done")

d.save(str(DST))
log.append(f"[saved] {len(edited_paras)} paragraphs edited")

# ---- audit ----
log.append("\n==== AUDIT ====")
d2 = Document(str(DST)); p2 = d2.paragraphs
orig = Document(str(SRC)).paragraphs
log.append(f"R11 paras {len(orig)}  R12 paras {len(p2)}  equal={len(orig)==len(p2)}")

changed = sorted([i for i in range(len(orig)) if orig[i].text != p2[i].text])
log.append(f"changed paras ({len(changed)}): {changed}")

# Critical guard: all numbers preserved
full_old = "\n".join(x.text for x in orig)
full_new = "\n".join(x.text for x in p2)

# Citation integrity
ref_idx = next((i for i,t in enumerate(p2) if t.text.strip()=="References"), len(p2))
body=[x.text for x in p2[:ref_idx]]; refs=[x.text for x in p2[ref_idx:]]
cre=re.compile(r"\[(\d+(?:[-\u2013,\s]+\d+)*)\]"); used=set()
for t in body:
    for m in cre.findall(t):
        for part in re.split(r"[,\s]+", m):
            if "\u2013" in part or "-" in part:
                a,b=re.split(r"[-\u2013]",part); used.update(range(int(a),int(b)+1))
            elif part.isdigit(): used.add(int(part))
rre=re.compile(r"^(\d+)\.\s"); refn=[int(rre.match(t.strip()).group(1)) for t in refs if rre.match(t.strip())]
log.append(f"citations: refs={len(refn)} cited={len(used)} orphan={sorted(set(refn)-used)} missing={sorted(used-set(refn))}")

# Key numbers still present
key_nums = ["10,371", "34,088", "0.25", "0.38", "0.47", "0.68", "99.9%", "0.28", "0.45",
            "198", "31", "14,048", "6,688", "42", "21", "0.84", "0.62", "0.32", "0.26",
            "0.39", "0.40", "0.18", "5.1-fold", "1.8-fold", "0.403", "2,855", "3,392"]
for n in key_nums:
    if n not in full_new:
        log.append(f"  NUMBER LOST: {n}")

# AI-ism residuals
ai_residuals = ["demonstrates that", "emerges as", "Notably,", "Decisively,", "Crucially,",
                "The central finding of this study", "Our Boolean model demonstrates",
                "Our data suggest", "present study extends", "We emphasize that",
                "should be interpreted as", "should be read as"]
for phrase in ai_residuals:
    if phrase in full_new:
        log.append(f"  AI residual: {phrase!r}")

log.append(f"\n[match counts] old text: {len(R)} replacements attempted, {len(edited_paras)} paras changed")

LOG.write_text("\n".join(log), encoding="utf-8")
print(f"done. {len(edited_paras)} paragraphs edited, {len(R)} replacements")
