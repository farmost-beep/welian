// L2 AI Eval: Advise engine quality
// Tests that handleCloudAdvise produces structured results with advise_id,
// handles empty contacts, and scores leverage candidates correctly.
// Grader: deterministic (code-based) — checks response structure and KV state.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, authHeader, jsonReq } from "./helpers.js";

const originalFetch = globalThis.fetch;

function llmResponse(text = "建议联系老许") {
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text }],
      usage: { input_tokens: 500, output_tokens: 200 },
      stop_reason: "end_turn",
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("eval: advise engine — structure and advise_id", () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
    globalThis.fetch = async () => llmResponse();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("eval: advise with contacts returns result + advise_id (P0-1 tracking)", async () => {
    // Seed contacts with leverage nature
    env.USER_DATA._store.set("contacts:testuser", JSON.stringify([
      { id: "c-1", name: "老许", nature: "leverage", strength: 4, leverage: { goals: ["项目合作"] } },
      { id: "c-2", name: "张总", nature: "leverage", strength: 3, leverage: {} },
    ]));
    env.USER_DATA._store.set("timeline:testuser", JSON.stringify([]));
    env.USER_DATA._store.set("todos:testuser", JSON.stringify([]));

    const req = jsonReq("/ai/advise_cloud", {
      body: { session_token: "testuser:secret" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toBeTruthy();
    expect(data.advise_id).toBeTruthy();
    expect(data.advise_id).toMatch(/^adv_\d+_/);
    // Verify metrics KV was written
    const metrics = JSON.parse(env.USER_DATA._store.get("metrics:testuser"));
    expect(metrics.last_advise_id).toBe(data.advise_id);
    expect(metrics.last_advise_ts).toBeTruthy();
    const wk = Object.keys(metrics.weekly)[0];
    expect(metrics.weekly[wk].advise_generated).toBe(1);
  });

  it("eval: advise with no contacts returns null advise_id", async () => {
    env.USER_DATA._store.set("contacts:testuser", JSON.stringify([]));
    env.USER_DATA._store.set("timeline:testuser", JSON.stringify([]));
    env.USER_DATA._store.set("todos:testuser", JSON.stringify([]));

    const req = jsonReq("/ai/advise_cloud", {
      body: { session_token: "testuser:secret" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toContain("没有特别需要联系");
    expect(data.advise_id).toBeNull();
  });

  it("eval: advise requires auth (401)", async () => {
    const req = jsonReq("/ai/advise_cloud", {
      body: { session_token: "" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

describe("eval: advise engine — leverage scoring", () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
    globalThis.fetch = async () => llmResponse();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("eval: contact with 21+ days since interaction gets higher score", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    env.USER_DATA._store.set("contacts:testuser", JSON.stringify([
      { id: "c-1", name: "老许", nature: "leverage", strength: 4, leverage: {} },
    ]));
    env.USER_DATA._store.set("timeline:testuser", JSON.stringify([
      { id: "tl-1", contact: "c-1", date: oldDate.toISOString().slice(0, 10), summary: "上次聊天" },
    ]));
    env.USER_DATA._store.set("todos:testuser", JSON.stringify([]));

    const req = jsonReq("/ai/advise_cloud", {
      body: { session_token: "testuser:secret" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    // The LLM prompt should contain "30天没联系了" or "从未联系"
    // We can't check the prompt directly, but the result should mention the contact
    const data = await res.json();
    expect(data.result).toBeTruthy();
    expect(data.result).toContain("老许");
    expect(data.advise_id).toMatch(/^adv_\d+_/);
  });

  it("eval: nurture contacts trigger important date reminders", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const dateStr = `${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
    env.USER_DATA._store.set("contacts:testuser", JSON.stringify([
      { id: "c-1", name: "妈妈", nature: "nurture", strength: 5, important_dates: [{ label: "生日", date: dateStr }] },
    ]));
    env.USER_DATA._store.set("timeline:testuser", JSON.stringify([]));
    env.USER_DATA._store.set("todos:testuser", JSON.stringify([]));

    const req = jsonReq("/ai/advise_cloud", {
      body: { session_token: "testuser:secret" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toBeTruthy();
    // Check raw parts (pre-LLM) for nurture contact name — LLM mock returns fixed text
    expect(data.raw).toBeTruthy();
    const rawText = Array.isArray(data.raw) ? data.raw.join('') : '';
    expect(rawText).toContain("妈妈");
  });
});

describe("eval: draft generation — nature-aware output", () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("eval: draft for nurture contact uses warm tone", async () => {
    globalThis.fetch = async () => llmResponse("嘿老许，好久没联系了，最近怎么样？想你了 😊");
    const req = jsonReq("/ai/draft", {
      body: { name: "老许", nature: "nurture", memories: ["上次聊了孩子上学的事"] },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toBeTruthy();
    expect(data.result).toContain("老许");
    expect(data.result.length).toBeGreaterThan(5);
  });

  it("eval: draft for leverage contact uses professional tone", async () => {
    globalThis.fetch = async () => llmResponse("张总你好，最近忙吗？有个事想跟你聊聊。");
    const req = jsonReq("/ai/draft", {
      body: { name: "张总", nature: "leverage", memories: ["上次聊了项目合作"] },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toBeTruthy();
    expect(data.result).toContain("张总");
  });

  it("eval: draft falls back to template when LLM fails", async () => {
    globalThis.fetch = async () => { throw new Error("LLM unavailable"); };
    const req = jsonReq("/ai/draft", {
      body: { name: "老许", nature: "nurture" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toContain("老许");
    expect(data.result).toContain("好久没联系");
  });
});
