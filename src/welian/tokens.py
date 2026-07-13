"""Token billing system — 联点计费 (SPEC §6.2, BUSINESS_MODEL).

Tracks token consumption per user. Free tier has monthly allowance.
"""
import json
import math
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

# --- Token-based 计费定价（cloud 模式，方案C）---
# Welian 批发采购 LLM tokens 后零售给用户，按实际用量计费。
# 批发成本约 0.003-0.005 元/千token；零售 1点 = 0.1元 → 毛利 60-70%。
POINTS_PER_1K_INPUT = 1   # 1000 input tokens = 1 point
POINTS_PER_1K_OUTPUT = 2  # 1000 output tokens = 2 point（output贵因为LLM生成成本高）

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
        "token_usage": {},  # 按月记录实际 token 用量 {month: {input, output, points}}
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
        "token_usage": get_token_usage(user_id, month),
    }


# ---------------------------------------------------------------------------
# Token-based 计费（cloud 模式，方案C）
# 按实际 LLM token 用量计费，替代 action-based 固定扣费。
# ---------------------------------------------------------------------------

def _compute_token_points(input_tokens, output_tokens):
    """按定价常量将 token 用量换算为联点。"""
    input_points = input_tokens * POINTS_PER_1K_INPUT / 1000
    output_points = output_tokens * POINTS_PER_1K_OUTPUT / 1000
    # 向上取整到整数点，避免小额累积漏计
    return math.ceil(input_points + output_points)


def consume_tokens(user_id, input_tokens, output_tokens):
    """按实际 LLM token 用量扣费（cloud 模式）.

    Args:
        user_id: 用户ID
        input_tokens: 本次调用输入 token 数（prompt）
        output_tokens: 本次调用输出 token 数（completion）

    Returns:
        (success, remaining, message)
    """
    cost = _compute_token_points(input_tokens, output_tokens)
    usage = get_usage(user_id)
    month = _get_month_key()

    # 余额检查（与 action-based 共享额度池）
    plan = usage.get("plan", "free")
    allowance = PRO_MONTHLY_ALLOWANCE if plan == "pro" else FREE_MONTHLY_ALLOWANCE
    purchased = usage.get("purchased", 0)
    month_used = usage.get("tokens_used", {}).get(month, 0)
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
            f"input={input_tokens} tokens, output={output_tokens} tokens\n"
            f"{hint}"
        )

    # 扣费：写入 tokens_used（与 action-based 共享月度计数）
    if "tokens_used" not in usage:
        usage["tokens_used"] = {}
    usage["tokens_used"][month] = month_used + cost
    usage["total_used"] = usage.get("total_used", 0) + cost

    # 记录 token 用量明细
    if "token_usage" not in usage:
        usage["token_usage"] = {}
    month_tu = usage["token_usage"].get(month, {"input": 0, "output": 0, "points": 0})
    month_tu["input"] = month_tu.get("input", 0) + input_tokens
    month_tu["output"] = month_tu.get("output", 0) + output_tokens
    month_tu["points"] = month_tu.get("points", 0) + cost
    usage["token_usage"][month] = month_tu

    _save_usage(user_id, usage)

    remaining = allowance + purchased - usage["tokens_used"][month]
    return True, remaining, (
        f"消耗{cost}点（input {input_tokens} + output {output_tokens} tokens），剩余{remaining}点"
    )


def get_token_usage(user_id="default", month=None):
    """返回当月（或指定月份）token 使用详情.

    Args:
        user_id: 用户ID
        month: 月份字符串 "YYYY-MM"，默认当月

    Returns:
        dict: {month, input, output, points, calls} — 无记录时 calls=0
    """
    usage = get_usage(user_id)
    if month is None:
        month = _get_month_key()
    month_tu = usage.get("token_usage", {}).get(month, {})
    return {
        "month": month,
        "input": month_tu.get("input", 0),
        "output": month_tu.get("output", 0),
        "points": month_tu.get("points", 0),
        "calls": month_tu.get("calls", 0),
    }


def estimate_cost(messages, system=None):
    """估算一次 LLM 调用的联点成本（调用前预览）.

    用简单字符数/4 估算 token 数（英文约4字符/token，中文约2字符/token，
    取4为保守估计，实际用量以 LLM 返回为准）。

    Args:
        messages: list[dict] — OpenAI 格式消息 [{"role":..., "content":...}]
        system: str 或 None — system prompt

    Returns:
        dict: {input_tokens_est, output_tokens_est, estimated_points, breakdown}
        output 按 input 的 50% 粗估（调用前无法知道实际生成长度）。
    """
    def _estimate_tokens(text):
        if not text:
            return 0
        return max(1, len(str(text)) // 4)

    input_tokens = 0
    if system:
        input_tokens += _estimate_tokens(system)
    for msg in messages:
        content = msg.get("content", "") if isinstance(msg, dict) else str(msg)
        input_tokens += _estimate_tokens(content)

    # output 按 input 的 50% 粗估
    output_tokens = input_tokens // 2
    estimated_points = _compute_token_points(input_tokens, output_tokens)

    return {
        "input_tokens_est": input_tokens,
        "output_tokens_est": output_tokens,
        "estimated_points": estimated_points,
        "breakdown": (
            f"预估 input≈{input_tokens} tokens, output≈{output_tokens} tokens, "
            f"约 {estimated_points} 联点"
        ),
    }


def check_and_consume_tokens(user_id, estimated_tokens):
    """预扣费：调用 LLM 前按估算 token 数预扣额度（cloud 模式）.

    用于调用前检查余额是否足够，避免调用后才发现额度不足。
    实际用量以 consume_tokens() 为准；预扣与实扣的差异可在调用后修正。

    Args:
        user_id: 用户ID
        estimated_tokens: 预估总 token 数（input+output）
            按 input:output = 2:1 拆分估算（与 estimate_cost 一致）

    Returns:
        (ok: bool, error_msg: str) — 成功时 error_msg 为预估成本描述
    """
    # 按 2:1 拆分 input/output
    input_tokens = estimated_tokens * 2 // 3
    output_tokens = estimated_tokens - input_tokens
    estimated_points = _compute_token_points(input_tokens, output_tokens)

    usage = get_usage(user_id)
    month = _get_month_key()
    plan = usage.get("plan", "free")
    allowance = PRO_MONTHLY_ALLOWANCE if plan == "pro" else FREE_MONTHLY_ALLOWANCE
    purchased = usage.get("purchased", 0)
    month_used = usage.get("tokens_used", {}).get(month, 0)
    available = allowance + purchased - month_used

    if estimated_points > available:
        plan_label = "Pro" if plan == "pro" else "免费版"
        return False, (
            f"额度不足：预估需要{estimated_points}点，剩余{available}点。"
            f"当前套餐：{plan_label}。"
        )

    return True, f"额度充足：预估{estimated_points}点，剩余{available}点"
