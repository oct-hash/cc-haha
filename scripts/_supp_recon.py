# -*- coding: utf-8 -*-
"""Read-only recon of supplementary figure sets + legend text. Run: py -X utf8 this.py"""
import datetime
from pathlib import Path

P = Path("D:/\u80be\u810f\u865a\u62df\u7ec6\u80de\u6587\u7ae0\u8bbe\u8ba1")
OUT = Path("D:/claude-code-haha/scripts/_supp_recon.txt")
log = []
def w(s=""): log.append(str(s))

def ts(p):
    st = p.stat()
    m = datetime.datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M")
    c = datetime.datetime.fromtimestamp(st.st_ctime).strftime("%Y-%m-%d %H:%M")
    return f"mtime={m} ctime={c} size={st.st_size}"

# 1) supplementary-related dirs
w("==== supplementary dirs (mtime/ctime/size) ====")
supp_dirs = [
    P / "supplementary",
    P / "supplementary" / "figures",
    P / "\u4ea4\u4ed8\u6700\u7ec8\u7248" / "supplementary",
    P / "\u4ea4\u4ed8\u6700\u7ec8\u7248" / "figures",
    P / "manuscript",
]
for dd in supp_dirs:
    w(f"-- {dd.relative_to(P) if dd.exists() else dd.name} : exists={dd.exists()} --")
    if dd.exists():
        w(f"   [DIR] {ts(dd)}")
        for f in sorted(dd.iterdir()):
            if f.is_file():
                w(f"   {f.name}   {ts(f)}")
    w("")

# 2) find any text/docx that likely holds figure legends (S1..S4)
w("==== candidate legend text files (search *legend*, *supp*, *.txt/.md under non-process dirs) ====")
for f in P.rglob("*"):
    if not f.is_file():
        continue
    if "\u8fc7\u7a0b\u6587\u4ef6" in str(f):  # skip 过程文件
        continue
    name = f.name.lower()
    if f.suffix.lower() in (".txt", ".md") and ("legend" in name or "supp" in name or "figure" in name or "fig" in name):
        w(f"   {f.relative_to(P)}   {ts(f)}")

OUT.write_text("\n".join(log), encoding="utf-8")
print("OK lines=", len(log))
