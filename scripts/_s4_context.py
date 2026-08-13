# -*- coding: utf-8 -*-
"""Extract full R6 paragraphs mentioning S4/squidpy/Moran/Visium/spatial. Read-only.
Run: py -X utf8 this.py"""
import re
from pathlib import Path
from docx import Document

P = Path("D:/\u80be\u810f\u865a\u62df\u7ec6\u80de\u6587\u7ae0\u8bbe\u8ba1")
R6 = P / "manuscript" / "manuscript_R6_Rpipeline.docx"
OUT = Path("D:/claude-code-haha/scripts/_s4_context.txt")
log = []
def w(s=""): log.append(str(s))

d = Document(str(R6))
paras = d.paragraphs
pat = re.compile(r"(Figure S4|Fig\.? S4|FigS4|squidpy|Moran|spatial autocorrel|Visium|spatial co-?local|co-localiz|GSE269622|spdep)", re.I)
for i, p in enumerate(paras):
    t = p.text.strip()
    if pat.search(t):
        w(f"---- [{i}] (style={p.style.name}) ----")
        w(t)
        w("")

OUT.write_text("\n".join(log), encoding="utf-8")
print("OK lines=", len(log))
