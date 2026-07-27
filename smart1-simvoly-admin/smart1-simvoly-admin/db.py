import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from config import SETTINGS


def _db_path() -> str:
    path = SETTINGS.database_path
    folder = os.path.dirname(path)
    try:
        if folder:
            os.makedirs(folder, exist_ok=True)
        return path
    except OSError:
        return os.path.join(os.getcwd(), "smart1_sites.sqlite3")


@contextmanager
def connection():
    con = sqlite3.connect(_db_path())
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init_db():
    with connection() as con:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS project_meta (
                project_id TEXT PRIMARY KEY,
                retail_price REAL,
                notes TEXT DEFAULT '',
                internal_client_name TEXT DEFAULT '',
                updated_at TEXT NOT NULL
            )
            """
        )


def get_meta(project_id: str) -> dict:
    with connection() as con:
        row = con.execute("SELECT * FROM project_meta WHERE project_id = ?", (str(project_id),)).fetchone()
        return dict(row) if row else {}


def all_meta() -> dict[str, dict]:
    with connection() as con:
        rows = con.execute("SELECT * FROM project_meta").fetchall()
        return {str(r["project_id"]): dict(r) for r in rows}


def save_meta(project_id: str, retail_price=None, notes: str = "", internal_client_name: str = ""):
    now = datetime.now(timezone.utc).isoformat()
    with connection() as con:
        con.execute(
            """
            INSERT INTO project_meta(project_id, retail_price, notes, internal_client_name, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(project_id) DO UPDATE SET
                retail_price = excluded.retail_price,
                notes = excluded.notes,
                internal_client_name = excluded.internal_client_name,
                updated_at = excluded.updated_at
            """,
            (str(project_id), retail_price, notes, internal_client_name, now),
        )
