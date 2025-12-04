from typing import List, Optional
from pydantic import BaseModel


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
    kind: str
    image_path: str
    created_at: str


class RecordDetailModel(RecordModel):
    images: List[RecordImageModel] = []


class RecordListResponse(BaseModel):
    total: int
    items: List[RecordModel]

__all__ = [
    "RecordModel",
    "RecordImageModel",
    "RecordDetailModel",
    "RecordListResponse",
]

