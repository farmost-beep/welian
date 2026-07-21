// Tests for multi-platform IM modules: types, bind, dispatcher, telegram adapter, agent_callback.
// All external calls (LLM, Telegram API, local agent tunnel) are mocked.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";
import {
  makeIncoming, makeOutgoing, platformScopedId, kvKeys, generateBindCode, PLATFORMS,
} from "../src/im/types.js";
import { handleBindStart, handleBindConfirm, handleUnbind, lookupBinding } from "../src/im/bind.js";
import { dispatch } from "../src/im/dispatcher.js";
import * as telegram from "../src/im/telegram.js";
import * as feishu from "../src/im/feishu.js";
import * as dingtalk from "../src/im/dingtalk.js";
import { getTunnelUrl, isAgentOnline, queryLocalData, execLocalTool } from "../src/im/agent_callback.js";
import { mockKV, baseEnv, jsonReq } from "./helpers.js";

// ─────────────────────────────────────────────────────────────
// types.js
// ─────────────────────────────────────────────────────────────

describe("im/types", () => {
  it("platformScopedId joins platform + id with underscore", () => {
    expect(platformScopedId("telegram", "12345")).toBe("telegram_12345");
  });

  it("kvKeys.bind produces <platform>_bind:<scoped> key", () => {
    expect(kvKeys.bind("telegram", "telegram_12345")).toBe("telegram_bind:telegram_12345");
  });

  it("kvKeys.userPlatform produces im_user:<clerkId>:<platform> key", () => {
    expect(kvKeys.userPlatform("clerk_xxx", "telegram")).toBe("im_user:clerk_xxx:telegram");
  });

  it("generateBindCode returns 6-digit string", () => {
    const code = generateBindCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("makeIncoming throws on missing required fields", () => {
    expect(() => makeIncoming({ platform: "telegram" })).toThrow();
  });

  it("makeOutgoing throws on missing required fields", () => {
    expect(() => makeOutgoing({ platform: "telegram", chatId: "1" })).toThrow();
  });

  it("PLATFORMS includes all 4 platforms", () => {
    expect(PLATFORMS).toEqual(["telegram", "feishu", "dingtalk", "whatsapp"]);
  });
});

// ─────────────────────────────────────────────────────────────
// bind.js
// ─────────────────────────────────────────────────────────────

describe("im/bind", () => {
  let env;
  beforeEach(() => {
    env = baseEnv({ USER_DATA: mockKV() });
  });

  describe("handleBindStart", () => {
    it("rejects unsupported platform", async () => {
      const r = await handleBindStart(env, { platform: "slack", platform_user_id: "1", chat_id: "1" });
      expect(r.status).toBe(400);
    });

    it("rejects missing platform_user_id", async () => {
      const r = await handleBindStart(env, { platform: "telegram", chat_id: "1" });
      expect(r.status).toBe(400);
    });

    it("returns code + bind_url on success", async () => {
      const r = await handleBindStart(env, { platform: "telegram", platform_user_id: "123", chat_id: "123" });
      expect(r.status).toBe(200);
      expect(r.data.code).toMatch(/^\d{6}$/);
      expect(r.data.bind_url).toContain("welian.app/bind?platform=telegram&code=");
      expect(r.data.expires_in).toBe(600);
    });

    it("stores bind_code in KV", async () => {
      const r = await handleBindStart(env, { platform: "telegram", platform_user_id: "123", chat_id: "123" });
      const stored = await env.USER_DATA.get(kvKeys.bindCode(r.data.code));
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored);
      expect(parsed.platform).toBe("telegram");
      expect(parsed.platform_user_id).toBe("123");
    });

    it("returns already_bound when binding exists", async () => {
      const scopedId = platformScopedId("telegram", "123");
      await env.USER_DATA.put(kvKeys.bind("telegram", scopedId), "clerk_user1");
      const r = await handleBindStart(env, { platform: "telegram", platform_user_id: "123", chat_id: "123" });
      expect(r.status).toBe(200);
      expect(r.data.already_bound).toBe(true);
      expect(r.data.clerk_user_id).toBe("clerk_user1");
    });
  });

  describe("handleBindConfirm", () => {
    it("rejects missing clerkUserId", async () => {
      const r = await handleBindConfirm(env, null, { code: "123456" });
      expect(r.status).toBe(401);
    });

    it("rejects non-6-digit code", async () => {
      const r = await handleBindConfirm(env, "clerk_x", { code: "12345" });
      expect(r.status).toBe(400);
    });

    it("returns 404 for unknown code", async () => {
      const r = await handleBindConfirm(env, "clerk_x", { code: "999999" });
      expect(r.status).toBe(404);
    });

    it("stores binding + consumes code on success", async () => {
      // Start binding
      const start = await handleBindStart(env, { platform: "telegram", platform_user_id: "123", chat_id: "123" });
      const code = start.data.code;
      // Confirm
      const r = await handleBindConfirm(env, "clerk_user1", { code });
      expect(r.status).toBe(200);
      expect(r.data.ok).toBe(true);
      expect(r.data.platform).toBe("telegram");
      // Verify KV
      const scopedId = platformScopedId("telegram", "123");
      expect(await env.USER_DATA.get(kvKeys.bind("telegram", scopedId))).toBe("clerk_user1");
      // Reverse mapping now stores JSON with chat_id for proactive push
      const reverseRaw = await env.USER_DATA.get(kvKeys.userPlatform("clerk_user1", "telegram"));
      const reverse = JSON.parse(reverseRaw);
      expect(reverse.scoped_id).toBe(scopedId);
      expect(reverse.chat_id).toBe("123");
      // Code consumed
      expect(await env.USER_DATA.get(kvKeys.bindCode(code))).toBeNull();
    });
  });

  describe("lookupBinding", () => {
    it("returns clerk_user_id when bound", async () => {
      const scopedId = platformScopedId("telegram", "123");
      await env.USER_DATA.put(kvKeys.bind("telegram", scopedId), "clerk_user1");
      const r = await lookupBinding(env, "telegram", "123");
      expect(r).toBe("clerk_user1");
    });

    it("returns null when not bound", async () => {
      const r = await lookupBinding(env, "telegram", "999");
      expect(r).toBeNull();
    });
  });

  describe("handleUnbind", () => {
    it("removes binding", async () => {
      const scopedId = platformScopedId("telegram", "123");
      await env.USER_DATA.put(kvKeys.bind("telegram", scopedId), "clerk_user1");
      await env.USER_DATA.put(kvKeys.userPlatform("clerk_user1", "telegram"), scopedId);
      const r = await handleUnbind(env, "clerk_user1", { platform: "telegram" });
      expect(r.status).toBe(200);
      expect(await env.USER_DATA.get(kvKeys.bind("telegram", scopedId))).toBeNull();
      expect(await env.USER_DATA.get(kvKeys.userPlatform("clerk_user1", "telegram"))).toBeNull();
    });

    it("returns 404 when not bound", async () => {
      const r = await handleUnbind(env, "clerk_user1", { platform: "telegram" });
      expect(r.status).toBe(404);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// telegram.js
// ─────────────────────────────────────────────────────────────

describe("im/telegram", () => {
  const env = baseEnv({
    TELEGRAM_BOT_TOKEN: "fake-token",
    TELEGRAM_WEBHOOK_SECRET: "secret-token",
  });

  describe("verifyWebhook", () => {
    it("accepts matching secret token", async () => {
      const req = new Request("https://x.test/im/telegram/webhook", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "secret-token" },
        body: "{}",
      });
      expect(await telegram.verifyWebhook(req, env)).toBe(true);
    });

    it("rejects wrong secret token", async () => {
      const req = new Request("https://x.test/im/telegram/webhook", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong" },
        body: "{}",
      });
      expect(await telegram.verifyWebhook(req, env)).toBe(false);
    });

    it("rejects when secret not configured", async () => {
      const req = new Request("https://x.test/im/telegram/webhook", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "secret-token" },
        body: "{}",
      });
      expect(await telegram.verifyWebhook(req, baseEnv())).toBe(false);
    });
  });

  describe("parseIncoming", () => {
    it("parses text message", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({
          message: {
            message_id: 1,
            from: { id: 12345, first_name: "Alice" },
            chat: { id: 67890 },
            text: "记一下今天和老许聊了合作",
          },
        }),
      });
      const msg = await telegram.parseIncoming(req, env);
      expect(msg.platform).toBe("telegram");
      expect(msg.platformUserId).toBe("12345");
      expect(msg.chatId).toBe("67890");
      expect(msg.text).toBe("记一下今天和老许聊了合作");
      expect(msg.command).toBeNull();
      expect(msg.userName).toBe("Alice");
    });

    it("parses /bind command", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({
          message: { from: { id: 1 }, chat: { id: 2 }, text: "/bind" },
        }),
      });
      const msg = await telegram.parseIncoming(req, env);
      expect(msg.command).toBe("bind");
      expect(msg.text).toBe("");
    });

    it("parses /help with bot username suffix", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({
          message: { from: { id: 1 }, chat: { id: 2 }, text: "/help@welian_bot" },
        }),
      });
      const msg = await telegram.parseIncoming(req, env);
      expect(msg.command).toBe("help");
    });

    it("returns null for non-message updates", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({ callback_query: { id: "1" } }),
      });
      const msg = await telegram.parseIncoming(req, env);
      expect(msg).toBeNull();
    });

    it("returns null for message without text", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({
          message: { from: { id: 1 }, chat: { id: 2 }, sticker: { file_id: "x" } },
        }),
      });
      const msg = await telegram.parseIncoming(req, env);
      expect(msg).toBeNull();
    });
  });

  describe("sendReply", () => {
    let originalFetch;
    let lastCall;
    beforeEach(() => {
      originalFetch = globalThis.fetch;
      lastCall = null;
      globalThis.fetch = async (url, opts) => {
        lastCall = { url, opts };
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      };
    });
    afterEach(() => { globalThis.fetch = originalFetch; });

    it("sends text reply via Telegram API", async () => {
      const msg = makeOutgoing({ platform: "telegram", chatId: "123", text: "hi" });
      const ok = await telegram.sendReply(env, msg);
      expect(ok).toBe(true);
      expect(lastCall.url).toBe("https://api.telegram.org/botfake-token/sendMessage");
      const body = JSON.parse(lastCall.opts.body);
      expect(body.chat_id).toBe("123");
      expect(body.text).toBe("hi");
    });

    it("includes inline_keyboard when buttons present", async () => {
      const msg = makeOutgoing({
        platform: "telegram", chatId: "123", text: "bind",
        buttons: [{ text: "前往绑定", url: "https://welian.app/bind?code=123" }],
      });
      await telegram.sendReply(env, msg);
      const body = JSON.parse(lastCall.opts.body);
      expect(body.reply_markup.inline_keyboard[0][0].url).toContain("welian.app/bind");
    });
  });
});

// ─────────────────────────────────────────────────────────────
// agent_callback.js
// ─────────────────────────────────────────────────────────────

describe("im/agent_callback", () => {
  let env;
  let originalFetch;
  let fetchCalls;
  beforeEach(() => {
    env = baseEnv({ DEVICES: mockKV(), WELIAN_SYNC_SECRET: "secret" });
    originalFetch = globalThis.fetch;
    fetchCalls = [];
    globalThis.fetch = async (url, opts) => {
      fetchCalls.push({ url: url.toString(), opts });
      // Default: return 200 OK
      return new Response(JSON.stringify({ ok: true, status: "ok" }), { status: 200 });
    };
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("getTunnelUrl returns null when not registered", async () => {
    expect(await getTunnelUrl(env, "clerk_x")).toBeNull();
  });

  it("getTunnelUrl returns tunnel_url when registered", async () => {
    await env.DEVICES.put("dev:clerk_x", JSON.stringify({ tunnel_url: "https://t.example.com" }));
    expect(await getTunnelUrl(env, "clerk_x")).toBe("https://t.example.com");
  });

  it("isAgentOnline returns false when no tunnel", async () => {
    expect(await isAgentOnline(env, "clerk_x")).toBe(false);
  });

  it("isAgentOnline returns true when health check ok", async () => {
    await env.DEVICES.put("dev:clerk_x", JSON.stringify({ tunnel_url: "https://t.example.com" }));
    expect(await isAgentOnline(env, "clerk_x")).toBe(true);
    expect(fetchCalls[0].url).toBe("https://t.example.com/cloud/health");
    expect(fetchCalls[0].opts.headers.Authorization).toBe("Bearer clerk_x:secret");
  });

  it("queryLocalData returns null when no tunnel", async () => {
    expect(await queryLocalData(env, "clerk_x")).toBeNull();
  });

  it("queryLocalData returns datasets on success", async () => {
    await env.DEVICES.put("dev:clerk_x", JSON.stringify({ tunnel_url: "https://t.example.com" }));
    globalThis.fetch = async (url, opts) => {
      return new Response(JSON.stringify({
        contacts: [{ name: "老许" }],
        todos: [],
        timeline: [],
      }), { status: 200 });
    };
    const data = await queryLocalData(env, "clerk_x");
    expect(data.contacts).toHaveLength(1);
    expect(data.contacts[0].name).toBe("老许");
  });

  it("execLocalTool returns error when agent offline", async () => {
    const r = await execLocalTool(env, "clerk_x", { type: "shell", command: "ls" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("离线");
  });

  it("execLocalTool returns ok on success", async () => {
    await env.DEVICES.put("dev:clerk_x", JSON.stringify({ tunnel_url: "https://t.example.com" }));
    globalThis.fetch = async (url, opts) => {
      return new Response(JSON.stringify({ ok: true, output: "file1\nfile2" }), { status: 200 });
    };
    const r = await execLocalTool(env, "clerk_x", { type: "shell", command: "ls" });
    expect(r.ok).toBe(true);
    expect(r.output).toBe("file1\nfile2");
  });
});

// ─────────────────────────────────────────────────────────────
// dispatcher.js (integration: bind + commands + LLM mock)
// ─────────────────────────────────────────────────────────────

describe("im/dispatcher", () => {
  let env;
  let llmCalls;
  let deps;
  let originalFetch;

  beforeEach(() => {
    env = baseEnv({ USER_DATA: mockKV(), DEVICES: mockKV() });
    llmCalls = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      // Mock Telegram sendMessage
      if (url.toString().includes("api.telegram.org")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    };
    deps = {
      callLLM: async (prompt, system, env, opts) => {
        llmCalls.push({ prompt, system, opts });
        return { text: "mock reply", usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: "end_turn" };
      },
      deductBilling: async (env, uid, usage, action, detail, tier) => {
        return { billing: { used: 1 }, points: 1 };
      },
      loadDataset: async (env, uid, name) => {
        if (name === "contacts") return [{ name: "老许", company: "腾讯", nature: "leverage" }];
        if (name === "todos") return [{ task: "跟进合作", due: "2026-07-25", contact_name: "老许" }];
        if (name === "timeline") return [{ date: "2026-07-19", summary: "和老许聊了合作", contact_name: "老许" }];
        return [];
      },
      getPrompt: async (env, name, fallback) => fallback,
      trackAction: async (env, uid, action, meta) => {},
    };
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("/help command returns help text without LLM call", async () => {
    const msg = makeIncoming({ platform: "telegram", platformUserId: "1", chatId: "1", command: "help" });
    const out = await dispatch(env, msg, deps);
    expect(out.text).toContain("小维命令");
    expect(llmCalls).toHaveLength(0);
  });

  it("/bind command returns bind card with code + url", async () => {
    const msg = makeIncoming({ platform: "telegram", platformUserId: "1", chatId: "1", command: "bind" });
    const out = await dispatch(env, msg, deps);
    expect(out.text).toMatch(/\d{6}/);
    expect(out.text).toContain("welian.app/bind");
    expect(out.buttons[0].url).toContain("welian.app/bind");
    expect(llmCalls).toHaveLength(0);
  });

  it("/reset command clears session", async () => {
    // First, populate session with a chat
    const bind = await handleBindStart(env, { platform: "telegram", platform_user_id: "1", chat_id: "1" });
    await handleBindConfirm(env, "clerk_u1", { code: bind.data.code });
    const chatMsg = makeIncoming({ platform: "telegram", platformUserId: "1", chatId: "1", text: "hi" });
    await dispatch(env, chatMsg, deps);
    expect(llmCalls).toHaveLength(1);
    // /reset
    const resetMsg = makeIncoming({ platform: "telegram", platformUserId: "1", chatId: "1", command: "reset" });
    const out = await dispatch(env, resetMsg, deps);
    expect(out.text).toContain("已清空");
  });

  it("unbound user gets bind prompt", async () => {
    const msg = makeIncoming({ platform: "telegram", platformUserId: "1", chatId: "1", text: "hi" });
    const out = await dispatch(env, msg, deps);
    expect(out.text).toContain("绑定");
    expect(llmCalls).toHaveLength(0);
  });

  it("bound user chat triggers LLM with data context", async () => {
    const bind = await handleBindStart(env, { platform: "telegram", platform_user_id: "1", chat_id: "1" });
    await handleBindConfirm(env, "clerk_u1", { code: bind.data.code });
    const msg = makeIncoming({ platform: "telegram", platformUserId: "1", chatId: "1", text: "老许有什么待办" });
    const out = await dispatch(env, msg, deps);
    expect(out.text).toBe("mock reply");
    expect(llmCalls).toHaveLength(1);
    // System prompt should contain data context
    expect(llmCalls[0].system).toContain("老许");
    expect(llmCalls[0].system).toContain("腾讯");
    expect(llmCalls[0].system).toContain("跟进合作");
  });

  it("/status shows bind + agent online status", async () => {
    const bind = await handleBindStart(env, { platform: "telegram", platform_user_id: "1", chat_id: "1" });
    await handleBindConfirm(env, "clerk_u1", { code: bind.data.code });
    const msg = makeIncoming({ platform: "telegram", platformUserId: "1", chatId: "1", command: "status" });
    const out = await dispatch(env, msg, deps);
    expect(out.text).toContain("已绑定");
    expect(out.text).toContain("离线"); // no tunnel registered
  });

  it("unknown command returns error hint", async () => {
    const msg = makeIncoming({ platform: "telegram", platformUserId: "1", chatId: "1", command: "foobar" });
    const out = await dispatch(env, msg, deps);
    expect(out.text).toContain("未知命令");
  });

  it("/unbind removes binding", async () => {
    const bind = await handleBindStart(env, { platform: "telegram", platform_user_id: "1", chat_id: "1" });
    await handleBindConfirm(env, "clerk_u1", { code: bind.data.code });
    const msg = makeIncoming({ platform: "telegram", platformUserId: "1", chatId: "1", command: "unbind" });
    const out = await dispatch(env, msg, deps);
    expect(out.text).toContain("已解绑");
    expect(await lookupBinding(env, "telegram", "1")).toBeNull();
  });

  it("LLM failure returns graceful fallback", async () => {
    const bind = await handleBindStart(env, { platform: "telegram", platform_user_id: "1", chat_id: "1" });
    await handleBindConfirm(env, "clerk_u1", { code: bind.data.code });
    deps.callLLM = async () => null;
    const msg = makeIncoming({ platform: "telegram", platformUserId: "1", chatId: "1", text: "hi" });
    const out = await dispatch(env, msg, deps);
    expect(out.text).toContain("回复生成失败");
  });
});

// ─────────────────────────────────────────────────────────────
// End-to-end: worker.js webhook route
// ─────────────────────────────────────────────────────────────

describe("worker /im/* routes", () => {
  let env;
  let originalFetch;
  beforeEach(() => {
    env = baseEnv({
      USER_DATA: mockKV(),
      DEVICES: mockKV(),
      TELEGRAM_BOT_TOKEN: "fake-token",
      TELEGRAM_WEBHOOK_SECRET: "secret-token",
    });
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      if (url.toString().includes("api.telegram.org")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.toString().includes("/v1/messages")) {
        return new Response(JSON.stringify({
          content: [{ type: "text", text: "worker e2e reply" }],
          usage: { input_tokens: 5, output_tokens: 3 },
        }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    };
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("POST /im/telegram/webhook rejects without secret token", async () => {
    const req = jsonReq("/im/telegram/webhook", {
      body: { message: { from: { id: 1 }, chat: { id: 2 }, text: "hi" } },
    });
    const res = await worker.fetch(req, env, { waitUntil: () => {} });
    expect(res.status).toBe(401);
  });

  it("POST /im/telegram/webhook accepts and acks", async () => {
    const req = new Request("https://worker.test/im/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": "secret-token",
      },
      body: JSON.stringify({ message: { from: { id: 1 }, chat: { id: 2 }, text: "/help" } }),
    });
    const res = await worker.fetch(req, env, { waitUntil: () => {} });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("POST /im/bind/start returns code", async () => {
    const req = jsonReq("/im/bind/start", {
      body: { platform: "telegram", platform_user_id: "123", chat_id: "123" },
    });
    const res = await worker.fetch(req, env, { waitUntil: () => {} });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.code).toMatch(/^\d{6}$/);
  });

  it("POST /im/bind/confirm requires auth", async () => {
    const req = jsonReq("/im/bind/confirm", { body: { code: "123456" } });
    const res = await worker.fetch(req, env, { waitUntil: () => {} });
    expect(res.status).toBe(401);
  });

  it("POST /im/feishu/webhook accepts and acks", async () => {
    const req = new Request("https://worker.test/im/feishu/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "url_verification",
        challenge: "test-challenge-123",
      }),
    });
    const res = await worker.fetch(req, env, { waitUntil: () => {} });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.challenge).toBe("test-challenge-123");
  });

  it("POST /im/dingtalk/webhook accepts and acks", async () => {
    const req = jsonReq("/im/dingtalk/webhook", {
      body: {
        conversationId: "cid123",
        senderStaffId: "staff456",
        senderNick: "Alice",
        msgtype: "text",
        text: { content: "/help" },
      },
    });
    const res = await worker.fetch(req, baseEnv({
      USER_DATA: mockKV(),
      DINGTALK_APP_KEY: "key",
      DINGTALK_APP_SECRET: "secret",
    }), { waitUntil: () => {} });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// feishu.js
// ─────────────────────────────────────────────────────────────

describe("im/feishu", () => {
  const env = baseEnv({
    FEISHU_APP_ID: "cli_test",
    FEISHU_APP_SECRET: "test-secret",
    FEISHU_ENCRYPT_KEY: "encrypt-key-123",
    FEISHU_VERIFICATION_TOKEN: "verif-token-456",
  });

  describe("verifyWebhook", () => {
    it("accepts when no encrypt key configured (falls back to body token)", async () => {
      const envNoKey = baseEnv({ FEISHU_VERIFICATION_TOKEN: "tok" });
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({ type: "url_verification", challenge: "x" }),
      });
      expect(await feishu.verifyWebhook(req, envNoKey)).toBe(true);
    });

    it("rejects wrong signature when encrypt key configured", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        headers: {
          "X-Lark-Request-Timestamp": "123",
          "X-Lark-Request-Nonce": "abc",
          "X-Lark-Signature": "wrong-signature",
        },
        body: JSON.stringify({ event: {} }),
      });
      expect(await feishu.verifyWebhook(req, env)).toBe(false);
    });
  });

  describe("parseIncoming", () => {
    it("handles url_verification event", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({ type: "url_verification", challenge: "challenge-xyz" }),
      });
      const result = await feishu.parseIncoming(req, env);
      expect(result.isVerification).toBe(true);
      expect(result.challenge).toBe("challenge-xyz");
    });

    it("parses text message event", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({
          event: {
            message: {
              chat_id: "oc_test_chat",
              message_type: "text",
              content: JSON.stringify({ text: "记一下今天和老许聊了合作" }),
            },
            sender: {
              sender_id: { open_id: "ou_test_user", name: "Alice" },
            },
          },
        }),
      });
      const msg = await feishu.parseIncoming(req, env);
      expect(msg.platform).toBe("feishu");
      expect(msg.platformUserId).toBe("ou_test_user");
      expect(msg.chatId).toBe("oc_test_chat");
      expect(msg.text).toBe("记一下今天和老许聊了合作");
      expect(msg.command).toBeNull();
    });

    it("parses /bind command", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({
          event: {
            message: {
              chat_id: "oc_test",
              message_type: "text",
              content: JSON.stringify({ text: "/bind" }),
            },
            sender: { sender_id: { open_id: "ou_test" } },
          },
        }),
      });
      const msg = await feishu.parseIncoming(req, env);
      expect(msg.command).toBe("bind");
    });

    it("strips @bot mentions in group chat", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({
          event: {
            message: {
              chat_id: "oc_group",
              message_type: "text",
              content: JSON.stringify({ text: "@_user_1 你好" }),
            },
            sender: { sender_id: { open_id: "ou_test" } },
          },
        }),
      });
      const msg = await feishu.parseIncoming(req, env);
      expect(msg.text).toBe("你好");
    });

    it("returns null for non-text message", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({
          event: {
            message: { chat_id: "oc_test", message_type: "image", content: "{}" },
            sender: { sender_id: { open_id: "ou_test" } },
          },
        }),
      });
      const msg = await feishu.parseIncoming(req, env);
      expect(msg).toBeNull();
    });

    it("rejects wrong verification_token", async () => {
      const envNoEncrypt = baseEnv({ FEISHU_VERIFICATION_TOKEN: "correct-token" });
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({
          token: "wrong-token",
          event: {
            message: { chat_id: "oc", message_type: "text", content: '{"text":"hi"}' },
            sender: { sender_id: { open_id: "ou" } },
          },
        }),
      });
      const msg = await feishu.parseIncoming(req, envNoEncrypt);
      expect(msg).toBeNull();
    });
  });

  describe("sendReply", () => {
    let originalFetch;
    let fetchCalls;
    beforeEach(() => {
      originalFetch = globalThis.fetch;
      fetchCalls = [];
      globalThis.fetch = async (url, opts) => {
        fetchCalls.push({ url: url.toString(), opts });
        if (url.toString().includes("/auth/v3/tenant_access_token")) {
          return new Response(JSON.stringify({
            code: 0, tenant_access_token: "t-token-123", expire: 7200,
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ code: 0 }), { status: 200 });
      };
    });
    afterEach(() => { globalThis.fetch = originalFetch; });

    it("sends text reply via Feishu API", async () => {
      const msg = makeOutgoing({ platform: "feishu", chatId: "oc_test", text: "你好" });
      const ok = await feishu.sendReply(env, msg);
      expect(ok).toBe(true);
      // Last call is always send message (token may be cached from prior test)
      const sendCall = fetchCalls.find(c => c.url.includes("/im/v1/messages"));
      expect(sendCall).toBeTruthy();
      const body = JSON.parse(sendCall.opts.body);
      expect(body.receive_id).toBe("oc_test");
      expect(body.msg_type).toBe("text");
    });

    it("sends interactive card when buttons present", async () => {
      const msg = makeOutgoing({
        platform: "feishu", chatId: "oc_test", text: "绑定",
        isCard: true,
        buttons: [{ text: "前往绑定", url: "https://welian.app/bind?code=123" }],
      });
      await feishu.sendReply(env, msg);
      const sendCall = fetchCalls.find(c => c.url.includes("/im/v1/messages"));
      const body = JSON.parse(sendCall.opts.body);
      expect(body.msg_type).toBe("interactive");
    });
  });
});

// ─────────────────────────────────────────────────────────────
// dingtalk.js
// ─────────────────────────────────────────────────────────────

describe("im/dingtalk", () => {
  const env = baseEnv({
    DINGTALK_APP_KEY: "ding_test_key",
    DINGTALK_APP_SECRET: "ding_test_secret",
  });

  describe("verifyWebhook", () => {
    it("rejects when DINGTALK_APP_SECRET not set", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        headers: { timestamp: "123", sign: "abc" },
        body: "{}",
      });
      expect(await dingtalk.verifyWebhook(req, baseEnv())).toBe(false);
    });

    it("accepts when no sign headers (falls back to body validation)", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({ msgtype: "text", text: { content: "hi" } }),
      });
      expect(await dingtalk.verifyWebhook(req, env)).toBe(true);
    });
  });

  describe("parseIncoming", () => {
    it("parses text message", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({
          conversationId: "cid123",
          senderStaffId: "staff456",
          senderNick: "Alice",
          msgtype: "text",
          text: { content: "老许有什么待办" },
          sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=xxx",
        }),
      });
      const msg = await dingtalk.parseIncoming(req, env);
      expect(msg.platform).toBe("dingtalk");
      expect(msg.platformUserId).toBe("staff456");
      expect(msg.chatId).toBe("cid123");
      expect(msg.text).toBe("老许有什么待办");
      expect(msg.userName).toBe("Alice");
      expect(msg.raw.sessionWebhook).toContain("sendBySession");
    });

    it("parses /bind command", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({
          conversationId: "cid",
          senderStaffId: "sid",
          msgtype: "text",
          text: { content: "/bind" },
        }),
      });
      const msg = await dingtalk.parseIncoming(req, env);
      expect(msg.command).toBe("bind");
    });

    it("returns null for non-text message", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({
          conversationId: "cid", senderStaffId: "sid",
          msgtype: "image", picture: { downloadCode: "x" },
        }),
      });
      const msg = await dingtalk.parseIncoming(req, env);
      expect(msg).toBeNull();
    });

    it("returns null when missing senderStaffId", async () => {
      const req = new Request("https://x.test", {
        method: "POST",
        body: JSON.stringify({
          conversationId: "cid",
          msgtype: "text",
          text: { content: "hi" },
        }),
      });
      const msg = await dingtalk.parseIncoming(req, env);
      expect(msg).toBeNull();
    });
  });

  describe("sendReply", () => {
    let originalFetch;
    let fetchCalls;
    beforeEach(() => {
      originalFetch = globalThis.fetch;
      fetchCalls = [];
      globalThis.fetch = async (url, opts) => {
        fetchCalls.push({ url: url.toString(), opts });
        if (url.toString().includes("/oauth2/accessToken")) {
          return new Response(JSON.stringify({
            accessToken: "dt-token-123", expireIn: 7200,
          }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      };
    });
    afterEach(() => { globalThis.fetch = originalFetch; });

    it("uses sessionWebhook when available (no token needed)", async () => {
      const msg = makeOutgoing({ platform: "dingtalk", chatId: "cid", text: "你好" });
      msg.raw = { sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=xxx" };
      const ok = await dingtalk.sendReply(env, msg);
      expect(ok).toBe(true);
      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0].url).toContain("sendBySession");
      const body = JSON.parse(fetchCalls[0].opts.body);
      expect(body.msgtype).toBe("text");
      expect(body.text.content).toBe("你好");
    });

    it("sends ActionCard via sessionWebhook when buttons present", async () => {
      const msg = makeOutgoing({
        platform: "dingtalk", chatId: "cid", text: "绑定",
        isCard: true,
        buttons: [{ text: "前往绑定", url: "https://welian.app/bind?code=123" }],
      });
      msg.raw = { sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=xxx" };
      await dingtalk.sendReply(env, msg);
      const body = JSON.parse(fetchCalls[0].opts.body);
      expect(body.msgtype).toBe("actionCard");
      expect(body.actionCard.btns[0].actionURL).toContain("welian.app/bind");
    });

    it("falls back to oToMessages when no sessionWebhook", async () => {
      const msg = makeOutgoing({ platform: "dingtalk", chatId: "cid", text: "你好" });
      msg.raw = { senderStaffId: "staff123" };
      const ok = await dingtalk.sendReply(env, msg);
      expect(ok).toBe(true);
      // First: get token, second: oToMessages
      expect(fetchCalls[0].url).toContain("/oauth2/accessToken");
      expect(fetchCalls[1].url).toContain("/robot/oToMessages/batchSend");
      const body = JSON.parse(fetchCalls[1].opts.body);
      expect(body.userIds).toEqual(["staff123"]);
      expect(body.msgKey).toBe("sampleText");
    });
  });
});

// ─────────────────────────────────────────────────────────────
// dispatcher with feishu + dingtalk (integration)
// ─────────────────────────────────────────────────────────────

describe("im/dispatcher with feishu + dingtalk", () => {
  let env;
  let llmCalls;
  let deps;
  let originalFetch;

  beforeEach(() => {
    env = baseEnv({ USER_DATA: mockKV(), DEVICES: mockKV() });
    llmCalls = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      if (url.toString().includes("open.feishu.cn") || url.toString().includes("api.dingtalk.com") || url.toString().includes("oapi.dingtalk.com")) {
        return new Response(JSON.stringify({ code: 0, ok: true }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    };
    deps = {
      callLLM: async (prompt, system, env, opts) => {
        llmCalls.push({ prompt, system, opts });
        return { text: "mock reply", usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: "end_turn" };
      },
      deductBilling: async () => ({ billing: { used: 1 }, points: 1 }),
      loadDataset: async (env, uid, name) => {
        if (name === "contacts") return [{ name: "老许", nature: "leverage" }];
        return [];
      },
      getPrompt: async (env, name, fallback) => fallback,
      trackAction: async () => {},
    };
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("feishu /bind returns bind card", async () => {
    const msg = makeIncoming({ platform: "feishu", platformUserId: "ou_test", chatId: "oc_test", command: "bind" });
    const out = await dispatch(env, msg, deps);
    expect(out.text).toMatch(/\d{6}/);
    expect(out.text).toContain("welian.app/bind");
    expect(out.platform).toBe("feishu");
    expect(llmCalls).toHaveLength(0);
  });

  it("dingtalk /bind returns bind card", async () => {
    const msg = makeIncoming({ platform: "dingtalk", platformUserId: "staff123", chatId: "cid123", command: "bind" });
    const out = await dispatch(env, msg, deps);
    expect(out.text).toMatch(/\d{6}/);
    expect(out.platform).toBe("dingtalk");
  });

  it("feishu bound user chat triggers LLM", async () => {
    const bind = await handleBindStart(env, { platform: "feishu", platform_user_id: "ou_test", chat_id: "oc_test" });
    await handleBindConfirm(env, "clerk_feishu", { code: bind.data.code });
    const msg = makeIncoming({ platform: "feishu", platformUserId: "ou_test", chatId: "oc_test", text: "老许是谁" });
    const out = await dispatch(env, msg, deps);
    expect(out.text).toBe("mock reply");
    expect(llmCalls).toHaveLength(1);
    expect(llmCalls[0].system).toContain("老许");
  });

  it("dingtalk bound user chat triggers LLM", async () => {
    const bind = await handleBindStart(env, { platform: "dingtalk", platform_user_id: "staff123", chat_id: "cid123" });
    await handleBindConfirm(env, "clerk_ding", { code: bind.data.code });
    const msg = makeIncoming({ platform: "dingtalk", platformUserId: "staff123", chatId: "cid123", text: "hi" });
    const out = await dispatch(env, msg, deps);
    expect(out.text).toBe("mock reply");
    expect(llmCalls).toHaveLength(1);
  });
});
