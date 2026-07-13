"""Payment module — 支付占位 (SPEC §6.3 BUSINESS_MODEL).

当前为占位实现，返回 mock 数据。预留 WeChat Pay 和 Stripe 两个接口。
价格：月度Pro ¥29/月，年度Pro ¥299/年。

接入真实支付时，替换 _wechat_pay_create / _stripe_create / 签名验证即可。
"""
import uuid
from datetime import datetime
from . import tokens
from .engine import _load, _save, USAGE_FILE

# ── 价格表 (SPEC §6.3) ──
PLAN_PRICES = {
    "pro_monthly": {
        "plan": "pro",
        "billing": "monthly",
        "amount": 29,           # ¥29/月
        "currency": "CNY",
        "label": "Pro 月度",
    },
    "pro_annual": {
        "plan": "pro",
        "billing": "annual",
        "amount": 299,          # ¥299/年
        "currency": "CNY",
        "label": "Pro 年度",
    },
}

# 支付渠道
PAYMENT_CHANNEL_WECHAT = "wechat"
PAYMENT_CHANNEL_STRIPE = "stripe"

# 订单状态
ORDER_STATUS_PENDING = "pending"
ORDER_STATUS_PAID = "paid"
ORDER_STATUS_FAILED = "failed"


def _get_orders():
    """Load orders from usage file (stored alongside token usage)."""
    data = _load(USAGE_FILE) if USAGE_FILE.exists() else {}
    if isinstance(data, list):
        data = {}
    return data.get("_orders", {})


def _save_orders(orders):
    """Save orders to usage file."""
    data = _load(USAGE_FILE) if USAGE_FILE.exists() else {}
    if isinstance(data, list):
        data = {}
    data["_orders"] = orders
    _save(USAGE_FILE, data)


def _gen_order_id():
    """生成订单号：WL + 时间戳 + 随机后缀."""
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    suffix = uuid.uuid4().hex[:6].upper()
    return f"WL{ts}{suffix}"


def create_order(user_id, plan, amount, channel=PAYMENT_CHANNEL_WECHAT):
    """创建支付订单，返回订单号（占位，返回mock订单号）.

    Args:
        user_id: 用户ID
        plan: 套餐 key，对应 PLAN_PRICES（"pro_monthly" / "pro_annual"）
        amount: 金额（分），用于校验
        channel: 支付渠道（wechat / stripe）

    Returns:
        dict: 订单信息（order_id, status, pay_url 等）
    """
    if plan not in PLAN_PRICES:
        return {"ok": False, "error": f"未知套餐：{plan}，可选：{list(PLAN_PRICES.keys())}"}

    price_info = PLAN_PRICES[plan]
    order_id = _gen_order_id()

    order = {
        "order_id": order_id,
        "user_id": user_id,
        "plan": plan,
        "target_plan": price_info["plan"],
        "billing": price_info["billing"],
        "amount": price_info["amount"],
        "currency": price_info["currency"],
        "channel": channel,
        "status": ORDER_STATUS_PENDING,
        "created_at": datetime.now().isoformat(),
        # 支付链接（占位）
        "pay_url": _mock_pay_url(order_id, channel),
    }

    # 保存订单
    orders = _get_orders()
    orders[order_id] = order
    _save_orders(orders)

    return {
        "ok": True,
        "order_id": order_id,
        "status": ORDER_STATUS_PENDING,
        "amount": price_info["amount"],
        "currency": price_info["currency"],
        "label": price_info["label"],
        "channel": channel,
        "pay_url": order["pay_url"],
    }


def _mock_pay_url(order_id, channel):
    """生成占位支付链接."""
    if channel == PAYMENT_CHANNEL_WECHAT:
        return f"weixin://wxpay/bizpayurl?pr=mock_{order_id}"
    elif channel == PAYMENT_CHANNEL_STRIPE:
        return f"https://checkout.stripe.com/mock/{order_id}"
    return f"mock://pay/{order_id}"


def check_payment(order_id):
    """查询支付状态（占位，返回mock）.

    真实实现中，这里会调用 WeChat Pay / Stripe API 查询订单状态。
    当前占位：直接返回订单存储的状态，模拟已支付用于测试。

    Returns:
        dict: 订单状态信息
    """
    orders = _get_orders()
    order = orders.get(order_id)
    if not order:
        return {"ok": False, "error": f"订单不存在：{order_id}"}

    # 占位：模拟支付完成（真实环境调用支付平台 API）
    # 测试时可手动将 status 改为 paid
    return {
        "ok": True,
        "order_id": order_id,
        "status": order.get("status", ORDER_STATUS_PENDING),
        "amount": order.get("amount"),
        "plan": order.get("plan"),
        "channel": order.get("channel"),
        "paid_at": order.get("paid_at"),
    }


def handle_callback(data):
    """支付回调处理（占位，验证签名后调用 tokens.upgrade_plan）.

    真实实现中：
    - WeChat Pay: 验证签名 → 解析回调 → 确认支付成功 → upgrade_plan
    - Stripe: 验证 webhook signature → 解析 event → 确认支付成功 → upgrade_plan

    当前占位：跳过签名验证，直接处理订单状态。

    Args:
        data: 回调数据 dict，需包含 order_id 和 sign（占位可省略）

    Returns:
        dict: 处理结果
    """
    order_id = data.get("order_id")
    if not order_id:
        return {"ok": False, "error": "回调数据缺少 order_id"}

    orders = _get_orders()
    order = orders.get(order_id)
    if not order:
        return {"ok": False, "error": f"订单不存在：{order_id}"}

    # ── 签名验证（占位）──
    # 真实环境：
    #   WeChat Pay: 用 API key 验证 sign 字段
    #   Stripe: 用 webhook secret 验证 Stripe-Signature header
    sign = data.get("sign", "")
    if not _verify_signature(data, sign):
        return {"ok": False, "error": "签名验证失败"}

    # 幂等：已支付则不重复处理
    if order.get("status") == ORDER_STATUS_PAID:
        return {"ok": True, "order_id": order_id, "message": "订单已处理（幂等）"}

    # 更新订单状态
    order["status"] = ORDER_STATUS_PAID
    order["paid_at"] = datetime.now().isoformat()
    orders[order_id] = order
    _save_orders(orders)

    # 升级用户套餐
    user_id = order.get("user_id", "default")
    target_plan = order.get("target_plan", "pro")
    ok, msg = tokens.upgrade_plan(user_id, target_plan)

    return {
        "ok": True,
        "order_id": order_id,
        "user_id": user_id,
        "plan_upgraded": target_plan,
        "upgrade_msg": msg,
    }


def _verify_signature(data, sign):
    """签名验证（占位，当前始终返回 True）.

    真实实现：
        WeChat Pay: 用商户 API key 对回调参数重新计算签名，与 sign 比对
        Stripe: 用 webhook secret 验证 HMAC-SHA256 签名
    """
    # TODO: 接入真实支付时实现签名验证
    return True


# ── WeChat Pay 接口（预留）──

def wechat_pay_create(user_id, plan):
    """微信支付下单（预留接口，当前返回mock）."""
    return create_order(user_id, plan, amount=0, channel=PAYMENT_CHANNEL_WECHAT)


def wechat_pay_callback(raw_data):
    """微信支付回调入口（预留接口）.

    真实实现中，raw_data 是微信回调的 XML/JSON，需解析后调用 handle_callback。
    """
    # TODO: 解析微信回调 XML，提取 order_id 和 sign
    return handle_callback(raw_data)


# ── Stripe 接口（预留）──

def stripe_create(user_id, plan):
    """Stripe 支付下单（预留接口，当前返回mock）."""
    return create_order(user_id, plan, amount=0, channel=PAYMENT_CHANNEL_STRIPE)


def stripe_webhook(payload, signature):
    """Stripe webhook 回调入口（预留接口）.

    真实实现中，用 webhook secret 验证 signature，解析 event 后调用 handle_callback。
    """
    # TODO: 验证 Stripe-Signature，解析 event
    return handle_callback(payload)
