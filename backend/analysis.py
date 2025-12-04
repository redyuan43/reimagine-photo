import os
import json
import time
import base64
import tempfile
from typing import Optional, List, Dict, Any

import requests

from .config import logger
from enhanced_prompt import get_enhanced_prompt


def extract_thinking(result: Optional[dict]) -> Optional[str]:
    """从模型返回中提取思维链文本。"""
    if not isinstance(result, dict):
        return None
    keys = [
        "thinking",
        "thoughts",
        "reasoning",
        "analysis",
        "chain_of_thought",
        "chain_of_thoughts",
    ]
    for k in keys:
        if k in result:
            val = result.get(k)
            if isinstance(val, str) and val.strip():
                return val.strip()
            if isinstance(val, list):
                joined = "\n".join([str(x) for x in val if str(x).strip()])
                if joined.strip():
                    return joined.strip()
    return None


def sse_event(obj: dict) -> str:
    """将对象编码为SSE事件字符串。"""
    return f"data:{json.dumps(obj, ensure_ascii=False)}\n\n"


def parse_ui_to_plan_items(ui: Dict[str, Any]) -> List[Dict[str, Any]]:
    """将 UI 分析结构转换为前端可用的计划项列表。"""
    items: List[Dict[str, Any]] = []
    for idx, p in enumerate(ui.get("professional_analysis") or []):
        items.append({
            "id": p.get("id") or str(idx + 1),
            "problem": p.get("problem") or "",
            "solution": p.get("solution") or "",
            "engine": p.get("engine") or "Analysis",
            "category": p.get("category") or "发现问题",
            "type": "generative" if (p.get("type") == "generative") else "adjustment",
            "checked": True,
        })

    fr = ui.get("filter_recommendations") or {}
    primary = fr.get("primary_filter") or {}
    alts = fr.get("alternative_filters") or []
    options: List[str] = []
    if primary.get("name"):
        options.append(primary.get("name"))
    for a in alts:
        if a.get("name"):
            options.append(a.get("name"))
    if options:
        items.append({
            "id": "filter_opt",
            "problem": "",
            "solution": primary.get("description") or "Apply Artistic Filter",
            "engine": "Filter",
            "category": "风格滤镜",
            "type": "adjustment",
            "checked": False,
            "options": options,
        })
    return items


def extract_professional_items(buffer: str, sent_count: int) -> List[Dict[str, Any]]:
    """从流式缓冲中提取 professional_analysis 新增项。"""
    items: List[Dict[str, Any]] = []
    idx = buffer.find("\"professional_analysis\"")
    if idx == -1:
        return items
    arr_start = buffer.find("[", idx)
    if arr_start == -1:
        return items
    i = arr_start + 1
    brace = 0
    cur: List[str] = []
    count = 0
    while i < len(buffer):
        ch = buffer[i]
        cur.append(ch)
        if ch == "{":
            brace += 1
        elif ch == "}":
            brace -= 1
            if brace == 0:
                seg = "{" + "".join(cur).split("{", 1)[1]
                try:
                    obj = json.loads(seg)
                    count += 1
                    if count > sent_count:
                        items.append(obj)
                except Exception:
                    pass
                cur = []
                j = i + 1
                while j < len(buffer) and buffer[j] in [",", " ", "\n", "\r", "\t"]:
                    j += 1
                i = j - 1
        elif ch == "]":
            break
        i += 1
    return items


def normalize_size_param(size: str, n: int) -> Optional[str]:
    """按模型约束规范化尺寸参数，仅在 n==1 时生效。"""
    try:
        if n != 1:
            return None
        s = (size or "").strip()
        if not s or "*" not in s:
            return None
        parts = s.split("*")
        w = int(parts[0]); h = int(parts[1])
        if w < 512 or h < 512:
            logger.info("magic_edit 跳过过小尺寸 size=%s (模型最小512)", s)
            return None
        if w > 2048 or h > 2048:
            scale = min(2048 / w, 2048 / h)
            nw = round(w * scale); nh = round(h * scale)
            logger.info("magic_edit 输出尺寸上限归一化 %s -> %d*%d", s, nw, nh)
            return f"{nw}*{nh}"
        return s
    except Exception as e:
        logger.warning("magic_edit 尺寸参数解析失败: %s, 错误: %s", size, str(e))
        return None


def analyze_image_with_qwen3_vl_plus(image_path: str, verbose: bool = True, stream_output: bool = True, enable_thinking: bool = False):
    """使用兼容模式调用 qwen3-vl-plus 对图像进行分析。"""
    prompt_text = get_enhanced_prompt()
    with open(image_path, 'rb') as image_file:
        base64_image = base64.b64encode(image_file.read()).decode('utf-8')

    base_url = os.getenv("DASHSCOPE_COMPAT_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    api_key = os.getenv("DASHSCOPE_API_KEY")
    start_time = time.time()

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

    url = base_url.rstrip("/") + "/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    body = {
        "model": "qwen3-vl-plus",
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
    r = requests.post(url, json=body, headers=headers, timeout=180, stream=bool(stream_output))
    if r.status_code != 200:
        try:
            logger.warning("HTTP失败: %s", r.text[:300])
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
                        text += c
            except Exception:
                continue
    else:
        data = r.json()
        try:
            text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
        except Exception:
            text = ""
    cleaned = (text or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    try:
        return json.loads(cleaned.strip())
    except Exception:
        return {}


__all__ = [
    "extract_thinking",
    "sse_event",
    "parse_ui_to_plan_items",
    "extract_professional_items",
    "normalize_size_param",
    "analyze_image_with_qwen3_vl_plus",
]

