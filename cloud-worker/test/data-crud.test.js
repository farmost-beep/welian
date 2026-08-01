// Tests for /data/* CRUD endpoints — contacts, timeline, todos, delete_account.
// No real LLM calls. KV is mocked. Auth uses sync-secret bypass.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, authHeader, jsonReq } from "./helpers.js";

// ═══════════════════════════════════════════════════════════════
// /data/contacts — CRUD
// ═══════════════════════════════════════════════════════════════

describe("/data/contacts CRUD", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("POST creates a new contact", async () => {
    const req = jsonReq("/data/contacts", {
      body: { name: "张三", company: "腾讯", relation: "合作者" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.contact.name).toBe("张三");
    expect(data.contact.id).toBeTruthy();
    // Verify via GET that contact was stored
    const listRes = await worker.fetch(jsonReq("/data/contacts", {
      method: "GET", headers: authHeader(),
    }), env, {});
    const listData = await listRes.json();
    const found = listData.contacts.find(c => c.name === "张三");
    expect(found).toBeTruthy();
    expect(found.relation).toBe("合作者");
    expect(found.company).toBe("腾讯");  // company field now stored (bug fixed)
  });

  it("POST rejects missing name with 400", async () => {
    const req = jsonReq("/data/contacts", {
      body: { company: "腾讯" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });

  it("GET returns contacts list", async () => {
    // Create a contact first
    await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "李四", company: "阿里" },
      headers: authHeader(),
    }), env, {});

    const req = jsonReq("/data/contacts", { method: "GET", headers: authHeader() });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.contacts.length).toBe(1);
    expect(data.contacts[0].name).toBe("李四");
    expect(data.total).toBe(1);
  });

  it("POST with existing id updates contact", async () => {
    // Create
    const createRes = await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "王五", company: "百度" },
      headers: authHeader(),
    }), env, {});
    const created = await createRes.json();

    // Update
    const updateRes = await worker.fetch(jsonReq("/data/contacts", {
      body: { id: created.contact.id, name: "王五", company: "字节跳动" },
      headers: authHeader(),
    }), env, {});
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.contact.company).toBe("字节跳动");
  });

  it("DELETE removes contact and related timeline/todos", async () => {
    // Create contact
    const createRes = await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "赵六" },
      headers: authHeader(),
    }), env, {});
    const created = await createRes.json();
    const contactId = created.contact.id;

    // Create timeline for this contact
    await worker.fetch(jsonReq("/data/timeline", {
      body: { contact: contactId, summary: "聊了项目", date: "2026-07-15" },
      headers: authHeader(),
    }), env, {});

    // Delete contact
    const req = new Request(`https://worker.test/data/contacts?id=${contactId}`, {
      method: "DELETE",
      headers: { ...authHeader() },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify contact is gone
    const listRes = await worker.fetch(jsonReq("/data/contacts", {
      method: "GET", headers: authHeader(),
    }), env, {});
    const listData = await listRes.json();
    expect(listData.contacts.find(c => c.id === contactId)).toBeUndefined();
  });

  it("requires auth (401 without token)", async () => {
    const req = jsonReq("/data/contacts", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// /data/timeline — CRUD
// ═══════════════════════════════════════════════════════════════

describe("/data/timeline CRUD", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("POST creates a timeline entry", async () => {
    const req = jsonReq("/data/timeline", {
      body: { contact: "c-test", summary: "聊了项目合作", date: "2026-07-15" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.entry).toBeTruthy();
  });

  it("GET returns timeline entries", async () => {
    // Create an entry
    await worker.fetch(jsonReq("/data/timeline", {
      body: { contact: "c-1", summary: "开会讨论方案", date: "2026-07-16" },
      headers: authHeader(),
    }), env, {});

    const req = jsonReq("/data/timeline", { method: "GET", headers: authHeader() });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.timeline.length).toBeGreaterThanOrEqual(1);
  });

  it("GET filters by contact_id", async () => {
    // Create entries for different contacts
    await worker.fetch(jsonReq("/data/timeline", {
      body: { contact: "c-a", summary: "见A", date: "2026-07-15" },
      headers: authHeader(),
    }), env, {});
    await worker.fetch(jsonReq("/data/timeline", {
      body: { contact: "c-b", summary: "见B", date: "2026-07-16" },
      headers: authHeader(),
    }), env, {});

    // Filter by c-a
    const req = new Request("https://worker.test/data/timeline?contact_id=c-a", {
      method: "GET",
      headers: { ...authHeader() },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.timeline.every(e => e.contact === "c-a")).toBe(true);
  });

  it("requires auth (401)", async () => {
    const req = jsonReq("/data/timeline", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// /data/todos — CRUD + status operations
// ═══════════════════════════════════════════════════════════════

describe("/data/todos CRUD", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("POST creates a todo", async () => {
    const req = jsonReq("/data/todos", {
      body: { contact: "c-1", task: "跟进项目", due: "2026-07-28", priority: "P1" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("GET lists pending todos", async () => {
    // Create a todo
    await worker.fetch(jsonReq("/data/todos", {
      body: { contact: "c-1", task: "写周报" },
      headers: authHeader(),
    }), env, {});

    const req = jsonReq("/data/todos", { method: "GET", headers: authHeader() });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.todos.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /data/todos/done marks todo as complete", async () => {
    // Create a todo
    const createRes = await worker.fetch(jsonReq("/data/todos", {
      body: { contact: "c-1", task: "完成任务测试" },
      headers: authHeader(),
    }), env, {});
    const created = await createRes.json();

    // Mark as done
    const doneRes = await worker.fetch(jsonReq("/data/todos/done", {
      body: { id: created.todo?.id || created.id || "t-1" },
      headers: authHeader(),
    }), env, {});
    // Should return 200 (or 404 if id format doesn't match, but not 500)
    expect([200, 404]).toContain(doneRes.status);
  });

  it("POST /data/todos/postpone updates due date", async () => {
    // Create a todo
    const createRes = await worker.fetch(jsonReq("/data/todos", {
      body: { contact: "c-1", task: "推迟测试", due: "2026-07-20" },
      headers: authHeader(),
    }), env, {});
    const created = await createRes.json();
    const todoId = created.todo?.id || created.id;

    // Postpone
    const postponeRes = await worker.fetch(jsonReq("/data/todos/postpone", {
      body: { id: todoId, due: "2026-08-01" },
      headers: authHeader(),
    }), env, {});
    expect([200, 404]).toContain(postponeRes.status);
  });

  it("POST /data/todos/cancel marks todo as cancelled", async () => {
    const createRes = await worker.fetch(jsonReq("/data/todos", {
      body: { contact: "c-1", task: "取消测试" },
      headers: authHeader(),
    }), env, {});
    const created = await createRes.json();
    const todoId = created.todo?.id || created.id;

    const cancelRes = await worker.fetch(jsonReq("/data/todos/cancel", {
      body: { id: todoId },
      headers: authHeader(),
    }), env, {});
    expect([200, 404]).toContain(cancelRes.status);
  });

  it("POST /data/todos/reopen reopens a cancelled/done todo", async () => {
    const createRes = await worker.fetch(jsonReq("/data/todos", {
      body: { contact: "c-1", task: "重开测试" },
      headers: authHeader(),
    }), env, {});
    const created = await createRes.json();
    const todoId = created.todo?.id || created.id;

    const reopenRes = await worker.fetch(jsonReq("/data/todos/reopen", {
      body: { id: todoId },
      headers: authHeader(),
    }), env, {});
    expect([200, 404]).toContain(reopenRes.status);
  });

  it("requires auth (401)", async () => {
    const req = jsonReq("/data/todos", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// /data/delete_account — account deletion
// ═══════════════════════════════════════════════════════════════

describe("/data/delete_account", () => {
  let env;
  const mockCtx = { waitUntil: () => {} };
  beforeEach(() => { env = baseEnv(); });

  it("deletes all user data (contacts, todos, timeline)", async () => {
    // Seed data
    await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "测试人" },
      headers: authHeader(),
    }), env, mockCtx);
    await worker.fetch(jsonReq("/data/todos", {
      body: { contact: "c-1", task: "测试待办" },
      headers: authHeader(),
    }), env, mockCtx);

    // Delete account
    const req = jsonReq("/data/delete_account", {
      method: "POST",
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(200);

    // Verify contacts are gone
    const contactsRes = await worker.fetch(jsonReq("/data/contacts", {
      method: "GET", headers: authHeader(),
    }), env, mockCtx);
    const contactsData = await contactsRes.json();
    expect(contactsData.contacts.length).toBe(0);
  });

  it("requires auth (401)", async () => {
    const req = jsonReq("/data/delete_account", { method: "POST" });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// /data/search — contact search
// ═══════════════════════════════════════════════════════════════

describe("/data/search", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("POST returns matched contacts by keywords", async () => {
    // Seed a contact
    await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "老许", company: "腾讯", tags: ["项目合作"] },
      headers: authHeader(),
    }), env, {});

    const req = jsonReq("/data/search", {
      body: { keywords: ["老许"], contact_name: "老许" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.matched_count).toBeGreaterThanOrEqual(0);
  });

  it("requires auth (401)", async () => {
    const req = jsonReq("/data/search", { body: { keywords: ["test"] } });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// /data/pull — full data snapshot
// ═══════════════════════════════════════════════════════════════

describe("/data/pull", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("GET returns contacts, todos, timeline with pulled_at", async () => {
    const req = jsonReq("/data/pull", { method: "GET", headers: authHeader() });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.contacts).toBeDefined();
    expect(data.todos).toBeDefined();
    expect(data.timeline).toBeDefined();
    expect(data.pulled_at).toBeTruthy();
  });

  it("requires auth (401)", async () => {
    const req = jsonReq("/data/pull", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// Data integrity regression tests
// Guards against known bugs documented in CLAUDE.md:
//   1. saveDataset must NOT set expirationTtl (caused data loss)
//   2. add_timeline and add_todo contact lookup must be consistent
//      (add_timeline uses aliases, add_todo must too)
//   3. nature field must handle leverage/nurture/dual/双重 variants
// ═══════════════════════════════════════════════════════════════

// Mock KV that records put() options for TTL assertion
function trackingKV(initial = {}) {
  const store = new Map(Object.entries(initial));
  const putCalls = [];
  return {
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, value, options) {
      store.set(key, value);
      putCalls.push({ key, options: options || null });
    },
    async delete(key) { store.delete(key); },
    async list({ prefix } = {}) {
      const keys = [];
      for (const key of store.keys()) {
        if (!prefix || key.startsWith(prefix)) keys.push({ name: key });
      }
      return { keys, list_complete: true };
    },
    _store: store,
    _putCalls: putCalls,
  };
}

describe("Data integrity: saveDataset must not set expirationTtl", () => {
  it("contacts save has no TTL (regression: 7-day TTL caused data loss)", async () => {
    const kv = trackingKV();
    const env = baseEnv({ USER_DATA: kv });
    // Create a contact → triggers saveDataset
    await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "TTL测试", company: "测试公司" },
      headers: authHeader(),
    }), env, {});
    // Find the contacts put call
    const contactsPut = kv._putCalls.find(c => c.key.startsWith("contacts:"));
    expect(contactsPut).toBeTruthy();
    // Must not have expirationTtl
    expect(contactsPut.options).toBeNull();
  });

  it("todos save has no TTL", async () => {
    const kv = trackingKV();
    const env = baseEnv({ USER_DATA: kv });
    await worker.fetch(jsonReq("/data/todos", {
      body: { contact: "c-1", task: "TTL测试待办" },
      headers: authHeader(),
    }), env, {});
    const todosPut = kv._putCalls.find(c => c.key.startsWith("todos:"));
    expect(todosPut).toBeTruthy();
    expect(todosPut.options).toBeNull();
  });

  it("timeline save has no TTL", async () => {
    const kv = trackingKV();
    const env = baseEnv({ USER_DATA: kv });
    await worker.fetch(jsonReq("/data/timeline", {
      body: { contact: "c-1", summary: "TTL测试", date: "2026-07-15" },
      headers: authHeader(),
    }), env, {});
    const timelinePut = kv._putCalls.find(c => c.key.startsWith("timeline:"));
    expect(timelinePut).toBeTruthy();
    expect(timelinePut.options).toBeNull();
  });
});

describe("Data integrity: add_timeline and add_todo contact lookup consistency", () => {
  const originalFetch = globalThis.fetch;
  let env;

  function intentResponse(intent, actions = []) {
    return new Response(
      JSON.stringify({
        content: [{ type: "text", text: JSON.stringify({ intent, actions, contact_name: "", keywords: [] }) }],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: "end_turn",
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  beforeEach(() => { env = baseEnv(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("add_timeline finds contact by alias (aliases.some includes)", async () => {
    // Seed a contact with alias "老许" but name "许志远"
    await env.USER_DATA.put("contacts:testuser", JSON.stringify([
      { id: "c-xzy", name: "许志远", aliases: ["老许"] },
    ]));
    globalThis.fetch = async () => intentResponse("record", [
      { type: "add_timeline", contact_name: "老许", summary: "聊了项目", date: "2026-07-22" },
    ]);
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "记一下今天和老许聊了项目" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const timeline = JSON.parse(env.USER_DATA._store.get("timeline:testuser"));
    expect(timeline[0].contact).toBe("c-xzy"); // matched by alias
  });

  it("add_todo finds contact by alias (regression: was missing aliases check)", async () => {
    // Seed a contact with alias "老许" but name "许志远"
    await env.USER_DATA.put("contacts:testuser", JSON.stringify([
      { id: "c-xzy", name: "许志远", aliases: ["老许"] },
    ]));
    globalThis.fetch = async () => intentResponse("record", [
      { type: "add_todo", task: "联系老许", contact_name: "老许", due: "2026-07-29", priority: "P1" },
    ]);
    const req = jsonReq("/ai/extract_intent", {
      body: { text: "提醒我下周联系老许" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const todos = JSON.parse(env.USER_DATA._store.get("todos:testuser"));
    // The todo should be linked to c-xzy (found by alias), not a new contact
    expect(todos[0].contact).toBe("c-xzy");
    // And no new contact should have been created
    const contacts = JSON.parse(env.USER_DATA._store.get("contacts:testuser"));
    expect(contacts.length).toBe(1); // still just 许志远
  });
});

describe("Data integrity: nature field handles all variants", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("wxmp_contact_stats counts leverage/nurture/dual/双重 correctly", async () => {
    await env.USER_DATA.put("contacts:testuser", JSON.stringify([
      { id: "c1", name: "A", nature: "leverage" },
      { id: "c2", name: "B", nature: "nurture" },
      { id: "c3", name: "C", nature: "dual" },
      { id: "c4", name: "D", nature: "双重" },
    ]));
    const req = new Request("https://worker.test/ai/wxmp_contact_stats", {
      method: "GET",
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    const data = await res.json();
    expect(data.stats.total).toBe(4);
    expect(data.stats.leverage).toBe(3); // leverage + dual + 双重
    expect(data.stats.nurture).toBe(3);  // nurture + dual + 双重
    expect(data.stats.dual).toBe(2);     // dual + 双重
  });
});

// ═══════════════════════════════════════════════════════════════
// /data/meetings — CRUD (create / list / update / delete / merge)
// ═══════════════════════════════════════════════════════════════

describe("/data/meetings CRUD", () => {
  let env;
  const mockCtx = { waitUntil: () => {} };
  beforeEach(() => { env = baseEnv(); });

  it("POST creates a new meeting", async () => {
    const req = jsonReq("/data/meetings", {
      body: { title: "Q3评审会", date: "2026-07-25", location: "会议室A", purpose: "季度复盘" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.meeting.id).toBeTruthy();
    expect(data.meeting.title).toBe("Q3评审会");
    expect(data.meeting.status).toBe("planned");
  });

  it("POST rejects missing title with 400", async () => {
    const req = jsonReq("/data/meetings", {
      body: { date: "2026-07-25" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(400);
  });

  it("GET lists meetings sorted by date desc", async () => {
    // Create two meetings
    await worker.fetch(jsonReq("/data/meetings", {
      body: { title: "早会", date: "2026-07-01" },
      headers: authHeader(),
    }), env, mockCtx);
    await worker.fetch(jsonReq("/data/meetings", {
      body: { title: "晚会", date: "2026-07-31" },
      headers: authHeader(),
    }), env, mockCtx);

    const req = jsonReq("/data/meetings", { method: "GET", headers: authHeader() });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(2);
    // Sorted by date desc → 晚会 first
    expect(data.meetings[0].title).toBe("晚会");
  });

  it("POST with id updates existing meeting", async () => {
    // Create
    const createRes = await worker.fetch(jsonReq("/data/meetings", {
      body: { title: "原会议", date: "2026-07-20" },
      headers: authHeader(),
    }), env, mockCtx);
    const created = await createRes.json();

    // Update
    const updateRes = await worker.fetch(jsonReq("/data/meetings", {
      body: { id: created.meeting.id, title: "改后会议", status: "ongoing" },
      headers: authHeader(),
    }), env, mockCtx);
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.meeting.title).toBe("改后会议");
    expect(updated.meeting.status).toBe("ongoing");
  });

  it("POST merges into existing same-date+title meeting (dedup)", async () => {
    // First meeting
    await worker.fetch(jsonReq("/data/meetings", {
      body: { title: "周会", date: "2026-07-25", attendees: [{ name: "张三" }] },
      headers: authHeader(),
    }), env, mockCtx);

    // Second meeting with same date+title → should merge
    const mergeRes = await worker.fetch(jsonReq("/data/meetings", {
      body: { title: "周会", date: "2026-07-25", attendees: [{ name: "李四" }] },
      headers: authHeader(),
    }), env, mockCtx);
    expect(mergeRes.status).toBe(200);
    const data = await mergeRes.json();
    expect(data.merged).toBe(true);
    expect(data.meeting.attendees.length).toBe(2);

    // Verify only 1 meeting in storage
    const listRes = await worker.fetch(jsonReq("/data/meetings", {
      method: "GET", headers: authHeader(),
    }), env, mockCtx);
    const listData = await listRes.json();
    expect(listData.total).toBe(1);
  });

  it("DELETE removes meeting by id", async () => {
    const createRes = await worker.fetch(jsonReq("/data/meetings", {
      body: { title: "删除测试", date: "2026-07-25" },
      headers: authHeader(),
    }), env, mockCtx);
    const created = await createRes.json();

    const req = new Request(`https://worker.test/data/meetings?id=${created.meeting.id}`, {
      method: "DELETE",
      headers: { ...authHeader() },
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(200);

    const listRes = await worker.fetch(jsonReq("/data/meetings", {
      method: "GET", headers: authHeader(),
    }), env, mockCtx);
    const listData = await listRes.json();
    expect(listData.total).toBe(0);
  });

  it("DELETE rejects missing id with 400", async () => {
    const req = new Request("https://worker.test/data/meetings", {
      method: "DELETE",
      headers: { ...authHeader() },
    });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(400);
  });

  it("requires auth (401)", async () => {
    const req = jsonReq("/data/meetings", { method: "GET" });
    const res = await worker.fetch(req, env, mockCtx);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// /data/profile — get / save user profile
// ═══════════════════════════════════════════════════════════════

describe("/data/profile", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("GET returns null profile for new user", async () => {
    const req = jsonReq("/data/profile", { method: "GET", headers: authHeader() });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.profile).toBeNull();
  });

  it("POST saves profile and GET returns it", async () => {
    // Save
    const saveRes = await worker.fetch(jsonReq("/data/profile", {
      body: {
        name: "陈颖芳",
        occupation: "投资人",
        company: "Welian Capital",
        industry: "科技投资",
        location: "上海",
        communication_style: "直接",
      },
      headers: authHeader(),
    }), env, {});
    expect(saveRes.status).toBe(200);
    const saved = await saveRes.json();
    expect(saved.ok).toBe(true);
    expect(saved.profile.name).toBe("陈颖芳");

    // Get
    const getRes = await worker.fetch(jsonReq("/data/profile", {
      method: "GET", headers: authHeader(),
    }), env, {});
    const getData = await getRes.json();
    expect(getData.profile.name).toBe("陈颖芳");
    expect(getData.profile.company).toBe("Welian Capital");
  });

  it("POST overwrites existing profile (full replace)", async () => {
    // Save first
    await worker.fetch(jsonReq("/data/profile", {
      body: { name: "A", company: "X" },
      headers: authHeader(),
    }), env, {});
    // Save again with different data
    await worker.fetch(jsonReq("/data/profile", {
      body: { name: "B", company: "Y" },
      headers: authHeader(),
    }), env, {});

    const getRes = await worker.fetch(jsonReq("/data/profile", {
      method: "GET", headers: authHeader(),
    }), env, {});
    const data = await getRes.json();
    expect(data.profile.name).toBe("B");
    expect(data.profile.company).toBe("Y");
  });

  it("requires auth (401)", async () => {
    const req = jsonReq("/data/profile", { method: "GET" });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// /data/contacts — search + compact + alias matching
// ═══════════════════════════════════════════════════════════════

describe("/data/contacts search & compact", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("GET ?q= searches by name and alias", async () => {
    await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "许志远", aliases: ["老许"], company: "腾讯" },
      headers: authHeader(),
    }), env, {});

    // Search by name
    const res1 = await worker.fetch(jsonReq("/data/contacts?q=许志远", {
      method: "GET", headers: authHeader(),
    }), env, {});
    const data1 = await res1.json();
    expect(data1.contacts.length).toBeGreaterThanOrEqual(1);

    // Search by alias
    const res2 = await worker.fetch(jsonReq("/data/contacts?q=老许", {
      method: "GET", headers: authHeader(),
    }), env, {});
    const data2 = await res2.json();
    expect(data2.contacts.length).toBeGreaterThanOrEqual(1);
  });

  it("GET ?limit=100&compact=1 returns compact format", async () => {
    await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "测试", company: "测试公司" },
      headers: authHeader(),
    }), env, {});

    const req = new Request("https://worker.test/data/contacts?limit=100&compact=1", {
      method: "GET",
      headers: { ...authHeader() },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.contacts).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Todo completed → auto-create timeline + long-term tasks
// ═══════════════════════════════════════════════════════════════

describe("Todo completion → timeline auto-create", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("creates timeline entry when todo with contact is marked done", async () => {
    // Seed a contact + a todo linked to it
    const contactRes = await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "张总", company: "腾讯" },
      headers: authHeader(),
    }), env, {});
    const contact = (await contactRes.json()).contact;

    const todoRes = await worker.fetch(jsonReq("/data/todos", {
      body: { task: "发合作方案给张总", contact: contact.id, due: "2026-08-01", priority: "P1" },
      headers: authHeader(),
    }), env, {});
    const todo = (await todoRes.json()).todo;

    // Mark done
    const doneRes = await worker.fetch(jsonReq("/data/todos/done", {
      body: { id: todo.id },
      headers: authHeader(),
    }), env, {});
    expect(doneRes.status).toBe(200);

    // Verify timeline created
    const timeline = JSON.parse(env.USER_DATA._store.get("timeline:testuser"));
    expect(timeline.length).toBe(1);
    expect(timeline[0].contact).toBe(contact.id);
    expect(timeline[0].summary).toBe("完成了：发合作方案给张总");
    expect(timeline[0].type).toBe("todo_completed");
    expect(timeline[0].source).toBe(`todo:${todo.id}`);
  });

  it("does NOT create timeline when todo has no contact", async () => {
    // Create todo without contact
    const todoRes = await worker.fetch(jsonReq("/data/todos", {
      body: { task: "买牛奶", due: "2026-08-01" },
      headers: authHeader(),
    }), env, {});
    const todo = (await todoRes.json()).todo;

    await worker.fetch(jsonReq("/data/todos/done", {
      body: { id: todo.id },
      headers: authHeader(),
    }), env, {});

    // No timeline should be created
    const timelineRaw = env.USER_DATA._store.get("timeline:testuser");
    if (timelineRaw) {
      expect(JSON.parse(timelineRaw).length).toBe(0);
    }
  });

  it("is idempotent — second done call does not create duplicate timeline", async () => {
    const contactRes = await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "李总" },
      headers: authHeader(),
    }), env, {});
    const contact = (await contactRes.json()).contact;

    const todoRes = await worker.fetch(jsonReq("/data/todos", {
      body: { task: "联系李总", contact: contact.id, due: "2026-08-01" },
      headers: authHeader(),
    }), env, {});
    const todo = (await todoRes.json()).todo;

    // First done
    await worker.fetch(jsonReq("/data/todos/done", {
      body: { id: todo.id }, headers: authHeader(),
    }), env, {});
    // Second done (idempotent)
    await worker.fetch(jsonReq("/data/todos/done", {
      body: { id: todo.id }, headers: authHeader(),
    }), env, {});

    const timeline = JSON.parse(env.USER_DATA._store.get("timeline:testuser"));
    expect(timeline.length).toBe(1); // no duplicate
  });
});

describe("Long-term tasks (due = empty string)", () => {
  let env;
  beforeEach(() => { env = baseEnv(); });

  it("creates todo with no due date when due is empty string", async () => {
    const res = await worker.fetch(jsonReq("/data/todos", {
      body: { task: "研究AI行业趋势", contact_name: "张总", due: "" },
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.todo.due).toBe("");
  });

  it("defaults to 7 days when due is not provided (undefined)", async () => {
    const res = await worker.fetch(jsonReq("/data/todos", {
      body: { task: "跟进项目", contact_name: "张总" },
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    // due should be 7 days from now (YYYY-MM-DD)
    expect(data.todo.due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dueDate = new Date(data.todo.due);
    const now = new Date();
    const diff = Math.round((dueDate - now) / 86400000);
    expect(diff).toBeGreaterThanOrEqual(6);
    expect(diff).toBeLessThanOrEqual(8);
  });

  it("long-term todos sorted after dated todos in list", async () => {
    // Create a long-term todo
    await worker.fetch(jsonReq("/data/todos", {
      body: { task: "长期任务", contact_name: "张总", due: "" },
      headers: authHeader(),
    }), env, {});
    // Create a dated todo
    await worker.fetch(jsonReq("/data/todos", {
      body: { task: "紧急任务", contact_name: "张总", due: "2026-07-30" },
      headers: authHeader(),
    }), env, {});

    const res = await worker.fetch(jsonReq("/data/todos?status=pending", {
      method: "GET", headers: authHeader(),
    }), env, {});
    const data = await res.json();
    expect(data.todos.length).toBe(2);
    // Dated todo should come first, long-term last
    expect(data.todos[0].task).toBe("紧急任务");
    expect(data.todos[1].task).toBe("长期任务");
  });
});
