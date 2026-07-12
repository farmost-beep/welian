"""Welian edge SDK — runs on user's device, holds all data locally.

Architecture (SPEC §7.1):
  Edge (this module) ──sends minimal context──→ Cloud (AI only)
  Edge ←──receives AI result────────────────── Cloud

The edge SDK:
  1. Runs the full engine locally (all data CRUD)
  2. Extracts minimal context when AI is needed
  3. Calls cloud API for AI operations only
  4. Never sends full contacts/timeline to the cloud
  5. Supports encrypted export/migration

Usage:
  from welian.edge import EdgeClient
  client = EdgeClient(cloud_url="https://api.welian.app")
  reply = client.chat("记一下：和张总聊了预算方案")
"""
import json
import os
from datetime import date
from pathlib import Path
from typing import Optional

from . import engine, intent, ai, tokens


class EdgeClient:
    """Edge-side client. Holds all data locally, calls LLM directly.

    Architecture (simplified):
      Edge (this module) ──sends minimal context──→ LLM API
      Edge ←──receives AI result────────────────── LLM API

    No cloud middleware needed for single-user phase.
    Cloud AI API (Cloudflare Worker) is reserved for multi-user commercial phase.
    """

    def __init__(self, cloud_url: str = "", user_id: str = "default"):
        # cloud_url is now optional — only used if explicitly set
        # (for future multi-user phase with Cloudflare Worker)
        self.cloud_url = cloud_url.rstrip("/") if cloud_url else ""
        self.user_id = user_id
        self._http_client = None
        self._llm_client = None

    def _get_llm(self):
        """Get LLM client (direct call, no cloud middleware)."""
        if self._llm_client is None:
            from .llm.router import get_client
            self._llm_client = get_client()
        return self._llm_client

    # ── Main chat entry point ──

    def chat(self, text: str) -> str:
        """Process user message locally, call cloud only for AI features."""
        text = text.strip()
        if not text:
            return "跟我说点什么吧 😊"

        intent_type, payload = intent.parse(text)

        if intent_type == intent.INTENT_HELP:
            return ai._help_text() if hasattr(ai, '_help_text') else self._help_text()

        elif intent_type == intent.INTENT_RECORD:
            return self._handle_record(payload)

        elif intent_type == intent.INTENT_ASK:
            return self._handle_ask()

        elif intent_type == intent.INTENT_DRAFT:
            return self._handle_draft(payload)

        elif intent_type == intent.INTENT_REPORT:
            return self._handle_report()

        elif intent_type == intent.INTENT_CHECK:
            return self._handle_check(payload)

        elif intent_type == intent.INTENT_QUERY:
            return self._handle_query()

        else:
            return self._fallback(text)

    # ── Record (记) — fully local ──

    def _handle_record(self, payload) -> str:
        contact_name = payload.get("contact")
        summary = payload.get("summary", payload.get("raw", ""))

        if contact_name:
            contact, _ = engine.resolve_contact(contact_name)
            if contact:
                engine.add_timeline(contact["id"], summary)
                todos = [t for t in engine.list_todos() if t.get("contact") == contact["id"]]
                lines = [f"✓ 记下了\n\n  联系人：{contact['name']}"]
                lines.append(f"  摘要：{summary[:60]}")
                if todos:
                    lines.append(f"\n  帮你记了条待办：")
                    lines.append(f"    🔴 {todos[0]['task'][:50]}")
                lines.append(f"\n  多记一点，我就能多帮你想到一点 🌱")
                return "\n".join(lines)
            else:
                cid = contact_name.lower().replace(" ", "_")
                engine.add_contact(cid, contact_name, nature=engine.NATURE_LEVERAGE)
                engine.add_timeline(cid, summary)
                return f"✓ 记下了\n\n  新联系人：{contact_name}\n  摘要：{summary[:60]}\n\n  下次可以告诉我更多关于他/她的事 🌱"
        else:
            return f"✓ 记下了：{summary[:60]}\n\n  你可以告诉我跟谁聊的，我帮你关联起来。"

    # ── Query (查) — stats and contact list, fully local ──

    def _handle_query(self) -> str:
        d = engine.get_dashboard()
        lines = [
            f"📊 你的关系网络概览\n",
            f"  联系人：{d['total_contacts']} 人",
            f"  待办事项：{d['pending_todos']} 条",
            f"  近期活动（7天）：{d['recent_activities']} 条",
            f"  即将生日（14天）：{len(d['upcoming_birthdays'])} 人",
        ]
        if d['leverage_suggestions']:
            lines.append(f"  待联系建议：{d['leverage_suggestions']} 人")
        if d['nurture_reminders']:
            lines.append(f"  陪伴提醒：{d['nurture_reminders']} 人")

        # List contacts if any
        contacts = engine.list_contacts()
        if contacts:
            lines.append(f"\n  联系人列表：")
            for c in contacts[:10]:
                nature = engine.infer_nature(c)
                role = engine.contact_role(c)
                lines.append(f"    · {c['name']} [{nature}] [{role}]")
            if len(contacts) > 10:
                lines.append(f"    …还有 {len(contacts) - 10} 人")

        lines.append(f"\n  试试 \"who to reach out\" 看看该联系谁 🌱")
        return "\n".join(lines)

    # ── Ask (问) — scoring local, AI formatting via LLM ──

    def _handle_ask(self) -> str:
        # Scoring is done locally
        leverage = engine.advise_leverage(top=5)
        nurture = engine.advise_nurture(days_ahead=14)

        # Build local formatting first
        parts = []
        if leverage:
            parts.append(ai.format_advise_leverage(leverage))
        if nurture:
            if parts:
                parts.append("")
            parts.append(ai.format_advise_nurture(nurture))
        if not parts:
            return "这周没有特别需要联系的。\n你可能已经联系过了 👍"

        local_text = "\n".join(parts)

        # Try LLM for enhanced formatting
        try:
            llm = self._get_llm()
            enhanced = llm.complete(local_text, system=ADVISE_SYSTEM_PROMPT)
            if enhanced:
                return enhanced
        except Exception:
            pass

        return local_text

    def _extract_advise_context(self, candidates):
        """Extract MINIMAL context for cloud — no full contact data."""
        return [{
            "name": c["contact"]["name"],
            "days_since": c["days_since"],
            "nature": engine.infer_nature(c["contact"]),
            "last_interaction": c.get("last_interaction", "")[:100],  # truncated
            "leverage_goals": (c.get("leverage") or {}).get("goals", []),
            "has_todo": c.get("has_todo", False),
        } for c in candidates]

    def _extract_nurture_context(self, reminders):
        """Extract MINIMAL context for nurture reminders."""
        return [{
            "name": r["contact"]["name"],
            "type": r["type"],
            "label": r.get("label", ""),
            "content": r.get("content", "")[:100],
        } for r in reminders]

    # ── Draft (拟) — context extraction local, LLM direct ──

    def _handle_draft(self, payload) -> str:
        target = payload.get("target", "")
        raw = payload.get("raw", "")
        context = raw.replace(target, "").replace("拟条消息", "").replace("draft a message to", "").strip()

        contact, _ = engine.resolve_contact(target)

        # Build prompt from minimal context (same privacy: only minimal info to LLM)
        prompt = self._build_draft_prompt(contact, target, context)

        # Try LLM directly
        try:
            llm = self._get_llm()
            draft = llm.complete(prompt, system=DRAFT_SYSTEM_PROMPT)
            if draft:
                return f"📝 帮你拟了一版\n\n{draft}\n\n觉得可以就说「确认」，想改哪里随时跟我说。"
        except Exception:
            pass

        # Fallback: local template
        draft = ai._template_draft(
            contact["name"] if contact else target,
            context,
            engine.infer_nature(contact) if contact else None
        )
        return f"📝 帮你拟了一版\n\n{draft}\n\n觉得可以就说「确认」，想改哪里随时跟我说。"

    def _build_draft_prompt(self, contact, target, user_context):
        """Build prompt with MINIMAL context — same privacy as cloud approach.

        Only includes: name, nature, 3 memory snippets (50 chars each),
        last interaction (100 chars), user context.
        Does NOT include: full contact record, all memories, platforms, notes.
        """
        parts = [f"Draft a message to {contact['name'] if contact else target}."]

        if contact:
            nature = engine.infer_nature(contact)
            if nature == "nurture":
                parts.append("This is a lifelong bond — be warm, no agenda.")
            elif nature == "leverage":
                parts.append("This is a professional tie — be respectful but purposeful.")

            memories = [m["content"][:50] for m in contact.get("memories", [])[:3]]
            if memories:
                parts.append(f"What I remember: {'; '.join(memories)}")

            tls = engine.list_timeline(contact["id"], days=90)
            if tls:
                parts.append(f"Last interaction: {tls[0]['summary'][:100]}")

        if user_context:
            parts.append(f"Context: {user_context}")

        return "\n".join(parts)

    # ── Report (报) — fully local ──

    def _handle_report(self) -> str:
        dash = engine.role_dashboard()
        return ai.format_role_dashboard(dash)

    # ── Check (问 bond) — fully local ──

    def _handle_check(self, payload) -> str:
        target = payload.get("target", "")
        return ai.format_nurture_check(target)

    # ── Encryption / Export ──

    def export_data(self, password: str = "") -> dict:
        """Export all local data as a portable dict.

        If password is provided, the data is encrypted.
        The export contains ONLY local data — no cloud dependencies.
        """
        from .engine import CONTACTS_FILE, TIMELINE_FILE, TODOS_FILE, USAGE_FILE

        data = {
            "version": "1.0",
            "exported_at": date.today().isoformat(),
            "contacts": engine._load(CONTACTS_FILE),
            "timeline": engine._load(TIMELINE_FILE),
            "todos": engine._load(TODOS_FILE),
        }
        usage_path = USAGE_FILE
        if usage_path.exists():
            data["usage"] = json.loads(usage_path.read_text())

        if password:
            data = self._encrypt(data, password)

        return data

    def import_data(self, data: dict, password: str = "") -> bool:
        """Import data from an export dict."""
        if password:
            data = self._decrypt(data, password)
        if not isinstance(data, dict) or "version" not in data:
            return False

        from .engine import CONTACTS_FILE, TIMELINE_FILE, TODOS_FILE, _save, USAGE_FILE

        _save(CONTACTS_FILE, data.get("contacts", []))
        _save(TIMELINE_FILE, data.get("timeline", []))
        _save(TODOS_FILE, data.get("todos", []))
        if "usage" in data:
            USAGE_FILE.write_text(json.dumps(data["usage"], ensure_ascii=False, indent=2))
        return True

    def _encrypt(self, data: dict, password: str) -> dict:
        """Encrypt data with password using Fernet symmetric encryption."""
        try:
            from cryptography.fernet import Fernet
            import hashlib, base64
            key = base64.urlsafe_b64encode(hashlib.sha256(password.encode()).digest())
            f = Fernet(key)
            plaintext = json.dumps(data, ensure_ascii=False).encode()
            ciphertext = f.encrypt(plaintext).decode()
            return {"encrypted": True, "data": ciphertext}
        except ImportError:
            # Fallback: base64 (not secure, but portable)
            import base64
            plaintext = json.dumps(data, ensure_ascii=False).encode()
            return {"encrypted": True, "data": base64.b64encode(plaintext).decode(), "weak": True}

    def _decrypt(self, data: dict, password: str) -> dict:
        if not data.get("encrypted"):
            return data
        try:
            from cryptography.fernet import Fernet
            import hashlib, base64
            key = base64.urlsafe_b64encode(hashlib.sha256(password.encode()).digest())
            f = Fernet(key)
            plaintext = f.decrypt(data["data"].encode()).decode()
            return json.loads(plaintext)
        except ImportError:
            import base64
            return json.loads(base64.b64decode(data["data"].encode()).decode())

    # ── Helpers ──

    def _fallback(self, text: str) -> str:
        # Try LLM for free-form conversation
        try:
            llm = self._get_llm()
            dashboard = engine.get_dashboard()
            context = (f"你是 Welian，一个关系管理 AI 助手。\n"
                      f"用户数据概览：{dashboard['total_contacts']} 个联系人，"
                      f"{dashboard['pending_todos']} 条待办，"
                      f"{dashboard['recent_activities']} 条近期活动。\n"
                      f"用户说：{text}\n"
                      f"请用中文简短回复。如果用户在问数据相关问题，直接回答。"
                      f"如果用户在闲聊，自然回应并引导到关系管理话题。")
            return llm.chat(context, system="你是 Welian，简洁友好地回复。")
        except Exception:
            pass
        # No LLM available — be honest, don't pretend to record
        return (f"我能帮你管理关系：\n\n"
                f"  · \"who to reach out\" — 这周该联系谁\n"
                f"  · \"note: met with X about Y\" — 记一下\n"
                f"  · \"draft a message to X\" — 拟条消息\n"
                f"  · \"how is X doing\" — 看看一段关系\n"
                f"  · \"monthly review\" — 这个月的你\n"
                f"  · \"有多少联系人\" — 查看联系人\n\n"
                f"你想做什么？")

    def _help_text(self) -> str:
        return ("你可以跟我说：\n\n"
                "  · \"note: met with X about Y\" — 帮你记下来\n"
                "  · \"who to reach out\" — 帮你想清楚\n"
                "  · \"draft a message to X\" — 帮你拟好话\n"
                "  · \"how is X doing\" — 帮你回顾一段关系\n"
                "  · \"monthly review\" — 看看这个月的自己\n\n"
                "  为目标联结的关系：该联系谁+为什么+聊什么\n"
                "  值得陪伴的关系：记得他在乎的事+重要时刻在场\n\n"
                "  试试看 😊")


# ── LLM system prompts ──

DRAFT_SYSTEM_PROMPT = """You are Welian, an AI companion that helps people be better friends, family members, and collaborators.

Draft a short, natural message. Return ONLY the message text.
- For nurture relationships: warm, no agenda, just reaching out
- For leverage relationships: respectful but purposeful
- Keep it under 80 characters, like a real text message"""

ADVISE_SYSTEM_PROMPT = """You are Welian. Format relationship suggestions in a warm, human way.
- For leverage ties: who + why + what to talk about
- For nurture bonds: gentle reminders, no urgency, no scores
Return formatted text only."""
