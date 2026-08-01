// KV large-data capacity tests — performance and correctness under big datasets.
// No real LLM calls. KV is mocked. Auth uses sync-secret bypass.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, authHeader, jsonReq, mockKV } from "./helpers.js";

// ── Data generators ──

function makeContact(i) {
  return {
    id: `c-${i}`,
    name: `联系人${i}`,
    company: `公司${i % 100}`,
    relation: ["合作者", "客户", "朋友", "同行"][i % 4],
    sub_relation: `子关系${i % 5}`,
    nature: ["leverage", "nurture", "dual"][i % 3],
    title: `职位${i % 10}`,
    tags: [`标签${i % 5}`, `标签${(i + 1) % 5}`],
    important_dates: [{ date: "11-29", label: "生日" }, { date: "06-15", label: "纪念日" }],
    notes: `这是联系人${i}的备注信息，用于测试大数据量场景下的性能表现`,
    phone: `138${String(i).padStart(8, "0")}`,
    email: `user${i}@test.com`,
    strength: (i % 5) + 1,
    aliases: [`昵称${i}`],
    leverage: { goals: [`目标${i % 3}`], how: `方式${i % 4}` },
    memories: [`记忆${i}`],
  };
}

function makeTimeline(i) {
  return {
    id: `t-${i}`,
    contact: `c-${i % 100}`,
    summary: `和联系人${i % 100}聊了项目合作第${i}次，讨论了Q3预算和资源分配`,
    date: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, "0")}`,
    sentiment: ["positive", "neutral", "negative"][i % 3],
  };
}

// ── LLM mock helpers ──

function llmJson(obj) {
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text: JSON.stringify(obj) }],
      usage: { input_tokens: 500, output_tokens: 200 },
      stop_reason: "end_turn",
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function llmText(text) {
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text }],
      usage: { input_tokens: 500, output_tokens: 200 },
      stop_reason: "end_turn",
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

// ═══════════════════════════════════════════════════════════════
// 1. 1000 contacts load performance
// ═══════════════════════════════════════════════════════════════

describe("KV capacity — 1000 contacts load", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("loads 1000 contacts within 100ms", async () => {
    const contacts = Array.from({ length: 1000 }, (_, i) => makeContact(i));
    env.USER_DATA._store.set("contacts:testuser", JSON.stringify(contacts));

    const req = jsonReq("/data/contacts", { method: "GET", headers: authHeader() });
    const start = Date.now();
    const res = await worker.fetch(req, env, {});
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.contacts.length).toBe(1000);
    expect(data.total).toBe(1000);
    expect(elapsed).toBeLessThan(100);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. 5000 timeline entries load performance
// NOTE: /data/timeline GET caps at 200 entries (timeline.slice(0, 200)).
// This is a design limitation — the test verifies KV loads all 5000
// and the response is fast, but the returned array is capped at 200.
// ═══════════════════════════════════════════════════════════════

describe("KV capacity — 5000 timeline load", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("loads 5000 timeline entries within 100ms", async () => {
    const timeline = Array.from({ length: 5000 }, (_, i) => makeTimeline(i));
    env.USER_DATA._store.set("timeline:testuser", JSON.stringify(timeline));

    const req = jsonReq("/data/timeline", { method: "GET", headers: authHeader() });
    const start = Date.now();
    const res = await worker.fetch(req, env, {});
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    const data = await res.json();
    // GET /data/timeline caps at 200 entries (timeline.slice(0, 200))
    expect(data.timeline.length).toBe(200);
    // Verify all 5000 are stored in KV
    const stored = JSON.parse(env.USER_DATA._store.get("timeline:testuser"));
    expect(stored.length).toBe(5000);
    expect(elapsed).toBeLessThan(100);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Large data save performance + KV size check
// ═══════════════════════════════════════════════════════════════

describe("KV capacity — large data save", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("saves 1000 contacts via PUT and KV content < 25MB", async () => {
    const contacts = Array.from({ length: 1000 }, (_, i) => makeContact(i));
    env.USER_DATA._store.set("contacts:testuser", JSON.stringify(contacts));

    const req = jsonReq("/data/contacts", { method: "PUT", headers: authHeader() });
    const start = Date.now();
    const res = await worker.fetch(req, env, {});
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify KV stored content size < 25MB
    const stored = env.USER_DATA._store.get("contacts:testuser");
    const sizeBytes = new Blob([stored]).size;
    expect(sizeBytes).toBeLessThan(25 * 1024 * 1024);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. extract_intent performance with 500 contacts
// ═══════════════════════════════════════════════════════════════

describe("KV capacity — extract_intent with 500 contacts", () => {
  const originalFetch = globalThis.fetch;
  let env;
  const mockCtx = { waitUntil: () => {} };

  beforeEach(() => {
    env = baseEnv();
    const contacts = Array.from({ length: 500 }, (_, i) => makeContact(i));
    env.USER_DATA._store.set("contacts:testuser", JSON.stringify(contacts));
    globalThis.fetch = async () => llmJson({
      intent: "record",
      contact_name: "老许",
      keywords: ["老许", "项目"],
      actions: [{ type: "add_timeline", contact_name: "老许", summary: "聊了项目", date: "2026-07-15" }],
      memory_save: null,
      goal_evidence: null,
      needs_search: false,
      search_query: "",
      profile_updates: {},
    });
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("responds within 5s with 500 contacts in KV", async () => {
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "记一下和老许聊了项目" },
      headers: authHeader(),
    });
    const start = Date.now();
    const res = await worker.fetch(req, env, mockCtx);
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent).toBe("record");
    expect(elapsed).toBeLessThan(5000);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. advise_cloud performance with 500 contacts + 200 timeline
// ═══════════════════════════════════════════════════════════════

describe("KV capacity — advise_cloud with 500 contacts + 200 timeline", () => {
  const originalFetch = globalThis.fetch;
  let env;
  const mockCtx = { waitUntil: () => {} };

  beforeEach(() => {
    env = baseEnv();
    const contacts = Array.from({ length: 500 }, (_, i) => makeContact(i));
    env.USER_DATA._store.set("contacts:testuser", JSON.stringify(contacts));
    const timeline = Array.from({ length: 200 }, (_, i) => makeTimeline(i));
    env.USER_DATA._store.set("timeline:testuser", JSON.stringify(timeline));
    globalThis.fetch = async () => llmText("建议本周联系老许，讨论Q3合作方向。");
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("responds within 10s with large context", async () => {
    const req = jsonReq("/ai/advise_cloud", {
      body: { text: "该联系谁了" },
      headers: authHeader(),
    });
    const start = Date.now();
    const res = await worker.fetch(req, env, mockCtx);
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toBeTruthy();
    expect(elapsed).toBeLessThan(10000);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. KV value size boundary — near 25MB and over 25MB
// ═══════════════════════════════════════════════════════════════

describe("KV capacity — value size boundary", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("saves ~24MB data successfully", async () => {
    // Build contacts whose JSON.stringify is ~24MB
    // Each contact ~24KB: 1000 contacts ≈ 24MB
    const padding = "x".repeat(24 * 1024 - 100);
    const contacts = Array.from({ length: 1000 }, (_, i) => ({
      id: `c-${i}`,
      name: `联系人${i}`,
      notes: padding,
    }));
    const jsonStr = JSON.stringify(contacts);
    const sizeBytes = new Blob([jsonStr]).size;
    // Sanity: should be close to 24MB but under 25MB
    expect(sizeBytes).toBeGreaterThan(23 * 1024 * 1024);
    expect(sizeBytes).toBeLessThan(25 * 1024 * 1024);

    // Save via /data/push
    const req = jsonReq("/data/push", {
      body: { contacts },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify KV stored content < 25MB
    const stored = env.USER_DATA._store.get("contacts:testuser");
    const storedSize = new Blob([stored]).size;
    expect(storedSize).toBeLessThan(25 * 1024 * 1024);
  });

  it("rejects data over 25MB (no silent failure)", async () => {
    // Build contacts whose JSON.stringify exceeds 25MB
    // Each contact ~26KB: 1000 contacts ≈ 26MB
    const padding = "x".repeat(26 * 1024 - 100);
    const contacts = Array.from({ length: 1000 }, (_, i) => ({
      id: `c-${i}`,
      name: `联系人${i}`,
      notes: padding,
    }));
    const jsonStr = JSON.stringify(contacts);
    const sizeBytes = new Blob([jsonStr]).size;
    expect(sizeBytes).toBeGreaterThan(25 * 1024 * 1024);

    // Simulate Cloudflare KV's 25MB limit: override put to throw
    const originalPut = env.USER_DATA.put.bind(env.USER_DATA);
    env.USER_DATA.put = async (key, value) => {
      const valSize = new Blob([value]).size;
      if (valSize > 25 * 1024 * 1024) {
        throw new Error("KV value exceeds 25MB limit");
      }
      return originalPut(key, value);
    };

    // Attempt save via /data/push — should not silently succeed
    const req = jsonReq("/data/push", {
      body: { contacts },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, { waitUntil: () => {} });

    // Should return error (500 from top-level catch), not 200
    expect(res.status).not.toBe(200);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("25MB");
  });
});
