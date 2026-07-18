// Shared test helpers for cloud-worker vitest tests.
// Provides an in-memory mock KV and a base env for the Worker fetch handler.

export function mockKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    // test-only: inspect stored state
    _store: store,
  };
}

export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Standard env for tests: sync-secret auth + fake LLM config.
export function baseEnv(overrides = {}) {
  return {
    USER_DATA: mockKV(),
    WELIAN_SYNC_SECRET: "secret",
    LLM_API_KEY: "fake-key",
    LLM_BASE_URL: "https://fake.llm.local",
    LLM_MODEL: "fake-model",
    ...overrides,
  };
}

// Sync-token auth header (user_id:sync_secret) — bypasses Clerk.
export function authHeader(userId = "testuser") {
  return { Authorization: `Bearer ${userId}:secret` };
}

export function jsonReq(path, { method = "POST", body, headers = {} } = {}) {
  const opts = {
    method,
    headers: { "content-type": "application/json", ...headers },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(`https://worker.test${path}`, opts);
}
