"""Tests for the contact import flow — xlsx→csv, Devin JSON extraction, dedup.

All external calls (Devin CLI subprocess, cloud KV HTTP) are mocked. No real
Devin CLI or network access happens during these tests.
"""
import base64
import json
import subprocess
from unittest.mock import patch, MagicMock

import pytest


def _make_agent():
    """Build a LocalAgent instance without running __init__ side effects."""
    from welian.agent import LocalAgent
    agent = object.__new__(LocalAgent)
    agent.agent_config = {
        "engine": "devin",
        "devin": {
            "model": "",
            "permission_mode": "dangerous",
            "max_turns": 50,
            "timeout": 10,
            "work_dir": "",
        },
    }
    return agent


# ── xlsx → csv (Chinese must not be garbled) ──

def test_xlsx_to_csv(tmp_path):
    """Convert an xlsx containing Chinese cells to CSV; verify UTF-8 + BOM."""
    openpyxl = pytest.importorskip("openpyxl")

    xlsx_path = tmp_path / "contacts.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["姓名", "公司", "职位", "电话"])
    ws.append(["张三", "腾讯", "产品经理", "13800138000"])
    ws.append(["李四", "阿里巴巴", "技术专家", "13900139000"])
    wb.save(xlsx_path)

    agent = _make_agent()
    csv_path = agent._xlsx_to_csv(str(xlsx_path), "contacts.xlsx")

    # Returned a new csv path (different from the xlsx input)
    assert csv_path != str(xlsx_path)
    assert csv_path.endswith(".csv")

    raw = open(csv_path, "rb").read()
    # utf-8-sig writes a BOM — Chinese must survive intact
    assert raw.startswith(b"\xef\xbb\xbf"), "CSV should be utf-8-sig (BOM)"
    text = raw.decode("utf-8-sig")
    assert "张三" in text
    assert "腾讯" in text
    assert "产品经理" in text
    assert "李四" in text
    assert "阿里巴巴" in text
    # Header row preserved
    assert "姓名" in text


# ── Devin CLI JSON extraction (mocked subprocess) ──

def test_import_via_devin_json_extraction(tmp_path):
    """Mock Devin CLI stdout containing a JSON array; verify extraction."""
    agent = _make_agent()

    fake_reply = (
        "好的，我已经读取了文件。\n"
        "提取到以下联系人：\n"
        '[{"name":"张三","relation":"同事","company":"腾讯",'
        '"title":"产品经理","phone":"13800138000",'
        '"email":"zhangsan@qq.com","notes":"微信好友"}]\n'
        "共1位联系人。"
    )

    fake_result = MagicMock()
    fake_result.stdout = fake_reply
    fake_result.stderr = ""
    fake_result.returncode = 0

    with patch("subprocess.run", return_value=fake_result) as mock_run:
        result = agent._import_via_devin("/tmp/fake.csv", "fake.csv")

    assert "error" not in result
    assert "contacts" in result
    assert len(result["contacts"]) == 1
    c = result["contacts"][0]
    assert c["name"] == "张三"
    assert c["company"] == "腾讯"
    assert c["title"] == "产品经理"
    assert c["phone"] == "13800138000"
    assert c["email"] == "zhangsan@qq.com"

    # Devin CLI was actually invoked (not skipped)
    assert mock_run.called
    cmd = mock_run.call_args[0][0]
    assert cmd[0] == "devin"


def test_import_via_devin_no_json_returns_error():
    """When Devin output has no JSON array, an error dict is returned."""
    agent = _make_agent()
    fake_result = MagicMock()
    fake_result.stdout = "抱歉，我没有在文件中找到联系人信息。"
    fake_result.stderr = ""
    fake_result.returncode = 0

    with patch("subprocess.run", return_value=fake_result):
        result = agent._import_via_devin("/tmp/fake.csv", "fake.csv")

    assert "error" in result
    assert "contacts" not in result


def test_import_via_devin_cli_missing():
    """FileNotFoundError (devin not installed) → graceful error."""
    agent = _make_agent()
    with patch("subprocess.run", side_effect=FileNotFoundError):
        result = agent._import_via_devin("/tmp/fake.csv", "fake.csv")
    assert "error" in result
    assert "devin" in result["error"]


# ── Contact dedup (name-based, mirrors cloud import handler logic) ──

def test_contact_dedup(fresh_data):
    """Newly extracted contacts are deduped against existing ones by name.

    This mirrors the dedup loop in LocalAgent's import_handler
    (agent.py ~L1204-L1227): existing names are skipped, new names added.
    """
    engine = fresh_data["engine"]

    # Seed existing contacts locally (simulates cloud state before import)
    engine.add_contact("ex1", "张三", relation="同行")
    engine.add_contact("ex2", "王五", relation="客户")

    # Simulate extracted contacts from Devin (one dup, one new, one empty)
    extracted = [
        {"name": "张三", "relation": "同事", "company": "腾讯"},   # dup
        {"name": "李四", "relation": "同行", "company": "阿里巴巴"},  # new
        {"name": "", "relation": "", "company": ""},               # empty → skip
        {"name": "王五", "relation": "客户", "company": "美团"},    # dup
    ]

    # Reproduce the handler's dedup algorithm against the local store.
    existing = engine.list_contacts()
    existing_names = {c.get("name", "") for c in existing}
    imported, skipped = 0, 0
    for c in extracted:
        name = (c.get("name", "") or "").strip()
        if not name:
            skipped += 1
            continue
        if name in existing_names:
            skipped += 1
            continue
        engine.add_contact(f"new-{name}", name, relation=c.get("relation", ""),
                           notes=c.get("company", ""))
        existing_names.add(name)
        imported += 1

    assert imported == 1   # only 李四
    assert skipped == 3    # 张三(dup) + empty + 王五(dup)

    names = {c["name"] for c in engine.list_contacts()}
    assert "张三" in names
    assert "王五" in names
    assert "李四" in names
    # No duplicate 张三 entries
    assert sum(1 for c in engine.list_contacts() if c["name"] == "张三") == 1
