// L2 AI Eval: Intent classification
// Tests that handleExtractIntent correctly classifies user intent from natural language.
// Uses mock LLM responses to simulate different intent classifications.
// Grader: deterministic (code-based) — checks intent field and action types.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, authHeader, jsonReq } from "./helpers.js";

const originalFetch = globalThis.fetch;

// Mock LLM response with a specific intent + actions JSON
function intentResponse(intent, actions = [], extra = {}) {
  const parsed = JSON.stringify({ intent, actions, contact_name: "", keywords: [], ...extra });
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text: parsed }],
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: "end_turn",
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("eval: intent classification — record actions", () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("eval: '记一下今天和老许聊了项目' → intent=record, add_timeline action", async () => {
    globalThis.fetch = async () => intentResponse("record", [
      { type: "add_timeline", contact_name: "老许", summary: "聊了项目", date: new Date().toISOString().slice(0, 10) },
    ]);
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "记一下今天和老许聊了项目" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent).toBe("record");
    expect(data.action_results).toHaveLength(1);
    expect(data.action_results[0].type).toBe("add_timeline");
    expect(data.action_results[0].ok).toBe(true);
    // Verify KV was written
    const timeline = JSON.parse(env.USER_DATA._store.get("timeline:testuser"));
    expect(timeline).toHaveLength(1);
    expect(timeline[0].summary).toBe("聊了项目");
  });

  it("eval: '提醒我下周联系张总' → intent=record, add_todo action with due date", async () => {
    globalThis.fetch = async () => intentResponse("record", [
      { type: "add_todo", task: "联系张总", contact_name: "张总", due: "2026-07-15", priority: "P1" },
    ]);
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "提醒我下周联系张总" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent).toBe("record");
    expect(data.action_results).toHaveLength(1);
    expect(data.action_results[0].type).toBe("add_todo");
    expect(data.action_results[0].ok).toBe(true);
    const todos = JSON.parse(env.USER_DATA._store.get("todos:testuser"));
    expect(todos).toHaveLength(1);
    expect(todos[0].task).toBe("联系张总");
    expect(todos[0].status).toBe("pending");
  });

  it("eval: '完成了跟进老许的待办' → intent=record, complete_todo action", async () => {
    // Seed a pending todo first
    env.USER_DATA._store.set("todos:testuser", JSON.stringify([
      { id: "t-1", contact: "", task: "跟进老许", status: "pending", due: "2026-07-10" },
    ]));
    globalThis.fetch = async () => intentResponse("record", [
      { type: "complete_todo", task: "跟进老许", contact_name: "老许" },
    ]);
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "完成了跟进老许的待办" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action_results[0].type).toBe("complete_todo");
    expect(data.action_results[0].ok).toBe(true);
    const todos = JSON.parse(env.USER_DATA._store.get("todos:testuser"));
    expect(todos[0].status).toBe("done");
    expect(todos[0].completed_at).toBeTruthy();
  });
});

describe("eval: intent classification — query and advise", () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("eval: '该联系谁了' → intent=advise, no actions", async () => {
    globalThis.fetch = async () => intentResponse("advise", []);
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "该联系谁了" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent).toBe("advise");
    expect(data.actions).toEqual([]);
  });

  it("eval: '老许啥情况' → intent=query_contact, keywords extracted", async () => {
    globalThis.fetch = async () => intentResponse("query_contact", [], {
      contact_name: "老许",
      keywords: ["老许"],
    });
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "老许啥情况" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent).toBe("query_contact");
    expect(data.contact_name).toBe("老许");
  });

  it("eval: '有啥待办' → intent=query_todo", async () => {
    globalThis.fetch = async () => intentResponse("query_todo", []);
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "有啥待办" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent).toBe("query_todo");
  });
});

describe("eval: intent classification — onboarding mode", () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("eval: onboarding mode auto-creates contacts from natural text", async () => {
    globalThis.fetch = async () => intentResponse("record", [
      { type: "add_contact", name: "老王", relation: "朋友" },
      { type: "add_contact", name: "张总", relation: "合作者" },
      { type: "add_timeline", contact_name: "老王", summary: "吃了饭", date: new Date().toISOString().slice(0, 10) },
    ]);
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "昨天和老王吃了饭，前天跟张总开了个会", onboarding: true },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent).toBe("record");
    const contacts = JSON.parse(env.USER_DATA._store.get("contacts:testuser"));
    expect(contacts).toHaveLength(2);
    const names = contacts.map(c => c.name).sort();
    expect(names).toEqual(["张总", "老王"]);
    const timeline = JSON.parse(env.USER_DATA._store.get("timeline:testuser"));
    expect(timeline).toHaveLength(1);
    expect(timeline[0].summary).toBe("吃了饭");
  });
});

describe("eval: intent classification — LLM failure fallback", () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("eval: malformed LLM response falls back to chat intent", async () => {
    globalThis.fetch = async () => new Response(
      JSON.stringify({
        content: [{ type: "text", text: "这不是JSON" }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: "end_turn",
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "随便说点什么" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.intent).toBe("chat");
    expect(data.actions).toEqual([]);
  });
});
