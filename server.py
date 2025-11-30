import os
import json
import base64
import tempfile
import requests
import time
import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from uuid import uuid4
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from starlette.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
import threading
import mimetypes
def _load_local_env():
    paths = [Path('.local.env'), Path('.env.local')]
    for p in paths:
        if p.exists():
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    for line in f:
                        s = line.strip()
                        if not s or s.startswith('#'):
                            continue
                        if '=' not in s:
                            continue
                        k, v = s.split('=', 1)
                        os.environ[k.strip()] = v.strip().strip('"').strip("'")
            except Exception:
                pass

_load_local_env()

try:
    from openai import OpenAI
except Exception:
    OpenAI = None

try:
    import dashscope
    from dashscope import MultiModalConversation
    dashscope.base_http_api_url = os.getenv("IMAGE_EDIT_ENDPOINT", "https://dashscope.aliyuncs.com/api/v1")
except Exception:
    MultiModalConversation = None

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

DATA_DIR = Path(os.getenv("DATA_DIR", "./data")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
IMAGES_DIR = DATA_DIR / "images"
LOGS_DIR = DATA_DIR / "logs"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "app.db"
LOG_PATH = DATA_DIR / "server.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_PATH, encoding="utf-8"),
    ],
)
logger = logging.getLogger("reimagine")


class RecordModel(BaseModel):
    id: int
    prompt: str
    thinking: Optional[str] = None
    image_path: str
    logs: Optional[str] = None
    original_name: Optional[str] = None
    raw_response: Optional[str] = None
    created_at: str


class RecordImageModel(BaseModel):
    id: int
    record_id: int
    kind: str  # input, intermediate, final, other
    image_path: str
    created_at: str


class RecordDetailModel(RecordModel):
    images: List[RecordImageModel] = []


class RecordListResponse(BaseModel):
    total: int
    items: List[RecordModel]


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prompt TEXT NOT NULL,
                thinking TEXT,
                image_path TEXT NOT NULL,
                logs TEXT,
                original_name TEXT,
                raw_response TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        # Backfill new columns if table already existed
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(records)")}
        if "original_name" not in cols:
            conn.execute("ALTER TABLE records ADD COLUMN original_name TEXT")
        if "raw_response" not in cols:
            conn.execute("ALTER TABLE records ADD COLUMN raw_response TEXT")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS record_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_id INTEGER NOT NULL,
                kind TEXT NOT NULL,
                image_path TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def _row_to_record(row: sqlite3.Row) -> RecordModel:
    return RecordModel(
        id=row["id"],
        prompt=row["prompt"],
        thinking=row["thinking"],
        image_path=row["image_path"],
        logs=row["logs"],
        original_name=row["original_name"] if "original_name" in row.keys() else None,
        raw_response=row["raw_response"] if "raw_response" in row.keys() else None,
        created_at=row["created_at"],
    )


def _row_to_image(row: sqlite3.Row) -> RecordImageModel:
    return RecordImageModel(
        id=row["id"],
        record_id=row["record_id"],
        kind=row["kind"],
        image_path=row["image_path"],
        created_at=row["created_at"],
    )


def _save_image_bytes(filename: str, data: bytes) -> str:
    ext = Path(filename or "image").suffix or ".png"
    dest_name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{uuid4().hex[:8]}{ext}"
    dest_path = IMAGES_DIR / dest_name
    with open(dest_path, "wb") as f:
        f.write(data)
    logger.info("Saved image to %s (%d bytes)", dest_path, len(data))
    return str(dest_path)

def _file_metadata(path: str) -> dict:
    try:
        p = Path(path)
        st = p.stat()
        mime, _ = mimetypes.guess_type(str(p))
        return {
            "path": str(p.resolve()),
            "exists": True,
            "size_bytes": st.st_size,
            "modified_at": datetime.utcfromtimestamp(st.st_mtime).isoformat(),
            "mime": mime or "unknown",
        }
    except Exception:
        return {"path": path, "exists": False}

def _write_json_log(operation: str, input_path: str | None, output_urls: list[str] | None, params: dict | None, steps: list | None, summary: str | None, events: list[dict] | None) -> str:
    payload = {
        "timestamp": datetime.utcnow().isoformat(),
        "operation": operation,
        "input": _file_metadata(input_path) if input_path else None,
        "outputs": output_urls or [],
        "params": params or {},
        "steps": steps or [],
        "summary": summary or "",
        "events": events or [],
    }
    fname = f"log_{operation}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{uuid4().hex[:8]}.json"
    fpath = LOGS_DIR / fname
    try:
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        logger.info("日志已写入 %s", fpath)
    except Exception as exc:
        logger.error("写入日志失败: %s", exc)
    return str(fpath)


def _insert_record(
    prompt: str,
    thinking: Optional[str],
    image_path: str,
    logs: Optional[str],
    original_name: Optional[str] = None,
    raw_response: Optional[str] = None,
) -> RecordModel:
    created_at = datetime.utcnow().isoformat()
    with _get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO records (prompt, thinking, image_path, logs, original_name, raw_response, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (prompt, thinking, image_path, logs, original_name, raw_response, created_at),
        )
        conn.commit()
        new_id = cur.lastrowid
        row = conn.execute(
            "SELECT id, prompt, thinking, image_path, logs, original_name, raw_response, created_at FROM records WHERE id = ?",
            (new_id,),
        ).fetchone()
    logger.info("Created record %s", new_id)
    return _row_to_record(row)


def _insert_record_image(record_id: int, kind: str, image_path: str) -> RecordImageModel:
    created_at = datetime.utcnow().isoformat()
    with _get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO record_images (record_id, kind, image_path, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (record_id, kind, image_path, created_at),
        )
        conn.commit()
        new_id = cur.lastrowid
        row = conn.execute(
            "SELECT id, record_id, kind, image_path, created_at FROM record_images WHERE id = ?",
            (new_id,),
        ).fetchone()
    logger.info("Saved record image %s (record=%s kind=%s)", new_id, record_id, kind)
    return _row_to_image(row)


def _get_record(record_id: int) -> Optional[RecordModel]:
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT id, prompt, thinking, image_path, logs, original_name, raw_response, created_at FROM records WHERE id = ?",
            (record_id,),
        ).fetchone()
    return _row_to_record(row) if row else None


def _list_record_images(record_id: int) -> List[RecordImageModel]:
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, record_id, kind, image_path, created_at
            FROM record_images
            WHERE record_id = ?
            ORDER BY created_at ASC
            """,
            (record_id,),
        ).fetchall()
    return [_row_to_image(r) for r in rows]


def _list_records(limit: int = 50, offset: int = 0) -> RecordListResponse:
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, prompt, thinking, image_path, logs, original_name, raw_response, created_at
            FROM records
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()
        total_row = conn.execute("SELECT COUNT(1) as c FROM records").fetchone()
        total = total_row["c"] if total_row else 0
    items = [_row_to_record(r) for r in rows]
    return RecordListResponse(total=total, items=items)


def _read_log_tail(lines: int = 200) -> List[str]:
    if not LOG_PATH.exists():
        return []
    with open(LOG_PATH, "r", encoding="utf-8", errors="ignore") as f:
        content = f.readlines()
    lines = max(1, min(lines, 2000))
    return [line.rstrip("\n") for line in content[-lines:]]


def _extract_thinking(result: Optional[dict]) -> Optional[str]:
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


def _safe_json_dump(data: object) -> Optional[str]:
    try:
        return json.dumps(data, ensure_ascii=False)
    except Exception:
        return None


_init_db()


@app.post("/records", response_model=RecordModel)
async def create_record(
    image: UploadFile = File(...),
    prompt: str = Form(...),
    thinking: Optional[str] = Form(None),
    logs: Optional[str] = Form(None),
    raw_response: Optional[str] = Form(None),
    original_name: Optional[str] = Form(None),
):
    payload = await image.read()
    image_path = _save_image_bytes(image.filename or "image.png", payload)
    record = _insert_record(
        prompt=prompt or "",
        thinking=thinking,
        image_path=image_path,
        logs=logs,
        original_name=original_name or image.filename,
        raw_response=raw_response,
    )
    _insert_record_image(record_id=record.id, kind="input", image_path=image_path)
    return record


@app.get("/records", response_model=RecordListResponse)
def list_records(limit: int = 50, offset: int = 0):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    return _list_records(limit=limit, offset=offset)


@app.get("/records/{record_id}", response_model=RecordDetailModel)
def get_record(record_id: int):
    record = _get_record(record_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"record {record_id} not found")
    images = _list_record_images(record_id)
    return RecordDetailModel(**record.model_dump(), images=images)


@app.get("/logs")
def fetch_logs(lines: int = 200):
    lines = max(1, min(lines, 2000))
    return {"lines": _read_log_tail(lines)}


@app.post("/records/{record_id}/images", response_model=RecordImageModel)
async def upload_record_image(
    record_id: int,
    image: UploadFile = File(...),
    kind: str = Form("intermediate"),
):
    kind = (kind or "intermediate").strip().lower()
    if kind not in {"input", "intermediate", "final", "other"}:
        raise HTTPException(status_code=400, detail="kind must be one of: input, intermediate, final, other")
    if not _get_record(record_id):
        raise HTTPException(status_code=404, detail=f"record {record_id} not found")
    payload = await image.read()
    image_path = _save_image_bytes(image.filename or "image.png", payload)
    record_image = _insert_record_image(record_id=record_id, kind=kind, image_path=image_path)
    return record_image


def _parse_ui_to_plan_items(ui: dict):
    items = []
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
            "category": "风格滤镜",
            "type": "adjustment",
            "checked": False,
            "options": options,
        })
    return items

def _sse_event(obj: dict):
    return f"data:{json.dumps(obj, ensure_ascii=False)}\n\n"

def _extract_professional_items(buffer: str, sent_count: int):
    items = []
    idx = buffer.find("\"professional_analysis\"")
    if idx == -1:
        return items
    arr_start = buffer.find("[", idx)
    if arr_start == -1:
        return items
    i = arr_start + 1
    brace = 0
    cur = []
    count = 0
    while i < len(buffer):
        ch = buffer[i]
        cur.append(ch)
        if ch == "{":
            brace += 1
        elif ch == "}":
            brace -= 1
            if brace == 0:
                seg = "{" + "".join(cur).split("{",1)[1]
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
    logger.info("Analyze request received bytes=%d prompt_len=%d", len(buf), len(prompt or ""))
    saved_image_path = _save_image_bytes(image.filename or "image.png", buf)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
    tmp.write(buf)
    tmp.flush()
    tmp.close()

    result = analyze_image_with_qwen3_vl_plus(tmp.name, stream_output=True, enable_thinking=True)
    thinking_text = _extract_thinking(result if isinstance(result, dict) else None)
    raw_json = _safe_json_dump(result) if isinstance(result, (dict, list)) else None
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
    logger.info("Analyze response items=%d summary_len=%d", len(items), len(summary or ""))
    try:
        _insert_record(
            prompt=prompt or "",
            thinking=thinking_text,
            image_path=saved_image_path,
            logs=raw_json,
            original_name=image.filename,
            raw_response=raw_json,
        )
    except Exception as exc:
        logger.warning("Failed to persist analyze record: %s", exc)
    return {"analysis": items, "summary": summary or ""}

def _encode_image_to_data_url(file_path: str) -> str:
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type or not mime_type.startswith("image/"):
        raise ValueError("Unsupported image type")
    with open(file_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    return f"data:{mime_type};base64,{b64}"

@app.post("/magic_edit")
async def magic_edit(
    image: UploadFile = File(...),
    prompt: str = Form(""),
    n: int = Form(1),
    size: str = Form(""),
    watermark: bool = Form(False),
    negative_prompt: str = Form(""),
    prompt_extend: bool = Form(True),
    mask: UploadFile | None = File(None)
):
    if MultiModalConversation is None:
        raise HTTPException(status_code=500, detail="dashscope SDK not available on server")
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="DASHSCOPE_API_KEY not configured")

    payload = await image.read()
    if not payload:
        raise HTTPException(status_code=400, detail="No image payload")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=Path(image.filename or "image").suffix or ".png")
    tmp.write(payload)
    tmp.flush(); tmp.close()

    mask_tmp_path = None
    if mask is not None:
        mask_bytes = await mask.read()
        mt = tempfile.NamedTemporaryFile(delete=False, suffix=Path(mask.filename or "mask").suffix or ".png")
        mt.write(mask_bytes); mt.flush(); mt.close()
        mask_tmp_path = mt.name

    try:
        data_url = _encode_image_to_data_url(tmp.name)
        contents: list[dict] = [{"image": data_url}]
        if prompt:
            contents.append({"text": prompt})
        if mask_tmp_path:
            contents.append({"image": _encode_image_to_data_url(mask_tmp_path)})
        messages = [{"role": "user", "content": contents}]

        model = os.getenv("IMAGE_EDIT_MODEL", "qwen-image-edit-plus")
        kwargs = dict(
            api_key=api_key,
            model=model,
            messages=messages,
            stream=False,
            n=n,
            watermark=watermark,
            negative_prompt=negative_prompt or " ",
            prompt_extend=prompt_extend,
        )
        if n == 1 and size:
            kwargs["size"] = size

        resp = MultiModalConversation.call(**kwargs)
        if getattr(resp, "status_code", None) == 200:
            urls: list[str] = []
            try:
                for c in resp.output.choices[0].message.content:
                    if isinstance(c, dict) and c.get("image"):
                        urls.append(c["image"]) 
            except Exception:
                pass
            if not urls:
                raise HTTPException(status_code=502, detail="Model returned no image URLs")
            try:
                params = {
                    "model": model,
                    "n": n,
                    "size": size,
                    "watermark": watermark,
                    "negative_prompt": negative_prompt,
                    "prompt_extend": prompt_extend,
                    "endpoint": os.getenv("IMAGE_EDIT_ENDPOINT", "https://dashscope.aliyuncs.com/api/v1"),
                    "has_mask": bool(mask_tmp_path),
                }
                steps = [{"text": prompt}] if prompt else []
                events = [
                    {"level": "INFO", "message": "magic_edit 完成", "outputs": len(urls)},
                    {"level": "DEBUG", "message": "请求参数", "value": params},
                ]
                _write_json_log("magic_edit", tmp.name, urls, params, steps, prompt, events)
            except Exception as exc:
                logger.warning("magic_edit 写日志失败: %s", exc)
            return {"urls": urls}
        raise HTTPException(status_code=getattr(resp, "status_code", 500), detail=getattr(resp, "message", "image edit failed"))
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass
        if mask_tmp_path:
            try:
                os.unlink(mask_tmp_path)
            except Exception:
                pass

@app.post("/analyze_stream")
async def analyze_stream(image: UploadFile = File(...), prompt: str = Form("")):
    payload = await image.read()
    logger.info("SSE 收到分析请求 bytes=%d", len(payload))
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
    tmp.write(payload)
    tmp.flush()
    tmp.close()
    logger.info("SSE 临时文件=%s", tmp.name)

    base_url = os.getenv("DASHSCOPE_COMPAT_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    api_key = os.getenv("DASHSCOPE_API_KEY")
    logger.info("SSE 配置 模型=qwen3-vl-flash 接口=%s", base_url)

    async def gen():
        queue: asyncio.Queue = asyncio.Queue()
        loop = asyncio.get_running_loop()
        buffer = ""
        sent = 0
        sent_ids: set = set()

        def push(evt: dict):
            try:
                asyncio.run_coroutine_threadsafe(queue.put(evt), loop)
            except Exception as exc:
                logger.warning("SSE push 失败: %s", exc)

        def worker():
            fallback_result = None
            try:
                from openai import OpenAI
                client = OpenAI(api_key=api_key, base_url=base_url)
                with open(tmp.name, "rb") as f:
                    b64 = base64.b64encode(f.read()).decode("utf-8")
                data_url = f"data:image/jpeg;base64,{b64}"
                messages = [{"role":"user","content":[{"type":"image_url","image_url":{"url":data_url}},{"type":"text","text":get_enhanced_prompt()}]}]
                resp = client.chat.completions.create(model="qwen3-vl-flash", messages=messages, stream=True, temperature=0.1, top_p=0.1, extra_body={"enable_thinking": False, "thinking_budget": 81920})
                logger.info("SSE 连接建立，开始流式分析")
                for chunk in resp:
                    try:
                        delta = chunk.choices[0].delta
                        if delta and getattr(delta, "content", None):
                            c = delta.content
                            if c:
                                if os.getenv("SSE_LOG_CHUNK", "0") == "1":
                                    logger.info("SSE chunk 长度=%d", len(c))
                                if os.getenv("SSE_LOG_TEXT", "0") == "1":
                                    logger.info("%s", c)
                            nonlocal buffer, sent
                            buffer += c
                            new_items = _extract_professional_items(buffer, sent)
                            for it in new_items:
                                logger.info("SSE 提取项 序号=%d 类别=%s 类型=%s", sent+1, it.get('category'), it.get('type'))
                                sent += 1
                                ui = {"professional_analysis": [it]}
                                plans = _parse_ui_to_plan_items(ui)
                                for p in plans:
                                    pid = p.get("id")
                                    if pid and pid in sent_ids:
                                        continue
                                    if pid:
                                        sent_ids.add(pid)
                                    push({"type": "item", "item": p})
                    except Exception:
                        continue
            except Exception as e:
                logger.warning("SSE 流式调用失败: %s", e)
                # 回退到非流式分析，确保总结与遗漏项可用
                try:
                    fallback_result = analyze_image_with_qwen3_vl_plus(tmp.name, stream_output=False, enable_thinking=True)
                    logger.info("SSE 回退分析完成")
                except Exception as e2:
                    logger.warning("SSE 回退调用失败: %s", e2)
            # finalize
            try:
                cleaned = buffer.strip()
                if cleaned.startswith("```json"):
                    cleaned = cleaned[7:]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                data = json.loads(cleaned) if cleaned else {}
                # 若流式数据不可用，使用回退结果
                if not isinstance(data, dict) or (isinstance(data, dict) and not data):
                    if isinstance(fallback_result, dict):
                        data = fallback_result
                # 推送未发送过的计划项（包括滤镜推荐等）
                ui = data.get("ui_analysis") if isinstance(data, dict) else None
                if isinstance(ui, dict):
                    final_plans = _parse_ui_to_plan_items(ui)
                    for p in final_plans:
                        pid = p.get("id")
                        if pid and pid in sent_ids:
                            continue
                        if pid:
                            sent_ids.add(pid)
                        push({"type": "item", "item": p})
                # 提取总结（包含嵌套 ui_analysis.summary_ui 兜底）
                summary = ""
                if isinstance(data, dict):
                    summary = data.get("summary_ui") or data.get("summary") or ""
                if not summary and isinstance(ui, dict):
                    summary = ui.get("summary_ui") or ""
                # 若仍为空，尝试从回退结果提取
                if not summary and isinstance(fallback_result, dict):
                    fu = fallback_result.get("ui_analysis") if isinstance(fallback_result, dict) else None
                    summary = fallback_result.get("summary_ui") or fallback_result.get("summary") or ((fu or {}).get("summary_ui") or "")
                logger.info("SSE 最终总结长度=%d", len(summary or ""))
                try:
                    params = {
                        "model": "qwen3-vl-flash",
                        "base_url": os.getenv("DASHSCOPE_COMPAT_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
                        "stream": True,
                    }
                    steps = final_plans if isinstance(ui, dict) else []
                    events = [
                        {"level": "INFO", "message": "SSE 分析完成"},
                        {"level": "DEBUG", "message": "已发送条目总数", "value": len(sent_ids)},
                    ]
                    _write_json_log("analyze_stream", tmp.name, [], params, steps, summary, events)
                except Exception as exc:
                    logger.warning("SSE 写日志失败: %s", exc)
                push({"type": "final", "summary": summary})
            except Exception as e:
                logger.warning("SSE 最终解析失败: %s", e)
                push({"type": "final", "summary": ""})
            finally:
                push({"type": "__end__"})

        threading.Thread(target=worker, daemon=True).start()

        while True:
            evt = await queue.get()
            if isinstance(evt, dict) and evt.get("type") == "__end__":
                break
            yield _sse_event(evt)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(gen(), media_type="text/event-stream", headers=headers)
