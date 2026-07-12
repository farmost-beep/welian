"""FastAPI server — HTTP API for welian.app and WeChat bot.

Endpoints:
- POST /chat          — main chat endpoint (natural language in, response out)
- GET  /dashboard     — role dashboard data
- GET  /contacts      — list contacts
- GET  /balance       — token balance
- GET  /health        — health check
"""
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from .. import engine, intent, ai, tokens

app = FastAPI(title="Welian API", version="1.0.0")

# CORS — allow welian.app and localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://welian.app", "http://localhost:*", "http://127.0.0.1:*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ──

class ChatRequest(BaseModel):
    message: str
    user_id: str = "default"

class ChatResponse(BaseModel):
    reply: str
    intent: str
    tokens_used: int = 0
    tokens_remaining: int = 0

# ── Routes ──

@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}

@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Main chat endpoint — processes natural language and returns Welian's reply."""
    text = req.message.strip()
    if not text:
        return ChatResponse(reply="跟我说点什么吧 😊", intent="empty")

    intent_type, payload = intent.parse(text)
    tokens_used = 0

    if intent_type == intent.INTENT_HELP:
        reply = _help_text()

    elif intent_type == intent.INTENT_RECORD:
        reply = _handle_record(payload, req.user_id)
        tokens_used = 1

    elif intent_type == intent.INTENT_ASK:
        reply = _handle_ask(req.user_id)
        tokens_used = 3

    elif intent_type == intent.INTENT_DRAFT:
        reply = _handle_draft(payload, req.user_id)
        tokens_used = 2

    elif intent_type == intent.INTENT_REPORT:
        reply = _handle_report(req.user_id)
        tokens_used = 5

    elif intent_type == intent.INTENT_CHECK:
        reply = _handle_check(payload)
        tokens_used = 0  # checking is free

    else:
        reply = _fallback(text)

    # Consume tokens
    remaining = 0
    if tokens_used > 0:
        ok, remaining, msg = tokens.consume(req.user_id, _intent_to_feature(intent_type))
        if not ok:
            reply = msg
            tokens_used = 0
    else:
        bal = tokens.get_balance(req.user_id)
        remaining = bal["remaining"]

    return ChatResponse(
        reply=reply,
        intent=intent_type,
        tokens_used=tokens_used,
        tokens_remaining=remaining,
    )

@app.get("/dashboard")
async def dashboard(user_id: str = "default"):
    """Get role dashboard data."""
    return engine.role_dashboard()

@app.get("/contacts")
async def contacts(nature: Optional[str] = None, role: Optional[str] = None):
    """List contacts, optionally filtered."""
    return engine.list_contacts(nature=nature, role=role)

@app.get("/balance")
async def balance(user_id: str = "default"):
    """Get token balance."""
    return tokens.get_balance(user_id)

# ── Handlers ──

def _handle_record(payload, user_id):
    contact_name = payload.get("contact")
    summary = payload.get("summary", payload.get("raw", ""))

    if contact_name:
        contact, _ = engine.resolve_contact(contact_name)
        if contact:
            engine.add_timeline(contact["id"], summary)
            # Check for pending todo
            todos = [t for t in engine.list_todos() if t.get("contact") == contact["id"]]
            lines = [f"✓ 记下了\n\n  联系人：{contact['name']}"]
            lines.append(f"  时间：{date.today().isoformat()}" if False else f"  摘要：{summary[:60]}")
            if todos:
                lines.append(f"\n  帮你记了条待办：")
                lines.append(f"    🔴 {todos[0]['task'][:50]}")
            lines.append(f"\n  多记一点，我就能多帮你想到一点 🌱")
            return "\n".join(lines)
        else:
            # Create contact on the fly
            cid = contact_name.lower().replace(" ", "_")
            engine.add_contact(cid, contact_name, nature=engine.NATURE_LEVERAGE)
            engine.add_timeline(cid, summary)
            return f"✓ 记下了\n\n  新联系人：{contact_name}\n  摘要：{summary[:60]}\n\n  下次可以告诉我更多关于他/她的事 🌱"
    else:
        # No contact identified, just record
        return f"✓ 记下了：{summary[:60]}\n\n  你可以告诉我跟谁聊的，我帮你关联起来。"

def _handle_ask(user_id):
    leverage = engine.advise_leverage(top=5)
    nurture = engine.advise_nurture(days_ahead=14)
    parts = []
    if leverage:
        parts.append(ai.format_advise_leverage(leverage))
    if nurture:
        if parts:
            parts.append("")
        parts.append(ai.format_advise_nurture(nurture))
    if not parts:
        return "这周没有特别需要联系的。\n你可能已经联系过了 👍"
    return "\n".join(parts)

def _handle_draft(payload, user_id):
    target = payload.get("target", "")
    raw = payload.get("raw", "")
    # Try to extract context from raw
    context = raw.replace(target, "").replace("拟条消息", "").replace("draft a message to", "").strip()
    draft = ai.draft_message(target, context=context)
    return f"📝 帮你拟了一版\n\n{draft}\n\n觉得可以就说「确认」，想改哪里随时跟我说。"

def _handle_report(user_id):
    dash = engine.role_dashboard()
    return ai.format_role_dashboard(dash)

def _handle_check(payload):
    target = payload.get("target", "")
    return ai.format_nurture_check(target)

def _fallback(text):
    return (f"你说的「{text[:30]}」我记下了 😊\n\n"
            f"你可以试试这些：\n"
            f"  · \"who to reach out\" — 这周该联系谁\n"
            f"  · \"note: met with X about Y\" — 记一下\n"
            f"  · \"draft a message to X\" — 拟条消息\n"
            f"  · \"how is X doing\" — 看看一段关系\n"
            f"  · \"monthly review\" — 这个月的你")

def _help_text():
    return ("你可以跟我说：\n\n"
            "  · \"note: met with X about Y\" — 帮你记下来\n"
            "  · \"who to reach out\" — 帮你想清楚\n"
            "  · \"draft a message to X\" — 帮你拟好话\n"
            "  · \"how is X doing\" — 帮你回顾一段关系\n"
            "  · \"monthly review\" — 看看这个月的自己\n\n"
            "  为目标联结的关系：该联系谁+为什么+聊什么\n"
            "  值得陪伴的关系：记得他在乎的事+重要时刻在场\n\n"
            "  试试看 😊")

def _intent_to_feature(intent_type):
    return {
        intent.INTENT_RECORD: "ai_record_enhance",
        intent.INTENT_ASK: "advise_engine",
        intent.INTENT_DRAFT: "ai_draft",
        intent.INTENT_REPORT: "role_dashboard",
    }.get(intent_type, "ai_record_enhance")

# Import date for record handler
from datetime import date
