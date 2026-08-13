# -*- coding: utf-8 -*-
"""Check (1) which figures have R (Rv1) versions, (2) R5 vs R6 text diff.
Read-only. Run: py -X utf8 this.py"""
import difflib
from pathlib import Path

P = Path("D:/\u80be\u810f\u865a\u62df\u7ec6\u80de\u6587\u7ae0\u8bbe\u8ba1")
OUT = Path("D:/claude-code-haha/scripts/_update_check.txt")
log = []
def w(s=""): log.append(str(s))

# ---- 1) figure update matrix ----
figs = P / "figures"
allpng = sorted([f.name for f in figs.glob("*.png")]) if figs.exists() else []
w("==== figures/*.png ====")
for n in allpng:
    tag = "  <-- Rv1 (R更新)" if "Rv1" in n else ""
    w(f"   {n}{tag}")
w("")
w("Rv1(R更新)的图:")
for n in allpng:
    if "Rv1" in n:
        w(f"   {n}")
w("")

# ---- 2) R5 vs R6 extracted text diff ----
r5 = P / "manuscript" / "_R5_extracted.txt"
r6 = P / "manuscript" / "_R6_Rpipeline_extracted.txt"
w(f"==== R5 vs R6 text diff (exists R5={r5.exists()} R6={r6.exists()}) ====")
if r5.exists() and r6.exists():
    a = r5.read_text(encoding="utf-8", errors="replace").splitlines()
    b = r6.read_text(encoding="utf-8", errors="replace").splitlines()
    w(f"R5 lines={len(a)}  R6 lines={len(b)}")
    w("")
    sm = difflib.unified_diff(a, b, lineterm="", n=0)
    cnt = 0
    for line in sm:
        if line.startswith("+++") or line.startswith("---") or line.startswith("@@"):
            w(line)
        elif line.startswith("+") or line.startswith("-"):
            w(line[:200])
            cnt += 1
    w("")
    w(f"changed lines total: {cnt}")

OUT.write_text("\n".join(log), encoding="utf-8")
print("OK lines=", len(log))
