"""E2E test fixtures — full user journey with real LLM (no mock).

Each test gets an isolated SQLite database + real LLM API calls.
Requires ANTHROPIC_API_KEY (or LLM_API_KEY) in environment.

Run: pytest tests/e2e/ -v
"""
import os
import tempfile
from pathlib import Path

import pytest

# Create temp dir BEFORE importing welian modules (they read WELIAN_HOME at import time)
_e2e_dir = Path(tempfile.mkdtemp(prefix="welian_e2e_"))
(_e2e_dir / "data").mkdir(parents=True, exist_ok=True)
os.environ["WELIAN_HOME"] = str(_e2e_dir)


@pytest.fixture
def fresh_env():
    """Yield a fresh isolated environment with empty SQLite + real LLM client."""
    from welian import engine, tokens
    from welian.datastore import DataStore
    from welian.llm.router import reset_client
    from welian.edge import EdgeClient

    # Fresh data dir per test
    tmp = Path(tempfile.mkdtemp(prefix="welian_e2e_test_"))
    data_dir = tmp / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    store = DataStore(data_dir)
    engine.set_store(store)

    # Clear all tables
    db = store.db
    db.conn.execute("DELETE FROM contacts")
    db.conn.execute("DELETE FROM timeline")
    db.conn.execute("DELETE FROM todos")
    db.conn.execute("DELETE FROM usage")
    db.conn.commit()

    # Reset LLM client singleton so each test gets a fresh client
    reset_client()

    # EdgeClient in self-hosted mode (direct LLM, no cloud billing)
    client = EdgeClient(cloud_url="")

    yield {
        "client": client,
        "engine": engine,
        "store": store,
        "data_dir": data_dir,
    }

    reset_client()


def assert_reply_ok(reply: str, min_len: int = 10) -> None:
    """Assert LLM reply is non-empty and not an error message."""
    assert reply, "Reply is empty"
    assert len(reply) >= min_len, f"Reply too short ({len(reply)} chars): {reply}"
    assert "error" not in reply.lower()[:50], f"Reply starts with error: {reply}"
