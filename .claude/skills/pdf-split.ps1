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
    Write-Host "Installing pypdf2..."
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
Write-Host "Input: $InputFile"
Write-Host "Output: $OutputDir"
Write-Host ""

# Determine split mode
$splitMode = "pages"
if ($Ranges -ne "") {
    $splitMode = "ranges"
} elseif ($SmartSplit) {
    $splitMode = "smart"
} elseif ($SizePerMB -gt 0) {
    $splitMode = "size"
}

# Write Python script to temp file - use ASCII to avoid encoding issues
$tempScript = Join-Path $env:TEMP "pdf_split_temp.py"

$pythonCode = @"
import os
import sys
from pypdf import PdfReader, PdfWriter

input_pdf = r"$InputFile"
pages_per_part = $PagesPerPart
output_dir = r"$OutputDir"
ranges_str = """$Ranges"""
size_per_mb = $SizePerMB
split_mode = """$splitMode"""

os.makedirs(output_dir, exist_ok=True)

try:
    reader = PdfReader(input_pdf)
    total = len(reader.pages)
    file_size = os.path.getsize(input_pdf) / (1024 * 1024)
    print("Total pages: " + str(total))
    print("File size: %.2f MB" % file_size)

    if split_mode == "size":
        pages_per_mb = total / file_size if file_size > 0 else 10
        target_pages = max(int(size_per_mb * pages_per_mb), 1)
        print("Split by size: ~" + str(size_per_mb) + "MB per part (~" + str(target_pages) + " pages)")
        for i in range(0, total, target_pages):
            writer = PdfWriter()
            for page in reader.pages[i:i+target_pages]:
                writer.add_page(page)
            part_num = i // target_pages + 1
            output_path = os.path.join(output_dir, "part_" + str(part_num) + ".pdf")
            with open(output_path, "wb") as f:
                writer.write(f)
            page_end = min(i+target_pages, total)
            print("Saved: part_" + str(part_num) + ".pdf (pages " + str(i+1) + "-" + str(page_end) + ")")

    elif split_mode == "smart":
        print("Smart split mode: detecting chapters...")
        outline = []
        if reader.outline:
            def extract_titles(outline_list, level=0):
                for item in outline_list:
                    if isinstance(item, list):
                        extract_titles(item, level + 1)
                    else:
                        title = item.get("/Title", "Chapter " + str(len(outline)+1))
                        page_num = None
                        if "/Page" in item:
                            pd = item["/Page"]
                            if isinstance(pd, int):
                                page_num = pd
                            elif isinstance(pd, tuple) and len(pd) > 0:
                                page_num = pd[0] if isinstance(pd[0], int) else None
                        outline.append({"title": title, "level": level, "page": page_num})
            try:
                extract_titles(reader.outline)
            except:
                pass

        if len(outline) > 0:
            print("Detected " + str(len(outline)) + " chapters/bookmarks")
            part_num = 1
            writer = PdfWriter()
            current_part_start = 0
            for item in outline:
                if item["page"] is not None and item["page"] > current_part_start:
                    for page in reader.pages[current_part_start:item["page"]]:
                        writer.add_page(page)
                    output_path = os.path.join(output_dir, "part_" + str(part_num) + ".pdf")
                    with open(output_path, "wb") as f:
                        writer.write(f)
                    print("Saved: part_" + str(part_num) + ".pdf - " + item["title"] + " (pages " + str(current_part_start+1) + "-" + str(item["page"]) + ")")
                    part_num += 1
                    writer = PdfWriter()
                    current_part_start = item["page"]
            if current_part_start < total:
                for page in reader.pages[current_part_start:]:
                    writer.add_page(page)
                output_path = os.path.join(output_dir, "part_" + str(part_num) + ".pdf")
                with open(output_path, "wb") as f:
                    writer.write(f)
                print("Saved: part_" + str(part_num) + ".pdf (pages " + str(current_part_start+1) + "-" + str(total) + ")")
        else:
            print("No chapters detected, using default page split")
            for i in range(0, total, pages_per_part):
                writer = PdfWriter()
                for page in reader.pages[i:i+pages_per_part]:
                    writer.add_page(page)
                part_num = i // pages_per_part + 1
                output_path = os.path.join(output_dir, "part_" + str(part_num) + ".pdf")
                with open(output_path, "wb") as f:
                    writer.write(f)
                print("Saved: part_" + str(part_num) + ".pdf (pages " + str(i+1) + "-" + str(min(i+pages_per_part, total)) + ")")

    elif split_mode == "ranges":
        ranges = []
        for r in ranges_str.split(","):
            r = r.strip()
            if "-" in r:
                parts = r.split("-")
                start = int(parts[0]) - 1
                end = int(parts[1])
                ranges.append((start, end))
        for idx, (start, end) in enumerate(ranges):
            writer = PdfWriter()
            for page in reader.pages[start:end]:
                writer.add_page(page)
            output_path = os.path.join(output_dir, "part_" + str(idx+1) + ".pdf")
            with open(output_path, "wb") as f:
                writer.write(f)
            print("Saved: part_" + str(idx+1) + ".pdf (pages " + str(start+1) + "-" + str(end) + ")")

    else:
        for i in range(0, total, pages_per_part):
            writer = PdfWriter()
            for page in reader.pages[i:i+pages_per_part]:
                writer.add_page(page)
            part_num = i // pages_per_part + 1
            output_path = os.path.join(output_dir, "part_" + str(part_num) + ".pdf")
            with open(output_path, "wb") as f:
                writer.write(f)
            print("Saved: part_" + str(part_num) + ".pdf (pages " + str(i+1) + "-" + str(min(i+pages_per_part, total)) + ")")

    print("\nDone! Total " + str(total) + " pages")
except Exception as e:
    print("Error: " + str(e))
    sys.exit(1)
"@

Set-Content -Path $tempScript -Value $pythonCode -Encoding UTF8

# Execute Python script
python $tempScript
$exitCode = $LASTEXITCODE

# Clean up temp file
Remove-Item $tempScript -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=============================================="
Write-Host "Split complete!"
Write-Host "Output: $OutputDir"
Write-Host "=============================================="

exit $exitCode