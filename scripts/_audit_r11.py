# -*- coding: utf-8 -*-
"""R11 comprehensive re-audit: full text+citations+numbers+figures+guards check.
Read-only. Run: py -X utf8 this.py"""
import json, re
from pathlib import Path
from docx import Document

P = Path("D:/肾脏虚拟细胞文章设计")
R11 = P / "manuscript" / "manuscript_R11_multiomics_v1.docx"
OUT = Path("D:/claude-code-haha/scripts/_audit_r11.txt")
log = []
def w(s=""): log.append(str(s))

d = Document(str(R11))
paras_obj = d.paragraphs
paras = [p.text for p in paras_obj]
full = "\n".join(paras)
body = paras[:[i for i,t in enumerate(paras) if t.strip()=="References"][0]]
refs_txt = paras[[i for i,t in enumerate(paras) if t.strip()=="References"][0]:]

# ====== 0. BASIC INTEGRITY ======
w("===== R11 BASIC INTEGRITY =====")
w(f"paragraphs: {len(paras)}")
w(f"'multi-omics integration' count: {full.count('multi-omics integration')}")
vc_residual = sum(1 for p in paras if "virtual cell" in p.lower())
w(f"'virtual cell' residual: {vc_residual} {'OK' if vc_residual==0 else 'FAIL'}")
w(f"S1 cited: {'Supplementary Figure S1' in full} {'OK' if 'Supplementary Figure S1' in full else 'FAIL'}")
w(f"control terminology note present: {'control-group terminology' in full} {'OK' if 'control-group terminology' in full else 'FAIL'}")

# ====== 1. CITATIONS ======
w("\n===== CITATIONS =====")
cite_re = re.compile(r"\[(\d+(?:[-\u2013,\s]+\d+)*)\]")
used=set()
for t in body:
    for m in cite_re.findall(t):
        for part in re.split(r"[,\s]+", m):
            if "\u2013" in part or "-" in part:
                a,b=re.split(r"[-\u2013]",part); used.update(range(int(a),int(b)+1))
            elif part.isdigit(): used.add(int(part))
ref_re=re.compile(r"^(\d+)\.\s")
refnums=[int(ref_re.match(t.strip()).group(1)) for t in refs_txt if ref_re.match(t.strip())]
w(f"refs={len(refnums)} distinct_cited={len(used)}")
w(f"orphan={sorted(set(refnums)-used)}")
w(f"missing={sorted(used-set(refnums))}")
dups = [n for n in set(refnums) if refnums.count(n)>1]
w(f"duplicate refs: {dups if dups else 'none'}")

# ====== 2. LOAD JSONs ======
qc = P/"results"/"qc"
def J(name): return json.loads((qc/name).read_text(encoding="utf-8"))
scr = J("gse274819_keygene_R_v1.json")
pool = J("gse274819_keygene_pooled_R_v1.json")
bulk_old = J("gse98622_bulk_R_v1.json")
bulk_full = J("gse98622_bulk_full_R_v1.json")
mor = J("gse269622_moran_spdep_R_v1.json")
spat = J("gse269622_spatial_R_v1.json")

# ====== 3. NUMBERS vs JSON ======
w("\n===== KEY NUMBERS IN TEXT vs JSON =====")
def has(s): return "FOUND" if s in full else "**MISSING**"

# scRNA pooled
w(f"[24] Sham 10,371 : {has('10,371')}  | JSON n_Sham={pool['n_Sham']}")
w(f"[24] early I/R 34,088 : {has('34,088')}  | JSON n_earlyIR={pool['n_earlyIR_pooled']}")
w(f"[49] Ogt 0.25 to 0.38 : {has('0.25 to 0.38')}  | JSON {pool['keygene']['Ogt']['Sham_mean_lognorm']}->{pool['keygene']['Ogt']['earlyIR_mean_lognorm']} (+{pool['keygene']['Ogt']['pct_change']}%)")
w(f"[49] Ogt +53% : {has('53%') or has('+53')}  | JSON +{pool['keygene']['Ogt']['pct_change']}%")
w(f"[49] Gclc 0.47 to 0.68 : {has('0.47 to 0.68')}  | JSON {pool['keygene']['Gclc']['Sham_mean_lognorm']}->{pool['keygene']['Gclc']['earlyIR_mean_lognorm']} (+{pool['keygene']['Gclc']['pct_change']}%)")
w(f"[49] Gclc +45% : {has('Gclc increased 45%') or has('Gclc increased 45')}  | JSON +{pool['keygene']['Gclc']['pct_change']}%")
w(f"[49] Fth1 99.9% : {has('99.9%')}  | JSON Sham detection 99.9%")

# whole-kidney 12h
w(f"[45] Hmox1 0.28 to 0.45 : {has('0.28 to 0.45')}  | JSON {scr['keygene']['Hmox1']['Sham_mean_lognorm']}->{scr['keygene']['Hmox1']['IR12h_mean_lognorm']}")
w(f"[45] Hmox1 +58% : {has('+58%') or has('58%')}  | JSON +{scr['keygene']['Hmox1']['pct_change']}%")

# Bulk GSE98622 (full 49-sample)
w(f"[19] IRI timecourse correct: {has('IRI at 2 h, 4 h, 24 h, 48 h, 72 h, 7 d, 14 d, 28 d')}")
w(f"[24] 49 samples IRI 2h-12mo: {has('49 samples spanning an ischemia-reperfusion injury time course from 2 h to 12 mo')}")
# Check new [49] bulk values
hmox1_base = bulk_full['per_gene']['Hmox1']['NORM_3m']
hmox1_24h = bulk_full['per_gene']['Hmox1']['IRI_24h']
hmox1_28d = bulk_full['per_gene']['Hmox1']['IRI_28d']
fth1_base = bulk_full['per_gene']['Fth1']['NORM_3m']
fth1_24h = bulk_full['per_gene']['Fth1']['IRI_24h']
ogt_base = bulk_full['per_gene']['Ogt']['NORM_3m']
ogt_24h = bulk_full['per_gene']['Ogt']['IRI_24h']
w(f"[49] Hmox1 baseline~{hmox1_base} : {has(str(int(hmox1_base)))}  | bulk_full NORM_3m={hmox1_base}")
w(f"[49] Hmox1 24h~{hmox1_24h} : {has(str(int(hmox1_24h)))}  | bulk_full IRI_24h={hmox1_24h} fold={round(hmox1_24h/hmox1_base,1)}x")
w(f"[49] Hmox1 28d~{hmox1_28d} : {has(str(int(hmox1_28d)))}  | bulk_full IRI_28d={hmox1_28d}")
w(f"[49] Fth1 baseline~{int(fth1_base)} : {has(f'{int(fth1_base):,}')}  | bulk_full NORM_3m={fth1_base}")
w(f"[49] Fth1 24h~{int(fth1_24h)} : {has(f'{int(fth1_24h):,}')}  | bulk_full IRI_24h={fth1_24h} fold={round(fth1_24h/fth1_base,1)}x")
w(f"[49] Ogt baseline~{int(ogt_base)} : {has(str(int(ogt_base)))}  | bulk_full NORM_3m={ogt_base}")
w(f"[49] Ogt 24h~{int(ogt_24h)} : {has(str(int(ogt_24h)))}  | bulk_full IRI_24h={ogt_24h} fold={round(ogt_24h/ogt_base,1)}x")
w(f"[49] Slc7a11 undetectable: {has('Slc7a11 remained undetectable')}")

# Moran / spatial
w(f"[72] Moran 0.39 to 0.61 : {has('0.39')}/{has('0.61')}  | squidpy Spp1 Sham={mor['spp1_rise']['squidpy']['Sham']} IR={mor['spp1_rise']['squidpy']['IR_12h']}")
w(f"[72] spatial spots 2,855/3,392 : {has('2,855')}/{has('3,392')}  | JSON Sham={spat['per_condition']['Sham']['n_spots']} IR={spat['per_condition']['IR_12h']['n_spots']}")
w(f"[72] spot r -0.030 to +0.403 : {has('-0.030')}/{has('+0.403')}")

# Temporal coordination
w(f"\n===== TEMPORAL COORDINATION =====")
for g, rho in [("Hmox1","0.26"),("Ogt","0.62"),("Gclc","0.32"),("Fth1","0.84"),("Nfe2l2","0.26")]:
    w(f"  {g} ρ={rho} : {has(f'{g} = {rho}') or has(f'{g} = 0.{rho.split('.')[1]}')}")

# Pathway coordination
w(f"\n===== PATHWAY COORDINATION =====")
for pw, rho in [("GSH","0.39"),("Iron","0.40"),("Lipid","0.18")]:
    w(f"  {pw} ρ={rho} : {has(f'{pw}={rho}') or has(f'{pw} = {rho}')}")

# Co-expression
w(f"\n===== CO-EXPRESSION =====")
w(f"  4 edges Control : {has('4 at Control') or has('4 at Control')}")
w(f"  13 edges 12h : {has('13 at 12 h') or has('13 at 12 h')}")
w(f"  7 edges 2d : {has('7 by 2 d') or has('7 by 2 d')}")

# Metabolic
w(f"\n===== METABOLIC =====")
w(f"  PT GSH 5.1x 4h : {has('5.1-fold')}")
w(f"  PT Iron 1.8x : {has('1.8-fold')}")

# ====== 4. GUARDS: old wrong strings ======
w("\n===== GUARD: OLD WRONG STRINGS =====")
guards_old = {
    "+676%": False,
    "Disorganization Window": False,
    "SHAM_4h (mean=157)": False,
    "peak expression at SHAM_24h": False,
    "4.6-fold vs SHAM_4h": False,
    "49 samples across six reperfusion durations": False,
    "Sham (n=12), 2 h (n=5)": False,
    "virtual cell": False,
    "Virtual Cell": False,
    "Virtual cell": False,
}
for s, want in guards_old.items():
    got = s in full
    ok = got == want
    w(f"  {'OK' if ok else 'FAIL'} present={got} want={want}  {s!r}")

# ====== 5. GUARDS: new correct strings ======
w("\n===== GUARD: NEW CORRECT STRINGS =====")
guards_new = {
    "multi-omics integration": True,
    "Multi-Omics Integration": True,
    "Multi-omics integration": True,
    "Co-Regulation Peak": True,
    "peaking at 24 h": True,
    "14,048 versus a baseline of 6,688": True,
    "IRI at 2 h, 4 h, 24 h, 48 h": True,
    "Supplementary Figure S1": True,
    "control-group terminology": True,
    "NORM": True,
}
for s, want in guards_new.items():
    got = s in full
    ok = got == want
    w(f"  {'OK' if ok else 'FAIL'} present={got} want={want}  {s!r}")

# ====== 6. FIGURE FILES ======
w("\n===== FIGURE FILES =====")
fig_dirs = [
    P / "交付最终版/supplementary",
    P / "交付最终版/figures",
    P / "manuscript",
]
all_figs = {}
for dd in fig_dirs:
    if dd.exists():
        for ext in ["pdf", "png"]:
            for f in dd.glob(f"*.{ext}"):
                all_figs.setdefault(f.stem, []).append(str(dd.name))

w(f"Total unique figure files: {len(all_figs)}")
for stem in sorted(all_figs):
    w(f"  {stem} ({', '.join(all_figs[stem])})")

# Figure references in body
figrefs = sorted(set(re.findall(r"Figure\s+S?\d+[a-z]?", full)))
w(f"\nFigure mentions in body: {figrefs}")

# Check S1-S4 all cited or not
for sn in ["S1", "S2", "S3", "S4", "S4b"]:
    cited = f"Figure {sn}" in full or f"Supplementary Figure {sn}" in full
    has_file = any(sn.replace("S4b","S4b") in k for k in all_figs)
    w(f"  Figure {sn}: cited={cited} has_file={has_file} {'OK' if cited==has_file or (cited and has_file) else 'CHECK'}")

# ====== 7. STORY LOGIC CHECKS ======
w("\n===== STORY LOGIC =====")
checks = {
    "§4.4 title correct": "4.4 The 12-Hour Co-Regulation Peak" in full,
    "12h peak NOT disorganization": "disorganization window" not in full.lower(),
    "O-GlcNAc NOT gatekeeper": "rather than a ferroptosis gatekeeper" in full or "rather than a gatekeeper" in full,
    "Fth1-dominant kidney": "Fth1/Gclc-dominant" in full or "Fth1 as the Dominant" in full,
    "Cross-organ comparison present": "Cross-Organ Comparison" in full,
    "SPP1 repair pulse described": "SPP1" in full and "repair-initiation" in full,
    "Drug connectivity present": "tyrosine-kinase inhibitors" in full,
    "7-step framework described": "seven-step" in full,
    "Limitations section": "4.7 Limitations" in full,
    "Future directions section": "4.8 Future Directions" in full,
    "Three datasets listed": "GSE139107" in full and "GSE274819" in full and "GSE98622" in full,
}
for label, result in checks.items():
    w(f"  {'OK' if result else 'FAIL'} {label}")

# ====== 8. NUMBER FORMAT CONSISTENCY ======
w("\n===== NUMBER FORMAT =====")
# Check commas in large numbers
w(f"  10,371 with comma: {'10,371' in full}")
w(f"  34,088 with comma: {'34,088' in full}")
w(f"  2,855 with comma: {'2,855' in full}")
w(f"  3,392 with comma: {'3,392' in full}")
w(f"  5,721 with comma: {'5,721' in full}")
w(f"  6,862 with comma: {'6,862' in full}")
w(f"  126,578 with comma: {'126,578' in full}")
w(f"  44,459 with comma: {'44,459' in full}")

OUT.write_text("\n".join(log), encoding="utf-8")
print("wrote", OUT)
