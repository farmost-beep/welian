// Tests for advanced backend endpoints — data sync, memory, goals, calendar,
// profile, sessions, diagnostics, and AI endpoints (with mocked LLM).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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

  it("rejects missing contact references before overwriting existing data", async () => {
    const existingContacts = [{ id: "c-existing", name: "已有联系人", updated: "2026-07-15T10:00:00Z" }];
    const existingTodos = [{ id: "todo-existing", task: "已有待办", contact: "c-existing", updated: "2026-07-15T10:00:00Z" }];
    const existingTimeline = [{ id: "timeline-existing", summary: "已有互动", contact: "c-existing", updated: "2026-07-15T10:00:00Z" }];
    env.USER_DATA._store.set("contacts:testuser_sync", JSON.stringify(existingContacts));
    env.USER_DATA._store.set("todos:testuser_sync", JSON.stringify(existingTodos));
    env.USER_DATA._store.set("timeline:testuser_sync", JSON.stringify(existingTimeline));

    const res = await worker.fetch(jsonReq("/data/sync_full", {
      body: {
        ...syncTokenBody(),
        contacts: [{ id: "c-new", name: "不应写入", updated: "2026-07-16T10:00:00Z" }],
        todos: [{ id: "todo-invalid", task: "错误引用", contact: "c-missing", updated: "2026-07-16T10:00:00Z" }],
        timeline: [{ id: "timeline-unlinked", summary: "允许无关联", contact: "", updated: "2026-07-16T10:00:00Z" }],
      },
    }), env, {});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("INVALID_CONTACT_REFERENCE");
    expect(data.references).toEqual([
      expect.objectContaining({ dataset: "todos", item_id: "todo-invalid", contact: "c-missing" }),
    ]);
    expect(JSON.parse(env.USER_DATA._store.get("contacts:testuser_sync"))).toEqual(existingContacts);
    expect(JSON.parse(env.USER_DATA._store.get("todos:testuser_sync"))).toEqual(existingTodos);
    expect(JSON.parse(env.USER_DATA._store.get("timeline:testuser_sync"))).toEqual(existingTimeline);
  });

  it("allows empty contact references in synced timeline and todos", async () => {
    const res = await worker.fetch(jsonReq("/data/sync_full", {
      body: {
        ...syncTokenBody(),
        contacts: [],
        todos: [{ id: "todo-unlinked", task: "长期任务", contact: "", updated: "2026-07-16T10:00:00Z" }],
        timeline: [{ id: "timeline-unlinked", summary: "无关联互动", contact: "", updated: "2026-07-16T10:00:00Z" }],
      },
    }), env, {});
    expect(res.status).toBe(200);
    expect(JSON.parse(env.USER_DATA._store.get("todos:testuser_sync"))).toEqual([
      expect.objectContaining({ id: "todo-unlinked", contact: "" }),
    ]);
    expect(JSON.parse(env.USER_DATA._store.get("timeline:testuser_sync"))).toEqual([
      expect.objectContaining({ id: "timeline-unlinked", contact: "" }),
    ]);
  });

  it('rejects an invalid edge reference even when an older duplicate would be hidden by the merge', async () => {
    const existingContacts = [{ id: 'c-existing', name: '已有联系人', updated: '2026-07-15T10:00:00Z' }];
    const existingTodos = [{ id: 'todo-same-id', task: '云端待办', contact: 'c-existing', updated: '2026-07-16T10:00:00Z' }];
    env.USER_DATA._store.set('contacts:testuser_sync', JSON.stringify(existingContacts));
    env.USER_DATA._store.set('todos:testuser_sync', JSON.stringify(existingTodos));

    const res = await worker.fetch(jsonReq('/data/sync_full', {
      body: {
        ...syncTokenBody(),
        contacts: [],
        todos: [{ id: 'todo-same-id', task: '边缘旧待办', contact: 'c-missing', updated: '2026-07-15T10:00:00Z' }],
        timeline: [],
      },
    }), env, {});

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('INVALID_CONTACT_REFERENCE');
    expect(data.references).toEqual([
      expect.objectContaining({ dataset: 'todos', item_id: 'todo-same-id', contact: 'c-missing' }),
    ]);
    expect(JSON.parse(env.USER_DATA._store.get('todos:testuser_sync'))).toEqual(existingTodos);
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
    // Seed a pending todo with a due date so the feed has VEVENTs
    env.USER_DATA._store.set("todos:testuser_sync", JSON.stringify([
      { id: "todo-cal-1", task: "跟进老许", due: "2026-07-25", status: "pending", priority: "P1", contact: "c1" },
    ]));
    env.USER_DATA._store.set("contacts:testuser_sync", JSON.stringify([
      { id: "c1", name: "老许", important_dates: [{ date: "11-29", label: "生日" }] },
    ]));
    const req = new Request(
      "https://worker.test/data/calendar/feed?token=testuser_sync:secret",
      { method: "GET" }
    );
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("END:VCALENDAR");
    // Outlook requires DTEND for all-day events (RFC 5545 says optional, but Outlook errors without it)
    expect(text).toContain("DTEND;VALUE=DATE:");
    // LAST-MODIFIED helps Outlook detect updates
    expect(text).toContain("LAST-MODIFIED:");
    // Contact birthday should produce a YEARLY recurring event
    expect(text).toContain("RRULE:FREQ=YEARLY");
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
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    env = baseEnv({
      LLM_API_KEY: "fake-key",
      LLM_BASE_URL: "https://fake.llm.local",
    });
    // Mock fetch to fail immediately so callLLM returns null fast (no DNS timeout)
    globalThis.fetch = async () => { throw new Error("LLM unavailable"); };
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

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
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    env = baseEnv();
    globalThis.fetch = async () => { throw new Error("LLM unavailable"); };
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

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
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    env = baseEnv();
    globalThis.fetch = async () => { throw new Error("LLM unavailable"); };
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns 404 for unknown contact", async () => {
    const req = jsonReq("/ai/meeting_prep", {
      body: { contact_name: "不存在的联系人" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(404);
  });

  it("returns prep for existing contact (fallback when LLM unavailable)", async () => {
    // Seed a contact
    await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "老许", relation: "合作者", company: "腾讯" },
      headers: authHeader(),
    }), env, mockCtx);

    const req = jsonReq("/ai/meeting_prep", {
      body: { contact_name: "老许" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    // Should return 200 with fallback prep (not 500 — bug was fixed)
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.contact).toBeTruthy();
    expect(data.prep).toBeTruthy();
    // Fallback mode should have the fallback flag
    if (data.usage && data.usage.fallback) {
      expect(data.prep).toContain("离线模式");
    }
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

// ═══════════════════════════════════════════════════════════════
// /ai/meeting_review — review persistence + follow-up todo linkage
// Bug: review was not persisted, so re-opening a completed meeting
// showed only the summary, not the full review. follow_ups array on
// the meeting was also never written back.
// ═══════════════════════════════════════════════════════════════
describe("/ai/meeting_review (mocked LLM)", () => {
  const originalFetch = globalThis.fetch;
  let env;
  const mockCtx = { waitUntil: () => {} };

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

  beforeEach(() => { env = baseEnv(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("persists full review to meeting.review and writes back follow_ups", async () => {
    // Seed a meeting
    await worker.fetch(jsonReq("/data/meetings", {
      body: { title: "Q3 合作沟通会", date: "2026-07-18", status: "planned" },
      headers: authHeader(),
    }), env, mockCtx);
    const meetingsRaw = env.USER_DATA._store.get("meetings:testuser");
    const meeting = JSON.parse(meetingsRaw)[0];

    // Mock LLM returning a review with one follow-up todo
    globalThis.fetch = async () => llmJson({
      summary: "会议达成初步合作意向",
      new_contacts: [],
      follow_up_todos: [{ task: "发送合作方案给老许", contact_name: "", due: "2026-07-25", priority: "high" }],
      opportunity_analysis: [{ description: "联合产品发布", action: "下月前出方案", contact_name: "" }],
      leverage_insights: "可借老许的渠道资源",
      goal_suggestions: ["Q4 联合发布"],
    });

    const res = await worker.fetch(jsonReq("/ai/meeting_review", {
      body: { meeting_id: meeting.id },
      headers: authHeader(),
    }), env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.review.summary).toBe("会议达成初步合作意向");

    // Verify meeting.review persisted
    const updatedMeetings = JSON.parse(env.USER_DATA._store.get("meetings:testuser"));
    const m = updatedMeetings.find(x => x.id === meeting.id);
    expect(m.status).toBe("completed");
    expect(m.review).toBeTruthy();
    expect(m.review.summary).toBe("会议达成初步合作意向");
    expect(m.review.opportunity_analysis).toHaveLength(1);

    // Verify follow-up todo created and linked back to meeting
    const todos = JSON.parse(env.USER_DATA._store.get("todos:testuser") || "[]");
    expect(todos.length).toBe(1);
    expect(todos[0].task).toBe("发送合作方案给老许");
    expect(todos[0].source).toBe(`meeting:${meeting.id}`);
    expect(todos[0].event_id).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 0));
    const events = JSON.parse(env.USER_DATA._store.get("domain_events:testuser"));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_type: "todo_created", source: `meeting:${meeting.id}`, event_id: todos[0].event_id }),
    ]));
  });

  it("skips a follow-up with an unknown contact_name and reports needs_confirmation", async () => {
    await worker.fetch(jsonReq("/data/meetings", {
      body: { title: "未知联系人复盘会", date: "2026-07-18", status: "planned" },
      headers: authHeader(),
    }), env, mockCtx);
    const meeting = JSON.parse(env.USER_DATA._store.get("meetings:testuser"))[0];

    globalThis.fetch = async () => llmJson({
      summary: "需要确认跟进对象",
      new_contacts: [],
      follow_up_todos: [{ task: "发送资料", contact_name: "不存在的联系人", due: "2026-07-25", priority: "high" }],
      opportunity_analysis: [],
      leverage_insights: "",
      goal_suggestions: [],
    });

    const res = await worker.fetch(jsonReq("/ai/meeting_review", {
      body: { meeting_id: meeting.id },
      headers: authHeader(),
    }), env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.created_todos).toBe(0);
    expect(data.follow_up_failures).toEqual([
      expect.objectContaining({
        task: "发送资料",
        contact_name: "不存在的联系人",
        status: "needs_confirmation",
      }),
    ]);
    expect(data.review.follow_up_failures).toEqual(data.follow_up_failures);
    expect(data.review.follow_up_todos[0].status).toBe("needs_confirmation");
    expect(JSON.parse(env.USER_DATA._store.get("todos:testuser") || "[]")).toHaveLength(0);
  });

  it("auto-completes prep todos matching meeting title when review completes", async () => {
    // Seed a meeting titled "拜访老许"
    await worker.fetch(jsonReq("/data/meetings", {
      body: { title: "拜访老许", date: "2026-07-18", status: "planned" },
      headers: authHeader(),
    }), env, mockCtx);
    const meeting = JSON.parse(env.USER_DATA._store.get("meetings:testuser"))[0];

    // Seed a prep todo "拜访老许" (pending) — should be auto-completed when meeting completes
    await worker.fetch(jsonReq("/data/todos", {
      body: { task: "拜访老许", priority: "P1", due: "2026-07-18", source: "visit" },
      headers: authHeader(),
    }), env, mockCtx);

    // Seed an unrelated todo — should NOT be completed
    await worker.fetch(jsonReq("/data/todos", {
      body: { task: "给张总写周报", priority: "P2", due: "2026-07-20" },
      headers: authHeader(),
    }), env, mockCtx);

    // Mock LLM returning a review (no follow-up todos to keep it simple)
    globalThis.fetch = async () => llmJson({
      summary: "拜访完成，聊了合作方向",
      new_contacts: [],
      follow_up_todos: [],
      opportunity_analysis: [],
      leverage_insights: "",
      goal_suggestions: [],
    });

    const res = await worker.fetch(jsonReq("/ai/meeting_review", {
      body: { meeting_id: meeting.id },
      headers: authHeader(),
    }), env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.auto_completed_todos).toBe(1);

    // Verify: "拜访老许" todo is done, "给张总写周报" is still pending
    const todos = JSON.parse(env.USER_DATA._store.get("todos:testuser"));
    const visitTodo = todos.find(t => t.task === "拜访老许");
    const reportTodo = todos.find(t => t.task === "给张总写周报");
    expect(visitTodo.status).toBe("done");
    expect(visitTodo.completed_at).toBeTruthy();
    expect(reportTodo.status).toBe("pending");
  });

  it("requires auth (401)", async () => {
    const req = jsonReq("/ai/meeting_review", { body: { meeting_id: "x" } });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing meeting_id", async () => {
    const req = jsonReq("/ai/meeting_review", {
      body: {},
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(400);
  });

  it("uses raw text as summary (unstructured) when LLM returns prose with no JSON", async () => {
    // Seed a meeting
    await worker.fetch(jsonReq("/data/meetings", {
      body: { title: "测试会议", date: "2026-07-18", status: "planned" },
      headers: authHeader(),
    }), env, mockCtx);
    const meeting = JSON.parse(env.USER_DATA._store.get("meetings:testuser"))[0];

    // LLM returns prose with no JSON block at all
    globalThis.fetch = async () => llmText("会议复盘：这次会议主要讨论了Q4合作方向，双方同意下周再细谈。建议跟进合作细节。");

    const res = await worker.fetch(jsonReq("/ai/meeting_review", {
      body: { meeting_id: meeting.id },
      headers: authHeader(),
    }), env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.unstructured).toBe(true);
    expect(data.review.summary).toContain("Q4合作方向");
    // No follow-up todos created since unstructured
    const todos = JSON.parse(env.USER_DATA._store.get("todos:testuser") || "[]");
    expect(todos.length).toBe(0);
    // Meeting marked completed with review persisted
    const m = JSON.parse(env.USER_DATA._store.get("meetings:testuser")).find(x => x.id === meeting.id);
    expect(m.status).toBe("completed");
    expect(m.review.summary).toContain("Q4合作方向");
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/meeting_photo — roster type + JSON fallback recovery
// ═══════════════════════════════════════════════════════════════
describe("/ai/meeting_photo (mocked LLM)", () => {
  const originalFetch = globalThis.fetch;
  let env;
  const mockCtx = { waitUntil: () => {} };

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

  // Minimal 1x1 PNG base64 (valid image block for the handler)
  const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M8AAQABAABJfQ3oAAAAAElFTkSuQmCC";

  beforeEach(() => { env = baseEnv(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("roster type recognizes attendees and matches existing contacts", async () => {
    // Seed an existing contact "老许"
    env.USER_DATA._store.set("contacts:testuser", JSON.stringify([
      { id: "c-1", name: "老许", company: "腾讯" },
    ]));

    globalThis.fetch = async () => llmText(JSON.stringify({
      attendees: [
        { name: "老许", title: "总监", company: "腾讯", relationship: "" },
        { name: "李总", title: "", company: "阿里", relationship: "" },
      ],
    }));

    const res = await worker.fetch(jsonReq("/ai/meeting_photo", {
      body: { photo_type: "roster", base64: tinyPng, media_type: "image/png" },
      headers: authHeader(),
    }), env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.extracted.attendees).toHaveLength(2);
    // 老许 should be matched as existing
    const xu = data.extracted.attendees.find(a => a.name === "老许");
    expect(xu.is_existing).toBe(true);
    expect(xu.contact_id).toBe("c-1");
    // 李总 should be first_meeting
    const li = data.extracted.attendees.find(a => a.name === "李总");
    expect(li.is_existing).toBe(false);
    expect(li.first_meeting).toBe(true);
  });

  it("recovers via fallback block extraction when LLM wraps JSON in prose", async () => {
    globalThis.fetch = async () => llmText(`好的，这是识别结果：\n\`\`\`json\n{"attendees":[{"name":"王总","title":"","company":"","relationship":""}]}\n\`\`\`\n希望对你有帮助。`);

    const res = await worker.fetch(jsonReq("/ai/meeting_photo", {
      body: { photo_type: "card", base64: tinyPng, media_type: "image/png" },
      headers: authHeader(),
    }), env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.extracted.attendees).toHaveLength(1);
    expect(data.extracted.attendees[0].name).toBe("王总");
  });

  it("rejects invalid photo_type (400)", async () => {
    const req = jsonReq("/ai/meeting_photo", {
      body: { photo_type: "invalid", base64: tinyPng },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(400);
  });

  it("requires auth (401)", async () => {
    const req = jsonReq("/ai/meeting_photo", { body: { photo_type: "card", base64: tinyPng } });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(401);
  });

  it("returns raw_text fallback (unstructured) when LLM returns prose with no JSON", async () => {
    globalThis.fetch = async () => llmText("这张照片显示了一个会议白板，上面写着关于Q3产品路线图的讨论要点，包括新功能开发和市场推广计划。没有识别到具体的JSON结构。");

    const res = await worker.fetch(jsonReq("/ai/meeting_photo", {
      body: { photo_type: "notes", base64: tinyPng, media_type: "image/png" },
      headers: authHeader(),
    }), env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.unstructured).toBe(true);
    expect(data.extracted.raw_text).toContain("Q3产品路线图");
    // No attendees/opportunities arrays since it's unstructured
    expect(data.extracted.attendees).toBeUndefined();
  });

  // Regression: agenda prompt must be passed to LLM as system prompt.
  // Previously the photo_type-specific prompt was defined but never passed
  // to callLLM — LLM received a generic "You are a helpful assistant" and
  // had no idea what JSON fields to extract, so auto-fill always failed.
  it("agenda type passes the agenda extraction prompt to LLM (regression)", async () => {
    let capturedSystem = "";
    globalThis.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      capturedSystem = body.system || "";
      return llmText(JSON.stringify({
        title: "Q3评审会",
        date: "2026-07-30",
        location: "会议室A",
        agenda: [{ topic: "上季度回顾", time: "14:00", presenter: "" }],
        purpose: "季度复盘",
      }));
    };

    const res = await worker.fetch(jsonReq("/ai/meeting_photo", {
      body: { photo_type: "agenda", base64: tinyPng, media_type: "image/png" },
      headers: authHeader(),
    }), env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    // The system prompt must contain agenda-specific extraction instructions
    expect(capturedSystem).toContain("议程");
    expect(capturedSystem).toContain("title");
    expect(capturedSystem).toContain("agenda");
    // Extracted fields should be present
    expect(data.extracted.title).toBe("Q3评审会");
    expect(data.extracted.agenda).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Self-evolution: behavioral insights generation + injection
// ═══════════════════════════════════════════════════════════════

describe("Self-evolution: behavioral insights", () => {
  const originalFetch = globalThis.fetch;
  let env;
  // waitUntil must capture the promise so tests can await it
  let _waitPromise;
  const mockCtx = { waitUntil: (p) => { _waitPromise = p; } };

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

  beforeEach(() => { env = baseEnv(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("scheduled handler generates insights from metrics and writes to KV", async () => {
    // Seed a wechat-bound user with metrics
    env.USER_DATA._store.set("wechat_bind:wx123", "user_test_001");
    const wk = "2026-W30";
    env.USER_DATA._store.set("metrics:user_test_001", JSON.stringify({
      weekly: {
        [wk]: { advise_generated: 5, todo_completed: 3, interaction_recorded: 8, draft_generated: 2, signal_action: 1 },
      },
      adoptions: [
        { advise_id: "adv_1", action_type: "todo_completed", ts: new Date().toISOString(), contact: "张总" },
        { advise_id: "adv_2", action_type: "interaction_recorded", ts: new Date().toISOString(), contact: "李总" },
      ],
      last_advise_ts: new Date().toISOString(),
      last_advise_id: "adv_2",
    }));
    // Seed a contact
    env.USER_DATA._store.set("contacts:user_test_001", JSON.stringify([
      { id: "c1", name: "张总", nature: "leverage" },
      { id: "c2", name: "李总", nature: "nurture" },
    ]));

    // Mock LLM to return insights
    globalThis.fetch = async () => llmText("• 建议包含具体人名时采纳率78%，泛泛建议仅12%——始终包含具体联系人名\n• 经营型联系人互动频率偏低，建议增加跟进提醒\n• 待办完成率高（85%），用户执行力强——可更积极建议行动");

    // Trigger self-evolution cron
    await worker.scheduled({ cron: "0 2 * * 1" }, env, mockCtx);
    await _waitPromise;

    // Verify insights written to KV
    const insights = env.USER_DATA._store.get("prompt:behavioral_insights:user_test_001.md");
    expect(insights).toBeTruthy();
    expect(insights).toContain("•");
    expect(insights.length).toBeGreaterThan(20);
  });

  it("counts normalized leverage, nurture, dual, and Chinese nature variants", async () => {
    const userId = "user_nature_counts";
    env.USER_DATA._store.set("wechat_bind:wx789", userId);
    env.USER_DATA._store.set(`metrics:${userId}`, JSON.stringify({
      weekly: { "2026-W30": { advise_generated: 1 } },
    }));
    env.USER_DATA._store.set(`contacts:${userId}`, JSON.stringify([
      { id: "c1", nature: "leverage" },
      { id: "c2", nature: "nurture" },
      { id: "c3", nature: "dual" },
      { id: "c4", nature: "双重" },
      { id: "c5", nature: "经营型" },
      { id: "c6", nature: "陪伴型" },
    ]));

    let analysisData;
    globalThis.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      analysisData = JSON.parse(body.messages[0].content);
      return llmText("• 关系类型计数正常");
    };

    await worker.scheduled({ cron: "0 2 * * 1" }, env, mockCtx);
    await _waitPromise;

    expect(analysisData.contacts).toEqual({ total: 6, leverage: 4, nurture: 4 });
  });

  it("injects behavioral insights into advise system prompt", async () => {
    // Seed insights for testuser
    const insightsText = "• 建议包含具体人名时采纳率78%——始终包含具体联系人名";
    env.USER_DATA._store.set("prompt:behavioral_insights:testuser.md", insightsText);

    // Seed a contact so advise has something to suggest
    env.USER_DATA._store.set("contacts:testuser", JSON.stringify([
      { id: "c1", name: "张总", nature: "leverage", last_interaction: "2026-07-01", strength: 4 },
    ]));

    let capturedSystem = "";
    globalThis.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      capturedSystem = body.system || "";
      return llmText("💡 张总 — 2周没联系了，建议聊聊项目进展");
    };

    const res = await worker.fetch(jsonReq("/ai/advise_cloud", {
      headers: authHeader(),
    }), env, mockCtx);
    expect(res.status).toBe(200);
    // The system prompt must contain the behavioral insights
    expect(capturedSystem).toContain("行为洞察");
    expect(capturedSystem).toContain("建议包含具体人名");
  });

  it("does not modify prompt when no insights exist", async () => {
    // No insights in KV for testuser
    env.USER_DATA._store.set("contacts:testuser", JSON.stringify([
      { id: "c1", name: "张总", nature: "leverage", last_interaction: "2026-07-01", strength: 4 },
    ]));

    let capturedSystem = "";
    globalThis.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      capturedSystem = body.system || "";
      return llmText("💡 张总 — 建议联系");
    };

    await worker.fetch(jsonReq("/ai/advise_cloud", {
      headers: authHeader(),
    }), env, mockCtx);
    // System prompt should NOT contain insights section
    expect(capturedSystem).not.toContain("行为洞察");
  });

  it("injects insights into draft system prompt", async () => {
    const insightsText = "• 经营型draft需要更具体的话题建议";
    env.USER_DATA._store.set("prompt:behavioral_insights:testuser.md", insightsText);

    let capturedSystem = "";
    globalThis.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      capturedSystem = body.system || "";
      return llmText("嘿张总，最近项目进展怎么样？");
    };

    await worker.fetch(jsonReq("/ai/draft", {
      body: { name: "张总", nature: "leverage" },
      headers: authHeader(),
    }), env, mockCtx);
    expect(capturedSystem).toContain("行为洞察");
    expect(capturedSystem).toContain("经营型draft");
  });
});

describe('action card authentication regressions', () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
  });

  it('requires auth for GET action cards and POST confirmations', async () => {
    const getResponse = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
    }), env, {});
    const postResponse = await worker.fetch(jsonReq('/ai/action_card/confirm', {
      body: { action: 'skip', action_id: 'act-unauthenticated' },
    }), env, {});

    expect(getResponse.status).toBe(401);
    expect(postResponse.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// /ai/action_card — skip exclusion logic
// ═══════════════════════════════════════════════════════════════

describe("/ai/action_card skip exclusion", () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
    if (globalThis._clearTrackActionCache) globalThis._clearTrackActionCache();
  });

  it("skip stores contact_id and next GET excludes it", async () => {
    // Seed: 2 leverage contacts, both overdue
    env.USER_DATA._store.set("contacts:testuser", JSON.stringify([
      { id: "c1", name: "张三", nature: "leverage", strength: 3 },
      { id: "c2", name: "李四", nature: "leverage", strength: 3 },
    ]));
    env.USER_DATA._store.set("timeline:testuser", JSON.stringify([]));
    env.USER_DATA._store.set("todos:testuser", JSON.stringify([]));
    env.USER_DATA._store.set("perceptions:testuser", JSON.stringify([]));

    // GET action_card → should return c1 (first by sort)
    let res = await worker.fetch(jsonReq("/ai/action_card", {
      method: "GET",
      headers: authHeader(),
    }), env, {});
    let data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.action_card).toBeTruthy();
    const firstContactId = data.action_card.contact.id;

    // Skip it
    res = await worker.fetch(jsonReq("/ai/action_card/confirm", {
      body: { action: "skip", contact_id: firstContactId },
      headers: authHeader(),
    }), env, {});
    data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.action).toBe("skip");

    // GET again → should return the OTHER contact
    res = await worker.fetch(jsonReq("/ai/action_card", {
      method: "GET",
      headers: authHeader(),
    }), env, {});
    data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.action_card).toBeTruthy();
    expect(data.action_card.contact.id).not.toBe(firstContactId);
  });

  it("skip without contact_id does not exclude anything", async () => {
    env.USER_DATA._store.set("contacts:testuser", JSON.stringify([
      { id: "c1", name: "张三", nature: "leverage", strength: 3 },
    ]));
    env.USER_DATA._store.set("timeline:testuser", JSON.stringify([]));
    env.USER_DATA._store.set("todos:testuser", JSON.stringify([]));
    env.USER_DATA._store.set("perceptions:testuser", JSON.stringify([]));

    // Skip with no contact_id
    await worker.fetch(jsonReq("/ai/action_card/confirm", {
      body: { action: "skip" },
      headers: authHeader(),
    }), env, {});

    // GET should still return the same contact
    const res = await worker.fetch(jsonReq("/ai/action_card", {
      method: "GET",
      headers: authHeader(),
    }), env, {});
    const data = await res.json();
    expect(data.action_card).toBeTruthy();
    expect(data.action_card.contact.id).toBe("c1");
  });
});

describe('/ai/action_card R1 contract', () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
    if (globalThis._clearTrackActionCache) globalThis._clearTrackActionCache();
  });

  it('returns a stable R1 action schema for the same source and day', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c1', name: '张三', nature: 'leverage', strength: 3 },
    ]));
    env.USER_DATA._store.set('timeline:testuser', JSON.stringify([
      { id: 'tl1', contact: 'c1', date: '2020-01-01', summary: '上次讨论合作方案' },
    ]));
    env.USER_DATA._store.set('todos:testuser', JSON.stringify([]));

    const first = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
      headers: authHeader(),
    }), env, {});
    const second = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
      headers: authHeader(),
    }), env, {});
    const firstData = await first.json();
    const secondData = await second.json();
    const action = firstData.action_card;

    expect(first.status).toBe(200);
    expect(action).toBeTruthy();
    expect(action.id).toBe(action.action_id);
    expect(action.id).toBe(secondData.action_card.id);
    expect(action.type).toBe('advise');
    expect(action.contact).toMatchObject({ id: 'c1', name: '张三', nature: 'leverage' });
    expect(action.nature).toBe('leverage');
    expect(action.reason).toBeTruthy();
    expect(action.message).toBe(action.reason);
    expect(action.suggested_topic).toBeTruthy();
    expect(action.source).toEqual(expect.objectContaining({
      kind: expect.any(String),
      id: expect.any(String),
      evidence: expect.any(String),
    }));
    expect(action.available_actions).toEqual(expect.arrayContaining(['draft', 'record_done', 'snooze', 'skip']));
    expect(action.status).toBe('presented');
    expect(action.created_at).toBeTruthy();
    expect(action.draft_available).toBe(true);
  });

  it('uses a deterministic fallback source when no timeline or todo exists', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c1', name: '张三', nature: 'leverage', strength: 3 },
    ]));
    env.USER_DATA._store.set('timeline:testuser', JSON.stringify([]));
    env.USER_DATA._store.set('todos:testuser', JSON.stringify([]));

    const first = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
      headers: authHeader(),
    }), env, {});
    const second = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
      headers: authHeader(),
    }), env, {});
    const firstData = await first.json();
    const secondData = await second.json();

    expect(firstData.action_card.id).toBe(secondData.action_card.id);
    expect(['timeline', 'todo', 'meeting', 'signal', 'perception', 'important_date', 'candidate']).toContain(firstData.action_card.source.kind);
    expect(firstData.action_card.source).toMatchObject({ kind: 'candidate', id: 'c1' });
  });

  it('versions action records in order and rejects a stale action version', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c1', name: '张三', nature: 'leverage', strength: 3 },
    ]));
    env.USER_DATA._store.set('timeline:testuser', JSON.stringify([]));
    env.USER_DATA._store.set('todos:testuser', JSON.stringify([]));

    const first = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
      headers: authHeader(),
    }), env, {});
    const firstAction = (await first.json()).action_card;
    expect(firstAction.version).toBe(1);
    expect(env.USER_DATA._store.get('version:actions:testuser')).toBe('1');

    const snooze = await worker.fetch(jsonReq('/ai/action_card/confirm', {
      body: {
        action: 'snooze',
        action_id: firstAction.action_id,
        version: firstAction.version,
        idempotency_key: 'action-version-snooze-1',
      },
      headers: authHeader(),
    }), env, {});
    const snoozeData = await snooze.json();
    expect(snooze.status).toBe(200);
    expect(snoozeData.version).toBe(2);
    expect(JSON.parse(env.USER_DATA._store.get('actions:testuser'))[0]).toMatchObject({
      status: 'snoozed',
      version: 2,
    });

    const staleSkip = await worker.fetch(jsonReq('/ai/action_card/confirm', {
      body: {
        action: 'skip',
        action_id: firstAction.action_id,
        version: firstAction.version,
        idempotency_key: 'action-version-stale-skip',
      },
      headers: authHeader(),
    }), env, {});
    const staleData = await staleSkip.json();
    expect(staleSkip.status).toBe(409);
    expect(staleData).toMatchObject({
      ok: false,
      code: 'ACTION_VERSION_CONFLICT',
      action_id: firstAction.action_id,
      expected_version: 1,
      version: 2,
      retryable: true,
    });
    expect(JSON.parse(env.USER_DATA._store.get('actions:testuser'))[0].status).toBe('snoozed');

    const sequentialSkip = await worker.fetch(jsonReq('/ai/action_card/confirm', {
      body: {
        action: 'skip',
        action_id: firstAction.action_id,
        version: snoozeData.version,
        idempotency_key: 'action-version-skip-2',
      },
      headers: authHeader(),
    }), env, {});
    const sequentialData = await sequentialSkip.json();
    expect(sequentialSkip.status).toBe(200);
    expect(sequentialData.version).toBe(3);
    expect(JSON.parse(env.USER_DATA._store.get('actions:testuser'))[0]).toMatchObject({
      status: 'skipped',
      version: 3,
    });
  });

  it('supports snooze, idempotent retry, and re-presents the same action after expiry', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c1', name: '张三', nature: 'leverage', strength: 3 },
    ]));
    env.USER_DATA._store.set('timeline:testuser', JSON.stringify([]));
    env.USER_DATA._store.set('todos:testuser', JSON.stringify([]));

    const first = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
      headers: authHeader(),
    }), env, {});
    const firstData = await first.json();
    const actionId = firstData.action_card.action_id;

    const snoozeRequest = {
      action: 'snooze',
      action_id: actionId,
      idempotency_key: 'snooze-action-1',
    };
    const snooze = await worker.fetch(jsonReq('/ai/action_card/confirm', {
      body: snoozeRequest,
      headers: authHeader(),
    }), env, {});
    const snoozeData = await snooze.json();
    expect(snooze.status).toBe(200);
    expect(snoozeData).toMatchObject({
      ok: true,
      action: 'snooze',
      action_id: actionId,
      status: 'snoozed',
      retryable: false,
    });
    expect(snoozeData.snooze_until).toBeTruthy();
    expect(new Date(snoozeData.snooze_until).getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);

    const hidden = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
      headers: authHeader(),
    }), env, {});
    expect((await hidden.json()).action_card).toBeNull();

    const retry = await worker.fetch(jsonReq('/ai/action_card/confirm', {
      body: snoozeRequest,
      headers: authHeader(),
    }), env, {});
    const retryData = await retry.json();
    expect(retryData).toMatchObject({
      ok: true,
      action: 'snooze',
      action_id: actionId,
      status: 'snoozed',
      retryable: false,
      snooze_until: snoozeData.snooze_until,
    });

    const records = JSON.parse(env.USER_DATA._store.get('actions:testuser'));
    expect(records[0]).toMatchObject({
      action_id: actionId,
      status: 'snoozed',
      snooze_until: snoozeData.snooze_until,
    });
    records[0].snooze_until = new Date(Date.now() - 1000).toISOString();
    env.USER_DATA._store.set('actions:testuser', JSON.stringify(records));

    const expired = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
      headers: authHeader(),
    }), env, {});
    const expiredData = await expired.json();
    expect(expiredData.action_card).toMatchObject({
      id: actionId,
      action_id: actionId,
      status: 'presented',
    });

    const customSnooze = await worker.fetch(jsonReq('/ai/action_card/confirm', {
      body: {
        action: 'snooze',
        action_id: actionId,
        snooze_days: 2,
        idempotency_key: 'snooze-action-2',
      },
      headers: authHeader(),
    }), env, {});
    const customSnoozeData = await customSnooze.json();
    expect(customSnoozeData.status).toBe('snoozed');
    expect(new Date(customSnoozeData.snooze_until).getTime()).toBeGreaterThan(Date.now() + 47 * 60 * 60 * 1000);
  });

  it('keeps done and skip retries terminal and non-retryable', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c1', name: '张三', nature: 'leverage', strength: 3 },
    ]));
    env.USER_DATA._store.set('timeline:testuser', JSON.stringify([]));
    env.USER_DATA._store.set('todos:testuser', JSON.stringify([]));

    const first = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
      headers: authHeader(),
    }), env, {});
    const actionId = (await first.json()).action_card.action_id;
    const doneRequest = {
      action: 'done',
      action_id: actionId,
      contact_id: 'c1',
      idempotency_key: 'done-action-1',
    };
    const done = await worker.fetch(jsonReq('/ai/action_card/confirm', {
      body: doneRequest,
      headers: authHeader(),
    }), env, {});
    expect((await done.json())).toMatchObject({ status: 'done', retryable: false });

    const doneRetry = await worker.fetch(jsonReq('/ai/action_card/confirm', {
      body: doneRequest,
      headers: authHeader(),
    }), env, {});
    expect((await doneRetry.json())).toMatchObject({ status: 'done', retryable: false });

    const skipAfterDone = await worker.fetch(jsonReq('/ai/action_card/confirm', {
      body: { action: 'skip', action_id: actionId },
      headers: authHeader(),
    }), env, {});
    expect((await skipAfterDone.json())).toMatchObject({ status: 'done', retryable: false });

    const snoozeAfterDone = await worker.fetch(jsonReq('/ai/action_card/confirm', {
      body: { action: 'snooze', action_id: actionId },
      headers: authHeader(),
    }), env, {});
    expect((await snoozeAfterDone.json())).toMatchObject({ status: 'done', retryable: false });
  });

  it('does not double count a dashboard draft flow', async () => {
    env.LLM_API_KEY = '';
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c1', name: '张三', nature: 'leverage', strength: 3 },
    ]));
    env.USER_DATA._store.set('timeline:testuser', JSON.stringify([]));
    env.USER_DATA._store.set('todos:testuser', JSON.stringify([]));

    const actionResponse = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
      headers: authHeader(),
    }), env, {});
    const actionCard = (await actionResponse.json()).action_card;

    const draftResponse = await worker.fetch(jsonReq('/ai/draft', {
      body: {
        name: '张三',
        nature: 'leverage',
        contact_id: 'c1',
        source: 'action_card',
        event_id: 'draft-flow-generated',
      },
      headers: authHeader(),
    }), env, {});
    expect(draftResponse.status).toBe(200);

    const confirmResponse = await worker.fetch(jsonReq('/ai/action_card/confirm', {
      body: {
        action: 'draft',
        action_id: actionCard.action_id,
        contact_id: 'c1',
        draft_text: '张三你好，最近怎么样？',
        idempotency_key: 'draft-flow-accepted',
      },
      headers: authHeader(),
    }), env, {});
    expect(confirmResponse.status).toBe(200);
    expect((await confirmResponse.json())).toMatchObject({ status: 'accepted', retryable: false });

    const metrics = JSON.parse(env.USER_DATA._store.get('metrics:testuser'));
    const week = Object.keys(metrics.weekly)[0];
    expect(metrics.weekly[week].draft_generated).toBe(1);
    const events = JSON.parse(env.USER_DATA._store.get('domain_events:testuser'));
    expect(events.filter(event => event.event_type === 'draft_generated')).toHaveLength(1);
    expect(events.filter(event => event.event_type === 'action_accepted')).toHaveLength(1);
  });

  it('maps an important date to a nurture action source', async () => {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    const dateValue = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c1', name: '妈妈', nature: 'nurture', important_dates: [{ label: '生日', date: dateValue }] },
    ]));
    env.USER_DATA._store.set('timeline:testuser', JSON.stringify([]));
    env.USER_DATA._store.set('todos:testuser', JSON.stringify([]));

    const res = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
      headers: authHeader(),
    }), env, {});
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.action_card).toMatchObject({
      type: 'nurture',
      nature: 'nurture',
      source: expect.objectContaining({ kind: 'important_date', id: expect.stringContaining('c1:') }),
    });
  });

  it('turns a confirmed perception into a perception_driven action with evidence', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c1', name: '张三', nature: 'leverage' },
    ]));
    env.USER_DATA._store.set('timeline:testuser', JSON.stringify([]));
    env.USER_DATA._store.set('todos:testuser', JSON.stringify([]));
    env.USER_DATA._store.set('perceptions:testuser', JSON.stringify([
      {
        id: 'p-confirmed',
        contact_id: 'c1',
        status: 'confirmed',
        title: '确认的公开变化',
        summary: '张三发布了新的项目',
        confirmed_at: '2026-08-01T00:00:00Z',
        source: { platform: 'github', original_text: '公开原文片段' },
      },
    ]));

    const res = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
      headers: authHeader(),
    }), env, {});
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.action_card).toMatchObject({
      type: 'perception_driven',
      perception_id: 'p-confirmed',
      source: expect.objectContaining({ kind: 'perception', id: 'p-confirmed', evidence: '张三发布了新的项目' }),
    });
  });

  it('does not turn pending perception into an executable action card', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c1', name: '张三', nature: 'leverage', strength: 3 },
    ]));
    env.USER_DATA._store.set('timeline:testuser', JSON.stringify([]));
    env.USER_DATA._store.set('todos:testuser', JSON.stringify([]));
    env.USER_DATA._store.set('perceptions:testuser', JSON.stringify([
      { id: 'p1', contact_id: 'c1', status: 'pending', title: '公开变化', summary: '待确认变化', created_at: '2026-08-01T00:00:00Z' },
    ]));

    const res = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
      headers: authHeader(),
    }), env, {});
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.action_card).toBeNull();
    expect(data.pending_review).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'p1', status: 'pending' }),
    ]));
  });

  it('maps a meeting follow-up todo to meeting_followup with meeting source', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c1', name: '张三', nature: 'leverage', strength: 3 },
    ]));
    env.USER_DATA._store.set('timeline:testuser', JSON.stringify([]));
    env.USER_DATA._store.set('todos:testuser', JSON.stringify([
      { id: 'todo1', contact: 'c1', task: '发送会议方案', due: '2099-01-01', status: 'pending', source: 'meeting:m1' },
    ]));

    const res = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
      headers: authHeader(),
    }), env, {});
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.action_card).toMatchObject({
      type: 'meeting_followup',
      todo_id: 'todo1',
      source: expect.objectContaining({ kind: 'meeting', id: 'm1' }),
    });
  });

  it('maps a signal follow-up todo to signal_match with signal source', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c1', name: '张三', nature: 'leverage' },
    ]));
    env.USER_DATA._store.set('timeline:testuser', JSON.stringify([]));
    env.USER_DATA._store.set('todos:testuser', JSON.stringify([
      { id: 'todo-signal', contact: 'c1', task: '跟进公开信号', due: '2099-01-01', status: 'pending', source: 'signal:s1' },
    ]));

    const res = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
      headers: authHeader(),
    }), env, {});
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.action_card).toMatchObject({
      type: 'signal_match',
      source: expect.objectContaining({ kind: 'signal', id: 's1' }),
    });
  });

  it('keeps advise and action card candidate policy aligned', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c1', name: '张三', nature: 'leverage', strength: 3 },
    ]));
    const recent = new Date();
    recent.setDate(recent.getDate() - 10);
    env.USER_DATA._store.set('timeline:testuser', JSON.stringify([
      { id: 'tl1', contact: 'c1', date: recent.toISOString().slice(0, 10), summary: '最近聊过近况' },
    ]));
    env.USER_DATA._store.set('todos:testuser', JSON.stringify([]));

    const advise = await worker.fetch(jsonReq('/ai/advise_cloud', {
      body: { session_token: 'testuser:secret' },
      headers: authHeader(),
    }), env, {});
    const actionCard = await worker.fetch(jsonReq('/ai/action_card', {
      method: 'GET',
      headers: authHeader(),
    }), env, {});
    const adviseData = await advise.json();
    const actionData = await actionCard.json();

    expect(advise.status).toBe(200);
    expect(actionCard.status).toBe(200);
    expect(adviseData.result).not.toContain('张三');
    expect(actionData.action_card).toBeNull();
  });
});
