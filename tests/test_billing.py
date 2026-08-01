"""Tests for the token billing system (src/welian/tokens.py).

Covers action-based deduction, balance checks, and free/pro tier pricing.
No external services involved — all state lives in the isolated temp usage
file provided by the fresh_data fixture.
"""


def test_token_deduction(fresh_data):
    """consume() deducts the feature cost and reports remaining tokens."""
    tokens = fresh_data["tokens"]
    uid = "bill_user"

    # Fresh free user: 100 tokens
    ok, remaining, msg = tokens.consume(uid, "ai_draft")  # cost = 2
    assert ok is True
    assert remaining == 98
    assert "2" in msg

    # ai_record_enhance costs 1
    ok, remaining, _ = tokens.consume(uid, "ai_record_enhance")
    assert ok is True
    assert remaining == 97

    # annual_report costs 20
    ok, remaining, _ = tokens.consume(uid, "annual_report")
    assert ok is True
    assert remaining == 77

    # total_used accumulates across calls
    bal = tokens.get_balance(uid)
    assert bal["used_this_month"] == 23
    assert bal["remaining"] == 77

    # Unknown feature defaults to cost 1
    ok, remaining, _ = tokens.consume(uid, "unknown_feature")
    assert ok is True
    assert remaining == 76

    # check_and_consume wraps consume (ok path)
    ok, msg = tokens.check_and_consume(uid, "ai_draft")
    assert ok is True


def test_balance_check(fresh_data):
    """get_balance reports plan, allowance, used, remaining; rejects overdraft."""
    tokens = fresh_data["tokens"]
    uid = "bal_user"

    bal = tokens.get_balance(uid)
    assert bal["plan"] == "free"
    assert bal["allowance"] == 100
    assert bal["used_this_month"] == 0
    assert bal["remaining"] == 100
    assert bal["purchased"] == 0

    # Exhaust the free allowance: ai_draft costs 2 → 50 calls = 100 tokens
    for _ in range(50):
        ok, _, _ = tokens.consume(uid, "ai_draft")
        assert ok is True

    # Now balance is 0 → next consume must fail
    ok, remaining, msg = tokens.consume(uid, "ai_draft")
    assert ok is False
    assert remaining == 0
    assert "不够" in msg

    # check_and_consume returns False on insufficient balance
    ok, msg = tokens.check_and_consume(uid, "ai_draft")
    assert ok is False
    assert "不够" in msg

    # Purchased tokens extend the pool
    tokens.add_tokens(uid, 50)
    ok, remaining, _ = tokens.consume(uid, "ai_draft")
    assert ok is True
    assert remaining == 48

    # reset_monthly_allowance zeroes month usage but keeps purchased tokens
    tokens.reset_monthly_allowance(uid)
    bal = tokens.get_balance(uid)
    assert bal["used_this_month"] == 0
    assert bal["purchased"] == 50
    assert bal["remaining"] == 150  # 100 allowance + 50 purchased


def test_tier_pricing(fresh_data):
    """Free vs Pro tier: different monthly allowances; upgrade switches plan."""
    tokens = fresh_data["tokens"]
    uid = "tier_user"

    # Free tier
    bal = tokens.get_balance(uid)
    assert bal["plan"] == "free"
    assert bal["allowance"] == tokens.FREE_MONTHLY_ALLOWANCE == 100

    # Upgrade to Pro
    ok, msg = tokens.upgrade_plan(uid, "pro")
    assert ok is True
    bal = tokens.get_balance(uid)
    assert bal["plan"] == "pro"
    assert bal["allowance"] == tokens.PRO_MONTHLY_ALLOWANCE == 500
    assert bal["remaining"] == 500

    # Pro user can consume more than the free allowance
    ok, remaining, _ = tokens.consume(uid, "annual_report")  # cost 20
    assert ok is True
    assert remaining == 480

    # Token-based billing (cloud mode): input/output priced separately
    # 1000 input + 1000 output → 1 + 2 = 3 points
    ok, remaining, _ = tokens.consume_tokens(uid, 1000, 1000)
    assert ok is True
    assert remaining == 477

    # Tier pricing constants are consistent
    assert tokens.POINTS_PER_1K_INPUT == 1
    assert tokens.POINTS_PER_1K_OUTPUT == 2
    # _compute_token_points rounds up (ceil): 0.5 + 1.0 = 1.5 → 2
    assert tokens._compute_token_points(1, 0) == 1     # 0.001 → ceil 1
    assert tokens._compute_token_points(500, 500) == 2  # 0.5 + 1.0 = 1.5 → ceil 2
    assert tokens._compute_token_points(1000, 1000) == 3  # 1 + 2 = 3
