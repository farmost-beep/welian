// L2 AI Eval: P0 Metrics tracking (North Star + Advice Adoption)
// Tests that trackAction and registerAdvise correctly record events,
// compute weekly counts, and track adoption within 7-day window.
// Grader: deterministic (code-based) — checks metrics KV state.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, authHeader, jsonReq } from "./helpers.js";

const originalFetch = globalThis.fetch;

function llmResponse(text = "好的") {
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text }],
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: "end_turn",
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("eval: metrics — North Star weekly tracking", () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
    globalThis.fetch = async () => llmResponse();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("eval: complete_todo increments todo_completed in weekly metrics", async () => {
    // Seed a pending todo
    env.USER_DATA._store.set("todos:testuser", JSON.stringify([
      { id: "t-1", contact: "", task: "跟进老许", status: "pending", due: "2026-07-10" },
    ]));
    // Mock LLM to return complete_todo action
    globalThis.fetch = async () => {
      const parsed = JSON.stringify({
        intent: "record",
        actions: [{ type: "complete_todo", task: "跟进老许", contact_name: "" }],
        contact_name: "",
        keywords: [],
      });
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: parsed }],
          usage: { input_tokens: 100, output_tokens: 50 },
          stop_reason: "end_turn",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "完成了跟进老许" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    // Check metrics KV
    const metrics = JSON.parse(env.USER_DATA._store.get("metrics:testuser"));
    const wk = Object.keys(metrics.weekly)[0];
    expect(metrics.weekly[wk].todo_completed).toBe(1);
  });

  it("eval: add_timeline increments interaction_recorded in weekly metrics", async () => {
    globalThis.fetch = async () => {
      const parsed = JSON.stringify({
        intent: "record",
        actions: [{ type: "add_timeline", contact_name: "老许", summary: "聊了项目", date: new Date().toISOString().slice(0, 10) }],
        contact_name: "老许",
        keywords: ["老许"],
      });
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: parsed }],
          usage: { input_tokens: 100, output_tokens: 50 },
          stop_reason: "end_turn",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "记一下今天和老许聊了项目" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const metrics = JSON.parse(env.USER_DATA._store.get("metrics:testuser"));
    const wk = Object.keys(metrics.weekly)[0];
    expect(metrics.weekly[wk].interaction_recorded).toBe(1);
  });
});

describe("eval: metrics — advice adoption tracking (P0-2)", () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
    globalThis.fetch = async () => llmResponse();
    // Clear trackAction dedup cache between tests
    // (same user+actionType would be skipped otherwise)
    if (globalThis._clearTrackActionCache) globalThis._clearTrackActionCache();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("eval: action within 7 days of advise counts as adoption", async () => {
    // Seed metrics with a recent advise
    const recentAdviseTs = new Date().toISOString();
    env.USER_DATA._store.set("metrics:testuser", JSON.stringify({
      weekly: {},
      adoptions: [],
      last_advise_ts: recentAdviseTs,
      last_advise_id: "adv_test_001",
    }));
    // Seed a pending todo
    env.USER_DATA._store.set("todos:testuser", JSON.stringify([
      { id: "t-1", contact: "", task: "联系老许", status: "pending", due: "2026-07-10" },
    ]));
    // Trigger a complete_todo action
    globalThis.fetch = async () => {
      const parsed = JSON.stringify({
        intent: "record",
        actions: [{ type: "complete_todo", task: "联系老许", contact_name: "" }],
        contact_name: "",
        keywords: [],
      });
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: parsed }],
          usage: { input_tokens: 100, output_tokens: 50 },
          stop_reason: "end_turn",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "完成了联系老许" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const metrics = JSON.parse(env.USER_DATA._store.get("metrics:testuser"));
    expect(metrics.adoptions).toHaveLength(1);
    expect(metrics.adoptions[0].advise_id).toBe("adv_test_001");
    expect(metrics.adoptions[0].action_type).toBe("todo_completed");
  });

  it("eval: action after 7 days of advise does NOT count as adoption", async () => {
    // Seed metrics with an advise 10 days ago
    const oldAdviseTs = new Date();
    oldAdviseTs.setDate(oldAdviseTs.getDate() - 10);
    env.USER_DATA._store.set("metrics:testuser", JSON.stringify({
      weekly: {},
      adoptions: [],
      last_advise_ts: oldAdviseTs.toISOString(),
      last_advise_id: "adv_test_002",
    }));
    env.USER_DATA._store.set("todos:testuser", JSON.stringify([
      { id: "t-1", contact: "", task: "联系老许", status: "pending", due: "2026-07-10" },
    ]));
    globalThis.fetch = async () => {
      const parsed = JSON.stringify({
        intent: "record",
        actions: [{ type: "complete_todo", task: "联系老许", contact_name: "" }],
        contact_name: "",
        keywords: [],
      });
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: parsed }],
          usage: { input_tokens: 100, output_tokens: 50 },
          stop_reason: "end_turn",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "完成了联系老许" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const metrics = JSON.parse(env.USER_DATA._store.get("metrics:testuser"));
    expect(metrics.adoptions).toHaveLength(0);
  });
});

describe("eval: metrics — /data/metrics endpoint", () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
  });

  it("eval: /data/metrics returns north_star_this_week and adoption_rate", async () => {
    // Seed metrics — compute ISO 8601 week key to match worker's getWeekKey
    const now = new Date();
    const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    const wk = `${date.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
    env.USER_DATA._store.set("metrics:testuser", JSON.stringify({
      weekly: {
        [wk]: { advise_generated: 2, todo_completed: 3, interaction_recorded: 1, draft_generated: 0 },
      },
      adoptions: [
        { advise_id: "adv_1", action_type: "todo_completed", ts: now.toISOString(), contact: null },
        { advise_id: "adv_2", action_type: "interaction_recorded", ts: now.toISOString(), contact: null },
      ],
      last_advise_ts: now.toISOString(),
      last_advise_id: "adv_2",
    }));
    const req = jsonReq("/data/metrics", { method: "GET", headers: authHeader() });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.north_star_this_week).toBe(4); // 3 todo_completed + 1 interaction_recorded + 0 draft
    expect(data.adoption_rate_30d).toBeGreaterThan(0);
    expect(data.total_advise_30d).toBe(2);
    expect(data.total_adoptions_30d).toBe(2);
  });

  it("eval: /data/metrics requires auth (401)", async () => {
    const req = jsonReq("/data/metrics", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });

  it("eval: /data/metrics returns empty data for new user", async () => {
    const req = jsonReq("/data/metrics", { method: "GET", headers: authHeader() });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.north_star_this_week).toBe(0);
    expect(data.adoption_rate_30d).toBe(0);
    expect(data.total_advise_30d).toBe(0);
  });
});
