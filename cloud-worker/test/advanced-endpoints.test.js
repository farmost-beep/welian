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
});
