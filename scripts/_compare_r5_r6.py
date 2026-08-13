# -*- coding: utf-8 -*-
"""Compare R6 (text) and R5 (with images) structure. Run: py -X utf8 this.py"""
import re
from pathlib import Path
from docx import Document

P = Path("D:/\u80be\u810f\u865a\u62df\u7ec6\u80de\u6587\u7ae0\u8bbe\u8ba1")
OUT = Path("D:/claude-code-haha/scripts/_compare_r5_r6.txt")
targets = {
    "R6_Rpipeline (manuscript/)": P / "manuscript" / "manuscript_R6_Rpipeline.docx",
    "R5 (交付最终版/)": P / "\u4ea4\u4ed8\u6700\u7ec8\u7248" / "manuscript_R5.docx",
}
log = []
def w(s=""): log.append(str(s))

pat = re.compile(r"(Figure S?\d|Fig\.? S?\d|FigS\d|Moran|spdep|FIGURE LEGEND|Supplementary Fig)", re.I)

for label, f in targets.items():
    w("=" * 70)
    w(f"{label}")
    w(f"path exists: {f.exists()}")
    if not f.exists():
        w("")
        continue
    d = Document(str(f))
    paras = d.paragraphs
    w(f"total_paragraphs: {len(paras)}")
    media = [str(pp.partname) for pp in d.part.package.iter_parts()
             if "/media/" in str(getattr(pp, "partname", ""))]
    w(f"embedded_images: {len(media)}")
    # figure-legend headers + any S4/Moran mentions
    w("-- matches Figure/Moran/spdep/legend --")
    hits = 0
    for i, p in enumerate(paras):
        t = p.text.strip()
        if pat.search(t):
            w(f"  [{i}] {t[:110]}")
            hits += 1
            if hits >= 40:
                w("  ...(truncated)")
                break
    w("")

OUT.write_text("\n".join(log), encoding="utf-8")
print("OK")
