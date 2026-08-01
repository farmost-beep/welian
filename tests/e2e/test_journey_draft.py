"""E2E: 拟 (Draft) — user asks to draft a message, verify output is a sendable message.

Tests: draft request → context gather → LLM generates message → reply is substantive.
"""
import pytest
from conftest import assert_reply_ok


def test_draft_message_for_contact(fresh_env):
    """Draft a message for a known contact — should produce a sendable message."""
    client = fresh_env["client"]
    engine = fresh_env["engine"]

    engine.add_contact("c1", "老周", relation="挚友", nature="nurture")
    engine.add_memory("c1", "儿子小宇今年中考")

    reply = client.chat("给老周拟条消息")

    assert_reply_ok(reply, min_len=30)
    assert "老周" in reply, f"Draft should mention the contact: {reply}"
    # Should look like a message (not a meta-description)
    assert any(kw in reply for kw in ["消息", "草稿", "拟", "好久", "怎么样", "可以发", "给你"]), \
        f"Reply should look like a draft message: {reply}"


def test_draft_with_context(fresh_env):
    """Draft with specific context — LLM should incorporate the context."""
    client = fresh_env["client"]
    engine = fresh_env["engine"]

    engine.add_contact("c1", "张总", relation="同行", nature="leverage")

    reply = client.chat("给张总拟条消息，想约他下周聊一下合作机会")

    assert_reply_ok(reply, min_len=30)
    assert "张总" in reply
    # Should reference the collaboration context
    assert any(kw in reply for kw in ["合作", "约", "下周", "聊", "机会"]), \
        f"Draft should reference collaboration context: {reply}"


def test_draft_for_unknown_contact(fresh_env):
    """Draft for someone not in contacts — should still produce a message."""
    client = fresh_env["client"]

    reply = client.chat("给赵总拟条消息，想介绍我们的新产品")

    assert_reply_ok(reply, min_len=20)
    assert "赵总" in reply
