# -*- coding: utf-8 -*-
"""Recon R6 legends + image assets before inserting FigS4b. Read-only.
Run: py -X utf8 this.py"""
import re
from pathlib import Path
from docx import Document

P = Path("D:/\u80be\u810f\u865a\u62df\u7ec6\u80de\u6587\u7ae0\u8bbe\u8ba1")
R6 = P / "manuscript" / "manuscript_R6_Rpipeline.docx"
OUT = Path("D:/claude-code-haha/scripts/_recon.txt")
log = []
def w(s=""): log.append(str(s))

# ---- A) image assets in project ----
w("==== IMAGE ASSETS (png/pdf/tif) by folder ====")
exts = {".png", ".pdf", ".tif", ".tiff", ".jpg"}
byfolder = {}
for f in P.rglob("*"):
    if f.is_file() and f.suffix.lower() in exts:
        # skip backup/process dirs to reduce noise
        rel = f.relative_to(P)
        top = rel.parts[0]
        if top in ("\u8fc7\u7a0b\u6587\u4ef6",):  # 过程文件
            continue
        byfolder.setdefault(str(f.parent.relative_to(P)), []).append(f.name)
for folder in sorted(byfolder):
    names = sorted(byfolder[folder])
    w(f"-- {folder} ({len(names)}) --")
    for n in names:
        w(f"   {n}")
w("")

# ---- B) R6 full paragraph dump with style + index ----
w("==== R6 ALL PARAGRAPHS (idx | style | text) ====")
d = Document(str(R6))
for i, p in enumerate(d.paragraphs):
    t = p.text.strip()
    if not t:
        continue
    st = p.style.name if p.style else "?"
    w(f"[{i:>3}] <{st}> {t[:160]}")

OUT.write_text("\n".join(log), encoding="utf-8")
print("OK lines=", len(log))
