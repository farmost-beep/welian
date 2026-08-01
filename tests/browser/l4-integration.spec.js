/**
 * L4 Integration Test — Real frontend + real backend, no API mocking.
 *
 * Unlike L0-L2 which mock backend responses via page.route, this test:
 * - Does NOT intercept /ai/* or /data/* requests — they hit the real backend
 * - Mocks only Clerk JS + Sentry CDN (no real Clerk session in test env)
 * - Injects a sync-secret token (testuser_e2e:<WELIAN_SYNC_SECRET>) that the
 *   Worker's getVerifiedUserId recognizes as sync-secret auth
 *
 * Prerequisites:
 * - Backend at api.welian.app must be reachable (tests skip if not)
 * - WELIAN_SYNC_SECRET env var must be set for auth-requiring tests
 *   (read from process.env — the real production secret, not a fake one)
 * - Local static server on :8899 (playwright webServer config)
 *
 * Test cases (smoke-level):
 *   1. Page loads + real GET /ai/config returns 200 (no auth needed)
 *   2. Login → real GET /data/contacts returns JSON (needs sync secret)
 *   3. Send message → real POST /ai/extract_intent returns JSON (needs sync secret)
 *   4. signals.html loads → real GET /ai/signals_preview returns data (no auth)
 */
import { test, expect } from '@playwright/test';

const BACKEND_URL = 'https://api.welian.app';
// Sync secret must match the Worker's WELIAN_SYNC_SECRET env var.
// Read from process.env so we use the real secret, not a hardcoded fake.
const SYNC_SECRET = process.env.WELIAN_SYNC_SECRET || process.env.TEST_SYNC_SECRET || '';
const SYNC_TOKEN = SYNC_SECRET ? `testuser_e2e:${SYNC_SECRET}` : '';

// --- Mock Clerk (same pattern as l0-smoke, token is a real sync secret) ---
function buildMockClerkScript(token) {
  return `
window.Sentry = { init(){}, captureException(){}, captureMessage(){} };
window.__mockToken = ${JSON.stringify(token)};
window.Clerk = {
  loaded: true,
  status: 'ready',
  user: null,
  session: null,
  async load(opts) { this.loaded = true; return this; },
  addListener(callback) { window.__clerkCallback = callback; },
  mountSignIn(container, opts) {
    container.innerHTML = '<div data-testid="clerk-signin">Mock Sign In</div>';
  },
  mountSignUp(container, opts) {
    container.innerHTML = '<div data-testid="clerk-signup">Mock Sign Up</div>';
  },
  signOut() { this.user = null; this.session = null; if (window.__clerkCallback) window.__clerkCallback({ user: null }); },
  async setActive({ session }) {},
};
window.loadClerkUI = async (key) => { window.__internal_ClerkUICtor = function() {}; };
`;
}

// Check if backend is reachable; skip entire suite if not.
let backendReachable = false;
test.beforeAll(async ({ request }) => {
  try {
    const resp = await request.get(`${BACKEND_URL}/ai/config`, { timeout: 10000 });
    backendReachable = resp.ok();
  } catch {
    backendReachable = false;
  }
});

test.beforeEach(async ({ page }) => {
  test.skip(!backendReachable, 'Backend api.welian.app not reachable — skipping integration test');

  // Collect console errors for diagnostics (non-fatal)
  page.consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') page.consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => page.consoleErrors.push(err.message));

  // Mock ONLY Clerk + Sentry CDN — let all /ai/* and /data/* go to real backend
  await page.route('**/clerk.browser.js*', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '// clerk mock' });
  });
  await page.route('**/ui.browser.js*', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '// clerk ui mock' });
  });
  await page.route('**/sentry-cdn.com/**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '// sentry stub' });
  });

  await page.addInitScript(buildMockClerkScript(SYNC_TOKEN));
  await page.addInitScript(`
    let _loadClerkUI = window.loadClerkUI;
    Object.defineProperty(window, 'loadClerkUI', {
      get: () => async (key) => { window.__internal_ClerkUICtor = function() {}; return true; },
      set: (v) => {},
      configurable: true,
    });
    // Dismiss cookie banner
    localStorage.setItem('welian_cookie_ok', '1');
  `);
});

// --- Test 1: Page loads + real backend health check (no auth needed) ---
test('L4: page loads and real GET /ai/config returns 200', async ({ page }) => {
  await page.goto('http://localhost:8899/index.html');

  // /ai/config is a public endpoint (no auth) — fetch directly to verify backend health
  const result = await page.evaluate(async (url) => {
    const resp = await fetch(`${url}/ai/config`);
    return { status: resp.status, body: await resp.json() };
  }, BACKEND_URL);

  expect(result.status).toBe(200);
  expect(result.body).toBeTruthy();
  // Config should have a routing object (per fetchRoutingConfig in app.js)
  expect(result.body).toHaveProperty('routing');
});

// --- Test 2: Login → real GET /data/contacts returns data (needs sync secret) ---
test('L4: logged-in user gets real contacts from /data/contacts', async ({ page }) => {
  test.skip(!SYNC_SECRET, 'WELIAN_SYNC_SECRET not set — skipping auth-requiring test');

  await page.goto('http://localhost:8899/index.html');

  // Wait for Clerk mock to register callback
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  // Listen for the real /data/contacts response (any status — we verify below)
  const contactsResponse = page.waitForResponse(
    resp => resp.url().includes('/data/contacts') && !resp.url().includes('/ai/'),
    { timeout: 30000 }
  );

  // Simulate login — fires clerkCallback → onAuthed → checkOnboardingNeed → fetch /data/contacts
  await page.evaluate(() => {
    window.Clerk.user = { id: 'testuser_e2e', firstName: 'E2E', primaryEmailAddress: { emailAddress: 'e2e@test.com' } };
    window.Clerk.session = { getToken: async () => window.__mockToken, status: 'active' };
    if (window.__clerkCallback) window.__clerkCallback({ user: window.Clerk.user });
  });

  const resp = await contactsResponse;
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  // Backend returns { contacts: [...] } — empty array is valid for a test user
  expect(body).toHaveProperty('contacts');
  expect(Array.isArray(body.contacts)).toBe(true);
});

// --- Test 3: Send message → real POST /ai/extract_intent returns JSON ---
test('L4: send message triggers real /ai/extract_intent with valid JSON', async ({ page }) => {
  test.skip(!SYNC_SECRET, 'WELIAN_SYNC_SECRET not set — skipping auth-requiring test');

  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  // Login first
  await page.evaluate(() => {
    window.Clerk.user = { id: 'testuser_e2e', firstName: 'E2E', primaryEmailAddress: { emailAddress: 'e2e@test.com' } };
    window.Clerk.session = { getToken: async () => window.__mockToken, status: 'active' };
    if (window.__clerkCallback) window.__clerkCallback({ user: window.Clerk.user });
  });

  // Wait for auth to settle (status dot online, input enabled)
  await page.waitForFunction(() => {
    const input = document.getElementById('input');
    return input && !input.disabled;
  }, { timeout: 15000 }).catch(() => {});

  // Listen for the real /ai/extract_intent response (any status)
  const extractResponse = page.waitForResponse(
    resp => resp.url().includes('/ai/extract_intent'),
    { timeout: 60000 }
  );

  // Type and send a message
  await page.fill('#input', '今天见了老李，聊了聊合作的事');
  await page.click('#sendBtn');

  const resp = await extractResponse;
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  // extract_intent returns { intent, contact_name, keywords, actions, action_results }
  expect(body).toHaveProperty('intent');
  expect(typeof body.intent).toBe('string');
});

// --- Test 4: signals.html loads with real backend data (no auth needed) ---
test('L4: signals.html loads and real GET /ai/signals_preview returns data', async ({ page }) => {
  const signalsResponse = page.waitForResponse(
    resp => resp.url().includes('/ai/signals_preview') && resp.status() === 200,
    { timeout: 30000 }
  );
  await page.goto('http://localhost:8899/signals.html');
  const resp = await signalsResponse;
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  // signals_preview returns { report: { signals: [...] } }
  expect(body).toBeTruthy();
  // The page should render signal cards (not stuck on "正在生成")
  await page.waitForFunction(
    () => {
      const content = document.getElementById('content');
      if (!content) return false;
      const text = content.innerText;
      // Either signals rendered or "no signals today" message — just not the loading text
      return !text.includes('正在生成');
    },
    { timeout: 30000 }
  );
});
