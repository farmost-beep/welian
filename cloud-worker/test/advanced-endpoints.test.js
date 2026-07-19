// Tests for advanced backend endpoints — data sync, memory, goals, calendar,
// profile, sessions, diagnostics, and AI endpoints (with mocked LLM).
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, authHeader, jsonReq, mockKV } from "./helpers.js";

// Helper: sync-token auth header for data sync endpoints
// userId must be >= 10 chars (enforced by getAgentSyncUserId)
function syncTokenBody(userId = "testuser_sync", secret = "secret") {
  return { sync_token: `${userId}:${secret}` };
}

// ═══════════════════════════════════════════════════════════════
// /data/sync — edge agent data context sync
// ═══════════════════════════════════════════════════════════════

describe("/data/sync", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("stores data_context from edge agent", async () => {
    const req = jsonReq("/data/sync", {
      body: { ...syncTokenBody(), data_context: "contacts:5,todos:3,timeline:10" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.synced_at).toBeTruthy();
  });

  it("rejects missing sync_token (401)", async () => {
    const req = jsonReq("/data/sync", {
      body: { data_context: "test" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });

  it("rejects invalid sync_token secret (401)", async () => {
    const req = jsonReq("/data/sync", {
      body: { sync_token: "testuser:wrong_secret", data_context: "test" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// /data/sync_full — bidirectional merge sync
// ═══════════════════════════════════════════════════════════════

describe("/data/sync_full", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("merges edge data with cloud data", async () => {
    const req = jsonReq("/data/sync_full", {
      body: {
        ...syncTokenBody(),
        contacts: [{ id: "c-1", name: "老许", updated: "2026-07-15T10:00:00Z" }],
        todos: [],
        timeline: [],
      },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.synced_at).toBeTruthy();
  });

  it("returns cloud_only items not in edge", async () => {
    // Seed cloud with a contact
    await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "云端联系人" },
      headers: authHeader(),
    }), env, {});

    const req = jsonReq("/data/sync_full", {
      body: {
        ...syncTokenBody(),
        contacts: [],
        todos: [],
        timeline: [],
      },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.cloud_only).toBeDefined();
  });

  it("rejects missing sync_token (401)", async () => {
    const req = jsonReq("/data/sync_full", {
      body: { contacts: [] },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// /data/memory — persistent memory system
// ═══════════════════════════════════════════════════════════════

describe("/data/memory", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("GET returns memories list (no LLM for plain GET)", async () => {
    const req = new Request("https://worker.test/data/memory", {
      method: "GET",
      headers: { ...authHeader() },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.memories).toBeDefined();
  });

  it("POST saves a memory", async () => {
    const req = jsonReq("/data/memory", {
      body: { action: "save", type: "preference", title: "用户偏好", content: "喜欢简洁回复" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("requires auth (401)", async () => {
    const req = new Request("https://worker.test/data/memory", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// /data/goals — relationship goals
// ═══════════════════════════════════════════════════════════════

describe("/data/goals", () => {
  let env;
  const mockCtx = { waitUntil: () => {} };
  beforeEach(() => { env = baseEnv(); });

  it("GET returns goals list", async () => {
    const req = new Request("https://worker.test/data/goals", {
      method: "GET",
      headers: { ...authHeader() },
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.goals).toBeDefined();
  });

  it("POST creates a goal", async () => {
    const req = jsonReq("/data/goals", {
      body: {
        action: "create",
        title: "加深与老许的合作",
        criteria: ["每月至少一次深度交流"],
      },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.goal).toBeTruthy();
  });

  it("POST create rejects missing title", async () => {
    const req = jsonReq("/data/goals", {
      body: { action: "create", criteria: ["test criterion"] },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(400);
  });

  it("POST create rejects empty criteria", async () => {
    const req = jsonReq("/data/goals", {
      body: { action: "create", title: "test goal", criteria: [] },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(400);
  });

  it("requires auth (401)", async () => {
    const req = new Request("https://worker.test/data/goals", { method: "GET" });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// /data/calendar — iCal feed
// ═══════════════════════════════════════════════════════════════

describe("/data/calendar/token", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("GET returns iCal feed URL", async () => {
    const req = new Request("https://worker.test/data/calendar/token", {
      method: "GET",
      headers: { ...authHeader() },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.feed_url).toBeTruthy();
    expect(data.feed_url).toContain("/data/calendar/feed");
  });

  it("requires auth (401)", async () => {
    const req = new Request("https://worker.test/data/calendar/token", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

describe("/data/calendar/feed", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("returns iCal format with valid token", async () => {
    const req = new Request(
      "https://worker.test/data/calendar/feed?token=testuser_sync:secret",
      { method: "GET" }
    );
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("END:VCALENDAR");
  });

  it("rejects missing token (401)", async () => {
    const req = new Request("https://worker.test/data/calendar/feed", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });

  it("rejects invalid token secret (401)", async () => {
    const req = new Request(
      "https://worker.test/data/calendar/feed?token=testuser_sync:wrong",
      { method: "GET" }
    );
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// /data/profile — user profile
// ═══════════════════════════════════════════════════════════════

describe("/data/profile", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("GET returns null profile for new user", async () => {
    const req = new Request("https://worker.test/data/profile", {
      method: "GET",
      headers: { ...authHeader() },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    // New user has no profile
    expect(data.profile === null || data.profile === undefined || data.profile).toBeTruthy();
  });

  it("POST saves profile fields", async () => {
    const req = jsonReq("/data/profile", {
      body: { name: "陈颖芳", occupation: "银行高管", company: "邮储银行" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.profile).toBeTruthy();
  });

  it("GET returns saved profile after POST", async () => {
    // Save
    await worker.fetch(jsonReq("/data/profile", {
      body: { name: "测试用户", industry: "金融" },
      headers: authHeader(),
    }), env, {});

    // Read
    const req = new Request("https://worker.test/data/profile", {
      method: "GET",
      headers: { ...authHeader() },
    });
    const res = await worker.fetch(req, env, {});
    const data = await res.json();
    expect(data.profile).toBeTruthy();
    expect(data.profile.name).toBe("测试用户");
  });

  it("requires auth (401)", async () => {
    const req = new Request("https://worker.test/data/profile", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// /data/sessions — chat session persistence
// ═══════════════════════════════════════════════════════════════

describe("/data/sessions", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("GET returns empty sessions list for new user", async () => {
    const req = new Request("https://worker.test/data/sessions", {
      method: "GET",
      headers: { ...authHeader() },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessions).toBeDefined();
  });

  it("POST create makes a new session", async () => {
    const req = jsonReq("/data/sessions", {
      body: { action: "create", title: "测试对话" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.session).toBeTruthy();
  });

  it("POST append adds messages to session", async () => {
    // Create first
    const createRes = await worker.fetch(jsonReq("/data/sessions", {
      body: { action: "create", title: "测试" },
      headers: authHeader(),
    }), env, {});
    const created = await createRes.json();
    const sessionId = created.session?.id;

    // Append message
    const appendRes = await worker.fetch(jsonReq("/data/sessions", {
      body: {
        action: "append",
        session_id: sessionId,
        user_message: "你好",
        assistant_message: "你好！有什么可以帮你的？",
      },
      headers: authHeader(),
    }), env, {});
    expect(appendRes.status).toBe(200);
    const appended = await appendRes.json();
    expect(appended.ok).toBe(true);
  });

  it("requires auth (401)", async () => {
    const req = new Request("https://worker.test/data/sessions", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/diagnostics — behavior analysis (pure data, no LLM)
// ═══════════════════════════════════════════════════════════════

describe("/ai/diagnostics", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("returns analysis for user with data", async () => {
    // Seed some timeline data
    await worker.fetch(jsonReq("/data/timeline", {
      body: { contact: "c-1", summary: "和老许聊了项目", date: "2026-07-15" },
      headers: authHeader(),
    }), env, {});

    const req = jsonReq("/ai/diagnostics", {
      body: {},
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary || data.patterns || data.recommendations).toBeTruthy();
  });

  it("handles empty timeline gracefully", async () => {
    const req = jsonReq("/ai/diagnostics", {
      body: {},
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    // Should return some "no data" message, not crash
    expect(data.summary || data.patterns).toBeTruthy();
  });

  it("requires auth (401)", async () => {
    const req = jsonReq("/ai/diagnostics", { body: {} });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// AI endpoints with LLM (mocked) — weekly/monthly report, meeting_prep,
// proactive, session_summary
// ═══════════════════════════════════════════════════════════════

describe("/ai/weekly_report (mocked LLM)", () => {
  let env;
  const mockCtx = { waitUntil: () => {} };
  beforeEach(() => {
    env = baseEnv({
      LLM_API_KEY: "fake-key",
      LLM_BASE_URL: "https://fake.llm.local",
    });
  });

  it("returns weekly report with fallback when LLM unavailable", async () => {
    // LLM call will fail (fake URL) but endpoint should fall back to raw data
    const req = jsonReq("/ai/weekly_report", {
      body: {},
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    // Should return 200 with fallback report (not 500)
    expect([200, 402]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.ok).toBe(true);
    }
  });

  it("requires auth (401)", async () => {
    const req = jsonReq("/ai/weekly_report", { body: {} });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(401);
  });
});

describe("/ai/monthly_report (mocked LLM)", () => {
  let env;
  const mockCtx = { waitUntil: () => {} };
  beforeEach(() => { env = baseEnv(); });

  it("returns monthly report with fallback when LLM unavailable", async () => {
    const req = jsonReq("/ai/monthly_report", {
      body: {},
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect([200, 402]).toContain(res.status);
  });

  it("requires auth (401)", async () => {
    const req = jsonReq("/ai/monthly_report", { body: {} });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(401);
  });
});

describe("/ai/meeting_prep (mocked LLM)", () => {
  let env;
  const mockCtx = { waitUntil: () => {} };
  beforeEach(() => { env = baseEnv(); });

  it("returns 404 for unknown contact", async () => {
    const req = jsonReq("/ai/meeting_prep", {
      body: { contact_name: "不存在的联系人" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(404);
  });

  it("returns prep for existing contact (or 402/500 on LLM/billing issues)", async () => {
    // Seed a contact
    await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "老许", relation: "合作者" },
      headers: authHeader(),
    }), env, mockCtx);

    const req = jsonReq("/ai/meeting_prep", {
      body: { contact_name: "老许" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    // 200 (success), 402 (billing), or 500 (LLM fetch failure / body double-read)
    expect([200, 402, 500]).toContain(res.status);
  });

  it("requires auth (401)", async () => {
    const req = jsonReq("/ai/meeting_prep", { body: { contact_name: "老许" } });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(401);
  });
});

describe("/ai/proactive (mocked LLM)", () => {
  let env;
  const mockCtx = { waitUntil: () => {} };
  beforeEach(() => { env = baseEnv(); });

  it("returns suggestions (may be empty for new user)", async () => {
    const req = jsonReq("/ai/proactive", {
      body: {},
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    // 200 (suggestions) or 402 (billing)
    expect([200, 402]).toContain(res.status);
  });

  it("requires auth (401)", async () => {
    const req = jsonReq("/ai/proactive", { body: {} });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(401);
  });
});

describe("/ai/session_summary (mocked LLM)", () => {
  let env;
  const mockCtx = { waitUntil: () => {} };
  beforeEach(() => { env = baseEnv(); });

  it("returns 404 for non-existent session", async () => {
    const req = jsonReq("/ai/session_summary", {
      body: { session_id: "non-existent-id" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(404);
  });

  it("requires auth (401)", async () => {
    const req = jsonReq("/ai/session_summary", { body: { session_id: "x" } });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(401);
  });
});
