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

    # Helper: resolve a contact_id to its social role (SPEC §3.1)
    _contact_cache = {}
    def _role_of(cid):
        if cid not in _contact_cache:
            c = engine.get_contact(cid)
            _contact_cache[cid] = c
        c = _contact_cache.get(cid)
        return engine.contact_role(c) if c else engine.ROLE_COLLABORATOR

    def _name_of(cid):
        c = _contact_cache.get(cid) or engine.get_contact(cid)
        if c:
            _contact_cache[cid] = c
            return c.get("name", cid)
        return cid

    # Role-grouped buckets (friend / family / collaborator)
    by_role = {
        "friend": {"interactions": [], "completed_todos": [], "pending_todos": []},
        "family": {"interactions": [], "completed_todos": [], "pending_todos": []},
        "collaborator": {"interactions": [], "completed_todos": [], "pending_todos": []},
    }

    # 1. This week's interactions — grouped by role
    timeline = engine.list_timeline(days=7)
    interactions = []
    for t in timeline:
        cid = t.get("contact", "")
        item = {
            "contact": cid,
            "name": _name_of(cid),
            "summary": t.get("summary", "")[:80],
            "date": t.get("date", "")[:10],
            "type": t.get("type", ""),
        }
        interactions.append(item)
        by_role[_role_of(cid)]["interactions"].append(item)

    # 2. Todos: completed this week + pending — grouped by role
    all_todos = engine.list_todos(status=None)
    completed_this_week = []
    pending = []
    for t in all_todos:
        cid = t.get("contact", "")
        if t.get("status") == "completed":
            item = {
                "contact": cid,
                "name": _name_of(cid),
                "task": t.get("task", "")[:60],
            }
            completed_this_week.append(item)
            by_role[_role_of(cid)]["completed_todos"].append(item)
        elif t.get("status") == "pending":
            due = t.get("due", "")
            item = {
                "contact": cid,
                "name": _name_of(cid),
                "task": t.get("task", "")[:60],
                "due": due[:10] if due else "",
            }
            pending.append(item)
            by_role[_role_of(cid)]["pending_todos"].append(item)

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
        "by_role": by_role,
        "suggestions": suggestions,
        "total_contacts": dash.get("total_contacts", 0),
        "upcoming_birthdays": upcoming_birthdays,
    }


def format_weekly_data(data: dict) -> str:
    """Format weekly data into a text summary for LLM input.

    Organized by the three social roles (SPEC §3.2):
    friend / family / collaborator.
    """
    role_meta = {
        "friend": "作为朋友 🌱",
        "family": "作为家人 🏡",
        "collaborator": "作为合作者 🤝",
    }
    parts = []
    parts.append(f"本周时间段：{data['week_start']} 至 {data['week_end']}")
    parts.append(f"今天：{data['today']}")
    parts.append(f"总联系人：{data['total_contacts']}人")
    parts.append("")

    by_role = data.get("by_role", {})

    # Per-role sections
    for role_key in ("friend", "family", "collaborator"):
        bucket = by_role.get(role_key, {})
        parts.append(role_meta[role_key])

        inter = bucket.get("interactions", [])
        if inter:
            parts.append(f"  互动记录（{len(inter)}条）：")
            for i in inter:
                parts.append(f"  · {i['name']}：{i['summary']}（{i['date']}，{i.get('type', '')}）")
        else:
            parts.append("  互动记录：无")

        done = bucket.get("completed_todos", [])
        if done:
            parts.append(f"  完成的待办（{len(done)}条）：")
            for t in done:
                parts.append(f"  ✓ {t['name']}：{t['task']}")
        else:
            parts.append("  完成的待办：无")

        pend = bucket.get("pending_todos", [])
        if pend:
            parts.append(f"  待完成待办（{len(pend)}条）：")
            for t in pend[:10]:
                due = f"（{t['due']}）" if t["due"] else ""
                parts.append(f"  · {t['name']}：{t['task']}{due}")
            if len(pend) > 10:
                parts.append(f"  …还有 {len(pend) - 10} 条")
        else:
            parts.append("  待完成待办：无")
        parts.append("")

    # Cross-role: suggestions & birthdays
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

    if data["upcoming_birthdays"]:
        parts.append("即将生日 / 重要日子：")
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

核心原则（SPEC §3.3）：
- 只做行为回顾：你做了什么（发了消息、打了电话、完成了答应的事、出席了重要场合）。
- 不做状态评判：不问"你幸福吗"、不打分、不评分、不排名、不说"这周表现不错/不够好"。
- 不给关系打 ROI，维系型关系尤其不算分。

周报风格：
- 简洁温暖，像朋友在跟你聊这周的事
- 中文，适当用 emoji
- 按三个角色分栏呈现，每栏只列行为事实
- 如果某角色本周没有互动，温和提一句"这周还没顾上"，不评判
- 有即将到来的重要日子或超期待办，明确提醒（⚠️）
- 结尾给一个简短的行为建议（不是感受评价）

格式（严格按此分栏，不要增减栏位）：
📊 本周的你（X月X日 - X月X日）

作为朋友 🌱
  · 走心的交流：X 次（列出人名）
  · 在场记录：你在某人重要时刻发了消息/到场（如有）
  · 重新联系：隔了很久重新联系上的人（如有）
  · 待跟进：答应朋友还没做的事（如有，⚠️ 标注）

作为家人 🏡
  · 陪伴次数：给家人打了几个电话/见了面
  · 重要日子：出席了什么/即将到来的纪念日生日（⚠️ 别忘了）
  · 不遗漏：你记着但还没顾上的事（如有）

作为合作者 🤝
  · 说到做到：完成了几件答应的事，做到率（已完成/总答应数）
  · 搭桥引荐：帮别人牵了线（如有）
  · 项目进展：跟进中的事进展如何
  · 待跟进：答应合作者还没做的事（如有，⚠️ 标注）

💡 下周可以做的
（一两条具体行为建议，不是感受评价）"""

        prompt = f"""请根据以下按角色分组的数据，生成本周社交周报。
严格按三个角色分栏输出，只做行为回顾，不打分不评判。

{context}

请生成周报，直接输出内容。"""

        return llm.complete(prompt, system=system)
    except Exception as e:
        # Fallback: return raw data
        return f"📊 本周的你（{data['week_start']} - {data['week_end']}）\n\n{context}\n\n（LLM 不可用，显示原始数据）"
