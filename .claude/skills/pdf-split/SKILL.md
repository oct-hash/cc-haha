---
name: pdf-split
description: Split PDF files into smaller parts by page count or page ranges
tools: [Bash, Write]
---

# PDF Split Skill

Split large PDF files into smaller, manageable parts.

## Supported Operations

### 1. Split by Page Count
Split a PDF into parts with a specified number of pages per part.

```
输入: D:\教材.pdf
每部分页数: 100
输出目录: D:\拆分
```

### 2. Split by Page Ranges
Split a PDF into specific page ranges.

```
输入: D:\教材.pdf
范围: 1-50, 51-100, 101-150
输出目录: D:\拆分
```

### 3. Split by File Size
Split a PDF into parts of approximately equal file size.

```
输入: D:\教材.pdf
每个文件大小: 50MB
输出目录: D:\拆分
```

### 4. Smart Split (Preserve Chapters)
Automatically detect chapters/bookmarks and split at chapter boundaries.
Avoids splitting in the middle of a chapter.

```
输入: D:\教材.pdf
分割方式: 智能（保持章节完整）
输出目录: D:\拆分
```

## Usage

When user says "分割PDF" or "拆分PDF":

1. **Ask for the PDF file path** if not provided
2. **Ask for split method**:
   - "按页数分割" - by page count (e.g., every 100 pages)
   - "按范围分割" - by page ranges (e.g., 1-50, 51-100)
   - "按大小分割" - by file size (e.g., 50MB per part)
   - "智能分割" - preserve chapters/bookmarks
3. **Ask for output directory** (default: same as input, create subfolder)
4. **Execute the split script**

### Usage Examples

| 场景 | 命令 |
|------|------|
| 按100页分割 | `pdf-split.ps1 -InputFile "D:\教材.pdf" -PagesPerPart 100 -OutputDir "D:\拆分"` |
| 按范围分割 | `pdf-split.ps1 -InputFile "D:\教材.pdf" -Ranges "1-50,51-100" -OutputDir "D:\拆分"` |
| 按50MB分割 | `pdf-split.ps1 -InputFile "D:\教材.pdf" -SizePerMB 50 -OutputDir "D:\拆分"` |
| 智能分割 | `pdf-split.ps1 -InputFile "D:\教材.pdf" -SmartSplit -OutputDir "D:\拆分"` |

## PowerShell Script

```powershell
# PDF Split Script for DeepTutor
# Usage:
#   pdf-split.ps1 -InputFile "D:\教材.pdf" -PagesPerPart 100 -OutputDir "D:\拆分"
#   pdf-split.ps1 -InputFile "D:\教材.pdf" -Ranges "1-50,51-100" -OutputDir "D:\拆分"
#   pdf-split.ps1 -InputFile "D:\教材.pdf" -SizePerMB 50 -OutputDir "D:\拆分"
#   pdf-split.ps1 -InputFile "D:\教材.pdf" -SmartSplit -OutputDir "D:\拆分"

param(
    [Parameter(Mandatory=$true)]
    [string]$InputFile,

    [Parameter(Mandatory=$false)]
    [int]$PagesPerPart = 100,

    [Parameter(Mandatory=$false)]
    [string]$Ranges = "",

    [Parameter(Mandatory=$false)]
    [string]$OutputDir = "",

    [Parameter(Mandatory=$false)]
    [int]$SizePerMB = 0,

    [Parameter(Mandatory=$false)]
    [switch]$SmartSplit = $false
)

# Install pypdf2 if not present
$installed = pip show pypdf2 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "正在安装 pypdf2..."
    pip install pypdf2
}

# Set output directory
if ([string]::IsNullOrEmpty($OutputDir)) {
    $OutputDir = Split-Path $InputFile -Parent
    $OutputDir = Join-Path $OutputDir "pdf_split_output"
}

# Create output directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

Write-Host "=============================================="
Write-Host "PDF Split Tool"
Write-Host "=============================================="
Write-Host "输入文件: $InputFile"
Write-Host "输出目录: $OutputDir"
Write-Host ""

# Python script for splitting (all modes)
python -c @"
from pypdf import PdfReader, PdfWriter
import os

input_pdf = r\"$InputFile\"
pages_per_part = $PagesPerPart
output_dir = r\"$OutputDir\"
ranges_str = \"$Ranges\"
size_per_mb = $SizePerMB
smart_split = str($SmartSplit).lower()

os.makedirs(output_dir, exist_ok=True)
reader = PdfReader(input_pdf)
total = len(reader.pages)
file_size = os.path.getsize(input_pdf) / (1024 * 1024)
print(f'总页数: {total}')
print(f'文件大小: {file_size:.2f} MB')

# Split by file size
if ranges_str.strip() == '' and size_per_mb > 0:
    pages_per_mb = total / file_size if file_size > 0 else 10
    target_pages = max(int(size_per_mb * pages_per_mb), 1)
    print(f'按文件大小分割: 每部分约 {size_per_mb}MB (约 {target_pages} 页)')
    for i in range(0, total, target_pages):
        writer = PdfWriter()
        for page in reader.pages[i:i+target_pages]:
            writer.add_page(page)
        part_num = i // target_pages + 1
        output_path = os.path.join(output_dir, f'part_{part_num}.pdf')
        with open(output_path, 'wb') as f:
            writer.write(f)
        print(f'已保存: part_{part_num}.pdf (页{i+1}-{min(i+target_pages, total)})')

# Smart split - preserve chapters
elif smart_split == 'true' and ranges_str.strip() == '':
    print('智能分割模式: 检测章节...')
    outline = []
    if reader.outline:
        def extract_titles(outline_list, level=0):
            for item in outline_list:
                if isinstance(item, list):
                    extract_titles(item, level + 1)
                else:
                    title = item.get('/Title', f'Chapter {len(outline)+1}')
                    page_num = None
                    if '/Page' in item:
                        pd = item['/Page']
                        if isinstance(pd, int):
                            page_num = pd
                        elif isinstance(pd, tuple) and len(pd) > 0:
                            page_num = pd[0] if isinstance(pd[0], int) else None
                    outline.append({'title': title, 'level': level, 'page': page_num})
        try:
            extract_titles(reader.outline)
        except:
            pass

    if len(outline) > 0:
        print(f'检测到 {len(outline)} 个章节/书签')
        part_num = 1
        writer = PdfWriter()
        current_part_start = 0
        for idx, item in enumerate(outline):
            if item['page'] is not None and item['page'] > current_part_start:
                for page in reader.pages[current_part_start:item['page']]:
                    writer.add_page(page)
                output_path = os.path.join(output_dir, f'part_{part_num}.pdf')
                with open(output_path, 'wb') as f:
                    writer.write(f)
                print(f'已保存: part_{part_num}.pdf - {item[\"title\"]} (页{current_part_start+1}-{item[\"page\"]})')
                part_num += 1
                writer = PdfWriter()
                current_part_start = item['page']
        if current_part_start < total:
            for page in reader.pages[current_part_start:]:
                writer.add_page(page)
            output_path = os.path.join(output_dir, f'part_{part_num}.pdf')
            with open(output_path, 'wb') as f:
                writer.write(f)
            print(f'已保存: part_{part_num}.pdf (页{current_part_start+1}-{total})')
    else:
        print('未检测到章节书签，使用默认分页分割')
        for i in range(0, total, pages_per_part):
            writer = PdfWriter()
            for page in reader.pages[i:i+pages_per_part]:
                writer.add_page(page)
            part_num = i // pages_per_part + 1
            output_path = os.path.join(output_dir, f'part_{part_num}.pdf')
            with open(output_path, 'wb') as f:
                writer.write(f)
            print(f'已保存: part_{part_num}.pdf (页{i+1}-{min(i+pages_per_part, total)})')

# Split by ranges
elif ranges_str.strip():
    ranges = []
    for r in ranges_str.split(','):
        r = r.strip()
        if '-' in r:
            parts = r.split('-')
            start = int(parts[0]) - 1
            end = int(parts[1])
            ranges.append((start, end))
    for idx, (start, end) in enumerate(ranges):
        writer = PdfWriter()
        for page in reader.pages[start:end]:
            writer.add_page(page)
        output_path = os.path.join(output_dir, f'part_{idx+1}.pdf')
        with open(output_path, 'wb') as f:
            writer.write(f)
        print(f'已保存: part_{idx+1}.pdf (页{start+1}-{end})')

# Split by page count (default)
else:
    for i in range(0, total, pages_per_part):
        writer = PdfWriter()
        for page in reader.pages[i:i+pages_per_part]:
            writer.add_page(page)
        part_num = i // pages_per_part + 1
        output_path = os.path.join(output_dir, f'part_{part_num}.pdf')
        with open(output_path, 'wb') as f:
            writer.write(f)
        print(f'已保存: part_{part_num}.pdf (页{i+1}-{min(i+pages_per_part, total)})')

print(f'完成! 共 {total} 页')
"@

Write-Host ""
Write-Host "=============================================="
Write-Host "分割完成！"
Write-Host "输出目录: $OutputDir"
Write-Host "=============================================="
```

## Example Prompts

- "把 D:\教材.pdf 分割成每100页一个文件"
- "将 初中物理.pdf 按50页分割"
- "把 PDF 拆成三部分：1-100, 101-200, 201-结尾"
- "按50MB大小分割这个PDF"
- "智能分割这个教材，保持章节完整"

## Dependencies

- Python 3.8+
- PyPDF2: `pip install pypdf2`
