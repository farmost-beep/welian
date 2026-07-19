// Tests for auth endpoints (/auth/sms/*, /auth/wechat) and Paddle payment endpoints.
// No real external API calls (Aliyun, WeChat, Clerk, Paddle are not configured in test env).
// KV is mocked. Tests verify input validation, auth gates, and error handling.
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, authHeader, jsonReq, mockKV } from "./helpers.js";

// ═══════════════════════════════════════════════════════════════
// /auth/sms/send — SMS OTP send
// ═══════════════════════════════════════════════════════════════

describe("/auth/sms/send", () => {
  let env;
  beforeEach(() => {
    env = baseEnv({
      DEVICES: mockKV(),
      ALIYUN_SMS_KEY: "fake-key",
      ALIYUN_SMS_SECRET: "fake-secret",
      ALIYUN_SMS_SIGN: "Welian",
      ALIYUN_SMS_TEMPLATE: "SMS_TEST",
    });
  });

  it("rejects invalid phone number with 400", async () => {
    const req = jsonReq("/auth/sms/send", { body: { phone: "12345" } });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid phone");
  });

  it("rejects missing phone with 400", async () => {
    const req = jsonReq("/auth/sms/send", { body: {} });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });

  it("returns 500 when SMS service not configured", async () => {
    const envNoSms = baseEnv({ DEVICES: mockKV() }); // no ALIYUN_SMS_* vars
    const req = jsonReq("/auth/sms/send", { body: { phone: "13800138000" } });
    const res = await worker.fetch(req, envNoSms, {});
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("not configured");
  });

  it("accepts valid Chinese phone number format", async () => {
    // This will attempt to call Aliyun SMS API which will fail (fake credentials)
    // But it should at least pass validation and try to send
    const req = jsonReq("/auth/sms/send", { body: { phone: "138 0013 8000" } });
    const res = await worker.fetch(req, env, {});
    // Will be 500 (Aliyun API fails with fake creds) or 200 (if mock somehow works)
    // The key assertion is it didn't fail at validation (not 400)
    expect(res.status).not.toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// /auth/sms/verify — SMS OTP verify
// ═══════════════════════════════════════════════════════════════

describe("/auth/sms/verify", () => {
  let env;
  beforeEach(() => {
    env = baseEnv({
      DEVICES: mockKV({ "sms:13800138000": "123456" }),
    });
  });

  it("rejects missing phone or code with 400", async () => {
    const req = jsonReq("/auth/sms/verify", { body: { phone: "13800138000" } });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });

  it("rejects invalid/expired code with 400", async () => {
    const req = jsonReq("/auth/sms/verify", {
      body: { phone: "13800138000", code: "999999" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid or expired");
  });

  it("rejects code for unregistered phone with 400", async () => {
    const req = jsonReq("/auth/sms/verify", {
      body: { phone: "13900139000", code: "123456" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// /auth/wechat — WeChat OAuth redirect
// ═══════════════════════════════════════════════════════════════

describe("/auth/wechat", () => {
  let env;
  beforeEach(() => { env = baseEnv({ WECHAT_APP_ID: "wx_test_app" }); });

  it("redirects to WeChat OAuth URL when configured", async () => {
    const req = new Request("https://worker.test/auth/wechat", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    expect(location).toContain("open.weixin.qq.com");
    expect(location).toContain("wx_test_app");
  });

  it("returns 500 when WeChat App ID not configured", async () => {
    const envNoWechat = baseEnv({}); // no WECHAT_APP_ID
    const req = new Request("https://worker.test/auth/wechat", { method: "GET" });
    const res = await worker.fetch(req, envNoWechat, {});
    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════
// /auth/wechat/callback — WeChat OAuth callback
// ═══════════════════════════════════════════════════════════════

describe("/auth/wechat/callback", () => {
  let env;
  beforeEach(() => {
    env = baseEnv({
      WECHAT_APP_ID: "wx_test",
      WECHAT_APP_SECRET: "secret",
      CLERK_SECRET_KEY: "clerk_secret",
    });
  });

  it("returns 400 when code parameter missing", async () => {
    const req = new Request("https://worker.test/auth/wechat/callback", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });

  it("returns 500 when WeChat or Clerk not configured", async () => {
    const envNoConfig = baseEnv({});
    const req = new Request("https://worker.test/auth/wechat/callback?code=test", { method: "GET" });
    const res = await worker.fetch(req, envNoConfig, {});
    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/paddle/config — Paddle environment config
// ═══════════════════════════════════════════════════════════════

describe("/ai/paddle/config", () => {
  let env;
  beforeEach(() => {
    env = baseEnv({
      PADDLE_ENVIRONMENT: "sandbox",
      PADDLE_CLIENT_TOKEN: "test_token_123",
    });
  });

  it("returns Paddle environment config (no auth required)", async () => {
    const req = new Request("https://worker.test/ai/paddle/config", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.environment).toBe("sandbox");
    expect(data.client_token).toBe("test_token_123");
    expect(data.products).toBeDefined();
    expect(data.products.length).toBeGreaterThan(0);
  });

  it("returns available product list", async () => {
    const req = new Request("https://worker.test/ai/paddle/config", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    const data = await res.json();
    expect(data.products).toContain("pro_monthly");
    expect(data.products).toContain("pro_yearly");
    expect(data.products).toContain("credits_100");
    expect(data.products).toContain("credits_500");
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/paddle/checkout — Paddle checkout URL
// ═══════════════════════════════════════════════════════════════

describe("/ai/paddle/checkout", () => {
  let env;
  beforeEach(() => {
    env = baseEnv({
      PADDLE_PRICE_PRO_MONTHLY: "pri_test_monthly",
      PADDLE_PRICE_PRO_YEARLY: "pri_test_yearly",
    });
  });

  it("requires auth (401 without token)", async () => {
    const req = jsonReq("/ai/paddle/checkout", { body: { product: "pro_monthly" } });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });

  it("rejects invalid product with 400", async () => {
    const req = jsonReq("/ai/paddle/checkout", {
      body: { product: "nonexistent" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("invalid product");
    expect(data.available).toBeDefined();
  });

  it("returns price_id for valid product", async () => {
    const req = jsonReq("/ai/paddle/checkout", {
      body: { product: "pro_monthly" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.price_id).toBe("pri_test_monthly");
    expect(data.user_id).toBeTruthy();
    expect(data.product_type).toBe("upgrade");
  });

  it("returns 500 when price ID not configured", async () => {
    const envNoPrice = baseEnv({}); // no PADDLE_PRICE_* vars
    const req = jsonReq("/ai/paddle/checkout", {
      body: { product: "pro_monthly" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, envNoPrice, {});
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("not configured");
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/paddle/webhook — Paddle webhook handler
// ═══════════════════════════════════════════════════════════════

describe("/ai/paddle/webhook", () => {
  let env;
  beforeEach(() => {
    env = baseEnv({ PADDLE_WEBHOOK_SECRET: "test_webhook_secret" });
  });

  it("rejects webhook without signature (401)", async () => {
    const req = jsonReq("/ai/paddle/webhook", {
      body: { event_type: "subscription.created" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("signature");
  });

  it("rejects webhook with invalid signature format (401)", async () => {
    const req = new Request("https://worker.test/ai/paddle/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Paddle-Signature": "invalid_format",
      },
      body: JSON.stringify({ event_type: "test" }),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });

  it("returns 500 when webhook secret not configured", async () => {
    const envNoSecret = baseEnv({});
    const req = jsonReq("/ai/paddle/webhook", {
      body: { event_type: "test" },
    });
    const res = await worker.fetch(req, envNoSecret, {});
    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/paddle/cancel — Cancel subscription
// ═══════════════════════════════════════════════════════════════

describe("/ai/paddle/cancel", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("requires auth (401 without token)", async () => {
    const req = jsonReq("/ai/paddle/cancel", { body: {} });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });

  it("returns 400 when no active subscription", async () => {
    const req = jsonReq("/ai/paddle/cancel", {
      body: {},
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("No active subscription");
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/pricing — Pricing info
// ═══════════════════════════════════════════════════════════════

describe("/ai/pricing", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("returns pricing info (no auth required)", async () => {
    const req = new Request("https://worker.test/ai/pricing", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pro_price_usd).toBeDefined();
    expect(data.discount).toBeDefined();
  });
});
