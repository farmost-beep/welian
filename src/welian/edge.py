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
        self._conversation: list = []  # multi-turn chat history

    def _get_llm(self):
        """Get LLM client (direct call, no cloud middleware)."""
        if self._llm_client is None:
            from .llm.router import get_client
            self._llm_client = get_client()
        return self._llm_client

    # ── Main chat entry point ──

    def chat(self, text: str) -> str:
        """Process user message: LLM is the primary processor.

        Flow:
        1. LLM identifies intent + extracts entities
        2. Local data operations (save record, gather context)
        3. LLM generates final response with data context + conversation history

        All responses go through LLM for natural language.
        """
        text = text.strip()
        if not text:
            return "跟我说点什么吧 😊"

        # Step 1: LLM intent detection
        intent_type, payload = intent.parse(text)

        # Step 2: Local side effects + gather data context
        data_context = self._gather_context(intent_type, payload, text)

        # Step 3: LLM generates response with data context + conversation history
        try:
            reply = self._llm_respond(text, intent_type, payload, data_context)
            # Save turn to conversation history (after successful response)
            self._conversation.append({"role": "user", "content": text})
            self._conversation.append({"role": "assistant", "content": reply})
            # Keep last 20 turns to avoid token overflow
            if len(self._conversation) > 40:
                self._conversation = self._conversation[-40:]
            return reply
        except Exception:
            # Fallback to template responses if LLM fails
            return self._template_respond(intent_type, payload, text)

    def _gather_context(self, intent_type, payload, text) -> str:
        """Gather relevant local data based on intent. Side effects for record."""
        from datetime import date

        if intent_type == intent.INTENT_RECORD:
            return self._gather_record(payload)

        if intent_type == intent.INTENT_TODO:
            return self._gather_todo()

        if intent_type == intent.INTENT_ASK:
            return self._gather_ask()

        if intent_type == intent.INTENT_QUERY:
            return self._gather_query()

        if intent_type == intent.INTENT_CHECK:
            return self._gather_check(payload)

        if intent_type == intent.INTENT_DRAFT:
            return self._gather_draft(payload)

        if intent_type == intent.INTENT_ALIAS:
            return self._gather_alias(payload)

        if intent_type == intent.INTENT_REPORT:
            return self._gather_report()

        # chat / help / unknown — minimal context
        return self._gather_overview()

    def _llm_respond(self, text, intent_type, payload, data_context) -> str:
        """LLM generates the final response with data context + conversation history."""
        llm = self._get_llm()

        system = """你是 Welian，一个关系管理 AI 助手。你帮用户管理社交关系、记录互动、提醒待办、拟写消息。

你的风格：
- 简洁友好，像朋友在聊天
- 中文回复，适当用 emoji
- 回复不要太长，重点突出
- 如果用户在记录事情，确认记下了并简要复述
- 如果用户在查待办，清晰列出，按紧急程度分组
- 如果用户在闲聊，自然回应，可以引导到关系管理话题

你会收到用户的原始消息和相关数据上下文。请基于数据回答，不要编造。
对话是连续的，请结合上下文理解用户的意图。"""

        prompt = f"""用户消息：{text}

相关数据：
{data_context}

请根据用户的消息和上面的数据，生成回复。直接回复内容，不要加"回复："之类的前缀。"""

        return llm.complete(prompt, system=system, messages=self._conversation)

    def _template_respond(self, intent_type, payload, text) -> str:
        """Fallback template responses when LLM is unavailable."""
        if intent_type == intent.INTENT_HELP:
            return self._help_text()
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
        elif intent_type == intent.INTENT_TODO:
            return self._handle_todo()
        elif intent_type == intent.INTENT_ALIAS:
            return self._gather_alias(payload)
        else:
            return self._fallback(text)

    # ── Data gatherers (local, no LLM) ──

    def _gather_overview(self) -> str:
        """Minimal overview for chat/help."""
        d = engine.get_dashboard()
        return (f"联系人：{d['total_contacts']}人，"
                f"待办：{d['pending_todos']}条，"
                f"近期活动：{d['recent_activities']}条")

    def _gather_record(self, payload) -> str:
        """Save record to local storage, return context for LLM confirmation.

        SPEC §6.2 AI记录增强: auto-suggest nature type + extract sentiment.
        """
        contact_name = payload.get("contact")
        summary = payload.get("summary", payload.get("raw", ""))

        if contact_name:
            contact, _ = engine.resolve_contact(contact_name)
            if contact:
                engine.add_timeline(contact["id"], summary)
                todos = [t for t in engine.list_todos()
                         if t.get("contact") == contact["id"] and t.get("status") == "pending"]

                # AI enhancement: suggest nature if unclassified
                nature_suggestion = self._suggest_nature(contact, summary)

                todo_info = ""
                if todos:
                    todo_info = f"\n相关待办：{todos[0]['task'][:60]}"

                nature_info = ""
                if nature_suggestion:
                    nature_info = f"\n关系类型建议：{nature_suggestion}"

                return (f"已记录到联系人「{contact['name']}」的时间线。\n"
                        f"摘要：{summary}\n{todo_info}{nature_info}\n"
                        f"记录已保存。")
            else:
                cid = contact_name.lower().replace(" ", "_")
                suggested_nature = engine.auto_classify_nature({
                    "name": contact_name, "notes": summary, "tags": [], "relation": ""
                })
                engine.add_contact(cid, contact_name, nature=suggested_nature)
                engine.add_timeline(cid, summary)
                nature_label = "维系型" if suggested_nature == engine.NATURE_NURTURE else "撬动型"
                return (f"新建联系人「{contact_name}」并记录。\n"
                        f"摘要：{summary}\n"
                        f"关系类型：{nature_label}（可调整）\n"
                        f"记录已保存。")
        else:
            return f"记录内容：{summary}\n（未关联到具体联系人）\n记录已保存。"

    def _suggest_nature(self, contact, summary) -> str:
        """SPEC §6.2: AI suggests relationship type based on interaction content.

        Returns suggestion text or empty string if no suggestion needed.
        """
        current_nature = engine.infer_nature(contact)
        if current_nature != engine.NATURE_LEVERAGE:
            return ""  # Already classified as nurture/dual, no need

        # Heuristic: check if interaction content suggests nurture
        nurture_signals = ["父亲", "母亲", "爸妈", "老婆", "老公", "儿子", "女儿",
                          "生日", "手术", "住院", "搬家", "结婚", "纪念日",
                          "老友", "同学", "室友", "邻居", "陪伴", "想念"]
        text = (summary or "").lower()
        if any(kw in text for kw in nurture_signals):
            return "这段关系像是维系型（家人/挚友），要改成维系型吗？"

        # LLM-based suggestion (if heuristics don't trigger)
        try:
            llm = self._get_llm()
            prompt = (f"联系人：{contact.get('name', '')}\n"
                     f"现有标签：{contact.get('tags', [])}\n"
                     f"互动内容：{summary[:100]}\n"
                     f"这个关系更像是「撬动型」（职业社交、目标联结）还是「维系型」（家人、挚友、情感纽带）？"
                     f"只回答「撬动型」或「维系型」或「不确定」。")
            resp = llm.complete(prompt, system="你是关系分类助手，只回答一个词。", max_tokens=10, temperature=0)
            resp = resp.strip()
            if "维系" in resp:
                return "这段关系像是维系型（家人/挚友），要改成维系型吗？"
        except Exception:
            pass

        return ""

    def _ai_enhance_record(self, contact, summary) -> dict:
        """SPEC §6.2: AI record enhancement — extract sentiment + key info.

        Returns dict with: sentiment, key_points, suggested_todo.
        """
        try:
            llm = self._get_llm()
            prompt = (f"分析这条互动记录，提取关键信息：\n"
                     f"联系人：{contact.get('name', '')}\n"
                     f"内容：{summary}\n\n"
                     f"返回JSON：{{\"sentiment\": \"positive/neutral/negative\", "
                     f"\"key_points\": [\"要点1\", \"要点2\"], "
                     f"\"suggested_todo\": \"待办事项或空\"}}")
            resp = llm.complete(prompt, system="你是记录分析助手，只返回JSON。", max_tokens=200, temperature=0)
            resp = resp.strip()
            if resp.startswith("```"):
                import re
                resp = re.sub(r"^```(?:json)?\s*", "", resp)
                resp = re.sub(r"\s*```$", "", resp)
            return json.loads(resp)
        except Exception:
            return {"sentiment": "neutral", "key_points": [], "suggested_todo": ""}

    def _gather_todo(self) -> str:
        """Gather todo list for LLM formatting."""
        todos = [t for t in engine.list_todos() if t.get("status") == "pending"]
        if not todos:
            return "当前没有待办事项。"

        today = date.today()
        sections = {"overdue": [], "today": [], "this_week": [], "later": []}

        for t in todos:
            due = t.get("due", "")
            task = t.get("task", t.get("content", ""))
            contact = t.get("contact", "")
            if not due:
                sections["later"].append(f"  · [{contact}] {task}")
                continue
            try:
                due_date = date.fromisoformat(due[:10])
                delta = (due_date - today).days
                entry = f"  · [{contact}] {task}（{due[:10]}）"
                if delta < 0:
                    sections["overdue"].append(f"  · [{contact}] {task}（超期{-delta}天）")
                elif delta == 0:
                    sections["today"].append(f"  · [{contact}] {task}")
                elif delta <= 7:
                    sections["this_week"].append(f"  · [{contact}] {task}（{delta}天后）")
                else:
                    sections["later"].append(entry)
            except (ValueError, TypeError):
                sections["later"].append(f"  · [{contact}] {task}")

        parts = [f"共 {len(todos)} 条待办"]
        if sections["overdue"]:
            parts.append("已超期：\n" + "\n".join(sections["overdue"]))
        if sections["today"]:
            parts.append("今天：\n" + "\n".join(sections["today"]))
        if sections["this_week"]:
            parts.append("本周内：\n" + "\n".join(sections["this_week"]))
        if sections["later"]:
            parts.append("之后：\n" + "\n".join(sections["later"][:10]))
        return "\n\n".join(parts)

    def _gather_ask(self) -> str:
        """Gather contact suggestions for LLM formatting."""
        leverage = engine.advise_leverage(top=5)
        nurture = engine.advise_nurture(days_ahead=14)

        parts = []
        if leverage:
            lines = ["建议联系（目标联结）："]
            for c in leverage:
                name = c["contact"]["name"]
                days = c["days_since"]
                nature = engine.infer_nature(c["contact"])
                last = c.get("last_interaction", "")[:60]
                lines.append(f"  · {name}（{days}天未联系）上次：{last}")
            parts.append("\n".join(lines))

        if nurture:
            lines = ["陪伴提醒（值得陪伴）："]
            for r in nurture:
                name = r["contact"]["name"]
                rtype = r["type"]
                label = r.get("label", "")
                content = r.get("content", "")[:60]
                lines.append(f"  · {name} — {rtype}：{label} {content}")
            parts.append("\n".join(lines))

        if not parts:
            return "本周没有特别需要联系的。"
        return "\n\n".join(parts)

    def _gather_query(self) -> str:
        """Gather dashboard data for LLM formatting."""
        d = engine.get_dashboard()
        contacts = engine.list_contacts()
        contact_list = "\n".join(
            f"  · {c['name']} [{engine.infer_nature(c)}] [{engine.contact_role(c)}]"
            for c in contacts[:15]
        )
        return (f"联系人：{d['total_contacts']}人\n"
                f"待办：{d['pending_todos']}条\n"
                f"近期活动：{d['recent_activities']}条\n"
                f"即将生日：{len(d['upcoming_birthdays'])}人\n"
                f"联系人列表：\n{contact_list}")

    def _gather_check(self, payload) -> str:
        """Gather contact relationship info for LLM formatting."""
        target = payload.get("target", "")
        contact, _ = engine.resolve_contact(target)
        if not contact:
            return f"未找到联系人「{target}」。"

        nature = engine.infer_nature(contact)
        role = engine.contact_role(contact)
        memories = [m["content"][:60] for m in contact.get("memories", [])[:5]]
        tls = engine.list_timeline(contact["id"], days=180)
        todos = [t for t in engine.list_todos()
                 if t.get("contact") == contact["id"] and t.get("status") == "pending"]

        parts = [f"联系人：{contact['name']}"]
        parts.append(f"关系类型：{nature}（角色：{role}）")
        if memories:
            parts.append(f"记忆：\n" + "\n".join(f"  · {m}" for m in memories))
        if tls:
            parts.append(f"近期互动：\n" + "\n".join(f"  · {t['summary'][:60]}" for t in tls[:5]))
        if todos:
            parts.append(f"相关待办：\n" + "\n".join(f"  · {t['task'][:60]}" for t in todos[:3]))
        return "\n".join(parts)

    def _gather_draft(self, payload) -> str:
        """Gather context for drafting a message."""
        target = payload.get("target", "")
        raw = payload.get("raw", "")
        context = raw.replace(target, "").replace("拟条消息", "").replace("draft a message to", "").strip()
        contact, _ = engine.resolve_contact(target)

        if contact:
            nature = engine.infer_nature(contact)
            memories = [m["content"][:50] for m in contact.get("memories", [])[:3]]
            tls = engine.list_timeline(contact["id"], days=90)
            last = tls[0]["summary"][:100] if tls else "无"
            return (f"收件人：{contact['name']}\n"
                    f"关系类型：{nature}\n"
                    f"记忆：{'; '.join(memories) if memories else '无'}\n"
                    f"上次互动：{last}\n"
                    f"用户补充背景：{context}")
        else:
            return f"收件人：{target}（未在联系人中）\n背景：{context}"

    def _gather_report(self) -> str:
        """Gather dashboard report data for LLM formatting."""
        dash = engine.role_dashboard()
        parts = ["角色仪表盘："]
        for role, data in dash.items():
            parts.append(f"  {role}: {data.get('count', 0)}人")
            if data.get('highlights'):
                for h in data['highlights'][:3]:
                    parts.append(f"    · {h}")
        return "\n".join(parts)

    def _gather_alias(self, payload) -> str:
        """Set alias for a contact. Side effect: saves alias, merges duplicate contact."""
        alias_name = payload.get("alias", "")
        contact_name = payload.get("contact", "")

        if not alias_name or not contact_name:
            return "设置别名失败：缺少别名或联系人名。"

        # Resolve the real contact
        contact, match_type = engine.resolve_contact(contact_name)
        if not contact:
            return f"未找到联系人「{contact_name}」。请先确认联系人名。"

        # Add alias to contact
        existing_aliases = contact.get("alias", []) or []
        if alias_name not in existing_aliases:
            existing_aliases.append(alias_name)
            engine.update_contact(contact["id"], {"alias": existing_aliases})

        # Check if alias_name is itself a separate contact — if so, merge it
        alias_contact, alias_match = engine.resolve_contact(alias_name)
        merge_info = ""
        if alias_contact and alias_contact["id"] != contact["id"]:
            # Merge: copy timeline/memories/todos from alias contact to real contact
            from . import engine as eng
            # Copy timeline
            alias_timeline = eng.list_timeline(alias_contact["id"], days=99999)
            for tl in alias_timeline:
                eng.add_timeline(contact["id"], tl["summary"])
            # Copy memories
            alias_memories = alias_contact.get("memories", []) or []
            real_memories = contact.get("memories", []) or []
            for m in alias_memories:
                if m not in real_memories:
                    real_memories.append(m)
            if alias_memories:
                eng.update_contact(contact["id"], {"memories": real_memories})
            # Copy todos
            all_todos = eng.list_todos()
            for t in all_todos:
                if t.get("contact") == alias_contact["id"]:
                    t["contact"] = contact["id"]
            eng._save(eng.TODOS_FILE, all_todos)
            # Delete the duplicate contact
            contacts = eng._load(eng.CONTACTS_FILE)
            contacts = [c for c in contacts if c["id"] != alias_contact["id"]]
            eng._save(eng.CONTACTS_FILE, contacts)
            merge_info = f"\n已将「{alias_contact['name']}」的数据合并到「{contact['name']}」并删除重复联系人。"

        return (f"已为联系人「{contact['name']}」添加别名「{alias_name}」。\n"
                f"以后说「{alias_name}」就能找到「{contact['name']}」了。{merge_info}\n"
                f"别名已保存。")

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

    # ── Todo (待办) — fully local ──

    def _handle_todo(self) -> str:
        """List upcoming pending todos, sorted by due date."""
        todos = [t for t in engine.list_todos() if t.get("status") == "pending"]
        if not todos:
            return "目前没有待办事项 👍\n\n试试 \"该联系谁\" 看看有什么安排"

        # Sort by due date (empty due goes last)
        def sort_key(t):
            due = t.get("due", "")
            return (due is None or due == "", due or "")
        todos.sort(key=sort_key)

        today = date.today()
        lines = [f"📋 近期待办（{len(todos)} 条）\n"]

        # Group by urgency
        overdue = []
        today_items = []
        this_week = []
        later = []

        for t in todos:
            due = t.get("due", "")
            if not due:
                later.append(t)
                continue
            try:
                due_date = date.fromisoformat(due[:10])
                delta = (due_date - today).days
                if delta < 0:
                    overdue.append((t, delta))
                elif delta == 0:
                    today_items.append(t)
                elif delta <= 7:
                    this_week.append((t, delta))
                else:
                    later.append(t)
            except (ValueError, TypeError):
                later.append(t)

        if overdue:
            lines.append("🔴 已超期")
            for t, delta in overdue:
                contact = t.get("contact", "")
                task = t.get("task", t.get("content", ""))
                lines.append(f"  · [{contact}] {task[:50]}（超期{-delta}天）")
            lines.append("")

        if today_items:
            lines.append("📌 今天")
            for t in today_items:
                contact = t.get("contact", "")
                task = t.get("task", t.get("content", ""))
                lines.append(f"  · [{contact}] {task[:50]}")
            lines.append("")

        if this_week:
            lines.append("📅 本周内")
            for t, delta in this_week:
                contact = t.get("contact", "")
                task = t.get("task", t.get("content", ""))
                lines.append(f"  · [{contact}] {task[:50]}（{delta}天后）")
            lines.append("")

        if later:
            lines.append("📋 之后")
            for t in later[:10]:
                contact = t.get("contact", "")
                task = t.get("task", t.get("content", ""))
                due = t.get("due", "")
                due_str = f"（{due[:10]}）" if due else ""
                lines.append(f"  · [{contact}] {task[:50]}{due_str}")
            if len(later) > 10:
                lines.append(f"  …还有 {len(later) - 10} 条")

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
            return llm.complete(context, system="你是 Welian，简洁友好地回复。", messages=self._conversation)
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
                "  · \"monthly review\" — 看看这个月的自己\n"
                "  · \"帮我锚定X\" — AI建议目标联结\n"
                "  · \"批量锚定\" — 批量AI建议锚定\n\n"
                "  为目标联结的关系：该联系谁+为什么+聊什么\n"
                "  值得陪伴的关系：记得他在乎的事+重要时刻在场\n\n"
                "  试试看 😊")

    # ── Anchor assistant (SPEC §6.2 目标锚定助手) ──

    def suggest_anchor(self, contact_id) -> dict:
        """AI suggests leverage anchor for a contact (SPEC §6.2).

        Returns dict with: goals, how, direction, nature_suggestion.
        """
        contact = engine.get_contact(contact_id)
        if not contact:
            return {"error": f"Contact not found: {contact_id}"}

        # Gather minimal context for AI
        tags = contact.get("tags", [])
        notes = (contact.get("notes") or "")[:200]
        relation = contact.get("relation") or contact.get("role") or ""
        tls = engine.list_timeline(contact_id, days=180)
        recent = [t["summary"][:60] for t in tls[:3]]
        memories = [m["content"][:50] for m in contact.get("memories", [])[:3]]

        try:
            llm = self._get_llm()
            prompt = (f"联系人：{contact['name']}\n"
                     f"标签：{tags}\n"
                     f"关系：{relation}\n"
                     f"备注：{notes}\n"
                     f"近期互动：{recent}\n"
                     f"记忆：{memories}\n\n"
                     f"请为这个联系人建议目标锚定。返回JSON：\n"
                     f'{{"goals": ["目标1"], "how": "具体怎么联结", '
                     f'"direction": "互惠/给予/索取/报恩", '
                     f'"nature": "leverage/nurture/dual"}}\n'
                     f"只返回JSON，不要其他文字。")
            resp = llm.complete(prompt, system="你是关系锚定助手，基于信息建议目标联结。只返回JSON。",
                               max_tokens=200, temperature=0)
            resp = resp.strip()
            if resp.startswith("```"):
                import re
                resp = re.sub(r"^```(?:json)?\s*", "", resp)
                resp = re.sub(r"\s*```$", "", resp)
            return json.loads(resp)
        except Exception as e:
            # Fallback: rule-based suggestion
            return self._rule_based_anchor(contact, tags, relation)

    def _rule_based_anchor(self, contact, tags, relation) -> dict:
        """Fallback: rule-based anchor suggestion using tags/relation."""
        tag_str = " ".join(t.lower() for t in tags)

        # Cluster-based suggestions (ROADMAP §3.3)
        if "民建" in tag_str:
            return {"goals": ["事业", "政策"], "how": "民建人脉+政策信息交流",
                    "direction": "互惠", "nature": "leverage"}
        if "邮储" in tag_str or "ustc" in tag_str:
            return {"goals": ["事业", "知识"], "how": "校友/同事资源网络",
                    "direction": "互惠", "nature": "leverage"}
        if "投资" in tag_str or "vc" in tag_str:
            return {"goals": ["投资"], "how": "项目引荐+行业洞察",
                    "direction": "互惠", "nature": "leverage"}
        if "ai" in tag_str or "技术" in tag_str:
            return {"goals": ["AI能力"], "how": "技术交流+能力互补",
                    "direction": "互惠", "nature": "leverage"}

        # Default
        return {"goals": ["事业"], "how": "行业资源交流", "direction": "互惠",
                "nature": "leverage"}

    def batch_suggest_anchors(self, strength_min=3, limit=20) -> list:
        """Batch suggest anchors for unanchored core contacts (SPEC §6.2).

        SPEC §3.2.2: prioritize by strength, use cluster-based suggestions.
        Returns list of {contact_id, name, suggestion}.
        """
        contacts = engine.list_contacts()
        unanchored = []
        for c in contacts:
            if c.get("relation") == "self":
                continue
            if c.get("strength", 0) < strength_min:
                continue
            lev = c.get("leverage") or {}
            if not lev.get("confirmed"):
                unanchored.append(c)

        # Sort by strength descending
        unanchored.sort(key=lambda c: -c.get("strength", 0))
        results = []
        for c in unanchored[:limit]:
            suggestion = self.suggest_anchor(c["id"])
            results.append({
                "contact_id": c["id"],
                "name": c["name"],
                "strength": c.get("strength", 0),
                "tags": c.get("tags", []),
                "suggestion": suggestion,
            })
        return results

    def apply_anchor(self, contact_id, suggestion) -> tuple:
        """Apply an AI-suggested anchor after user confirmation.

        Returns (ok, message).
        """
        if "error" in suggestion:
            return False, suggestion["error"]

        nature = suggestion.get("nature", "leverage")
        if nature in engine.VALID_NATURES:
            engine.set_nature(contact_id, nature)

        if nature in (engine.NATURE_LEVERAGE, engine.NATURE_DUAL):
            goals = suggestion.get("goals", [])
            how = suggestion.get("how", "")
            direction = suggestion.get("direction", "互惠")
            ok, msg = engine.set_leverage(contact_id, goals, how, direction)
            if ok:
                return True, f"✓ 已锚定「{engine.get_contact(contact_id)['name']}」\n  目标：{goals}\n  联结方式：{how}\n  方向：{direction}"
            return False, msg

        return True, f"✓ 已设置「{engine.get_contact(contact_id)['name']}」为维系型关系"


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
