/**
 * L1 Activation Journey E2E — Can a new user reach first value?
 *
 * This is THE most important test for product launch.
 * It walks through the complete new-user journey:
 *
 *   1. Page loads
 *   2. User "signs up" (mock Clerk login)
 *   3. Onboarding modal appears (no contacts → trigger)
 *   4. User types natural language: "昨天和老王吃了饭，前天跟张总开了会"
 *   5. Frontend calls /ai/extract_intent → backend creates contacts
 *   6. User clicks "开始使用 →"
 *   7. Frontend calls /ai/advise_cloud → backend returns suggestions
 *   8. User sees AI advice message in chat
 *
 * Mocks:
 * - Clerk auth (mock window.Clerk)
 * - Backend API (intercept fetch to api.welian.app, return canned responses)
 *
 * This test crosses the frontend-backend boundary — it verifies
 * the frontend calls the right endpoints with the right params,
 * and correctly processes the backend response.
 */
import { test, expect } from '@playwright/test';

const mockClerkScript = `
window.Sentry = { init(){}, captureException(){}, captureMessage(){} };
window.__mockToken = 'testuser:l1-journey';
window.Clerk = {
  loaded: true,
  status: 'ready',
  user: { id: 'testuser_l1', firstName: 'L1', primaryEmailAddress: { emailAddress: 'l1@test.com' } },
  session: { getToken: async () => window.__mockToken, status: 'active' },
  async load(opts) { this.loaded = true; return this; },
  addListener(callback) { window.__clerkCallback = callback; },
  mountSignIn(container, opts) { container.innerHTML = '<div>Mock Sign In</div>'; },
  mountSignUp(container, opts) { container.innerHTML = '<div>Mock Sign Up</div>'; },
  signOut() { this.user = null; if (window.__clerkCallback) window.__clerkCallback({ user: null }); },
  async setActive({ session }) {},
};
window.loadClerkUI = async (key) => { window.__internal_ClerkUICtor = function() {}; };
`;

// Mock backend responses for the activation journey
function mockBackendResponses(page) {
  // Mock /ai/extract_intent — onboarding mode, creates contacts from natural text
  page.route('**/ai/extract_intent', route => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.onboarding) {
      // Set contacts so subsequent /data/contacts calls return them
      page._onboardingContacts = [
        { id: 'c-1', name: '老王', nature: 'leverage' },
        { id: 'c-2', name: '张总', nature: 'leverage' },
      ];
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          intent: 'record',
          contact_name: '',
          keywords: [],
          actions: [
            { type: 'add_contact', name: '老王', relation: '朋友' },
            { type: 'add_contact', name: '张总', relation: '合作者' },
            { type: 'add_timeline', contact_name: '老王', summary: '吃了饭', date: new Date().toISOString().slice(0, 10) },
          ],
          action_results: [
            { type: 'add_contact', ok: true, name: '老王' },
            { type: 'add_contact', ok: true, name: '张总' },
            { type: 'add_timeline', ok: true, summary: '吃了饭', contact_name: '老王' },
          ],
        }),
      });
    } else {
      // Non-onboarding extract_intent
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          intent: 'chat',
          contact_name: '',
          keywords: [],
          actions: [],
          action_results: [],
        }),
      });
    }
  });

  // Mock /ai/advise_cloud — returns suggestions
  page.route('**/ai/advise_cloud', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: '💡 这周值得联系的人：\n⚪ 老王 — 30天没联系了，建议主动打个招呼\n⚪ 张总 — 刚加入你的关系网络，建议聊聊近况',
        raw: ['💡 这周值得联系的人', '⚪ 老王 — 30天没联系了', '⚪ 张总 — 刚加入你的关系网络'],
        advise_id: 'adv_l1_test_001',
      }),
    });
  });

  // Mock /data/contacts — onboarding checks this endpoint
  // Initially empty (triggers onboarding), but after extract_intent creates contacts,
  // return them so the "开始使用" button appears
  page.route('**/data/contacts', route => {
    const contacts = page._onboardingContacts || [];
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ contacts }),
    });
  });

  // Mock /data/pull — returns empty for new user
  page.route('**/data/pull', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contacts: [],
        todos: [],
        timeline: [],
        pulled_at: new Date().toISOString(),
      }),
    });
  });

  // Mock /ai/chat — for post-onboarding chat
  page.route('**/ai/chat', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        content: [{ type: 'text', text: '好的，我记下了 😊' }],
        result: '好的，我记下了 😊',
        usage: { input_tokens: 100, output_tokens: 50 },
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
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  page.consoleErrors = [];
  page.on('pageerror', err => page.consoleErrors.push(err.message));

  // Intercept CDN scripts
  await page.route('**/clerk.browser.js*', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '// clerk mock' });
  });
  await page.route('**/ui.browser.js*', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '// clerk ui mock' });
  });
  await page.route('**/sentry-cdn.com/**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '// sentry stub' });
  });

  await page.addInitScript(mockClerkScript);
  await page.addInitScript(`
    Object.defineProperty(window, 'loadClerkUI', {
      get: () => async (key) => { window.__internal_ClerkUICtor = function() {}; return true; },
      set: (v) => {},
      configurable: true,
    });
    // Dismiss cookie banner so it doesn't intercept clicks
    localStorage.setItem('welian_cookie_ok', '1');
  `);

  mockBackendResponses(page);
});

test('L1: new user completes onboarding and sees first advise', async ({ page }) => {
  await page.goto('http://localhost:8899/index.html');

  // Wait for Clerk to initialize
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  // Simulate login (triggers onAuthed → checkOnboardingNeeded)
  await page.evaluate(() => {
    // Set user and fire callback to trigger onAuthed
    window.Clerk.user = { id: 'testuser_l1', firstName: 'L1', primaryEmailAddress: { emailAddress: 'l1@test.com' } };
    window.Clerk.session = { getToken: async () => window.__mockToken, status: 'active' };
    if (window.__clerkCallback) window.__clerkCallback({ user: window.Clerk.user });
  });

  // Onboarding modal should appear (new user, no contacts)
  await expect(page.locator('#onboardingInput')).toBeVisible({ timeout: 10000 });

  // Type natural language input
  await page.fill('#onboardingInput', '昨天和老王吃了饭，前天跟张总开了个会');
  await page.click('button:has-text("发送")');

  // Wait for contact extraction to complete
  // The result should show extracted contacts
  await page.waitForFunction(
    () => document.body.innerText.includes('老王') || document.body.innerText.includes('张总'),
    { timeout: 10000 }
  );

  // Click "开始使用 →" to finish onboarding
  await page.click('button:has-text("开始使用")');

  // After onboarding, the advise should appear in chat
  // Look for advise content in the chat log
  await page.waitForFunction(
    () => {
      const chatLog = document.getElementById('chatBody');
      if (!chatLog) return false;
      const text = chatLog.innerText;
      // The welcome message + advise should both appear
      return text.includes('老王') && text.includes('张总');
    },
    { timeout: 15000 }
  );

  // Verify onboarding is marked done in localStorage
  const onboardingDone = await page.evaluate(() => localStorage.getItem('welian_onboarding_done'));
  expect(onboardingDone).toBe('1');
});

test('L1: returning user (with contacts) skips onboarding', async ({ page }) => {
  // Pre-set onboarding as done
  await page.addInitScript(`
    localStorage.setItem('welian_onboarding_done', '1');
  `);

  // Mock /data/contacts to return existing contacts (skips onboarding)
  await page.route('**/data/contacts', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ contacts: [{ id: 'c-1', name: '老许', nature: 'leverage' }] }),
    });
  });

  // Mock /data/pull to return existing contacts
  await page.route('**/data/pull', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contacts: [{ id: 'c-1', name: '老许', nature: 'leverage' }],
        todos: [],
        timeline: [],
        pulled_at: new Date().toISOString(),
      }),
    });
  });

  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  // Simulate login
  await page.evaluate(() => {
    window.Clerk.user = { id: 'testuser_l1', firstName: 'L1', primaryEmailAddress: { emailAddress: 'l1@test.com' } };
    window.Clerk.session = { getToken: async () => window.__mockToken, status: 'active' };
    if (window.__clerkCallback) window.__clerkCallback({ user: window.Clerk.user });
  });

  await page.waitForTimeout(3000);

  // Onboarding modal should NOT appear
  const onboardingVisible = await page.locator('#onboardingInput').isVisible().catch(() => false);
  expect(onboardingVisible).toBe(false);
});

test('L1: onboarding correctly calls /ai/extract_intent with onboarding=true', async ({ page }) => {
  let extractIntentBody = null;

  await page.route('**/ai/extract_intent', route => {
    extractIntentBody = JSON.parse(route.request().postData() || '{}');
    page._onboardingContacts = [{ id: 'c-1', name: '老王', nature: 'leverage' }];
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        intent: 'record',
        actions: [{ type: 'add_contact', name: '老王', relation: '朋友' }],
        action_results: [{ type: 'add_contact', ok: true, name: '老王' }],
      }),
    });
  });

  // Mock /data/contacts to return created contacts after extract_intent
  await page.route('**/data/contacts', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ contacts: page._onboardingContacts || [] }),
    });
  });

  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  // Login → trigger onboarding
  await page.evaluate(() => {
    window.Clerk.user = { id: 'testuser_l1', firstName: 'L1', primaryEmailAddress: { emailAddress: 'l1@test.com' } };
    window.Clerk.session = { getToken: async () => window.__mockToken, status: 'active' };
    if (window.__clerkCallback) window.__clerkCallback({ user: window.Clerk.user });
  });

  await expect(page.locator('#onboardingInput')).toBeVisible({ timeout: 10000 });
  await page.fill('#onboardingInput', '昨天和老王吃了饭');
  await page.click('button:has-text("发送")');

  await page.waitForTimeout(2000);

  // Verify the frontend called extract_intent with correct params
  expect(extractIntentBody).not.toBeNull();
  expect(extractIntentBody.text).toBe('昨天和老王吃了饭');
  expect(extractIntentBody.onboarding).toBe(true);
  expect(extractIntentBody.session_token).toBeTruthy();
});

test('L1: finishOnboarding correctly calls /ai/advise_cloud', async ({ page }) => {
  let adviseCloudCalled = false;

  await page.route('**/ai/advise_cloud', route => {
    adviseCloudCalled = true;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: '💡 这周值得联系的人：\n⚪ 老王 — 建议主动打个招呼',
        advise_id: 'adv_l1_test_002',
      }),
    });
  });

  // Mock extract_intent + /data/contacts for onboarding flow
  await page.route('**/ai/extract_intent', route => {
    page._onboardingContacts = [{ id: 'c-1', name: '老王', nature: 'leverage' }];
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        intent: 'record',
        actions: [{ type: 'add_contact', name: '老王', relation: '朋友' }],
        action_results: [{ type: 'add_contact', ok: true, name: '老王' }],
      }),
    });
  });

  await page.route('**/data/contacts', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ contacts: page._onboardingContacts || [] }),
    });
  });

  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  // Login → onboarding
  await page.evaluate(() => {
    window.Clerk.user = { id: 'testuser_l1', firstName: 'L1', primaryEmailAddress: { emailAddress: 'l1@test.com' } };
    window.Clerk.session = { getToken: async () => window.__mockToken, status: 'active' };
    if (window.__clerkCallback) window.__clerkCallback({ user: window.Clerk.user });
  });

  await expect(page.locator('#onboardingInput')).toBeVisible({ timeout: 10000 });
  await page.fill('#onboardingInput', '昨天和老王吃了饭');
  await page.click('button:has-text("发送")');

  // Wait for extraction result — contacts appear in onboarding UI
  await page.waitForFunction(
    () => document.body.innerText.includes('老王'),
    { timeout: 10000 }
  );

  // Click "开始使用" to trigger finishOnboarding — use force if needed (cookie banner may intercept)
  const startBtn = page.locator('button:has-text("开始使用")');
  await startBtn.waitFor({ timeout: 10000 });
  await startBtn.click({ force: true });

  // Wait for advise_cloud to be called
  await page.waitForTimeout(3000);

  // Verify advise_cloud was called
  expect(adviseCloudCalled).toBe(true);
});
