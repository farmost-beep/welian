"""Tests for Welian core engine — dual relationship model."""
import unittest
import os
import tempfile
import json
from pathlib import Path

# Set up test data directory
_test_dir = tempfile.mkdtemp(prefix="welian_test_")
os.environ["WELIAN_HOME"] = _test_dir

from welian import engine

def _clear_data():
    """Clear all data files for test isolation."""
    data_dir = Path(_test_dir) / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    engine.CONTACTS_FILE = data_dir / "contacts.json"
    engine.TIMELINE_FILE = data_dir / "timeline.json"
    engine.TODOS_FILE = data_dir / "todos.json"
    # Delete files directly (bypass _save safety check)
    for f in [engine.CONTACTS_FILE, engine.TIMELINE_FILE, engine.TODOS_FILE]:
        if f.exists():
            f.unlink()

class TestNatureClassification(unittest.TestCase):
    def setUp(self):
        _clear_data()

    def test_infer_nurture_from_family_relation(self):
        c = {"relation": "家人", "tags": []}
        self.assertEqual(engine.infer_nature(c), engine.NATURE_NURTURE)

    def test_infer_nurture_from_friend_tags(self):
        c = {"relation": "", "tags": ["挚友"]}
        self.assertEqual(engine.infer_nature(c), engine.NATURE_NURTURE)

    def test_infer_leverage_default(self):
        c = {"relation": "同行", "tags": []}
        self.assertEqual(engine.infer_nature(c), engine.NATURE_LEVERAGE)

    def test_infer_explicit_nature(self):
        c = {"nature": "dual", "relation": "同行"}
        self.assertEqual(engine.infer_nature(c), engine.NATURE_DUAL)

    def test_role_family(self):
        c = {"relation": "家人", "tags": []}
        self.assertEqual(engine.contact_role(c), engine.ROLE_FAMILY)

    def test_role_friend(self):
        c = {"relation": "挚友", "tags": []}
        self.assertEqual(engine.contact_role(c), engine.ROLE_FRIEND)

    def test_role_collaborator(self):
        c = {"relation": "同行", "tags": []}
        self.assertEqual(engine.contact_role(c), engine.ROLE_COLLABORATOR)

class TestContactCRUD(unittest.TestCase):
    def setUp(self):
        _clear_data()
    def test_add_contact(self):
        ok, msg = engine.add_contact("test1", "张三", relation="同行", nature="leverage")
        self.assertTrue(ok)
        c = engine.get_contact("test1")
        self.assertEqual(c["name"], "张三")
        self.assertEqual(c["nature"], "leverage")

    def test_add_duplicate(self):
        engine.add_contact("test2", "李四")
        ok, msg = engine.add_contact("test2", "李四")
        self.assertFalse(ok)

    def test_resolve_by_name(self):
        engine.add_contact("test3", "王五")
        c, match = engine.resolve_contact("王五")
        self.assertIsNotNone(c)
        self.assertEqual(match, "name")

    def test_resolve_fuzzy(self):
        engine.add_contact("test4", "赵六明")
        c, match = engine.resolve_contact("赵六")
        self.assertIsNotNone(c)
        self.assertEqual(c["name"], "赵六明")

    def test_set_nature(self):
        engine.add_contact("test5", "钱七")
        ok, msg = engine.set_nature("test5", "nurture")
        self.assertTrue(ok)
        c = engine.get_contact("test5")
        self.assertEqual(c["nature"], "nurture")

    def test_invalid_nature(self):
        engine.add_contact("test6", "孙八")
        ok, msg = engine.set_nature("test6", "invalid")
        self.assertFalse(ok)

class TestNurtureFields(unittest.TestCase):
    def setUp(self):
        _clear_data()
        engine.add_contact("n1", "老周", relation="挚友", nature="nurture")

    def test_add_memory(self):
        ok, msg = engine.add_memory("n1", "儿子小宇今年中考")
        self.assertTrue(ok)
        c = engine.get_contact("n1")
        self.assertEqual(len(c["memories"]), 1)
        self.assertIn("小宇", c["memories"][0]["content"])

    def test_add_important_date(self):
        ok, msg = engine.add_important_date("n1", "11-29", "生日", "birthday")
        self.assertTrue(ok)
        c = engine.get_contact("n1")
        self.assertEqual(len(c["important_dates"]), 1)

    def test_set_bond(self):
        ok, msg = engine.set_bond("n1", "十五年老友")
        self.assertTrue(ok)
        c = engine.get_contact("n1")
        self.assertEqual(c["nurture"]["bond"], "十五年老友")

    def test_add_presence_event(self):
        ok, msg = engine.add_presence_event("n1", "父亲住院时来陪床")
        self.assertTrue(ok)
        c = engine.get_contact("n1")
        self.assertEqual(len(c["nurture"]["presence_events"]), 1)

    def test_get_nurture_info(self):
        engine.add_memory("n1", "不喝白酒只喝红酒")
        engine.set_bond("n1", "十五年老友")
        info = engine.get_nurture_info("n1")
        self.assertEqual(info["bond"], "十五年老友")
        self.assertEqual(len(info["memories"]), 1)

class TestLeverageFields(unittest.TestCase):
    def setUp(self):
        _clear_data()
        engine.add_contact("l1", "张总", relation="同行", nature="leverage")

    def test_set_leverage(self):
        ok, msg = engine.set_leverage("l1", ["事业"], "行业峰会资源引荐", "互惠")
        self.assertTrue(ok)
        lev = engine.get_leverage("l1")
        self.assertEqual(lev["goals"], ["事业"])
        self.assertEqual(lev["direction"], "互惠")

class TestTimeline(unittest.TestCase):
    def setUp(self):
        _clear_data()
        engine.add_contact("t1", "李总", relation="同行")

    def test_add_timeline(self):
        record = engine.add_timeline("t1", "聊了预算方案，他下周给答复")
        self.assertEqual(record["contact"], "t1")
        self.assertIn("预算", record["summary"])

    def test_add_timeline_with_pending(self):
        record = engine.add_timeline("t1", "聊了项目", pending="下周跟进预算答复")
        todos = engine.list_todos()
        self.assertEqual(len(todos), 1)
        self.assertIn("预算", todos[0]["task"])

    def test_days_since_last(self):
        engine.add_timeline("t1", "聊了项目")
        days = engine._days_since_last("t1")
        self.assertEqual(days, 0)  # Today

class TestAdvise(unittest.TestCase):
    def setUp(self):
        _clear_data()
        # Add leverage contact
        engine.add_contact("a1", "张总", relation="同行", nature="leverage")
        engine.set_leverage("a1", ["事业"], "资源引荐", "互惠")
        # Add nurture contact with birthday
        engine.add_contact("a2", "老周", relation="挚友", nature="nurture")
        engine.add_important_date("a2", "12-25", "生日", "birthday")

    def test_advise_leverage_returns_candidates(self):
        candidates = engine.advise_leverage(top=5)
        self.assertTrue(len(candidates) > 0)
        self.assertEqual(candidates[0]["contact"]["name"], "张总")

    def test_advise_nurture_no_scores(self):
        """ETHICAL GUARDRA: nurture advise must not have scores (SPEC §2.6)."""
        reminders = engine.advise_nurture(days_ahead=180)  # wide window to catch Dec birthday
        for r in reminders:
            self.assertNotIn("score", r)

class TestRoleDashboard(unittest.TestCase):
    def setUp(self):
        _clear_data()
        engine.add_contact("d1", "朋友A", relation="挚友", nature="nurture")
        engine.add_contact("d2", "家人B", relation="家人", nature="nurture")
        engine.add_contact("d3", "同事C", relation="同行", nature="leverage")

    def test_dashboard_structure(self):
        dash = engine.role_dashboard()
        self.assertIn("friend", dash)
        self.assertIn("family", dash)
        self.assertIn("collaborator", dash)
        self.assertEqual(dash["friend"]["total_contacts"], 1)
        self.assertEqual(dash["family"]["total_contacts"], 1)
        self.assertEqual(dash["collaborator"]["total_contacts"], 1)

    def test_dashboard_no_happiness_score(self):
        """SPEC §3.3: no happiness score, only behavioral facts."""
        dash = engine.role_dashboard()
        for role in ("friend", "family", "collaborator"):
            self.assertNotIn("happiness", dash[role])
            self.assertNotIn("score", dash[role])
            self.assertNotIn("rating", dash[role])

class TestTokens(unittest.TestCase):
    def setUp(self):
        from welian import tokens
        self.tokens = tokens
        _clear_data()
        tokens.USAGE_FILE = Path(_test_dir) / "data" / "usage.json"
        if tokens.USAGE_FILE.exists():
            tokens.USAGE_FILE.unlink()

    def test_initial_balance(self):
        bal = self.tokens.get_balance("test_user")
        self.assertEqual(bal["plan"], "free")
        self.assertEqual(bal["remaining"], 100)

    def test_consume(self):
        ok, remaining, msg = self.tokens.consume("test_user", "ai_draft")
        self.assertTrue(ok)
        self.assertEqual(remaining, 98)

    def test_insufficient_tokens(self):
        # Exhaust all tokens
        for _ in range(50):
            self.tokens.consume("test_user", "ai_draft")  # 50 * 2 = 100
        ok, remaining, msg = self.tokens.consume("test_user", "ai_draft")
        self.assertFalse(ok)
        self.assertIn("不够", msg)

    def test_upgrade_plan(self):
        ok, msg = self.tokens.upgrade_plan("test_user", "pro")
        self.assertTrue(ok)
        bal = self.tokens.get_balance("test_user")
        self.assertEqual(bal["plan"], "pro")
        self.assertEqual(bal["allowance"], 500)

if __name__ == "__main__":
    unittest.main()
