# -*- coding: utf-8 -*-
"""Reconcile [24] cell counts and [49] Ogt/Gclc pooled numbers with R pooled JSON.
Copies R7 -> R8, surgical in-run replacements (single-run paras, TNR preserved).
Run: py -X utf8 this.py"""
import shutil
from pathlib import Path
from docx import Document

P = Path("D:/\u80be\u810f\u865a\u62df\u7ec6\u80de\u6587\u7ae0\u8bbe\u8ba1")
SRC = P / "manuscript" / "manuscript_R7_S4bref_v1.docx"
DST = P / "manuscript" / "manuscript_R8_scRNApooled_v1.docx"
LOG = Path("D:/claude-code-haha/scripts/_r8_reconcile_log.txt")

shutil.copy(str(SRC), str(DST))
log = [f"[copied] R7 -> {DST.name}"]

d = Document(str(DST))
paras = d.paragraphs

# (para_index, old, new) — piecewise, avoiding en-dash spans
EDITS = [
    (24, "13,433 cells", "10,371 cells"),
    (24, "38,875 cells", "34,088 cells"),
    (49, "increased 60%", "increased 53%"),
    (49, "0.40 to 0.64", "0.25 to 0.38"),
    (49, "Gclc increased 41% (from 1.04 to 1.47)", "Gclc increased 45% (from 0.47 to 0.68)"),
    (49, "98% detection", "99.9% detection"),
]

for idx, old, new in EDITS:
    p = paras[idx]
    assert len(p.runs) == 1, f"para {idx} not single-run ({len(p.runs)} runs)"
    r = p.runs[0]
    cnt = r.text.count(old)
    assert cnt == 1, f"para {idx}: old {old!r} count={cnt} (expected 1)"
    r.text = r.text.replace(old, new)
    log.append(f"[edit] para {idx}: {old!r} -> {new!r}")

d.save(str(DST))
log.append("[saved]")

# ---- audit ----
log.append("\n==== AUDIT ====")
d2 = Document(str(DST))
p2 = d2.paragraphs
orig = Document(str(SRC)).paragraphs
log.append(f"R7 paras: {len(orig)}  R8 paras: {len(p2)}  (should be equal)")

# new strings present, old absent
checks = {
    "10,371 cells": True, "34,088 cells": True,
    "13,433 cells": False, "38,875 cells": False,
    "increased 53%": True, "0.25 to 0.38": True,
    "increased 60%": False, "0.40 to 0.64": False,
    "Gclc increased 45% (from 0.47 to 0.68)": True,
    "Gclc increased 41% (from 1.04 to 1.47)": False,
    "99.9% detection": True, "98% detection": False,
}
full = "\n".join(x.text for x in p2)
for s, want in checks.items():
    got = s in full
    log.append(f"  {'OK ' if got==want else 'FAIL'} present={got} want={want}  {s!r}")

# which paragraphs changed vs R7
changed = [i for i in range(len(orig)) if orig[i].text != p2[i].text]
log.append(f"changed paragraphs: {changed}  (should be [24, 49])")
for i in changed:
    log.append(f"  [{i}] {p2[i].text[:200]}")

LOG.write_text("\n".join(log), encoding="utf-8")
print("done. changed:", changed)
