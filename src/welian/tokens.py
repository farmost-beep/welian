"""Token billing system — 联点计费 (SPEC §6.2, BUSINESS_MODEL).

Tracks token consumption per user. Free tier has monthly allowance.
"""
import json
from datetime import date, timedelta
from pathlib import Path
from .engine import _load, _save, USAGE_FILE

# Token costs per feature (SPEC §6.2)
TOKEN_COSTS = {
    "ai_record_enhance": 1,    # AI 记录增强
    "ai_draft": 2,             # AI 拟稿
    "advise_engine": 3,        # 建议引擎
    "weekly_report": 3,        # 社交周报
    "meeting_prep": 3,         # 见面功课
    "anchor_assist": 3,        # 目标锚定助手
    "role_dashboard": 5,       # 角色仪表盘
    "annual_report": 20,       # 年度关系报告
    "premium_model": 2,        # 旗舰模型附加
}

# Free tier: 100 tokens/month (BUSINESS_MODEL §3)
FREE_MONTHLY_ALLOWANCE = 100
# Pro tier: 500 tokens/month
PRO_MONTHLY_ALLOWANCE = 500

def _get_month_key():
    return date.today().strftime("%Y-%m")

def get_usage(user_id="default"):
    """Get usage record for a user."""
    data = _load(USAGE_FILE) if USAGE_FILE.exists() else {}
    if isinstance(data, list):
        data = {}
    return data.get(user_id, {
        "plan": "free",
        "tokens_used": {},
        "total_used": 0,
        "purchased": 0,
    })

def _save_usage(user_id, usage):
    data = _load(USAGE_FILE) if USAGE_FILE.exists() else {}
    if isinstance(data, list):
        data = {}
    data[user_id] = usage
    _save(USAGE_FILE, data)

def consume(user_id, feature, count=1):
    """Consume tokens for a feature. Returns (success, remaining, message)."""
    cost = TOKEN_COSTS.get(feature, 1) * count
    usage = get_usage(user_id)
    month = _get_month_key()

    # Initialize month if needed
    if "tokens_used" not in usage:
        usage["tokens_used"] = {}
    month_used = usage["tokens_used"].get(month, 0)

    # Check allowance
    plan = usage.get("plan", "free")
    allowance = PRO_MONTHLY_ALLOWANCE if plan == "pro" else FREE_MONTHLY_ALLOWANCE
    purchased = usage.get("purchased", 0)
    available = allowance + purchased - month_used

    if cost > available:
        plan_label = "Pro" if plan == "pro" else "免费版"
        hint = (
            f"升级到 Pro（¥29/月），每月额度提升到{PRO_MONTHLY_ALLOWANCE}点。"
            if plan != "pro"
            else "可以购买额外联点包，或等下月额度刷新。"
        )
        return False, available, (
            f"联点不够了（需要{cost}，剩余{available}）。\n"
            f"当前套餐：{plan_label}，每月额度{allowance}点。\n"
            f"{hint}"
        )

    # Consume
    usage["tokens_used"][month] = month_used + cost
    usage["total_used"] = usage.get("total_used", 0) + cost
    _save_usage(user_id, usage)

    remaining = allowance + purchased - usage["tokens_used"][month]
    return True, remaining, f"消耗{cost}点，剩余{remaining}点"

def get_balance(user_id="default"):
    """Get current token balance for a user."""
    usage = get_usage(user_id)
    month = _get_month_key()
    plan = usage.get("plan", "free")
    allowance = PRO_MONTHLY_ALLOWANCE if plan == "pro" else FREE_MONTHLY_ALLOWANCE
    purchased = usage.get("purchased", 0)
    month_used = usage.get("tokens_used", {}).get(month, 0)
    return {
        "plan": plan,
        "allowance": allowance,
        "purchased": purchased,
        "used_this_month": month_used,
        "remaining": allowance + purchased - month_used,
    }

def upgrade_plan(user_id, plan="pro"):
    """Upgrade user plan."""
    usage = get_usage(user_id)
    usage["plan"] = plan
    _save_usage(user_id, usage)
    return True, f"Upgraded to {plan}"

def add_tokens(user_id, amount):
    """Add purchased tokens."""
    usage = get_usage(user_id)
    usage["purchased"] = usage.get("purchased", 0) + amount
    _save_usage(user_id, usage)
    return True, f"Added {amount} tokens"


def reset_monthly_allowance(user_id="default"):
    """每月1号重置免费额度（SPEC §6.2 BUSINESS_MODEL）.

    将当月已用额度清零，purchased tokens 保留。
    free=100/月, pro=500/月。
    应由定时任务每月1号调用，或用户手动触发。
    """
    usage = get_usage(user_id)
    month = _get_month_key()
    tokens_used = usage.get("tokens_used", {})
    # 清零当月用量，保留历史月份记录
    tokens_used[month] = 0
    usage["tokens_used"] = tokens_used
    # 记录上次重置时间
    usage["last_reset"] = date.today().isoformat()
    _save_usage(user_id, usage)
    plan = usage.get("plan", "free")
    allowance = PRO_MONTHLY_ALLOWANCE if plan == "pro" else FREE_MONTHLY_ALLOWANCE
    return True, f"已重置{plan}套餐月度额度：{allowance}点（purchased tokens 保留：{usage.get('purchased', 0)}点）"


def check_and_consume(user_id, action, count=1):
    """检查余额 + 扣费一步完成（原子操作）.

    Args:
        user_id: 用户ID
        action: 操作类型，对应 TOKEN_COSTS 的 key
        count: 次数（默认1）

    Returns:
        (ok: bool, error_msg: str) — 成功时 error_msg 为剩余额度描述
    """
    if action not in TOKEN_COSTS:
        return False, f"未知操作类型：{action}，无法计费"

    ok, remaining, msg = consume(user_id, action, count)
    if ok:
        return True, msg
    return False, msg


def get_plan_info(user_id="default"):
    """返回当前plan、剩余额度、已用额度、下次重置时间."""
    usage = get_usage(user_id)
    month = _get_month_key()
    plan = usage.get("plan", "free")
    allowance = PRO_MONTHLY_ALLOWANCE if plan == "pro" else FREE_MONTHLY_ALLOWANCE
    purchased = usage.get("purchased", 0)
    month_used = usage.get("tokens_used", {}).get(month, 0)
    total_used = usage.get("total_used", 0)
    remaining = allowance + purchased - month_used

    # 计算下次重置时间：下月1号
    today = date.today()
    if today.month == 12:
        next_reset = date(today.year + 1, 1, 1)
    else:
        next_reset = date(today.year, today.month + 1, 1)
    next_reset_str = next_reset.isoformat()
    days_to_reset = (next_reset - today).days

    return {
        "plan": plan,
        "plan_label": "Pro" if plan == "pro" else "免费版",
        "allowance": allowance,
        "purchased": purchased,
        "used_this_month": month_used,
        "total_used": total_used,
        "remaining": remaining,
        "next_reset_date": next_reset_str,
        "days_to_reset": days_to_reset,
        "last_reset": usage.get("last_reset", ""),
    }
