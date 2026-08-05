// Tests for AI capability endpoints: draft, extract_intent, signals_preview, search.
// No real external API calls (LLM, news sources, search engines are mocked).
// KV is mocked. Auth uses sync-secret bypass.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, authHeader, jsonReq } from "./helpers.js";

// ── Mock response helpers ──

function llmText(text) {
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text }],
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: "end_turn",
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function llmJson(obj) {
  return llmText(JSON.stringify(obj));
}

function llmUnavailable() {
  return new Response("LLM error", { status: 500 });
}

// ═══════════════════════════════════════════════════════════════
// /ai/draft — draft a message (optional auth, LLM with fallback)
// ═══════════════════════════════════════════════════════════════

describe("/ai/draft", () => {
  const originalFetch = globalThis.fetch;
  let env;

  beforeEach(() => {
    env = baseEnv({ LLM_API_KEY: "fake-key", LLM_BASE_URL: "https://fake.llm.local" });
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("drafts a message with LLM (nurture relationship)", async () => {
    globalThis.fetch = async () => llmText("嘿，好久没联系了，最近怎么样？想你了 😊");
    const req = jsonReq("/ai/draft", {
      body: { name: "妈妈", nature: "nurture", memories: ["上次一起包饺子"] },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toContain("好久没联系");
  });

  it("falls back to template when LLM unavailable (nurture)", async () => {
    globalThis.fetch = async () => { throw new Error("LLM unavailable"); };
    const req = jsonReq("/ai/draft", {
      body: { name: "老张", nature: "nurture" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toContain("老张");
    expect(data.result).toContain("好久没联系");
  });

  it("falls back to template when LLM unavailable (leverage)", async () => {
    globalThis.fetch = async () => { throw new Error("LLM unavailable"); };
    const req = jsonReq("/ai/draft", {
      body: { name: "王总", nature: "leverage" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toContain("王总");
    expect(data.result).toContain("有个事想跟你聊聊");
  });

  it("falls back to generic template when nature is null", async () => {
    globalThis.fetch = async () => { throw new Error("LLM unavailable"); };
    const req = jsonReq("/ai/draft", {
      body: { name: "李四" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toContain("李四");
    expect(data.result).toContain("好久不见");
  });

  it("works without authentication (optional auth)", async () => {
    globalThis.fetch = async () => llmText("你好，最近怎么样？");
    const req = jsonReq("/ai/draft", {
      body: { name: "测试", nature: "leverage" },
      // No auth header
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toBeTruthy();
  });

  it("uses last_interaction and user_context in prompt", async () => {
    let capturedPrompt = "";
    globalThis.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      capturedPrompt = body.messages?.[0]?.content || "";
      return llmText("测试回复");
    };
    const req = jsonReq("/ai/draft", {
      body: {
        name: "老许",
        nature: "leverage",
        last_interaction: "上周聊了Q3预算",
        user_context: "想约下周吃饭",
        tone: "formal",
      },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    expect(capturedPrompt).toContain("上周聊了Q3预算");
    expect(capturedPrompt).toContain("想约下周吃饭");
    expect(capturedPrompt).toContain("formal");
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/extract_intent — intent extraction + data actions
// ═══════════════════════════════════════════════════════════════

describe("/ai/extract_intent", () => {
  const originalFetch = globalThis.fetch;
  let env;

  beforeEach(() => { env = baseEnv(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("requires auth (401)", async () => {
    const req = jsonReq("/ai/extract_intent", { body: { text: "记一下" } });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });

  it("rejects missing text with 400", async () => {
    const req = jsonReq("/ai/extract_intent", {
      body: {},
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });

  it("returns 502 when LLM unavailable", async () => {
    globalThis.fetch = async () => { throw new Error("LLM unavailable"); };
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "记一下今天和老许聊了项目" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(502);
  });

  it("extracts record intent and creates timeline entry", async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c-laoxu', name: '老许' },
    ]));
    globalThis.fetch = async () => llmJson({
      intent: "record",
      contact_name: "老许",
      keywords: [],
      actions: [{ type: "add_timeline", contact_name: "老许", summary: "聊了项目合作", date: "2026-07-27" }],
    });
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "记一下今天和老许聊了项目合作" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent).toBe("record");
    // Timeline should be created in KV
    const timeline = JSON.parse(env.USER_DATA._store.get("timeline:testuser") || "[]");
    expect(timeline.length).toBeGreaterThanOrEqual(1);
  });

  it("extracts add_todo action and creates todo", async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c-zhangzong', name: '张总' },
    ]));
    globalThis.fetch = async () => llmJson({
      intent: "record",
      contact_name: "张总",
      keywords: [],
      actions: [{ type: "add_todo", task: "联系张总", contact_name: "张总", due: "2026-08-03", priority: "P1", source: "ai_extract" }],
    });
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "提醒我下周联系张总" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const todos = JSON.parse(env.USER_DATA._store.get("todos:testuser") || "[]");
    expect(todos.length).toBeGreaterThanOrEqual(1);
    expect(todos[0].task).toBe("联系张总");
    expect(todos[0].source).toBe("chat");
    expect(todos[0].event_id).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 0));
    const events = JSON.parse(env.USER_DATA._store.get("domain_events:testuser") || "[]");
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_type: "todo_created", source: "chat", contact_id: "c-zhangzong" }),
    ]));
  });

  it("extracts add_contact action and creates contact", async () => {
    globalThis.fetch = async () => llmJson({
      intent: "record",
      contact_name: "李明",
      keywords: [],
      actions: [{ type: "add_contact", name: "李明", relation: "同行", notes: "AI峰会认识" }],
    });
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "认识了李明，同行，AI峰会认识的" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const contacts = JSON.parse(env.USER_DATA._store.get("contacts:testuser") || "[]");
    expect(contacts.length).toBeGreaterThanOrEqual(1);
    expect(contacts[0].name).toBe("李明");
  });

  it("extracts query_contact intent (no data actions)", async () => {
    globalThis.fetch = async () => llmJson({
      intent: "query_contact",
      contact_name: "老许",
      keywords: ["老许"],
      actions: [],
    });
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "老许啥情况" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent).toBe("query_contact");
    expect(data.actions).toEqual([]);
  });

  it("falls back to chat intent when LLM returns non-JSON", async () => {
    globalThis.fetch = async () => llmText("这不是JSON，只是一段文字");
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "你好" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent).toBe("chat");
    expect(data.actions).toEqual([]);
  });

  it("onboarding mode creates contacts from description", async () => {
    globalThis.fetch = async () => llmJson({
      intent: "record",
      contact_name: "",
      keywords: [],
      actions: [
        { type: "add_contact", name: "王总", relation: "合作者", notes: "" },
        { type: "add_contact", name: "刘总", relation: "合作者", notes: "" },
      ],
    });
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "上周和王总、刘总开了个会", onboarding: true },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const contacts = JSON.parse(env.USER_DATA._store.get("contacts:testuser") || "[]");
    expect(contacts.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/signals_preview — public signals (no auth, cached)
// ═══════════════════════════════════════════════════════════════

describe("/ai/signals_preview", () => {
  const originalFetch = globalThis.fetch;
  let env;

  beforeEach(() => { env = baseEnv(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns 200 without auth (public endpoint)", async () => {
    // Mock all news sources to return empty (fallback path)
    globalThis.fetch = async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    const req = jsonReq("/ai/signals_preview", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.report).toBeDefined();
  });

  it("returns cached report on second call (no refetch)", async () => {
    // Pre-seed a cached signals preview
    const cacheKey = `signals_preview:${new Date().toISOString().slice(0, 13)}`;
    const cachedReport = {
      ok: true,
      report: {
        greeting: "缓存测试",
        signals: [{ title: "缓存信号", url: "https://example.com", source: "test", points: 5, value_score: 8, why: "测试", tags: ["test"] }],
        themes: ["测试主题"],
        closing: "测试收尾",
      },
    };
    await env.USER_DATA.put(cacheKey, JSON.stringify(cachedReport));

    let fetchCalled = false;
    globalThis.fetch = async () => { fetchCalled = true; return new Response("{}", { status: 200 }); };

    const req = jsonReq("/ai/signals_preview", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.report.greeting).toBe("缓存测试");
    expect(fetchCalled).toBe(false); // Should use cache
  });

  it("bypasses cache with ?refresh=1", async () => {
    // Pre-seed cache
    const cacheKey = `signals_preview:${new Date().toISOString().slice(0, 13)}`;
    await env.USER_DATA.put(cacheKey, JSON.stringify({
      ok: true,
      report: { greeting: "旧缓存", signals: [{ title: "旧", url: "https://old.com", source: "test", points: 1, value_score: 1, why: "", tags: [] }], themes: [], closing: "" },
    }));

    // Mock news sources to return empty (fallback)
    globalThis.fetch = async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } });

    const req = new Request("https://worker.test/ai/signals_preview?refresh=1", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    // Should NOT return old cached greeting
    expect(data.report.greeting).not.toBe("旧缓存");
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/search — web search for contact dynamics
// ═══════════════════════════════════════════════════════════════

describe("/ai/search", () => {
  const originalFetch = globalThis.fetch;
  let env;

  beforeEach(() => { env = baseEnv(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("requires auth (401)", async () => {
    const req = jsonReq("/ai/search", { body: { query: "腾讯" } });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });

  it("rejects empty query with 400", async () => {
    const req = jsonReq("/ai/search", {
      body: { query: "" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });

  it("returns search results when provider responds", async () => {
    // Mock all search providers to return empty (wikipedia fallback returns [])
    globalThis.fetch = async () => new Response(JSON.stringify({ results: [] }), {
      status: 200, headers: { "content-type": "application/json" },
    });
    const req = jsonReq("/ai/search", {
      body: { query: "腾讯最新动态" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.search_context).toBeDefined();
    expect(data.provider).toBeTruthy();
    expect(data.results).toBeDefined();
  });
});
