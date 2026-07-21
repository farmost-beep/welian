// Tests for the cloud billing gateway — point deduction + 402 on empty balance.
// LLM calls are mocked via global.fetch; KV is an in-memory mock.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";
import { mockKV, baseEnv, authHeader, jsonReq, monthKey } from "./helpers.js";

const originalFetch = globalThis.fetch;

function llmResponse({ input = 1000, output = 500, text = "好的" } = {}) {
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text }],
      usage: { input_tokens: input, output_tokens: output },
      stop_reason: "end_turn",
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("billing: point deduction", () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
    globalThis.fetch = async () => llmResponse();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("deducts points from the user's monthly balance after a chat call", async () => {
    const req = jsonReq("/ai/chat", {
      body: { messages: [{ role: "user", content: "你好" }] },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();

    // calcPoints: 1000/1000*0.1 + 500/1000*0.2 = 0.1 + 0.1 = 0.2 points (standard tier ×1)
    expect(data.usage.points).toBe(0.2);
    expect(data.billing.plan).toBe("free");
    expect(data.billing.used).toBe(0.2);
    expect(data.billing.remaining).toBe(99.8);

    // KV persisted the deduction
    const stored = JSON.parse(env.USER_DATA._store.get("billing:testuser"));
    expect(stored.used).toBe(0.2);
    expect(stored.history).toHaveLength(1);
    expect(stored.history[0].action).toBe("chat");
    expect(stored.history[0].points).toBe(0.2);
  });

  it("rejects chat when no auth (401)", async () => {
    const req = jsonReq("/ai/chat", {
      body: { messages: [{ role: "user", content: "hi" }] },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

describe("billing: 402 on insufficient balance", () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
    // Pre-exhaust the free allowance (100 points) for the current month.
    env.USER_DATA._store.set(
      "billing:testuser",
      JSON.stringify({
        plan: "free",
        monthKey: monthKey(),
        used: 100,
        purchased: 0,
        rollover: 0,
        history: [],
        subscription: null,
      })
    );
    // fetch should NOT be called when balance is empty; assert via sentinel
    globalThis.fetch = async () => {
      throw new Error("LLM must not be called when balance is 0");
    };
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 402 without calling the LLM", async () => {
    const req = jsonReq("/ai/chat", {
      body: { messages: [{ role: "user", content: "你好" }] },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.error).toContain("联点");
    expect(data.billing.remaining).toBe(0);
    expect(data.billing.plan).toBe("free");
  });

  it("pro plan with exhausted allowance also returns 402", async () => {
    env.USER_DATA._store.set(
      "billing:testuser",
      JSON.stringify({
        plan: "pro",
        monthKey: monthKey(),
        used: 500,
        purchased: 0,
        rollover: 0,
        history: [],
        subscription: null,
      })
    );
    const req = jsonReq("/ai/chat", {
      body: { messages: [{ role: "user", content: "你好" }] },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(402);
  });
});

describe("billing: balance query endpoint", () => {
  it("reports free plan default balance for a new user", async () => {
    const env = baseEnv();
    const req = jsonReq("/ai/billing", { body: {}, headers: authHeader() });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.plan).toBe("free");
    expect(data.allowance).toBe(100);
    expect(data.remaining).toBe(100);
    expect(data.used).toBe(0);
  });
});
