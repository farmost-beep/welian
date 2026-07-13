"""AI module — drafting messages and generating suggestions.

Uses the LLM abstraction layer for provider-agnostic calls.
Falls back to template-based generation if no LLM available.
"""
from . import engine
from .llm.router import get_client

# ── Drafting (拟) ──

DRAFT_SYSTEM = """You are Welian, an AI companion that helps people be better friends, family members, and collaborators.

Your job is to draft messages that are:
- Warm and genuine, not corporate
- Short enough to send as a text message
- Culturally appropriate (adjust based on the relationship type)
- Never pushy or transactional for nurture-type relationships

Return ONLY the message text, no explanations."""

def draft_message(contact_name, context="", tone="warm", nature=None):
    """Draft a message for a contact (SPEC §6.2 AI拟稿).

    Args:
        contact_name: Contact name or ID
        context: Context about why this message (e.g. "三年没联系的老同学")
        tone: warm / formal / casual
        nature: leverage / nurture / dual (affects tone)
    """
    contact, _ = engine.resolve_contact(contact_name)
    if contact:
        name = contact["name"]
        nature = nature or engine.infer_nature(contact)
        # Build context from memories and timeline
        memories = [m["content"] for m in contact.get("memories", [])[:3]]
        tls = engine.list_timeline(contact["id"], days=90)
        last_interaction = tls[0]["summary"] if tls else "No recent interaction"
        context_parts = [f"Context: {context}"] if context else []
        if memories:
            context_parts.append(f"What I remember: {'; '.join(memories)}")
        context_parts.append(f"Last interaction: {last_interaction}")
        if nature == engine.NATURE_NURTURE:
            context_parts.append("This is a lifelong bond — be warm, no agenda")
        elif nature == engine.NATURE_LEVERAGE:
            context_parts.append("This is a professional tie — be respectful but purposeful")
        full_context = "\n".join(context_parts)
    else:
        name = contact_name
        full_context = context or "No additional context"

    prompt = f"""Draft a short message to {name}.
{full_context}
Tone: {tone}

Keep it under 80 characters. Natural, like a real person texting."""

    try:
        client = get_client()
        if client:
            return client.complete(prompt, system=DRAFT_SYSTEM)
    except Exception:
        pass

    # Fallback: template-based
    return _template_draft(name, context, nature)

def _template_draft(name, context, nature):
    if nature == engine.NATURE_NURTURE:
        return f"嘿 {name}，好久没联系了，最近怎么样？想你了 😊"
    elif nature == engine.NATURE_LEVERAGE:
        return f"{name}你好，最近忙吗？有个事想跟你聊聊，方便的时候回我一下。"
    else:
        return f"{name}，好久不见！最近怎么样？有空一起吃个饭聊聊。"

# ── Advise formatting (问) ──

def format_advise_leverage(candidates):
    """Format leverage advise candidates into a readable message."""
    if not candidates:
        return "这周没有特别需要联系的撬动型关系。你可能已经联系过了 👍"
    lines = [f"💡 这周值得联系的人（{len(candidates)}位）\n"]
    for i, cand in enumerate(candidates, 1):
        c = cand["contact"]
        days = cand["days_since"]
        signals = " · ".join(cand["signals"])
        last = cand.get("last_interaction", "")
        lines.append(f"{'🔴' if days >= 21 else '🟡'} {c['name']} — {days}天没联系了")
        if cand.get("leverage", {}).get("goals"):
            lines.append(f"   为{','.join(cand['leverage']['goals'])}联结")
        if last:
            lines.append(f"   上次：{last[:40]}")
        lines.append("")
    lines.append("📌 好关系是互相搭桥 🤝")
    return "\n".join(lines)

def format_advise_nurture(reminders):
    """Format nurture reminders into a gentle message.

    ETHICAL GUARDRAIL: No scores, no urgency language (SPEC §2.6).
    """
    if not reminders:
        return "维系型关系这边没什么特别要提醒的。\n你心里有他们，就够了 💛"
    lines = ["💛 值得记得的事\n"]
    for r in reminders:
        c = r["contact"]
        if r["type"] == "important_date":
            lines.append(f"  · {c['name']}的{r['label']}（{r['date']}）快到了")
            lines.append(f"    要不要发条消息？")
        elif r["type"] == "memory_followup":
            lines.append(f"  · {c['name']}：你记着「{r['content'][:30]}」")
            lines.append(f"    最近有新进展吗？")
        lines.append("")
    lines.append("（这种关系不算什么分，也不催你——用心就好）")
    return "\n".join(lines)

# ── Report formatting (报) ──

def format_role_dashboard(dash):
    """Format role dashboard into a readable monthly review (SPEC §3.2).

    Behavioral facts only, no state judgment, no scores (SPEC §3.3).
    Each role gets role-specific framing rather than identical bullets.
    """
    month_label = dash["month"]
    lines = [f"📊 {month_label} 的你\n"]

    # friend: 走心交流 / 在场 / 重新联系
    f = dash["friend"]
    lines.append("作为朋友 🌱")
    if f["meaningful_interactions"] > 0:
        names = "、".join(f["names"][:3]) if f.get("names") else ""
        suffix = f"（{names}）" if names else ""
        lines.append(f"  · {f['meaningful_interactions']} 次走心的交流{suffix}")
    if f["completed_todos"] > 0:
        lines.append(f"  · 答应朋友的事做到了 {f['completed_todos']} 件")
    if f["pending_todos"] > 0:
        lines.append(f"  · ⚠️ 还有 {f['pending_todos']} 件没做")
    if f["meaningful_interactions"] == 0 and f["completed_todos"] == 0:
        lines.append("  · 这个月还没有走心的记录")
    lines.append("")

    # family: 陪伴次数 / 重要日子 / 不遗漏
    fam = dash["family"]
    lines.append("作为家人 🏡")
    if fam["meaningful_interactions"] > 0:
        lines.append(f"  · 陪伴了 {fam['meaningful_interactions']} 次")
    if fam["completed_todos"] > 0:
        lines.append(f"  · 答应家人的事做到了 {fam['completed_todos']} 件")
    if fam["pending_todos"] > 0:
        lines.append(f"  · ⚠️ 还有 {fam['pending_todos']} 件没做，别遗漏")
    if fam["meaningful_interactions"] == 0 and fam["completed_todos"] == 0:
        lines.append("  · 这个月还没有陪伴记录")
    lines.append("")

    # collaborator: 说到做到 / 搭桥引荐 / 项目进展
    col = dash["collaborator"]
    lines.append("作为合作者 🤝")
    if col["completed_todos"] > 0:
        total = col["completed_todos"] + col["pending_todos"]
        rate = round(col["completed_todos"] / total * 100) if total else 0
        lines.append(f"  · 答应的事做到了 {col['completed_todos']} 件，做到率 {rate}%")
    if col["meaningful_interactions"] > 0:
        lines.append(f"  · {col['meaningful_interactions']} 次实质性沟通")
    if col["pending_todos"] > 0:
        lines.append(f"  · ⚠️ 还有 {col['pending_todos']} 件没做")
    if col["meaningful_interactions"] == 0 and col["completed_todos"] == 0:
        lines.append("  · 这个月还没有合作往来记录")
    lines.append("")

    lines.append("—— 以上只是你做了什么，过得怎么样你自己说了算 :)")
    return "\n".join(lines)

# ── Nurture check formatting ──

def format_nurture_check(contact_name):
    """Format a nurture check for a specific contact (SPEC §2.3)."""
    contact, match_type = engine.resolve_contact(contact_name)
    if not contact:
        return f"我没有找到「{contact_name}」的记录。要我先帮你建一个吗？"

    nature = engine.infer_nature(contact)
    nurture = engine.get_nurture_info(contact["id"])
    tls = engine.list_timeline(contact["id"], days=9999)

    lines = [f"📌 {contact['name']}"]

    if nature == engine.NATURE_NURTURE:
        lines.append("值得陪伴的关系\n")
    elif nature == engine.NATURE_LEVERAGE:
        lines.append("为目标联结的关系\n")
    else:
        lines.append("双重关系\n")

    # Bond
    if nurture and nurture["bond"]:
        lines.append(f"你们的关系：{nurture['bond']}")
    elif contact.get("relation"):
        lines.append(f"关系：{contact['relation']}")

    # Memories
    if nurture and nurture["memories"]:
        lines.append("\n我替你记着的：")
        for m in nurture["memories"][:5]:
            lines.append(f"  · {m['content']}")

    # Presence events
    if nurture and nurture["presence_events"]:
        lines.append("\n你在场的时刻：")
        for p in nurture["presence_events"][:3]:
            lines.append(f"  · {p['event']}")

    # Important dates
    if nurture and nurture["important_dates"]:
        lines.append("\n重要日期：")
        for d in nurture["important_dates"]:
            lines.append(f"  · {d['label']} ({d['date']})")

    # Recent interactions
    if tls:
        lines.append(f"\n最近来往（{len(tls)}条记录）：")
        for t in tls[:3]:
            lines.append(f"  {t['date']} — {t['summary'][:40]}")
    else:
        lines.append("\n还没有互动记录。")

    # Leverage info if dual
    if nature in (engine.NATURE_LEVERAGE, engine.NATURE_DUAL):
        lev = contact.get("leverage") or {}
        if lev.get("confirmed"):
            lines.append(f"\n锚定：{','.join(lev.get('goals', []))} · {lev.get('how', '')}")

    if nature == engine.NATURE_NURTURE:
        lines.append("\n（这种关系不算什么分，也不催你——你心里有他，就够了）")

    return "\n".join(lines)
