# -*- coding: utf-8 -*-
"""R9 comprehensive re-audit: extract text+citations, cross-check numbers vs JSONs,
list figure files, check GSE98622 label consistency. Read-only.
Run: py -X utf8 this.py"""
import json, re
from pathlib import Path
from docx import Document

P = Path("D:/\u80be\u810f\u865a\u62df\u7ec6\u80de\u6587\u7ae0\u8bbe\u8ba1")
R9 = P / "manuscript" / "manuscript_R9_refs_v1.docx"
OUT = Path("D:/claude-code-haha/scripts/_audit_r9.txt")
log = []
def w(s=""): log.append(str(s))

d = Document(str(R9))
paras = [p.text for p in d.paragraphs]

# ---- citation integrity ----
ref_idx = next((i for i,t in enumerate(paras) if t.strip()=="References"), len(paras))
body, refs = paras[:ref_idx], paras[ref_idx:]
cite_re = re.compile(r"\[(\d+(?:[-\u2013,\s]+\d+)*)\]")
used=set()
for t in body:
    for m in cite_re.findall(t):
        for part in re.split(r"[,\s]+", m):
            if "\u2013" in part or "-" in part:
                a,b=re.split(r"[-\u2013]",part); used.update(range(int(a),int(b)+1))
            elif part.isdigit(): used.add(int(part))
ref_re=re.compile(r"^(\d+)\.\s")
refnums=[int(ref_re.match(t.strip()).group(1)) for t in refs if ref_re.match(t.strip())]
w("==== CITATIONS ====")
w(f"refs={len(refnums)} distinct_cited={len(used)}")
w(f"dups={[n for n in set(refnums) if refnums.count(n)>1]}")
w(f"gaps={[n for n in range(min(refnums),max(refnums)+1) if n not in refnums] if refnums else []}")
w(f"orphan={sorted(set(refnums)-used)}")
w(f"cited_but_absent={sorted(used-set(refnums))}")

# ---- load data JSONs ----
qc = P/"results"/"qc"
def J(name): return json.loads((qc/name).read_text(encoding="utf-8"))
scr = J("gse274819_keygene_R_v1.json")          # Sham vs 12h
pool = J("gse274819_keygene_pooled_R_v1.json")  # Sham vs pooled early IR
bulk = J("gse98622_bulk_R_v1.json")
mor = J("gse269622_moran_spdep_R_v1.json")
spat = J("gse269622_spatial_R_v1.json")

w("\n==== KEY NUMBERS IN TEXT vs JSON ====")
full = "\n".join(body)
def has(s): return "FOUND" if s in full else "**MISSING**"
# scRNA pooled (reconciled)
w(f"[49] Ogt 0.25 to 0.38 : {has('0.25 to 0.38')}  | JSON pool Ogt {pool['keygene']['Ogt']['Sham_mean_lognorm']}->{pool['keygene']['Ogt']['earlyIR_mean_lognorm']} (+{pool['keygene']['Ogt']['pct_change']}%)")
w(f"[49] Gclc 0.47 to 0.68 : {has('0.47 to 0.68')} | JSON pool Gclc {pool['keygene']['Gclc']['Sham_mean_lognorm']}->{pool['keygene']['Gclc']['earlyIR_mean_lognorm']} (+{pool['keygene']['Gclc']['pct_change']}%)")
w(f"[24] Sham 10,371 : {has('10,371')} ; early IR 34,088 : {has('34,088')}  | JSON n_Sham={pool['n_Sham']} n_earlyIR={pool['n_earlyIR_pooled']} total={pool['n_cells_total']}")
# whole-kidney 12h (Wave1 [45])
w(f"[45] Hmox1 0.28 to 0.45 +58% : {has('0.28 to 0.45')}/{has('+58%')} | JSON 12h Hmox1 {scr['keygene']['Hmox1']['Sham_mean_lognorm']}->{scr['keygene']['Hmox1']['IR12h_mean_lognorm']} (+{scr['keygene']['Hmox1']['pct_change']}%)")
# bulk [49]
w(f"[49] bulk Hmox1 157/20/30 : {has('mean=157')}/{has('SHAM_24h=20')}/{has('NORM_3m=30')} | JSON Hmox1 SHAM_4h={bulk['per_gene']['Hmox1']['SHAM_4h']} SHAM_24h={bulk['per_gene']['Hmox1']['SHAM_24h']} NORM_3m={bulk['per_gene']['Hmox1']['NORM_3m']}")
w(f"[49] bulk Ogt 57 4.6-fold vs 12 : {has('mean=57')}/{has('4.6-fold')}/{has('SHAM_4h=12')} | JSON Ogt SHAM_4h={bulk['per_gene']['Ogt']['SHAM_4h']} SHAM_24h={bulk['per_gene']['Ogt']['SHAM_24h']} ratio={round(bulk['per_gene']['Ogt']['SHAM_24h']/bulk['per_gene']['Ogt']['SHAM_4h'],2)}")
# Moran / spatial
w(f"[72] Moran 0.39 to 0.61 : {has('0.39')}/{has('0.61')} | squidpy Spp1 Sham={mor['spp1_rise']['squidpy']['Sham']} IR={mor['spp1_rise']['squidpy']['IR_12h']}")
w(f"spatial spots 2855/3392 : {has('2855')}/{has('3392')} | JSON Sham={spat['per_condition']['Sham']['n_spots']} IR={spat['per_condition']['IR_12h']['n_spots']}")

# ---- GSE98622 label consistency [19] vs [49] ----
w("\n==== GSE98622 LABELS ====")
w(f"bulk JSON columns: {list(bulk['per_gene']['Ogt'].keys())}")
p19 = next((t for t in body if t.startswith("Three publicly available")), "")
w(f"[19] GSE98622 desc has '2 h'={'2 h (n=5)' in p19} '2 wk'={'2 wk' in p19} '6 wk'={'6 wk' in p19} '49 samples'={'49 samples' in p19}")
w(f"[49] uses labels SHAM_4h={'SHAM_4h' in full} SHAM_24h={'SHAM_24h' in full} NORM_3m={'NORM_3m' in full}")

# ---- figure files ----
w("\n==== FIGURE FILES ====")
for loc in ["\u4ea4\u4ed8\u6700\u7ec8\u7248", "\u4ea4\u4ed8\u6700\u7ec8\u7248/supplementary", "results", "results/figures"]:
    dd = P/loc
    if dd.exists():
        imgs = sorted([f.name for f in dd.glob("*.png")] + [f.name for f in dd.glob("*.pdf")])
        w(f"[{loc}] {len(imgs)} img: {imgs}")

# ---- figure references in text ----
figrefs = sorted(set(re.findall(r"Figure\s+S?\d+[a-z]?", full)))
w(f"\nfigure mentions in body: {figrefs}")

OUT.write_text("\n".join(log), encoding="utf-8")
print("wrote", OUT)
