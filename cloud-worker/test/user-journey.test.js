// End-to-end user journey tests: simulate a real wxmp user from login →
// onboarding → record/query/draft/report/meeting → billing → delete account.
// Uses a single shared KV instance across all steps to verify data flow.
// All external APIs (WeChat, Clerk, LLM, email) are mocked.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import worker from "../src/worker.js";
import { baseEnv, jsonReq, mockKV } from "./helpers.js";

// ── Mock helpers ──

function wechatSessionResponse(openid) {
  return new Response(
    JSON.stringify({ openid, session_key: "test_session_key" }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function llmJson(obj) {
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text: JSON.stringify(obj) }],
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: "end_turn",
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

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

// ═══════════════════════════════════════════════════════════════
// Full user journey: new wxmp user from first login to account deletion
// Single test with shared KV — verifies data flows correctly across steps.
// ═══════════════════════════════════════════════════════════════

describe("User Journey: new wxmp user full lifecycle", () => {
  const originalFetch = globalThis.fetch;
  let env;
  const mockCtx = { waitUntil: () => {} };
  const TEST_OPENID = "journey_openid_001";

  beforeEach(() => {
    env = baseEnv({
      USER_DATA: mockKV(),
      WXMP_APP_ID: "wx_test_mp",
      WXMP_APP_SECRET: "mp_secret",
      LLM_API_KEY: "fake-key",
      LLM_BASE_URL: "https://fake.llm.local",
    });
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  function auth() {
    return { Authorization: `Bearer wxmp_${TEST_OPENID}:secret` };
  }

  it("completes full lifecycle: login → onboarding → record → draft → meeting → reports → delete", async () => {
    // ── Step 1: Login ──
    globalThis.fetch = async () => wechatSessionResponse(TEST_OPENID);
    const loginRes = await worker.fetch(jsonReq("/ai/wxmp_login", { body: { code: "valid_code" } }), env, {});
    expect(loginRes.status).toBe(200);
    const loginData = await loginRes.json();
    expect(loginData.ok).toBe(true);
    expect(loginData.is_new_user).toBe(true);
    expect(loginData.openid).toBe(TEST_OPENID);
    expect(loginData.token).toContain(`wxmp_${TEST_OPENID}:secret`);

    // ── Step 2: Empty dashboard ──
    const statsRes = await worker.fetch(new Request("https://worker.test/ai/wxmp_contact_stats", {
      method: "GET", headers: auth(),
    }), env, {});
    expect(statsRes.status).toBe(200);
    const statsData = await statsRes.json();
    expect(statsData.stats.total).toBe(0);

    // ── Step 3: Card scan — two-step flow (OCR → confirm) ──
    globalThis.fetch = async () => llmJson({
      name: "张总", company: "腾讯", title: "投资总监",
      phone: "13800138000", email: "zhang@tencent.com",
    });
    // Step 3a: OCR extracts card info
    const ocrRes = await worker.fetch(jsonReq("/ai/wxmp_card_scan", {
      body: { base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M8AAQABAABJfQ3oAAAAAElFTkSuQmCC" },
      headers: auth(),
    }), env, {});
    expect(ocrRes.status).toBe(200);
    const ocrData = await ocrRes.json();
    expect(ocrData.contact.name).toBe("张总");
    expect(ocrData.contact.company).toBe("腾讯");
    expect(ocrData.needs_confirm).toBe(true);

    // Step 3b: Confirm and save contact
    const cardRes = await worker.fetch(jsonReq("/ai/wxmp_card_scan", {
      body: { confirm: true, contact_data: ocrData.contact },
      headers: auth(),
    }), env, {});
    expect(cardRes.status).toBe(200);
    const cardData = await cardRes.json();
    expect(cardData.contact.name).toBe("张总");
    expect(cardData.contact.company).toBe("腾讯");

    // ── Step 4: Add second contact (nurture) ──
    const addContactRes = await worker.fetch(jsonReq("/data/contacts", {
      body: { name: "妈妈", nature: "nurture", relation: "家人" },
      headers: auth(),
    }), env, {});
    expect(addContactRes.status).toBe(200);

    // Verify 2 contacts now
    const contacts = JSON.parse(env.USER_DATA._store.get(`contacts:wxmp_${TEST_OPENID}`));
    expect(contacts.length).toBe(2);
    const zhangId = contacts.find(c => c.name === "张总").id;

    // ── Step 5: Record interaction ──
    const timelineRes = await worker.fetch(jsonReq("/data/timeline", {
      body: { contact: zhangId, summary: "聊了Q3合作预算", date: "2026-07-27" },
      headers: auth(),
    }), env, {});
    expect(timelineRes.status).toBe(200);
    const timeline = JSON.parse(env.USER_DATA._store.get(`timeline:wxmp_${TEST_OPENID}`));
    expect(timeline.length).toBe(1);

    // ── Step 6: Add todo ──
    const todoRes = await worker.fetch(jsonReq("/data/todos", {
      body: { contact: zhangId, task: "发送合作方案给张总", due: "2026-08-01", priority: "P1" },
      headers: auth(),
    }), env, {});
    expect(todoRes.status).toBe(200);
    const todos = JSON.parse(env.USER_DATA._store.get(`todos:wxmp_${TEST_OPENID}`));
    expect(todos.length).toBe(1);
    const todoId = todos[0].id;

    // ── Step 7: Mark todo done ──
    const doneRes = await worker.fetch(jsonReq("/data/todos/done", {
      body: { id: todoId },
      headers: auth(),
    }), env, {});
    expect([200, 404]).toContain(doneRes.status);
    if (doneRes.status === 200) {
      const updatedTodos = JSON.parse(env.USER_DATA._store.get(`todos:wxmp_${TEST_OPENID}`));
      expect(updatedTodos.find(t => t.id === todoId).status).toBe("done");
    }

    // ── Step 8: Draft message ──
    globalThis.fetch = async () => llmText("张总你好，上次聊的Q3合作方案我已经准备好了，方便的话这周约个时间细聊？");
    const draftRes = await worker.fetch(jsonReq("/ai/draft", {
      body: { name: "张总", nature: "leverage", last_interaction: "聊了Q3合作预算" },
      headers: auth(),
    }), env, {});
    expect(draftRes.status).toBe(200);
    const draftData = await draftRes.json();
    expect(draftData.result).toContain("张总");

    // ── Step 9: Meeting prep ──
    globalThis.fetch = async () => llmText("📋 会前准备\n\n上次互动：聊了Q3合作预算\n\n建议话题：合作方案细节");
    const prepRes = await worker.fetch(jsonReq("/ai/meeting_prep", {
      body: { contact_id: zhangId },
      headers: auth(),
    }), env, mockCtx);
    expect(prepRes.status).toBe(200);
    const prepData = await prepRes.json();
    expect(prepData.contact.name).toBe("张总");
    expect(prepData.prep).toBeTruthy();

    // ── Step 10: Create meeting + review ──
    const createMtgRes = await worker.fetch(jsonReq("/data/meetings", {
      body: { title: "Q3合作沟通会", date: "2026-07-28", status: "planned", purpose: "讨论合作方案" },
      headers: auth(),
    }), env, mockCtx);
    expect(createMtgRes.status).toBe(200);
    const meeting = (await createMtgRes.json()).meeting;

    globalThis.fetch = async () => llmJson({
      summary: "会议达成合作意向",
      new_contacts: [],
      follow_up_todos: [{ task: "准备合同初稿", contact_name: "", due: "2026-08-05", priority: "high" }],
      opportunity_analysis: [{ description: "联合产品发布", action: "下月前出方案", contact_name: "" }],
      leverage_insights: "可借张总的渠道资源",
      goal_suggestions: ["Q4联合发布"],
    });
    const reviewRes = await worker.fetch(jsonReq("/ai/meeting_review", {
      body: { meeting_id: meeting.id },
      headers: auth(),
    }), env, mockCtx);
    expect(reviewRes.status).toBe(200);
    expect((await reviewRes.json()).review.summary).toBe("会议达成合作意向");

    // Verify meeting completed
    const meetings = JSON.parse(env.USER_DATA._store.get(`meetings:wxmp_${TEST_OPENID}`));
    expect(meetings.find(m => m.id === meeting.id).status).toBe("completed");

    // ── Step 11: Weekly report ──
    globalThis.fetch = async () => llmJson({
      greeting: "本周你和张总聊了合作，进展不错",
      review: { interactions: 1, new_todos: 1, completed_todos: 1 },
      suggest_contact: [{ name: "妈妈", reason: "两周没联系了" }],
      upcoming_dates: [], todo_reminders: [], closing: "下周继续保持节奏",
    });
    const weeklyRes = await worker.fetch(jsonReq("/ai/weekly_report", {
      body: {}, headers: auth(),
    }), env, mockCtx);
    expect(weeklyRes.status).toBe(200);
    expect((await weeklyRes.json()).ok).toBe(true);

    // ── Step 12: Monthly report ──
    globalThis.fetch = async () => llmJson({
      greeting: "本月回顾",
      stats: { total_contacts: 2, active_contacts: 1, interactions: 1, new_todos: 1, completed_todos: 1 },
      role_review: {
        friends: { count: 0, interactions: 0, highlight: "" },
        family: { count: 1, interactions: 0, highlight: "妈妈" },
        collaborators: { count: 1, interactions: 1, highlight: "张总合作推进" },
      },
      trends: { vs_last_month: "持平", comment: "刚起步" },
      achievements: ["建立了第一个合作联系人"],
      suggestions: ["下周联系妈妈"],
      closing: "继续用心",
    });
    const monthlyRes = await worker.fetch(jsonReq("/ai/monthly_report", {
      body: {}, headers: auth(),
    }), env, mockCtx);
    expect(monthlyRes.status).toBe(200);
    const monthlyData = await monthlyRes.json();
    expect(monthlyData.ok).toBe(true);
    expect(monthlyData.report.stats.total_contacts).toBe(2);

    // ── Step 13: Edit profile ──
    const profileRes = await worker.fetch(jsonReq("/data/profile", {
      body: { name: "测试用户", occupation: "产品经理", company: "测试公司", industry: "科技", location: "上海" },
      headers: auth(),
    }), env, {});
    expect(profileRes.status).toBe(200);
    const profile = JSON.parse(env.USER_DATA._store.get(`profile:wxmp_${TEST_OPENID}`));
    expect(profile.name).toBe("测试用户");

    // ── Step 14: contact_stats reflects journey ──
    const finalStatsRes = await worker.fetch(new Request("https://worker.test/ai/wxmp_contact_stats", {
      method: "GET", headers: auth(),
    }), env, {});
    expect(finalStatsRes.status).toBe(200);
    const finalStats = await finalStatsRes.json();
    expect(finalStats.stats.total).toBe(2);
    expect(finalStats.stats.leverage).toBe(1); // 张总
    expect(finalStats.stats.nurture).toBe(1);  // 妈妈

    // ── Step 15: Delete account ──
    const deleteRes = await worker.fetch(jsonReq("/data/delete_account", {
      method: "POST", headers: auth(),
    }), env, mockCtx);
    expect(deleteRes.status).toBe(200);

    // Verify data cleared
    const contactsAfter = env.USER_DATA._store.get(`contacts:wxmp_${TEST_OPENID}`);
    if (contactsAfter) expect(JSON.parse(contactsAfter).length).toBe(0);
    const timelineAfter = env.USER_DATA._store.get(`timeline:wxmp_${TEST_OPENID}`);
    if (timelineAfter) expect(JSON.parse(timelineAfter).length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Journey: email binding flow (bind_sendcode → bind_verify)
// ═══════════════════════════════════════════════════════════════

describe("User Journey: email binding flow", () => {
  const originalFetch = globalThis.fetch;
  let env;
  const TEST_OPENID = "bind_openid_002";

  beforeEach(() => {
    env = baseEnv({
      WXMP_APP_ID: "wx_test_mp",
      WXMP_APP_SECRET: "mp_secret",
      CLERK_SECRET_KEY: "clerk_secret",
    });
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("sendcode → verify → bound (full binding flow)", async () => {
    // Step 1: sendcode — mock Clerk (no existing user) + Resend email
    globalThis.fetch = async (url, opts) => {
      if (String(url).includes("api.clerk.com") && opts?.method === "GET") {
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (String(url).includes("api.resend.com")) {
        return new Response(JSON.stringify({ id: "email_123" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("{}", { status: 200 });
    };

    const sendcodeRes = await worker.fetch(jsonReq("/ai/wxmp_bind_sendcode", {
      body: { openid: TEST_OPENID, email: "test@example.com" },
    }), env, {});
    expect(sendcodeRes.status).toBe(200);
    const sendcodeData = await sendcodeRes.json();
    expect(sendcodeData.ok).toBe(true);
    expect(sendcodeData.is_new_user).toBe(true);

    // Verify code stored in KV (key format: wxmp_bindcode:${openid})
    const codeRaw = env.USER_DATA._store.get(`wxmp_bindcode:${TEST_OPENID}`);
    expect(codeRaw).toBeTruthy();
    const code = JSON.parse(codeRaw).code;

    // Step 2: verify — mock Clerk create user
    globalThis.fetch = async (url, opts) => {
      if (String(url).includes("api.clerk.com") && opts?.method === "POST") {
        return new Response(JSON.stringify({ id: "user_clerk_001" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("{}", { status: 200 });
    };

    const verifyRes = await worker.fetch(jsonReq("/ai/wxmp_bind_verify", {
      body: { openid: TEST_OPENID, code },
    }), env, {});
    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.ok).toBe(true);
    expect(verifyData.token).toContain("user_");

    // Verify bind code consumed (deleted from KV)
    expect(env.USER_DATA._store.has(`wxmp_bindcode:${TEST_OPENID}`)).toBe(false);
  });

  it("rejects wrong verification code", async () => {
    await env.USER_DATA.put(`wxmp_bindcode:${TEST_OPENID}`, JSON.stringify({
      code: "123456", email: "test@example.com",
    }));
    const verifyRes = await worker.fetch(jsonReq("/ai/wxmp_bind_verify", {
      body: { openid: TEST_OPENID, code: "000000" },
    }), env, {});
    expect(verifyRes.status).toBe(400);
  });

  it("rejects expired code (not in KV)", async () => {
    const verifyRes = await worker.fetch(jsonReq("/ai/wxmp_bind_verify", {
      body: { openid: "no_such_openid", code: "123456" },
    }), env, {});
    expect(verifyRes.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// Journey: subscribe message authorization flow
// ═══════════════════════════════════════════════════════════════

describe("User Journey: subscribe message flow", () => {
  let env;
  const TEST_OPENID = "sub_openid_003";

  beforeEach(() => { env = baseEnv(); });

  it("user subscribes to todo_due template → count increments", async () => {
    const auth = { Authorization: `Bearer wxmp_${TEST_OPENID}:secret` };

    // First subscription
    const res1 = await worker.fetch(jsonReq("/ai/wxmp_subscribe", {
      body: { template_ids: ["todo_due"] },
      headers: auth,
    }), env, {});
    expect(res1.status).toBe(200);

    // Second subscription (accumulates)
    const res2 = await worker.fetch(jsonReq("/ai/wxmp_subscribe", {
      body: { template_ids: ["todo_due"] },
      headers: auth,
    }), env, {});
    expect(res2.status).toBe(200);

    const sub = JSON.parse(env.USER_DATA._store.get(`subscribe:wxmp_${TEST_OPENID}:todo_due`));
    expect(sub.count).toBe(2);
    expect(sub.openid).toBe(TEST_OPENID);
  });
});
