"""Token billing system — 联点计费 (SPEC §6.2, BUSINESS_MODEL).

Tracks token consumption per user. Free tier has monthly allowance.
"""
import json
from datetime import date
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
        return False, available, (
            f"联点不够了（需要{cost}，剩余{available}）。\n"
            f"免费额度每月{allowance}点，用完了可以等下月刷新，或升级到 Pro。"
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
