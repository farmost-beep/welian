"""Welian core engine — dual relationship model + four verbs (记/问/拟/报).

Extends social-agent engine with:
- nature field: leverage | nurture | dual
- nurture fields: bond, important_dates, memories, presence_events
- Four verbs: record(记) / ask(问) / draft(拟) / report(报)
- Role dashboard: friend / family / collaborator
- Ethical guardrails: no ROI on nurture relationships
"""
import json, os, uuid, re, yaml
from datetime import datetime, date, timedelta
from pathlib import Path

# ── Config ──

def _get_home_dir():
    env = os.environ.get("WELIAN_HOME")
    if env:
        p = Path(env)
        if p.is_dir():
            return p
    pkg_root = Path(__file__).resolve().parent.parent.parent
    if (pkg_root / "config").is_dir():
        return pkg_root
    user_dir = Path.home() / ".welian"
    user_dir.mkdir(parents=True, exist_ok=True)
    return user_dir

def _load_config():
    home = _get_home_dir()
    for name in ("config.local.yaml", "config.yaml", "welian.yaml"):
        cp = home / "config" / name
        if cp.exists():
            with open(cp, "r", encoding="utf-8") as f:
                return yaml.safe_load(f) or {}
    return {}

_CONFIG = _load_config()
_DATA_DIR = Path(_CONFIG.get("data_dir", str(_get_home_dir() / "data")))
_DATA_DIR.mkdir(parents=True, exist_ok=True)

CONTACTS_FILE = _DATA_DIR / "contacts.json"
TIMELINE_FILE = _DATA_DIR / "timeline.json"
TODOS_FILE = _DATA_DIR / "todos.json"
USAGE_FILE = _DATA_DIR / "usage.json"


def _init_paths():
    """Re-initialize data paths after WELIAN_HOME change.

    Called by bot SessionManager when switching to a per-user data directory.
    """
    global _CONFIG, _DATA_DIR, CONTACTS_FILE, TIMELINE_FILE, TODOS_FILE, USAGE_FILE
    _CONFIG = _load_config()
    _DATA_DIR = Path(_CONFIG.get("data_dir", str(_get_home_dir() / "data")))
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    CONTACTS_FILE = _DATA_DIR / "contacts.json"
    TIMELINE_FILE = _DATA_DIR / "timeline.json"
    TODOS_FILE = _DATA_DIR / "todos.json"
    USAGE_FILE = _DATA_DIR / "usage.json"

NATURE_LEVERAGE = "leverage"
NATURE_NURTURE = "nurture"
NATURE_DUAL = "dual"
VALID_NATURES = {NATURE_LEVERAGE, NATURE_NURTURE, NATURE_DUAL}

# Role mapping (SPEC §3.1)
ROLE_FRIEND = "friend"
ROLE_FAMILY = "family"
ROLE_COLLABORATOR = "collaborator"

# Relations that map to family role
FAMILY_RELATIONS = {"家人", "family", "父母", "配偶", "子女", "亲属"}
# Relations that map to friend role
FRIEND_RELATIONS = {"挚友", "老友", "新友", "friend"}
# Relations that map to collaborator role
COLLABORATOR_RELATIONS = {"同行", "合作", "同事", "客户", "collaborator", "partner"}

def _load(path):
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _save(path, data):
    if isinstance(data, (list, dict)) and len(data) == 0:
        if path.exists() and path.stat().st_size > 2:
            return
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ── Nature classification ──

def infer_nature(contact):
    """Infer relationship nature from contact fields (SPEC §2.4)."""
    explicit = contact.get("nature")
    if explicit in VALID_NATURES:
        return explicit
    relation = (contact.get("relation") or contact.get("role") or "").lower()
    tags = set(t.lower() for t in contact.get("tags", []))
    if relation in FAMILY_RELATIONS or "家人" in tags:
        return NATURE_NURTURE
    if relation in FRIEND_RELATIONS or "挚友" in tags:
        return NATURE_NURTURE
    return NATURE_LEVERAGE  # default

def contact_role(contact):
    """Map contact to one of three social roles (SPEC §3.1)."""
    relation = (contact.get("relation") or contact.get("role") or "").lower()
    tags = set(t.lower() for t in contact.get("tags", []))
    nature = infer_nature(contact)
    if relation in FAMILY_RELATIONS or "家人" in tags:
        return ROLE_FAMILY
    if relation in FRIEND_RELATIONS or nature == NATURE_NURTURE:
        return ROLE_FRIEND
    return ROLE_COLLABORATOR

# ── Contacts ──

def list_contacts(nature=None, role=None, tag=None):
    contacts = _load(CONTACTS_FILE)
    if nature:
        contacts = [c for c in contacts if infer_nature(c) == nature]
    if role:
        contacts = [c for c in contacts if contact_role(c) == role]
    if tag:
        contacts = [c for c in contacts if tag in c.get("tags", [])]
    return contacts

def add_contact(contact_id, name, relation="", nature=None, tags=None,
                platforms=None, notes="", sub_relation=""):
    contacts = _load(CONTACTS_FILE)
    if any(c["id"] == contact_id for c in contacts):
        return False, f"Contact {contact_id} already exists"
    contact = {
        "id": contact_id,
        "name": name,
        "relation": relation,
        "role": relation,
        "sub_relation": sub_relation,
        "nature": nature or NATURE_LEVERAGE,
        "strength": 3,
        "tags": tags or [],
        "platforms": platforms or {},
        "notes": notes,
        "memories": [],
        "important_dates": [],
        "leverage": {},
        "nurture": {},
        "created": date.today().isoformat(),
    }
    contacts.append(contact)
    _save(CONTACTS_FILE, contacts)
    return True, f"Added: {name}"

def get_contact(contact_id):
    contacts = _load(CONTACTS_FILE)
    for c in contacts:
        if c["id"] == contact_id:
            return c
    return None

def resolve_contact(query):
    """Resolve contact by ID/name/alias/fuzzy match."""
    contacts = _load(CONTACTS_FILE)
    q = query.strip()
    if not q:
        return None, None
    q_lower = q.lower()
    for c in contacts:
        if c["id"] == q:
            return c, "id"
    for c in contacts:
        if c.get("name", "").lower() == q_lower:
            return c, "name"
    for c in contacts:
        for a in (c.get("alias") or []):
            if isinstance(a, str) and a.lower() == q_lower:
                return c, "alias"
    candidates = []
    for c in contacts:
        name = c.get("name", "").lower()
        if name.startswith(q_lower) or q_lower in name:
            candidates.append((c, len(name)))
    if candidates:
        candidates.sort(key=lambda x: x[1])
        return candidates[0][0], "fuzzy_name"
    return None, None

def update_contact(contact_id, updates):
    contacts = _load(CONTACTS_FILE)
    for c in contacts:
        if c["id"] == contact_id:
            for key, val in updates.items():
                if val is not None:
                    c[key] = val
            _save(CONTACTS_FILE, contacts)
            return True, f"Updated {contact_id}"
    return False, f"Contact not found: {contact_id}"

def set_nature(contact_id, nature):
    if nature not in VALID_NATURES:
        return False, f"Invalid nature: {nature}"
    return update_contact(contact_id, {"nature": nature})

# ── Batch nature classification (SPEC §2.4 default + §2.5 data model) ──

# Relations/tags that strongly indicate nurture type
NURTURE_RELATIONS = {"家人", "父母", "配偶", "子女", "亲属", "挚友", "老友", "恩师", "family"}
NURTURE_TAGS = {"家人", "亲戚", "挚友", "老友", "同学会", "室友", "邻居"}
# Relations/tags that strongly indicate leverage type
LEVERAGE_TAGS = {"客户", "同行", "合作", "同事", "供应商", "领导", "下属", "民建", "邮储", "ustc", "职教社"}

def auto_classify_nature(contact):
    """Auto-classify a contact's nature based on relation/tags/notes (SPEC §2.4).

    Default: leverage (SPEC §2.4 "新联系人默认撬动型").
    Family relations → nurture.
    Close friend/mentor → nurture.
    """
    explicit = contact.get("nature")
    if explicit in VALID_NATURES and explicit != NATURE_LEVERAGE:
        return explicit  # Already classified, keep it

    relation = (contact.get("relation") or contact.get("role") or "").lower()
    tags = set(t.lower() for t in contact.get("tags", []))
    notes = (contact.get("notes") or "").lower()

    # Strong nurture signals
    if relation in NURTURE_RELATIONS or any(t in NURTURE_TAGS for t in tags):
        return NATURE_NURTURE

    # If has family relation keywords in notes
    if any(kw in notes for kw in ["父亲", "母亲", "老婆", "老公", "儿子", "女儿", "爸", "妈"]):
        return NATURE_NURTURE

    # Default: leverage
    return NATURE_LEVERAGE

def batch_classify_natures(dry_run=True):
    """Batch classify all contacts' nature based on rules (SPEC §2.4).

    Returns list of (contact_id, name, old_nature, suggested_nature).
    Does NOT auto-apply unless dry_run=False.
    """
    contacts = _load(CONTACTS_FILE)
    changes = []
    for c in contacts:
        if c.get("relation") == "self":
            continue
        old = c.get("nature", NATURE_LEVERAGE)
        suggested = auto_classify_nature(c)
        if suggested != old:
            changes.append((c["id"], c.get("name", ""), old, suggested))
            if not dry_run:
                c["nature"] = suggested
    if not dry_run and changes:
        _save(CONTACTS_FILE, contacts)
    return changes

def init_nurture_fields(contact_id, bond="", important_dates=None, memories=None):
    """Initialize nurture fields for a contact (SPEC §2.5).

    Ensures the nurture object exists with proper structure.
    """
    contacts = _load(CONTACTS_FILE)
    for c in contacts:
        if c["id"] == contact_id:
            n = c.setdefault("nurture", {})
            if bond:
                n["bond"] = bond
            if important_dates:
                c.setdefault("important_dates", []).extend(important_dates)
            if memories:
                c.setdefault("memories", []).extend(memories)
            n.setdefault("presence_events", [])
            _save(CONTACTS_FILE, contacts)
            return True, f"Nurture initialized for {c.get('name', contact_id)}"
    return False, f"Contact not found: {contact_id}"

def batch_init_nurture(dry_run=True):
    """Initialize nurture fields for all nurture-type contacts (SPEC §2.5).

    Ensures every nurture contact has:
    - nurture.bond (empty string if not set)
    - nurture.presence_events (empty list)
    - important_dates (empty list)
    - memories (empty list)
    """
    contacts = _load(CONTACTS_FILE)
    changes = []
    for c in contacts:
        if c.get("relation") == "self":
            continue
        nature = infer_nature(c)
        if nature != NATURE_NURTURE and nature != NATURE_DUAL:
            continue
        n = c.get("nurture") or {}
        needs_init = not n or "bond" not in n or "presence_events" not in n
        if needs_init:
            changes.append((c["id"], c.get("name", ""), nature))
            if not dry_run:
                n.setdefault("bond", "")
                n.setdefault("presence_events", [])
                c["nurture"] = n
                c.setdefault("important_dates", [])
                c.setdefault("memories", [])
    if not dry_run and changes:
        _save(CONTACTS_FILE, contacts)
    return changes

# ── Nurture fields (SPEC §2.3) ──

def add_memory(contact_id, content, tags=None):
    contacts = _load(CONTACTS_FILE)
    for c in contacts:
        if c["id"] == contact_id:
            memory = {
                "id": f"mem-{uuid.uuid4().hex[:6]}",
                "content": content,
                "tags": tags or [],
                "created": datetime.now().isoformat(),
            }
            c.setdefault("memories", []).append(memory)
            _save(CONTACTS_FILE, contacts)
            return True, f"Remembered: {content[:40]}"
    return False, f"Contact not found: {contact_id}"

def add_important_date(contact_id, date_str, label, dtype="birthday"):
    """Add an important date for a nurture contact (SPEC §2.3)."""
    contacts = _load(CONTACTS_FILE)
    for c in contacts:
        if c["id"] == contact_id:
            entry = {"date": date_str, "label": label, "type": dtype}
            c.setdefault("important_dates", []).append(entry)
            _save(CONTACTS_FILE, contacts)
            return True, f"Added date: {label} ({date_str})"
    return False, f"Contact not found: {contact_id}"

def set_bond(contact_id, bond):
    """Set the bond description for a nurture contact."""
    contacts = _load(CONTACTS_FILE)
    for c in contacts:
        if c["id"] == contact_id:
            c.setdefault("nurture", {})["bond"] = bond
            _save(CONTACTS_FILE, contacts)
            return True, f"Bond set: {bond}"
    return False, f"Contact not found: {contact_id}"

def add_presence_event(contact_id, event):
    """Record a presence event (you were there for them)."""
    contacts = _load(CONTACTS_FILE)
    for c in contacts:
        if c["id"] == contact_id:
            c.setdefault("nurture", {}).setdefault("presence_events", []).append({
                "event": event,
                "date": date.today().isoformat(),
            })
            _save(CONTACTS_FILE, contacts)
            return True, f"Presence recorded: {event}"
    return False, f"Contact not found: {contact_id}"

def get_nurture_info(contact_id):
    """Get nurture-specific info for a contact (SPEC §2.3)."""
    c = get_contact(contact_id)
    if not c:
        return None
    return {
        "bond": (c.get("nurture") or {}).get("bond", ""),
        "important_dates": c.get("important_dates", []),
        "memories": c.get("memories", []),
        "presence_events": (c.get("nurture") or {}).get("presence_events", []),
    }

# ── Leverage fields (SPEC §2.2) ──

def set_leverage(contact_id, goals, how, direction="互惠", confirmed=None):
    contacts = _load(CONTACTS_FILE)
    for c in contacts:
        if c["id"] == contact_id:
            c["leverage"] = {
                "goals": list(goals),
                "how": how,
                "direction": direction,
                "confirmed": confirmed or date.today().isoformat(),
            }
            _save(CONTACTS_FILE, contacts)
            return True, f"Anchored: goals={goals}, direction={direction}"
    return False, f"Contact not found: {contact_id}"

def get_leverage(contact_id):
    c = get_contact(contact_id)
    return c.get("leverage") if c else None

# ── Timeline (记) ──

def add_timeline(contact_id, summary, type_="message", key_points=None, pending=""):
    records = _load(TIMELINE_FILE)
    record = {
        "id": f"t-{uuid.uuid4().hex[:6]}",
        "date": date.today().isoformat(),
        "contact": contact_id,
        "type": type_,
        "summary": summary,
        "pending": pending,
        "key_points": key_points or [],
        "created": datetime.now().isoformat(),
    }
    records.append(record)
    _save(TIMELINE_FILE, records)
    if pending:
        _auto_add_todo(contact_id, pending, record["id"])
    return record

def list_timeline(contact_id=None, days=30, **kwargs):
    records = _load(TIMELINE_FILE)
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    records = [r for r in records if r.get("date", "") >= cutoff]
    if contact_id:
        records = [r for r in records if r.get("contact") == contact_id]
    return sorted(records, key=lambda r: r.get("date", ""), reverse=True)

def _days_since_last(contact_id):
    tls = list_timeline(contact_id=contact_id, days=9999)
    if not tls:
        return 9999
    last = tls[0].get("date", "")
    try:
        return (date.today() - date.fromisoformat(last)).days
    except (ValueError, TypeError):
        return 9999

# ── Todos ──

def _auto_add_todo(contact_id, task, source_id):
    todos = _load(TODOS_FILE)
    priority = "P0" if any(kw in task for kw in ["TS", "投资", "融资", "引荐", "签约", "budget", "deadline"]) else "P1"
    days = 3 if priority == "P0" else 7
    todo = {
        "id": f"todo-{uuid.uuid4().hex[:6]}",
        "contact": contact_id,
        "task": task,
        "priority": priority,
        "due": (date.today() + timedelta(days=days)).isoformat(),
        "status": "pending",
        "source": source_id,
        "created": datetime.now().isoformat(),
    }
    todos.append(todo)
    _save(TODOS_FILE, todos)
    return todo

def list_todos(priority=None, status="pending"):
    todos = _load(TODOS_FILE)
    if status:
        todos = [t for t in todos if t.get("status") == status]
    if priority:
        todos = [t for t in todos if t.get("priority") == priority]
    todos.sort(key=lambda t: (t.get("priority", "P2"), t.get("due", "")))
    return todos

def complete_todo(todo_id):
    todos = _load(TODOS_FILE)
    for t in todos:
        if t["id"] == todo_id:
            t["status"] = "completed"
            t["completed_at"] = datetime.now().isoformat()
            _save(TODOS_FILE, todos)
            return True, f"Done: {t['task']}"
    return False, "Todo not found"

# ── Advise engine (问) — SPEC §6.2 ──

def advise_leverage(top=5):
    """Leverage-type: who to contact + why + what to say (SPEC §2.2)."""
    contacts = list_contacts(nature=NATURE_LEVERAGE) + [
        c for c in list_contacts(nature=NATURE_DUAL)
    ]
    candidates = []
    for c in contacts:
        if c.get("relation") == "self":
            continue
        cid = c["id"]
        days = _days_since_last(cid)
        signals = []
        score = 0
        if days >= 21:
            signals.append(f"{days}天没联系了")
            score += 30
        elif days >= 14:
            signals.append(f"{days}天没联系")
            score += 20
        elif days == 9999:
            signals.append("从未联系")
            score += 25
        lev = c.get("leverage") or {}
        if lev.get("confirmed"):
            signals.append(f"锚定[{','.join(lev.get('goals', []))}]")
            score += 15
        todos = [t for t in list_todos() if t.get("contact") == cid]
        if todos:
            signals.append(f"待办: {todos[0]['task'][:30]}")
            score += 25
        score += c.get("strength", 1) * 2
        if score > 0:
            tls = list_timeline(contact_id=cid, days=9999)
            last_summary = tls[0].get("summary", "") if tls else ""
            candidates.append({
                "contact": c, "signals": signals, "score": score,
                "days_since": days, "last_interaction": last_summary,
                "leverage": lev,
            })
    candidates.sort(key=lambda x: -x["score"])
    return candidates[:top]

def advise_nurture(days_ahead=14):
    """Nurture-type: important dates + presence reminders (SPEC §2.3).

    ETHICAL GUARDRAIL: No scores, no ranking, no ROI (SPEC §2.6).
    Just gentle reminders about what matters.
    """
    contacts = list_contacts(nature=NATURE_NURTURE) + [
        c for c in list_contacts(nature=NATURE_DUAL)
    ]
    reminders = []
    today = date.today()
    for c in contacts:
        cid = c["id"]
        nurture = c.get("nurture") or {}
        # Check important dates
        for d_entry in c.get("important_dates", []):
            d_str = d_entry.get("date", "")
            parts = d_str.split("-")
            if len(parts) >= 2:
                try:
                    month, day = int(parts[-2]), int(parts[-1])
                    bd = date(today.year, month, day)
                    if bd < today:
                        bd = date(today.year + 1, month, day)
                    delta = (bd - today).days
                    if 0 <= delta <= days_ahead:
                        reminders.append({
                            "contact": c,
                            "type": "important_date",
                            "label": d_entry.get("label", ""),
                            "date": d_str,
                            "days_ahead": delta,
                        })
                except ValueError:
                    pass
        # Check memories for actionable items
        for m in c.get("memories", []):
            content = m.get("content", "")
            # Simple heuristic: if memory mentions an event/time
            if any(kw in content for kw in ["考试", "手术", "出差", "搬家", "exam", "surgery", "moving"]):
                reminders.append({
                    "contact": c,
                    "type": "memory_followup",
                    "content": content,
                })
    return reminders

# ── Role dashboard (报) — SPEC §3.2 ──

def role_dashboard(month=None):
    """Monthly role review: friend / family / collaborator (SPEC §3.2).

    Returns behavioral facts, NOT happiness scores (SPEC §3.3).
    """
    if month is None:
        month = date.today().strftime("%Y-%m")
    contacts = _load(CONTACTS_FILE)
    timeline = [r for r in _load(TIMELINE_FILE) if r.get("date", "").startswith(month)]
    todos = _load(TODOS_FILE)

    # Group contacts by role
    by_role = {ROLE_FRIEND: [], ROLE_FAMILY: [], ROLE_COLLABORATOR: []}
    for c in contacts:
        if c.get("relation") == "self":
            continue
        role = contact_role(c)
        by_role[role].append(c)

    def _role_stats(role_contacts):
        cids = {c["id"] for c in role_contacts}
        interactions = [r for r in timeline if r.get("contact") in cids]
        completed = [t for t in todos if t.get("contact") in cids and t.get("status") == "completed"]
        pending = [t for t in todos if t.get("contact") in cids and t.get("status") == "pending"]
        # Count meaningful interactions (meetings, calls, milestones)
        meaningful = [r for r in interactions if r.get("type") in ("meeting", "call", "milestone")]
        return {
            "total_contacts": len(role_contacts),
            "interactions": len(interactions),
            "meaningful_interactions": len(meaningful),
            "completed_todos": len(completed),
            "pending_todos": len(pending),
            "names": [c["name"] for c in role_contacts],
        }

    return {
        "month": month,
        "friend": _role_stats(by_role[ROLE_FRIEND]),
        "family": _role_stats(by_role[ROLE_FAMILY]),
        "collaborator": _role_stats(by_role[ROLE_COLLABORATOR]),
    }

# ── Birthdays ──

def get_birthdays(days=30):
    contacts = _load(CONTACTS_FILE)
    today = date.today()
    results = []
    for c in contacts:
        for d_entry in c.get("important_dates", []):
            if "birthday" in d_entry.get("type", "").lower() or "生日" in d_entry.get("label", ""):
                parts = d_entry.get("date", "").split("-")
                if len(parts) >= 2:
                    try:
                        month, day = int(parts[-2]), int(parts[-1])
                        bd = date(today.year, month, day)
                        if bd < today:
                            bd = date(today.year + 1, month, day)
                        delta = (bd - today).days
                        if 0 <= delta <= days:
                            results.append({
                                "contact": c["name"], "id": c["id"],
                                "date": f"{month}-{day}", "days_left": delta,
                                "label": d_entry.get("label", "生日"),
                            })
                    except ValueError:
                        pass
    results.sort(key=lambda r: r["days_left"])
    return results

# ── Outcomes (SPEC §2.2 leverage tracking) ──

def add_outcome(contact_id, summary, goal=None):
    records = _load(TIMELINE_FILE)
    record = {
        "id": f"t-{uuid.uuid4().hex[:6]}",
        "date": date.today().isoformat(),
        "contact": contact_id,
        "type": "outcome",
        "summary": summary,
        "goal": goal,
        "created": datetime.now().isoformat(),
    }
    records.append(record)
    _save(TIMELINE_FILE, records)
    return record

# ── Dashboard ──

def get_dashboard():
    contacts = _load(CONTACTS_FILE)
    todos = list_todos()
    timeline = list_timeline(days=7)
    bdays = get_birthdays(days=14)
    leverage_advise = advise_leverage(top=3)
    nurture_reminders = advise_nurture(days_ahead=14)
    return {
        "total_contacts": len(contacts),
        "pending_todos": len(todos),
        "recent_activities": len(timeline),
        "upcoming_birthdays": bdays,
        "leverage_suggestions": len(leverage_advise),
        "nurture_reminders": len(nurture_reminders),
    }
