# -*- coding: utf-8 -*-
"""Copy FigS4b png/pdf into 交付最终版/supplementary/. No overwrite. Run: py -X utf8 this.py"""
import shutil
from pathlib import Path

P = Path("D:/\u80be\u810f\u865a\u62df\u7ec6\u80de\u6587\u7ae0\u8bbe\u8ba1")
SRC_DIR = P / "manuscript"
DST_DIR = P / "\u4ea4\u4ed8\u6700\u7ec8\u7248" / "supplementary"
NAMES = [
    "FigS4b_moran_spdep_crosscheck_v1.png",
    "FigS4b_moran_spdep_crosscheck_v1.pdf",
]

OUT = Path("D:/claude-code-haha/scripts/_copy_figs4b.txt")
log = []
def w(s=""): log.append(str(s))

w(f"SRC_DIR exists: {SRC_DIR.exists()}")
w(f"DST_DIR exists: {DST_DIR.exists()}")
w("")

for name in NAMES:
    src = SRC_DIR / name
    dst = DST_DIR / name
    if not src.exists():
        w(f"[SKIP] source missing: {name}")
        continue
    if dst.exists():
        w(f"[SKIP] target already exists (NO overwrite): {name}  size={dst.stat().st_size}")
        continue
    shutil.copy2(src, dst)  # preserves mtime
    w(f"[COPIED] {name}  {src.stat().st_size} bytes -> {dst}")

w("")
w("==== 交付最终版/supplementary/ AFTER ====")
for f in sorted(DST_DIR.iterdir()):
    if f.is_file():
        w(f"   {f.name}   size={f.stat().st_size}")

OUT.write_text("\n".join(log), encoding="utf-8")
print("OK")
