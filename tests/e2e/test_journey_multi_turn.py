"""E2E: Multi-turn conversation — verify conversation history works.

Tests: record → ask → draft in sequence, LLM should maintain context across turns.
"""
import pytest
from conftest import assert_reply_ok


def test_multi_turn_record_then_ask(fresh_env):
    """Record then ask in sequence — second turn should reference first."""
    client = fresh_env["client"]
    engine = fresh_env["engine"]

    engine.add_contact("c1", "张总", relation="同行", nature="leverage")

    # Turn 1: Record
    r1 = client.chat("记一下：和张总聊了预算方案")
    assert_reply_ok(r1)

    # Turn 2: Ask about the same contact
    r2 = client.chat("他上次说了什么")
    assert_reply_ok(r2, min_len=10)
    # Should reference the recorded content (budget) or the contact
    assert any(kw in r2 for kw in ["预算", "张总", "聊了", "上次"]), \
        f"Second turn should reference first: {r2}"


def test_multi_turn_draft_then_refine(fresh_env):
    """Draft a message then ask to refine — should produce a different version."""
    client = fresh_env["client"]
    engine = fresh_env["engine"]

    engine.add_contact("c1", "老周", relation="挚友", nature="nurture")
    engine.add_memory("c1", "儿子小宇今年中考")

    # Turn 1: Draft
    r1 = client.chat("给老周拟条消息")
    assert_reply_ok(r1, min_len=30)

    # Turn 2: Refine
    r2 = client.chat("再简短一点")
    assert_reply_ok(r2, min_len=10)
    # The refine should be different from the original
    assert r2 != r1, "Refined draft should differ from original"


def test_full_journey_record_ask_draft(fresh_env):
    """Full journey: record → ask → draft — all four verbs in sequence."""
    client = fresh_env["client"]
    engine = fresh_env["engine"]

    engine.add_contact("c1", "张总", relation="同行", nature="leverage")

    # 1. Record
    r1 = client.chat("记一下：和张总聊了预算方案，他同意下周给答复")
    assert_reply_ok(r1)
    assert "张总" in r1

    # 2. Ask
    r2 = client.chat("张总最近怎么样")
    assert_reply_ok(r2, min_len=15)
    assert "张总" in r2

    # 3. Draft
    r3 = client.chat("给张总拟条消息，催一下预算的事")
    assert_reply_ok(r3, min_len=20)
    assert "张总" in r3

    # Verify SQLite state
    tls = engine.list_timeline(contact_id="c1")
    assert len(tls) >= 1, "Timeline should have the recorded interaction"
