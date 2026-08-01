// LLM resilience tests — verifies fallback behavior when LLM fails, times out,
// returns empty/malformed content, or gets rate-limited.
// Each test case mocks fetch independently to simulate a specific failure mode.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, authHeader, jsonReq } from "./helpers.js";

const originalFetch = globalThis.fetch;

// ── LLM response helpers ──

function llmResponse(text, { status = 200, usage } = {}) {
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text }],
      usage: usage || { input_tokens: 100, output_tokens: 50 },
      stop_reason: "end_turn",
    }),
    { status, headers: { "content-type": "application/json" } }
  );
}

function llmEmptyContent() {
  return new Response(
    JSON.stringify({
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
      stop_reason: null,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function llmError(status, body = '{"error": "server error"}') {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Seed a leverage contact so handleCloudAdvise generates parts and calls LLM.
function seedAdviseContacts(env, userId = "testuser") {
  env.USER_DATA._store.set(
    `contacts:${userId}`,
    JSON.stringify([
      { id: "c-1", name: "老许", nature: "leverage", strength: 4, leverage: {} },
    ])
  );
  env.USER_DATA._store.set(`timeline:${userId}`, JSON.stringify([]));
  env.USER_DATA._store.set(`todos:${userId}`, JSON.stringify([]));
}

// ═══════════════════════════════════════════════════════════════
// 1. LLM returns null (all 3 retries fail with 500)
// ═══════════════════════════════════════════════════════════════

describe("LLM resilience: all retries fail (500)", () => {
  let env;
  const mockCtx = { waitUntil: () => {} };

  beforeEach(() => {
    env = baseEnv();
    globalThis.fetch = async () => llmError(500);
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("advise_cloud falls back to parts.join when LLM returns 500 x3", async () => {
    seedAdviseContacts(env);
    const res = await worker.fetch(
      jsonReq("/ai/advise_cloud", { body: {}, headers: authHeader() }),
      env,
      mockCtx
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    // Fallback content should contain the contact name (from parts)
    expect(data.result).toContain("老许");
    expect(data.advise_id).toBeTruthy();
  });

  it("draft falls back to template when LLM returns 500 x3", async () => {
    const res = await worker.fetch(
      jsonReq("/ai/draft", {
        body: { name: "老许", nature: "nurture" },
        headers: authHeader(),
      }),
      env,
      mockCtx
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toContain("老许");
    expect(data.result).toContain("好久没联系");
  });

  it("weekly_report falls back to structured data when LLM returns 500 x3", async () => {
    const res = await worker.fetch(
      jsonReq("/ai/weekly_report", { body: {}, headers: authHeader() }),
      env,
      mockCtx
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.report).toBeTruthy();
    expect(data.raw_data).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. LLM returns empty content array
// ═══════════════════════════════════════════════════════════════

describe("LLM resilience: empty content array", () => {
  let env;
  const mockCtx = { waitUntil: () => {} };

  beforeEach(() => {
    env = baseEnv();
    globalThis.fetch = async () => llmEmptyContent();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("advise_cloud degrades gracefully when content is []", async () => {
    seedAdviseContacts(env);
    const res = await worker.fetch(
      jsonReq("/ai/advise_cloud", { body: {}, headers: authHeader() }),
      env,
      mockCtx
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    // Should fall back to raw parts (not crash, not 500)
    expect(data.result).toContain("老许");
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. LLM returns non-JSON text (hn_signals)
// ═══════════════════════════════════════════════════════════════

describe("LLM resilience: non-JSON text for hn_signals", () => {
  let env;
  const mockCtx = { waitUntil: () => {} };

  beforeEach(() => {
    env = baseEnv();
    // Mock fetch: LLM returns plain text; HN API returns a hit so
    // allStories is non-empty and the LLM actually gets called;
    // all other external sources get empty JSON (parsers return []).
    globalThis.fetch = async (url) => {
      const urlStr = typeof url === "string" ? url : String(url);
      if (urlStr.includes("/v1/messages")) {
        return llmResponse("这是一段纯文本，不是JSON格式");
      }
      if (urlStr.includes("hn.algolia.com")) {
        return new Response(
          JSON.stringify({
            hits: [
              {
                title: "AI突破性进展",
                url: "https://example.com/ai",
                objectID: "abc123",
                points: 100,
                num_comments: 50,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      // All other news sources / search engines: empty response
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("hn_signals returns raw signal data when LLM returns non-JSON", async () => {
    const res = await worker.fetch(
      jsonReq("/ai/hn_signals", { body: {}, headers: authHeader() }),
      env,
      mockCtx
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.report).toBeTruthy();
    // raw_data should contain the stories fetched from external sources
    expect(data.raw_data).toBeTruthy();
    expect(data.raw_data.stories).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. LLM returns malformed JSON (annual_report)
// ═══════════════════════════════════════════════════════════════

describe("LLM resilience: malformed JSON for annual_report", () => {
  let env;
  const mockCtx = { waitUntil: () => {} };

  beforeEach(() => {
    env = baseEnv();
    // LLM returns text that looks like JSON but is missing closing brace
    globalThis.fetch = async () =>
      llmResponse('{greeting: "你好"');
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("annual_report handles malformed JSON without crashing", async () => {
    const res = await worker.fetch(
      jsonReq("/ai/annual_report", { body: {}, headers: authHeader() }),
      env,
      mockCtx
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.report).toBeTruthy();
    // Should have raw_stats attached regardless of LLM parse failure
    expect(data.report.raw_stats).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. LLM timeout (fetch throws AbortError-like error)
// ═══════════════════════════════════════════════════════════════

describe("LLM resilience: fetch timeout (AbortError)", () => {
  let env;
  const mockCtx = { waitUntil: () => {} };

  beforeEach(() => {
    env = baseEnv();
    globalThis.fetch = async () => {
      throw new Error("Timeout");
    };
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("advise_cloud falls back when fetch throws Timeout x3", async () => {
    seedAdviseContacts(env);
    const res = await worker.fetch(
      jsonReq("/ai/advise_cloud", { body: {}, headers: authHeader() }),
      env,
      mockCtx
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toContain("老许");
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. LLM returns 429 (rate limit — client error, no retry)
// ═══════════════════════════════════════════════════════════════

describe("LLM resilience: 429 rate limit (no retry)", () => {
  let env;
  let fetchCallCount;
  const mockCtx = { waitUntil: () => {} };

  beforeEach(() => {
    env = baseEnv();
    fetchCallCount = 0;
    globalThis.fetch = async () => {
      fetchCallCount++;
      return llmError(429, '{"error": "rate limited"}');
    };
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("advise_cloud does not retry on 429 and falls back", async () => {
    seedAdviseContacts(env);
    const res = await worker.fetch(
      jsonReq("/ai/advise_cloud", { body: {}, headers: authHeader() }),
      env,
      mockCtx
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toContain("老许");
    // 429 is a client error — callLLM should NOT retry, only 1 fetch call
    expect(fetchCallCount).toBe(1);
  });
});
