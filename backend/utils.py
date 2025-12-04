import json
import mimetypes
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import uuid4

import requests

from .config import logger, LOGS_DIR
from .image import save_image_bytes


def file_metadata(path: str) -> dict:
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


def download_and_save_image(url: str) -> Optional[str]:
    try:
        r = requests.get(url, timeout=60)
        if r.status_code != 200:
            logger.warning("下载输出失败 status=%s url=%s", r.status_code, url)
            return None
        ct = r.headers.get("content-type") or "image/png"
        ext = ".png"
        try:
            guess = mimetypes.guess_extension(ct.split(";")[0].strip())
            if guess:
                ext = guess
        except Exception:
            pass
        name = f"output{ext}"
        return save_image_bytes(name, r.content)
    except Exception as exc:
        logger.warning("下载输出异常: %s", exc)
        return None


def safe_json_dump(data: object) -> Optional[str]:
    try:
        return json.dumps(data, ensure_ascii=False)
    except Exception:
        return None


def write_json_log(
    operation: str,
    input_path: Optional[str],
    output_urls: Optional[list[str]],
    params: Optional[dict],
    steps: Optional[list],
    summary: Optional[str],
    events: Optional[list[dict]],
    local_output_paths: Optional[list[str]] = None,
    record_id: Optional[int] = None,
) -> str:
    payload = {
        "timestamp": datetime.utcnow().isoformat(),
        "operation": operation,
        "input": file_metadata(input_path) if input_path else None,
        "outputs": output_urls or [],
        "local_outputs": [file_metadata(p) for p in (local_output_paths or [])],
        "params": params or {},
        "steps": steps or [],
        "summary": summary or "",
        "events": events or [],
        "record_id": record_id,
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


__all__ = [
    "file_metadata",
    "download_and_save_image",
    "safe_json_dump",
    "write_json_log",
]
