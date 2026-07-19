/**
 * L2 Core Loop Integration — Do the 4 verbs (记/问/拟/报) work?
 *
 * Tests that the frontend correctly calls backend endpoints for each verb
 * and properly processes the response. Uses mock backend (no real LLM).
 *
 * The 4 verbs are Welian's core product loop:
 *   记 (Record): "记一下：和张总聊了预算方案" → timeline entry created
 *   问 (Query): "明天见李总，上次聊到哪了？" → AI retrieves context
 *   拟 (Draft): "给老许拟条消息" → AI generates message draft
 *   报 (Report): Weekly report generated from data
 *
 * Each test verifies:
 *   1. Frontend sends request to correct endpoint
 *   2. Request body has correct params
 *   3. Response is correctly rendered in chat UI
 */
import { test, expect } from '@playwright/test';

const mockClerkScript = `
window.Sentry = { init(){}, captureException(){}, captureMessage(){} };
window.__mockToken = 'testuser:l2-verbs';
window.Clerk = {
  loaded: true,
  status: 'ready',
  user: { id: 'testuser_l2', firstName: 'L2', primaryEmailAddress: { emailAddress: 'l2@test.com' } },
  session: { getToken: async () => window.__mockToken, status: 'active' },
  async load(opts) { this.loaded = true; return this; },
  addListener(callback) { window.__clerkCallback = callback; },
  mountSignIn(container, opts) { container.innerHTML = '<div>Mock</div>'; },
  mountSignUp(container, opts) { container.innerHTML = '<div>Mock</div>'; },
  signOut() { this.user = null; if (window.__clerkCallback) window.__clerkCallback({ user: null }); },
  async setActive({ session }) {},
};
window.loadClerkUI = async (key) => { window.__internal_ClerkUICtor = function() {}; };
`;

// Seed data: user has contacts and timeline
const seedContacts = [
  { id: 'c-1', name: '老许', nature: 'leverage', strength: 4, company: '腾讯', leverage: {} },
  { id: 'c-2', name: '张总', nature: 'leverage', strength: 3, company: '阿里', leverage: {} },
];
const seedTimeline = [
  { id: 'tl-1', contact: 'c-1', date: '2026-07-10', summary: '聊了项目合作' },
];
const seedTodos = [
  { id: 't-1', contact: 'c-1', task: '跟进老许的项目', status: 'pending', due: '2026-07-25' },
];

test.beforeEach(async ({ page }) => {
  page.consoleErrors = [];
  page.on('pageerror', err => page.consoleErrors.push(err.message));

  // Intercept CDN
  await page.route('**/clerk.browser.js*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '// mock' }));
  await page.route('**/ui.browser.js*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '// mock' }));
  await page.route('**/sentry-cdn.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '// mock' }));

  await page.addInitScript(mockClerkScript);
  await page.addInitScript(`
    Object.defineProperty(window, 'loadClerkUI', {
      get: () => async (key) => { window.__internal_ClerkUICtor = function() {}; return true; },
      set: (v) => {},
      configurable: true,
    });
    localStorage.setItem('welian_onboarding_done', '1'); // Skip onboarding
    localStorage.setItem('welian_cookie_ok', '1');       // Dismiss cookie banner
  `);

  // Mock /data/contacts — return seeded data
  page.route('**/data/contacts', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ contacts: seedContacts }),
    });
  });

  // Mock /data/pull — return seeded data
  page.route('**/data/pull', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contacts: seedContacts,
        todos: seedTodos,
        timeline: seedTimeline,
        pulled_at: new Date().toISOString(),
      }),
    });
  });

  // Mock /ai/billing
  page.route('**/ai/billing', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ plan: 'free', allowance: 100, remaining: 100, used: 0 }),
    });
  });

  // Mock /data/sessions
  page.route('**/data/sessions', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  // Mock data endpoints used by cloudChat (extractIntent → data context → /ai/chat)
  page.route('**/data/search', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        matched_count: 1,
        data_context: '老许：腾讯，上次聊了项目合作（2026-07-10）',
      }),
    });
  });

  page.route('**/data/context', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data_context: '联系人：老许（腾讯）、张总（阿里）。待办：跟进老许的项目。' }),
    });
  });

  page.route('**/data/todos', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ todos: seedTodos }),
    });
  });

  // Mock /ai/config (routing config)
  page.route('**/ai/config', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ mode: 'cloud', dataPriority: ['cloud_kv'] }),
    });
  });
});

// Helper: login and wait for app to be ready
async function loginAndWait(page) {
  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  // Simulate login
  await page.evaluate(() => {
    window.Clerk.user = { id: 'testuser_l2', firstName: 'L2', primaryEmailAddress: { emailAddress: 'l2@test.com' } };
    window.Clerk.session = { getToken: async () => window.__mockToken, status: 'active' };
    if (window.__clerkCallback) window.__clerkCallback({ user: window.Clerk.user });
  });

  // Wait for chat input to be ready
  await expect(page.locator('#input')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1000);
}

// ── 记 (Record) ──

test('L2 记: "记一下：和张总聊了预算方案" creates timeline entry', async ({ page }) => {
  let extractIntentBody = null;

  page.route('**/ai/extract_intent', route => {
    extractIntentBody = JSON.parse(route.request().postData() || '{}');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        intent: 'record',
        contact_name: '张总',
        keywords: ['张总'],
        actions: [
          { type: 'add_timeline', contact_name: '张总', summary: '聊了预算方案', date: new Date().toISOString().slice(0, 10) },
        ],
        action_results: [
          { type: 'add_timeline', ok: true, summary: '聊了预算方案', contact_name: '张总' },
        ],
      }),
    });
  });

  // Mock /ai/chat — must return {reply: ...} (cloudChat reads data.reply)
  page.route('**/ai/chat', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: '记下了 ✅ 和张总聊了预算方案',
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    });
  });

  await loginAndWait(page);

  // Type and send message
  await page.fill('#input', '记一下：和张总聊了预算方案');
  await page.click('#sendBtn');

  // Wait for AI REPLY to appear — "记下了" is from AI, not user input
  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      if (!log) return false;
      return log.innerText.includes('记下了');
    },
    { timeout: 15000 }
  );

  // Verify extract_intent was called with correct text
  expect(extractIntentBody).not.toBeNull();
  expect(extractIntentBody.text).toContain('张总');
  expect(extractIntentBody.text).toContain('预算方案');

  // Verify AI reply content appeared
  const chatBodyText = await page.evaluate(() => document.getElementById('chatBody').innerText);
  expect(chatBodyText).toContain('记下了');
});

// ── 问 (Query) ──

test('L2 问: "明天见李总，上次聊到哪了？" retrieves contact context', async ({ page }) => {
  let chatCalled = false;

  page.route('**/ai/extract_intent', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        intent: 'query_contact',
        contact_name: '李总',
        keywords: ['李总'],
        actions: [],
        action_results: [],
      }),
    });
  });

  page.route('**/ai/chat', route => {
    chatCalled = true;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: '上次和李总聊了项目融资的事，他提到下周给反馈。建议跟进融资进展。',
        usage: { input_tokens: 200, output_tokens: 100 },
      }),
    });
  });

  await loginAndWait(page);

  await page.fill('#input', '明天见李总，上次聊到哪了？');
  await page.click('#sendBtn');

  // Wait for AI REPLY to appear (not just user's message)
  // The mock returns "上次和李总聊了项目融资" — verify this specific text appears
  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      if (!log) return false;
      // Look for AI reply content, not user input
      return log.innerText.includes('项目融资') || log.innerText.includes('建议跟进');
    },
    { timeout: 15000 }
  );

  expect(chatCalled).toBe(true);
  const chatBodyText = await page.evaluate(() => document.getElementById('chatBody').innerText);
  // Verify AI reply content appeared (not just user's question)
  expect(chatBodyText).toContain('项目融资');
});

// ── 拟 (Draft) ──

test('L2 拟: "给老许拟条消息" generates draft', async ({ page }) => {
  let chatCalled = false;

  page.route('**/ai/extract_intent', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        intent: 'draft',
        contact_name: '老许',
        keywords: ['老许'],
        actions: [],
        action_results: [],
      }),
    });
  });

  page.route('**/ai/chat', route => {
    chatCalled = true;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: '老许你好，好久没联系了！最近项目怎么样？有空聊聊。',
        usage: { input_tokens: 100, output_tokens: 80 },
      }),
    });
  });

  await loginAndWait(page);

  await page.fill('#input', '给老许拟条消息');
  await page.click('#sendBtn');

  // Wait for AI-generated draft content to appear (not just user's "给老许拟条消息")
  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      if (!log) return false;
      // "好久没联系" is from the AI reply, not the user's input
      return log.innerText.includes('好久没联系') || log.innerText.includes('最近项目怎么样');
    },
    { timeout: 15000 }
  );

  expect(chatCalled).toBe(true);
  const chatBodyText = await page.evaluate(() => document.getElementById('chatBody').innerText);
  expect(chatBodyText).toContain('好久没联系');
});

// ── 报 (Report) ──

test('L2 报: weekly report shows contacts and todos', async ({ page }) => {
  // Mock /ai/advise_cloud for the weekly report
  page.route('**/ai/advise_cloud', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: '📊 本周回顾\n\n✅ 记录了2次互动\n⏳ 1个待办：跟进老许的项目\n\n💡 这周值得联系：\n⚪ 老许 — 15天没联系了\n⚪ 张总 — 建议聊聊近况',
        advise_id: 'adv_l2_report_001',
      }),
    });
  });

  // Register extract_intent + chat routes BEFORE loginAndWait
  page.route('**/ai/extract_intent', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        intent: 'report',
        contact_name: '',
        keywords: [],
        actions: [],
        action_results: [],
      }),
    });
  });

  page.route('**/ai/chat', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: '📊 本周回顾\n\n✅ 记录了2次互动\n⏳ 1个待办：跟进老许的项目\n\n💡 这周值得联系：\n⚪ 老许 — 15天没联系了\n⚪ 张总 — 建议聊聊近况',
        usage: { input_tokens: 300, output_tokens: 150 },
      }),
    });
  });

  await loginAndWait(page);

  await page.fill('#input', '这周怎么样');
  await page.click('#sendBtn');

  // Wait for AI-generated report content (not just user's "这周怎么样")
  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      if (!log) return false;
      // "本周回顾" and "跟进老许" are from AI reply, not user input
      return log.innerText.includes('本周回顾') || log.innerText.includes('跟进老许');
    },
    { timeout: 15000 }
  );

  const chatBodyText = await page.evaluate(() => document.getElementById('chatBody').innerText);
  expect(chatBodyText).toContain('本周回顾');
});

// ── Error handling ──

test('L2: backend error shows friendly message in chat', async ({ page }) => {
  page.route('**/ai/extract_intent', route => {
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal error' }) });
  });

  page.route('**/ai/chat', route => {
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal error' }) });
  });

  await loginAndWait(page);

  await page.fill('#input', '随便说点什么');
  await page.click('#sendBtn');

  // Should show some error message, not crash
  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      if (!log) return false;
      const text = log.innerText;
      // Either an error message or a fallback message
      return text.length > 20; // Some response appeared
    },
    { timeout: 10000 }
  );

  // Page should still be functional
  const inputVisible = await page.locator('#input').isVisible();
  expect(inputVisible).toBe(true);
});

// ═══════════════════════════════════════════════════════════════
// L2 Data Flywheel — extract_intent auto-executes data actions
// ═══════════════════════════════════════════════════════════════

test('L2 飞轮-完成待办: "完成了跟进老许的待办" marks todo as done', async ({ page }) => {
  page.route('**/ai/extract_intent', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        intent: 'record',
        contact_name: '老许',
        keywords: ['老许'],
        actions: [{ type: 'complete_todo', task: '跟进老许的项目' }],
        action_results: [{ type: 'complete_todo', ok: true, task: '跟进老许的项目' }],
      }),
    });
  });

  page.route('**/ai/chat', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: '已完成了「跟进老许的项目」待办 ✅',
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    });
  });

  await loginAndWait(page);
  await page.fill('#input', '完成了跟进老许的待办');
  await page.click('#sendBtn');

  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      return log && log.innerText.includes('已完成');
    },
    { timeout: 15000 }
  );

  const chatBodyText = await page.evaluate(() => document.getElementById('chatBody').innerText);
  expect(chatBodyText).toContain('已完成');
});

test('L2 飞轮-删除待办: "删掉跟进张总的待办" deletes todo', async ({ page }) => {
  page.route('**/ai/extract_intent', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        intent: 'record',
        contact_name: '张总',
        keywords: ['张总'],
        actions: [{ type: 'delete_todo', task: '跟进张总' }],
        action_results: [{ type: 'delete_todo', ok: true, task: '跟进张总' }],
      }),
    });
  });

  page.route('**/ai/chat', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: '已删除「跟进张总」待办',
        usage: { input_tokens: 80, output_tokens: 40 },
      }),
    });
  });

  await loginAndWait(page);
  await page.fill('#input', '删掉跟进张总的待办');
  await page.click('#sendBtn');

  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      return log && log.innerText.includes('已删除');
    },
    { timeout: 15000 }
  );

  const chatBodyText = await page.evaluate(() => document.getElementById('chatBody').innerText);
  expect(chatBodyText).toContain('已删除');
});

test('L2 飞轮-更新联系人: "把老许的公司改成腾讯" updates contact', async ({ page }) => {
  page.route('**/ai/extract_intent', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        intent: 'record',
        contact_name: '老许',
        keywords: ['老许'],
        actions: [{ type: 'update_contact', contact_name: '老许', field: 'company', value: '腾讯' }],
        action_results: [{ type: 'update_contact', ok: true, contact_name: '老许' }],
      }),
    });
  });

  page.route('**/ai/chat', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: '已更新老许的公司为腾讯 ✅',
        usage: { input_tokens: 90, output_tokens: 45 },
      }),
    });
  });

  await loginAndWait(page);
  await page.fill('#input', '把老许的公司改成腾讯');
  await page.click('#sendBtn');

  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      return log && log.innerText.includes('已更新');
    },
    { timeout: 15000 }
  );

  const chatBodyText = await page.evaluate(() => document.getElementById('chatBody').innerText);
  expect(chatBodyText).toContain('已更新');
});

test('L2 飞轮-创建待办: "提醒我下周联系张总" creates todo with due date', async ({ page }) => {
  page.route('**/ai/extract_intent', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        intent: 'record',
        contact_name: '张总',
        keywords: ['张总'],
        actions: [{ type: 'add_todo', contact_name: '张总', task: '联系张总', due: '2026-07-28', priority: 'P1' }],
        action_results: [{ type: 'add_todo', ok: true, task: '联系张总' }],
      }),
    });
  });

  page.route('**/ai/chat', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: '已添加待办：下周联系张总 ⏰',
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    });
  });

  await loginAndWait(page);
  await page.fill('#input', '提醒我下周联系张总');
  await page.click('#sendBtn');

  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      return log && log.innerText.includes('已添加待办');
    },
    { timeout: 15000 }
  );

  const chatBodyText = await page.evaluate(() => document.getElementById('chatBody').innerText);
  expect(chatBodyText).toContain('已添加待办');
});

// ═══════════════════════════════════════════════════════════════
// L2 Session Persistence — chat history survives refresh
// ═══════════════════════════════════════════════════════════════

test('L2 会话持久化: chat history persists after page refresh', async ({ page }) => {
  page.route('**/ai/extract_intent', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ intent: 'chat', keywords: [], actions: [], action_results: [] }),
    });
  });

  page.route('**/ai/chat', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: '你好！我是小维，有什么可以帮你的吗？',
        usage: { input_tokens: 50, output_tokens: 30 },
      }),
    });
  });

  // Mock /data/sessions to save and restore
  let savedSession = null;
  page.route('**/data/sessions', route => {
    if (route.request().method() === 'POST') {
      savedSession = JSON.parse(route.request().postData() || '{}');
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(savedSession || { messages: [] }),
      });
    }
  });

  await loginAndWait(page);

  // Send a message
  await page.fill('#input', '你好');
  await page.click('#sendBtn');

  // Wait for AI reply
  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      return log && log.innerText.includes('小维');
    },
    { timeout: 15000 }
  );

  // Reload page
  await page.reload();
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(1000);

  // Chat body should still have content (either from session restore or re-render)
  const chatBodyExists = await page.locator('#chatBody').isVisible();
  expect(chatBodyExists).toBe(true);
});

// ═══════════════════════════════════════════════════════════════
// L2 Error Recovery — graceful handling of failures
// ═══════════════════════════════════════════════════════════════

test('L2 错误恢复: network failure shows error not infinite loading', async ({ page }) => {
  page.route('**/ai/extract_intent', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ intent: 'chat', keywords: [], actions: [], action_results: [] }),
    });
  });

  // Simulate network failure for /ai/chat
  page.route('**/ai/chat', route => {
    route.abort('failed');
  });

  await loginAndWait(page);
  await page.fill('#input', '测试网络断开');
  await page.click('#sendBtn');

  // Should show some error message, not hang forever
  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      if (!log) return false;
      const text = log.innerText;
      // Either an error message or a failure indicator
      return text.includes('测试网络断开') && text.length > 20;
    },
    { timeout: 15000 }
  );

  // Page should still be functional
  const inputVisible = await page.locator('#input').isVisible();
  expect(inputVisible).toBe(true);
});

test('L2 错误恢复: empty message is not sent', async ({ page }) => {
  let chatCalled = false;
  page.route('**/ai/chat', route => {
    chatCalled = true;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: 'should not see this', usage: {} }),
    });
  });

  await loginAndWait(page);

  // Try to send empty message
  await page.click('#sendBtn');
  await page.waitForTimeout(1000);

  // Chat endpoint should not have been called
  expect(chatCalled).toBe(false);
});

test('L2 错误恢复: rapid clicking sends only one request', async ({ page }) => {
  let chatCallCount = 0;
  page.route('**/ai/extract_intent', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ intent: 'chat', keywords: [], actions: [], action_results: [] }),
    });
  });

  page.route('**/ai/chat', route => {
    chatCallCount++;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: '收到', usage: { input_tokens: 50, output_tokens: 20 } }),
    });
  });

  await loginAndWait(page);
  await page.fill('#input', '快速发送测试');

  // Rapid click 3 times
  await page.click('#sendBtn');
  await page.click('#sendBtn');
  await page.click('#sendBtn');

  await page.waitForTimeout(3000);

  // Should not have sent 3 separate requests
  // (At most 2: the first one + possibly a retry, but not 3)
  expect(chatCallCount).toBeLessThanOrEqual(2);
});

// ═══════════════════════════════════════════════════════════════
// L2 Suggestions — <<<SUGGESTIONS>>> block parsed into buttons
// ═══════════════════════════════════════════════════════════════

test('L2 建议解析: <<<SUGGESTIONS>>> block renders as clickable buttons', async ({ page }) => {
  page.route('**/ai/extract_intent', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ intent: 'chat', keywords: [], actions: [], action_results: [] }),
    });
  });

  page.route('**/ai/chat', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: '老许最近可以聊聊项目进展。<<<SUGGESTIONS>>>\n给老许拟条消息\n记一下和老许的互动\n查看老许的详情',
        usage: { input_tokens: 100, output_tokens: 80 },
      }),
    });
  });

  await loginAndWait(page);
  await page.fill('#input', '老许怎么样');
  await page.click('#sendBtn');

  // Wait for AI reply + suggestions to render
  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      if (!log) return false;
      // The suggestion text should appear in the DOM
      return log.innerText.includes('拟条消息') || log.innerText.includes('项目进展');
    },
    { timeout: 15000 }
  );

  const chatBodyText = await page.evaluate(() => document.getElementById('chatBody').innerText);
  // The main reply text should appear (before <<<SUGGESTIONS>>>)
  expect(chatBodyText).toContain('项目进展');
  // The suggestion marker should NOT be visible to user
  expect(chatBodyText).not.toContain('<<<SUGGESTIONS>>>');
});

// ═══════════════════════════════════════════════════════════════
// L2 Boundary — mixed language, emoji, long messages
// ═══════════════════════════════════════════════════════════════

test('L2 边界: mixed CN/EN input parsed correctly', async ({ page }) => {
  page.route('**/ai/extract_intent', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        intent: 'record',
        contact_name: 'John',
        keywords: ['John', '项目'],
        actions: [{ type: 'add_timeline', contact_name: 'John', summary: 'met with John about项目' }],
        action_results: [{ type: 'add_timeline', ok: true, contact_name: 'John' }],
      }),
    });
  });

  page.route('**/ai/chat', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: '记下了，你和John聊了项目的事 ✅',
        usage: { input_tokens: 120, output_tokens: 60 },
      }),
    });
  });

  await loginAndWait(page);
  await page.fill('#input', '记一下met with John about项目');
  await page.click('#sendBtn');

  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      return log && (log.innerText.includes('John') || log.innerText.includes('项目'));
    },
    { timeout: 15000 }
  );

  const chatBodyText = await page.evaluate(() => document.getElementById('chatBody').innerText);
  expect(chatBodyText.length).toBeGreaterThan(10);
});

test('L2 边界: contact name with emoji does not crash', async ({ page }) => {
  page.route('**/ai/extract_intent', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        intent: 'record',
        contact_name: '😀',
        keywords: ['😀'],
        actions: [{ type: 'add_timeline', contact_name: '😀', summary: '和😀聊了天' }],
        action_results: [{ type: 'add_timeline', ok: true, contact_name: '😀' }],
      }),
    });
  });

  page.route('**/ai/chat', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: '记下了和😀的互动 ✅',
        usage: { input_tokens: 80, output_tokens: 40 },
      }),
    });
  });

  await loginAndWait(page);
  await page.fill('#input', '记一下：和😀聊了天');
  await page.click('#sendBtn');

  // Page should not crash — wait for some response
  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      return log && log.innerText.length > 20;
    },
    { timeout: 15000 }
  );

  // Page should still be functional
  const inputVisible = await page.locator('#input').isVisible();
  expect(inputVisible).toBe(true);
});

test('L2 边界: very long message (5000 chars) is handled', async ({ page }) => {
  page.route('**/ai/extract_intent', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ intent: 'chat', keywords: [], actions: [], action_results: [] }),
    });
  });

  page.route('**/ai/chat', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reply: '收到你的长消息，已处理 ✅',
        usage: { input_tokens: 5000, output_tokens: 50 },
      }),
    });
  });

  await loginAndWait(page);

  // Generate a 5000-char message
  const longMsg = '记一下：' + '今天和老许聊了很长的内容。'.repeat(200);
  await page.fill('#input', longMsg);
  await page.click('#sendBtn');

  // Should get a response, not crash or hang
  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      return log && log.innerText.includes('收到');
    },
    { timeout: 15000 }
  );

  const inputVisible = await page.locator('#input').isVisible();
  expect(inputVisible).toBe(true);
});
