import os
from pathlib import Path
from backend.image import save_image_bytes, load_image_from_bytes, pil_to_bytes, resize_image_max
from backend.utils import file_metadata, safe_json_dump


def test_save_and_meta(tmp_path):
    data = b"\x89PNG\r\n\x1a\n" + b"x" * 128
    p = save_image_bytes("image.png", data)
    assert Path(p).exists()
    meta = file_metadata(p)
    assert meta["exists"] is True
    assert meta["size_bytes"] >= len(data)


def test_load_and_resize(tmp_path):
    from PIL import Image
    img = Image.new("RGB", (800, 600), color=(10, 20, 30))
    b, m = pil_to_bytes(img, "jpeg", quality=80)
    assert m == "image/jpeg"
    # emulate upload
    loaded = load_image_from_bytes(b, "image.jpg")
    assert loaded.size == (800, 600)
    resized = resize_image_max(loaded, 400)
    assert max(resized.size) == 400


def test_safe_json():
    s = safe_json_dump({"a": 1})
    assert isinstance(s, str)

