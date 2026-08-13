# -*- coding: utf-8 -*-
"""R8 -> R9: place 7 orphan refs at matched anchors + fix [19] GSE274819 timepoint error.
Single-run paras, in-run replacement (TNR preserved). Versioned, no overwrite.
Run: py -X utf8 this.py"""
import shutil
from pathlib import Path
from docx import Document

P = Path("D:/\u80be\u810f\u865a\u62df\u7ec6\u80de\u6587\u7ae0\u8bbe\u8ba1")
SRC = P / "manuscript" / "manuscript_R8_scRNApooled_v1.docx"
DST = P / "manuscript" / "manuscript_R9_refs_v1.docx"
LOG = Path("D:/claude-code-haha/scripts/_r9_refs_log.txt")

shutil.copy(str(SRC), str(DST))
log = [f"[copied] R8 -> {DST.name}"]

d = Document(str(DST))
paras = d.paragraphs

EDITS = [
    # orphan refs 29,34 -> intro kidney sc atlas + immune activation
    (10, "immune cell activation patterns [6-8].",
         "immune cell activation patterns [6-8,29,34]."),
    # orphan refs 24,33 -> ferroptosis-in-kidney mechanism
    (12, "confirmed in murine models [15-21].",
         "confirmed in murine models [15-21,24,33]."),
    # [19] fix: 3 timepoints (not 4; no 5d), contradicts [92]
    (19, "four reperfusion timepoints pooled: 4 h, 12 h, 1 d, and 5 d",
         "three reperfusion timepoints pooled: 4 h, 12 h, and 1 d"),
    # [19] label raw counts as pre-QC (post-QC 10,371/34,088 reported in [24])
    (19, "encompassing 13,433 Sham cells and 38,875 early I/R cells",
         "encompassing 13,433 Sham cells and 38,875 early I/R cells prior to quality control"),
    # orphan refs 27,28 -> snRNA vs scRNA transcript depletion
    (49, "in single-nucleus versus single-cell libraries",
         "in single-nucleus versus single-cell libraries [27,28]"),
    # orphan ref 40 -> filtered iron in postischemic kidney
    (82, "high concentrations of filtered iron, making",
         "high concentrations of filtered iron [40], making"),
]

for idx, old, new in EDITS:
    p = paras[idx]
    assert len(p.runs) == 1, f"para {idx} not single-run ({len(p.runs)} runs)"
    r = p.runs[0]
    cnt = r.text.count(old)
    assert cnt == 1, f"para {idx}: old {old!r} count={cnt} (expected 1)"
    r.text = r.text.replace(old, new)
    log.append(f"[edit] para {idx}: {old[:55]!r} -> {new[:60]!r}")

d.save(str(DST))
log.append("[saved]")

# ---- audit: recount citations end-to-end ----
import re
log.append("\n==== AUDIT ====")
d2 = Document(str(DST))
p2 = d2.paragraphs
orig = Document(str(SRC)).paragraphs
log.append(f"R8 paras: {len(orig)}  R9 paras: {len(p2)}  (equal={len(orig)==len(p2)})")
changed = [i for i in range(len(orig)) if orig[i].text != p2[i].text]
log.append(f"changed paras: {changed}  (expected [10,12,19,49,82])")

# recompute cited-but-never and orphan sets
ref_idx = next((i for i,t in enumerate(p2) if t.text.strip()=="References"), len(p2))
body = [x.text for x in p2[:ref_idx]]
refs = [x.text for x in p2[ref_idx:]]
cite_re = re.compile(r"\[(\d+(?:[-\u2013,\s]+\d+)*)\]")
used=set()
for t in body:
    for m in cite_re.findall(t):
        for part in re.split(r"[,\s]+", m):
            if "\u2013" in part or "-" in part:
                a,b=re.split(r"[-\u2013]",part); used.update(range(int(a),int(b)+1))
            elif part.isdigit(): used.add(int(part))
ref_re=re.compile(r"^(\d+)\.\s")
refnums=[int(ref_re.match(t.strip()).group(1)) for t in refs if ref_re.match(t.strip())]
orphans=sorted(set(refnums)-used)
missing=sorted(used-set(refnums))
log.append(f"total refs: {len(refnums)}  distinct cited: {len(used)}")
log.append(f"orphan (in refs, never cited): {orphans}")
log.append(f"cited-but-absent-in-refs: {missing}")
for i in changed:
    log.append(f"  [{i}] {p2[i].text[:230]}")

LOG.write_text("\n".join(log), encoding="utf-8")
print("done. changed:", changed, "orphans_left:", orphans, "missing:", missing)
