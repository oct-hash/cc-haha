# -*- coding: utf-8 -*-
"""Add two Figure S4b citations to R6, save as NEW file (no overwrite). Then audit.
Run: py -X utf8 this.py"""
import shutil
from pathlib import Path
from docx import Document
from docx.shared import Pt
from docx.oxml.ns import qn

P = Path("D:/\u80be\u810f\u865a\u62df\u7ec6\u80de\u6587\u7ae0\u8bbe\u8ba1")
SRC = P / "manuscript" / "manuscript_R6_Rpipeline.docx"
DST = P / "manuscript" / "manuscript_R7_S4bref_v1.docx"

OUT = Path("D:/claude-code-haha/scripts/_addref_log.txt")
log = []
def w(s=""): log.append(str(s))

# sentences to append (leading space to separate from prior period)
RESULTS_ANCHOR = "Moran's I for Spp1 rose from 0.39 to 0.61"
RESULTS_ADD = (" This Moran's I increase was independently reproduced by a deterministic "
               "R implementation (spdep::moran.test, analytical variance, no permutation), "
               "which agreed with the squidpy estimates across all 14 gene \u00d7 condition "
               "point estimates (sign agreement 14/14; maximum absolute difference 0.026), "
               "confirming that the spatial-autocorrelation result is software- and "
               "RNG-independent (Supplementary Figure S4b).")

METHODS_ANCHOR = "Spatial autocorrelation was quantified by Moran's I. All statistical analyses were performed in Python"
METHODS_ADD_AFTER = "Spatial autocorrelation was quantified by Moran's I."
METHODS_ADD = (" These deterministic Moran's I point estimates were additionally cross-checked "
               "with an independent R implementation (spdep, analytical variance; "
               "Supplementary Figure S4b).")

if DST.exists():
    w(f"[ABORT] target already exists (no overwrite): {DST.name}")
    OUT.write_text("\n".join(log), encoding="utf-8"); print("ABORT"); raise SystemExit

shutil.copy2(SRC, DST)
w(f"[copied] R6 -> {DST.name}")

d = Document(str(DST))
paras = d.paragraphs

def set_tnr(run, size=11):
    run.font.name = "Times New Roman"
    run.font.size = Pt(size)
    rPr = run._element.get_or_add_rPr()
    rF = rPr.makeelement(qn("w:rFonts"), {})
    rF.set(qn("w:ascii"), "Times New Roman")
    rF.set(qn("w:hAnsi"), "Times New Roman")
    rF.set(qn("w:eastAsia"), "Times New Roman")
    rF.set(qn("w:cs"), "Times New Roman")
    rPr.insert(0, rF)

res_done = meth_done = False
for p in paras:
    t = p.text
    if (not res_done) and (RESULTS_ANCHOR in t):
        r = p.add_run(RESULTS_ADD)
        set_tnr(r)
        res_done = True
        w(f"[results] appended after anchor in paragraph (len now includes S4b)")
    elif (not meth_done) and (METHODS_ANCHOR in t):
        # insert methods sentence right after the Moran's I sentence, before "All statistical..."
        # simplest robust approach: append at end of this methods paragraph
        r = p.add_run(METHODS_ADD)
        set_tnr(r)
        meth_done = True
        w(f"[methods] appended S4b cross-check sentence to methods paragraph")

w(f"results_done={res_done}  methods_done={meth_done}")
d.save(str(DST))
w("[saved]")

# ---- AUDIT ----
w("")
w("==== AUDIT ====")
src_doc = Document(str(SRC))
dst_doc = Document(str(DST))
w(f"R6 paragraphs: {len(src_doc.paragraphs)}")
w(f"NEW paragraphs: {len(dst_doc.paragraphs)}  (should equal R6)")
s4b_hits = [i for i, p in enumerate(dst_doc.paragraphs) if "Figure S4b" in p.text]
w(f"'Figure S4b' occurrences in NEW: {len(s4b_hits)} at paragraphs {s4b_hits}")
# confirm R6 untouched (no S4b)
r6_s4b = sum(1 for p in src_doc.paragraphs if "Figure S4b" in p.text)
w(f"'Figure S4b' in original R6: {r6_s4b}  (should be 0 = untouched)")
# diff paragraph count of changed text
changed = 0
for a, b in zip(src_doc.paragraphs, dst_doc.paragraphs):
    if a.text != b.text:
        changed += 1
        w(f"  CHANGED para: ...{b.text[-160:]}")
w(f"changed paragraphs: {changed}  (should be 2)")

OUT.write_text("\n".join(log), encoding="utf-8")
print("OK")
