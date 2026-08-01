"""Tests for Welian core engine — contact / timeline / todo CRUD + field integrity.

These tests exercise the on-device data engine (src/welian/engine.py) against
an isolated temp data directory. No external services are involved.
"""
import pytest


# ── Contact CRUD ──

def test_contact_crud(fresh_data):
    """Create / read / update / delete a contact end-to-end."""
    engine = fresh_data["engine"]

    # Create
    ok, msg = engine.add_contact("c1", "张三", relation="同行",
                                 nature="leverage", tags=["客户"],
                                 platforms={"wechat": "zhangsan"},
                                 notes="初次见面于行业峰会")
    assert ok is True
    assert "张三" in msg

    # Duplicate id rejected
    ok2, _ = engine.add_contact("c1", "张三")
    assert ok2 is False

    # Read
    c = engine.get_contact("c1")
    assert c is not None
    assert c["name"] == "张三"
    assert c["relation"] == "同行"
    assert c["nature"] == "leverage"
    assert "客户" in c["tags"]

    # Resolve by name
    resolved, match = engine.resolve_contact("张三")
    assert resolved is not None
    assert resolved["id"] == "c1"
    assert match == "name"

    # Update
    ok, _ = engine.update_contact("c1", {"notes": "更新备注", "strength": 5})
    assert ok is True
    c = engine.get_contact("c1")
    assert c["notes"] == "更新备注"
    assert c["strength"] == 5

    # Update missing contact fails
    ok, _ = engine.update_contact("nope", {"notes": "x"})
    assert ok is False

    # Delete: engine has no public delete_contact. Add a second contact so the
    # remaining list is non-empty (engine._save skips writing empty lists), then
    # remove c1 through private storage and verify it's gone while c2 survives.
    engine.add_contact("c2", "李四", relation="客户")
    all_contacts = [ct for ct in engine._load(engine.CONTACTS_FILE) if ct["id"] != "c1"]
    engine._save(engine.CONTACTS_FILE, all_contacts)
    assert engine.get_contact("c1") is None
    assert all(ct["id"] != "c1" for ct in engine.list_contacts())
    assert engine.get_contact("c2") is not None


# ── Timeline CRUD ──

def test_timeline_crud(fresh_data):
    """Add / list / pending-todo auto-creation for timeline records."""
    engine = fresh_data["engine"]
    engine.add_contact("t1", "李总", relation="同行", nature="leverage")

    # Create
    rec = engine.add_timeline("t1", "聊了预算方案，他下周给答复",
                              key_points=["Q3预算", "下周回复"])
    assert rec["contact"] == "t1"
    assert "预算" in rec["summary"]
    assert rec["key_points"] == ["Q3预算", "下周回复"]

    # List (today's record visible within default 30-day window)
    tls = engine.list_timeline(contact_id="t1")
    assert len(tls) == 1
    assert tls[0]["id"] == rec["id"]

    # Create with pending → auto-creates a todo
    rec2 = engine.add_timeline("t1", "聊了项目", pending="下周跟进融资答复")
    todos = engine.list_todos()
    assert len(todos) == 1
    assert "融资" in todos[0]["task"]
    # P0 priority because "融资" is a P0 keyword
    assert todos[0]["priority"] == "P0"

    # Days-since-last is 0 (recorded today)
    assert engine._days_since_last("t1") == 0

    # Filtering by contact works
    engine.add_contact("t2", "王总", relation="同行")
    engine.add_timeline("t2", "另一次会面")
    only_t1 = engine.list_timeline(contact_id="t1")
    assert all(r["contact"] == "t1" for r in only_t1)
    assert len(only_t1) == 2


# ── Todo CRUD ──

def test_todo_crud(fresh_data):
    """Auto-created todos can be listed and completed."""
    engine = fresh_data["engine"]
    engine.add_contact("td1", "赵总", relation="同行", nature="leverage")

    # Create (via timeline pending)
    engine.add_timeline("td1", "讨论合作", pending="发送方案给赵总")
    todos = engine.list_todos(status="pending")
    assert len(todos) == 1
    tid = todos[0]["id"]
    assert todos[0]["status"] == "pending"
    assert todos[0]["contact"] == "td1"

    # Complete
    ok, msg = engine.complete_todo(tid)
    assert ok is True
    # Completed todos no longer appear under default 'pending' filter
    pending = engine.list_todos(status="pending")
    assert all(t["id"] != tid for t in pending)
    completed = engine.list_todos(status=None)
    assert any(t["id"] == tid and t["status"] == "completed" for t in completed)

    # Complete missing todo fails
    ok, _ = engine.complete_todo("todo-doesnotexist")
    assert ok is False

    # Priority filtering: non-keyword pending → P1
    engine.add_timeline("td1", "闲聊", pending="随便回个消息")
    p1 = engine.list_todos(priority="P1")
    assert len(p1) == 1
    assert p1[0]["priority"] == "P1"


# ── Contact field completeness ──

def test_contact_fields_complete(fresh_data):
    """A newly created contact must carry the full SPEC §2.5 data model."""
    engine = fresh_data["engine"]
    from welian.models import CONTACT_FIELDS

    engine.add_contact("f1", "老周", relation="挚友", nature="nurture",
                       tags=["挚友"], sub_relation="高中同学",
                       platforms={"wechat": "laozhou", "phone": "13800000000"},
                       notes="十五年老友")
    c = engine.get_contact("f1")

    # Every field declared in the canonical schema must be present.
    missing = set(CONTACT_FIELDS) - set(c.keys())
    assert missing == set(), f"missing fields: {missing}"

    # Field semantics
    assert c["id"] == "f1"
    assert c["name"] == "老周"
    assert c["relation"] == "挚友"
    assert c["role"] == "挚友"  # role mirrors relation
    assert c["sub_relation"] == "高中同学"
    assert c["nature"] == "nurture"
    assert c["strength"] == 3  # default
    assert c["company"] == ""
    assert c["title"] == ""
    assert c["phone"] == ""
    assert c["email"] == ""
    assert c["memories"] == []
    assert c["important_dates"] == []
    assert c["leverage"] == {}
    assert c["nurture"] == {}
    assert c["aliases"] == []
    assert c["alias"] == []
    assert c["platforms"]["wechat"] == "laozhou"
    assert isinstance(c["tags"], list)
    # created/updated are ISO datetime strings
    assert isinstance(c["created"], str) and "T" in c["created"]
    assert isinstance(c["updated"], str) and "T" in c["updated"]

    # Nurture sub-structure can be populated
    engine.set_bond("f1", "十五年老友")
    engine.add_memory("f1", "儿子小宇今年中考")
    engine.add_important_date("f1", "11-29", "生日", "birthday")
    engine.add_presence_event("f1", "父亲住院时来陪床")
    info = engine.get_nurture_info("f1")
    assert info["bond"] == "十五年老友"
    assert len(info["memories"]) == 1
    assert len(info["important_dates"]) == 1
    assert len(info["presence_events"]) == 1

    # Leverage sub-structure
    engine.set_leverage("f1", ["事业"], "资源引荐", "互惠")
    lev = engine.get_leverage("f1")
    assert lev["goals"] == ["事业"]
    assert lev["direction"] == "互惠"
    assert "confirmed" in lev
