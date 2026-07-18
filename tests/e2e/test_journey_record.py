"""E2E: 记 (Record) — user records an interaction, verify SQLite write + LLM reply.

Tests the full chain: user text → intent.parse → engine.add_timeline → LLM respond → reply.
"""
import pytest
from conftest import assert_reply_ok


def test_record_creates_timeline_entry(fresh_env):
    """Recording an interaction must create a timeline entry and confirm to user."""
    client = fresh_env["client"]
    engine = fresh_env["engine"]

    # Pre-create the contact so timeline can link to it
    engine.add_contact("c1", "张总", relation="同行", nature="leverage")

    reply = client.chat("记一下：和张总聊了预算方案")

    # LLM reply must confirm the recording
    assert_reply_ok(reply)
    assert any(kw in reply for kw in ["记", "✅", "📝", "存"]), f"Reply missing record confirmation: {reply}"
    assert "张总" in reply, f"Reply should mention the contact: {reply}"

    # SQLite must have a timeline entry
    tls = engine.list_timeline(contact_id="c1")
    assert len(tls) >= 1, f"Timeline should have at least 1 entry, got {len(tls)}"
    assert "预算" in tls[0]["summary"], f"Timeline summary should contain '预算': {tls[0]['summary']}"


def test_record_auto_creates_contact(fresh_env):
    """Recording about an unknown person should still work — contact may be auto-created."""
    client = fresh_env["client"]
    engine = fresh_env["engine"]

    reply = client.chat("记一下：和李总聊了供应链合作")

    assert_reply_ok(reply)
    assert "李总" in reply

    # Contact should exist (auto-created or manually created)
    contacts = engine.list_contacts()
    names = [c["name"] for c in contacts]
    assert "李总" in names or any("李" in n for n in names), f"Contact '李总' not found in: {names}"


def test_record_with_details(fresh_env):
    """Recording with more context should store the full summary."""
    client = fresh_env["client"]
    engine = fresh_env["engine"]

    engine.add_contact("c1", "王总", relation="客户", nature="leverage")

    reply = client.chat("记一下：和王总开了个会，讨论了Q3营销预算和渠道策略，决定下周给方案")

    assert_reply_ok(reply)
    assert "王总" in reply

    tls = engine.list_timeline(contact_id="c1")
    assert len(tls) >= 1
    # The timeline summary should capture key info
    summary = tls[0]["summary"]
    assert len(summary) > 10, f"Timeline summary too short: {summary}"
