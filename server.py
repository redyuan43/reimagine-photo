import os
import json
import base64
import tempfile
import requests
import time
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
try:
    from openai import OpenAI
except Exception:
    OpenAI = None

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
    with open(image_path, 'rb') as image_file:
        base64_image = base64.b64encode(image_file.read()).decode('utf-8')

    base_url = os.getenv("DASHSCOPE_COMPAT_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    api_key = os.getenv("DASHSCOPE_API_KEY")
    start_time = time.time()
    print("图像分析配置:")
    print(f"   图像文件: {image_path}")
    print(f"   详细统计: {'开启' if verbose else '关闭'}")
    print(f"   流式输出: {'开启' if stream_output else '关闭'}")
    print(f"   模型: qwen3-vl-plus")
    print(f"   接口: {base_url}")
    print(f"开始时间: {datetime.now().strftime('%H:%M:%S')}")
    print("-" * 60)

    data_url = f"data:image/jpeg;base64,{base64_image}"
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text", "text": prompt_text},
            ],
        },
    ]

    if OpenAI and api_key:
        try:
            client = OpenAI(api_key=api_key, base_url=base_url)
            resp = client.chat.completions.create(
                model="qwen3-vl-flash",
                messages=messages,
                temperature=0.1,
                top_p=0.1,
                max_tokens=2048,
                stream=bool(stream_output),
                extra_body={
                    "enable_thinking": bool(enable_thinking),
                    "thinking_budget": 81920,
                },
            )
            print("使用 openai 客户端兼容模式调用")
            text = ""
            if stream_output:
                print("AI分析中...\n")
                first_chunk_time = None
                total_chars = 0
                chunk_count = 0
                for chunk in resp:
                    try:
                        delta = chunk.choices[0].delta
                        if delta and getattr(delta, "content", None):
                            c = delta.content
                            if first_chunk_time is None and c:
                                first_chunk_time = time.time()
                                if verbose:
                                    ttfb = first_chunk_time - start_time
                                    print(f"首字响应时间: {ttfb:.2f}秒")
                            if c:
                                print(c, end='', flush=True)
                                text += c
                                total_chars += len(c)
                                chunk_count += 1
                    except Exception:
                        continue
            else:
                try:
                    text = resp.choices[0].message.content or ""
                except Exception:
                    text = ""
            if verbose:
                end_time = time.time()
                total_time = end_time - start_time
                print("\n\n性能统计:")
                print(f"   总耗时: {total_time:.2f}秒")
                if stream_output:
                    print(f"   输出字符: {total_chars}")
                    print(f"   流式块数: {chunk_count}")
                    print(f"   平均速度: {total_chars/total_time if total_time>0 else 0:.1f}字符/秒")
                print(f"   完成时间: {datetime.now().strftime('%H:%M:%S')}")
            cleaned = (text or "").strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            return json.loads(cleaned.strip())
        except Exception as e:
            print(f"客户端调用失败: {e}")

    # fallback to direct HTTP compatible endpoint
    url = base_url.rstrip("/") + "/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    body = {
        "model": "qwen3-vl-flash",
        "messages": messages,
        "temperature": 0.1,
        "top_p": 0.1,
        "max_tokens": 2048,
        "stream": bool(stream_output),
        "extra_body": {
            "enable_thinking": bool(enable_thinking),
            "thinking_budget": 81920,
        },
    }
    print("HTTP兼容模式调用")
    r = requests.post(url, json=body, headers=headers, timeout=180, stream=bool(stream_output))
    print(f"HTTP状态码: {r.status_code}")
    if r.status_code != 200:
        try:
            print(f"响应: {r.text[:300]}")
        except Exception:
            pass
        return None
    if stream_output:
        text = ""
        for line in r.iter_lines():
            if not line:
                continue
            try:
                s = line.decode("utf-8").strip()
                if not s:
                    continue
                if s.startswith("data:"):
                    s = s[5:].strip()
                data = json.loads(s)
                chs = data.get("choices") or []
                if chs:
                    delta = chs[0].get("delta") or {}
                    if delta.get("content"):
                        c = delta.get("content")
                        print(c, end='', flush=True)
                        text += c
            except Exception:
                continue
    else:
        data = r.json()
        try:
            text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
        except Exception:
            text = ""
    if verbose:
        end_time = time.time()
        total_time = end_time - start_time
        print("\n\n性能统计:")
        print(f"   总耗时: {total_time:.2f}秒")
        print(f"   完成时间: {datetime.now().strftime('%H:%M:%S')}")
    cleaned = (text or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return json.loads(cleaned.strip())

@app.post("/analyze")
async def analyze(image: UploadFile = File(...), prompt: str = Form("")):
    print("收到分析请求")
    buf = await image.read()
    print(f"接收字节: {len(buf)}")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
    tmp.write(buf)
    tmp.flush()
    tmp.close()

    result = analyze_image_with_qwen3_vl_plus(tmp.name, stream_output=True, enable_thinking=True)
    ui = result.get("ui_analysis") if isinstance(result, dict) else None
    items = _parse_ui_to_plan_items(ui or {})
    summary = None
    if isinstance(result, dict):
        if "summary_ui" in result:
            summary = result.get("summary_ui")
        elif "summary" in result:
            summary = result.get("summary")
        elif ui and isinstance(ui, dict):
            summary = ui.get("summary_ui")
    print(f"返回项数: {len(items)}")
    print(f"返回总结长度: {len(summary or '')}")
    return {"analysis": items, "summary": summary or ""}

