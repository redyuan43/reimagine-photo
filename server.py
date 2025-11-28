import os
import json
import base64
import tempfile
import requests
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware

try:
    from enhanced_prompt import get_enhanced_prompt
except ImportError:
    def get_enhanced_prompt():
        return "你是一名图像分析专家，请对输入的图片进行专业级别的结构化解析。"

# 简化：不使用 dashscope 直接调用本地/指定推理服务

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def _parse_ui_to_plan_items(ui: dict):
    items = []
    for idx, p in enumerate(ui.get("professional_analysis") or []):
        items.append({
            "id": p.get("id") or str(idx + 1),
            "problem": p.get("problem") or "",
            "solution": p.get("solution") or "",
            "engine": p.get("engine") or "Analysis",
            "type": "generative" if (p.get("type") == "generative") else "adjustment",
            "checked": True,
        })

    fr = ui.get("filter_recommendations") or {}
    primary = fr.get("primary_filter") or {}
    alts = fr.get("alternative_filters") or []
    options = []
    if primary.get("name"):
        options.append(primary.get("name"))
    for a in alts:
        if a.get("name"):
            options.append(a.get("name"))
    if options:
        items.append({
            "id": "filter_opt",
            "problem": "Creative Styles",
            "solution": primary.get("description") or "Apply Artistic Filter",
            "engine": "Filter",
            "type": "adjustment",
            "checked": False,
            "options": options,
        })
    return items

def analyze_image_with_qwen3_vl_plus(image_path: str, verbose: bool = True, stream_output: bool = True, enable_thinking: bool = False):
    prompt_text = get_enhanced_prompt()
    ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
    with open(image_path, 'rb') as image_file:
        base64_image = base64.b64encode(image_file.read()).decode('utf-8')
    payload = {
        "model": "qwen3-vl:235b-cloud",
        "prompt": prompt_text,
        "images": [base64_image],
        "stream": stream_output,
        "format": "json",
        "options": {
            "temperature": 0.1,
            "top_p": 0.9,
            "max_tokens": 2048,
            "think": bool(enable_thinking),
            "num_ctx": 4096
        }
    }
    r = requests.post(ollama_url, json=payload, timeout=180, stream=stream_output)
    if r.status_code != 200:
        return None
    if stream_output:
        text = ""
        for line in r.iter_lines():
            if line:
                try:
                    data = json.loads(line.decode('utf-8'))
                    chunk = data.get("response", "")
                    if chunk:
                        text += chunk
                except Exception:
                    continue
    else:
        data = r.json()
        text = data.get("response", "")
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return json.loads(cleaned.strip())

@app.post("/analyze")
async def analyze(image: UploadFile = File(...), prompt: str = Form("")):
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
    tmp.write(await image.read())
    tmp.flush()
    tmp.close()

    result = analyze_image_with_qwen3_vl_plus(tmp.name, stream_output=True, enable_thinking=False)
    ui = result.get("ui_analysis") if isinstance(result, dict) else None
    items = _parse_ui_to_plan_items(ui or {})
    return {"analysis": items}

