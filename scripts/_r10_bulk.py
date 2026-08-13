# -*- coding: utf-8 -*-
"""R9 -> R10: rewrite GSE98622 description [19][24] + bulk validation [49] to the
correct IRI time course (full 49 samples, 05b). NORM baseline. Versioned, no overwrite.
Run: py -X utf8 this.py"""
import shutil, re
from pathlib import Path
from docx import Document

P = Path("D:/\u80be\u810f\u865a\u62df\u7ec6\u80de\u6587\u7ae0\u8bbe\u8ba1")
SRC = P / "manuscript" / "manuscript_R9_refs_v1.docx"
DST = P / "manuscript" / "manuscript_R10_bulkIRI_v1.docx"
LOG = Path("D:/claude-code-haha/scripts/_r10_bulk_log.txt")

shutil.copy(str(SRC), str(DST))
log = [f"[copied] R9 -> {DST.name}"]

d = Document(str(DST))
paras = d.paragraphs

EDITS = [
    (19,
     "GSE98622 provides bulk RNA-seq of 49 mouse kidney samples across Sham (n=12), 2 h (n=5), 2 d (n=5), 2 wk (n=5), 4 wk (n=7), and 6 wk (n=5) reperfusion timepoints, plus contralateral controls (n=10).",
     "GSE98622 provides bulk RNA-seq of 49 mouse kidney samples: an ischemia-reperfusion injury time course (IRI at 2 h, 4 h, 24 h, 48 h, 72 h, 7 d, 14 d, 28 d, and 12 mo post-reperfusion) together with sham-operated and untouched-normal control kidneys sampled from 4 h to 15 mo, with three to four biological replicates per group."),
    (24,
     "GSE98622 bulk RNA-seq (49 samples across six reperfusion durations)",
     "GSE98622 bulk RNA-seq (49 samples spanning an ischemia-reperfusion injury time course from 2 h to 12 mo plus sham and normal controls)"),
    (49,
     "The GSE98622 bulk RNA-seq provided orthogonal validation: Hmox1 showed acute upregulation at SHAM_4h (mean=157) followed by rapid decline (SHAM_24h=20, NORM_3m=30), while Ogt showed peak expression at SHAM_24h (mean=57, 4.6-fold vs SHAM_4h=12). Slc7a11 was undetectable across all three platforms.",
     "The GSE98622 bulk RNA-seq provided orthogonal in vivo validation across the injury time course: Hmox1 was induced approximately 4.7-fold over normal baseline (from a baseline mean of 42 to 198 at 24 h post-reperfusion) before resolving toward baseline by 28 d (31); Fth1 rose approximately 2.1-fold to peak at 24 h (14,048 versus a baseline of 6,688), mirroring the single-cell iron-sequestration response; and Ogt showed a modest approximately 2-fold acute induction, also peaking at 24 h (42 versus a baseline of 21). Slc7a11 remained undetectable across all three platforms."),
]

for idx, old, new in EDITS:
    p = paras[idx]
    assert len(p.runs) == 1, f"para {idx} not single-run"
    r = p.runs[0]
    cnt = r.text.count(old)
    assert cnt == 1, f"para {idx}: old count={cnt} (expected 1)"
    r.text = r.text.replace(old, new)
    log.append(f"[edit] para {idx} done")

d.save(str(DST))
log.append("[saved]")

# ---- audit ----
log.append("\n==== AUDIT ====")
d2 = Document(str(DST)); p2 = d2.paragraphs
orig = Document(str(SRC)).paragraphs
log.append(f"R9 paras {len(orig)}  R10 paras {len(p2)}  equal={len(orig)==len(p2)}")
changed = [i for i in range(len(orig)) if orig[i].text != p2[i].text]
log.append(f"changed paras: {changed}  (expected [19,24,49])")

full = "\n".join(x.text for x in p2)
# guard: no stray wrong-SHAM injury framing left anywhere
guards = {
    "SHAM_4h (mean=157)": False, "peak expression at SHAM_24h": False,
    "SHAM_24h=20": False, "4.6-fold vs SHAM_4h=12": False,
    "49 samples across six reperfusion durations": False,
    "Sham (n=12), 2 h (n=5)": False,
    # new content present
    "peaking at 24 h (42": True, "to 198 at 24 h": True,
    "14,048 versus a baseline of 6,688": True,
    "injury time course (IRI at 2 h, 4 h, 24 h": True,
}
for s, want in guards.items():
    got = s in full
    log.append(f"  {'OK ' if got==want else 'FAIL'} present={got} want={want}  {s!r}")

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
