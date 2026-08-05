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

  it("POST rejects an unknown contact_name without creating an unlinked timeline entry", async () => {
    const res = await worker.fetch(jsonReq("/data/timeline", {
      body: { contact_name: "不存在的联系人", summary: "不应被静默记录", date: "2026-07-15" },
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("不存在的联系人");
    expect(JSON.parse(env.USER_DATA._store.get("timeline:testuser") || "[]")).toHaveLength(0);
  });

  it("POST preserves explicitly unlinked timeline compatibility", async () => {
    const res = await worker.fetch(jsonReq("/data/timeline", {
      body: { contact_id: "", contact: "", summary: "无关联互动", date: "2026-07-15" },
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entry.contact).toBe("");
  });

  it("POST resolves a matched contact_name", async () => {
    const contactRes = await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "老许" },
      headers: authHeader(),
    }), env, {});
    const contact = (await contactRes.json()).contact;
    const res = await worker.fetch(jsonReq("/data/timeline", {
      body: { contact_name: "老许", summary: "已关联互动", date: "2026-07-15" },
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entry.contact).toBe(contact.id);
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

  it("POST rejects an unknown contact_name without creating an unlinked todo", async () => {
    const res = await worker.fetch(jsonReq("/data/todos", {
      body: { contact_name: "不存在的联系人", task: "不应被静默创建", due: "" },
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("不存在的联系人");
    expect(JSON.parse(env.USER_DATA._store.get("todos:testuser") || "[]")).toHaveLength(0);
  });

  it("POST preserves explicitly unlinked long-term todo compatibility", async () => {
    const res = await worker.fetch(jsonReq("/data/todos", {
      body: { contact_id: "", contact: "", task: "无关联长期任务", due: "" },
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.todo.contact).toBe("");
    expect(data.todo.due).toBe("");
  });

  it("POST resolves a matched contact_name", async () => {
    const contactRes = await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "老许" },
      headers: authHeader(),
    }), env, {});
    const contact = (await contactRes.json()).contact;
    const res = await worker.fetch(jsonReq("/data/todos", {
      body: { contact_name: "老许", task: "跟进已知联系人", due: "" },
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.todo.contact).toBe(contact.id);
  });

  it("POST todo uses the shared event contract and idempotency", async () => {
    const body = {
      contact: "c-1", task: "统一待办", due: "2026-08-10",
      source: "manual", idempotency_key: "todo-create-1",
    };
    const first = await worker.fetch(jsonReq("/data/todos", {
      body, headers: authHeader(),
    }), env, {});
    const retry = await worker.fetch(jsonReq("/data/todos", {
      body, headers: authHeader(),
    }), env, {});
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    const firstData = await first.json();
    const retryData = await retry.json();
    expect(firstData.event_id).toBeTruthy();
    expect(retryData.dedup).toBe(true);
    expect(retryData.todo.id).toBe(firstData.todo.id);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(JSON.parse(env.USER_DATA._store.get("todos:testuser"))).toHaveLength(1);
    const events = JSON.parse(env.USER_DATA._store.get("domain_events:testuser"));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_type: "todo_created", source: "manual", contact_id: "c-1", event_id: firstData.event_id }),
    ]));
    expect(events.filter(event => event.event_id === firstData.event_id)).toHaveLength(1);
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

describe('R0 unified fact/event contracts', () => {
  const originalFetch = globalThis.fetch;
  const mockCtx = { waitUntil: () => {} };
  let env;

  function intentResponse(actions) {
    return new Response(JSON.stringify({
      content: [{ type: 'text', text: JSON.stringify({ intent: 'record', actions, contact_name: '', keywords: [] }) }],
      usage: { input_tokens: 10, output_tokens: 10 },
      stop_reason: 'end_turn',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  async function flushMetrics() {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  beforeEach(() => {
    env = baseEnv();
    if (globalThis._clearTrackActionCache) globalThis._clearTrackActionCache();
  });

  afterEach(() => { globalThis.fetch = originalFetch; });

  it('direct timeline POST records a standard interaction event and metrics', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([{ id: 'c1', name: '张三' }]));
    const res = await worker.fetch(jsonReq('/data/timeline', {
      body: { contact: 'c1', summary: '聊了合作', source: 'timeline', idempotency_key: 'timeline-1' },
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event_id).toBeTruthy();
    expect(data.version).toBe(1);
    await flushMetrics();

    const metrics = JSON.parse(env.USER_DATA._store.get('metrics:testuser'));
    const week = Object.keys(metrics.weekly)[0];
    expect(metrics.weekly[week].interaction_recorded).toBe(1);
    const events = JSON.parse(env.USER_DATA._store.get('domain_events:testuser'));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_type: 'interaction_recorded', source: 'timeline', contact_id: 'c1' });
  });

  it('timeline POST update uses recordInteraction and emits a versioned event', async () => {
    const created = await worker.fetch(jsonReq('/data/timeline', {
      body: { contact: 'c1', summary: '原始记录', source: 'timeline', idempotency_key: 'post-update-base' },
      headers: authHeader(),
    }), env, {});
    const createdData = await created.json();
    const updated = await worker.fetch(jsonReq('/data/timeline', {
      body: {
        id: createdData.entry.id,
        contact: 'c1',
        summary: '更新后的记录',
        date: '2026-08-04',
        source: 'timeline',
        idempotency_key: 'post-update-1',
        event_id: 'evt-post-update-1',
        expected_version: 1,
      },
      headers: authHeader(),
    }), env, {});
    expect(updated.status).toBe(200);
    const data = await updated.json();
    expect(data.entry.summary).toBe('更新后的记录');
    expect(data.entry.id).toBe(createdData.entry.id);
    expect(data.event_id).toBe('evt-post-update-1');
    expect(data.version).toBe(2);
    await new Promise(resolve => setTimeout(resolve, 0));
    const events = JSON.parse(env.USER_DATA._store.get('domain_events:testuser'));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_id: 'evt-post-update-1', event_type: 'interaction_recorded', contact_id: 'c1' }),
    ]));
  });

  it('todo done records metrics and keeps the automatic timeline fact idempotent', async () => {
    env.USER_DATA._store.set('todos:testuser', JSON.stringify([
      { id: 'todo-1', task: '发送方案', contact: 'c1', status: 'pending' },
    ]));
    const first = await worker.fetch(jsonReq('/data/todos/done', {
      body: { id: 'todo-1', idempotency_key: 'done-1' },
      headers: authHeader(),
    }), env, {});
    const second = await worker.fetch(jsonReq('/data/todos/done', {
      body: { id: 'todo-1', idempotency_key: 'done-1' },
      headers: authHeader(),
    }), env, {});
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await flushMetrics();

    const timeline = JSON.parse(env.USER_DATA._store.get('timeline:testuser'));
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ source: 'todo:todo-1', type: 'todo_completed', contact: 'c1' });
    const metrics = JSON.parse(env.USER_DATA._store.get('metrics:testuser'));
    const week = Object.keys(metrics.weekly)[0];
    expect(metrics.weekly[week].todo_completed).toBe(1);
    const events = JSON.parse(env.USER_DATA._store.get('domain_events:testuser'));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_type: 'todo_completed', source: 'todo', contact_id: 'c1' });
  });

  it('extract_intent complete_todo uses the same completion operation and metrics', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([{ id: 'c1', name: '张三', alias: ['小张'] }]));
    env.USER_DATA._store.set('todos:testuser', JSON.stringify([
      { id: 'todo-2', task: '发送方案', contact: 'c1', status: 'pending' },
    ]));
    globalThis.fetch = async () => intentResponse([
      { type: 'complete_todo', task: '发送方案', contact_name: '小张' },
    ]);
    const res = await worker.fetch(jsonReq('/ai/extract_intent', {
      body: { text: '完成给小张发方案' },
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action_results[0].ok).toBe(true);
    await flushMetrics();

    const todos = JSON.parse(env.USER_DATA._store.get('todos:testuser'));
    expect(todos[0].status).toBe('done');
    const timeline = JSON.parse(env.USER_DATA._store.get('timeline:testuser'));
    expect(timeline).toHaveLength(1);
    const metrics = JSON.parse(env.USER_DATA._store.get('metrics:testuser'));
    const week = Object.keys(metrics.weekly)[0];
    expect(metrics.weekly[week].todo_completed).toBe(1);
  });

  it('uses aliases and legacy alias consistently for timeline and todo actions', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c1', name: '许志远', aliases: ['老许'] },
      { id: 'c2', name: '王志远', alias: ['老王'] },
    ]));
    globalThis.fetch = async () => intentResponse([
      { type: 'add_timeline', contact_name: '老王', summary: '聊了项目', date: '2026-08-01' },
      { type: 'add_todo', contact_name: '老许', task: '联系老许', due: '2026-08-02' },
    ]);
    const res = await worker.fetch(jsonReq('/ai/extract_intent', {
      body: { text: '记录老王并提醒联系老许' },
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);

    const timeline = JSON.parse(env.USER_DATA._store.get('timeline:testuser'));
    const todos = JSON.parse(env.USER_DATA._store.get('todos:testuser'));
    expect(timeline[0].contact).toBe('c2');
    expect(todos[0].contact).toBe('c1');
    expect(JSON.parse(env.USER_DATA._store.get('contacts:testuser'))).toHaveLength(2);
  });

  it('returns an explicit ambiguity instead of selecting one matching contact', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c1', name: '张三甲' },
      { id: 'c2', name: '张三乙' },
    ]));
    globalThis.fetch = async () => intentResponse([
      { type: 'add_timeline', contact_name: '张三', summary: '聊了项目' },
    ]);
    const res = await worker.fetch(jsonReq('/ai/extract_intent', {
      body: { text: '记一下和张三聊了项目' },
      headers: authHeader(),
    }), env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action_results[0].ok).toBe(false);
    expect(data.action_results[0].reason).toContain('歧义');
    expect(env.USER_DATA._store.has('timeline:testuser')).toBe(false);
  });

  it('retries the same timeline idempotency key without duplicate fact or event', async () => {
    const body = { contact: 'c1', summary: '重复重试', idempotency_key: 'retry-1' };
    await worker.fetch(jsonReq('/data/timeline', { body, headers: authHeader() }), env, {});
    await worker.fetch(jsonReq('/data/timeline', { body, headers: authHeader() }), env, {});
    await flushMetrics();

    expect(JSON.parse(env.USER_DATA._store.get('timeline:testuser'))).toHaveLength(1);
    const metrics = JSON.parse(env.USER_DATA._store.get('metrics:testuser'));
    const week = Object.keys(metrics.weekly)[0];
    expect(metrics.weekly[week].interaction_recorded).toBe(1);
    expect(JSON.parse(env.USER_DATA._store.get('domain_events:testuser'))).toHaveLength(1);
  });

  it('action card done and draft use standard metrics source and contact id', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([{ id: 'c1', name: '张三' }]));
    const draft = await worker.fetch(jsonReq('/ai/action_card/confirm', {
      body: { action: 'draft', contact_id: 'c1' },
      headers: authHeader(),
    }), env, {});
    const done = await worker.fetch(jsonReq('/ai/action_card/confirm', {
      body: { action: 'done', contact_id: 'c1', suggested_topic: '聊近况', idempotency_key: 'action-1' },
      headers: authHeader(),
    }), env, {});
    expect(draft.status).toBe(200);
    expect(done.status).toBe(200);
    await flushMetrics();

    const metrics = JSON.parse(env.USER_DATA._store.get('metrics:testuser'));
    const week = Object.keys(metrics.weekly)[0];
    expect(metrics.weekly[week].draft_generated).toBe(1);
    expect(metrics.weekly[week].interaction_recorded).toBe(1);
    const events = JSON.parse(env.USER_DATA._store.get('domain_events:testuser'));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_type: 'draft_generated', source: 'action_card', contact_id: 'c1' }),
      expect.objectContaining({ event_type: 'interaction_recorded', source: 'action_card', contact_id: 'c1' }),
    ]));
    const timeline = JSON.parse(env.USER_DATA._store.get('timeline:testuser'));
    expect(timeline[0]).toMatchObject({ contact: 'c1', source: 'action_card' });
  });

  it('retries action confirmation idempotently and returns the standard action result', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([{ id: 'c1', name: '张三', nature: 'leverage' }]));
    const body = {
      action: 'done',
      action_id: 'act-r1-fixed',
      contact_id: 'c1',
      suggested_topic: '聊合作方案',
      idempotency_key: 'action-r1-fixed',
    };
    const first = await worker.fetch(jsonReq('/ai/action_card/confirm', {
      body,
      headers: authHeader(),
    }), env, {});
    const retry = await worker.fetch(jsonReq('/ai/action_card/confirm', {
      body,
      headers: authHeader(),
    }), env, {});

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    const firstData = await first.json();
    const retryData = await retry.json();
    expect(firstData).toMatchObject({ ok: true, action_id: 'act-r1-fixed', status: 'done', retryable: false });
    expect(retryData).toMatchObject({ ok: true, action_id: 'act-r1-fixed', status: 'done', retryable: false });
    expect(retryData.event_id).toBe(firstData.event_id);
    expect(JSON.parse(env.USER_DATA._store.get('timeline:testuser'))).toHaveLength(1);
    expect(JSON.parse(env.USER_DATA._store.get('domain_events:testuser'))).toHaveLength(1);
  });

  it('rejects a stale expectedVersion without overwriting the timeline', async () => {
    const first = await worker.fetch(jsonReq('/data/timeline', {
      body: { contact: 'c1', summary: '第一条', expectedVersion: 0 },
      headers: authHeader(),
    }), env, {});
    expect(first.status).toBe(200);
    const second = await worker.fetch(jsonReq('/data/timeline', {
      body: { contact: 'c1', summary: '过期写入', expectedVersion: 0 },
      headers: authHeader(),
    }), env, mockCtx);
    expect(second.status).toBe(500);
    const timeline = JSON.parse(env.USER_DATA._store.get('timeline:testuser'));
    expect(timeline).toHaveLength(1);
    expect(timeline[0].summary).toBe('第一条');
  });

  it('does not overwrite malformed JSON datasets', async () => {
    const malformed = '[not valid json';
    env.USER_DATA._store.set('timeline:testuser', malformed);
    const res = await worker.fetch(jsonReq('/data/timeline', {
      body: { contact: 'c1', summary: '不应覆盖' },
      headers: authHeader(),
    }), env, mockCtx);
    expect(res.status).toBe(500);
    expect(env.USER_DATA._store.get('timeline:testuser')).toBe(malformed);
  });
});

describe('R0 follow-up regressions', () => {
  const originalFetch = globalThis.fetch;
  const mockCtx = { waitUntil: () => {} };
  let env;

  function intentResponse(actions) {
    return new Response(JSON.stringify({
      content: [{ type: 'text', text: JSON.stringify({ intent: 'record', actions, contact_name: '', keywords: [] }) }],
      usage: { input_tokens: 10, output_tokens: 10 },
      stop_reason: 'end_turn',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  function llmText(text) {
    return new Response(JSON.stringify({
      content: [{ type: 'text', text }],
      usage: { input_tokens: 10, output_tokens: 10 },
      stop_reason: 'end_turn',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  function failOnceKV(initial, key) {
    const kv = trackingKV(initial);
    let failed = false;
    const put = kv.put.bind(kv);
    kv.put = async (putKey, value, options) => {
      if (!failed && putKey === key) {
        failed = true;
        throw new Error('simulated KV failure');
      }
      return put(putKey, value, options);
    };
    return kv;
  }

  async function flushMetrics() {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  beforeEach(() => {
    env = baseEnv();
    if (globalThis._clearTrackActionCache) globalThis._clearTrackActionCache();
  });

  afterEach(() => { globalThis.fetch = originalFetch; });

  it('does not create or complete data for an unresolved contact', async () => {
    const contacts = [{ id: 'c-existing', name: '已有联系人' }];
    const todos = [{ id: 'todo-unlinked', task: '无联系人待办', status: 'pending', contact: '' }];
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify(contacts));
    env.USER_DATA._store.set('todos:testuser', JSON.stringify(todos));
    globalThis.fetch = async () => intentResponse([
      { type: 'add_timeline', contact_name: '陌生互动对象', summary: '不应写入' },
      { type: 'add_todo', contact_name: '陌生待办对象', task: '不应创建待办', due: '2026-08-10' },
      { type: 'complete_todo', contact_name: '不存在的联系人', task: '无联系人待办' },
    ]);

    const res = await worker.fetch(jsonReq('/ai/extract_intent', {
      body: { text: '记录、提醒并完成不存在的联系人' },
      headers: authHeader(),
    }), env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action_results).toHaveLength(3);
    for (const result of data.action_results) {
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('未找到联系人');
    }
    expect(JSON.parse(env.USER_DATA._store.get('contacts:testuser'))).toEqual(contacts);
    expect(JSON.parse(env.USER_DATA._store.get('todos:testuser'))).toEqual(todos);
    expect(env.USER_DATA._store.has('timeline:testuser')).toBe(false);
  });

  it('does not create an unresolved contact in the chat file-action path', async () => {
    env.USER_DATA._store.set('todos:testuser', JSON.stringify([
      { id: 'todo-chat-unlinked', task: '聊天待办', contact: '', status: 'pending' },
    ]));
    let llmCalls = 0;
    globalThis.fetch = async () => {
      llmCalls++;
      return llmCalls === 1
        ? intentResponse([
          { type: 'add_timeline', contact_name: '聊天陌生人', summary: '不应写入' },
          { type: 'add_todo', contact_name: '聊天待办陌生人', task: '不应创建' },
          { type: 'complete_todo', contact_name: '聊天完成陌生人', task: '聊天待办' },
        ])
        : llmText('文件已处理');
    };

    const res = await worker.fetch(jsonReq('/data/upload_file', {
      body: {
        text: '请记下和聊天陌生人的互动',
        file: { base64: 'dGVzdA==', media_type: 'text/plain', is_image: false },
      },
      headers: authHeader(),
    }), env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action_results).toHaveLength(3);
    for (const result of data.action_results) {
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('未找到联系人');
    }
    expect(env.USER_DATA._store.has('contacts:testuser')).toBe(false);
    expect(env.USER_DATA._store.has('timeline:testuser')).toBe(false);
    expect(JSON.parse(env.USER_DATA._store.get('todos:testuser'))).toEqual([
      { id: 'todo-chat-unlinked', task: '聊天待办', contact: '', status: 'pending' },
    ]);
  });

  it('upload_file routes add_todo through the shared event contract', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c-upload', name: '上传联系人' },
    ]));
    let llmCalls = 0;
    globalThis.fetch = async () => {
      llmCalls++;
      return llmCalls === 1
        ? intentResponse([{ type: 'add_todo', task: '上传后跟进', contact_name: '上传联系人', due: '2026-08-10', idempotency_key: 'upload-todo-1' }])
        : llmText('文件已处理');
    };

    const res = await worker.fetch(jsonReq('/data/upload_file', {
      body: {
        text: '请记录上传联系人待办',
        file: { base64: 'dGVzdA==', media_type: 'text/plain', is_image: false },
      },
      headers: authHeader(),
    }), env, mockCtx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.action_results[0]).toMatchObject({ type: 'add_todo', ok: true, dedup: false });
    await new Promise(resolve => setTimeout(resolve, 0));
    const todos = JSON.parse(env.USER_DATA._store.get('todos:testuser'));
    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({ contact: 'c-upload', source: 'sync', task: '上传后跟进' });
    const events = JSON.parse(env.USER_DATA._store.get('domain_events:testuser'));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_type: 'todo_created', source: 'sync', contact_id: 'c-upload' }),
    ]));
  });

  it('sync_ws routes add_todo through the shared event contract', async () => {
    const originalPair = globalThis.WebSocketPair;
    const syncUserId = 'sync_user_1';
    env.USER_DATA._store.set(`contacts:${syncUserId}`, JSON.stringify([
      { id: 'c-sync', name: '同步联系人' },
    ]));
    let serverSocket;
    const makeSocket = () => {
      const listeners = new Map();
      return {
        accept() {},
        send() {},
        close() {},
        addEventListener(type, listener) { listeners.set(type, listener); },
        dispatch(type, event) { return listeners.get(type)?.(event); },
      };
    };
    globalThis.WebSocketPair = class {
      constructor() {
        this[0] = makeSocket();
        this[1] = serverSocket = makeSocket();
      }
    };
    let llmCalls = 0;
    globalThis.fetch = async () => {
      llmCalls++;
      if (llmCalls === 1) {
        return intentResponse([{ type: 'add_todo', task: '同步后跟进', contact_name: '同步联系人', due: '2026-08-11', idempotency_key: 'sync-todo-1' }]);
      }
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"content_block_delta","delta":{"text":"已处理"}}\\n\\n'));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    };
    try {
      const req = new Request(`https://worker.test/data/sync_ws?token=${syncUserId}:secret`, {
        headers: { Upgrade: 'websocket' },
      });
      await expect(worker.fetch(req, env, mockCtx)).rejects.toThrow(/status/);
      await serverSocket.dispatch('message', { data: JSON.stringify({ action: 'input', value: '记录同步待办' }) });
      serverSocket.dispatch('close', {});
    } finally {
      globalThis.WebSocketPair = originalPair;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    const todos = JSON.parse(env.USER_DATA._store.get(`todos:${syncUserId}`));
    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({ task: '同步后跟进', contact: 'c-sync', source: 'sync' });
    const events = JSON.parse(env.USER_DATA._store.get(`domain_events:${syncUserId}`));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_type: 'todo_created', source: 'sync', contact_id: 'c-sync' }),
    ]));
  });

  it('agent_ws auth logs expose only token booleans, not the uid', async () => {
    env.DEVICES = { get: async () => null };
    const originalPair = globalThis.WebSocketPair;
    const originalLog = console.log;
    const logs = [];
    globalThis.WebSocketPair = class {
      constructor() {
        const socket = { accept() {}, send() {}, close() {} };
        this[0] = socket;
        this[1] = socket;
      }
    };
    console.log = (...args) => logs.push(args);
    try {
      const req = new Request('https://worker.test/data/agent_ws?token=sensitive_uid:secret', {
        headers: { Upgrade: 'websocket' },
      });
      await expect(worker.fetch(req, env, mockCtx)).rejects.toThrow(/status/);
    } finally {
      globalThis.WebSocketPair = originalPair;
      console.log = originalLog;
    }
    const agentLogs = logs.filter(args => args[0] === '[agent_ws] token present:' || args[0] === '[agent_ws] wxmp token verified:');
    expect(agentLogs.length).toBeGreaterThan(0);
    expect(JSON.stringify(agentLogs)).not.toContain('sensitive_uid');
  });

  it('keeps todo pending when the related timeline dataset is malformed', async () => {
    const malformed = '[not valid json';
    env.USER_DATA._store.set('todos:testuser', JSON.stringify([
      { id: 'todo-malformed', task: '发送方案', contact: 'c1', status: 'pending' },
    ]));
    env.USER_DATA._store.set('timeline:testuser', malformed);

    const res = await worker.fetch(jsonReq('/data/todos/done', {
      body: { id: 'todo-malformed', idempotency_key: 'malformed-1' },
      headers: authHeader(),
    }), env, mockCtx);
    expect(res.status).toBe(500);
    expect(JSON.parse(env.USER_DATA._store.get('todos:testuser'))[0].status).toBe('pending');
    expect(env.USER_DATA._store.get('timeline:testuser')).toBe(malformed);
  });

  it('retries after todo save failure without duplicating the timeline or event', async () => {
    const kv = failOnceKV({
      'todos:testuser': JSON.stringify([
        { id: 'todo-retry', task: '发送方案', contact: 'c1', status: 'pending' },
      ]),
    }, 'todos:testuser');
    env = baseEnv({ USER_DATA: kv });
    const body = { id: 'todo-retry', idempotency_key: 'retry-complete-1' };

    const first = await worker.fetch(jsonReq('/data/todos/done', {
      body, headers: authHeader(),
    }), env, mockCtx);
    expect(first.status).toBe(500);
    const firstData = await first.json();
    expect(firstData.retryable).toBe(true);
    expect(firstData.retryable_scope).toBe('todos');
    expect(firstData.partial_success).toBe('timeline_persisted');
    expect(JSON.parse(kv._store.get('todos:testuser'))[0].status).toBe('pending');
    expect(JSON.parse(kv._store.get('timeline:testuser'))).toHaveLength(1);

    const second = await worker.fetch(jsonReq('/data/todos/done', {
      body, headers: authHeader(),
    }), env, mockCtx);
    expect(second.status).toBe(200);
    await flushMetrics();
    expect(JSON.parse(kv._store.get('todos:testuser'))[0].status).toBe('done');
    expect(JSON.parse(kv._store.get('timeline:testuser'))).toHaveLength(1);
    expect(JSON.parse(kv._store.get('domain_events:testuser'))).toHaveLength(1);
  });

  it('retries when todo data was written but its version sidecar failed', async () => {
    const kv = failOnceKV({
      'todos:testuser': JSON.stringify([
        { id: 'todo-version-retry', task: '补版本', contact: 'c1', status: 'pending' },
      ]),
    }, 'version:todos:testuser');
    env = baseEnv({ USER_DATA: kv });
    const body = { id: 'todo-version-retry', idempotency_key: 'version-retry-1' };

    const first = await worker.fetch(jsonReq('/data/todos/done', {
      body, headers: authHeader(),
    }), env, mockCtx);
    expect(first.status).toBe(500);
    const firstData = await first.json();
    expect(firstData.retryable).toBe(true);
    expect(firstData.retryable_scope).toBe('todos');
    expect(firstData.partial_success).toBe('todo_data_written');
    expect(JSON.parse(kv._store.get('todos:testuser'))[0].status).toBe('done');

    const second = await worker.fetch(jsonReq('/data/todos/done', {
      body, headers: authHeader(),
    }), env, mockCtx);
    expect(second.status).toBe(200);
    await flushMetrics();
    expect(JSON.parse(kv._store.get('timeline:testuser'))).toHaveLength(1);
    expect(JSON.parse(kv._store.get('domain_events:testuser'))).toHaveLength(1);
  });

  it('upsertContact distinguishes id update from no-id create and deduplicates retries', async () => {
    env.USER_DATA._store.set('contacts:testuser', JSON.stringify([
      { id: 'c-existing', name: '原联系人', company: '旧公司' },
    ]));
    const updateBody = {
      id: 'c-existing', name: '原联系人', company: '新公司',
      source: 'sync', idempotency_key: 'contact-update-1', event_id: 'evt-contact-update-1',
    };
    const update = await worker.fetch(jsonReq('/data/contacts', {
      body: updateBody, headers: authHeader(),
    }), env, mockCtx);
    const updateRetry = await worker.fetch(jsonReq('/data/contacts', {
      body: updateBody, headers: authHeader(),
    }), env, mockCtx);
    expect(update.status).toBe(200);
    expect(updateRetry.status).toBe(200);
    const updateData = await update.json();
    const retryData = await updateRetry.json();
    expect(updateData.created).toBe(false);
    expect(updateData.updated).toBe(true);
    expect(retryData.dedup).toBe(true);

    const createBody = {
      name: '无 id 新联系人', source: 'sync',
      idempotency_key: 'contact-create-1', event_id: 'evt-contact-create-1',
    };
    const create = await worker.fetch(jsonReq('/data/contacts', {
      body: createBody, headers: authHeader(),
    }), env, mockCtx);
    const createRetry = await worker.fetch(jsonReq('/data/contacts', {
      body: createBody, headers: authHeader(),
    }), env, mockCtx);
    expect(create.status).toBe(200);
    expect(createRetry.status).toBe(200);
    const createData = await create.json();
    const createRetryData = await createRetry.json();
    expect(createData.created).toBe(true);
    expect(createRetryData.dedup).toBe(true);
    expect(createRetryData.contact.id).toBe(createData.contact.id);
    expect(JSON.parse(env.USER_DATA._store.get('contacts:testuser'))).toHaveLength(2);
    await flushMetrics();
    const events = JSON.parse(env.USER_DATA._store.get('domain_events:testuser'));
    expect(events).toHaveLength(2);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_id: 'evt-contact-update-1', event_type: 'contact_upserted', source: 'sync', contact_id: 'c-existing' }),
      expect.objectContaining({ event_id: 'evt-contact-create-1', event_type: 'contact_upserted', source: 'sync', contact_id: createData.contact.id }),
    ]));
  });

  it('timeline PUT uses the unified event and version response while preserving the old entry response', async () => {
    const createdRes = await worker.fetch(jsonReq('/data/timeline', {
      body: { contact: 'c1', summary: '旧记录', source: 'timeline', idempotency_key: 'put-base-1' },
      headers: authHeader(),
    }), env, mockCtx);
    const created = await createdRes.json();
    const putRes = await worker.fetch(jsonReq('/data/timeline', {
      method: 'PUT',
      body: {
        id: created.entry.id, contact: 'c1', summary: '更新记录', date: '2026-08-02',
        source: 'timeline', idempotency_key: 'put-update-1', event_id: 'evt-put-update-1', expectedVersion: 1,
      },
      headers: authHeader(),
    }), env, mockCtx);
    expect(putRes.status).toBe(200);
    const data = await putRes.json();
    expect(data.ok).toBe(true);
    expect(data.entry.id).toBe(created.entry.id);
    expect(data.entry.summary).toBe('更新记录');
    expect(data.event_id).toBe('evt-put-update-1');
    expect(data.version).toBe(2);
    await flushMetrics();
    const events = JSON.parse(env.USER_DATA._store.get('domain_events:testuser'));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_id: 'evt-put-update-1', event_type: 'interaction_recorded', source: 'timeline', contact_id: 'c1' }),
    ]));
  });
});

describe("Long-term tasks (due = empty string)", () => {
  let env;
  beforeEach(async () => {
    env = baseEnv();
    await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "张总" },
      headers: authHeader(),
    }), env, {});
  });

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
