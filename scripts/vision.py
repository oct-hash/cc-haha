"""SiliconFlow Vision API wrapper — analyze images from CLI.

Usage:
  python scripts/vision.py <image_path>
  python scripts/vision.py <image_path> "What's in this image?"
  python scripts/vision.py <image_path> --model Qwen/Qwen3-VL-8B-Instruct

Available vision models (auto-detected):
  - deepseek-ai/DeepSeek-OCR (default, best for text-heavy figures)
  - Qwen/Qwen3-VL-8B-Instruct (general purpose)
  - PaddlePaddle/PaddleOCR-VL-1.5 (pure OCR)
  - zai-org/GLM-4.5V (general purpose)

Requires SILICONFLOW_API_KEY in .env or environment.
"""

import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

# Fix Unicode output on Windows (GBK -> UTF-8)
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

API_KEY = os.environ.get("SILICONFLOW_API_KEY", "")
API_BASE = "https://api.siliconflow.cn/v1/chat/completions"
DEFAULT_MODEL = "deepseek-ai/DeepSeek-OCR"
DEFAULT_PROMPT = "请详细描述这张图片的全部内容，包括所有文字、标签、图表结构和数据。用中文回答。"


def load_api_key() -> str:
    if API_KEY:
        return API_KEY
    # Try loading from .env
    for env_path in [Path(__file__).parent.parent / ".env", Path.cwd() / ".env"]:
        if env_path.exists():
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("SILICONFLOW_API_KEY="):
                        return line.split("=", 1)[1].strip()
    return ""


def encode_image(path: str) -> tuple[str, str]:
    """Returns (base64_string, mime_type)."""
    ext = Path(path).suffix.lower()
    mime_map = {".png": "image/png", ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif"}
    mime = mime_map.get(ext, "image/png")
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode(), mime


def analyze(image_path: str, prompt: str = DEFAULT_PROMPT,
            model: str = DEFAULT_MODEL, max_tokens: int = 4096) -> str:
    api_key = load_api_key()
    if not api_key:
        return "Error: SILICONFLOW_API_KEY not found in .env or environment."

    if not os.path.exists(image_path):
        return f"Error: file not found: {image_path}"

    img_b64, mime = encode_image(image_path)

    data = json.dumps({
        "model": model,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url",
                 "image_url": {"url": f"data:{mime};base64,{img_b64}"}},
                {"type": "text", "text": prompt}
            ]
        }],
        "max_tokens": max_tokens
    }).encode()

    req = urllib.request.Request(
        API_BASE, data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    )

    try:
        resp = urllib.request.urlopen(req, timeout=120)
        result = json.loads(resp.read().decode())
        return result["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        return f"API error {e.code}: {body}"
    except Exception as e:
        return f"Error: {e}"


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    image_path = sys.argv[1]
    prompt = DEFAULT_PROMPT
    model = DEFAULT_MODEL

    args = sys.argv[2:]
    i = 0
    while i < len(args):
        if args[i] == "--model" and i + 1 < len(args):
            model = args[i + 1]
            i += 2
        elif args[i] == "--prompt" and i + 1 < len(args):
            prompt = args[i + 1]
            i += 2
        elif not args[i].startswith("--"):
            prompt = args[i]
            i += 1
        else:
            i += 1

    result = analyze(image_path, prompt=prompt, model=model)
    print(result)


if __name__ == "__main__":
    main()
