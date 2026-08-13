# -*- coding: utf-8 -*-
"""R10 -> R11: "virtual cell" → "multi-omics integration" + control terminology note + S1 citation.
Versioned, no overwrite. Run: py -X utf8 this.py"""
import shutil, re
from pathlib import Path
from docx import Document

P = Path("D:/肾脏虚拟细胞文章设计")
SRC = P / "manuscript" / "manuscript_R10_bulkIRI_v1.docx"
DST = P / "manuscript" / "manuscript_R11_multiomics_v1.docx"
LOG = Path("D:/claude-code-haha/scripts/_r11_multiomics_log.txt")

shutil.copy(str(SRC), str(DST))
log = [f"[copied] R10 -> {DST.name}"]

d = Document(str(DST))
paras = d.paragraphs

EDITS = [
    # AC1: "virtual cell" → "multi-omics integration" (7 instances)
    (0,
     "Virtual Cell Integration",
     "Multi-Omics Integration"),
    (5,
     "This virtual cell framework demonstrates",
     "This multi-omics integration framework demonstrates"),
    (20,
     "2.2 Virtual Cell Atlas (Figure 1)",
     "2.2 Multi-Omics Integration Atlas (Figure 1)"),
    (39,
     "3.1 Virtual Cell Atlas: O-GlcNAc and Ferroptosis Pathways Are Broadly Distributed Across Renal Cell Types (Figure 1)",
     "3.1 Multi-Omics Integration Atlas: O-GlcNAc and Ferroptosis Pathways Are Broadly Distributed Across Renal Cell Types (Figure 1)"),
    (42,
     "Virtual cell atlas of",
     "Multi-omics integration atlas of"),
    (94,
     "predictions of the virtual cell framework",
     "predictions of the multi-omics integration framework"),
    (102,
     "The seven-step virtual cell framework",
     "The seven-step multi-omics integration framework"),

    # AC2: three-dataset control terminology note (append to [19])
    (19,
     "All datasets are publicly accessible and were analyzed using their published preprocessing pipelines.",
     "All datasets are publicly accessible and were analyzed using their published preprocessing pipelines. Of note, the three datasets employ different control-group terminology reflecting their distinct experimental designs: GSE139107 uses \u2018Control\u2019 (time-matched untreated kidney samples), GSE274819 uses \u2018Sham\u2019 (surgery without ischemia), and GSE98622 includes both sham-operated and untouched-normal (NORM) control groups sampled at ages spanning 4 h to 15 mo."),

    # AC3: cite Figure S1 in SPP1 external validation paragraph
    (73,
     "corroborating the single-cell findings in a fully independent cohort and experimental platform.",
     "corroborating the single-cell findings in a fully independent cohort and experimental platform (Supplementary Figure S1)."),
]

for idx, old, new in EDITS:
    p = paras[idx]
    assert len(p.runs) == 1, f"para {idx} not single-run (got {len(p.runs)})"
    r = p.runs[0]
    cnt = r.text.count(old)
    assert cnt == 1, f"para {idx}: old count={cnt} (expected 1)"
    r.text = r.text.replace(old, new, 1)
    log.append(f"[edit] para {idx} done")

d.save(str(DST))
log.append("[saved]")

# ---- audit ----
log.append("\n==== AUDIT ====")
d2 = Document(str(DST)); p2 = d2.paragraphs
orig = Document(str(SRC)).paragraphs
log.append(f"R10 paras {len(orig)}  R11 paras {len(p2)}  equal={len(orig)==len(p2)}")

changed = [i for i in range(len(orig)) if orig[i].text != p2[i].text]
log.append(f"changed paras: {changed}  (expected [0,5,19,20,39,42,73,94,102])")

full_text = "\n".join(x.text for x in p2)

# AC1 guards: zero "virtual cell" (case-insensitive)
vc_count = sum(1 for x in p2 if "virtual cell" in x.text.lower())
log.append(f"\nAC1: 'virtual cell' residual count = {vc_count} (want 0) {'OK' if vc_count==0 else 'FAIL'}")

# AC2 guards
for term in ["GSE139107", "GSE274819", "GSE98622", "Control", "Sham", "NORM"]:
    present = term in full_text
    log.append(f"AC2: '{term}' in text = {present} {'OK' if present else 'FAIL'}")

# AC3 guard
import os
s1_cited = "Supplementary Figure S1" in full_text
s1_files_exist = any(
    os.path.exists(str(P / d / f"FigS1_SPP1_validation_v1.{ext}"))
    for d in ["manuscript", "交付最终版/supplementary", "交付最终版/figures"]
    for ext in ["pdf", "png"]
)
log.append(f"AC3: S1 cited={s1_cited} files_exist={s1_files_exist} {'OK' if s1_cited else 'FAIL'}")

# citation integrity unchanged
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

for i in changed:
    log.append(f"  [{i}] {p2[i].text[:260]}")

LOG.write_text("\n".join(log), encoding="utf-8")
print("done. changed:", changed)
