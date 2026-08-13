# -*- coding: utf-8 -*-
"""Find R7 docx and inspect its structure. Run: py -X utf8 this.py"""
import datetime
import re
from pathlib import Path
from docx import Document

P = Path("D:/\u80be\u810f\u865a\u62df\u7ec6\u80de\u6587\u7ae0\u8bbe\u8ba1")
OUT = Path("D:/claude-code-haha/scripts/_r7_report.txt")
log = []
def w(s=""): log.append(str(s))

# 1) locate all docx
docs = sorted(P.rglob("*.docx"), key=lambda x: x.stat().st_mtime, reverse=True)
w(f"==== ALL DOCX ({len(docs)}) newest first ====")
r7 = None
for f in docs:
    ts = datetime.datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
    rel = f.relative_to(P)
    w(f"{ts}  {f.stat().st_size:>9}  {rel}")
    if r7 is None and "R7_final_clean" in f.name:
        r7 = f

w("")
if r7 is None:
    w("R7_final_clean NOT FOUND")
    OUT.write_text("\n".join(log), encoding="utf-8")
    print("OK-noR7")
    raise SystemExit

w(f"==== INSPECT: {r7.relative_to(P)} ====")
d = Document(str(r7))
paras = d.paragraphs
w(f"total_paragraphs: {len(paras)}")

media = [str(pp.partname) for pp in d.part.package.iter_parts()
         if "/media/" in str(getattr(pp, "partname", ""))]
w(f"embedded_images: {len(media)}")
for m in media:
    w(f"  {m}")

w("")
w("==== HEADINGS (style != Normal, non-empty) ====")
for i, p in enumerate(paras):
    st = p.style.name if p.style else "?"
    t = p.text.strip()
    if st != "Normal" and t:
        w(f"[{i}] <{st}> {t[:90]}")

w("")
w("==== matches: Figure/Moran/spdep/legend ====")
pat = re.compile(r"(Figure S?\d|Fig\.? S?\d|FigS\d|Moran|spdep|FIGURE LEGEND|Supplementary Fig|figure legend)", re.I)
for i, p in enumerate(paras):
    t = p.text.strip()
    if pat.search(t):
        w(f"[{i}] {t[:150]}")

w("")
w("==== LAST 35 non-empty paragraphs ====")
cnt = 0
for i in range(len(paras) - 1, -1, -1):
    t = paras[i].text.strip()
    if t:
        st = paras[i].style.name if paras[i].style else "?"
        w(f"[{i}] <{st}> {t[:120]}")
        cnt += 1
        if cnt >= 35:
            break

OUT.write_text("\n".join(log), encoding="utf-8")
print("OK")
