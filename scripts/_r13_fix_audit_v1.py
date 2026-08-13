# -*- coding: utf-8 -*-
"""R12→R13: Fix 3 HIGH audit issues (redundancy, broken xref, mixed controls).
Read-only except for document save. Run: py -X utf8 this.py"""
import copy
from pathlib import Path
from docx import Document

P = Path("D:/肾脏虚拟细胞文章设计")
R12 = P / "manuscript" / "manuscript_R12_deAI_v1.docx"
R13 = P / "manuscript" / "manuscript_R13_auditfix_v1.docx"
LOG = Path("D:/claude-code-haha/scripts/_r13_auditfix_log.txt")

log = []
def w(s=""): log.append(str(s))

d = Document(str(R12))
# Work on a copy
paras = d.paragraphs
n_paras = len(paras)

# Copy R12 → R13
import shutil
shutil.copy2(str(R12), str(R13))
d = Document(str(R13))
paras = d.paragraphs
w("[copied] R12 -> manuscript_R13_auditfix_v1.docx")

edit_count = 0

# ============================================================
# FIX 1: [12] §1.2 — remove cardiac I/R sentence (duplicate of [13])
# ============================================================
old_12 = (
    "Ferroptosis — an iron-dependent, lipid-peroxidation-driven form of regulated necrosis "
    "— is a central executioner in kidney IRI; synchronized renal tubular cell death involving "
    "ferroptosis has been confirmed in murine models [15-21,24,33]. "
    "In cardiac I/R, protein O-GlcNAcylation is a well-characterized cytoprotective response "
    "that operates alongside Nrf2-dependent antioxidant defense to limit oxidative and "
    "ferroptotic injury [22]. "
    "The cell-type-resolved architecture of the Nrf2-ferroptosis axis in the kidney "
    "— and the role of O-GlcNAc signaling within it — has not been mapped."
)
new_12 = (
    "Ferroptosis — an iron-dependent, lipid-peroxidation-driven form of regulated necrosis "
    "— is a central executioner in kidney IRI; synchronized renal tubular cell death involving "
    "ferroptosis has been confirmed in murine models [15-21,24,33]. "
    "The cell-type-resolved architecture of the Nrf2-ferroptosis axis in the kidney "
    "— and the role of O-GlcNAc signaling within it — has not been mapped."
)

for p in paras:
    if p.text == old_12:
        # Clear all runs, set text on first run
        for run in p.runs:
            run.text = ""
        if p.runs:
            p.runs[0].text = new_12
        else:
            p.text = new_12
        w(f"[edit] para 12: removed cardiac I/R duplicate → [13]")
        edit_count += 1
        break
else:
    # Try partial match
    for p in paras:
        if "In cardiac I/R, protein O-GlcNAcylation is a well-characterized" in p.text and "The cell-type-resolved architecture" in p.text:
            old_text = p.text
            new_text = old_text.replace(
                "In cardiac I/R, protein O-GlcNAcylation is a well-characterized cytoprotective response that operates alongside Nrf2-dependent antioxidant defense to limit oxidative and ferroptotic injury [22]. ",
                ""
            )
            for run in p.runs:
                run.text = ""
            if p.runs:
                p.runs[0].text = new_text
            else:
                p.text = new_text
            w(f"[edit] para 12: partial match fix for cardiac I/R duplicate")
            edit_count += 1
            break

# ============================================================
# FIX 2: [82] §4.2 — clarify Fth1 range spans sham+normal control groups
# ============================================================
old_82_range = "99.9% detection, 5,721–6,862 bulk counts"
new_82_range = "99.9% detection, 5,721–6,862 bulk counts across sham and normal control groups"

for i, p in enumerate(paras):
    if old_82_range in p.text:
        old_text = p.text
        new_text = old_text.replace(old_82_range, new_82_range)
        for run in p.runs:
            run.text = ""
        if p.runs:
            p.runs[0].text = new_text
        else:
            p.text = new_text
        w(f"[edit] para {i}: clarified Fth1 range spans sham+normal controls")
        edit_count += 1
        break

# ============================================================
# FIX 3: [92] §4.7 — remove broken "Methods §2.8" cross-reference
# The model-free coupling analysis is NOT described in §2.8 (Cell-Cell Communication).
# It is described inline here in Limitations with enough detail.
# ============================================================
old_92_xref = "; Methods §2.8), which recovers"
new_92_xref = "), which recovers"

for i, p in enumerate(paras):
    if old_92_xref in p.text:
        old_text = p.text
        new_text = old_text.replace(old_92_xref, new_92_xref)
        for run in p.runs:
            run.text = ""
        if p.runs:
            p.runs[0].text = new_text
        else:
            p.text = new_text
        w(f"[edit] para {i}: removed broken Methods §2.8 cross-reference")
        edit_count += 1
        break

# ============================================================
# Save
# ============================================================
d.save(str(R13))
w(f"[saved] {edit_count} paragraphs edited")

# ============================================================
# AUDIT
# ============================================================
w("\n==== AUDIT ====")
d2 = Document(str(R13))
paras2 = [p.text for p in d2.paragraphs]
full2 = "\n".join(paras2)
body2 = paras2[:[i for i,t in enumerate(paras2) if t.strip()=="References"][0]]

w(f"R12 paras {n_paras}  R13 paras {len(paras2)}  equal={n_paras==len(paras2)}")

# Check fix 1: cardiac I/R sentence gone from [12], present in [13]
p12 = paras2[12]
p13 = paras2[13]
cardiac_phrase = "In cardiac I/R, protein O-GlcNAcylation is a well-characterized"
w(f"FIX1 [12] cardiac phrase absent: {cardiac_phrase not in p12} {'OK' if cardiac_phrase not in p12 else 'FAIL'}")
w(f"FIX1 [13] cardiac phrase present: {cardiac_phrase in p13} {'OK' if cardiac_phrase in p13 else 'FAIL'}")

# Check fix 2: Fth1 range clarified
w(f"FIX2 [82] clarified range: {'across sham and normal control groups' in full2} {'OK' if 'across sham and normal control groups' in full2 else 'FAIL'}")

# Check fix 3: broken xref removed
w(f"FIX3 [92] Methods §2.8 absent: {'Methods §2.8' not in full2} {'OK' if 'Methods §2.8' not in full2 else 'FAIL'}")
# But make sure model-free coupling numbers still present
w(f"FIX3 [92] coupling numbers preserved: {'Nfe2l2–target Spearman' in full2} {'OK' if 'Nfe2l2–target Spearman' in full2 else 'FAIL'}")

# Quick citation check
import re
cite_re = re.compile(r"\[(\d+(?:[-\u2013,\s]+\d+)*)\]")
used=set()
for t in body2:
    for m in cite_re.findall(t):
        for part in re.split(r"[,\s]+", m):
            if "\u2013" in part or "-" in part:
                a,b=re.split(r"[-\u2013]",part); used.update(range(int(a),int(b)+1))
            elif part.isdigit(): used.add(int(part))
refs_txt=paras2[[i for i,t in enumerate(paras2) if t.strip()=="References"][0]:]
ref_re=re.compile(r"^(\d+)\.\s")
refnums=[int(ref_re.match(t.strip()).group(1)) for t in refs_txt if ref_re.match(t.strip())]
w(f"citations: refs={len(refnums)} cited={len(used)} orphan={sorted(set(refnums)-used)} missing={sorted(used-set(refnums))}")

# Key numbers preserved
nums=['10,371','34,088','6,688','14,048','5,721','6,862','99.9%']
for n in nums:
    ok = n in full2
    if not ok:
        w(f"  NUMBER LOST: {n}")

LOG.write_text("\n".join(log), encoding="utf-8")
print("wrote", LOG)
