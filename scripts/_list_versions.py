# -*- coding: utf-8 -*-
"""List all manuscript docx/txt by mtime. Run: py -X utf8 this.py"""
import datetime
from pathlib import Path

P = Path("D:/\u80be\u810f\u865a\u62df\u7ec6\u80de\u6587\u7ae0\u8bbe\u8ba1")
OUT = P / "_versions.txt"
log = []

def w(s=""):
    log.append(str(s))

w(f"target_dir_exists: {P.exists()}")
for ext in ("*.docx", "*.txt"):
    w(f"==== {ext} (newest first) ====")
    files = sorted(P.glob(ext), key=lambda x: x.stat().st_mtime, reverse=True)
    for f in files:
        ts = datetime.datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        w(f"{ts}  {f.stat().st_size:>9}  {f.name}")
    w("")

OUT.write_text("\n".join(log), encoding="utf-8")
print("OK ->", OUT)
