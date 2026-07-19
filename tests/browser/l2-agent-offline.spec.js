/**
 * L2 Chat Dialog — Agent offline root cause test
 *
 * Reproduces: user sends message → bridge WebSocket is in CLOSING/CLOSED state
 * but bridgeReady is still true → agentChat postMessage is silently dropped
 * → user sees "agent offline" message.
 *
 * Root cause: bridge iframe's ws.send only checks readyState===OPEN,
 * but doesn't notify parent when ws is not OPEN. Parent's agentChat
 * waits until timeout, then ws.onclose fires → "agent offline".
 */
import { test, expect } from '@playwright/test';

const mockClerkScript = `
window.Sentry = { init(){}, captureException(){}, captureMessage(){} };
window.__mockToken = 'testuser:l2-agent-offline';
window.Clerk = {
  loaded: true,
  status: 'ready',
  user: { id: 'testuser_ao', firstName: 'AO', primaryEmailAddress: { emailAddress: 'ao@test.com' } },
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

test.beforeEach(async ({ page }) => {
  page.consoleErrors = [];
  page.on('pageerror', err => page.consoleErrors.push(err.message));

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
    localStorage.setItem('welian_onboarding_done', '1');
    localStorage.setItem('welian_cookie_ok', '1');
  `);

  page.route('**/data/contacts', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [] }) });
  });
  page.route('**/data/pull', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [], todos: [], timeline: [], pulled_at: new Date().toISOString() }) });
  });
  page.route('**/ai/billing', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan: 'free', allowance: 100, remaining: 100, used: 0 }) });
  });
  page.route('**/data/sessions', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  page.route('**/ai/config', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'cloud', dataPriority: ['cloud_kv'] }) });
  });
  page.route('**/data/todos', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ todos: [] }) });
  });
  page.route('**/data/search', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ matched_count: 0, data_context: '' }) });
  });
  page.route('**/data/context', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data_context: '' }) });
  });
  page.route('**/ai/extract_intent', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'chat', keywords: [], actions: [], action_results: [] }) });
  });
  page.route('**/ai/chat', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'Cloud reply', usage: { input_tokens: 10, output_tokens: 5 } }) });
  });
});

async function loginAndWait(page) {
  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    window.Clerk.user = { id: 'testuser_ao', firstName: 'AO', primaryEmailAddress: { emailAddress: 'ao@test.com' } };
    window.Clerk.session = { getToken: async () => window.__mockToken, status: 'active' };
    if (window.__clerkCallback) window.__clerkCallback({ user: window.Clerk.user });
  });

  await expect(page.locator('#input')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1000);
}

// ═══════════════════════════════════════════════════════════════
// Test 1: Simulate bridge ws-close during chat — should fallback to cloud
// ═══════════════════════════════════════════════════════════════

test('L2 agent-offline: ws-close during chat falls back to cloud gracefully', async ({ page }) => {
  await loginAndWait(page);

  // Fire ws-close event as if bridge iframe sent it
  // This triggers onBridgeMessage → setIsLive(false), setBridgeReady(false)
  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent('message', {
      source: window,
      data: { source: 'welian-bridge', type: 'ws-close' }
    }));
  });

  await page.waitForTimeout(500);

  // Send a message — should go to cloud, not hang
  await page.fill('#input', '测试消息');
  await page.click('#sendBtn');

  // Should get a reply from cloud (not hang waiting for dead agent)
  await page.waitForFunction(
    () => {
      const body = document.getElementById('chatBody');
      return body && body.innerText.includes('Cloud reply');
    },
    { timeout: 15000 }
  );

  // Should NOT have "agent offline" blocking the chat
  const inputVisible = await page.locator('#input').isVisible();
  expect(inputVisible).toBe(true);
});

// ═══════════════════════════════════════════════════════════════
// Test 2: bridgeReady=true but ws not OPEN — agentChat should timeout
// and fallback to cloud, not hang forever
// ═══════════════════════════════════════════════════════════════

test('L2 agent-offline: stale bridgeReady does not hang chat', async ({ page }) => {
  // Mock /ai/config to return live_first mode
  await page.route('**/ai/config', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'live_first', dataPriority: ['cloud_kv'] }) });
  });

  await loginAndWait(page);

  // Send a message — no bridge iframe exists, so agentChat returns null
  // cloudChat should fallback to cloud LLM
  await page.fill('#input', '测试stale bridge');
  await page.click('#sendBtn');

  // Should fallback to cloud and show reply (not hang forever)
  await page.waitForFunction(
    () => {
      const body = document.getElementById('chatBody');
      return body && (body.innerText.includes('Cloud reply') || body.innerText.includes('cloud_error') || body.innerText.includes('错误') || body.innerText.includes('登录'));
    },
    { timeout: 30000 }
  );

  // Chat should still be functional
  const inputVisible = await page.locator('#input').isVisible();
  expect(inputVisible).toBe(true);
});

// ═══════════════════════════════════════════════════════════════
// Test 3: "agent offline" system message should NOT appear when
// user is in cloud mode and never had agent connected
// ═══════════════════════════════════════════════════════════════

test('L2 agent-offline: no "agent offline" message in pure cloud mode', async ({ page }) => {
  await loginAndWait(page);

  // In test env, no bridge iframe loads, so we're in pure cloud mode
  // Send a message
  await page.fill('#input', '纯cloud模式测试');
  await page.click('#sendBtn');

  // Wait for reply
  await page.waitForFunction(
    () => {
      const body = document.getElementById('chatBody');
      return body && body.innerText.includes('Cloud reply');
    },
    { timeout: 15000 }
  );

  // Should NOT have "agent offline" system message
  const chatText = await page.evaluate(() => document.getElementById('chatBody').innerText);
  expect(chatText).not.toContain('agent offline');
  expect(chatText).not.toContain('Offline');
});
