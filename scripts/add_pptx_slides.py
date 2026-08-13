import sys
sys.stdout.reconfigure(encoding='utf-8')
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
import os, glob

def rgb(hex_val):
    """Convert hex color to RGBColor. e.g. rgb(0x1A56DB) -> rgb(0x1A56DB)"""
    return RGBColor((hex_val >> 16) & 0xFF, (hex_val >> 8) & 0xFF, hex_val & 0xFF)

src = r'C:\Users\Asus\Desktop\一例重度贫血合并CKD4期高钾血症_降钾治疗困境与反思.pptx'
prs = Presentation(src)
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

def add_title_bar(slide, title, subtitle=None):
    shape = slide.shapes.add_shape(1, Inches(0), Inches(0), slide_w, Inches(1.0))
    shape.fill.solid()
    shape.fill.fore_color.rgb = rgb(0x1A56DB)
    shape.line.fill.background()
    tf = shape.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = Pt(24)
    p.font.bold = True
    p.font.color.rgb = rgb(0xFFFFFF)
    p.font.name = 'Microsoft YaHei'
    p.alignment = PP_ALIGN.LEFT
    tf.margin_left = Inches(0.5)
    tf.margin_top = Inches(0.15)
    if subtitle:
        p2 = tf.add_paragraph()
        p2.text = subtitle
        p2.font.size = Pt(12)
        p2.font.color.rgb = rgb(0xCCDDFF)
        p2.font.name = 'Microsoft YaHei'

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

def add_section_title(slide, text, top):
    add_textbox(slide, 0.5, top, 8.5, 0.5, text, font_size=18, bold=True, color=rgb(0x1A56DB))

# ============================================================
# SLIDE: 剖析②-1: 正常排钾链路 (流水线比喻)
# ============================================================
s1 = prs.slides.add_slide(blank_layout)
add_title_bar(s1, '剖析②：利尿剂为何无效？', 'Step 1 - 先看正常的排钾流水线')
add_section_title(s1, '正常肾脏如何排出钾？', 1.3)
add_textbox(s1, 0.5, 1.9, 9, 0.4, '比喻：钾的排出 = 一条三工位流水线', font_size=16, bold=True, color=rgb(0xE67E22))

box_h, box_y, box_w = 1.8, 2.5, 2.5
stations = [
    ('工位①：原料送达', '袢利尿剂 -> 抑制 NKCC2\n远端 Na+ 流量增加'),
    ('工位②：建立动力', 'ENaC 重吸收 Na+\n-> 建立管腔负电位'),
    ('工位③：开闸放行', '负电位驱动 ROMK 通道\n-> K+ 分泌排出 -> 离开身体')
]
for i, (title, desc) in enumerate(stations):
    x = 0.5 + i * 3.1
    add_box(s1, x, box_y, box_w, box_h, fill_color=rgb(0xE8F5E9), border_color=rgb(0x4CAF50))
    add_textbox(s1, x+0.15, box_y+0.15, box_w-0.3, 0.5, title, font_size=15, bold=True, color=rgb(0x2E7D32))
    add_textbox(s1, x+0.15, box_y+0.7, box_w-0.3, 1.0, desc, font_size=12, color=rgb(0x333333))
    if i < 2:
        add_textbox(s1, x+box_w+0.05, box_y+0.6, 0.3, 0.5, '->', font_size=22, bold=True, color=rgb(0x4CAF50))

add_textbox(s1, 0.5, 4.6, 9, 0.4, '前提：三个工位全部正常运转，流水线才能产出 K+ -> 离开身体', font_size=14, bold=True, color=rgb(0x1A56DB))

# ============================================================
# SLIDE: 剖析②-2: CKD4期三条全断
# ============================================================
s2 = prs.slides.add_slide(blank_layout)
add_title_bar(s2, '剖析②：CKD4期 - 流水线三条全断', 'Step 2 - eGFR 18 = 正常肾脏 15% 动力')
add_textbox(s2, 0.5, 1.3, 9, 0.4, 'CKD4期（eGFR 18 mL/min）：只是一辆只有 15% 动力的车', font_size=15, bold=True, color=rgb(0xE67E22))

items = [
    ('1', '原料送不到',
     '呋塞米需 OAT 转运蛋白送入肾小管 | CKD4期：尿毒症毒素竞争 OAT -> 药物进不去 | -> 利钠效应直接打五折（下降50-70%）',
     '快递员连门都进不了，谈何送货？'),
    ('2', '原料本身不够',
     '正常滤过 Na+ ≈ 17000 mmol/日 | CKD4期滤过 Na+ ≈ 2500 mmol/日（只剩 15%） | -> ENaC 无 Na+ 可运，底物枯竭',
     '工厂原料短缺，机器空转也白搭'),
    ('3', '动力系统瘫痪',
     '无 Na+ 重吸收 -> 无法建立管腔负电位 | 无负电位 -> ROMK 通道空转 | -> K+ 排不出去',
     '没有电压差，开关打开也没电流')
]
for i, (num, title, detail, metaphor) in enumerate(items):
    y = 2.0 + i * 1.5
    add_box(s2, 0.5, y, 9, 1.2, fill_color=rgb(0xFFEBEE), border_color=rgb(0xEF5350))
    add_textbox(s2, 0.7, y+0.05, 0.5, 0.4, num, font_size=22, bold=True, color=rgb(0xC62828))
    add_textbox(s2, 1.2, y+0.05, 2.5, 0.4, title, font_size=15, bold=True, color=rgb(0xC62828))
    add_textbox(s2, 3.8, y+0.1, 5.5, 0.7, detail, font_size=11, color=rgb(0x333333))
    add_textbox(s2, 0.7, y+0.8, 8.5, 0.3, f'比喻：{metaphor}', font_size=11, color=rgb(0x888888))

add_textbox(s2, 0.5, 6.5, 9, 0.4, '结论：CKD4期肾脏已丧失排钾能力，给利尿剂 = 踹一扇打不开的门', font_size=15, bold=True, color=rgb(0x1A56DB))

# ============================================================
# SLIDE: 剖析②-3: 正确路径 vs 错误路径
# ============================================================
s3 = prs.slides.add_slide(blank_layout)
add_title_bar(s3, '剖析②：正确路径 vs 错误路径', 'Step 3 - 绕开肾脏，走肠道或体外循环')
add_textbox(s3, 0.5, 1.3, 9, 0.4, 'CKD4期高钾：三条有效路径 + 一条无效路径', font_size=15, bold=True, color=rgb(0xE67E22))

paths = [
    ('血液透析', '物理清除（扩散+对流）', '即刻', '25-30 mmol K+/h', True),
    ('SZC 环硅酸锆钠（利倍卓/Lokelma）', '肠道结合 K+ 直接排出', '1h起效', '渐进排钾', True),
    ('Patiromer 帕替罗默（Veltassa）', '钙基肠道结合 K+', '4-7h起效', '渐进排钾', True),
    ('呋塞米', '肾脏排钾（已失效）', '-', '≈ 0', False)
]
for i, (name, mech, onset, amount, is_good) in enumerate(paths):
    y = 1.9 + i * 0.6
    bg = rgb(0xE8F5E9) if is_good else rgb(0xFFEBEE)
    border = rgb(0x4CAF50) if is_good else rgb(0xEF5350)
    tc = rgb(0x2E7D32) if is_good else rgb(0xC62828)
    add_box(s3, 0.5, y, 9, 0.5, fill_color=bg, border_color=border)
    add_textbox(s3, 0.7, y+0.08, 2.6, 0.35, name, font_size=13, bold=True, color=tc)
    add_textbox(s3, 3.4, y+0.08, 2.4, 0.35, mech, font_size=11, color=rgb(0x333333))
    add_textbox(s3, 5.9, y+0.08, 1.4, 0.35, onset, font_size=11, color=rgb(0x333333))
    add_textbox(s3, 7.4, y+0.08, 2.0, 0.35, amount, font_size=11, color=rgb(0x333333))

# Discussion box
add_box(s3, 0.5, 4.5, 9, 0.9, fill_color=rgb(0xFFF3E0), border_color=rgb(0xFF9800))
add_textbox(s3, 0.7, 4.55, 8.5, 0.3, '讨论要点', font_size=14, bold=True, color=rgb(0xE65100))
add_textbox(s3, 0.7, 4.9, 8.5, 0.4, '"高钾就给速尿"是肌肉记忆，但在 CKD4 期是方向性错误。改掉这个习惯，关键是记住 eGFR<30 时肾脏排钾已经关停。', font_size=12, color=rgb(0x333333))

add_textbox(s3, 0.5, 5.7, 9, 0.6, '一句话记住：CKD4期排钾绕开肾脏，走透析+肠道。SZC=Lokelma/利倍卓(1h起效)，Patiromer=Veltassa，ENaC=上皮钠通道', font_size=13, bold=True, color=rgb(0x1A56DB))

# ============================================================
# SLIDE: 剖析③-1: 胰岛素降钾原理
# ============================================================
s4 = prs.slides.add_slide(blank_layout)
add_title_bar(s4, '剖析③：胰岛素+葡萄糖方案的误区', 'Step 1 - 先搞清楚：降钾靠谁？')
add_textbox(s4, 0.5, 1.3, 9, 0.4, '核心原理（一句话）', font_size=18, bold=True, color=rgb(0xE67E22))
add_textbox(s4, 0.5, 1.8, 9, 0.8,
    '胰岛素激活 Na+-K+-ATP 酶 -> 把 K+ 从血液推进细胞内\n葡萄糖的唯一作用：防止胰岛素引发低血糖',
    font_size=16, bold=True, color=rgb(0x1A56DB))

# Blood side
add_box(s4, 0.5, 2.8, 3.5, 2.2, fill_color=rgb(0xFFEBEE), border_color=rgb(0xEF5350))
add_textbox(s4, 0.7, 2.95, 3.3, 0.4, '血液（高钾侧）', font_size=14, bold=True, color=rgb(0xC62828))
add_textbox(s4, 0.7, 3.35, 3.3, 0.8, 'K+ K+ K+ K+ K+\nK+ K+ K+ K+ K+\n血钾：6.7 mmol/L', font_size=12, color=rgb(0xC62828))
add_textbox(s4, 0.7, 4.3, 3.3, 0.4, '注意：全身总钾量不变', font_size=12, bold=True, color=rgb(0xFF5722))

# Arrow
add_textbox(s4, 4.2, 3.5, 1.0, 0.6, '胰岛素\n=====>', font_size=18, bold=True, color=rgb(0x1A56DB))

# Cell side
add_box(s4, 5.5, 2.8, 3.5, 2.2, fill_color=rgb(0xE8F5E9), border_color=rgb(0x4CAF50))
add_textbox(s4, 5.7, 2.95, 3.3, 0.4, '细胞内（低钾侧）', font_size=14, bold=True, color=rgb(0x2E7D32))
add_textbox(s4, 5.7, 3.35, 3.3, 0.8, 'K+ K+ K+ K+ K+\nK+ K+ K+ K+ K+\n血钾：5.7 mmol/L', font_size=12, color=rgb(0x2E7D32))
add_textbox(s4, 5.7, 4.3, 3.3, 0.4, '4-6h 后 K+ 会返回血液', font_size=12, bold=True, color=rgb(0xFF5722))

add_textbox(s4, 0.5, 5.3, 9, 0.6,
    '关键推论：只要胰岛素剂量相同（10U），降钾效果就相同。葡萄糖浓度（10% vs 50%）不影响降钾效果。',
    font_size=14, bold=True, color=rgb(0x333333))
add_textbox(s4, 0.5, 5.9, 9, 0.4, '那为什么非要区分浓度？往下看 ->', font_size=16, bold=True, color=rgb(0xE67E22))

# ============================================================
# SLIDE: 剖析③-2: 两种做法对比
# ============================================================
s5 = prs.slides.add_slide(blank_layout)
add_title_bar(s5, '剖析③：10% vs 50% GS - 差的不是降钾，是安全', 'Step 2 - 三条致命问题')

# Table header
add_box(s5, 0.3, 1.2, 9.4, 0.5, fill_color=rgb(0x1A56DB))
add_textbox(s5, 0.5, 1.25, 3.0, 0.4, '对比维度', font_size=12, bold=True, color=rgb(0xFFFFFF))
add_textbox(s5, 3.5, 1.25, 3.0, 0.4, 'x 本例（10%GS 500mL 滴注）', font_size=12, bold=True, color=rgb(0xFFFFFF))
add_textbox(s5, 6.5, 1.25, 3.0, 0.4, 'v 正确（50%GS 50mL 推注）', font_size=12, bold=True, color=rgb(0xFFFFFF))

rows = [
    ('液体总量', '500mL（≈ 半日尿量一次灌入）', '50mL（仅 1/10）'),
    ('给药方式', '静脉滴注（起效 30-60min）', '静脉推注（起效 15min）'),
    ('糖的剂量', '50g -> 反弹性低血糖风险高', '25g -> 恰好防低血糖'),
    ('心衰风险', '高（液体多，CKD4期排水差）', '低'),
    ('适用场景', '非急症慢调', '高钾急症（K+>6.5+ECG改变）')
]
for i, (dim, wrong, right) in enumerate(rows):
    y = 1.85 + i * 0.42
    bg = rgb(0xFAFAFA) if i % 2 == 0 else rgb(0xFFFFFF)
    add_box(s5, 0.3, y, 9.4, 0.4, fill_color=bg)
    add_textbox(s5, 0.5, y+0.05, 3.0, 0.35, dim, font_size=11, bold=True, color=rgb(0x333333))
    add_textbox(s5, 3.5, y+0.05, 3.0, 0.35, wrong, font_size=11, color=rgb(0xC62828))
    add_textbox(s5, 6.5, y+0.05, 3.0, 0.35, right, font_size=11, color=rgb(0x2E7D32))

# Checklist
add_box(s5, 0.3, 4.1, 9.4, 2.2, fill_color=rgb(0xE8F5E9), border_color=rgb(0x4CAF50))
add_textbox(s5, 0.5, 4.15, 9, 0.35, 'v 正确操作清单（KDIGO / UpToDate）', font_size=14, bold=True, color=rgb(0x2E7D32))
checklist = [
    '普通胰岛素 10U + 50% 葡萄糖 50mL，分别静脉推注（！不是滴注）',
    '推注后每 1h 测指尖血糖，连续 6h',
    '预期效果：血钾降低 0.5-1.0 mmol/L，维持 4-6h',
    '清醒认识：这只是"钾内移"，不是"钾清除"',
    '必须同步安排透析 - 胰岛素只是为你争取透析的时间'
]
for j, item in enumerate(checklist):
    add_textbox(s5, 0.7, 4.55 + j * 0.32, 8.5, 0.3, item, font_size=11, color=rgb(0x333333))

# ============================================================
# SLIDE: 口服钾结合剂药物对照表
# ============================================================
s6 = prs.slides.add_slide(blank_layout)
add_title_bar(s6, '参考：口服钾结合剂 - 新一代 vs 老一代', '附：同类药物速查对照')

add_textbox(s6, 0.5, 1.3, 9, 0.4, '新一代口服钾结合剂', font_size=16, bold=True, color=rgb(0x1A56DB))

new_drugs = [
    ('SZC 环硅酸锆钠', 'Lokelma / 利倍卓', '1h', '无机晶体捕获K+->直接排出，无钠负荷', '国内已上市'),
    ('Patiromer 帕替罗默', 'Veltassa', '4-7h', '钙基交换树脂，不引起钠负荷', '国内未上市')
]
for i, (name, brand, onset, char, approval) in enumerate(new_drugs):
    y = 1.8 + i * 0.6
    bg = rgb(0xE8F5E9) if i % 2 == 0 else rgb(0xF1F8E9)
    add_box(s6, 0.5, y, 9, 0.5, fill_color=bg, border_color=rgb(0xA5D6A7))
    add_textbox(s6, 0.7, y+0.1, 2.2, 0.35, name, font_size=12, bold=True, color=rgb(0x2E7D32))
    add_textbox(s6, 2.9, y+0.1, 1.5, 0.35, brand, font_size=11, color=rgb(0x333333))
    add_textbox(s6, 4.4, y+0.1, 0.8, 0.35, onset, font_size=11, color=rgb(0x333333))
    add_textbox(s6, 5.3, y+0.1, 2.3, 0.35, char, font_size=11, color=rgb(0x333333))
    add_textbox(s6, 7.7, y+0.1, 1.5, 0.35, approval, font_size=10, color=rgb(0x1A56DB))

add_textbox(s6, 0.5, 3.2, 9, 0.4, '老一代离子交换树脂', font_size=16, bold=True, color=rgb(0xC62828))

old_drugs = [
    ('SPS 聚苯乙烯磺酸钠', 'Kayexalate / 降钾树脂', '2-24h', '钠负荷->心衰、肠坏死', '正在被淘汰'),
    ('CPS 聚苯乙烯磺酸钙', '可利美特', '2-24h', '减轻钠负荷，仍可能肠坏死', 'SPS改良版')
]
for i, (name, brand, onset, risk, note) in enumerate(old_drugs):
    y = 3.7 + i * 0.6
    bg = rgb(0xFFEBEE) if i % 2 == 0 else rgb(0xFFF5F5)
    add_box(s6, 0.5, y, 9, 0.5, fill_color=bg, border_color=rgb(0xEF9A9A))
    add_textbox(s6, 0.7, y+0.1, 2.2, 0.35, name, font_size=12, bold=True, color=rgb(0xC62828))
    add_textbox(s6, 2.9, y+0.1, 1.8, 0.35, brand, font_size=11, color=rgb(0x333333))
    add_textbox(s6, 4.7, y+0.1, 0.9, 0.35, onset, font_size=11, color=rgb(0x333333))
    add_textbox(s6, 5.7, y+0.1, 2.2, 0.35, risk, font_size=11, color=rgb(0xC62828))
    add_textbox(s6, 8.0, y+0.1, 1.5, 0.35, note, font_size=10, color=rgb(0x888888))

add_textbox(s6, 0.5, 5.1, 9, 0.5,
    '一句话记住：SZC起效最快（1h），是急性高钾的最佳口服选择；Patiromer适合长期维持。老一代 SPS/CPS 因肠坏死风险正在被淘汰。',
    font_size=13, bold=True, color=rgb(0x1A56DB))
add_textbox(s6, 0.5, 5.7, 9, 0.3,
    'ENaC = Epithelial Sodium Channel（上皮钠通道）- ROMK 排 K+ 的动力来源',
    font_size=11, color=rgb(0x888888))

# New slides appended at end of existing presentation.
# Original 9 slides + 6 new slides = 15 total.
# To reorder: manually drag slides in PowerPoint to:
# 0:Title, 1:Case, 2:Initial Tx, 3:Endogenous K+ (orig p6),
# 4-6:剖析② x3 (new), 7-8:剖析③ x2 (new),
# 9:old analysis1, 10:old analysis2,
# 11:new drug table, 12:Correct pathway, 13:Diet, 14:Lessons
pass

desktop = r'C:\Users\Asus\Desktop'
existing = glob.glob(os.path.join(desktop, '一例重度贫血合并CKD4期高钾血症_降钾治疗困境与反思_v*'))
version = len(existing) + 1
output_path = os.path.join(desktop, f'一例重度贫血合并CKD4期高钾血症_降钾治疗困境与反思_v{version}.pptx')
prs.save(output_path)
print(f'Saved: {output_path}')
print(f'Total slides: {len(prs.slides)}')
print('Done.')
