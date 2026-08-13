#!/usr/bin/env python3
"""
Professional Medical Lecture PPT — 阿司匹林 + Statin in Frail Older Adults
Design: academic medical style (light bg, navy/crimson, JAMA-chart conventions)
"""

import os, textwrap
from pptx import Presentation
from pptx.util import Inches, Pt, Emu, Cm
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np

# ── Paths ──────────────────────────────────────────────
DESKTOP  = os.path.join(os.path.expanduser("~"), "Desktop")
OUT_DIR  = os.path.join(DESKTOP, "衰弱心脑血管讲座")
CHART_DIR = os.path.join(OUT_DIR, "_charts")
PPT_PATH = os.path.join(OUT_DIR, "抗血小板+他汀_衰弱老年人差异化决策_v2.pptx")
os.makedirs(CHART_DIR, exist_ok=True)

# ── Design System ──────────────────────────────────────
NAVY     = RGBColor(0x0B, 0x2A, 0x45)   # #0B2A45  heading / header bar
CRIMSON  = RGBColor(0xC4, 0x1E, 0x3A)   # #C41E3A  accent / emphasis
WHITE    = RGBColor(0xFF, 0xFF, 0xFF)
BLACK    = RGBColor(0x1A, 0x1A, 0x1A)   # body text
GRAY60   = RGBColor(0x66, 0x66, 0x66)   # subtitle / citation
GRAY40   = RGBColor(0x99, 0x99, 0x99)   # secondary text
GRAY15   = RGBColor(0xE0, 0xE0, 0xE0)   # rule line / table border
BG_SLIDE = RGBColor(0xFA, 0xFA, 0xFA)   # #FAFAFA  slide background
BG_TABLE = RGBColor(0xF0, 0xF2, 0xF5)   # alternating table row
BLUE_MID = RGBColor(0x1F, 0x77, 0xB4)   # chart blue
ORANGE   = RGBColor(0xFF, 0x7F, 0x0E)   # chart orange
GREEN_CH = RGBColor(0x2C, 0xA0, 0x2C)
# matplotlib-compatible hex colors
H_NAVY    = '#0B2A45'
H_CRIMSON = '#C41E3A'
H_BLUE    = '#1F77B4'
H_ORANGE  = '#FF7F0E'
H_GREEN   = '#2CA02C'

# Matplotlib rc
plt.rcParams.update({
    'font.family': 'sans-serif',
    'font.sans-serif': ['Microsoft YaHei', 'Arial', 'SimHei', 'DejaVu Sans'],
    'axes.unicode_minus': False,
    'figure.facecolor': 'white',
    'axes.facecolor': 'white',
    'axes.edgecolor': '#333333',
    'axes.labelcolor': '#333333',
    'text.color': '#333333',
    'xtick.color': '#333333',
    'ytick.color': '#333333',
    'grid.alpha': 0.3,
    'grid.color': '#CCCCCC',
    'axes.spines.top': False,
    'axes.spines.right': False,
})

FONT = 'Arial'
FONT_CJK = 'Microsoft YaHei'
FONT_MONO = 'Consolas'

prs = Presentation()
prs.slide_width  = Inches(13.333)
prs.slide_height = Inches(7.5)
W = prs.slide_width
H = prs.slide_height

# ── Helper: Slide Background ───────────────────────────
def bg(slide, color=BG_SLIDE):
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = color

def dark_bg(slide):
    """Title / closing slides use navy background"""
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = NAVY

# ── Helper: Text Box ───────────────────────────────────
def txt(slide, left, top, width, height, text, *, size=18, color=BLACK,
        bold=False, align=PP_ALIGN.LEFT, font=FONT_CJK, anchor=MSO_ANCHOR.TOP):
    tb = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tb.text_frame.word_wrap = True
    tb.text_frame.auto_size = None
    p = tb.text_frame.paragraphs[0]
    p.text = text
    p.font.size = Pt(size)
    p.font.color.rgb = color
    p.font.bold = bold
    p.font.name = font
    p.alignment = align
    return tb

def txt_multi(slide, left, top, width, height, lines, *, size=16, color=BLACK,
              spacing=1.6, font=FONT_CJK, bold_first=False):
    """lines: list of str. first line optionally bold."""
    tb = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = tb.text_frame
    tf.word_wrap = True
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = line
        p.font.size = Pt(size)
        p.font.color.rgb = color
        p.font.name = font
        p.font.bold = (bold_first and i == 0)
        p.space_after = Pt(size * (spacing - 1))
    return tb

# ── Helper: Rectangle / Rule ───────────────────────────
def rule(slide, left, top, width, height_pt, color=CRIMSON):
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(left), Inches(top), Inches(width), Pt(height_pt))
    s.fill.solid(); s.fill.fore_color.rgb = color; s.line.fill.background()
    return s

def rect_filled(slide, left, top, w, h, color, radius=None):
    """Filled rounded rectangle"""
    s = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE,
                               Inches(left), Inches(top), Inches(w), Inches(h))
    s.fill.solid(); s.fill.fore_color.rgb = color; s.line.fill.background()
    return s

# ── Helper: Slide Header ───────────────────────────────
def header(slide, title, subtitle=None, slide_num=None):
    bg(slide, BG_SLIDE)
    # Navy top band
    rect_filled(slide, 0, 0, 13.333, 1.25, NAVY)
    txt(slide, 0.7, 0.20, 11.5, 0.60, title, size=26, color=WHITE, bold=True)
    rule(slide, 0.7, 0.85, 1.5, 3, CRIMSON)
    if subtitle:
        txt(slide, 0.7, 0.92, 11.5, 0.35, subtitle, size=11, color=GRAY40)
    if slide_num:
        txt(slide, 12.2, 0.30, 0.8, 0.40, str(slide_num), size=12, color=RGBColor(0x88,0x99,0xAA), align=PP_ALIGN.RIGHT)

# ── Helper: Table ──────────────────────────────────────
def add_table(slide, left, top, col_widths, headers, rows, *, font_size=11,
              hdr_bg=NAVY, hdr_fg=WHITE, row_bg=BG_TABLE):
    n_rows = len(rows) + 1
    n_cols = len(headers)
    ts = slide.shapes.add_table(n_rows, n_cols,
                                Inches(left), Inches(top),
                                Inches(sum(col_widths)), Inches(0.42 * n_rows))
    tbl = ts.table
    for ci, cw in enumerate(col_widths):
        tbl.columns[ci].width = Inches(cw)
    # header
    for ci, h in enumerate(headers):
        c = tbl.cell(0, ci); c.text = ''
        p = c.text_frame.paragraphs[0]
        p.text = h; p.font.size = Pt(font_size); p.font.bold = True
        p.font.color.rgb = hdr_fg; p.font.name = FONT_CJK; p.alignment = PP_ALIGN.LEFT
        c.fill.solid(); c.fill.fore_color.rgb = hdr_bg
        c.margin_left = Cm(0.2); c.margin_right = Cm(0.2)
    # data
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            c = tbl.cell(ri + 1, ci); c.text = ''
            p = c.text_frame.paragraphs[0]
            p.text = str(val); p.font.size = Pt(font_size); p.font.color.rgb = BLACK
            p.font.name = FONT_CJK; p.alignment = PP_ALIGN.LEFT
            c.margin_left = Cm(0.2); c.margin_right = Cm(0.2)
            if ri % 2 == 1:
                c.fill.solid(); c.fill.fore_color.rgb = row_bg
            else:
                c.fill.solid(); c.fill.fore_color.rgb = WHITE
    return ts

# ── Helper: Evidence Badge ─────────────────────────────
def evidence_badge(slide, left, top, klass, loe):
    """klass: 'I'/'IIa'/'IIb'/'III', loe: 'A'/'B-R'/'B-NR'/'C'"""
    badge_w, badge_h = 1.0, 0.35
    color_map = {'I': RGBColor(0x1B, 0x7A, 0x2B), 'IIa': RGBColor(0x2E, 0x86, 0xC1),
                 'IIb': RGBColor(0xF3, 0x9C, 0x12), 'III': CRIMSON}
    c = color_map.get(klass, GRAY60)
    s = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(badge_w), Inches(badge_h))
    s.fill.solid(); s.fill.fore_color.rgb = c; s.line.fill.background()
    p = s.text_frame.paragraphs[0]
    p.text = f'Class {klass} · LOE {loe}'; p.font.size = Pt(8)
    p.font.color.rgb = WHITE; p.font.bold = True; p.font.name = FONT; p.alignment = PP_ALIGN.CENTER

# ── Helper: Chart Image ────────────────────────────────
def img(slide, path, left, top, width, height=None):
    if height is None: height = width * 0.56
    slide.shapes.add_picture(path, Inches(left), Inches(top), Inches(width), Inches(height))

# ── Helper: Number Circle ──────────────────────────────
def num_circle(slide, num, x, y, color=CRIMSON, sz=0.5):
    s = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(sz), Inches(sz))
    s.fill.solid(); s.fill.fore_color.rgb = color; s.line.fill.background()
    p = s.text_frame.paragraphs[0]; p.text = str(num)
    p.font.size = Pt(16); p.font.bold = True; p.font.color.rgb = WHITE; p.alignment = PP_ALIGN.CENTER

# ═══════════════════════════════════════════════════════
#  CHARTS  (JAMA / NEJM style — clean, data-ink max)
# ═══════════════════════════════════════════════════════

def chart_aging_demographics():
    """Dual panel: left=中国 aging trend, right=age-CVD gradient"""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5.0), facecolor='white')

    # ── Panel A: 中国 aging ──
    years = np.array([2000,2005,2010,2015,2020,2025,2030,2035,2040,2050])
    p65 = np.array([7.0,7.7,8.9,10.5,13.5,15.6,18.2,22.8,26.5,30.0])
    p80 = np.array([1.2,1.5,1.9,2.4,3.0,3.6,4.5,6.2,8.3,11.5])
    ax1.fill_between(years, 0, p65, color=H_NAVY, alpha=0.12)
    ax1.fill_between(years, 0, p80, color=H_CRIMSON, alpha=0.25)
    ax1.plot(years, p65, color='#0B2A45', lw=2.5, marker='o', markersize=5, label='≥65岁')
    ax1.plot(years, p80, color='#C41E3A', lw=2.5, marker='s', markersize=5, label='≥80岁')
    for yr, v in [(2025,15.6),(2035,22.8),(2050,30.0)]:
        ax1.annotate(f'{v}%', (yr, v), textcoords="offset points", xytext=(0,10),
                     fontsize=9, fontweight='bold', color='#0B2A45', ha='center')
    ax1.set_title('A  中国人口老龄化趋势', fontsize=13, fontweight='bold', color='#0B2A45', loc='left', pad=10)
    ax1.set_ylabel('占总人口比例 (%)', fontsize=10); ax1.set_xlim(1997, 2053); ax1.set_ylim(0, 35)
    ax1.legend(fontsize=9, frameon=False); ax1.grid(True, alpha=0.3)
    ax1.annotate('数据来源: 联合国世界人口展望 2024; 中国国家统计局预测',
                 xy=(0.01, -0.18), fontsize=7, color='#888888', xycoords='axes fraction')

    # ── Panel B: CVD burden by age ──
    ages = ['25–44','45–64','65–74','75–84','≥85']
    cvd  = [3.2, 12.8, 28.5, 42.1, 55.3]
    af   = [0.5,  2.3,  5.8, 10.2, 15.0]
    poly = [6,   18,   36,   50,   62]
    x = np.arange(len(ages)); w = 0.25
    ax2.bar(x - w, cvd, w, color='#0B2A45', alpha=0.85, label='心血管病')
    ax2.bar(x,      af,  w, color='#C41E3A', alpha=0.85, label='房颤')
    ax2.bar(x + w, poly, w, color='#888888', alpha=0.65, label='多重用药 (×0.8)')
    ax2.set_xticks(x); ax2.set_xticklabels(ages, fontsize=10)
    ax2.set_title('B  心血管病与多重用药的年龄分布', fontsize=13, fontweight='bold', color='#0B2A45', loc='left', pad=10)
    ax2.set_ylabel('患病率 (%)', fontsize=10)
    ax2.legend(fontsize=9, frameon=False); ax2.grid(True, alpha=0.3, axis='y')
    ax2.annotate('数据来源: NHANES 2017–2020; NCHS Data Brief', xy=(0.01, -0.18),
                 fontsize=7, color='#888888', xycoords='axes fraction')

    plt.tight_layout(pad=3)
    path = os.path.join(CHART_DIR, 'aging.png')
    fig.savefig(path, dpi=200, facecolor='white', bbox_inches='tight')
    plt.close(fig)
    return path


def chart_aspree_forest():
    """JAMA-style forest plot with numeric annotations"""
    fig, ax = plt.subplots(figsize=(12, 4.2), facecolor='white')

    endpoints = [
        ('主要终点\n(无残疾生存期)', 1.01, 0.92, 1.11),
        ('心血管事件',                       0.95, 0.83, 1.08),
        ('大出血',                            1.38, 1.18, 1.62),
        ('全因死亡率',                         1.14, 1.01, 1.29),
        ('癌症死亡率',                            1.31, 1.10, 1.56),
    ]

    ys = list(range(len(endpoints)))
    for i, (label, hr, lo, hi) in enumerate(endpoints):
        color = H_CRIMSON if hr > 1.0 else H_NAVY
        ax.plot([lo, hi], [i, i], color=color, lw=2.5, solid_capstyle='round')
        ax.plot(hr, i, 'D', color=color, markersize=9, markeredgecolor='white', markeredgewidth=0.8)
        ax.text(0.58, i, f'{hr:.2f} ({lo:.2f}–{hi:.2f})', va='center', fontsize=10, fontfamily='monospace',
                fontweight='bold', color=color)
        ax.text(-0.02, i, label.replace('\n',' '), va='center', ha='right', fontsize=10, color='#333333')

    ax.axvline(x=1.0, color='#333333', lw=1.2, ls='--', alpha=0.6)
    ax.set_ylim(-0.8, len(endpoints) - 0.2); ax.set_xlim(-0.15, 1.75)
    ax.set_yticks([])
    ax.set_xlabel('风险比 (95% 置信区间)', fontsize=11, color='#333333')
    ax.set_title('ASPREE: 阿司匹林 100 mg vs 安慰剂 — ≥70岁老年人 (N = 19,114, 中位随访 4.7 年)',
                 fontsize=14, fontweight='bold', color='#0B2A45', loc='left', pad=12)
    # Annotation boxes
    ax.text(0.80, -0.55, '← 倾向阿司匹林', fontsize=9, color='#0B2A45', ha='center', style='italic')
    ax.text(1.20, -0.55, '倾向安慰剂 →', fontsize=9, color='#C41E3A', ha='center', style='italic')
    ax.annotate('McNeil JJ et al. N Engl J Med 2018;379:1509–1539', xy=(0.01, -0.65), fontsize=8, color='#888888')

    plt.tight_layout()
    path = os.path.join(CHART_DIR, 'aspree.png')
    fig.savefig(path, dpi=200, facecolor='white', bbox_inches='tight')
    plt.close(fig)
    return path


def chart_guideline_shift():
    """Guideline shift — clean timeline, no decorative elements"""
    fig, ax = plt.subplots(figsize=(12, 3.8), facecolor='white')

    items = [
        (2016, '推荐\n(50–69岁, 风险≥10%)',      '#1B7A2B', 0.85),
        (2018, 'ASPREE\n发表',                      '#C41E3A', 0.15),
        (2019, 'IIb — 可考虑\n(40–70岁, 选择性)', '#2E86C1', 0.55),
        (2021, '不再推荐\n常规一级预防',  '#C41E3A', 0.15),
        (2022, '不建议启动\n年龄≥60岁',               '#C41E3A', 0.15),
        (2026, '仅个体化考虑\n40–70岁 + CAC>0',      '#2E86C1', 0.55),
    ]

    for yr, label, color, y in items:
        ax.plot(yr, y, 'o', color=color, markersize=22, markeredgecolor='white', markeredgewidth=2, zorder=5)
        offset = 0.18 if y > 0.35 else -0.18
        ax.text(yr, y + offset, label, ha='center', va='center' if offset < 0 else 'center',
                fontsize=9, fontweight='bold', color='#333333',
                bbox=dict(boxstyle='round,pad=0.4', facecolor='white', edgecolor=color, alpha=0.95))

    ax.set_ylim(-0.1, 1.1); ax.set_xlim(2013, 2028)
    ax.set_yticks([])
    ax.set_title('阿司匹林一级预防：指南演进 (2016–2026)',
                 fontsize=14, fontweight='bold', color='#0B2A45', loc='left', pad=12)
    ax.set_xlabel('')
    ax.spines['bottom'].set_visible(True); ax.spines['left'].set_visible(False)
    ax.tick_params(axis='x', colors='#888888')

    # Strength labels on right
    for lbl, ypos in [('强推荐', 0.85), ('可考虑', 0.55), ('反对', 0.15)]:
        ax.text(2027.5, ypos, lbl, fontsize=8, color='#888888', va='center', fontstyle='italic')

    plt.tight_layout()
    path = os.path.join(CHART_DIR, 'guideline.png')
    fig.savefig(path, dpi=200, facecolor='white', bbox_inches='tight')
    plt.close(fig)
    return path


def chart_statin_t2b():
    """Statin time-to-benefit — Gantt-style horizontal timeline"""
    fig, ax = plt.subplots(figsize=(12, 4.0), facecolor='white')

    phases = [
        (0, 0.08, 'LDL-C下降\n2–4周',       '#1F77B4'),
        (0.08, 0.42, '斑块稳定\n3–6月', '#FF7F0E'),
        (0.42, 0.83, 'MACE降低\n(需>2.5年)', '#2CA02C'),
        (0.83, 1.0, '终身\n获益',   '#2CA02C'),
    ]
    for start, end, label, color in phases:
        ax.barh(0.5, end - start, left=start, height=0.55, color=color, alpha=0.82, edgecolor='white', lw=1)
        ax.text(start + (end - start)/2, 0.5, label, ha='center', va='center', fontsize=9,
                color='white', fontweight='bold')

    # ---- Threshold line ----
    ax.axvline(x=0.42, color='#C41E3A', lw=2, ls='--', alpha=0.8)
    ax.text(0.42, 1.22, '临床获益阈值\n≈ 2.5 年', ha='center', fontsize=10,
            color='#C41E3A', fontweight='bold')

    # ---- Patient markers ----
    ax.annotate('张老  CFS 3\n预期生存 >10 年\n[+] 窗口敞亮', xy=(0.80, 1.60), fontsize=11,
                color='#1B7A2B', fontweight='bold', ha='center',
                bbox=dict(boxstyle='round,pad=0.5', facecolor='#E8F5E9', edgecolor='#1B7A2B'))
    ax.annotate('李老  CFS 7\n预期生存 <2 年\n[-] 窗口关闭', xy=(0.15, 1.60), fontsize=11,
                color='#C41E3A', fontweight='bold', ha='center',
                bbox=dict(boxstyle='round,pad=0.5', facecolor='#FFEBEE', edgecolor='#C41E3A'))

    ax.set_ylim(0, 2.3); ax.set_xlim(-0.02, 1.05)
    ax.set_yticks([])
    ax.set_xticks([0, 0.25, 0.50, 0.75, 1.0])
    ax.set_xticklabels(['Start', '3 mo', '1 yr', '3 yr', '5+ yr'], fontsize=10)
    ax.set_title('他汀获益潜伏期：投资何时获得回报？',
                 fontsize=14, fontweight='bold', color='#0B2A45', loc='left', pad=12)
    ax.annotate('Yourman LC et al. JAMA Intern Med 2021', xy=(0.01, -0.35), fontsize=8, color='#888888')
    ax.spines['bottom'].set_visible(True)
    for sp in ['top','right','left']: ax.spines[sp].set_visible(False)

    plt.tight_layout()
    path = os.path.join(CHART_DIR, 'statin.png')
    fig.savefig(path, dpi=200, facecolor='white', bbox_inches='tight')
    plt.close(fig)
    return path


def chart_cfs_gradient():
    """CFS-stratified treatment intensity — clean grouped bar"""
    fig, ax = plt.subplots(figsize=(12, 4.2), facecolor='white')

    cfs_labels = ['CFS 1–3\n(张老)', 'CFS 4', 'CFS 5', 'CFS 6', 'CFS ≥7\n(李老)']
    aspirin_vals = [95, 70, 40, 15, 5]
    statin_vals  = [95, 60, 30, 15, 5]

    x = np.arange(len(cfs_labels)); w = 0.32
    b1 = ax.bar(x - w/2, aspirin_vals, w, color='#0B2A45', alpha=0.85, label='阿司匹林')
    b2 = ax.bar(x + w/2, statin_vals,  w, color='#C41E3A', alpha=0.75, label='他汀')
    for bars in [b1, b2]:
        for bar in bars:
            ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1.5,
                    str(int(bar.get_height())), ha='center', fontsize=10, fontweight='bold',
                    color=bar.get_facecolor())

    ax.set_xticks(x); ax.set_xticklabels(cfs_labels, fontsize=11)
    ax.set_ylabel('治疗决策强度 (0–100)', fontsize=10)
    ax.set_ylim(0, 112)
    ax.set_title('衰弱校正后的治疗强度: 阿司匹林与他汀',
                 fontsize=14, fontweight='bold', color='#0B2A45', loc='left', pad=12)
    ax.legend(fontsize=10, frameon=True, facecolor='white', edgecolor='#DDD', loc='upper right')
    ax.grid(True, alpha=0.3, axis='y')

    plt.tight_layout()
    path = os.path.join(CHART_DIR, 'cfs.png')
    fig.savefig(path, dpi=200, facecolor='white', bbox_inches='tight')
    plt.close(fig)
    return path


def chart_5guidelines():
    """Convergence of 5 independent guidelines — horizontal alignment chart"""
    fig, ax = plt.subplots(figsize=(12, 3.5), facecolor='white')

    guides = [
        'STOPPFrail-2\n(Curtin 2021)',
        'Deprescribing.org\n(2026)',
        'PATH / Dalhousie\n(Mallery)',
        '苏格兰 多重用药\n(2026–2029)',
        '2026 ACC / AHA\nDyslipidemia',
    ]
    for i, g in enumerate(guides):
        ax.barh(i, 1.0, color='#F5F5F5', edgecolor='#DDD', lw=0.5, height=0.65)
        ax.barh(i, 0.72, color='#0B2A45', alpha=0.85, height=0.55)
        ax.text(0.02, i, g, va='center', fontsize=10, fontweight='bold', color='#0B2A45')
        ax.text(0.76, i, '→ CFS ≥7', va='center', fontsize=11, fontweight='bold', color='#C41E3A')

    # Convergence annotation
    ax.annotate('CFS ≥7\n汇聚\n阈值', xy=(0.72, 2.0), fontsize=12, fontweight='bold',
                color='#C41E3A', ha='center',
                bbox=dict(boxstyle='round,pad=0.6', facecolor='#FFEBEE', edgecolor='#C41E3A', lw=1.5))

    ax.set_xlim(0, 1.05); ax.set_ylim(-0.3, 4.8)
    ax.set_yticks([]); ax.set_xticks([])
    ax.set_title('五项独立指南 — 一个收敛信号',
                 fontsize=14, fontweight='bold', color='#0B2A45', loc='left', pad=12)
    for sp in ax.spines.values(): sp.set_visible(False)

    plt.tight_layout()
    path = os.path.join(CHART_DIR, '5g.png')
    fig.savefig(path, dpi=200, facecolor='white', bbox_inches='tight')
    plt.close(fig)
    return path


def chart_evidence_map():
    """Evidence quality × recommendation strength matrix"""
    fig, ax = plt.subplots(figsize=(11, 4.5), facecolor='white')

    # Grid
    ax.set_xlim(0, 10); ax.set_ylim(0, 10)
    ax.set_xticks([2, 5, 8]); ax.set_xticklabels(['RCT\n亚组分析', '观察性研究\n+ 共识', '专家\n共识'], fontsize=10)
    ax.set_yticks([2, 5, 8]); ax.set_yticklabels(['Class III\n(有害 / 无获益)', 'Class IIb\n(可考虑)', 'Class I / IIa\n(推荐)'], fontsize=10)

    # Quadrant backgrounds
    for xc, yc, alpha in [(2,2,0.06),(5,2,0.06),(8,2,0.06),(2,5,0.06),(5,5,0.06),(8,5,0.06),(2,8,0.06),(5,8,0.06),(8,8,0.04)]:
        ax.fill_between([xc-1.8, xc+1.8], yc-1.8, yc+1.8, color='#0B2A45', alpha=alpha)

    # Recommendations plotted
    points = [
        # (x, y, label, color)
        (2.0, 8.5, '阿司匹林一级预防\n年龄≥60 → 不使用', '#C41E3A'),
        (2.5, 8.5, '他汀二级预防\nCFS 1–4 → 继续', '#1B7A2B'),
        (5.5, 8.0, '阿司匹林二级预防\nCFS ≥7 → 去强化', '#F39C12'),
        (8.0, 7.5, '他汀\nCFS ≥7 → 停药', '#C41E3A'),
        (5.0, 5.5, '双联抗血小板疗程\nCFS ≥7 → 1–3个月', '#F39C12'),
    ]
    for px, py, label, color in points:
        ax.plot(px, py, 'o', color=color, markersize=18, markeredgecolor='white', markeredgewidth=2, zorder=5)
        ax.text(px + 0.3, py, label, fontsize=9, fontweight='bold', color=color, va='center')

    ax.set_xlabel('证据质量 →', fontsize=12, fontweight='bold', color='#0B2A45')
    ax.set_ylabel('推荐强度 →', fontsize=12, fontweight='bold', color='#0B2A45')
    ax.set_title('证据地图：推荐意见 × 支撑证据质量',
                 fontsize=14, fontweight='bold', color='#0B2A45', loc='left', pad=12)

    plt.tight_layout()
    path = os.path.join(CHART_DIR, 'evidence_map.png')
    fig.savefig(path, dpi=200, facecolor='white', bbox_inches='tight')
    plt.close(fig)
    return path


# ═══════════════════════════════════════════════════════
#  SLIDE CONSTRUCTION
# ═══════════════════════════════════════════════════════

print("Generating 7 charts (JAMA/NEJM journal style)...")
c_aging   = chart_aging_demographics()
c_aspree  = chart_aspree_forest()
c_guide   = chart_guideline_shift()
c_statin  = chart_statin_t2b()
c_cfs     = chart_cfs_gradient()
c_5g      = chart_5guidelines()
c_evmap   = chart_evidence_map()
print("Charts complete. Assembling 25 slides...")

def S(): return prs.slides.add_slide(prs.slide_layouts[6])

# ────────────────────────────────────────────────────────
# SLIDE 01 — TITLE
# ────────────────────────────────────────────────────────
sl = S(); dark_bg(sl)
txt(sl, 1.0, 1.2, 11.3, 1.2, '抗血小板 + 降脂稳斑', size=44, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
txt(sl, 1.0, 2.3, 11.3, 0.8, '衰弱老年人中的差异化决策', size=30, color=RGBColor(0xFF,0xCC,0xCC), align=PP_ALIGN.CENTER)
rule(sl, 4.8, 3.3, 3.5, 3, CRIMSON)
txt(sl, 1.0, 3.6, 11.3, 0.6, '基于 ASPREE · ACC/AHA 2026 · Nguyen et al. Nat Rev Cardiol 2026 等系统综述', size=14, color=GRAY40, align=PP_ALIGN.CENTER)
txt(sl, 1.0, 5.0, 11.3, 0.5, '院级学术讲座  |  2026', size=16, color=GRAY40, align=PP_ALIGN.CENTER)

# ────────────────────────────────────────────────────────
# SLIDE 02 — DISCLOSURE + LEARNING OBJECTIVES
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '信息披露与学习目标', '利益声明与学习目标', 2)
txt_multi(sl, 0.7, 1.7, 5.8, 1.2, [
    '利益声明',
    '讲者声明：本讲座内容基于公开发表的同行评审文献。',
    '无医药企业资助。所有药物推荐均基于已发表证据。',
    '本讲座不构成个体患者的治疗建议。',
], size=12, color=BLACK, spacing=1.5, bold_first=True)

txt_multi(sl, 7.0, 1.7, 5.5, 4.5, [
    '学习目标',
    '',
    '1. 理解衰弱（frailty）的流行病学负担',
    '   及其对心血管药物治疗的普遍影响',
    '',
    '2. 掌握 ASPREE 试验的关键数据',
    '   及其如何重塑阿司匹林一级预防指南',
    '',
    '3. 应用他汀「获益潜伏期」概念',
    '   判断不同衰弱程度患者的净获益',
    '',
    '4. 运用 CFS 分层框架',
    '   为衰弱老人制定个体化抗血小板+他汀方案',
], size=12, color=BLACK, spacing=1.3, bold_first=True)

# ────────────────────────────────────────────────────────
# SLIDE 03 — CLINICAL DILEMMA
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '一间病房，两个患者，同一张处方 —— 对吗？', '临床困境：同样的指南，不同的患者', 3)

add_table(sl, 0.7, 1.6, [1.8, 4.6, 4.6], ['', '张老', '李老'], [
    ['年龄 / 病史', '92 岁 · HTN ×20yr · DM ×15yr\n3 年前下壁心梗 + DES', '89 岁 · HTN ×20yr · DM ×15yr\n2 年前腔隙性脑梗死'],
    ['功能状态', '精神抖擞，腰杆笔直，\n自己走去厕所，说话铿锵有力', '精神萎靡，直直摊在床上，\n翻身需人帮助，只以眼神交流'],
    ['体重', '稳定', '半年内下降 4 kg（厌食）'],
    ['CFS', '3 — 疾病控制良好，功能独立', '7 — 完全依赖他人照护'],
    ['当前用药', '阿司匹林 100 mg qd\n阿托伐他汀 40 mg qd', '阿司匹林 100 mg qd\n阿托伐他汀 40 mg qd'],
], font_size=11)

txt_multi(sl, 0.7, 4.8, 11.8, 2.2, [
    '核心矛盾',
    '• 按现行指南，两人都是「二级预防 · Class I · Level of Evidence A」—— 阿司匹林 + 高强度他汀',
    '• 但 RCT 平均入组年龄 60–65 岁，CFS ≥5 的患者几乎未被纳入任何心血管 RCT',
    '• 临床问题：把同一份说明书用在 CFS 3 和 CFS 7 的患者身上 —— 这本身就是一个需要证据支持的临床推断',
    '',
    '本讲目标：系统审视现有证据，为这个「推断」提供边界条件和不确定性量化。',
], size=13, color=BLACK, spacing=1.4, bold_first=True)

# ────────────────────────────────────────────────────────
# SLIDE 04 — GLOBAL AGING
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '人口老龄化：心血管用药决策的时代背景', '人口统计学背景', 4)
img(sl, c_aging, 0.5, 1.5, 7.5, 4.5)
txt_multi(sl, 8.5, 1.6, 4.3, 5.0, [
    '关键事实',
    '',
    '▸ 全球 ≥65 岁:',
    '   2020 年 7.3 亿 (9.3%)',
    '   2050 年 16 亿 (16.0%)',
    '',
    '▸ 中国:',
    '   2025 年 ≥65 岁 = 2.2 亿',
    '   2035 年 ≥65 岁 = 3.1 亿',
    '   → 超总人口 1/5',
    '',
    '▸ ≥85 岁:',
    '   CVD 患病率 >55%',
    '   房颤患病率 10–15%',
    '   多重用药率 78%',
    '',
    '▸ 临床含义:',
    '   每 5 位门诊患者就有 ≥1 位',
    '   是 ≥65 岁的老人。',
    '   每位心内科医生每天都在做',
    '   老年心血管用药决策。',
], size=12, color=BLACK, spacing=1.3)

# ────────────────────────────────────────────────────────
# SLIDE 05 — FRAILTY EPIDEMIOLOGY
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '衰弱：被 RCT 系统性排除的「沉默多数」', '衰弱 — 试验人群与真实世界患者之间的证据鸿沟', 5)

txt_multi(sl, 0.7, 1.6, 7.0, 3.0, [
    '▸ 衰弱患病率 (Fried phenotype, ≥3 of 5)',
    '   ≥65 岁: 10–15%        ≥80 岁: 25–50%        护理院: >50%',
    '',
    '▸ 衰弱是心血管不良预后的独立预测因子',
    '   心梗后死亡率增加 2–3 倍 (HR adjusted)',
    '   独立于年龄、共病数量、LVEF',
    '',
    '▸ The Evidence Gap',
    '   心血管 RCT 平均入组年龄: 60–65 岁',
    '   衰弱患者占比: <10%',
    '   CFS ≥5: virtually excluded from CV RCTs',
    '   → 证据基础与临床实践之间存在结构性缺口',
], size=14, color=BLACK, spacing=1.4)

add_table(sl, 8.3, 1.6, [2.2, 2.1, 2.3], ['', '试验患者', '真实世界 (李老)'], [
    ['Age', '60–65', '89'],
    ['CFS', '1–3', '7'],
    ['Comorbidities', '1–2', '5–8'],
    ['Medications', '2–4', '12–15'],
    ['多重用药', 'Excluded', 'Norm'],
    ['Fall Risk', 'Minimal', 'High'],
], font_size=10)

txt_multi(sl, 0.7, 5.7, 11.8, 1.2, [
    'Nguyen TN et al. Nat Rev Cardiol 2026;23(6):433–443 — 首篇针对衰弱患者 6 类心血管药物的系统综述。',
], size=10, color=GRAY60, spacing=1.2)

# ────────────────────────────────────────────────────────
# SLIDE 06 — FRAILTY DEFINITION (DEDICATED)
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '衰弱的定义与评估：把临床直觉转化为可操作的量化指标', '衰弱的操作性定义、评估工具及其药理学意义', 6)

txt_multi(sl, 0.7, 1.6, 5.8, 3.0, [
    '▸ Fried衰弱表型 (Fried LP, 2001)',
    '   5 criteria — positive if ≥3:',
    '',
    '   ① 非自主性体重下降  (>5% or >4.5 kg in 1 yr)',
    '   ② 疲乏  (self-reported, CES-D scale)',
    '   ③ 握力下降  (lowest 20%, sex+BMI adjusted)',
    '   ④ 步速减慢  (slowest 20%, 4.57 m walk)',
    '   ⑤ 活动量减少  (lowest 20%, kcal/week)',
    '',
    '   J Gerontol A Biol Sci Med Sci. 2001;56(3):M146–M156.',
], size=12, color=BLACK, spacing=1.3)

txt_multi(sl, 7.2, 1.6, 5.5, 3.0, [
    '▸ Critical Distinction',
    '',
    '   Frailty ≠ Comorbidity ≠ Disability',
    '',
    '   • 可共病不衰弱（控制良好的 HTN+DM）',
    '   • 可衰弱无明确共病（高龄肌少症）',
    '   • 失能是功能结局，衰弱是生理储备',
    '',
    '   → 用药决策需要「衰弱等级」',
    '     而非「疾病计数」',
    '',
    '▸ 衰弱如何改变药理学',
    '   • PK: 肝代谢↓ 肾清除↓ Vd 改变',
    '   • PD: 不良反应敏感性↑↑',
    '   • 治疗目标: 延长寿命 → 维持功能+QoL',
], size=12, color=BLACK, spacing=1.3)

add_table(sl, 0.7, 5.2, [2.2, 1.3, 2.2, 6.6], ['Tool', 'Time', 'Setting', 'Clinical Value'], [
    ['临床衰弱量表 (CFS)', '<1 分钟', '床旁/诊室', '无需设备。1–9 级。本讲座核心工具。'],
    ['Fried 衰弱表型', '5–10 分钟', '研究/专科', '金标准定义。需要握力计 + 秒表。'],
    ['步速', '<1 分钟', '床旁', '单条目替代指标。<0.8 m/s = 异常。不可替代完整评估。'],
], font_size=10)

# ────────────────────────────────────────────────────────
# SLIDE 07 — CFS SCALE
# ────────────────────────────────────────────────────────
sl = S(); header(sl, 'Clinical Frailty Scale (CFS)：<1 分钟床旁量化工具', 'Rockwood K et al. CMAJ 2005;173(5):489–495', 7)

add_table(sl, 0.7, 1.6, [1.3, 3.5, 3.5, 3.8], ['CFS', '描述', 'Trial Coverage', 'Treatment Implication'], [
    ['1–2', 'Very fit / 健康', 'Core RCT population', 'Guidelines apply directly'],
    ['3', '慢性病控制良好', '接近标准', '← 张老: 标准治疗'],
    ['4', '脆弱, "slowed down"', 'Moderate inclusion', 'Minor adjustments'],
    ['5', 'Mildly frail, IADL dependent', 'Sparse inclusion', 'Reduce dose, relax targets'],
    ['6', 'Moderately frail, ADL help needed', 'Rare inclusion', 'Major de-escalation'],
    ['7', 'Severely frail, fully dependent', 'Virtually excluded', '← Li: Consider deprescribing'],
    ['8–9', 'Very severely frail / Terminally ill', 'Never included', 'Comfort-directed care'],
], font_size=10)

txt_multi(sl, 0.7, 5.5, 11.8, 1.2, [
    '「CFS 3 的患者，指南基本适用。CFS ≥7 的患者，我们进入了 RCT 的未探索地带 —— 需要依靠间接证据、',
    '观察性研究和专家共识来指导决策。」— adapted from Nguyen et al. Nat Rev Cardiol 2026',
], size=12, color=CRIMSON, spacing=1.4)

# ────────────────────────────────────────────────────────
# SLIDE 08 — MECHANISM (ATHEROSCLEROSIS LIFECYCLE)
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '动脉粥样硬化生命周期：他汀与阿司匹林的作用时点根本不同', '动脉粥样硬化生命周期 — 为什么这两种药物不能"捆绑"使用', 8)

# Mechanism diagram in text
txt_multi(sl, 0.7, 1.6, 11.8, 2.8, [
    '病理生理与药物靶点',
    '',
    '    数十年的斑块形成                               数分钟的斑块破裂',
    '   ←─────────────────────────────────────→          ←──────────────────────────→',
    '',
    '   内皮损伤   →   低密度脂蛋白沉积   →   炎症反应   →   纤维帽   →   破裂   →   血小板   →   血栓形成   →   心梗/',
    '                                                      变薄                       聚集                       卒中',
    '',
    '                     ↑ 他汀起效位置                                    ↑ 阿司匹林起效位置',
    '                 LDL-C降低 + 斑块稳定 + 抗炎                     COX-1抑制 → 减少血栓素A₂',
    '                 获益潜伏期: 约2.5年才能预防MACE                     获益起效: 即刻',
    '',
    '   临床意义: 他汀是长期投资 — 患者必须存活足够久才能获益。阿司匹林是即刻保护 —',
    '                         但出血风险也是即刻的。衰弱主要压缩的是时间窗口。',
], size=12, color=BLACK, spacing=1.25)

add_table(sl, 0.7, 4.8, [3.5, 4.0, 4.0], ['衰弱相关变化', '对他汀的影响', '对阿司匹林的影响'], [
    ['预期寿命缩短', '获益窗口可能关闭', '影响小（获益是即刻的）'],
    ['肌肉量 ↓ (肌少症)', '他汀相关肌痛 ↑', '—'],
    ['跌倒风险 ×3–5', '—', '颅内出血风险 ↑'],
    ['多重用药 (8–15 种药物)', '药物相互作用风险 ↑', '非甾体抗炎药/激素/抗凝药相互作用 → 消化道出血 ↑↑'],
    ['低白蛋白血症', '—', '游离药物浓度 ↑'],
    ['进食减少 / 体重下降', '—', '胃黏膜防御能力 ↓ → 消化道出血 ↑'],
], font_size=10)

# ────────────────────────────────────────────────────────
# SLIDE 09 — ASPREE FOREST PLOT
# ────────────────────────────────────────────────────────
sl = S(); header(sl, 'ASPREE 试验：一个研究改变了阿司匹林一级预防的叙事', 'ASPREE — N = 19,114, 阿司匹林 100 mg vs 安慰剂, 中位随访 4.7 年. 因无效提前终止.', 9)
img(sl, c_aspree, 0.5, 1.5, 12.3, 4.2)
txt_multi(sl, 0.7, 5.8, 11.8, 1.2, [
    '三项决定性发现: (1) 无心血管获益 — HR 0.95 (0.83–1.08), 跨越1.0; (2) 全因死亡率增加 — HR 1.14 (1.01–1.29);',
    '(3) 癌症死亡率 ↑31% — 意外信号. 2026 ASPREE-XT (8.6 年随访): 脑癌 ↑96% (HR 1.96), 确诊后癌症死亡率 ↑15%.',
    '假说: 年龄相关的免疫衰老 + 阿司匹林 → 损害抗肿瘤免疫监视. McNeil JJ et al. N Engl J Med 2018;379:1509–1539.',
], size=11, color=GRAY60, spacing=1.3)

# ────────────────────────────────────────────────────────
# SLIDE 10 — GUIDELINE EVOLUTION
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '阿司匹林一级预防：指南适应性收缩 (2016–2026)', '从广泛推荐到严格限制 — 指南演进的十年轨迹', 10)
img(sl, c_guide, 0.5, 1.5, 12.3, 3.6)
txt_multi(sl, 0.7, 5.4, 11.8, 1.5, [
    '关键转变: ASPREE发表前 (2016), USPSTF 推荐阿司匹林用于 50–69岁 + 10年心血管风险≥10%.',
    'ASPREE发表后(2018→2022): ESC"不再推荐常规一级预防。" USPSTF: "不建议≥60岁启动"(Grade D)。',
    '2026 ACC声明: 仅40–70岁+高ASCVD风险+低出血风险+CAC>0→个体化考虑(Class IIb)。',
    '年龄上限不断下移。适用范围不可逆转地收窄。',
], size=12, color=BLACK, spacing=1.4)

# ────────────────────────────────────────────────────────
# SLIDE 11 — ASPIRIN DECISION FRAMEWORK
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '阿司匹林在衰弱老人中的决策框架', '阿司匹林决策逻辑 — 不是 "一级vs二级预防", 而是衰弱校正后的净获益', 11)

add_table(sl, 0.7, 1.6, [2.5, 4.5, 4.5], ['', '张老 (CFS 3)', '李老 (CFS 7)'], [
    ['适应证', '二级预防 (心梗 + DES 3年前)', '二级预防 (腔隙性梗死 2年前)'],
    ['是否使用阿司匹林?', 'YES. 二级预防获益已明确.', '倾向于停药. 出血风险 > 残余获益.'],
    ['药物 / 剂量', '阿司匹林 100 mg qd', '如果必须维持 → 氯吡格雷 75 mg + 质子泵抑制剂'],
    ['证据',
     'ISIS-2, ATT Collaboration.\nClass I, LOE A (二级预防).',
     'ASPREE (一级预防) + STOPPFrail-2 + PATH.\nClass IIb, LOE C (CFS ≥7).'],
    ['逻辑链',
     'CFS 3 ≈ RCT标准患者.\n指南直接适用.',
     '① ASPREE: 健康老人一级预防 ↑ 死亡\n② 李老比ASPREE队列更衰弱 → 出血风险 > ASPREE\n③ 卧床无法及时报告症状 → 出血更致命\n→ 即使是二级预防, 净获益也存疑'],
], font_size=10)

evidence_badge(sl, 0.7, 5.5, 'I', 'A')
txt(sl, 1.9, 5.45, 3.5, 0.35, '张老: 标准二级预防', size=10, color=BLACK)
evidence_badge(sl, 0.7, 5.9, 'IIb', 'C')
txt(sl, 1.9, 5.85, 4.0, 0.35, '李老: 停用阿司匹林 (CFS ≥7)', size=10, color=BLACK)

txt_multi(sl, 7.5, 5.5, 5.3, 1.5, [
    '衰弱老人的双联抗血小板:',
    '• CFS ≥7 + PRECISE-DAPT ≥25',
    '   → 缩短DAPT至 1–3 个月',
    '• 首选 P2Y12 抑制剂: 氯吡格雷',
    '   (P2Y12中出血风险最低)',
    '• 消化道保护: 质子泵抑制剂必须使用',
], size=10, color=BLACK, spacing=1.3)

# ────────────────────────────────────────────────────────
# SLIDE 12 — STATIN EVIDENCE OVERVIEW
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '他汀在衰弱老人中的证据现状', '衰弱患者他汀证据 — 已知与未知', 12)

txt_multi(sl, 0.7, 1.6, 6.0, 3.5, [
    '▸ RCT明确告知我们的',
    '   • 二级预防: 各年龄亚组的MACE均稳健降低',
    '   • 一级预防 (≥75岁): 证据持续不确定',
    '   • PREVENTABLE & STAREE — 两项里程碑式的进行中试验',
    '',
    '▸ RCT未告知我们的',
    '   • 衰弱患者几乎被所有他汀试验排除',
    '   • 没有试验按CFS或Fried标准进行分层随机化',
    '   • CFS ≥5的获益: 完全基于外推',
    '',
    '▸ 获益潜伏期 (TTB) 概念',
    '   Yourman LC et al. JAMA Intern Med 2021.',
    '   8项RCT, 65,383名受试者, 生存荟萃分析.',
    '   → 他汀一级预防需约2.5年才能每100人预防1例MACE.',
    '   Only 1 of 8 RCTs showed all-cause mortality benefit.',
], size=12, color=BLACK, spacing=1.3)

txt_multi(sl, 7.5, 1.6, 5.2, 3.5, [
    '▸ How Frailty Changes the Equation',
    '',
    '   1. Competing mortality risk ↑',
    '      → NNT increases (fewer patients survive',
    '        long enough to derive benefit)',
    '',
    '   2. Statin-associated muscle symptoms ↑',
    '      → Sarcopenic patients at higher risk',
    '',
    '   3. 多重用药 burden ↑',
    '      → Each additional pill adds complexity',
    '',
    '   4. 1° vs 2° prevention distinction',
    '      is critical: TTB only meaningful',
    '      when benefit is expected',
], size=12, color=BLACK, spacing=1.3)

# ────────────────────────────────────────────────────────
# SLIDE 13 — STATIN T2B
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '他汀获益潜伏期 ≈ 2.5 年 —— 为什么这个数字在衰弱老人中至关重要？', '他汀获益潜伏期: 个体化决策的分析框架', 13)
img(sl, c_statin, 0.5, 1.5, 12.3, 3.6)

txt_multi(sl, 0.7, 5.4, 11.8, 1.5, [
    '临床转化: 对于预期生存 <2年的患者 (CFS ≥7), 启动或继续他汀治疗无法带来MACE',
    '降低 — 获益窗口永不开启。药物变成"负担"而非"预防"。相反, 对于 CFS 1–3',
    '(预期生存 >10年), 他汀2.5年的获益潜伏期只是剩余生命的一小部分 — 获益窗口完全敞开。',
], size=12, color=BLACK, spacing=1.4)

# ────────────────────────────────────────────────────────
# SLIDE 14 — LDL-C TARGETS × FRAILTY
# ────────────────────────────────────────────────────────
sl = S(); header(sl, 'LDL-C 目标：随衰弱程度而松弛', '"Treat to Target" → "Treat to Tolerate" — 衰弱校正后的LDL-C目标', 14)

add_table(sl, 0.7, 1.6, [1.3, 2.8, 3.8, 4.2], ['CFS', '一级预防', '二级预防', 'LDL-C 目标'], [
    ['1–3 (张老)', '共享决策; ≥75岁可考虑CAC', '继续, 标准强度', '<70 mg/dL (极高危 <55)'],
    ['4', '倾向于不启动', '继续', '<70 mg/dL'],
    ['5', '不启动 / 停药', '继续, 降低强度', '<100 mg/dL (放宽)'],
    ['6', '停药', '维持最低起始剂量', '<100 mg/dL (宽松)'],
    ['≥7 (李老)', '停药', '可考虑停药', '不设目标值'],
], font_size=11)

txt_multi(sl, 0.7, 4.2, 11.8, 2.2, [
    'Statin Intensity Reference',
], size=13, color=BLACK, spacing=1.2, bold_first=True)

add_table(sl, 0.7, 4.7, [1.8, 1.8, 2.8, 2.6, 2.6], ['Intensity', 'LDL-C ↓', '阿托伐他汀', '瑞舒伐他汀', 'Suitable For'], [
    ['High', '≥50%', '40–80 mg', '20–40 mg', '张老 (CFS 3): 极高危'],
    ['Moderate', '30–49%', '10–20 mg', '5–10 mg', 'CFS 5–6: 二级预防'],
    ['Low', '<30%', '10 mg', '—', 'CFS ≥7: 若必须保留他汀'],
], font_size=10)

# ────────────────────────────────────────────────────────
# SLIDE 15 — 5 GUIDELINES CONVERGE
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '五大独立指南收敛于 CFS ≥7', '方法学交叉验证 — 不同方法，同一阈值', 15)
img(sl, c_5g, 0.5, 1.0, 12.3, 3.4)

txt_multi(sl, 0.7, 4.8, 11.8, 2.2, [
    '解读:',
    '• 五项独立指南/工具, 使用不同的方法学 (德尔菲共识、系统综述、专家委员会、',
    '   真实世界校准), 全部将 CFS ≥7 确定为应考虑停用他汀的阈值。',
    '• 这不是"一个观点被重复说了五次"。这是来自独立证据线的汇聚效度。',
    '• 用流行病学术语: 该信号对方法学变异具有稳健性 — 这是可靠发现的标志。',
    '',
    'Curtin D et al. Age Ageing 2021.  Mallery L et al. PATH/Dalhousie.  苏格兰多重用药指南 2026–2029.  ACC/AHA 2026.  Deprescribing.org 2026.',
], size=12, color=BLACK, spacing=1.3)

# ────────────────────────────────────────────────────────
# SLIDE 16 — CASE: ZHANG
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '案例解析：张老 (CFS 3)', '案例解析 — 衰弱匹配的标准治疗', 16)

txt_multi(sl, 0.7, 1.6, 5.5, 4.5, [
    '评估',
    '• CFS 3: 慢性病控制良好，',
    '   功能独立，规律行走',
    '• 预期生存: >10 年',
    '• 心梗+DES术后3年 → DAPT已完成 → 单抗血小板',
    '',
    '推荐意见',
    '',
    '▸ 阿司匹林 100 mg qd  — 继续使用',
    '   Class I, LOE A (二级预防)',
    '',
    '▸ 阿托伐他汀 40 mg qd  — 继续使用',
    '   Class I, LOE A (极高危二级预防)',
    '   目标: LDL-C <55 mg/dL (<1.4 mmol/L)',
    '',
    '▸ 质子泵抑制剂: 非必须',
    '   (无消化道症状, 无非甾体抗炎药/激素联用)',
], size=13, color=BLACK, spacing=1.3)

txt_multi(sl, 7.5, 1.6, 5.0, 4.5, [
    '理由',
    '',
    'CFS 3 非常接近心血管RCT中的',
    '"标准患者"画像。',
    '指南推荐直接适用，',
    '无需过多调整。',
    '',
    '▸ 他汀获益潜伏期: 2.5 年 ≪ >10 年生存',
    '   → 获益窗口完全敞开。',
    '',
    '▸ 阿司匹林出血风险: 基线水平',
    '   → 净获益明确为正向。',
    '',
    '▸ 每12个月重新评估，若功能状态',
    '   发生变化则提前评估。',
    '',
    '"指南就是为张老这样的患者写的。"',
], size=13, color=BLACK, spacing=1.3)

# ────────────────────────────────────────────────────────
# SLIDE 17 — CASE: LI
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '案例解析：李老 (CFS 7)', '案例解析 — 停药也是一种治疗', 17)

txt_multi(sl, 0.7, 1.6, 5.5, 5.0, [
    '评估',
    '• CFS 7: 完全依赖他人, 卧床,',
    '   非自主性体重下降, 无法',
    '   可靠报告症状',
    '• 预期生存: <2 年',
    '• 2年前腔隙性梗死 — 远期事件',
    '',
    '推荐意见',
    '',
    '▸ 阿司匹林 100 mg qd  — 停用',
    '   Class IIb, LOE C (CFS ≥7 二级预防)',
    '   若近期事件 (<6月): 氯吡格雷 + PPI',
    '',
    '▸ 阿托伐他汀 40 mg qd  — 停用',
    '   Class IIb, LOE C (获益潜伏期 > 预期生存)',
    '   若家属坚持: 阿托伐他汀 ≤10 mg,',
    '   不复查血脂',
], size=13, color=BLACK, spacing=1.3)

txt_multi(sl, 7.5, 1.6, 5.0, 5.0, [
    '理由',
    '',
    '▸ 他汀获益潜伏期 2.5 年 > 预期生存',
    '   <2 年 → 获益窗口已关闭。',
    '   药物无法预防患者',
    '   等不到的事件。',
    '',
    '▸ 阿司匹林: 出血风险在 CFS 7 时被放大',
    '   (卧床 → 无法及时报告',
    '   黑便/头晕)。ASPREE 显示',
    '   即使在健康老人中也增加了死亡率',
    '   — 李老比他们衰弱得多。',
    '',
    '▸ 沟通要点:',
    '   "我们不是在放弃您的母亲。',
    '   我们是在将治疗重心从预防',
    '   转向生活质量——更少的药片,',
    '   更好的食欲, 更低的出血风险。',
    '   这本身就是治疗。"',
], size=12, color=BLACK, spacing=1.3)

# ────────────────────────────────────────────────────────
# SLIDE 18 — SUMMARY TABLE
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '两个患者，四个问题的回答', '同样的问题 — 完全不同的答案', 18)

add_table(sl, 0.7, 1.6, [1.5, 4.5, 4.5], ['问题', '张老 (CFS 3)', '李老 (CFS 7)'], [
    ['用药?', '阿司匹林: 用. 他汀: 用.\n标准二级预防.', '阿司匹林: 倾向于停.\n他汀: 停.'],
    ['剂量?', '标准剂量.\n阿司匹林 100 mg + 阿托伐他汀 40 mg.', '若保留 → 最低有效剂量.\n氯吡格雷 75 mg + 阿托伐他汀 ≤10 mg.'],
    ['目标?', 'LDL-C <55 mg/dL\n(极高危).', '不设LDL-C目标.\n不复查血脂.'],
    ['证据?', '强: 多项RCT.\nClass I, LOE A.', '中等: 5项独立指南\n汇聚于 CFS ≥7. Class IIb, LOE C.'],
], font_size=12)

txt_multi(sl, 0.7, 4.5, 11.8, 2.2, [
    '核心信息',
    '',
    '指南的"基石"推荐 — 阿司匹林+高强度他汀用于二级预防 — 来源于',
    '并在类似张老 (CFS 1–3) 的人群中得到验证。将这些证据应用于李老 (CFS 7) 是跨越',
    '没有任何RCT桥接过的衰弱梯度的外推。承认我们证据的边界是迈向更优质诊疗的第一步。',
], size=13, color=BLACK, spacing=1.4)

# ────────────────────────────────────────────────────────
# SLIDE 19 — CFS GRADIENT CHART
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '衰弱梯度：CFS 是阿司匹林+他汀决策的核心变量', '衰弱梯度 — 治疗强度随CFS升高而递减', 19)
img(sl, c_cfs, 0.5, 1.5, 8.5, 3.8)
txt_multi(sl, 9.5, 1.6, 3.3, 5.0, [
    '决策梯度',
    '',
    'CFS 1–3:',
    '• 标准治疗',
    '• RCT证据直接适用',
    '',
    'CFS 4:',
    '• 轻微调整',
    '',
    'CFS 5–6:',
    '• 降低强度',
    '• 放宽目标',
    '',
    'CFS ≥7:',
    '• 考虑停药',
    '• 获益窗口存疑',
    '',
    '这一梯度适用于阿司匹林',
    '和他汀两者，',
    '但理由不同',
    '(出血 vs 获益潜伏期)。',
], size=11, color=BLACK, spacing=1.3)

# ────────────────────────────────────────────────────────
# SLIDE 20 — DECISION ALGORITHM
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '衰弱老人抗血小板 + 他汀临床决策流程', '面向繁忙临床医生的床旁决策算法', 20)

steps = [
    ('1', '评估 CFS (<1 分钟)\n确定衰弱等级 (1–9)'),
    ('2', '估算预期剩余寿命\nCFS 1–3: >10年 | 4–5: 3–10年 | 6–7: 1–3年 | 8–9: <1年'),
    ('3', '他汀决策\n一级预防 + CFS ≥4 → 倾向于不启动 | 一级预防 + CFS ≥5 → 停药\n二级预防 + CFS ≤4 → 继续 | 二级预防 + CFS 5–6 → 减量\n二级预防 + CFS ≥7 → 考虑停药\n核心: 获益潜伏期 2.5 年 vs 预期生存时间'),
    ('4', '阿司匹林决策\n一级预防 + 任何≥60岁 → 不使用 (USPSTF Grade D)\n二级预防 + CFS ≤4 → 标准剂量 | 二级预防 + CFS 5–6 → 减量\n二级预防 + CFS ≥7 → 考虑停药 (若近期事件 <1年 → 氯吡格雷 + PPI)\n核心: 出血风险 (跌倒/慢性肾病/多重用药) vs 血栓风险'),
    ('5', '与患者/家属共享决策\n使用三问框架: ① 这个药能为我做什么?\n② 可能造成什么伤害? ③ 如果停药会怎样?\n用获益潜伏期来沟通: "这个药大约需要X年才能起效——这与我们的治疗目标吻合吗?"\n每3–12个月重新评估 (取决于衰弱进展速度)'),
]

for i, (num, desc) in enumerate(steps):
    y = 1.6 + i * 1.1
    h = 1.3 if i == len(steps) - 1 else 0.9  # last step taller
    num_circle(sl, num, 0.7, y, color=NAVY, sz=0.45)
    txt(sl, 1.4, y, 11.0, h, desc, size=12, color=BLACK)

# ────────────────────────────────────────────────────────
# SLIDE 21 — EVIDENCE MAP
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '证据地图：推荐强度 × 证据质量', '证据地图 — 每条推荐位于何处', 21)
img(sl, c_evmap, 0.5, 1.5, 9.0, 4.5)

txt_multi(sl, 10.0, 1.6, 2.8, 5.0, [
    '阅读地图:',
    '',
    '左上区域:',
    '强证据 +',
    '强推荐',
    '(如 ASA 二级预防 CFS 3)',
    '',
    '右下区域:',
    '弱证据 +',
    '反对使用',
    '(如 他汀 CFS ≥7)',
    '',
    '中间区域:',
    '真正的临床平衡',
    '— 共享决策',
    '在此至关重要',
], size=11, color=BLACK, spacing=1.3)

# ────────────────────────────────────────────────────────
# SLIDE 22 — FOUR KEY CONCLUSIONS
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '四条核心结论', '四条可带回家的核心信息', 22)

conclusions = [
    ('1', '同一诊断，同一处方，未必是同一答案',
     '指南推荐来源于 CFS 1–3 人群。将其应用于 CFS ≥7 是外推 — 须知其边界。'),
    ('2', '他汀问题在获益端，阿司匹林问题在危害端',
     '他汀获益潜伏期约2.5年 — 预期生存<2年的患者无法获益。阿司匹林出血风险被衰弱放大 — 卧床患者出血更难发现，更致命。'),
    ('3', 'CFS 是核心决策变量',
     'CFS 1–3 → 标准治疗。CFS 5–6 → 降低强度，放宽目标。CFS ≥7 → 停药应作为默认选项，而非例外。LDL-C目标随CFS升高而放宽。'),
    ('4', '停药不是放弃 —— 是对现阶段更有意义的治疗',
     '当获益窗口已关闭，停药不是"放弃"。这是将治疗努力重新导向此刻真正重要的事物：生活质量、功能和尊严。'),
]

for i, (num, title, body) in enumerate(conclusions):
    y = 1.7 + i * 1.35
    num_circle(sl, num, 0.7, y, color=CRIMSON, sz=0.5)
    txt(sl, 1.5, y - 0.02, 11.0, 0.40, title, size=15, bold=True, color=NAVY)
    txt(sl, 1.5, y + 0.42, 11.0, 0.55, body, size=11, color=GRAY60)

# ────────────────────────────────────────────────────────
# SLIDE 23 — EVIDENCE QUALITY SUMMARY TABLE
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '主要推荐的证据质量汇总', '推荐意见汇总 — 推荐等级与证据级别', 23)

add_table(sl, 0.7, 1.6, [4.0, 2.0, 2.5, 3.5], ['推荐意见', '推荐等级', '证据级别', '支撑证据'], [
    ['阿司匹林一级预防: ≥60岁不启动', 'III (无获益)', 'A', 'ASPREE (RCT, n=19,114); USPSTF 2022; ESC 2021'],
    ['阿司匹林二级预防, CFS 1–4: 继续标准剂量', 'I', 'A', 'ISIS-2; ATT Collaboration; 多项RCT'],
    ['阿司匹林二级预防, CFS ≥7: 考虑停药', 'IIb', 'C', 'STOPPFrail-2; PATH/Dalhousie; ASPREE外推'],
    ['他汀二级预防, CFS 1–4: 继续高强度', 'I', 'A', 'CTT Collaboration; 多项RCT'],
    ['他汀二级预防, CFS 5–6: 降低强度，放宽目标', 'IIa', 'B-NR', 'Yourman获益潜伏期荟萃分析; 观察性数据'],
    ['他汀二级预防, CFS ≥7: 考虑停药', 'IIb', 'C', '五项指南汇聚; Deprescribing.org 2026'],
    ['DAPT疗程, CFS ≥7 + 高出血风险: 1–3个月', 'IIa', 'B-R', 'PRECISE-DAPT亚组; MASTER-DAPT'],
], font_size=10)

# ────────────────────────────────────────────────────────
# SLIDE 24 — REFERENCES
# ────────────────────────────────────────────────────────
sl = S(); header(sl, '主要参考文献', '关键参考文献', 24)

refs_left = [
    '1.  McNeil JJ et al. Effect of aspirin on cardiovascular events and',
    '     bleeding in the healthy elderly. N Engl J Med 2018;379:1509–1518.',
    '2.  McNeil JJ et al. Effect of aspirin on all-cause mortality in the',
    '     healthy elderly. N Engl J Med 2018;379:1519–1528.',
    '3.  Orchard SG et al. Long-term effects of aspirin on cancer outcomes',
    '     in healthy older adults (ASPREE-XT). JAMA Oncol 2026.',
    '4.  Nguyen TN et al. Optimizing cardiovascular pharmacotherapy in',
    '     older adults with frailty. Nat Rev Cardiol 2026;23(6):433–443.',
    '5.  Yourman LC et al. Time to benefit of statins for primary prevention',
    '     in adults aged 50–75 years. JAMA Intern Med 2021.',
    '6.  Das SK et al. Deprescribing preventive medications in older',
    '     adults with advanced frailty or limited life expectancy.',
    '     BMC Geriatr 2026. (15 studies, >33,000 — statin withdrawal safety)',
    '7.  Rockwood K et al. A global clinical measure of fitness and frailty',
    '     in elderly people. CMAJ 2005;173(5):489–495.',
    '8.  Fried LP et al. Frailty in older adults: evidence for a phenotype.',
    '     J Gerontol A Biol Sci Med Sci. 2001;56(3):M146–M156.',
]
refs_right = [
    '9.  Curtin D et al. STOPPFrail-2 criteria for potentially inappropriate',
    '     medications in advanced frailty. Age Ageing 2021;50(2):465.',
    '10. Mallery L et al. PATH/Dalhousie deprescribing guidance.',
    '     polypharmacy.ca.',
    '11. Lobkovich AM et al. 阿司匹林 deprescribing interventions for',
    '     primary prevention in older adults. Pharmacotherapy 2026.',
    '12. USPSTF. 阿司匹林 use to prevent cardiovascular disease: US',
    '     Preventive Services Task Force recommendation. JAMA 2022.',
    '13. 2026 ACC/AHA Guideline on the Management of Dyslipidemia.',
    '14. 苏格兰 多重用药 Guidance 2026–2029.',
    '15. RETREAT-FRAIL: Antihypertensive reduction in nursing home',
    '     residents. N Engl J Med 2025.',
]

txt_multi(sl, 0.7, 1.6, 6.0, 5.2, refs_left, size=10, color=BLACK, spacing=1.3)
txt_multi(sl, 7.0, 1.6, 6.0, 5.2, refs_right, size=10, color=BLACK, spacing=1.3)

# ────────────────────────────────────────────────────────
# SLIDE 25 — THANK YOU / Q&A
# ────────────────────────────────────────────────────────
sl = S(); dark_bg(sl)
txt(sl, 1.0, 1.8, 11.3, 1.2, '谢谢！', size=52, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
rule(sl, 5.2, 3.2, 2.8, 3, CRIMSON)
txt(sl, 1.0, 3.6, 11.3, 0.8, '提问与讨论', size=26, color=RGBColor(0xCC,0xCC,0xDD), align=PP_ALIGN.CENTER)
txt(sl, 1.0, 5.2, 11.3, 0.6, '「指南是为张老写的。李老需要我们自己的临床判断。」', size=20, color=CRIMSON, align=PP_ALIGN.CENTER)
txt(sl, 1.0, 6.3, 11.3, 0.5, '院级学术讲座  |  2026', size=14, color=GRAY40, align=PP_ALIGN.CENTER)

# ═══════════════════════════════════════════════════════
#  SAVE
# ═══════════════════════════════════════════════════════
print(f"Saving {len(prs.slides)} slides to PPT...")
prs.save(PPT_PATH)
print(f"Done → {PPT_PATH}")
