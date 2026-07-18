"""SQLite storage layer for Welian.

Replaces JSON file storage with SQLite for ACID transactions, WAL-mode
concurrency, and indexed queries. No ORM — just sqlite3 from the stdlib.

Schema design:
  - Each table has indexed columns for commonly-filtered fields
  - Full record stored as JSON blob in `data` column
  - This hybrid gives SQL WHERE speed + schema flexibility for nested fields

Tables:
  contacts(id PK, name, nature, role, data JSON)
  timeline(id PK, contact, date, data JSON)
  todos(id PK, contact, status, priority, due, data JSON)
  usage(user_id PK, data JSON)
"""
import json
import sqlite3
import threading
from pathlib import Path
from typing import Any, List, Optional, Dict


_SCHEMA = """
CREATE TABLE IF NOT EXISTS contacts (
    id     TEXT PRIMARY KEY,
    name   TEXT,
    nature TEXT,
    role   TEXT,
    data   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contacts_name   ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_nature ON contacts(nature);
CREATE INDEX IF NOT EXISTS idx_contacts_role   ON contacts(role);

CREATE TABLE IF NOT EXISTS timeline (
    id      TEXT PRIMARY KEY,
    contact TEXT,
    date    TEXT,
    data    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timeline_contact ON timeline(contact);
CREATE INDEX IF NOT EXISTS idx_timeline_date    ON timeline(date);

CREATE TABLE IF NOT EXISTS todos (
    id       TEXT PRIMARY KEY,
    contact  TEXT,
    status   TEXT,
    priority TEXT,
    due      TEXT,
    data     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_todos_contact  ON todos(contact);
CREATE INDEX IF NOT EXISTS idx_todos_status   ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);
CREATE INDEX IF NOT EXISTS idx_todos_due      ON todos(due);

CREATE TABLE IF NOT EXISTS usage (
    user_id TEXT PRIMARY KEY,
    data    TEXT NOT NULL
);
"""


def _connect(db_path) -> sqlite3.Connection:
    """Open a SQLite connection with WAL mode and sane pragmas."""
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(_SCHEMA)
    return conn


class Database:
    """Thin wrapper around sqlite3.Connection with thread-safe access."""

    def __init__(self, db_path):
        self._db_path = str(db_path)
        self._conn = _connect(db_path)
        self._lock = threading.Lock()

    @property
    def path(self) -> str:
        return self._db_path

    @property
    def lock(self) -> threading.Lock:
        return self._lock

    @property
    def conn(self) -> sqlite3.Connection:
        return self._conn

    # ── Contacts ──

    def load_all_contacts(self) -> List[dict]:
        """Load all contacts (full table scan)."""
        with self._lock:
            rows = self._conn.execute("SELECT data FROM contacts").fetchall()
        return [json.loads(r["data"]) for r in rows]

    def save_all_contacts(self, contacts: List[dict]) -> None:
        """Replace all contacts in a single transaction."""
        rows = [(
            c.get("id", ""),
            c.get("name", ""),
            c.get("nature", ""),
            c.get("role", ""),
            json.dumps(c, ensure_ascii=False),
        ) for c in contacts]
        with self._lock:
            self._conn.execute("DELETE FROM contacts")
            self._conn.executemany(
                "INSERT INTO contacts (id, name, nature, role, data) VALUES (?, ?, ?, ?, ?)",
                rows,
            )
            self._conn.commit()

    def get_contact(self, contact_id: str) -> Optional[dict]:
        """O(1) PK lookup."""
        with self._lock:
            row = self._conn.execute(
                "SELECT data FROM contacts WHERE id=?", (contact_id,)
            ).fetchone()
        return json.loads(row["data"]) if row else None

    def upsert_contact(self, contact: dict) -> None:
        """Insert or replace a single contact."""
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO contacts (id, name, nature, role, data) VALUES (?, ?, ?, ?, ?)",
                (
                    contact.get("id", ""),
                    contact.get("name", ""),
                    contact.get("nature", ""),
                    contact.get("role", ""),
                    json.dumps(contact, ensure_ascii=False),
                ),
            )
            self._conn.commit()

    def delete_contact(self, contact_id: str) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM contacts WHERE id=?", (contact_id,))
            self._conn.commit()

    def query_contacts(
        self, nature: str = None, role: str = None
    ) -> List[dict]:
        """Query contacts by indexed fields."""
        sql = "SELECT data FROM contacts WHERE 1=1"
        params = []
        if nature:
            sql += " AND nature=?"
            params.append(nature)
        if role:
            sql += " AND role=?"
            params.append(role)
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        return [json.loads(r["data"]) for r in rows]

    # ── Timeline ──

    def load_all_timeline(self) -> List[dict]:
        with self._lock:
            rows = self._conn.execute("SELECT data FROM timeline").fetchall()
        return [json.loads(r["data"]) for r in rows]

    def save_all_timeline(self, records: List[dict]) -> None:
        rows = [(
            r.get("id", ""),
            r.get("contact", ""),
            r.get("date", ""),
            json.dumps(r, ensure_ascii=False),
        ) for r in records]
        with self._lock:
            self._conn.execute("DELETE FROM timeline")
            self._conn.executemany(
                "INSERT INTO timeline (id, contact, date, data) VALUES (?, ?, ?, ?)",
                rows,
            )
            self._conn.commit()

    def query_timeline(
        self, contact_id: str = None, since_date: str = None
    ) -> List[dict]:
        """Query timeline by contact and/or date range, newest first."""
        sql = "SELECT data FROM timeline WHERE 1=1"
        params = []
        if contact_id:
            sql += " AND contact=?"
            params.append(contact_id)
        if since_date:
            sql += " AND date >= ?"
            params.append(since_date)
        sql += " ORDER BY date DESC"
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        return [json.loads(r["data"]) for r in rows]

    def add_timeline(self, record: dict) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO timeline (id, contact, date, data) VALUES (?, ?, ?, ?)",
                (
                    record.get("id", ""),
                    record.get("contact", ""),
                    record.get("date", ""),
                    json.dumps(record, ensure_ascii=False),
                ),
            )
            self._conn.commit()

    # ── Todos ──

    def load_all_todos(self) -> List[dict]:
        with self._lock:
            rows = self._conn.execute("SELECT data FROM todos").fetchall()
        return [json.loads(r["data"]) for r in rows]

    def save_all_todos(self, todos: List[dict]) -> None:
        rows = [(
            t.get("id", ""),
            t.get("contact", ""),
            t.get("status", ""),
            t.get("priority", ""),
            t.get("due", ""),
            json.dumps(t, ensure_ascii=False),
        ) for t in todos]
        with self._lock:
            self._conn.execute("DELETE FROM todos")
            self._conn.executemany(
                "INSERT INTO todos (id, contact, status, priority, due, data) VALUES (?, ?, ?, ?, ?, ?)",
                rows,
            )
            self._conn.commit()

    def query_todos(
        self, status: str = None, priority: str = None
    ) -> List[dict]:
        sql = "SELECT data FROM todos WHERE 1=1"
        params = []
        if status:
            sql += " AND status=?"
            params.append(status)
        if priority:
            sql += " AND priority=?"
            params.append(priority)
        sql += " ORDER BY priority, due"
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        return [json.loads(r["data"]) for r in rows]

    def upsert_todo(self, todo: dict) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO todos (id, contact, status, priority, due, data) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    todo.get("id", ""),
                    todo.get("contact", ""),
                    todo.get("status", ""),
                    todo.get("priority", ""),
                    todo.get("due", ""),
                    json.dumps(todo, ensure_ascii=False),
                ),
            )
            self._conn.commit()

    # ── Usage ──

    def load_usage(self, user_id: str = "default") -> dict:
        with self._lock:
            row = self._conn.execute(
                "SELECT data FROM usage WHERE user_id=?", (user_id,)
            ).fetchone()
        return json.loads(row["data"]) if row else {}

    def save_usage(self, data: dict, user_id: str = "default") -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO usage (user_id, data) VALUES (?, ?)",
                (user_id, json.dumps(data, ensure_ascii=False)),
            )
            self._conn.commit()

    # ── Lifecycle ──

    def close(self):
        with self._lock:
            self._conn.close()

    def count(self, table: str) -> int:
        with self._lock:
            row = self._conn.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()
        return row["n"]
