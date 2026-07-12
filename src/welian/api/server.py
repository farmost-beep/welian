"""Welian cloud API — AI-only, no data storage.

SPEC §7.1: 数据归你，智能来云。

The cloud receives ONLY minimal context snippets from the edge client.
It never sees full contacts.json, timeline.json, or any user data.
It processes AI requests and returns results. Nothing is stored.

Endpoints:
- POST /ai/draft     — draft a message from minimal context
- POST /ai/extract   — extract todos/key_points from interaction text
- POST /ai/advise    — format advise from candidate list (no scoring)
- GET  /health       — health check
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List

from ..llm.router import get_client

app = FastAPI(title="Welian Cloud API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Edge clients from anywhere
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ──

class DraftRequest(BaseModel):
    name: str
    nature: Optional[str] = None
    memories: List[str] = []
    last_interaction: str = ""
    user_context: str = ""
    tone: str = "warm"

class DraftResponse(BaseModel):
    result: str

class ExtractRequest(BaseModel):
    interaction_text: str
    contact_name: str = ""

class ExtractResponse(BaseModel):
    result: dict  # {"pending": str, "key_points": [str]}

class AdviseRequest(BaseModel):
    leverage: List[dict] = []
    nurture: List[dict] = []

class AdviseResponse(BaseModel):
    result: str

# ── System prompts ──

DRAFT_SYSTEM = """You are Welian, an AI companion that helps people be better friends, family members, and collaborators.

Draft a short, natural message. Return ONLY the message text.
- For nurture relationships: warm, no agenda, just reaching out
- For leverage relationships: respectful but purposeful
- Keep it under 80 characters, like a real text message"""

EXTRACT_SYSTEM = """Extract actionable items from an interaction record.
Return JSON: {"pending": "follow-up task or empty", "key_points": ["point1", "point2"]}
Be concise. Only extract real action items."""

ADVISE_SYSTEM = """You are Welian. Format relationship suggestions in a warm, human way.
- For leverage ties: who + why + what to talk about
- For nurture bonds: gentle reminders, no urgency, no scores
Return formatted text only."""

# ── Routes ──

@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0", "mode": "ai-only"}

@app.post("/ai/draft", response_model=DraftResponse)
async def draft(req: DraftRequest):
    """Draft a message from minimal context.

    Receives ONLY: name, nature, 3 memory snippets (50 chars each),
    last interaction (100 chars), user context.
    Does NOT receive: full contact record, all memories, notes, platforms.
    """
    # Build prompt from minimal context
    parts = [f"Draft a message to {req.name}."]
    if req.nature == "nurture":
        parts.append("This is a lifelong bond — be warm, no agenda.")
    elif req.nature == "leverage":
        parts.append("This is a professional tie — be respectful but purposeful.")
    if req.memories:
        parts.append(f"What I remember: {'; '.join(req.memories)}")
    if req.last_interaction:
        parts.append(f"Last interaction: {req.last_interaction}")
    if req.user_context:
        parts.append(f"Context: {req.user_context}")
    parts.append(f"Tone: {req.tone}")

    prompt = "\n".join(parts)
    result = _call_llm(prompt, DRAFT_SYSTEM)

    if result is None:
        # Fallback: template
        if req.nature == "nurture":
            result = f"嘿 {req.name}，好久没联系了，最近怎么样？想你了 😊"
        elif req.nature == "leverage":
            result = f"{req.name}你好，最近忙吗？有个事想跟你聊聊。"
        else:
            result = f"{req.name}，好久不见！最近怎么样？"

    return DraftResponse(result=result)

@app.post("/ai/extract", response_model=ExtractResponse)
async def extract(req: ExtractRequest):
    """Extract todos and key points from interaction text.

    Receives ONLY: the interaction text and optionally a contact name.
    Does NOT receive: contact record, timeline history, any other data.
    """
    prompt = f"Interaction: {req.interaction_text}\nContact: {req.contact_name or 'unknown'}"
    result = _call_llm(prompt, EXTRACT_SYSTEM)

    if result:
        import json
        try:
            start = result.find("{")
            end = result.rfind("}") + 1
            if start >= 0 and end > start:
                parsed = json.loads(result[start:end])
                return ExtractResponse(result=parsed)
        except Exception:
            pass

    # Fallback: simple heuristic
    pending = ""
    text = req.interaction_text.lower()
    if any(kw in text for kw in ["下周", "跟进", "follow up", "remind", "待办"]):
        pending = "Follow up on this interaction"
    return ExtractResponse(result={"pending": pending, "key_points": []})

@app.post("/ai/advise", response_model=AdviseResponse)
async def advise(req: AdviseRequest):
    """Format advise suggestions from pre-scored candidates.

    Receives ONLY: candidate names, days_since, nature, last interaction snippet.
    Does NOT receive: full contact records, all timeline data, scoring algorithms.
    Scoring is done on the edge; cloud only formats the output.
    """
    parts = []
    if req.leverage:
        parts.append(f"💡 这周值得联系的人（{len(req.leverage)}位）\n")
        for c in req.leverage:
            days = c.get("days_since", 0)
            icon = "🔴" if days >= 21 else "🟡"
            line = f"{icon} {c['name']} — {days}天没联系了"
            if c.get("leverage_goals"):
                line += f"\n   为{','.join(c['leverage_goals'])}联结"
            if c.get("last_interaction"):
                line += f"\n   上次：{c['last_interaction'][:60]}"
            parts.append(line)
        parts.append("\n📌 好关系是互相搭桥 🤝")

    if req.nurture:
        parts.append("\n💛 值得记得的事\n")
        for r in req.nurture:
            if r.get("type") == "important_date":
                parts.append(f"  · {r['name']}的{r.get('label', '')}快到了")
                parts.append(f"    要不要发条消息？")
            elif r.get("type") == "memory_followup":
                parts.append(f"  · {r['name']}：你记着「{r.get('content', '')[:40]}」")
        parts.append("\n（这种关系不算什么分，也不催你——用心就好）")

    if not parts:
        return AdviseResponse(result="这周没有特别需要联系的。")

    # Try LLM for enhanced formatting
    llm_result = _call_llm("\n".join(parts), ADVISE_SYSTEM)
    return AdviseResponse(result=llm_result if llm_result else "\n".join(parts))

# ── LLM helper ──

def _call_llm(prompt: str, system: str) -> Optional[str]:
    """Call LLM via the abstraction layer. Returns None on failure."""
    try:
        client = get_client()
        if client:
            return client.complete(prompt, system=system)
    except Exception:
        pass
    return None
