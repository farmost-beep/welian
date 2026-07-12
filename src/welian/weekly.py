"""Weekly report — social relationship summary.

Generates a weekly report covering:
- This week's interactions (timeline)
- Completed / pending todos
- Contacts reached out vs. suggested
- Upcoming birthdays and nurture reminders
- Next week's priorities

Data is gathered locally, then LLM generates a natural language summary.
Can be triggered manually (CLI) or automatically (launchd cron).
"""
from __future__ import annotations

from datetime import date, timedelta
from . import engine
from .llm.router import get_client


def gather_weekly_data() -> dict:
    """Gather all data needed for a weekly report.

    Returns a dict with structured data for LLM to summarize.
    """
    today = date.today()
    # This week: Monday to Sunday
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    week_start = monday.isoformat()
    week_end = sunday.isoformat()

    # 1. This week's interactions
    timeline = engine.list_timeline(days=7)
    interactions = []
    for t in timeline:
        interactions.append({
            "contact": t.get("contact", ""),
            "summary": t.get("summary", "")[:80],
            "date": t.get("date", "")[:10],
        })

    # 2. Todos: completed this week + pending
    all_todos = engine.list_todos()
    completed_this_week = []
    pending = []
    for t in all_todos:
        if t.get("status") == "completed":
            completed_this_week.append({
                "contact": t.get("contact", ""),
                "task": t.get("task", "")[:60],
            })
        elif t.get("status") == "pending":
            due = t.get("due", "")
            pending.append({
                "contact": t.get("contact", ""),
                "task": t.get("task", "")[:60],
                "due": due[:10] if due else "",
            })

    # 3. Contact suggestions for next week
    leverage = engine.advise_leverage(top=5)
    nurture = engine.advise_nurture(days_ahead=14)

    suggestions = []
    for c in leverage:
        suggestions.append({
            "name": c["contact"]["name"],
            "type": "leverage",
            "days_since": c.get("days_since", 0),
            "last_interaction": c.get("last_interaction", "")[:60],
        })
    for r in nurture:
        suggestions.append({
            "name": r["contact"]["name"],
            "type": "nurture",
            "reason": r.get("type", ""),
            "detail": r.get("label", "") or r.get("content", "")[:60],
        })

    # 4. Dashboard stats
    dash = engine.get_dashboard()

    # 5. Upcoming birthdays (next 14 days)
    upcoming_birthdays = dash.get("upcoming_birthdays", [])

    return {
        "week_start": week_start,
        "week_end": week_end,
        "today": today.isoformat(),
        "interactions": interactions,
        "interactions_count": len(interactions),
        "completed_todos": completed_this_week,
        "completed_count": len(completed_this_week),
        "pending_todos": pending,
        "pending_count": len(pending),
        "suggestions": suggestions,
        "total_contacts": dash.get("total_contacts", 0),
        "upcoming_birthdays": upcoming_birthdays,
    }


def format_weekly_data(data: dict) -> str:
    """Format weekly data into a text summary for LLM input."""
    parts = []
    parts.append(f"本周时间段：{data['week_start']} 至 {data['week_end']}")
    parts.append(f"今天：{data['today']}")
    parts.append(f"总联系人：{data['total_contacts']}人")
    parts.append("")

    # Interactions
    parts.append(f"本周互动记录（{data['interactions_count']}条）：")
    if data["interactions"]:
        for i in data["interactions"]:
            parts.append(f"  · [{i['contact']}] {i['summary']}（{i['date']}）")
    else:
        parts.append("  无")
    parts.append("")

    # Completed todos
    parts.append(f"本周完成的待办（{data['completed_count']}条）：")
    if data["completed_todos"]:
        for t in data["completed_todos"]:
            parts.append(f"  ✓ [{t['contact']}] {t['task']}")
    else:
        parts.append("  无")
    parts.append("")

    # Pending todos
    parts.append(f"待完成待办（{data['pending_count']}条）：")
    if data["pending_todos"]:
        for t in data["pending_todos"][:15]:
            due = f"（{t['due']}）" if t["due"] else ""
            parts.append(f"  · [{t['contact']}] {t['task']}{due}")
        if len(data["pending_todos"]) > 15:
            parts.append(f"  …还有 {len(data['pending_todos']) - 15} 条")
    else:
        parts.append("  无")
    parts.append("")

    # Suggestions
    parts.append("下周建议联系：")
    if data["suggestions"]:
        for s in data["suggestions"]:
            if s["type"] == "leverage":
                parts.append(f"  · {s['name']}（{s['days_since']}天未联系）上次：{s['last_interaction']}")
            else:
                parts.append(f"  · {s['name']}（{s['reason']}）{s['detail']}")
    else:
        parts.append("  无特别建议")
    parts.append("")

    # Birthdays
    if data["upcoming_birthdays"]:
        parts.append("即将生日：")
        for b in data["upcoming_birthdays"]:
            parts.append(f"  · {b}")

    return "\n".join(parts)


def generate_weekly_report() -> str:
    """Generate a weekly report using LLM.

    Gathers local data, then asks LLM to write a natural summary.
    """
    data = gather_weekly_data()
    context = format_weekly_data(data)

    try:
        llm = get_client()
        system = """你是 Welian，一个关系管理 AI 助手。你需要为用户生成一份社交周报。

周报风格：
- 简洁温暖，像朋友在跟你聊这周的事
- 中文，适当用 emoji
- 先总结本周亮点，再列出下周重点
- 如果本周互动少，温和提醒不要疏于联系
- 如果有超期待办，明确提醒
- 结尾给一个简短的建议或鼓励

格式：
📊 本周社交周报（X月X日 - X月X日）

🌟 本周亮点
（总结互动和完成的事）

📋 下周重点
（列出需要跟进的待办和建议联系的人）

💡 一句话建议
（简短鼓励或提醒）"""

        prompt = f"""请根据以下数据生成本周社交周报：

{context}

请生成周报，直接输出内容。"""

        return llm.complete(prompt, system=system)
    except Exception as e:
        # Fallback: return raw data
        return f"📊 本周社交周报（{data['week_start']} - {data['week_end']}）\n\n{context}\n\n（LLM 不可用，显示原始数据）"
