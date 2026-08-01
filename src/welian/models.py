"""Shared data models for Welian — single source of truth for contact/timeline/todo schemas.

All contact creation across the codebase should use create_contact() to ensure
field consistency between engine.py, agent.py, and worker.js.
"""

from datetime import datetime
import uuid


def create_contact(name: str, **kwargs) -> dict:
    """Create a contact dict with all required fields.

    Accepts optional overrides for any field. Ensures every contact has
    the same shape regardless of where it's created.

    Usage:
        c = create_contact("张三", relation="同事", company="腾讯")
        c = create_contact("李四", nature="nurture", strength=5)
    """
    now = datetime.now().isoformat()
    return {
        "id": kwargs.get("id") or f"c-{uuid.uuid4().hex[:12]}",
        "name": name,
        "relation": kwargs.get("relation", ""),
        "role": kwargs.get("role", kwargs.get("relation", "")),
        "sub_relation": kwargs.get("sub_relation", ""),
        "company": kwargs.get("company", ""),
        "title": kwargs.get("title", ""),
        "nature": kwargs.get("nature", "leverage"),
        "strength": kwargs.get("strength", 3),
        "tags": kwargs.get("tags", []),
        "platforms": kwargs.get("platforms", {}),
        "phone": kwargs.get("phone", ""),
        "email": kwargs.get("email", ""),
        "notes": kwargs.get("notes", ""),
        "memories": kwargs.get("memories", []),
        "important_dates": kwargs.get("important_dates", []),
        "leverage": kwargs.get("leverage", {}),
        "nurture": kwargs.get("nurture", {}),
        "aliases": kwargs.get("aliases", []),
        "alias": kwargs.get("alias", []),
        "created": kwargs.get("created", now),
        "updated": kwargs.get("updated", now),
    }


def create_timeline_entry(contact_id: str, summary: str, **kwargs) -> dict:
    """Create a timeline/interaction entry dict."""
    now = datetime.now().isoformat()
    return {
        "id": kwargs.get("id") or f"t-{uuid.uuid4().hex[:12]}",
        "date": kwargs.get("date", now[:10]),
        "contact": contact_id,
        "type": kwargs.get("type", "message"),
        "summary": summary,
        "key_points": kwargs.get("key_points", []),
        "pending": kwargs.get("pending", ""),
        "created": kwargs.get("created", now),
    }


def create_todo(contact_id: str, task: str, **kwargs) -> dict:
    """Create a todo item dict."""
    now = datetime.now().isoformat()
    return {
        "id": kwargs.get("id") or f"todo-{uuid.uuid4().hex[:12]}",
        "contact": contact_id,
        "task": task,
        "priority": kwargs.get("priority", "P1"),
        "due": kwargs.get("due", ""),
        "status": kwargs.get("status", "pending"),
        "source": kwargs.get("source", ""),
        "created": kwargs.get("created", now),
    }


# ── Contact field schema (for validation/documentation) ──

CONTACT_FIELDS = {
    "id": {"type": "string", "required": True},
    "name": {"type": "string", "required": True},
    "relation": {"type": "string", "required": False, "default": ""},
    "role": {"type": "string", "required": False, "default": ""},
    "sub_relation": {"type": "string", "required": False, "default": ""},
    "company": {"type": "string", "required": False, "default": ""},
    "title": {"type": "string", "required": False, "default": ""},
    "nature": {"type": "string", "required": False, "default": "leverage",
               "enum": ["leverage", "nurture", "dual"]},
    "strength": {"type": "int", "required": False, "default": 3, "min": 1, "max": 5},
    "tags": {"type": "array", "required": False, "default": []},
    "platforms": {"type": "object", "required": False, "default": {}},
    "phone": {"type": "string", "required": False, "default": ""},
    "email": {"type": "string", "required": False, "default": ""},
    "notes": {"type": "string", "required": False, "default": ""},
    "memories": {"type": "array", "required": False, "default": []},
    "important_dates": {"type": "array", "required": False, "default": []},
    "leverage": {"type": "object", "required": False, "default": {}},
    "nurture": {"type": "object", "required": False, "default": {}},
    "aliases": {"type": "array", "required": False, "default": []},
    "alias": {"type": "array", "required": False, "default": []},
    "created": {"type": "string", "required": True},
    "updated": {"type": "string", "required": True},
}

TIMELINE_FIELDS = {
    "id": {"type": "string", "required": True},
    "date": {"type": "string", "required": True},
    "contact": {"type": "string", "required": True},
    "type": {"type": "string", "required": False, "default": "message",
             "enum": ["message", "meeting", "call"]},
    "summary": {"type": "string", "required": True},
    "key_points": {"type": "array", "required": False, "default": []},
    "pending": {"type": "string", "required": False, "default": ""},
    "created": {"type": "string", "required": True},
}

TODO_FIELDS = {
    "id": {"type": "string", "required": True},
    "contact": {"type": "string", "required": True},
    "task": {"type": "string", "required": True},
    "priority": {"type": "string", "required": False, "default": "P1",
                 "enum": ["P0", "P1", "P2"]},
    "due": {"type": "string", "required": False, "default": ""},
    "status": {"type": "string", "required": False, "default": "pending",
               "enum": ["pending", "completed", "cancelled"]},
    "source": {"type": "string", "required": False, "default": ""},
    "created": {"type": "string", "required": True},
}
