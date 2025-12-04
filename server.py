import os
import json
import base64
import tempfile
import requests
import time
import io
import sqlite3
from datetime import datetime
from pathlib import Path
from uuid import uuid4
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from starlette.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
import threading
import mimetypes
from backend.config import logger, IMAGES_DIR, LOGS_DIR, DB_PATH, LOG_PATH

try:
    from openai import OpenAI
except Exception:
    OpenAI = None

try:
    import dashscope
    from dashscope import MultiModalConversation
    def _normalize_endpoint(v: str) -> str:
        try:
            v = (v or "").strip()
            if not v:
                return "https://dashscope.aliyuncs.com/api/v1"
            # If user provided a full service path, truncate to /api/v1
            if "/api/v1" in v:
                base = v.split("/api/v1", 1)[0] + "/api/v1"
                return base
            # Fallback: accept host root and append /api/v1
            if v.endswith("/"):
                v = v[:-1]
            return v + "/api/v1"
        except Exception:
            return "https://dashscope.aliyuncs.com/api/v1"
    dashscope.base_http_api_url = _normalize_endpoint(os.getenv("IMAGE_EDIT_ENDPOINT", "https://dashscope.aliyuncs.com/api/v1"))
except Exception:
    MultiModalConversation = None

try:
    from enhanced_prompt import get_enhanced_prompt, sanitize_summary_ui
except ImportError:
    def get_enhanced_prompt():
        return "你是一名图像分析专家，请对输入的图片进行专业级别的结构化解析。"
    def sanitize_summary_ui(text: str) -> str:
        return (text or "").strip()

# 简化：不使用 dashscope 直接调用本地/指定推理服务

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


from starlette.staticfiles import StaticFiles
app.mount("/static", StaticFiles(directory=str(IMAGES_DIR)), name="static")


from backend.models import RecordModel, RecordImageModel, RecordDetailModel, RecordListResponse


from backend.db import (
    get_conn as _get_conn,
    init_db as _init_db,
    insert_record as _insert_record,
    insert_record_image as _insert_record_image,
    get_record as _get_record,
    list_records as _list_records,
    list_record_images as _list_record_images,
    update_record_logs as _update_record_logs,
)


_init_db()


from backend.image import (
    save_image_bytes as _image_save,
    load_image_from_bytes as _image_load,
    pil_to_bytes as _image_to_bytes,
    resize_image_max as _image_resize,
    encode_image_to_data_url as _image_data_url,
)
from backend.utils import (
    file_metadata as _file_metadata,
    download_and_save_image as _download_and_save_image,
    safe_json_dump as _safe_json_dump,
    write_json_log as _write_json_log,
)
from backend.analysis import (
    parse_ui_to_plan_items as _analysis_parse,
    sse_event as _analysis_sse_event,
    extract_professional_items as _analysis_extract_items,
    analyze_image_with_qwen3_vl_plus as _analysis_analyze,
    normalize_size_param as _analysis_normalize_size,
    extract_thinking as _analysis_extract_thinking,
)


 

 


 


 


 


 


 


def _read_log_tail(lines: int = 200) -> List[str]:
    if not LOG_PATH.exists():
        return []
    with open(LOG_PATH, "r", encoding="utf-8", errors="ignore") as f:
        content = f.readlines()
    lines = max(1, min(lines, 2000))
    return [line.rstrip("\n") for line in content[-lines:]]


 


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
    image_path = _image_save(image.filename or "image.png", payload)
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

@app.post("/preview")
async def preview(image: UploadFile = File(...)):
    logger.info("[/preview] 收到预览请求")
    payload = await image.read()
    logger.info("[/preview] 图片字节数: %d", len(payload or b""))
    if not payload:
        logger.error("[/preview] 无图片数据")
        raise HTTPException(status_code=400, detail="No image payload")
    img = _image_load(payload, image.filename or "image.bin")
    img = _image_resize(img, 2048)
    data, mime = _image_to_bytes(img, 'png')
    return StreamingResponse(io.BytesIO(data), media_type=mime, headers={"Cache-Control": "no-cache"})

@app.post("/convert")
async def convert(
    image: UploadFile = File(...),
    format: str = Form("jpeg"),
    quality: int = Form(90),
    compression: int = Form(6),
    resize_w: int | None = Form(None),
    resize_h: int | None = Form(None),
    max_side: int | None = Form(None),
    color: str = Form("RGB"),
    copyright: str = Form(""),
    metadata: str = Form(""),
    wm_text: str = Form(""),
    wm_pos: str = Form("BR"),
    wm_opacity: float = Form(0.0),
    wm_size: int = Form(24),
):
    logger.info("[/convert] 收到图片转换请求")
    payload = await image.read()
    logger.info("[/convert] 图片字节数: %d, 格式: %s, 质量: %d", len(payload or b""), format, quality)
    if not payload:
        logger.error("[/convert] 无图片数据")
        raise HTTPException(status_code=400, detail="No image payload")
    img = _image_load(payload, image.filename or "image.bin")
    try:
        if isinstance(max_side, int) and max_side and max_side > 0:
            img = _image_resize(img, int(max_side))
        elif resize_w and resize_h and resize_w > 0 and resize_h > 0:
            img = img.resize((int(resize_w), int(resize_h)))
    except Exception:
        pass
    try:
        col = (color or "RGB").upper()
        if col == "GRAY":
            img = img.convert("L")
        else:
            img = img.convert("RGB")
    except Exception:
        pass

    try:
        txt = (wm_text or "").strip()
        pos = (wm_pos or "BR").upper()
        op = float(wm_opacity or 0.0)
        sz = int(wm_size or 24)
        if txt and op > 0:
            from PIL import ImageDraw, ImageFont, Image
            base = img.convert("RGBA")
            layer = Image.new("RGBA", base.size, (0,0,0,0))
            d = ImageDraw.Draw(layer)
            try:
                fnt = ImageFont.truetype("arial.ttf", sz)
            except Exception:
                from PIL import ImageFont as _IF
                fnt = _IF.load_default()
            tw, th = d.textsize(txt, font=fnt)
            margin = max(8, sz // 2)
            if pos == "TL":
                x = margin
                y = margin
            else:
                x = base.size[0] - tw - margin
                y = base.size[1] - th - margin
            bg = int(255 * op * 0.6)
            fg = int(255 * op)
            d.rectangle([x - 6, y - 4, x + tw + 6, y + th + 4], fill=(0,0,0,bg))
            d.text((x, y), txt, font=fnt, fill=(255,255,255,fg))
            img = Image.alpha_composite(base, layer).convert("RGB")
    except Exception:
        pass

    # Basic metadata embedding (best-effort)
    info = {}
    if isinstance(metadata, str) and metadata.strip():
        try:
            info["Description"] = metadata
        except Exception:
            pass
    if isinstance(copyright, str) and copyright.strip():
        try:
            info["Copyright"] = copyright
        except Exception:
            pass

    extra = {}
    exif_obj = {}
    try:
        meta_obj = json.loads(metadata or "{}")
        if isinstance(meta_obj, dict):
            cam = meta_obj.get("camera")
            exif_obj = meta_obj.get("exif") or {}
            iptc_obj = meta_obj.get("iptc") or {}
            if cam:
                extra["Description"] = str(cam)
            artist = exif_obj.get("Artist") or iptc_obj.get("Byline")
            if artist:
                extra["Artist"] = str(artist)
            software = exif_obj.get("Software") or "Lumima Retouch"
            if software:
                extra["Software"] = str(software)
            dt = exif_obj.get("DateTime")
            if dt:
                extra["DateTime"] = str(dt)
    except Exception:
        pass
    if isinstance(copyright, str) and copyright.strip():
        try:
            extra["Copyright"] = copyright
        except Exception:
            pass

    data, mime = _image_to_bytes(img, format.lower(), quality, compression, extra_info=extra)
    return StreamingResponse(io.BytesIO(data), media_type=mime, headers={"Cache-Control": "no-cache"})

@app.get("/proxy_image")
def proxy_image(url: str):
    if not isinstance(url, str) or not url.lower().startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="invalid url")
    try:
        r = requests.get(url, timeout=30)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"fetch failed {r.status_code}")
        ct = r.headers.get("content-type") or "application/octet-stream"
        return StreamingResponse(io.BytesIO(r.content), media_type=ct, headers={"Access-Control-Allow-Origin": "*"})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


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
    image_path = _image_save(image.filename or "image.png", payload)
    record_image = _insert_record_image(record_id=record_id, kind=kind, image_path=image_path)
    return record_image


 

@app.post("/analyze")
async def analyze(image: UploadFile = File(...), prompt: str = Form("")):
    logger.info("="*60)
    logger.info("[/analyze] 收到分析请求")
    logger.info("[/analyze] 请求来源: 前端")
    buf = await image.read()
    logger.info("[/analyze] 接收图片字节数: %d", len(buf))
    logger.info("[/analyze] 提示词长度: %d", len(prompt or ""))
    logger.info("="*60)
    saved_image_path = _image_save(image.filename or "image.png", buf)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    try:
        img = _image_load(buf, image.filename or "image.bin")
        img = _image_resize(img, 2048)
        bin_bytes, _ = _image_to_bytes(img, 'jpeg', quality=85)
        tmp.write(bin_bytes)
    except Exception:
        tmp.write(buf)
    tmp.flush()
    tmp.close()

    result = _analysis_analyze(tmp.name, stream_output=True, enable_thinking=True)
    thinking_text = _analysis_extract_thinking(result if isinstance(result, dict) else None)
    raw_json = _safe_json_dump(result) if isinstance(result, (dict, list)) else None
    ui = result.get("ui_analysis") if isinstance(result, dict) else None
    items = _analysis_parse(ui or {})
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
        rec = _insert_record(
            prompt=prompt or "",
            thinking=thinking_text,
            image_path=saved_image_path,
            logs=raw_json,
            original_name=image.filename,
            raw_response=raw_json,
        )
        try:
            _insert_record_image(record_id=rec.id, kind="input", image_path=saved_image_path)
        except Exception:
            pass
    except Exception as exc:
        logger.warning("Failed to persist analyze record: %s", exc)
    return {"analysis": items, "summary": sanitize_summary_ui(summary or "")}

 

@app.post("/magic_edit")
async def magic_edit(
    request: Request,
    image: UploadFile = File(...),
    prompt: str = Form(""),
    n: int = Form(1),
    size: str = Form(""),
    watermark: bool = Form(False),
    negative_prompt: str = Form(""),
    prompt_extend: bool = Form(True),
):
    logger.info("="*60)
    logger.info("[/magic_edit] 收到图像编辑请求")
    logger.info("[/magic_edit] 请求来源: 前端")

    if MultiModalConversation is None:
        logger.error("[/magic_edit] dashscope SDK 不可用")
        raise HTTPException(status_code=500, detail="dashscope SDK not available on server")
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        logger.error("[/magic_edit] DASHSCOPE_API_KEY 未配置")
        raise HTTPException(status_code=500, detail="DASHSCOPE_API_KEY not configured")

    payload = await image.read()
    logger.info("[/magic_edit] 图片字节数: %d", len(payload or b""))
    logger.info("[/magic_edit] 提示词: %s", prompt[:100] if prompt else "(无)")
    logger.info("[/magic_edit] 参数 n=%d, size=%s, watermark=%s", n, size, watermark)
    logger.info("="*60)
    if not payload:
        raise HTTPException(status_code=400, detail="No image payload")
    original_local_path = _image_save(image.filename or "image.png", payload)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=Path(image.filename or "image").suffix or ".png")
    tmp.write(payload)
    tmp.flush(); tmp.close()


    try:
        try:
            img = _image_load(payload, image.filename or "image.bin")
        except Exception:
            from PIL import Image as _Image
            img = _Image.open(tmp.name)
        img = _image_resize(img, 2048)
        max_base64 = 10485760
        max_bin = int(max_base64 * 3 / 4) - 8192
        q = 85
        bin_bytes, mime = _image_to_bytes(img, 'jpeg', quality=q)
        while len(bin_bytes) > max_bin and q > 50:
            q -= 10
            bin_bytes, mime = _image_to_bytes(img, 'jpeg', quality=q)
        if len(bin_bytes) > max_bin:
            for side in [1600, 1280, 1024, 896, 768, 640, 512]:
                img = _image_resize(img, side)
                bin_bytes, mime = _image_to_bytes(img, 'jpeg', quality=q)
                if len(bin_bytes) <= max_bin:
                    break
        b64 = base64.b64encode(bin_bytes).decode("utf-8")
        data_url = f"data:{mime};base64,{b64}"
        contents: list[dict] = [{"image": data_url}]
        logger.info("magic_edit prompt len=%d", len(prompt or ""))
        pt = (prompt or "").strip()
        low = pt.lower()
        ks_portrait = ["人像","人物","人脸","肖像","女性","男性","男","女","脸","面部","skin","face","肤"]
        ks_lock = ["面部特征不变","保留原始面部","面部锁定","面部固定","保持人脸不变","face lock","facial area"]
        need_lock = any(k.lower() in low for k in ks_portrait) and not any(k.lower() in low for k in ks_lock)
        if need_lock:
            pt = "保持主体人物面部特征完全不变，仅修改非面部区域\n" + pt if pt else "保持主体人物面部特征完全不变，仅修改非面部区域"
        print("magic_edit 提示词:", pt)
        if pt:
            contents.append({"text": pt})
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
        size_used = _analysis_normalize_size(size, n)
        if size_used:
            kwargs["size"] = size_used

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
                local_paths = []
                for u in urls:
                    p = _download_and_save_image(u)
                    if p:
                        local_paths.append(p)
                params = {
                    "model": model,
                    "n": n,
                    "size": size_used or size,
                    "watermark": watermark,
                    "negative_prompt": negative_prompt,
                    "prompt_extend": prompt_extend,
                    "endpoint": os.getenv("IMAGE_EDIT_ENDPOINT", "https://dashscope.aliyuncs.com/api/v1"),
                }
                steps = [{"text": prompt}] if prompt else []
                events = [
                    {"level": "INFO", "message": "magic_edit 完成", "outputs": len(urls)},
                    {"level": "DEBUG", "message": "请求参数", "value": params},
                ]
                log_path = _write_json_log("magic_edit", original_local_path, urls, params, steps, prompt, events, local_output_paths=local_paths)
                rec = _insert_record(
                    prompt=prompt or "",
                    thinking=None,
                    image_path=original_local_path,
                    logs=log_path,
                    original_name=image.filename,
                    raw_response=_safe_json_dump({"urls": urls}),
                )
                try:
                    _insert_record_image(record_id=rec.id, kind="input", image_path=original_local_path)
                except Exception:
                    pass
                try:
                    if local_paths:
                        if len(local_paths) == 1:
                            _insert_record_image(record_id=rec.id, kind="final", image_path=local_paths[0])
                        else:
                            for p in local_paths[:-1]:
                                _insert_record_image(record_id=rec.id, kind="intermediate", image_path=p)
                            _insert_record_image(record_id=rec.id, kind="final", image_path=local_paths[-1])
                except Exception as exc:
                    logger.warning("保存输出图片记录失败: %s", exc)
            except Exception as exc:
                logger.warning("magic_edit 写日志失败: %s", exc)
            try:
                served_urls: list[str] = []
                if local_paths:
                    # 动态构建基础URL：优先使用环境变量，其次使用请求的Host头
                    base = os.getenv("SERVER_BASE_URL")
                    if not base:
                        # 从请求头中获取Host，构建正确的基础URL
                        host = request.headers.get("host", "localhost:8000")
                        # 检查是否是HTTPS请求
                        forwarded_proto = request.headers.get("x-forwarded-proto", "http")
                        # 也检查是否有 X-Forwarded-Host 头
                        forwarded_host = request.headers.get("x-forwarded-host", host)
                        base = f"{forwarded_proto}://{forwarded_host}"
                        # 记录诊断信息
                        logger.info("[/magic_edit] Host诊断: host=%s, forwarded_host=%s, proto=%s",
                                   host, forwarded_host, forwarded_proto)
                    base = base.rstrip("/")
                    served_urls = [f"{base}/static/{Path(p).name}" for p in local_paths]
                    logger.info("[/magic_edit] 生成静态资源URL: %s", served_urls[0] if served_urls else "无")
                else:
                    served_urls = urls
                return {"urls": served_urls}
            except Exception:
                return {"urls": urls}
        # Non-200: return error; input已规范化为PNG
        try:
            logger.error("magic_edit 非200 status=%s code=%s message=%s", getattr(resp, "status_code", None), getattr(resp, "code", None), getattr(resp, "message", None))
        except Exception:
            pass
        raise HTTPException(status_code=getattr(resp, "status_code", 500), detail=getattr(resp, "message", "image edit failed"))
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass

@app.post("/analyze_stream")
async def analyze_stream(image: UploadFile = File(...), prompt: str = Form("")):
    payload = await image.read()
    logger.info("="*60)
    logger.info("[/analyze_stream] SSE 收到分析请求")
    logger.info("[/analyze_stream] 图片字节数: %d", len(payload))
    logger.info("[/analyze_stream] 请求来源: 前端")
    logger.info("="*60)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    try:
        img = _image_load(payload, image.filename or "image.bin")
        img = _image_resize(img, 2048)
        bin_bytes, _ = _image_to_bytes(img, 'jpeg', quality=85)
        tmp.write(bin_bytes)
    except Exception:
        tmp.write(payload)
    tmp.flush()
    tmp.close()
    logger.info("SSE 临时文件=%s", tmp.name)

    base_url = os.getenv("DASHSCOPE_COMPAT_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    api_key = os.getenv("DASHSCOPE_API_KEY")
    logger.info("SSE 配置 模型=qwen3-vl-plus接口=%s", base_url)

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
                resp = client.chat.completions.create(model="qwen3-vl-plus", messages=messages, stream=True, temperature=0.1, top_p=0.1, extra_body={"enable_thinking": False, "thinking_budget": 81920})
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
                            new_items = _analysis_extract_items(buffer, sent)
                            for it in new_items:
                                logger.info("SSE 提取项 序号=%d 类别=%s 类型=%s", sent+1, it.get('category'), it.get('type'))
                                sent += 1
                                ui = {"professional_analysis": [it]}
                                plans = _analysis_parse(ui)
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
                    fallback_result = _analysis_analyze(tmp.name, stream_output=False, enable_thinking=True)
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
                    final_plans = _analysis_parse(ui)
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
                summary = sanitize_summary_ui(summary or "")
                logger.info("SSE 最终总结长度=%d", len(summary or ""))
                try:
                    params = {
                        "model": "qwen3-vl-plus",
                        "base_url": os.getenv("DASHSCOPE_COMPAT_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
                        "stream": True,
                    }
                    steps = final_plans if isinstance(ui, dict) else []
                    events = [
                        {"level": "INFO", "message": "SSE 分析完成"},
                        {"level": "DEBUG", "message": "已发送条目总数", "value": len(sent_ids)},
                    ]
                    _write_json_log("analyze_stream", tmp.name, [], params, steps, summary, events, local_output_paths=[], record_id=None)
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
            yield _analysis_sse_event(evt)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(gen(), media_type="text/event-stream", headers=headers)
 

class ApiPrefixMiddleware:
    def __init__(self, app, prefix: str = "/api"):
        self.app = app
        self.prefix = prefix
    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            path = scope.get("path") or ""
            if path == self.prefix:
                scope["path"] = "/"
            elif path.startswith(self.prefix + "/"):
                scope["path"] = path[len(self.prefix):]
        return await self.app(scope, receive, send)

app = ApiPrefixMiddleware(app)

if __name__ == "__main__":
    import uvicorn
    print("="*60)
    print("Starting server on http://0.0.0.0:8000")
    print("Server will listen on all network interfaces (0.0.0.0)")
    print("Accessible via:")
    print("  - http://localhost:8000")
    print("  - http://0.0.0.0:8000")
    print("  - http://127.0.0.1:8000")
    print("="*60)
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
