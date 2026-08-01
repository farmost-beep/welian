"""E2E: 报 (Report) — user requests a report, verify it includes data from SQLite.

Tests: record interactions → request report → LLM formats a substantive report.
"""
import pytest
from conftest import assert_reply_ok


def test_monthly_report(fresh_env):
    """Monthly role review — should include role/relationship data."""
    client = fresh_env["client"]
    engine = fresh_env["engine"]

    # Add contacts across roles
    engine.add_contact("c1", "张总", relation="同行", nature="leverage")
    engine.add_contact("c2", "老周", relation="挚友", nature="nurture")
    engine.add_contact("c3", "妈妈", relation="家人", nature="nurture")

    # Record some interactions
    client.chat("记一下：和张总聊了预算")
    client.chat("记一下：和老周吃了顿饭")

    reply = client.chat("本月角色回顾")

    assert_reply_ok(reply, min_len=30)
    # Should mention role concepts or contact names
    assert any(kw in reply for kw in ["朋友", "角色", "回顾", "关系", "同行", "挚友", "家人", "本月", "互动"]), \
        f"Report should mention role/relationship concepts: {reply}"


def test_report_after_multiple_records(fresh_env):
    """Report after multiple interactions — should reflect activity."""
    client = fresh_env["client"]
    engine = fresh_env["engine"]

    engine.add_contact("c1", "张总", relation="同行", nature="leverage")
    engine.add_contact("c2", "李总", relation="客户", nature="leverage")

    # Multiple interactions
    client.chat("记一下：和张总聊了预算")
    client.chat("记一下：和李总讨论了合同条款")

    reply = client.chat("给我看看最近的关系回顾")

    assert_reply_ok(reply, min_len=30)
    # Should reference at least one of the recorded interactions
    assert any(name in reply for name in ["张总", "李总"]), \
        f"Report should reference recorded contacts: {reply}"
