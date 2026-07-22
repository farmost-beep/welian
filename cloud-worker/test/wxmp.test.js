// Tests for WeChat Mini Program endpoints (/ai/wxmp_*).
// No real external API calls (WeChat, Clerk, Resend, LLM are mocked).
// KV is mocked. Tests verify input validation, auth gates, binding logic, and error handling.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, authHeader, jsonReq, mockKV } from "./helpers.js";

// ── Mock response helpers ──

function wechatSessionResponse(openid = "test_openid_123", sessionKey = "test_session_key") {
  return new Response(
    JSON.stringify({ openid, session_key: sessionKey }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function wechatErrorResponse(errcode = 40029, errmsg = "invalid code") {
  return new Response(
    JSON.stringify({ errcode, errmsg }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function clerkUsersResponse(users = []) {
  return new Response(
    JSON.stringify(users),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function resendEmailResponse() {
  return new Response(
    JSON.stringify({ id: "email_123" }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function llmJson(obj) {
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text: JSON.stringify(obj) }],
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: "end_turn",
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

// ═══════════════════════════════════════════════════════════════
// /ai/wxmp_login — WeChat Mini Program login
// ═══════════════════════════════════════════════════════════════

describe("/ai/wxmp_login", () => {
  const originalFetch = globalThis.fetch;
  let env;

  beforeEach(() => {
    env = baseEnv({
      WXMP_APP_ID: "wx_test_mp",
      WXMP_APP_SECRET: "mp_secret",
    });
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("rejects missing code with 400", async () => {
    const req = jsonReq("/ai/wxmp_login", { body: {} });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });

  it("returns 500 when WXMP secrets not configured", async () => {
    const envNoConfig = baseEnv({});
    const req = jsonReq("/ai/wxmp_login", { body: { code: "test_code" } });
    const res = await worker.fetch(req, envNoConfig, {});
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("not configured");
  });

  it("returns 401 when WeChat returns errcode", async () => {
    globalThis.fetch = async () => wechatErrorResponse(40029, "invalid code");
    const req = jsonReq("/ai/wxmp_login", { body: { code: "bad_code" } });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Login failed");
  });

  it("creates new wxmp user and returns token (is_new_user=true)", async () => {
    globalThis.fetch = async () => wechatSessionResponse("new_openid_001");
    const req = jsonReq("/ai/wxmp_login", { body: { code: "valid_code" } });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.is_new_user).toBe(true);
    expect(data.openid).toBe("new_openid_001");
    expect(data.token).toContain("wxmp_new_openid_001:secret");
    // Verify wxmp_user mapping stored
    const stored = env.USER_DATA._store.get("wxmp_user:wxmp_new_openid_001");
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored).openid).toBe("new_openid_001");
  });

  it("returns bound Clerk token for already-bound user (is_new_user=false)", async () => {
    // Pre-seed binding
    await env.USER_DATA.put("wechat_bind:wxmp_bound_openid", "user_clerk_123");
    globalThis.fetch = async () => wechatSessionResponse("bound_openid");
    const req = jsonReq("/ai/wxmp_login", { body: { code: "valid_code" } });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.is_new_user).toBe(false);
    expect(data.token).toContain("user_clerk_123:secret");
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/wxmp_register — Register new mini program account
// ═══════════════════════════════════════════════════════════════

describe("/ai/wxmp_register", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("rejects missing openid with 400", async () => {
    const req = jsonReq("/ai/wxmp_register", { body: {} });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });

  it("registers new user and returns token (is_new=true)", async () => {
    const req = jsonReq("/ai/wxmp_register", {
      body: { openid: "reg_openid_001", nickname: "测试用户" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.is_new).toBe(true);
    expect(data.token).toContain("wxmp_reg_openid_001:secret");
    // Verify registration stored
    const stored = env.USER_DATA._store.get("wxmp_registered:wxmp_reg_openid_001");
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored).nickname).toBe("测试用户");
  });

  it("returns existing token for already-registered user (is_existing=true)", async () => {
    // Pre-seed registration
    await env.USER_DATA.put("wxmp_registered:wxmp_reg_openid_002", JSON.stringify({
      openid: "reg_openid_002", nickname: "老用户", created_at: "2026-01-01",
    }));
    const req = jsonReq("/ai/wxmp_register", {
      body: { openid: "reg_openid_002" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.is_existing).toBe(true);
  });

  it("returns bound Clerk token if already bound to Web account", async () => {
    await env.USER_DATA.put("wechat_bind:wxmp_bound_reg", "user_clerk_456");
    const req = jsonReq("/ai/wxmp_register", {
      body: { openid: "bound_reg" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.is_existing).toBe(true);
    expect(data.token).toContain("user_clerk_456:secret");
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/wxmp_bind_sendcode — Send verification code for binding
// ═══════════════════════════════════════════════════════════════

describe("/ai/wxmp_bind_sendcode", () => {
  const originalFetch = globalThis.fetch;
  let env;

  beforeEach(() => {
    env = baseEnv({
      CLERK_SECRET_KEY: "clerk_secret",
      RESEND_API_KEY: "resend_key",
    });
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("rejects missing openid or email with 400", async () => {
    const req1 = jsonReq("/ai/wxmp_bind_sendcode", { body: { email: "test@test.com" } });
    const res1 = await worker.fetch(req1, env, {});
    expect(res1.status).toBe(400);

    const req2 = jsonReq("/ai/wxmp_bind_sendcode", { body: { openid: "test_openid" } });
    const res2 = await worker.fetch(req2, env, {});
    expect(res2.status).toBe(400);
  });

  it("returns 400 when email not found in Clerk", async () => {
    globalThis.fetch = async () => clerkUsersResponse([]); // no users
    const req = jsonReq("/ai/wxmp_bind_sendcode", {
      body: { openid: "test_openid", email: "notfound@test.com" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("未找到");
  });

  it("sends verification code and stores it in KV with 5min TTL", async () => {
    let fetchCallCount = 0;
    globalThis.fetch = async (url) => {
      fetchCallCount++;
      if (String(url).includes("api.clerk.com")) {
        return clerkUsersResponse([{ id: "user_clerk_789" }]);
      }
      if (String(url).includes("api.resend.com")) {
        return resendEmailResponse();
      }
      return new Response("{}", { status: 404 });
    };
    const req = jsonReq("/ai/wxmp_bind_sendcode", {
      body: { openid: "bind_openid_001", email: "existing@test.com" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toContain("验证码");
    // Verify code stored in KV (key uses raw openid, not wxmp_ prefixed)
    const stored = env.USER_DATA._store.get("wxmp_bindcode:bind_openid_001");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored);
    expect(parsed.code).toMatch(/^\d{6}$/);
    expect(parsed.email).toBe("existing@test.com");
    expect(parsed.clerkUserId).toBe("user_clerk_789");
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/wxmp_bind_verify — Verify code and bind
// ═══════════════════════════════════════════════════════════════

describe("/ai/wxmp_bind_verify", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("rejects missing openid or code with 400", async () => {
    const req1 = jsonReq("/ai/wxmp_bind_verify", { body: { code: "123456" } });
    const res1 = await worker.fetch(req1, env, {});
    expect(res1.status).toBe(400);

    const req2 = jsonReq("/ai/wxmp_bind_verify", { body: { openid: "test_openid" } });
    const res2 = await worker.fetch(req2, env, {});
    expect(res2.status).toBe(400);
  });

  it("returns 400 when code expired (not in KV)", async () => {
    const req = jsonReq("/ai/wxmp_bind_verify", {
      body: { openid: "no_code_openid", code: "123456" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("过期");
  });

  it("returns 400 when code is wrong", async () => {
    // Pre-seed code
    await env.USER_DATA.put("wxmp_bindcode:wrong_openid", JSON.stringify({
      code: "654321", email: "test@test.com", clerkUserId: "user_clerk_x", created_at: Date.now(),
    }));
    const req = jsonReq("/ai/wxmp_bind_verify", {
      body: { openid: "wrong_openid", code: "123456" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("错误");
  });

  it("binds successfully and returns Clerk token + consumes code", async () => {
    // Pre-seed code
    await env.USER_DATA.put("wxmp_bindcode:ok_openid", JSON.stringify({
      code: "999888", email: "test@test.com", clerkUserId: "user_clerk_ok", created_at: Date.now(),
    }));
    // Seed contacts for the user (bind endpoint counts contacts)
    await env.USER_DATA.put("contacts:user_clerk_ok", JSON.stringify([
      { id: "c-1", name: "测试联系人" },
    ]));
    const req = jsonReq("/ai/wxmp_bind_verify", {
      body: { openid: "ok_openid", code: "999888" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.token).toContain("user_clerk_ok:secret");
    expect(data.message).toContain("绑定成功");
    // Verify binding stored
    const binding = env.USER_DATA._store.get("wechat_bind:wxmp_ok_openid");
    expect(binding).toBe("user_clerk_ok");
    // Verify code consumed (deleted)
    expect(env.USER_DATA._store.get("wxmp_bindcode:ok_openid")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/wxmp_unbind — Unbind mini program from Web account
// ═══════════════════════════════════════════════════════════════

describe("/ai/wxmp_unbind", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("rejects missing openid and clerk_user_id with 400", async () => {
    const req = jsonReq("/ai/wxmp_unbind", { body: {} });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });

  it("unbinds by openid and returns wxmp token", async () => {
    // Pre-seed binding
    await env.USER_DATA.put("wechat_bind:wxmp_unbind_openid", "user_clerk_unbind");
    const req = jsonReq("/ai/wxmp_unbind", {
      body: { openid: "unbind_openid" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.token).toContain("wxmp_unbind_openid:secret");
    // Verify binding deleted
    expect(env.USER_DATA._store.get("wechat_bind:wxmp_unbind_openid")).toBeUndefined();
  });

  it("unbinds by clerk_user_id (finds binding via list)", async () => {
    // Pre-seed binding
    await env.USER_DATA.put("wechat_bind:wxmp_list_openid", "user_clerk_list");
    const req = jsonReq("/ai/wxmp_unbind", {
      body: { clerk_user_id: "user_clerk_list" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.token).toContain("wxmp_list_openid:secret");
    // Verify binding deleted
    expect(env.USER_DATA._store.get("wechat_bind:wxmp_list_openid")).toBeUndefined();
  });

  it("returns 400 when clerk_user_id not found in bindings", async () => {
    const req = jsonReq("/ai/wxmp_unbind", {
      body: { clerk_user_id: "nonexistent_user" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("未找到");
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/wxmp_contact_stats — Contact stats for mini program
// ═══════════════════════════════════════════════════════════════

describe("/ai/wxmp_contact_stats", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("requires auth (401 without token)", async () => {
    const req = new Request("https://worker.test/ai/wxmp_contact_stats", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });

  it("returns correct stats with nature field variants (leverage/nurture/dual/双重)", async () => {
    // Seed contacts with all nature variants
    await env.USER_DATA.put("contacts:testuser", JSON.stringify([
      { id: "c1", name: "A", nature: "leverage" },
      { id: "c2", name: "B", nature: "nurture" },
      { id: "c3", name: "C", nature: "dual" },
      { id: "c4", name: "D", nature: "双重" },
      { id: "c5", name: "E" }, // no nature
    ]));
    const req = new Request("https://worker.test/ai/wxmp_contact_stats", {
      method: "GET",
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.stats.total).toBe(5);
    // leverage: c1(leverage) + c3(dual) + c4(双重) = 3
    expect(data.stats.leverage).toBe(3);
    // nurture: c2(nurture) + c3(dual) + c4(双重) = 3
    expect(data.stats.nurture).toBe(3);
    // dual: c3(dual) + c4(双重) = 2
    expect(data.stats.dual).toBe(2);
  });

  it("returns zero stats for new user with no contacts", async () => {
    const req = new Request("https://worker.test/ai/wxmp_contact_stats", {
      method: "GET",
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.stats.total).toBe(0);
    expect(data.stats.leverage).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/wxmp_card_scan — Business card OCR + contact creation
// ═══════════════════════════════════════════════════════════════

describe("/ai/wxmp_card_scan", () => {
  const originalFetch = globalThis.fetch;
  let env;
  const mockCtx = { waitUntil: () => {} };

  beforeEach(() => { env = baseEnv(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("requires auth (401 without token)", async () => {
    const req = jsonReq("/ai/wxmp_card_scan", { body: { base64: "fake_base64" } });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(401);
  });

  it("rejects missing base64 with 400", async () => {
    const req = jsonReq("/ai/wxmp_card_scan", { body: {} , headers: authHeader() });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(400);
  });

  it("returns 500 when LLM fails (null result)", async () => {
    globalThis.fetch = async () => { throw new Error("LLM unavailable"); };
    const req = jsonReq("/ai/wxmp_card_scan", {
      body: { base64: "fake_base64_data" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("识别失败");
  });

  it("creates contact from LLM-extracted card info", async () => {
    globalThis.fetch = async () => llmJson({
      name: "张三",
      company: "腾讯",
      title: "产品经理",
      phone: "13800138000",
      email: "zhangsan@tencent.com",
      relation: "同行",
    });
    const req = jsonReq("/ai/wxmp_card_scan", {
      body: { base64: "fake_base64_data", media_type: "image/jpeg" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.is_duplicate).toBe(false);
    expect(data.contact.name).toBe("张三");
    expect(data.contact.company).toBe("腾讯");
    expect(data.contact.nature).toBe("leverage");
    expect(data.contact.tags).toContain("名片扫描");
    // Verify contact saved
    const contacts = JSON.parse(env.USER_DATA._store.get("contacts:testuser"));
    expect(contacts.find(c => c.name === "张三")).toBeTruthy();
  });

  it("returns is_duplicate when contact name already exists", async () => {
    // Pre-seed existing contact
    await env.USER_DATA.put("contacts:testuser", JSON.stringify([
      { id: "c-existing", name: "李四", company: "阿里" },
    ]));
    globalThis.fetch = async () => llmJson({
      name: "李四",
      company: "蚂蚁金服",
      title: "CTO",
      phone: "",
      email: "",
      relation: "客户",
    });
    const req = jsonReq("/ai/wxmp_card_scan", {
      body: { base64: "fake_base64_data" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.is_duplicate).toBe(true);
    expect(data.existing_id).toBe("c-existing");
  });

  it("returns 400 when LLM response has no name", async () => {
    globalThis.fetch = async () => llmJson({
      name: "",
      company: "某公司",
      title: "",
      phone: "",
      email: "",
      relation: "",
    });
    const req = jsonReq("/ai/wxmp_card_scan", {
      body: { base64: "fake_base64_data" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("未识别到姓名");
  });

  it("handles LLM returning JSON wrapped in markdown code block", async () => {
    globalThis.fetch = async () => new Response(
      JSON.stringify({
        content: [{ type: "text", text: "```json\n{\"name\":\"王五\",\"company\":\"百度\",\"title\":\"\",\"phone\":\"\",\"email\":\"\",\"relation\":\"\"}\n```" }],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: "end_turn",
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
    const req = jsonReq("/ai/wxmp_card_scan", {
      body: { base64: "fake_base64_data" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.contact.name).toBe("王五");
  });

  it("does not return JSON strings when LLM returns object/array fields", async () => {
    // LLM sometimes returns relation as an object or name as an array
    globalThis.fetch = async () => llmJson({
      name: ["张三"],               // array → should extract "张三"
      company: { name: "腾讯" },     // object → should extract "腾讯"
      title: { role: "产品经理" },    // object with 'role' key → not in common keys, fallback to first string value
      phone: 13800138000,            // number → should convert to string
      email: "zhangsan@tencent.com",
      relation: { type: "同行" },    // object with 'type' key → should extract "同行"
    });
    const req = jsonReq("/ai/wxmp_card_scan", {
      body: { base64: "fake_base64_data" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.contact.name).toBe("张三");
    expect(data.contact.company).toBe("腾讯");
    expect(data.contact.phone).toBe("13800138000");
    expect(data.contact.relation).toBe("同行");
    // Critical: no field should contain JSON string like {"type":"同行"}
    expect(data.contact.relation).not.toContain("{");
    expect(data.contact.company).not.toContain("{");
    expect(data.contact.name).not.toContain("[");
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/wxmp_bind — Legacy bind endpoint (direct email/clerk_user_id)
// ═══════════════════════════════════════════════════════════════

describe("/ai/wxmp_bind (legacy)", () => {
  const originalFetch = globalThis.fetch;
  let env;

  beforeEach(() => {
    env = baseEnv({ CLERK_SECRET_KEY: "clerk_secret" });
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("rejects missing openid with 400", async () => {
    const req = jsonReq("/ai/wxmp_bind", { body: { email: "test@test.com" } });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });

  it("rejects when neither email nor clerk_user_id provided", async () => {
    const req = jsonReq("/ai/wxmp_bind", { body: { openid: "test_openid" } });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("请提供");
  });

  it("returns 400 when email not found in Clerk", async () => {
    globalThis.fetch = async () => clerkUsersResponse([]);
    const req = jsonReq("/ai/wxmp_bind", {
      body: { openid: "test_openid", email: "notfound@test.com" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("未找到");
  });

  it("returns 400 when bound account has no contacts", async () => {
    globalThis.fetch = async () => clerkUsersResponse([{ id: "user_empty" }]);
    const req = jsonReq("/ai/wxmp_bind", {
      body: { openid: "test_openid", email: "empty@test.com" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("暂无联系人数据");
  });

  it("binds successfully with clerk_user_id when contacts exist", async () => {
    // Seed contacts
    await env.USER_DATA.put("contacts:user_direct", JSON.stringify([
      { id: "c-1", name: "联系人A" },
      { id: "c-2", name: "联系人B" },
    ]));
    const req = jsonReq("/ai/wxmp_bind", {
      body: { openid: "direct_openid", clerk_user_id: "user_direct" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.token).toContain("user_direct:secret");
    expect(data.message).toContain("2 个联系人");
    // Verify binding stored
    expect(env.USER_DATA._store.get("wechat_bind:wxmp_direct_openid")).toBe("user_direct");
  });
});
