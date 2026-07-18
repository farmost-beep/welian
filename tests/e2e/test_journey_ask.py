"""E2E: 问 (Ask) — user asks about a contact, verify context recall from SQLite.

Tests: record first → ask later → LLM must reference recorded data.
"""
import pytest
from conftest import assert_reply_ok


def test_ask_after_record(fresh_env):
    """Ask about a contact after recording — LLM should reference the recorded interaction."""
    client = fresh_env["client"]
    engine = fresh_env["engine"]

    engine.add_contact("c1", "张总", relation="同行", nature="leverage")

    # Step 1: Record an interaction
    client.chat("记一下：和张总聊了预算方案，他同意增加20%预算")

    # Step 2: Ask about the contact
    reply = client.chat("张总最近怎么样")

    assert_reply_ok(reply, min_len=20)
    assert "张总" in reply, f"Reply should mention the contact: {reply}"
    # LLM should reference the recorded interaction (budget discussion)
    assert any(kw in reply for kw in ["预算", "聊了", "最近", "互动", "联系"]), \
        f"Reply should reference recent interaction: {reply}"


def test_ask_who_to_contact(fresh_env):
    """Ask 'who should I contact' — should get suggestions based on data."""
    client = fresh_env["client"]
    engine = fresh_env["engine"]

    # Add contacts with different cooldown status
    engine.add_contact("c1", "张总", relation="同行", nature="leverage")
    engine.add_contact("c2", "李总", relation="客户", nature="leverage")
    engine.add_contact("c3", "老周", relation="挚友", nature="nurture")

    # Record an interaction with 张总 (recent)
    client.chat("记一下：和张总聊了预算")

    reply = client.chat("该联系谁")

    assert_reply_ok(reply, min_len=10)
    # Should mention at least one contact name
    assert any(name in reply for name in ["张总", "李总", "老周"]), \
        f"Reply should suggest a contact: {reply}"


def test_check_contact_details(fresh_env):
    """Check a contact's details — should return stored info."""
    client = fresh_env["client"]
    engine = fresh_env["engine"]

    engine.add_contact("c1", "老周", relation="挚友", nature="nurture")
    engine.add_memory("c1", "儿子小宇今年中考")
    engine.set_bond("c1", "十五年老友")

    reply = client.chat("老周最近咋样")

    assert_reply_ok(reply, min_len=20)
    assert "老周" in reply
