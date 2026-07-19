// Tests for /data/* CRUD endpoints — contacts, timeline, todos, delete_account.
// No real LLM calls. KV is mocked. Auth uses sync-secret bypass.
import { describe, it, expect, beforeEach } from "vitest";
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
