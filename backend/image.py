import base64
import io
import mimetypes
from typing import Optional, Tuple
from pathlib import Path
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from .config import IMAGES_DIR, logger


def save_image_bytes(filename: str, data: bytes) -> str:
    ext = Path(filename or "image").suffix or ".png"
    dest_name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{uuid4().hex[:8]}{ext}"
    dest_path = IMAGES_DIR / dest_name
    with open(dest_path, "wb") as f:
        f.write(data)
    logger.info("Saved image to %s (%d bytes)", dest_path, len(data))
    return str(dest_path)


def load_image_from_bytes(data: bytes, filename: str):
    try:
        from PIL import Image as _Image
    except Exception:
        raise HTTPException(status_code=500, detail="Pillow not available on server")
    try:
        import pillow_heif as _pheif
        heif = _pheif.read_heif(data)
        return _Image.frombytes(heif.mode, heif.size, heif.data)
    except Exception:
        pass
    try:
        import rawpy as _rawpy
        import numpy as _np  # noqa: F401
        with _rawpy.imread(io.BytesIO(data)) as raw:
            rgb = raw.postprocess(use_camera_wb=True, no_auto_bright=True, output_bps=8, gamma=(1, 1))
        return _Image.fromarray(rgb)
    except Exception:
        pass
    try:
        return _Image.open(io.BytesIO(data)).convert('RGB')
    except Exception:
        raise HTTPException(status_code=400, detail="Unsupported image payload")


def pil_to_bytes(img, fmt: str, quality: Optional[int] = None, compression: Optional[int] = None, extra_info: Optional[dict] = None) -> Tuple[bytes, str]:
    buf = io.BytesIO()
    f = (fmt or 'jpeg').lower()
    if f == 'jpeg':
        q = int(quality or 90)
        try:
            img.save(buf, format='JPEG', quality=q, subsampling=0)
        except Exception:
            img.save(buf, format='JPEG', quality=q)
        mime = 'image/jpeg'
    elif f == 'png':
        c = int(compression or 6)
        try:
            from PIL.PngImagePlugin import PngInfo
            pi = PngInfo()
            if extra_info:
                for k, v in extra_info.items():
                    try:
                        pi.add_text(str(k), str(v))
                    except Exception:
                        pass
                if extra_info.get('DateTime'):
                    try:
                        pi.add_text('CreationTime', str(extra_info['DateTime']))
                    except Exception:
                        pass
            img.save(buf, format='PNG', compress_level=c, pnginfo=pi)
        except Exception:
            img.save(buf, format='PNG', compress_level=c)
        mime = 'image/png'
    elif f == 'webp':
        q = int(quality or 85)
        img.save(buf, format='WEBP', quality=q)
        mime = 'image/webp'
    elif f == 'tiff':
        try:
            from PIL.TiffImagePlugin import ImageFileDirectory_v2
            ifd = ImageFileDirectory_v2()
            if extra_info:
                desc = str(extra_info.get('Description') or '')
                cr = str(extra_info.get('Copyright') or '')
                artist = str(extra_info.get('Artist') or '')
                software = str(extra_info.get('Software') or '')
                dt = str(extra_info.get('DateTime') or '')
                if desc:
                    ifd[270] = desc
                if cr:
                    ifd[33432] = cr
                if artist:
                    ifd[315] = artist
                if software:
                    ifd[305] = software
                if dt:
                    ifd[306] = dt
            img.save(buf, format='TIFF', tiffinfo=ifd)
        except Exception:
            img.save(buf, format='TIFF')
        mime = 'image/tiff'
    else:
        raise HTTPException(status_code=400, detail="Unsupported output format")
    return buf.getvalue(), mime


def resize_image_max(img, max_side: int):
    try:
        w, h = img.size
        m = int(max_side)
        if w <= m and h <= m:
            return img
        if w >= h:
            nw = m
            nh = int(h * m / w)
        else:
            nh = m
            nw = int(w * m / h)
        return img.resize((nw, nh))
    except Exception:
        return img


def encode_image_to_data_url(file_path: str) -> str:
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type or not mime_type.startswith("image/"):
        raise ValueError("Unsupported image type")
    with open(file_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    return f"data:{mime_type};base64,{b64}"

__all__ = [
    "save_image_bytes",
    "load_image_from_bytes",
    "pil_to_bytes",
    "resize_image_max",
    "encode_image_to_data_url",
]

