"""Migrate social-agent data to Welian format.

Transformations:
1. Add `nature` field (leverage/nurture/dual) based on relation + tags
2. Add `nurture` dict for nurture-type contacts (bond from notes)
3. Normalize timeline: contact_group → contact (best effort)
4. Keep all existing fields (forward-compatible)

Usage:
  python3 scripts/migrate_from_social_agent.py [--dry-run]
"""
import json
import os
import sys
from pathlib import Path
from datetime import date

# ── Paths ──
SA_HOME = Path.home() / ".claude" / "skills" / "social-agent"
SA_DATA = SA_HOME / "data"

WELIAN_HOME = Path(os.environ.get("WELIAN_HOME", str(Path.home() / ".welian")))
WELIAN_DATA = WELIAN_HOME / "data"

# ── Nature inference (mirrors engine.infer_nature but standalone) ──

FAMILY_RELATIONS = {"家人", "family", "父母", "配偶", "子女", "亲属", "朋友配偶"}
FRIEND_RELATIONS = {"挚友", "老友", "新友", "friend", "朋友"}
NURTURE_TAGS = {"家人", "挚友", "老友"}

def infer_nature(contact):
    """Infer relationship nature from social-agent contact."""
    explicit = contact.get("nature")
    if explicit in ("leverage", "nurture", "dual"):
        return explicit

    relation = (contact.get("relation") or "").lower()
    tags = set(t.lower() for t in contact.get("tags", []))

    is_family = relation in FAMILY_RELATIONS or "家人" in tags
    is_friend = relation in FRIEND_RELATIONS or "挚友" in tags

    # Check if also has leverage (business connection)
    has_leverage = bool(contact.get("leverage", {}).get("confirmed"))
    business_tags = {"同行", "合作", "同事", "客户", "创业", "校友", "上级", "上级领导"}
    is_business = relation in business_tags or bool(business_tags & tags)

    if is_family or is_friend:
        if has_leverage or is_business:
            return "dual"
        return "nurture"

    return "leverage"

def infer_bond(contact):
    """Extract bond description from notes for nurture contacts."""
    notes = contact.get("notes", "")
    if isinstance(notes, list):
        notes = " ".join(notes)

    relation = contact.get("relation", "")
    sub = contact.get("sub_relation", "")

    # Build bond from available info
    parts = []
    if relation == "家人":
        parts.append("家人")
    elif relation == "挚友" or relation == "朋友":
        parts.append("朋友")
    if sub:
        parts.append(sub)

    return " · ".join(parts) if parts else ""

# ── Migration ──

def migrate_contacts(contacts):
    """Migrate social-agent contacts to Welian format."""
    migrated = []
    stats = {"total": 0, "leverage": 0, "nurture": 0, "dual": 0, "with_leverage": 0, "with_memories": 0}

    for c in contacts:
        stats["total"] += 1

        # Add nature
        nature = infer_nature(c)
        c["nature"] = nature
        stats[nature] += 1

        # Add nurture dict for nurture/dual contacts
        if nature in ("nurture", "dual"):
            if "nurture" not in c or not c.get("nurture"):
                bond = infer_bond(c)
                c["nurture"] = {"bond": bond}

        # Ensure required welian fields exist
        c.setdefault("memories", [])
        c.setdefault("important_dates", [])
        c.setdefault("leverage", {})

        if c.get("leverage", {}).get("confirmed"):
            stats["with_leverage"] += 1
        if c.get("memories"):
            stats["with_memories"] += 1

        migrated.append(c)

    return migrated, stats

def migrate_timeline(timeline):
    """Migrate timeline records. Normalize contact_group → contact."""
    migrated = []
    for r in timeline:
        # social-agent uses contact_group sometimes, welian uses contact
        if "contact" not in r and "contact_group" in r:
            r["contact"] = r["contact_group"]
        r.setdefault("type", "message")
        r.setdefault("key_points", [])
        r.setdefault("pending", "")
        migrated.append(r)
    return migrated

def migrate_todos(todos):
    """Migrate todos. Field names are already compatible."""
    migrated = []
    for t in todos:
        # Normalize: some use 'content' instead of 'task'
        if "task" not in t and t.get("content"):
            t["task"] = t["content"]
        t.setdefault("status", "pending")
        t.setdefault("priority", "P1")
        migrated.append(t)
    return migrated

def main():
    dry_run = "--dry-run" in sys.argv

    print(f"Source: {SA_DATA}")
    print(f"Target: {WELIAN_DATA}")
    print(f"Mode: {'dry-run' if dry_run else 'actual migration'}")
    print()

    # Load source data
    sa_contacts = json.load(open(SA_DATA / "contacts.json"))
    sa_timeline = json.load(open(SA_DATA / "timeline.json"))
    sa_todos = json.load(open(SA_DATA / "todos.json"))

    print(f"Source data:")
    print(f"  Contacts: {len(sa_contacts)}")
    print(f"  Timeline: {len(sa_timeline)}")
    print(f"  Todos: {len(sa_todos)}")
    print()

    # Migrate
    contacts, c_stats = migrate_contacts(sa_contacts)
    timeline = migrate_timeline(sa_timeline)
    todos = migrate_todos(sa_todos)

    print(f"Migration stats:")
    print(f"  Nature distribution:")
    print(f"    leverage: {c_stats['leverage']}")
    print(f"    nurture:  {c_stats['nurture']}")
    print(f"    dual:     {c_stats['dual']}")
    print(f"  With leverage anchored: {c_stats['with_leverage']}")
    print(f"  With memories: {c_stats['with_memories']}")
    print()

    if dry_run:
        print("Dry run complete — no files written.")
        # Show sample migrated contacts
        print("\nSample migrated contacts (first 3):")
        for c in contacts[:3]:
            print(f"  {c['name']:12s} nature={c['nature']:8s} relation={c.get('relation','')}")
        return

    # Write to welian
    WELIAN_DATA.mkdir(parents=True, exist_ok=True)

    contacts_path = WELIAN_DATA / "contacts.json"
    timeline_path = WELIAN_DATA / "timeline.json"
    todos_path = WELIAN_DATA / "todos.json"

    with open(contacts_path, "w", encoding="utf-8") as f:
        json.dump(contacts, f, ensure_ascii=False, indent=2)
    print(f"✓ Written {len(contacts)} contacts → {contacts_path}")

    with open(timeline_path, "w", encoding="utf-8") as f:
        json.dump(timeline, f, ensure_ascii=False, indent=2)
    print(f"✓ Written {len(timeline)} timeline records → {timeline_path}")

    with open(todos_path, "w", encoding="utf-8") as f:
        json.dump(todos, f, ensure_ascii=False, indent=2)
    print(f"✓ Written {len(todos)} todos → {todos_path}")

    print(f"\nMigration complete. Set WELIAN_HOME={WELIAN_HOME} to use.")

if __name__ == "__main__":
    main()
