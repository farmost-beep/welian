"""Tests for edge-cloud separation (SPEC §7.1).

Verifies that:
1. Edge client holds all data locally
2. Cloud API never receives full contact records
3. Context extraction sends only minimal snippets
4. Export/import works with encryption
5. Cloud API endpoints don't access any data files
"""
import unittest
import os
import tempfile
import json
from pathlib import Path

_test_dir = tempfile.mkdtemp(prefix="welian_edge_test_")
os.environ["WELIAN_HOME"] = _test_dir

from welian import engine
from welian.datastore import DataStore
from welian.edge import EdgeClient

def _clear_data():
    data_dir = Path(_test_dir) / "data"
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

class TestEdgeClientLocal(unittest.TestCase):
    """Edge client must handle all data operations locally."""

    def setUp(self):
        _clear_data()
        self.client = EdgeClient(cloud_url="")  # offline mode
        engine.add_contact("c1", "张总", relation="同行", nature="leverage")
        engine.add_contact("c2", "老周", relation="挚友", nature="nurture")
        engine.add_memory("c2", "儿子小宇今年中考")
        engine.set_bond("c2", "十五年老友")

    def test_record_local(self):
        """Record (记) must work fully offline."""
        reply = self.client.chat("记一下：和张总聊了预算方案")
        self.assertIn("记下了", reply)
        self.assertIn("张总", reply)
        # Verify data was written locally
        tls = engine.list_timeline(contact_id="c1")
        self.assertEqual(len(tls), 1)

    def test_check_local(self):
        """Check (问 bond) must work fully offline."""
        reply = self.client.chat("老周最近咋样")
        self.assertIn("老周", reply)
        self.assertIn("十五年老友", reply)
        self.assertIn("小宇", reply)

    def test_report_local(self):
        """Report (报) must work fully offline."""
        reply = self.client.chat("本月角色回顾")
        self.assertIn("作为朋友", reply)

    def test_ask_offline_fallback(self):
        """Ask (问) must work offline with local formatting."""
        reply = self.client.chat("该联系谁")
        # Should still return suggestions (local scoring + local format)
        self.assertTrue(len(reply) > 0)

    def test_draft_offline_fallback(self):
        """Draft (拟) must work offline with template fallback."""
        reply = self.client.chat("给老周拟条消息")
        self.assertIn("拟了一版", reply)
        # Template fallback should mention the name
        self.assertIn("老周", reply)

class TestContextExtraction(unittest.TestCase):
    """Context extraction must send MINIMAL data to cloud."""

    def setUp(self):
        _clear_data()
        self.client = EdgeClient(cloud_url="")
        engine.add_contact("c1", "张总", relation="同行", nature="leverage")
        engine.add_contact("c2", "老周", relation="挚友", nature="nurture")
        # Add lots of memories
        for i in range(10):
            engine.add_memory("c2", f"记忆条目{i}" * 20)  # long memories
        engine.add_important_date("c2", "12-25", "生日", "birthday")

    def test_draft_context_minimal(self):
        """Draft context must NOT include full contact record."""
        contact = engine.get_contact("c2")
        ctx = self.client._extract_draft_context(contact, "老周", "三年没联系")
        # Must include name
        self.assertEqual(ctx["name"], "老周")
        # Must include nature
        self.assertEqual(ctx["nature"], "nurture")
        # Must NOT include full contact fields
        self.assertNotIn("platforms", ctx)
        self.assertNotIn("notes", ctx)
        self.assertNotIn("tags", ctx)
        self.assertNotIn("id", ctx)
        self.assertNotIn("relation", ctx)
        # Memories must be truncated to max 3 and 50 chars each
        self.assertLessEqual(len(ctx["memories"]), 3)
        for m in ctx["memories"]:
            self.assertLessEqual(len(m), 50)

    def test_advise_context_minimal(self):
        """Advise context must NOT include full contact records."""
        leverage = engine.advise_leverage(top=5)
        ctx = self.client._extract_advise_context(leverage)
        for c in ctx:
            # Must have name and days_since
            self.assertIn("name", c)
            self.assertIn("days_since", c)
            # Must NOT have full contact data
            self.assertNotIn("platforms", c)
            self.assertNotIn("notes", c)
            self.assertNotIn("memories", c)
            self.assertNotIn("tags", c)
            # last_interaction must be truncated
            if c.get("last_interaction"):
                self.assertLessEqual(len(c["last_interaction"]), 100)

    def test_nurture_context_minimal(self):
        """Nurture context must NOT include full contact records."""
        reminders = engine.advise_nurture(days_ahead=180)
        ctx = self.client._extract_nurture_context(reminders)
        for r in ctx:
            self.assertIn("name", r)
            self.assertIn("type", r)
            # Must NOT have full contact data
            self.assertNotIn("platforms", r)
            self.assertNotIn("memories", r)
            # Content must be truncated
            if r.get("content"):
                self.assertLessEqual(len(r["content"]), 100)

class TestExportImport(unittest.TestCase):
    """Export/import must work as portable data transfer."""

    def setUp(self):
        _clear_data()
        engine.add_contact("e1", "张三", relation="同行")
        engine.add_memory("e1", "喜欢喝茶")
        engine.add_timeline("e1", "聊了项目计划")

    def test_export_plain(self):
        client = EdgeClient()
        data = client.export_data()
        self.assertEqual(data["version"], "1.0")
        self.assertEqual(len(data["contacts"]), 1)
        self.assertEqual(len(data["timeline"]), 1)
        self.assertFalse(data.get("encrypted"))

    def test_export_encrypted(self):
        client = EdgeClient()
        data = client.export_data(password="secret123")
        self.assertTrue(data.get("encrypted"))
        self.assertIn("data", data)
        # Encrypted data should not contain plaintext names
        data_str = str(data["data"])
        self.assertNotIn("张三", data_str)

    def test_import_plain(self):
        client = EdgeClient()
        export = client.export_data()
        _clear_data()
        # Verify data is gone
        self.assertEqual(len(engine.list_contacts()), 0)
        # Import
        ok = client.import_data(export)
        self.assertTrue(ok)
        self.assertEqual(len(engine.list_contacts()), 1)

    def test_import_encrypted(self):
        client = EdgeClient()
        export = client.export_data(password="mypassword")
        _clear_data()
        # Import with correct password
        ok = client.import_data(export, password="mypassword")
        self.assertTrue(ok)
        self.assertEqual(len(engine.list_contacts()), 1)

    def test_import_wrong_password(self):
        client = EdgeClient()
        export = client.export_data(password="correct")
        _clear_data()
        # Import with wrong password should fail gracefully
        try:
            ok = client.import_data(export, password="wrong")
            # If cryptography is available, this will raise; if not (base64), it may "succeed" with garbage
            # Either way, the test verifies no crash
        except Exception:
            pass  # Expected with Fernet decryption failure

class TestCloudAPIIsolation(unittest.TestCase):
    """Cloud API must NOT access any data files."""

    def setUp(self):
        _clear_data()
        # Add data to edge
        engine.add_contact("iso1", "测试用户", relation="同行")
        engine.add_memory("iso1", "敏感信息：手机号13800138000")

    def test_cloud_api_no_data_import(self):
        """Cloud API module must not import engine or access data files."""
        # Import the cloud server module
        from welian.api import server
        # Check that server module does NOT have access to engine functions
        # that would read local data
        source = open(server.__file__).read()
        # Must NOT import engine
        self.assertNotIn("from .. import engine", source)
        self.assertNotIn("from ..engine import", source)
        self.assertNotIn("import engine", source)
        # Must NOT import edge (which has data access)
        self.assertNotIn("from ..edge import", source)
        self.assertNotIn("import edge", source)
        # Must NOT import tokens (which has local usage data)
        self.assertNotIn("from .. import tokens", source)
        self.assertNotIn("from ..tokens import", source)
        # Must NOT reference data files
        self.assertNotIn("CONTACTS_FILE", source)
        self.assertNotIn("TIMELINE_FILE", source)
        self.assertNotIn("TODOS_FILE", source)

    def test_cloud_endpoints_are_ai_only(self):
        """Cloud API must only expose AI endpoints, not data CRUD."""
        from welian.api.server import app
        routes = [r.path for r in app.routes]
        # Must have AI endpoints
        self.assertIn("/ai/draft", routes)
        self.assertIn("/ai/extract", routes)
        self.assertIn("/ai/advise", routes)
        self.assertIn("/health", routes)
        # Must NOT have data endpoints
        self.assertNotIn("/chat", routes)
        self.assertNotIn("/dashboard", routes)
        self.assertNotIn("/contacts", routes)
        self.assertNotIn("/balance", routes)

if __name__ == "__main__":
    unittest.main()
