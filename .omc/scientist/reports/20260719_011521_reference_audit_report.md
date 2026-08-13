# Reference Audit Report

**Manuscript:** Cardiac_Ogt_MultiOmics _manuscript_v29_text.txt
**Date:** 2026-07-19 01:15
**Auditor:** Claude Code Research Scientist
**Scope:** All 37 references (lines 1058-1095), citation accuracy, DOI validity

---

## OBJECTIVE

Verify all 37 references in the manuscript for:
1. Author name accuracy (first author + et al.)
2. Journal name accuracy
3. Year, volume, issue, page accuracy
4. DOI format validity and resolution
5. Correct citation in text with right reference number

---

## DATA

- Total references listed: 37 (lines 1058-1095)
- Total references cited in text: 37 (all accounted for)
- Verification method: CrossRef API + Semantic Scholar API + Web search

---

## FINDINGS SUMMARY

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 2 | Wrong page numbers (Ref 6); wrong author names (Ref 36) |
| HIGH | 0 | |
| MEDIUM | 1 | Conference year ambiguity (Ref 36) |
| LOW | 4 | Missing issue numbers (Refs 4,5,6); en dash vs hyphen |

---

## DETAILED FINDINGS

### [FINDING 1] Ref 6 - WRONG PAGE NUMBERS (CRITICAL)

**Manuscript claims:**
> Bond MR, Hanover JA. J Cell Biol. 2015;208:669-680.

**Actual record (CrossRef + JCB website):**
> J Cell Biol. 2015;208(7):869-880. DOI: 10.1083/jcb.201501101

Pages 669-680 do not exist in volume 208. The page offset of exactly 200 suggests a transcription error.

[STAT:severity] CRITICAL
[STAT:line] Line 1064
[STAT:n] 1 reference affected

### [FINDING 2] Ref 36 - WRONG AUTHOR NAMES (CRITICAL)

**Manuscript claims:**
> Wu Y, Liu T, Chen J, et al. PerturBench...

**Actual author list (arXiv:2408.10609 v4):**
> Wu Y, Wershof E, Schmon SM, Nassar M, Osinski B, Eksi R, et al.

There is NO Liu T or Chen J among the authors. The correct first 6 co-equal first authors must be listed.

[STAT:severity] CRITICAL
[STAT:line] Line 1094
[STAT:n] 1 reference affected

### [FINDING 3] Ref 36 - Conference Year Ambiguity (MEDIUM)

Manuscript says NeurIPS 2025. The paper URL (neurips.cc/virtual/2024/102911) indicates presentation at NeurIPS 2024. arXiv submitted Aug 2024.

[STAT:severity] MEDIUM
[STAT:line] Line 1094
[STAT:n] 1 reference affected

### [FINDING 4] En Dash vs Hyphen in Range Citations (LOW)

Citations use en dashes (U+2013) in 3 range citations: [1-3] line 67, [4-6] lines 71, 500.
All other citations use standard hyphens.

[STAT:severity] LOW
[STAT:n] 3 citation markers affected

### [FINDING 5] Missing Issue Numbers (LOW)

| Ref | Manuscript | Correct |
|-----|-----------|---------|
| 4 | 289:34422-34423 | 289(50):34422-34423 |
| 5 | 18:452-465 | 18(7):452-465 |
| 6 | 208:669-680 | 208(7):869-880 |

Whether issue numbers are required depends on target journal style.

[STAT:severity] LOW
[STAT:n] 3 references affected

---

## FULL REFERENCE VERIFICATION TABLE

| # | First Author | Journal | Year | Vol:Pages | DOI | Cited | Status |
|---|-------------|--------|------|-----------|-----|-------|--------|
| 1 | Hausenloy DJ | J Clin Invest | 2013 | 123(1):92-100 | 10.1172/JCI62874 | [1-3] | OK |
| 2 | Heusch G | Eur Heart J | 2017 | 38(11):774-784 | 10.1093/eurheartj/ehw224 | [1-3] | OK |
| 3 | Frangogiannis NG | Nat Rev Cardiol | 2014 | 11(5):255-265 | 10.1038/nrcardio.2014.28 | [1-3] | OK |
| 4 | Hart GW | J Biol Chem | 2014 | 289:34422-34423 | 10.1074/jbc.R114.609776 | [4-6] | LOW |
| 5 | Yang X | Nat Rev Mol Cell Biol | 2017 | 18:452-465 | 10.1038/nrm.2017.22 | [4-6] | LOW |
| 6 | Bond MR | J Cell Biol | 2015 | **208:669-680** | 10.1083/jcb.201501101 | [4-6] | **CRITICAL** |
| 7 | Dixon SJ | Cell | 2012 | 149(5):1060-1072 | 10.1016/j.cell.2012.03.042 | [7] | OK |
| 8 | Fang X | PNAS | 2019 | 116(7):2672-2680 | 10.1073/pnas.1821022116 | [8] | OK |
| 9 | Weber GF | Science | 1996 | 271(5248):509-512 | 10.1126/science.271.5248.509 | [9] | OK |
| 10 | Muller S | Nat Chem | 2020 | 12(10):929-938 | 10.1038/s41557-020-0513-5 | [10] | OK |
| 11 | Nitzan M | Nature | 2019 | 576(7785):132-137 | 10.1038/s41586-019-1773-3 | [11] | OK |
| 12 | McMurray JJV | N Engl J Med | 2019 | 381(21):1995-2008 | 10.1056/NEJMoa1911303 | [12,13] | OK |
| 13 | Packer M | N Engl J Med | 2020 | 383(15):1413-1424 | 10.1056/NEJMoa2022190 | [12,13] | OK |
| 14 | Cui H | Nat Methods | 2024 | 21(8):1470-1480 | 10.1038/s41592-024-02201-0 | [14] | OK |
| 15 | Yang WH | PNAS | 2008 | 105(45):17345-17350 | 10.1073/pnas.0806198105 | [15,16] | OK |
| 16 | Ma Z | J Biol Chem | 2017 | 292(22):9150-9163 | 10.1074/jbc.M116.766568 | [15,16] | OK |
| 17 | Jin S | Nat Commun | 2021 | 12:1088 | 10.1038/s41467-021-21246-9 | [17] | OK |
| 18 | Efremova M | Nat Protoc | 2020 | 15(4):1484-1506 | 10.1038/s41596-020-0292-x | [18] | OK |
| 19 | GTEx Consort. | Science | 2020 | 369(6509):1318-1330 | 10.1126/science.aaz1776 | [19] | OK |
| 20 | Mancias JD | Nature | 2014 | 509(7498):105-109 | 10.1038/nature13148 | [20] | OK |
| 21 | Ma J | Int J Mol Sci | 2021 | 22(17):9620 | 10.3390/ijms22179620 | [21] | OK |
| 22 | Jung SH | Nat Commun | 2022 | 13:4580 | 10.1038/s41467-022-32284-2 | [22] | OK |
| 23 | Love MI | Genome Biol | 2014 | 15(12):550 | 10.1186/s13059-014-0550-8 | [23] | OK |
| 24 | Korotkevich G | bioRxiv | 2021 | -:060012 | 10.1101/060012 | [24] | OK |
| 25 | Langfelder P | BMC Bioinformatics | 2008 | 9:559 | 10.1186/1471-2105-9-559 | [25] | OK |
| 26 | Wolf FA | Genome Biol | 2018 | 19(1):15 | 10.1186/s13059-017-1382-0 | [26] | OK |
| 27 | McInnes L | arXiv | 2018 | -:1802.03426 | arXiv:1802.03426 | [27] | OK |
| 28 | Traag VA | Sci Rep | 2019 | 9(1):5233 | 10.1038/s41598-019-41695-z | [28] | OK |
| 29 | Dimitrov D | Nat Commun | 2022 | 13(1):3224 | 10.1038/s41467-022-30755-0 | [29] | OK |
| 30 | Lopez R | Nat Methods | 2018 | 15(12):1053-1058 | 10.1038/s41592-018-0229-2 | [30] | OK |
| 31 | Tibshirani R | J R Stat Soc B | 1996 | 58(1):267-288 | no DOI | [31] | OK |
| 32 | Lundberg SM | NeurIPS | 2017 | -:4765-4774 | no DOI | [32] | OK |
| 33 | Chen T | KDD | 2016 | -:785-794 | 10.1145/2939672.2939785 | [33] | OK |
| 34 | Oughtred R | Protein Sci | 2021 | 30(1):187-200 | 10.1002/pro.3978 | [34] | OK |
| 35 | Dalke A | J Cheminform | 2013 | 5(S1):O6 | 10.1186/1758-2946-5-S1-O6 | [35] | OK |
| 36 | Wu Y (WRONG) | NeurIPS D&B | 2025? | - | arXiv:2408.10609 | [36] | **CRITICAL** |
| 37 | Xing H | Nat Commun | 2025 | 16(1):5423 | 10.1038/s41467-025-61165-7 | [37] | OK |

---

## RECOMMENDED CORRECTIONS

### CRITICAL (fix before submission)

1. **Ref 6, line 1064:** Change 208:669-680 to 208(7):869-880

2. **Ref 36, line 1094:** Change author names to:
   Wu Y, Wershof E, Schmon SM, Nassar M, Osinski B, Eksi R, et al.

### MEDIUM (should verify)

3. **Ref 36, line 1094:** Check official NeurIPS proceedings for correct year.

### LOW (consider fixing)

4. Use hyphens not en dashes in [1-3] and [4-6] citation ranges.
5. Add issue numbers for Refs 4 and 5 if journal style requires.

---

## LIMITATION

- CrossRef API returns metadata as deposited by publishers; article-number-based journals (Nat Commun) return article numbers not page ranges.
- Refs 31 (Tibshirani) and 32 (Lundberg) have no standard DOI; verified by title/author/venue matching.
- Ref 24 (Korotkevich) has bioRxiv versions from 2016 and 2021; the 2021 version is correctly cited.
- Ref 36 (PerturBench) year is ambiguous (NeurIPS 2024 presentation vs 2025 proceedings).

---

## VERIFICATION METHODOLOGY

1. All DOIs were resolved via the CrossRef REST API (https://api.crossref.org/)
2. References without DOIs (Refs 27, 31, 32) verified by web search and Semantic Scholar
3. Problematic references (Refs 2, 6, 24, 36) manually verified via PubMed and journal websites
4. All citation markers in the text were extracted and matched against the reference list
5. Author names were compared between CrossRef metadata and manuscript entries

---

*Report generated by Claude Code Research Scientist agent*