import sqlite3
from typing import Optional
from .config import DB_PATH, logger
from .models import RecordModel, RecordImageModel, RecordListResponse


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_conn() as conn:
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
        cols = {row[1] for row in conn.execute("PRAGMA table_info(records)")}
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


def row_to_record(row: sqlite3.Row) -> RecordModel:
    return RecordModel(
        id=row[0] if "id" not in row.keys() else row["id"],
        prompt=row[1] if "prompt" not in row.keys() else row["prompt"],
        thinking=row[2] if "thinking" not in row.keys() else row["thinking"],
        image_path=row[3] if "image_path" not in row.keys() else row["image_path"],
        logs=row[4] if "logs" not in row.keys() else row["logs"],
        original_name=(row[5] if "original_name" not in row.keys() else row.get("original_name")),
        raw_response=(row[6] if "raw_response" not in row.keys() else row.get("raw_response")),
        created_at=row[7] if "created_at" not in row.keys() else row["created_at"],
    )


def row_to_image(row: sqlite3.Row) -> RecordImageModel:
    return RecordImageModel(
        id=row[0] if "id" not in row.keys() else row["id"],
        record_id=row[1] if "record_id" not in row.keys() else row["record_id"],
        kind=row[2] if "kind" not in row.keys() else row["kind"],
        image_path=row[3] if "image_path" not in row.keys() else row["image_path"],
        created_at=row[4] if "created_at" not in row.keys() else row["created_at"],
    )


def insert_record(prompt: str, thinking: Optional[str], image_path: str, logs: Optional[str], original_name: Optional[str] = None, raw_response: Optional[str] = None) -> RecordModel:
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO records (prompt, thinking, image_path, logs, original_name, raw_response, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            """,
            (prompt, thinking, image_path, logs, original_name, raw_response),
        )
        conn.commit()
        new_id = cur.lastrowid
        row = conn.execute(
            "SELECT id, prompt, thinking, image_path, logs, original_name, raw_response, created_at FROM records WHERE id = ?",
            (new_id,),
        ).fetchone()
    logger.info("Created record %s", new_id)
    return row_to_record(row)


def insert_record_image(record_id: int, kind: str, image_path: str) -> RecordImageModel:
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO record_images (record_id, kind, image_path, created_at)
            VALUES (?, ?, ?, datetime('now'))
            """,
            (record_id, kind, image_path),
        )
        conn.commit()
        new_id = cur.lastrowid
        row = conn.execute(
            "SELECT id, record_id, kind, image_path, created_at FROM record_images WHERE id = ?",
            (new_id,),
        ).fetchone()
    logger.info("Saved record image %s (record=%s kind=%s)", new_id, record_id, kind)
    return row_to_image(row)


def get_record(record_id: int) -> Optional[RecordModel]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, prompt, thinking, image_path, logs, original_name, raw_response, created_at FROM records WHERE id = ?",
            (record_id,),
        ).fetchone()
    return row_to_record(row) if row else None


def list_records(limit: int = 50, offset: int = 0) -> RecordListResponse:
    with get_conn() as conn:
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
        total = total_row[0] if isinstance(total_row, tuple) else (total_row["c"] if total_row else 0)
    items = [row_to_record(r) for r in rows]
    return RecordListResponse(total=total, items=items)


def list_record_images(record_id: int):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, record_id, kind, image_path, created_at FROM record_images WHERE record_id = ? ORDER BY id ASC",
            (record_id,),
        ).fetchall()
    return [row_to_image(r) for r in rows]


def update_record_logs(record_id: int, logs_path: str) -> None:
    try:
        with get_conn() as conn:
            conn.execute("UPDATE records SET logs = ? WHERE id = ?", (logs_path, record_id))
            conn.commit()
        logger.info("记录 %s 日志路径更新: %s", record_id, logs_path)
    except Exception as exc:
        logger.warning("更新记录日志失败: %s", exc)


__all__ = [
    "get_conn",
    "init_db",
    "row_to_record",
    "row_to_image",
    "insert_record",
    "insert_record_image",
    "get_record",
    "list_records",
    "list_record_images",
    "update_record_logs",
]

