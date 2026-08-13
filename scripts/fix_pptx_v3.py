"""
Fix all 7 audit issues in v2 and generate v3.
Issues fixed:
1. K+ data inconsistency (slide 2 admission 5.7 vs table 0h 6.7)
2. Slide 5 station 1 physiology (incorrectly mentions diuretics for normal K+ excretion)
3. Slide 4 old page number "6" and title "方案剖析③"
4. Slide 11 cross-reference "详见第8页"
5. Slide 13 subtitle mentions "四个问题" but none listed
6. Layout inconsistency (new slides transparent bg vs original solid white)
7. Arrow symbol inconsistency (-> vs →)
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.oxml.ns import qn
import os, glob

SRC = r'C:\Users\Asus\Desktop\一例重度贫血合并CKD4期高钾血症_降钾治疗困境与反思_v2.pptx'
prs = Presentation(SRC)

WHITE = RGBColor(0xFF, 0xFF, 0xFF)

def replace_text_in_shape(shape, old, new):
    if not shape.has_text_frame:
        return False
    replaced = False
    for para in shape.text_frame.paragraphs:
        for run in para.runs:
            if old in run.text:
                run.text = run.text.replace(old, new)
                replaced = True
    return replaced

def replace_text_in_slide(slide, old, new):
    count = 0
    for shape in slide.shapes:
        if replace_text_in_shape(shape, old, new):
            count += 1
    return count

def set_slide_bg_solid_white(slide):
    bg = slide.background
    bg.fill.solid()
    bg.fill.fore_color.rgb = WHITE

def remove_layout_placeholders(slide):
    """Remove placeholder shapes inherited from layout (has p:ph element, empty text)."""
    to_remove = []
    for shape in slide.shapes:
        # Find p:ph element anywhere in shape XML (it's nested in nvSpPr/nvPr)
        ph = shape._element.find('.//' + qn('p:ph'))
        if ph is not None and shape.has_text_frame:
            if shape.text_frame.text.strip() == '':
                to_remove.append(shape)
    for shape in to_remove:
        sp = shape._element
        sp.getparent().remove(sp)
    return len(to_remove)

def fix_arrows_in_shape(shape):
    if not shape.has_text_frame:
        return 0
    count = 0
    for para in shape.text_frame.paragraphs:
        for run in para.runs:
            if '->' in run.text:
                run.text = run.text.replace('->', '\u2192')
                count += 1
    return count

print("=" * 60)
print("Applying fixes to v2 -> v3...")
print("=" * 60)

# ---- Fix 1: K+ data consistency ----
# Slide 2 diagnosis: K+ split across runs [1]'...K⁺ ', [2]'5', [3]'.7 mmol/L)...'
#   Change run [2] '5' -> '6' so admission K+ = 6.7
# Slide 3 summary: "12h内从 5.7→6.7" split across runs
#   [1]'✘ 12h内从 ', [2]'5', [3]'.7→', [4]'6.7', [5]' mmol/L...'
#   Change run [2] '5' -> '6', run [4] '6.7' -> '7.1' so it reads "6.7→7.1"
print("\n[Fix 1] K+ data consistency...")
for shape in prs.slides[1].shapes:
    if shape.has_text_frame:
        for para in shape.text_frame.paragraphs:
            runs = para.runs
            for i, run in enumerate(runs):
                if '高钾血症' in run.text and 'K' in run.text:
                    if i+1 < len(runs) and runs[i+1].text.strip() == '5':
                        runs[i+1].text = '6'
                        print("  Slide 2: admission K+ '5' -> '6' (now 6.7 mmol/L)")
                        break

for shape in prs.slides[2].shapes:
    if shape.has_text_frame:
        for para in shape.text_frame.paragraphs:
            text = para.text
            if '12h内从' in text and 'mmol/L' in text:
                runs = para.runs
                for j, run in enumerate(runs):
                    if run.text.strip() == '5' and j+1 < len(runs) and '.7→' in runs[j+1].text:
                        run.text = '6'
                        print("  Slide 3: '5.7→' -> '6.7→'")
                    if run.text.strip() == '6.7' and j > 0 and '→' in runs[j-1].text:
                        run.text = '7.1'
                        print("  Slide 3: '→6.7' -> '→7.1'")
                break

# ---- Fix 2: Slide 5 (index 4) station 1 physiology ----
# Station 1 box: runs [0]'袢利尿剂 -> 抑制 NKCC2', [1]'远端 Na+ 流量增加'
print("\n[Fix 2] Slide 5 station 1 physiology...")
slide5 = prs.slides[4]
for shape in slide5.shapes:
    if shape.has_text_frame:
        for para in shape.text_frame.paragraphs:
            runs = para.runs
            for i, run in enumerate(runs):
                if 'NKCC2' in run.text:
                    run.text = '肾小球滤过 Na+ → 远端流量充足'
                    if i+1 < len(runs):
                        runs[i+1].text = '（每日滤过 Na+ ≈ 17000 mmol）'
                    print("  Fixed: station 1 text replaced")
                    break

# ---- Fix 3: Slide 4 (index 3) page number and title ----
print("\n[Fix 3] Slide 4 page number & title...")
slide4 = prs.slides[3]
for shape in slide4.shapes:
    if shape.has_text_frame:
        text = shape.text_frame.text
        if text.strip() == '6':
            for para in shape.text_frame.paragraphs:
                for run in para.runs:
                    if run.text.strip() == '6':
                        run.text = run.text.replace('6', '4')
                        print(f"  Fixed: page number 6->4")
                        break
        if '\u65b9\u6848\u5256\u6790\u2462' in text:
            for para in shape.text_frame.paragraphs:
                for run in para.runs:
                    if '\u65b9\u6848\u5256\u6790\u2462' in run.text:
                        run.text = run.text.replace(
                            '\u65b9\u6848\u5256\u6790\u2462',
                            '\u5256\u6790\u2460\uff1a\u5185\u6e90\u6027\u94be\u6e90'
                        )
                        print(f"  Fixed: title")
                        break

# ---- Fix 4: Slide 11 (index 10) cross-reference ----
print("\n[Fix 4] Slide 11 cross-reference...")
n = replace_text_in_slide(prs.slides[10],
    '\u8be6\u89c1\u7b2c8\u9875\u300c\u9ed1\u540d\u5355\u300d',
    '\u8be6\u89c1\u996e\u98df\u9ed1\u540d\u5355\u9875')
print(f"  {n} replacements")

# ---- Fix 5: Slide 13 (index 12) subtitle ----
print("\n[Fix 5] Slide 13 subtitle...")
n = replace_text_in_slide(prs.slides[12],
    '\u56db\u6761\u6559\u8bad \u00b7 \u56db\u4e2a\u95ee\u9898 \u00b7 \u9762\u5411\u672a\u6765\u7684\u601d\u8003',
    '\u56db\u6761\u6559\u8bad \u00b7 \u9762\u5411\u672a\u6765\u7684\u601d\u8003')
print(f"  {n} replacements")

# ---- Fix 6: Layout consistency (slides 5-10, indices 4-9) ----
print("\n[Fix 6] Layout consistency...")
for i in range(4, 10):
    slide = prs.slides[i]
    set_slide_bg_solid_white(slide)
    removed = remove_layout_placeholders(slide)
    print(f"  Slide {i+1}: bg->solid white, removed {removed} placeholders")

# ---- Fix 7: Arrow symbol consistency ----
print("\n[Fix 7] Arrow consistency...")
total_arrows = 0
for i in range(len(prs.slides)):
    slide = prs.slides[i]
    for shape in slide.shapes:
        total_arrows += fix_arrows_in_shape(shape)
print(f"  Fixed {total_arrows} arrow occurrences across all slides")

# ---- Save as v3 ----
desktop = r'C:\Users\Asus\Desktop'
existing = glob.glob(os.path.join(desktop, '\u4e00\u4f8b\u91cd\u5ea6\u8d2b\u8840\u5408\u5e76CKD4\u671f\u9ad8\u94be\u8840\u75c7_\u964d\u94be\u6cbb\u7597\u56f0\u5883\u4e0e\u53cd\u601d_v*'))
versions = []
for f in existing:
    basename = os.path.basename(f)
    if '_v' in basename:
        try:
            v = int(basename.split('_v')[-1].replace('.pptx', ''))
            versions.append(v)
        except ValueError:
            pass
next_v = max(versions) + 1 if versions else 3
output_path = os.path.join(desktop, f'\u4e00\u4f8b\u91cd\u5ea6\u8d2b\u8840\u5408\u5e76CKD4\u671f\u9ad8\u94be\u8840\u75c7_\u964d\u94be\u6cbb\u7597\u56f0\u5883\u4e0e\u53cd\u601d_v{next_v}.pptx')
prs.save(output_path)

print(f"\n{'=' * 60}")
print(f"Saved: v{next_v}")
print(f"Total slides: {len(prs.slides)}")
print("Done.")
