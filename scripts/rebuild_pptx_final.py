"""
Rebuild PPTX from v4 (10 slides, corrupted) -> v6 (14 slides).
Adds 4 missing slides: drug comparison table, diet blacklist, core lessons, summary.
v4 lost 3 slides (drug table, diet, lessons) during v2->v4 save corruption.
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
import os
import glob

def rgb(hex_val):
    return RGBColor((hex_val >> 16) & 0xFF, (hex_val >> 8) & 0xFF, hex_val & 0xFF)

SRC = r'C:\Users\Asus\Desktop\一例重度贫血合并CKD4期高钾血症_降钾治疗困境与反思_v4.pptx'
prs = Presentation(SRC)
slide_w = prs.slide_width
slide_h = prs.slide_height
blank_layout = prs.slide_layouts[-1]

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

def new_slide():
    """Create a blank slide with solid white background."""
    slide = prs.slides.add_slide(blank_layout)
    bg = slide.background
    bg.fill.solid()
    bg.fill.fore_color.rgb = rgb(0xFFFFFF)
    return slide

def add_title_accent(slide, title, subtitle=None, accent_color=0xC62828):
    """Original-style title with left accent bar + text."""
    accent = slide.shapes.add_shape(1, Inches(0.6), Inches(0.3), Inches(0.1), Inches(0.6))
    accent.fill.solid()
    accent.fill.fore_color.rgb = rgb(accent_color)
    accent.line.fill.background()
    add_textbox(slide, 0.9, 0.3, 11.5, 0.5, title, font_size=22, bold=True, color=rgb(accent_color))
    if subtitle:
        add_textbox(slide, 0.9, 0.7, 11.5, 0.3, subtitle, font_size=11, color=rgb(0x888888))

# ============================================================
# SLIDE 11: Drug Comparison Table
# ============================================================
s11 = new_slide()
add_title_accent(s11, '参考：口服钾结合剂 — 新一代 vs 老一代', '附：同类药物速查对照', accent_color=0x1A56DB)

add_textbox(s11, 0.5, 1.1, 9, 0.4, '新一代口服钾结合剂', font_size=16, bold=True, color=rgb(0x1A56DB))

new_drugs = [
    ('SZC 环硅酸锆钠', 'Lokelma / 利倍卓', '1h', '无机晶体捕获K+，直接排出，无钠负荷', '国内已上市'),
    ('Patiromer 帕替罗默', 'Veltassa', '4-7h', '钙基交换树脂，不引起钠负荷', '国内未上市'),
]
for i, (name, brand, onset, char, approval) in enumerate(new_drugs):
    y = 1.5 + i * 0.6
    bg = rgb(0xE8F5E9) if i % 2 == 0 else rgb(0xF1F8E9)
    add_box(s11, 0.5, y, 12.0, 0.5, fill_color=bg, border_color=rgb(0xA5D6A7))
    add_textbox(s11, 0.7, y + 0.1, 2.2, 0.35, name, font_size=12, bold=True, color=rgb(0x2E7D32))
    add_textbox(s11, 2.9, y + 0.1, 1.8, 0.35, brand, font_size=11, color=rgb(0x333333))
    add_textbox(s11, 4.7, y + 0.1, 0.8, 0.35, onset, font_size=11, color=rgb(0x333333))
    add_textbox(s11, 5.6, y + 0.1, 3.5, 0.35, char, font_size=11, color=rgb(0x333333))
    add_textbox(s11, 9.2, y + 0.1, 1.5, 0.35, approval, font_size=10, color=rgb(0x1A56DB))

add_textbox(s11, 0.5, 2.9, 9, 0.4, '老一代离子交换树脂', font_size=16, bold=True, color=rgb(0xC62828))

old_drugs = [
    ('SPS 聚苯乙烯磺酸钠', 'Kayexalate / 降钾树脂', '2-24h', '钠负荷 → 心衰风险、肠坏死', '正在被淘汰'),
    ('CPS 聚苯乙烯磺酸钙', '可利美特', '2-24h', '减轻钠负荷，仍可能肠坏死', 'SPS 改良版'),
]
for i, (name, brand, onset, risk, note) in enumerate(old_drugs):
    y = 3.4 + i * 0.6
    bg = rgb(0xFFEBEE) if i % 2 == 0 else rgb(0xFFF5F5)
    add_box(s11, 0.5, y, 12.0, 0.5, fill_color=bg, border_color=rgb(0xEF9A9A))
    add_textbox(s11, 0.7, y + 0.1, 2.2, 0.35, name, font_size=12, bold=True, color=rgb(0xC62828))
    add_textbox(s11, 2.9, y + 0.1, 2.0, 0.35, brand, font_size=11, color=rgb(0x333333))
    add_textbox(s11, 4.9, y + 0.1, 0.9, 0.35, onset, font_size=11, color=rgb(0x333333))
    add_textbox(s11, 5.9, y + 0.1, 3.8, 0.35, risk, font_size=11, color=rgb(0xC62828))
    add_textbox(s11, 9.8, y + 0.1, 1.5, 0.35, note, font_size=10, color=rgb(0x888888))

add_textbox(s11, 0.5, 4.8, 12, 0.5,
    '一句话记住：SZC 起效最快（1h），是急性高钾的最佳口服选择；Patiromer 适合长期维持。老一代 SPS/CPS 因肠坏死风险正在被淘汰。',
    font_size=13, bold=True, color=rgb(0x1A56DB))
add_textbox(s11, 0.5, 5.4, 12, 0.3,
    'ENaC = Epithelial Sodium Channel（上皮钠通道）— ROMK 排 K+ 的动力来源',
    font_size=11, color=rgb(0x888888))

add_textbox(s11, 12.1, 7.2, 1.0, 0.3, '11', font_size=10, color=rgb(0x999999), alignment=PP_ALIGN.RIGHT)

# ============================================================
# SLIDE 12: Diet Blacklist
# ============================================================
s12 = new_slide()
add_title_accent(s12, '饮食黑名单：CKD4 期高钾患者的「绝对不能碰」', '附：患者教育 6 条', accent_color=0xC62828)

# Left panel: 5 food categories
add_box(s12, 0.4, 1.3, 6.0, 4.5, fill_color=rgb(0xFFF5F5), border_color=rgb(0xEF9A9A))
add_textbox(s12, 0.6, 1.4, 5.5, 0.4, '五大禁忌食物类别', font_size=15, bold=True, color=rgb(0xC62828))

foods = [
    ('高钾水果', '香蕉、橙子、橘子、柚子、猕猴桃、芒果、哈密瓜'),
    ('高钾蔬菜', '菠菜、空心菜、土豆、山药、芋头、番茄、蘑菇'),
    ('豆类及坚果', '黄豆、绿豆、花生、核桃、杏仁、腰果'),
    ('汤类', '肉汤、骨头汤、菜汤（K+ 全部溶在汤里）'),
    ('加工食品', '低钠盐（以氯化钾替代氯化钠）、腌制食品'),
]
for i, (cat, items) in enumerate(foods):
    y = 1.85 + i * 0.75
    add_textbox(s12, 0.7, y, 5.5, 0.3, f'{i+1}. {cat}', font_size=12, bold=True, color=rgb(0xC62828))
    add_textbox(s12, 0.9, y + 0.28, 5.3, 0.35, items, font_size=10, color=rgb(0x333333))

# Right panel: 6 patient education points
add_box(s12, 6.8, 1.3, 6.0, 4.5, fill_color=rgb(0xE8F5E9), border_color=rgb(0x4CAF50))
add_textbox(s12, 7.0, 1.4, 5.5, 0.4, '患者教育 6 条', font_size=15, bold=True, color=rgb(0x2E7D32))

edu = [
    '每日摄入 K+ < 40mmol（≈ 1500 mg）',
    '蔬菜先焯水再烹饪（K+ 溶出 60-70%）',
    '切小块后开水煮 5 分钟，弃汤再炒',
    '不喝任何汤（包括菜汤、肉汤、火锅汤）',
    '不吃「低钠盐」（成分 = 氯化钾！）',
    '每 2-4 周复查血钾，维持在 < 5.0 mmol/L',
]
for i, item in enumerate(edu):
    y = 1.85 + i * 0.6
    add_textbox(s12, 7.1, y, 0.3, 0.3, f'{i+1}.', font_size=12, bold=True, color=rgb(0x2E7D32))
    add_textbox(s12, 7.4, y, 5.2, 0.5, item, font_size=11, color=rgb(0x333333))

# Bottom: key principle
add_box(s12, 0.4, 6.2, 12.4, 0.5, fill_color=rgb(0xC62828))
add_textbox(s12, 0.6, 6.25, 12.0, 0.4,
    '关键原则：外源性钾（饮食）+ 内源性钾（出血/溶血）= 总钾负荷。单靠限钾饮食无法解决内源性钾，必须止血 + 透析。',
    font_size=13, bold=True, color=rgb(0xFFFFFF))

add_textbox(s12, 12.1, 7.2, 1.0, 0.3, '12', font_size=10, color=rgb(0x999999), alignment=PP_ALIGN.RIGHT)

# ============================================================
# SLIDE 13: Core Lessons
# ============================================================
s13 = new_slide()
add_title_accent(s13, '核心教训：从本例中提炼的四条临床法则', '面向未来的思考', accent_color=0x1A56DB)

lessons = [
    ('1', 'CKD4 期排钾路径已关闭',
     'eGFR < 30 时，肾脏排钾能力归零。常规利尿剂（呋塞米）无法有效排钾，反而因液体负荷增加心衰风险。排钾必须绕开肾脏：走透析（物理清除）或肠道（SZC/Patiromer 结合 K+）。',
     '不要踹一扇打不开的门'),
    ('2', '胰岛素降钾只是「空间转移」',
     '胰岛素激活 Na+-K+-ATP 酶，将 K+ 从血液推进细胞内。全身总钾量不变，4-6h 后 K+ 会返回血液。这只是为透析争取时间的临时措施，不是治疗终点。',
     '拖地不关水龙头，永远拖不干'),
    ('3', '止血比降钾更根本',
     '消化道出血 = 内源性钾持续入血（RBC 每克 Hb 释放 K+）。不先止血，所有降钾药物都是在对抗一个源源不断的水龙头。PPI + 急诊胃镜是第一优先。',
     '关掉水龙头再拖地'),
    ('4', '洗涤红细胞是 CKD4 期的强制选择',
     '库存血储存期越长，上清液 K+ 浓度越高（可达 20-30 mmol/L）。CKD4 期患者输库存血 = 一边降钾一边补钾。必须用洗涤红细胞（去除血浆 K+），或至少用 7 天内的新鲜血。',
     '不要一边灭火一边浇油'),
]
for i, (num, title, detail, quote) in enumerate(lessons):
    y = 1.25 + i * 1.45
    add_box(s13, 0.4, y, 12.5, 1.3, fill_color=rgb(0xFFF3E0), border_color=rgb(0xFF9800))
    # Number circle
    add_box(s13, 0.6, y + 0.15, 0.55, 0.55, fill_color=rgb(0x1A56DB))
    add_textbox(s13, 0.6, y + 0.2, 0.55, 0.45, num, font_size=22, bold=True, color=rgb(0xFFFFFF), alignment=PP_ALIGN.CENTER)
    # Title
    add_textbox(s13, 1.35, y + 0.1, 5.0, 0.4, title, font_size=15, bold=True, color=rgb(0x1A56DB))
    # Detail
    add_textbox(s13, 1.35, y + 0.55, 10.5, 0.55, detail, font_size=10.5, color=rgb(0x333333))
    # Quote/analogy
    add_textbox(s13, 0.6, y + 1.05, 12.0, 0.2, f'比喻：{quote}', font_size=10, color=rgb(0xFF9800), bold=True)

add_textbox(s13, 12.1, 7.2, 1.0, 0.3, '13', font_size=10, color=rgb(0x999999), alignment=PP_ALIGN.RIGHT)

# ============================================================
# SLIDE 14: Summary
# ============================================================
s14 = new_slide()

# Left accent bar
accent = s14.shapes.add_shape(1, Inches(0.6), Inches(0.3), Inches(0.1), Inches(0.7))
accent.fill.solid()
accent.fill.fore_color.rgb = rgb(0xC62828)
accent.line.fill.background()

add_textbox(s14, 0.9, 0.4, 11.7, 0.7, '总结：从「常规思维」到「CKD4 期特异性思维」', font_size=22, bold=True, color=rgb(0xC62828))
add_textbox(s14, 0.9, 0.8, 11.7, 0.3, '一条逻辑链串起全部分析 → 三个认知升级 → 一个行动转变', font_size=12, color=rgb(0x888888))

# Core logic chain title
add_textbox(s14, 0.5, 1.3, 9, 0.4, '核心逻辑链', font_size=16, bold=True, color=rgb(0x1A56DB))

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
    add_box(s14, x, 1.8, 2.8, 1.3, fill_color=bg, border_color=border)
    add_textbox(s14, x + 0.1, 1.85, 2.6, 0.35, trigger, font_size=13, bold=True, color=rgb(0x333333))
    add_textbox(s14, x + 0.1, 2.25, 2.6, 0.75, result, font_size=12, color=rgb(0x333333))
    if i < 3:
        add_textbox(s14, x + 2.8, 2.2, 0.35, 0.5, '\u2192', font_size=20, bold=True, color=rgb(0x888888))

# Three cognitive upgrades title
add_textbox(s14, 0.5, 3.4, 9, 0.4, '三个认知升级', font_size=16, bold=True, color=rgb(0x1A56DB))

upgrades = [
    ('1', '"降钾" vs "排钾"', '胰岛素把 K+ 推进细胞 = 暂时转移，不是清除。\nCKD4 期只有透析和钾结合剂能真正减少体内总钾。'),
    ('2', '"肾脏路径" vs "肠道路径"', 'eGFR < 30 时肾脏排钾通道已关闭。\n绕开肾脏走肠道（SZC/Patiromer）或体外循环（透析）是唯一有效路径。'),
    ('3', '"先用药" vs "先止血"', '活动性出血 = K+ 持续入血的水龙头。\n不关水龙头（止血），拖地（降钾药物）永远赶不上。'),
]
for i, (num, title, detail) in enumerate(upgrades):
    y = 3.9 + i * 1.15
    add_box(s14, 0.4, y, 4.3, 1.0, fill_color=rgb(0xFFF3E0), border_color=rgb(0xFF9800))
    add_textbox(s14, 0.6, y + 0.05, 0.5, 0.35, num, font_size=20, bold=True, color=rgb(0xE65100))
    add_textbox(s14, 1.1, y + 0.05, 3.5, 0.35, title, font_size=14, bold=True, color=rgb(0xE65100))
    add_textbox(s14, 0.6, y + 0.45, 4.0, 0.5, detail, font_size=10, color=rgb(0x333333))

# Right side: Action shift
add_box(s14, 5.0, 3.9, 8.0, 3.35, fill_color=rgb(0xE8F5E9), border_color=rgb(0x4CAF50))
add_textbox(s14, 5.2, 3.95, 7.5, 0.4, '行动转变：CKD4 期高钾急症处理流程', font_size=15, bold=True, color=rgb(0x2E7D32))

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
    add_textbox(s14, 5.4, 4.45 + j * 0.38, 7.3, 0.35, item, font_size=11, color=tc)

# Bottom: One-line takeaway
add_box(s14, 0.4, 6.8, 12.5, 0.5, fill_color=rgb(0x1A56DB))
add_textbox(s14, 0.6, 6.85, 12.0, 0.4,
    '一句话记住：CKD4 期高钾 = 肾脏排钾通道已关闭 → 绕开肾脏，走透析（物理清除）+ 肠道（SZC 结合）+ 止血（关水龙头）+ 洗涤 RBC（避开陷阱）',
    font_size=13, bold=True, color=rgb(0xFFFFFF))

add_textbox(s14, 12.1, 7.2, 1.0, 0.3, '14', font_size=10, color=rgb(0x999999), alignment=PP_ALIGN.RIGHT)

# ============================================================
# Save
# ============================================================
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
next_v = max(versions) + 1 if versions else 6
output_path = os.path.join(desktop, f'一例重度贫血合并CKD4期高钾血症_降钾治疗困境与反思_v{next_v}.pptx')
prs.save(output_path)
print(f'Saved: v{next_v} ({len(prs.slides)} slides)')
print('Added: drug comparison table (11), diet blacklist (12), core lessons (13), summary (14)')
