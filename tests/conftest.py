"""Shared pytest fixtures for Welian tests.

Provides per-test data isolation by pointing WELIAN_HOME at a fresh temp
directory and re-initializing the engine/tokens module paths. No external
services are touched.
"""
import json
import os
import tempfile
from pathlib import Path

import pytest


@pytest.fixture
def fresh_data():
    """Yield a fresh isolated data directory and re-init engine + tokens paths.

    Each test gets empty contacts/timeline/todos/usage tables in a fresh
    SQLite database. Restores the previous WELIAN_HOME afterwards so other
    test modules are unaffected.
    """
    tmp = Path(tempfile.mkdtemp(prefix="welian_pytest_"))
    data_dir = tmp / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    prev_home = os.environ.get("WELIAN_HOME")
    os.environ["WELIAN_HOME"] = str(tmp)

    from welian import engine, tokens
    from welian.datastore import DataStore

    # Use new set_store() API — creates a fresh SQLite database
    store = DataStore(data_dir)
    engine.set_store(store)

    # Ensure clean slate (clear all tables in the fresh database)
    db = store.db
    db.conn.execute("DELETE FROM contacts")
    db.conn.execute("DELETE FROM timeline")
    db.conn.execute("DELETE FROM todos")
    db.conn.execute("DELETE FROM usage")
    db.conn.commit()

    yield {
        "home": tmp,
        "data_dir": data_dir,
        "engine": engine,
        "tokens": tokens,
        "store": store,
    }

    # Restore env so other test modules' own isolation still works.
    if prev_home is None:
        os.environ.pop("WELIAN_HOME", None)
    else:
        os.environ["WELIAN_HOME"] = prev_home
    # Restore default store
    engine._init_paths()
