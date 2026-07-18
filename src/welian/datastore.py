"""DataStore — per-user data directory encapsulation with SQLite backend.

Replaces JSON file storage with SQLite for ACID transactions, WAL-mode
concurrency, and indexed queries. Each DataStore owns a SQLite database
file at <data_dir>/welian.db.

The public API is unchanged from the JSON version — load_contacts(),
save_contacts(), etc. behave identically. This lets engine.py delegate
to DataStore without knowing the storage format.

Usage:
    store = DataStore(Path("~/.welian/data"))
    contacts = store.load_contacts()
    store.save_contacts(contacts)

    # SQL-optimized queries (new):
    contact = store.get_contact("c1")           # PK lookup, O(1)
    contacts = store.query_contacts(nature="leverage")
    tls = store.query_timeline(contact_id="c1", since_date="2025-01-01")
    todos = store.query_todos(status="pending")
"""
import json
from pathlib import Path
from typing import Any, List, Optional

from .db import Database


class DataStore:
    """Encapsulates a per-user SQLite database."""

    def __init__(self, data_dir):
        self.data_dir = Path(data_dir).expanduser()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._db = Database(self.data_dir / "welian.db")

    @property
    def db(self) -> Database:
        return self._db

    # ── Generic load/save (delegates to SQLite tables) ──

    _TABLE_MAP = {"contacts": "contacts", "timeline": "timeline", "todos": "todos"}

    def load(self, name: str) -> Any:
        """Load all records from a table by name."""
        if name == "contacts":
            return self.load_contacts()
        if name == "timeline":
            return self.load_timeline()
        if name == "todos":
            return self.load_todos()
        # Fallback: read from JSON file (for non-standard names)
        path = self.data_dir / f"{name}.json"
        if not path.exists():
            return []
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def save(self, name: str, data: Any) -> None:
        """Save records to a table by name."""
        if name == "contacts":
            self.save_contacts(data)
            return
        if name == "timeline":
            self.save_timeline(data)
            return
        if name == "todos":
            self.save_todos(data)
            return
        # Fallback: write JSON file
        path = self.data_dir / f"{name}.json"
        if isinstance(data, (list, dict)) and len(data) == 0:
            if path.exists() and path.stat().st_size > 2:
                return
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    # ── Named helpers ──

    def load_contacts(self) -> list:
        return self._db.load_all_contacts()

    def save_contacts(self, data: list) -> None:
        self._db.save_all_contacts(data)

    def load_timeline(self) -> list:
        return self._db.load_all_timeline()

    def save_timeline(self, data: list) -> None:
        self._db.save_all_timeline(data)

    def load_todos(self) -> list:
        return self._db.load_all_todos()

    def save_todos(self, data: list) -> None:
        self._db.save_all_todos(data)

    def load_usage(self) -> dict:
        return self._db.load_usage()

    def save_usage(self, data: dict) -> None:
        self._db.save_usage(data)

    # ── SQL-optimized single-record operations ──

    def get_contact(self, contact_id: str) -> Optional[dict]:
        """O(1) PK lookup."""
        return self._db.get_contact(contact_id)

    def upsert_contact(self, contact: dict) -> None:
        self._db.upsert_contact(contact)

    def delete_contact(self, contact_id: str) -> None:
        self._db.delete_contact(contact_id)

    def add_timeline(self, record: dict) -> None:
        self._db.add_timeline(record)

    def upsert_todo(self, todo: dict) -> None:
        self._db.upsert_todo(todo)

    # ── SQL-optimized query methods ──

    def query_contacts(self, nature: str = None, role: str = None) -> list:
        return self._db.query_contacts(nature=nature, role=role)

    def query_timeline(self, contact_id: str = None, since_date: str = None) -> list:
        return self._db.query_timeline(contact_id=contact_id, since_date=since_date)

    def query_todos(self, status: str = None, priority: str = None) -> list:
        return self._db.query_todos(status=status, priority=priority)

    # ── Path accessors (backward compat — point to .db file) ──

    @property
    def contacts_file(self) -> Path:
        return self.data_dir / "welian.db"

    @property
    def timeline_file(self) -> Path:
        return self.data_dir / "welian.db"

    @property
    def todos_file(self) -> Path:
        return self.data_dir / "welian.db"

    @property
    def usage_file(self) -> Path:
        return self.data_dir / "welian.db"

    def __repr__(self):
        return f"DataStore({self.data_dir})"
