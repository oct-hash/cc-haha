"""Add a summary slide to v4, generating v5."""
import sys
sys.stdout.reconfigure(encoding='utf-8')
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
import os, glob

def rgb(hex_val):
    return RGBColor((hex_val >> 16) & 0xFF, (hex_val >> 8) & 0xFF, hex_val & 0xFF)

SRC = r'C:\Users\Asus\Desktop\一例重度贫血合并CKD4期高钾血症_降钾治疗困境与反思_v4.pptx'
prs = Presentation(SRC)
slide_w = prs.slide_width
slide_h = prs.slide_height

def add_textbox(slide, left, top, width, height, text, font_size=14, bold=False, color=rgb(0x333333), alignment=PP_ALIGN.LEFT, font_name='Microsoft YaHei'):
    txBox = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(font_size)
    p.font.bold = bold
    p.font.color.rgb = color
    p.font.name = font_name
    p.alignment = alignment
    return tf

def add_box(slide, left, top, width, height, fill_color=None, border_color=None):
    shape = slide.shapes.add_shape(1, Inches(left), Inches(top), Inches(width), Inches(height))
    if fill_color:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill_color
    else:
        shape.fill.background()
    if border_color:
        shape.line.color.rgb = border_color
        shape.line.width = Pt(1)
    else:
        shape.line.fill.background()
    return shape

# Add summary slide at end
summary = prs.slides.add_slide(prs.slide_layouts[-1])

# Solid white background
summary.background.fill.solid()
summary.background.fill.fore_color.rgb = rgb(0xFFFFFF)

# Left accent bar
accent = summary.shapes.add_shape(1, Inches(0.6), Inches(0.3), Inches(0.1), Inches(0.7))
accent.fill.solid()
accent.fill.fore_color.rgb = rgb(0xC62828)
accent.line.fill.background()

# Title
add_textbox(summary, 0.9, 0.4, 11.7, 0.7, '总结：从「常规思维」到「CKD4期特异性思维」', font_size=22, bold=True, color=rgb(0xC62828))
add_textbox(summary, 0.9, 0.8, 11.7, 0.3, '一条逻辑链串起全部分析 → 三个认知升级 → 一个行动转变', font_size=12, color=rgb(0x888888))

# Core logic chain title
add_textbox(summary, 0.5, 1.3, 9, 0.4, '核心逻辑链', font_size=16, bold=True, color=rgb(0x1A56DB))

# Logic chain boxes
steps = [
    ('eGFR 18', '肾脏排钾\n能力归零'),
    ('消化道出血', '内源性\n钾持续入血'),
    ('常规三联', '利尿剂无效\n胰岛素只转移'),
    ('正确路径', '透析+SZC\n+洗涤RBC+止血'),
]
for i, (trigger, result) in enumerate(steps):
    x = 0.4 + i * 3.15
    bg = rgb(0xFFEBEE) if i < 3 else rgb(0xE8F5E9)
    border = rgb(0xEF5350) if i < 3 else rgb(0x4CAF50)
    add_box(summary, x, 1.8, 2.8, 1.3, fill_color=bg, border_color=border)
    add_textbox(summary, x+0.1, 1.85, 2.6, 0.35, trigger, font_size=13, bold=True, color=rgb(0x333333))
    add_textbox(summary, x+0.1, 2.25, 2.6, 0.75, result, font_size=12, color=rgb(0x333333))
    if i < 3:
        add_textbox(summary, x+2.8, 2.2, 0.35, 0.5, '\u2192', font_size=20, bold=True, color=rgb(0x888888))

# Three cognitive upgrades title
add_textbox(summary, 0.5, 3.4, 9, 0.4, '三个认知升级', font_size=16, bold=True, color=rgb(0x1A56DB))

upgrades = [
    ('1', '"降钾" vs "排钾"', '胰岛素把 K+ 推进细胞 = 暂时转移，不是清除。\nCKD4 期只有透析和钾结合剂能真正减少体内总钾。'),
    ('2', '"肾脏路径" vs "肠道路径"', 'eGFR < 30 时肾脏排钾通道已关闭。\n绕开肾脏走肠道（SZC/Patiromer）或体外循环（透析）是唯一有效路径。'),
    ('3', '"先用药" vs "先止血"', '活动性出血 = K+ 持续入血的水龙头。\n不关水龙头（止血），拖地（降钾药物）永远赶不上。'),
]
for i, (num, title, detail) in enumerate(upgrades):
    y = 3.9 + i * 1.15
    add_box(summary, 0.4, y, 4.3, 1.0, fill_color=rgb(0xFFF3E0), border_color=rgb(0xFF9800))
    add_textbox(summary, 0.6, y+0.05, 0.5, 0.35, num, font_size=20, bold=True, color=rgb(0xE65100))
    add_textbox(summary, 1.1, y+0.05, 3.5, 0.35, title, font_size=14, bold=True, color=rgb(0xE65100))
    add_textbox(summary, 0.6, y+0.45, 4.0, 0.5, detail, font_size=10, color=rgb(0x333333))

# Right side: Action shift
add_box(summary, 5.0, 3.9, 8.0, 3.35, fill_color=rgb(0xE8F5E9), border_color=rgb(0x4CAF50))
add_textbox(summary, 5.2, 3.95, 7.5, 0.4, '行动转变：CKD4 期高钾急症处理流程', font_size=15, bold=True, color=rgb(0x2E7D32))

flow_items = [
    'K+ \u2265 6.5 或 ECG 改变 \u2192 立即通知透析室（不等药物效果）',
    '同步启动 PPI + 急诊胃镜止血（关掉 K+ 来源水龙头）',
    '输血选用洗涤红细胞（避开库存血的高钾陷阱）',
    '口服 SZC 10g tid（1h 起效，肠道结合 K+）',
    '严格限钾饮食（每日摄入 < 40mmol K+）',
    '胰岛素 10U + 50% GS 50mL 静脉推注（不是滴注！）',
    '呋塞米在 CKD4 期基本无效，不再作为降钾主力',
]
for j, item in enumerate(flow_items):
    tc = rgb(0x2E7D32) if j == 0 else rgb(0x333333)
    add_textbox(summary, 5.4, 4.45 + j * 0.38, 7.3, 0.35, item, font_size=11, color=tc)

# Bottom: One-line takeaway
add_box(summary, 0.4, 6.8, 12.5, 0.5, fill_color=rgb(0x1A56DB))
add_textbox(summary, 0.6, 6.85, 12.0, 0.4,
    '一句话记住：CKD4 期高钾 = 肾脏排钾通道已关闭 → 绕开肾脏，走透析（物理清除）+ 肠道（SZC 结合）+ 止血（关水龙头）+ 洗涤 RBC（避开陷阱）',
    font_size=13, bold=True, color=rgb(0xFFFFFF))

# Page number
add_textbox(summary, 12.1, 7.2, 1.0, 0.3, '14', font_size=10, color=rgb(0x999999), alignment=PP_ALIGN.RIGHT)

# Save
desktop = r'C:\Users\Asus\Desktop'
existing = glob.glob(os.path.join(desktop, '一例重度贫血合并CKD4期高钾血症_降钾治疗困境与反思_v*'))
versions = []
for f in existing:
    basename = os.path.basename(f)
    if '_v' in basename:
        try:
            v = int(basename.split('_v')[-1].replace('.pptx', ''))
            versions.append(v)
        except ValueError:
            pass
next_v = max(versions) + 1 if versions else 5
output_path = os.path.join(desktop, f'一例重度贫血合并CKD4期高钾血症_降钾治疗困境与反思_v{next_v}.pptx')
prs.save(output_path)
print(f'Saved: v{next_v} ({len(prs.slides)} slides)')
print('Summary slide added as page 14.')
