// Tests for WeChat Pay + invite QR code + subscribe message endpoints.
// No real external API calls (WeChat Pay, access_token, LLM are mocked).
// KV is mocked. Auth uses sync-secret bypass.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, authHeader, jsonReq } from "./helpers.js";

// ── Mock response helpers ──

// WeChat Pay unified order success response (XML with prepay_id)
function wxPayUnifiedSuccess(prepayId = "wx_prepay_12345") {
  const xml = `<xml>
<return_code><![CDATA[SUCCESS]]></return_code>
<result_code><![CDATA[SUCCESS]]></result_code>
<prepay_id><![CDATA[${prepayId}]]></prepay_id>
<trade_type><![CDATA[JSAPI]]></trade_type>
</xml>`;
  return new Response(xml, { status: 200, headers: { "content-type": "application/xml" } });
}

// WeChat Pay unified order failure response
function wxPayUnifiedFail(errMsg = "ORDERPAID") {
  const xml = `<xml>
<return_code><![CDATA[FAIL]]></return_code>
<return_msg><![CDATA[${errMsg}]]></return_msg>
</xml>`;
  return new Response(xml, { status: 200, headers: { "content-type": "application/xml" } });
}

// WeChat Pay notify XML (success callback)
function wxPayNotifyXml(orderId, totalFee, transactionId = "wx_txn_67890") {
  return `<xml>
<return_code><![CDATA[SUCCESS]]></return_code>
<result_code><![CDATA[SUCCESS]]></result_code>
<out_trade_no><![CDATA[${orderId}]]></out_trade_no>
<total_fee><![CDATA[${totalFee}]]></total_fee>
<transaction_id><![CDATA[${transactionId}]]></transaction_id>
</xml>`;
}

// WeChat access token response (for invite QR code)
function wxAccessTokenResponse() {
  return new Response(
    JSON.stringify({ access_token: "mock_access_token_123" }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

// WeChat miniprogram QR code (binary image → 1x1 PNG)
function wxQrCodeImage() {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M8AAQABAABJfQ3oAAAAAElFTkSuQmCC";
  const binary = atob(png);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Response(bytes, { status: 200, headers: { "content-type": "image/png" } });
}

// ═══════════════════════════════════════════════════════════════
// /ai/wxmp_pay/create — create WeChat Pay unified order
// ═══════════════════════════════════════════════════════════════

describe("/ai/wxmp_pay/create", () => {
  const originalFetch = globalThis.fetch;
  let env;

  beforeEach(() => {
    env = baseEnv({
      WXMP_APP_ID: "wx_test_mp",
      WXMP_APP_SECRET: "mp_secret",
      WXMP_MCH_ID: "mch_123",
      WXMP_MCH_KEY: "mch_key_abc",
    });
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("requires auth (401 without token)", async () => {
    const req = jsonReq("/ai/wxmp_pay/create", { body: { product: "pro_monthly" } });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });

  it("rejects invalid product with 400", async () => {
    const req = jsonReq("/ai/wxmp_pay/create", {
      body: { product: "invalid_product" },
      headers: authHeader("wxmp_test_openid_001"),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });

  it("returns 500 when WeChat Pay not configured", async () => {
    const envNoConfig = baseEnv({ WXMP_APP_ID: "wx_test_mp" });
    const req = jsonReq("/ai/wxmp_pay/create", {
      body: { product: "pro_monthly" },
      headers: authHeader("wxmp_test_openid_001"),
    });
    const res = await worker.fetch(req, envNoConfig, {});
    expect(res.status).toBe(500);
  });

  it("returns 400 when user has no openid (non-wxmp user)", async () => {
    const req = jsonReq("/ai/wxmp_pay/create", {
      body: { product: "pro_monthly" },
      headers: authHeader("testuser"),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });

  it("creates order and returns payment params for wxmp user", async () => {
    globalThis.fetch = async () => wxPayUnifiedSuccess();
    const req = jsonReq("/ai/wxmp_pay/create", {
      body: { product: "pro_monthly" },
      headers: authHeader("wxmp_test_openid_001"),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.order_id).toBeTruthy();
    expect(data.payment).toBeTruthy();
    expect(data.payment.timeStamp).toBeTruthy();
    expect(data.payment.nonceStr).toBeTruthy();
    expect(data.payment.package).toContain("prepay_id=");
    expect(data.payment.signType).toBe("MD5");
    expect(data.payment.paySign).toBeTruthy();

    // Verify order stored in KV
    const orderRaw = env.USER_DATA._store.get(`order:${data.order_id}`);
    expect(orderRaw).toBeTruthy();
    const order = JSON.parse(orderRaw);
    expect(order.status).toBe("pending");
    expect(order.amount_cents).toBe(990);
    expect(order.product).toBe("pro_monthly");
  });

  it("returns 500 when WeChat Pay API fails", async () => {
    globalThis.fetch = async () => wxPayUnifiedFail("OUT_TRADE_NO_USED");
    const req = jsonReq("/ai/wxmp_pay/create", {
      body: { product: "credits_100" },
      headers: authHeader("wxmp_test_openid_001"),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(500);
  });

  it("supports all 6 products (pro, professional, credits)", async () => {
    globalThis.fetch = async () => wxPayUnifiedSuccess();
    for (const product of ["pro_monthly", "pro_yearly", "professional_monthly", "professional_yearly", "credits_100", "credits_500"]) {
      const req = jsonReq("/ai/wxmp_pay/create", {
        body: { product },
        headers: authHeader("wxmp_test_openid_001"),
      });
      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/wxmp_pay/notify — WeChat Pay callback (XML)
// ═══════════════════════════════════════════════════════════════

describe("/ai/wxmp_pay/notify", () => {
  let env;

  beforeEach(() => { env = baseEnv(); });

  it("confirms pending order and applies upgrade (pro_monthly)", async () => {
    // Seed a pending order in KV
    const orderId = "ord_test_001";
    const order = {
      order_id: orderId,
      user_id: "wxmp_test_openid_001",
      type: "upgrade",
      id: "pro_monthly",
      amount: 9.9,
      amount_cents: 990,
      status: "pending",
      product: "pro_monthly",
      created_at: new Date().toISOString(),
    };
    await env.USER_DATA.put(`order:${orderId}`, JSON.stringify(order));

    // Send notify XML
    const notifyXml = wxPayNotifyXml(orderId, 990);
    const req = new Request("https://worker.test/ai/wxmp_pay/notify", {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body: notifyXml,
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);

    // Verify order confirmed
    const updatedOrder = JSON.parse(env.USER_DATA._store.get(`order:${orderId}`));
    expect(updatedOrder.status).toBe("confirmed");
    expect(updatedOrder.transaction_id).toBe("wx_txn_67890");

    // Verify billing upgraded to pro
    const billing = JSON.parse(env.USER_DATA._store.get("billing:wxmp_test_openid_001"));
    expect(billing.plan).toBe("pro");
    expect(billing.subscription).toBeTruthy();
    expect(billing.subscription.plan).toBe("pro_monthly");
  });

  it("confirms professional upgrade and applies professional plan", async () => {
    const orderId = "ord_test_prof_001";
    const order = {
      order_id: orderId,
      user_id: "wxmp_test_prof_user",
      type: "upgrade",
      id: "professional_monthly",
      amount: 29.9,
      amount_cents: 2990,
      status: "pending",
      product: "professional_monthly",
      created_at: new Date().toISOString(),
    };
    await env.USER_DATA.put(`order:${orderId}`, JSON.stringify(order));

    const notifyXml = wxPayNotifyXml(orderId, 2990);
    const req = new Request("https://worker.test/ai/wxmp_pay/notify", {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body: notifyXml,
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);

    const billing = JSON.parse(env.USER_DATA._store.get("billing:wxmp_test_prof_user"));
    expect(billing.plan).toBe("professional");
    expect(billing.subscription).toBeTruthy();
    expect(billing.subscription.plan).toBe("professional_monthly");
  });

  it("confirms purchase order and adds credits (credits_500)", async () => {
    const orderId = "ord_test_002";
    const order = {
      order_id: orderId,
      user_id: "wxmp_test_credits",
      type: "purchase",
      id: "500",
      amount: 7.99,
      amount_cents: 799,
      status: "pending",
      product: "credits_500",
      created_at: new Date().toISOString(),
    };
    await env.USER_DATA.put(`order:${orderId}`, JSON.stringify(order));

    const req = new Request("https://worker.test/ai/wxmp_pay/notify", {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body: wxPayNotifyXml(orderId, 799),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);

    const billing = JSON.parse(env.USER_DATA._store.get("billing:wxmp_test_credits"));
    expect(billing.purchased).toBe(500);
  });

  it("is idempotent — second notify on confirmed order returns SUCCESS without re-applying", async () => {
    const orderId = "ord_test_003";
    const order = {
      order_id: orderId,
      user_id: "wxmp_test_idempotent",
      type: "purchase",
      id: "100",
      amount_cents: 199,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    };
    await env.USER_DATA.put(`order:${orderId}`, JSON.stringify(order));

    const req = new Request("https://worker.test/ai/wxmp_pay/notify", {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body: wxPayNotifyXml(orderId, 199),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    // Idempotent: order status stays "confirmed", no double-apply
    const orderAfter = JSON.parse(env.USER_DATA._store.get(`order:${orderId}`));
    expect(orderAfter.status).toBe("confirmed");
    // Billing may be initialized to default free plan by getBillingData, but must NOT have pro upgrade
    const billingRaw = env.USER_DATA._store.get("billing:wxmp_test_idempotent");
    if (billingRaw) {
      const billing = JSON.parse(billingRaw);
      expect(billing.plan).toBe("free");
      expect(billing.purchased).toBe(0);
    }
  });

  it("rejects amount mismatch", async () => {
    const orderId = "ord_test_004";
    const order = {
      order_id: orderId,
      user_id: "wxmp_test_mismatch",
      type: "upgrade",
      id: "pro_monthly",
      amount_cents: 990,
      status: "pending",
    };
    await env.USER_DATA.put(`order:${orderId}`, JSON.stringify(order));

    const req = new Request("https://worker.test/ai/wxmp_pay/notify", {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body: wxPayNotifyXml(orderId, 100), // wrong amount
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    // Order should still be pending (not confirmed)
    const orderAfter = JSON.parse(env.USER_DATA._store.get(`order:${orderId}`));
    expect(orderAfter.status).toBe("pending");
  });

  it("returns ORDER_NOT_FOUND for unknown order", async () => {
    const req = new Request("https://worker.test/ai/wxmp_pay/notify", {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body: wxPayNotifyXml("ord_unknown_999", 990),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("ORDER_NOT_FOUND");
  });

  it("handles FAIL return_code from WeChat", async () => {
    const req = new Request("https://worker.test/ai/wxmp_pay/notify", {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body: "<xml><return_code><![CDATA[FAIL]]></return_code></xml>",
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("FAIL");
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/wxmp_invite_qrcode — generate invite QR code
// ═══════════════════════════════════════════════════════════════

describe("/ai/wxmp_invite_qrcode", () => {
  const originalFetch = globalThis.fetch;
  let env;

  beforeEach(() => {
    env = baseEnv({
      WXMP_APP_ID: "wx_test_mp",
      WXMP_APP_SECRET: "mp_secret",
    });
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("requires auth (401 without token)", async () => {
    const req = jsonReq("/ai/wxmp_invite_qrcode", { body: {} });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });

  it("generates invite code and QR code for authenticated user", async () => {
    globalThis.fetch = async (url) => {
      if (String(url).includes("stable_token")) return wxAccessTokenResponse();
      if (String(url).includes("getwxacodeunlimit")) return wxQrCodeImage();
      return new Response("{}", { status: 200 });
    };

    const req = jsonReq("/ai/wxmp_invite_qrcode", {
      body: {},
      headers: authHeader("wxmp_test_inviter"),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.code).toBeTruthy();
    expect(data.code.length).toBe(6);
    expect(data.qrcode_url).toContain("data:image/png;base64,");

    // Verify invite code stored in KV
    const storedCode = env.USER_DATA._store.get("invite_code:wxmp_test_inviter");
    expect(storedCode).toBe(data.code);
  });

  it("returns cached QR code on second call (no WeChat API call)", async () => {
    // Pre-seed invite code + cached QR
    await env.USER_DATA.put("invite_code:wxmp_test_cached", "ABCDEF");
    await env.USER_DATA.put("invite_qr:wxmp_test_cached", "data:image/png;base64,cached");

    let weChatCalled = false;
    globalThis.fetch = async (url) => {
      if (String(url).includes("getwxacodeunlimit")) weChatCalled = true;
      return new Response("{}", { status: 200 });
    };

    const req = jsonReq("/ai/wxmp_invite_qrcode", {
      body: {},
      headers: authHeader("wxmp_test_cached"),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.code).toBe("ABCDEF");
    expect(data.qrcode_url).toBe("data:image/png;base64,cached");
    expect(weChatCalled).toBe(false); // Should use cache, not call WeChat
  });

  it("returns 500 when WeChat secrets not configured", async () => {
    const envNoConfig = baseEnv({});
    const req = jsonReq("/ai/wxmp_invite_qrcode", {
      body: {},
      headers: authHeader("wxmp_test_noconfig"),
    });
    const res = await worker.fetch(req, envNoConfig, {});
    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/wxmp_subscribe — subscribe message authorization
// ═══════════════════════════════════════════════════════════════

describe("/ai/wxmp_subscribe", () => {
  let env;

  beforeEach(() => { env = baseEnv(); });

  it("requires auth (401 without token)", async () => {
    const req = jsonReq("/ai/wxmp_subscribe", { body: { template_ids: ["todo_due"] } });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });

  it("rejects missing template_ids with 400", async () => {
    const req = jsonReq("/ai/wxmp_subscribe", {
      body: {},
      headers: authHeader("wxmp_test_subscriber"),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });

  it("rejects empty template_ids array with 400", async () => {
    const req = jsonReq("/ai/wxmp_subscribe", {
      body: { template_ids: [] },
      headers: authHeader("wxmp_test_subscriber"),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });

  it("increments subscription count for wxmp user", async () => {
    const req = jsonReq("/ai/wxmp_subscribe", {
      body: { template_ids: ["todo_due"] },
      headers: authHeader("wxmp_test_subscriber"),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify subscription stored in KV
    const subRaw = env.USER_DATA._store.get("subscribe:wxmp_test_subscriber:todo_due");
    expect(subRaw).toBeTruthy();
    const sub = JSON.parse(subRaw);
    expect(sub.count).toBe(1);
    expect(sub.openid).toBe("test_subscriber");
  });

  it("skips (ok+skipped) for non-wxmp user without binding", async () => {
    const req = jsonReq("/ai/wxmp_subscribe", {
      body: { template_ids: ["todo_due"] },
      headers: authHeader("regular_user"),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.skipped).toBe(true);
  });

  it("accumulates count across multiple subscriptions", async () => {
    // First subscription
    await worker.fetch(jsonReq("/ai/wxmp_subscribe", {
      body: { template_ids: ["todo_due"] },
      headers: authHeader("wxmp_test_multi"),
    }), env, {});
    // Second subscription
    await worker.fetch(jsonReq("/ai/wxmp_subscribe", {
      body: { template_ids: ["todo_due"] },
      headers: authHeader("wxmp_test_multi"),
    }), env, {});

    const sub = JSON.parse(env.USER_DATA._store.get("subscribe:wxmp_test_multi:todo_due"));
    expect(sub.count).toBe(2);
  });
});
