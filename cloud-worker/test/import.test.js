// Tests for cloud data endpoints — /ai/import (CSV direct parse) and /data/push.
// No real LLM calls: CSV import parses locally via _parseCSV. KV is mocked.
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, authHeader, jsonReq } from "./helpers.js";

function toBase64(text) {
  return Buffer.from(text, "utf-8").toString("base64");
}

describe("/ai/import: CSV direct parse", () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
  });

  it("imports contacts from a CSV with Chinese headers and rows", async () => {
    const csv = "姓名,公司,职位,电话,邮箱\n" +
      "张三,腾讯,产品经理,13800138000,zhangsan@qq.com\n" +
      "李四,阿里巴巴,技术专家,13900139000,lisi@aliyun.com\n";
    const req = jsonReq("/ai/import", {
      body: { base64: toBase64(csv), filename: "contacts.csv" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.imported).toBe(2);
    expect(data.skipped).toBe(0);
    expect(data.total).toBe(2);

    // Contacts persisted to KV
    const stored = JSON.parse(env.USER_DATA._store.get("contacts:testuser"));
    expect(stored).toHaveLength(2);
    const names = stored.map((c) => c.name).sort();
    expect(names).toEqual(["张三", "李四"]);
    // Schema sanity: imported contacts carry the full field set
    expect(stored[0].company).toBe("腾讯");
    expect(stored[0].title).toBe("产品经理");
    expect(stored[0].phone).toBe("13800138000");
    expect(stored[0].email).toBe("zhangsan@qq.com");
  });

  it("dedups against existing contacts by name", async () => {
    // Seed an existing contact named 张三
    env.USER_DATA._store.set(
      "contacts:testuser",
      JSON.stringify([{ id: "c-1", name: "张三", company: "旧公司" }])
    );
    const csv = "姓名,公司\n张三,腾讯\n李四,阿里巴巴\n";
    const req = jsonReq("/ai/import", {
      body: { base64: toBase64(csv), filename: "contacts.csv" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    const data = await res.json();
    expect(data.imported).toBe(1);   // only 李四
    expect(data.skipped).toBe(1);    // 张三 dup
    const stored = JSON.parse(env.USER_DATA._store.get("contacts:testuser"));
    expect(stored).toHaveLength(2);
    // Existing 张三 kept untouched (company not overwritten)
    const zhang = stored.find((c) => c.name === "张三");
    expect(zhang.company).toBe("旧公司");
  });

  it("rejects empty base64 with 400", async () => {
    const req = jsonReq("/ai/import", {
      body: { base64: "", filename: "empty.csv" },
      headers: authHeader(),
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });

  it("requires auth (401 without token)", async () => {
    const req = jsonReq("/ai/import", {
      body: { base64: toBase64("姓名\n张三\n"), filename: "x.csv" },
    });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

describe("/data/push: contacts sync", () => {
  let env;
  beforeEach(() => {
    env = baseEnv();
  });

  it("stores a contacts array and returns the count", async () => {
    const contacts = [
      { id: "c-1", name: "张三", company: "腾讯" },
      { id: "c-2", name: "李四", company: "阿里巴巴" },
    ];
    const req = jsonReq("/data/push", { body: { contacts }, headers: authHeader() });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.count).toBe(2);
    const stored = JSON.parse(env.USER_DATA._store.get("contacts:testuser"));
    expect(stored).toHaveLength(2);
    expect(stored[0].name).toBe("张三");
  });

  it("rejects a payload without a contacts array (400)", async () => {
    const req = jsonReq("/data/push", { body: { todos: [] }, headers: authHeader() });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(400);
  });

  it("requires auth (401 without token)", async () => {
    const req = jsonReq("/data/push", { body: { contacts: [] } });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(401);
  });
});

describe("/data/pull: full dataset pull", () => {
  it("returns contacts/todos/timeline from KV", async () => {
    const env = baseEnv();
    env.USER_DATA._store.set("contacts:testuser", JSON.stringify([{ id: "c-1", name: "张三" }]));
    env.USER_DATA._store.set("todos:testuser", JSON.stringify([{ id: "t-1", task: "跟进" }]));
    env.USER_DATA._store.set("timeline:testuser", JSON.stringify([{ id: "tl-1", summary: "会面" }]));
    const req = jsonReq("/data/pull", { method: "GET", headers: authHeader() });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.contacts).toHaveLength(1);
    expect(data.todos).toHaveLength(1);
    expect(data.timeline).toHaveLength(1);
    expect(data.pulled_at).toBeTruthy();
  });
});
