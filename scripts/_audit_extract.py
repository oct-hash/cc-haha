# -*- coding: utf-8 -*-
"""Extract audit materials: full R7 text, citation markers, references, data JSONs.
Read-only. Run: py -X utf8 this.py"""
import json
import re
from pathlib import Path
from docx import Document

P = Path("D:/\u80be\u810f\u865a\u62df\u7ec6\u80de\u6587\u7ae0\u8bbe\u8ba1")
R7 = P / "manuscript" / "manuscript_R7_S4bref_v1.docx"
OUTDIR = Path("D:/claude-code-haha/scripts")

# ---- A) full text ----
d = Document(str(R7))
paras = [p.text for p in d.paragraphs]
full = "\n".join(f"[{i}] {t}" for i, t in enumerate(paras) if t.strip())
(OUTDIR / "_audit_fulltext.txt").write_text(full, encoding="utf-8")

# ---- B) citation markers [n] and [n-m] and [n,m] ----
log = []
def w(s=""): log.append(str(s))

# body = paragraphs before "References" header
ref_idx = next((i for i, t in enumerate(paras) if t.strip() == "References"), len(paras))
body = paras[:ref_idx]
refs = paras[ref_idx:]

# collect all bracket citations in body
cite_re = re.compile(r"\[(\d+(?:[-\u2013,\s]+\d+)*)\]")
used = set()
w("==== BODY citation markers (paragraph: raw) ====")
for i, t in enumerate(body):
    ms = cite_re.findall(t)
    if ms:
        w(f"[{i}] {ms}")
        for m in ms:
            # expand ranges and lists
            parts = re.split(r"[,\s]+", m)
            for part in parts:
                if "\u2013" in part or "-" in part:
                    a, b = re.split(r"[-\u2013]", part)
                    for n in range(int(a), int(b) + 1):
                        used.add(n)
                elif part.isdigit():
                    used.add(int(part))
w("")
w(f"distinct cited ref numbers in body: {sorted(used)}")
w(f"count: {len(used)}  min={min(used) if used else 'NA'} max={max(used) if used else 'NA'}")

# ---- C) references list numbers ----
w("")
w("==== REFERENCES entries (leading number) ====")
ref_nums = []
ref_re = re.compile(r"^(\d+)\.\s")
for t in refs:
    mm = ref_re.match(t.strip())
    if mm:
        n = int(mm.group(1))
        ref_nums.append(n)
        w(f"{n}: {t.strip()[:90]}")
w("")
w(f"reference numbers present: {ref_nums}")
w(f"count: {len(ref_nums)}")
# continuity / dup check
if ref_nums:
    dups = [n for n in set(ref_nums) if ref_nums.count(n) > 1]
    gaps = [n for n in range(min(ref_nums), max(ref_nums) + 1) if n not in ref_nums]
    w(f"duplicates: {dups}")
    w(f"gaps (missing numbers): {gaps}")
# cross: cited but not in refs / in refs but never cited
missing_in_refs = sorted(used - set(ref_nums))
never_cited = sorted(set(ref_nums) - used)
w(f"cited-but-absent-in-References: {missing_in_refs}")
w(f"in-References-but-never-cited: {never_cited}")

(OUTDIR / "_audit_citations.txt").write_text("\n".join(log), encoding="utf-8")

# ---- D) data JSONs key values ----
qc = P / "results" / "qc"
dlog = []
def dw(s=""): dlog.append(str(s))
for name in ["gse269622_moran_spdep_R_v1.json", "gse269622_spatial_R_v1.json",
             "gse98622_bulk_R_v1.json", "gse274819_keygene_R_v1.json"]:
    fp = qc / name
    dw("=" * 60)
    dw(name + f"  exists={fp.exists()}")
    if fp.exists():
        try:
            obj = json.loads(fp.read_text(encoding="utf-8"))
            dw(json.dumps(obj, ensure_ascii=False, indent=1)[:4000])
        except Exception as e:
            dw(f"parse error: {e!r}")
    dw("")
(OUTDIR / "_audit_data.txt").write_text("\n".join(dlog), encoding="utf-8")

print("OK  body_paras=", len(body), " refs=", len(ref_nums), " cited=", len(used))
