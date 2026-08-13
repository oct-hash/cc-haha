"""Convert _manuscript_v20_text.txt to Cell Reports-formatted .docx file."""

import re
from pathlib import Path
from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn

PROJECT = Path(__file__).parent.parent
TXT_PATH = PROJECT / "_manuscript_v20_text.txt"
OUT_PATH = PROJECT / "_manuscript_v20.docx"


def parse_manuscript(path: Path) -> list[tuple[str, str]]:
    text = path.read_text(encoding="utf-8")
    pattern = re.compile(
        r"^\[(P\d+[a-z]*)\][ \t]*\[(?:Normal|Heading|Title)\][ \t]*(.*?)$", re.MULTILINE
    )
    matches = list(pattern.finditer(text))
    paragraphs = []
    for i, m in enumerate(matches):
        label = m.group(1)
        start = m.start(2)
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        content = text[start:end].strip()
        paragraphs.append((label, content))
    return paragraphs


# P-labels whose content is a section title added by build_docx as a header.
# Skipping them avoids duplicate headers in the output.
_SKIP_LABELS = {"P7", "P10", "P12", "P16", "P46", "P52", "P99", "P142", "P183", "P200"}


def _clean_content(content: str) -> str:
    """Strip any [Pxxx] [Tag] prefix that leaked into captured content."""
    return re.sub(r"^\[P\d+[a-z]*\][ \t]*\[(?:Normal|Heading|Title)\][ \t]*", "", content)


def classify_paragraphs(paragraphs):
    sections = {
        "title": [], "summary": [], "keywords": [],
        "introduction": [], "results": [], "discussion": [],
        "methods": [], "references": [], "figure_legends": [],
        "table_legends": [], "author_info": [],
    }
    for label, content in paragraphs:
        n = int(re.match(r"P(\d+)", label).group(1))
        if n <= 6:
            key = "title"
        elif 7 <= n <= 8:
            key = "summary"
        elif 10 <= n <= 11:
            key = "keywords"
        elif 12 <= n <= 15:
            key = "introduction"
        elif 16 <= n <= 45:
            key = "results"
        elif 46 <= n <= 51:
            key = "discussion"
        elif 52 <= n <= 98:
            key = "methods"
        elif 99 <= n <= 141:
            key = "references"
        elif 142 <= n <= 182:
            key = "figure_legends"
        elif 183 <= n <= 199 or label.startswith("P199"):
            key = "table_legends"
        else:
            key = "author_info"
        sections[key].append((label, content))
    return sections


def _set_font(run, size, bold=False, italic=False):
    run.font.name = "Times New Roman"
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.makeelement(qn("w:rFonts"), {})
    rFonts.set(qn("w:eastAsia"), "Times New Roman")
    rPr.insert(0, rFonts)


def add_para(doc, text, size=11, bold=False, italic=False, spacing=24, align=None):
    p = doc.add_paragraph()
    run = p.add_run(text)
    _set_font(run, size, bold, italic)
    pf = p.paragraph_format
    pf.space_after = Pt(spacing)
    pf.space_before = Pt(0)
    if align:
        p.alignment = align
    return p


def add_header(doc, text):
    p = doc.add_paragraph()
    run = p.add_run(text)
    _set_font(run, 12, bold=True)
    pf = p.paragraph_format
    pf.space_before = Pt(18)
    pf.space_after = Pt(6)
    return p


def add_sub(doc, text):
    p = doc.add_paragraph()
    run = p.add_run(text)
    _set_font(run, 11, bold=True, italic=True)
    pf = p.paragraph_format
    pf.space_before = Pt(12)
    pf.space_after = Pt(4)
    return p


def build_docx(sections):
    doc = Document()
    sec = doc.sections[0]
    sec.page_width = Cm(21.0)
    sec.page_height = Cm(29.7)
    for attr in ("top_margin", "bottom_margin", "left_margin", "right_margin"):
        setattr(sec, attr, Cm(2.54))

    style = doc.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(11)

    # Title page
    ti = sections["title"]
    if ti:
        add_para(doc, ti[0][1], size=14, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    if len(ti) > 1 and ti[1][1]:
        add_para(doc, ti[1][1], size=12, align=WD_ALIGN_PARAGRAPH.CENTER)
    for _, c in ti[2:]:
        if c:
            add_para(doc, c, size=10, italic=True, align=WD_ALIGN_PARAGRAPH.CENTER)

    doc.add_page_break()

    # Summary
    add_header(doc, "SUMMARY")
    for label, c in sections["summary"]:
        if label in _SKIP_LABELS:
            continue
        c = _clean_content(c)
        if c.strip():
            add_para(doc, c)

    # Keywords
    if sections["keywords"]:
        add_para(doc, "KEYWORDS", bold=True, size=11)
        for label, c in sections["keywords"]:
            if label in _SKIP_LABELS:
                continue
            c = _clean_content(c)
            if c.strip():
                add_para(doc, c)

    # Introduction
    add_header(doc, "INTRODUCTION")
    for label, c in sections["introduction"]:
        if label in _SKIP_LABELS:
            continue
        c = _clean_content(c)
        if c.strip():
            add_para(doc, c)

    # Results
    add_header(doc, "RESULTS")
    sub_prefixes = (
        "Bulk ", "GSEA ", "Healthy ", "Cross-", "Single-",
        "Dual-", "OGT ", "Mouse ", "Human ", "Time-",
        "Macrophage ", "External ", "Cross-platform",
    )
    for label, c in sections["results"]:
        if label in _SKIP_LABELS:
            continue
        c = _clean_content(c)
        if not c.strip():
            continue
        s = c.strip()
        if len(s) < 120 and s.startswith(sub_prefixes):
            add_sub(doc, c)
        else:
            add_para(doc, c)

    # Discussion
    add_header(doc, "DISCUSSION")
    for label, c in sections["discussion"]:
        if label in _SKIP_LABELS:
            continue
        c = _clean_content(c)
        if c.strip():
            add_para(doc, c)

    # STAR Methods
    add_header(doc, "STAR METHODS")
    method_headers = (
        "Resource Availability", "Lead Contact", "Materials Availability",
        "Data and Code Availability", "Experimental Model",
        "Method Details", "Quantification", "Key Resources",
        "Mouse Model", "Human Heart Failure",
        "GTEx v8", "Bulk RNA", "Gene Set", "Single-Nucleus",
        "Cell-Cell", "Proteomics", "mRNA-Protein",
        "OGT Substrate", "External Validation",
        "WGCNA",
    )
    for label, c in sections["methods"]:
        if label in _SKIP_LABELS:
            continue
        c = _clean_content(c)
        if not c.strip():
            continue
        s = c.strip()
        if s.startswith(method_headers):
            add_sub(doc, c)
        elif len(s) < 120 and s[0].isupper():
            add_sub(doc, c)
        else:
            add_para(doc, c)

    # References
    doc.add_page_break()
    add_header(doc, "REFERENCES")
    for label, c in sections["references"]:
        if label in _SKIP_LABELS:
            continue
        c = _clean_content(c)
        if c.strip():
            add_para(doc, c, size=10, spacing=16)

    # Figure Legends
    doc.add_page_break()
    add_header(doc, "FIGURE LEGENDS")
    for label, c in sections["figure_legends"]:
        if label in _SKIP_LABELS:
            continue
        c = _clean_content(c)
        if c.strip():
            add_para(doc, c)

    # Table Legends
    doc.add_page_break()
    add_header(doc, "SUPPLEMENTAL TABLE LEGENDS")
    for label, c in sections["table_legends"]:
        if label in _SKIP_LABELS:
            continue
        c = _clean_content(c)
        if c.strip():
            add_para(doc, c)

    # Author Info
    add_header(doc, "AUTHOR INFORMATION")
    for label, c in sections["author_info"]:
        if label in _SKIP_LABELS:
            continue
        c = _clean_content(c)
        if c.strip():
            add_para(doc, c)

    return doc


def main():
    paragraphs = parse_manuscript(TXT_PATH)
    print(f"Parsed {len(paragraphs)} paragraphs from {TXT_PATH.name}")

    sections = classify_paragraphs(paragraphs)
    for name, items in sections.items():
        if items:
            print(f"  {name}: {len(items)} paragraphs")

    doc = build_docx(sections)
    doc.save(str(OUT_PATH))
    print(f"\nSaved: {OUT_PATH}")


if __name__ == "__main__":
    main()
