/**
 * L2 Mine tab smoke tests — verify all mine tabs load without errors.
 * Tab structure: overview, contacts, todos, meetings, reports (with sub-tabs), settings
 * Signals/weekly/monthly are sub-tabs under "reports"
 */
import { test, expect } from '@playwright/test';

const mockClerkScript = `
window.Sentry = { init(){}, captureException(){}, captureMessage(){} };
window.__mockToken = 'testuser:l2-minetabs';
window.Clerk = {
  loaded: true,
  status: 'ready',
  user: { id: 'testuser_mt2', firstName: 'MT', primaryEmailAddress: { emailAddress: 'mt2@test.com' } },
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
  page.on('pageerror', err => { throw err; });

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

  // Mock all data endpoints
  await page.route('**/data/contacts', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [{ id: 'c1', name: '老许', company: '腾讯', relation: '同行', nature: 'leverage' }] }) });
  });
  await page.route('**/data/pull', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [], todos: [], timeline: [], pulled_at: new Date().toISOString() }) });
  });
  await page.route('**/ai/billing', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan: 'free', allowance: 100, remaining: 80, used: 20 }) });
  });
  await page.route('**/data/sessions', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route('**/ai/config', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'cloud', dataPriority: ['cloud_kv'] }) });
  });
  await page.route('**/data/todos', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ todos: [{ id: 't1', task: '联系老许', contact_name: '老许', done: false, due: '2026-07-25', priority: 'P1' }] }) });
  });
  await page.route('**/data/timeline*', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ timeline: [{ id: 'tl1', contact_name: '老许', summary: '聊了项目', date: '2026-07-20' }] }) });
  });
  await page.route('**/data/meetings*', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ meetings: [], total: 0 }) });
  });
  await page.route('**/data/memory*', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ memories: [] }) });
  });
  await page.route('**/data/goals*', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ goals: [] }) });
  });
  await page.route('**/data/profile*', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile: {} }) });
  });
  await page.route('**/ai/hn_signals', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ report: { greeting: 'ok', themes: [], signals: [], closing: '' }, raw_data: {} }) });
  });
  await page.route('**/ai/signal_domains*', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ domains: ['investment', 'ai'] }) });
  });
  await page.route('**/ai/weekly_report*', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ report: { summary: '本周不错', highlights: [], stats: {} }, usage: { points: 5, remaining: 75 } }) });
  });
  await page.route('**/ai/monthly_report*', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ report: { summary: '本月总结', highlights: [], stats: {} }, usage: { points: 5, remaining: 70 } }) });
  });
  await page.route('**/ai/pricing*', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plans: {} }) });
  });
  await page.route('**/ai/admin/check*', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ is_admin: false }) });
  });
});

async function loginAndWait(page) {
  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.Clerk.user = { id: 'testuser_mt2', firstName: 'MT', primaryEmailAddress: { emailAddress: 'mt2@test.com' } };
    window.Clerk.session = { getToken: async () => window.__mockToken, status: 'active' };
    if (window.__clerkCallback) window.__clerkCallback({ user: window.Clerk.user });
  });
  await expect(page.locator('#input')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1000);
}

// ═══════════════════════════════════════════════════════════════
// Test: overview tab loads with contact and todo data
// ═══════════════════════════════════════════════════════════════
test('L2 MineTab: overview tab loads and shows data', async ({ page }) => {
  await loginAndWait(page);
  await page.click('#billingBtn');
  await page.waitForSelector('.mine-tab[data-tab="overview"]', { timeout: 5000 });
  await page.waitForFunction(() => {
    const c = document.getElementById('mineContent');
    if (!c) return false;
    const text = c.innerText || '';
    return text.includes('进化') || text.includes('本月') || text.includes('Evolution');
  }, { timeout: 8000 });
  const content = await page.evaluate(() => document.getElementById('mineContent')?.innerText || '');
  expect(content.length).toBeGreaterThan(10);
});

// ═══════════════════════════════════════════════════════════════
// Test: contacts tab loads
// ═══════════════════════════════════════════════════════════════
test('L2 MineTab: contacts tab loads and shows contacts', async ({ page }) => {
  await loginAndWait(page);
  await page.click('#billingBtn');
  await page.waitForSelector('.mine-tab[data-tab="contacts"]', { timeout: 5000 });
  await page.waitForTimeout(1000);
  await page.click('.mine-tab[data-tab="contacts"]');
  await page.waitForFunction(() => {
    const c = document.getElementById('mineContent');
    if (!c) return false;
    return c.querySelector('#contactsResults') !== null;
  }, { timeout: 5000 });
  const content = await page.evaluate(() => document.getElementById('mineContent')?.innerText || '');
  expect(content).toContain('老许');
});

// ═══════════════════════════════════════════════════════════════
// Test: todos tab loads
// ═══════════════════════════════════════════════════════════════
test('L2 MineTab: todos tab loads and shows todos', async ({ page }) => {
  await loginAndWait(page);
  await page.click('#billingBtn');
  await page.waitForSelector('.mine-tab[data-tab="todos"]', { timeout: 5000 });
  await page.waitForTimeout(1000);
  await page.click('.mine-tab[data-tab="todos"]');
  await page.waitForFunction(() => {
    const c = document.getElementById('mineContent');
    if (!c) return false;
    const text = c.innerText || '';
    return !text.includes('进化') && text.length > 10;
  }, { timeout: 5000 });
  const content = await page.evaluate(() => document.getElementById('mineContent')?.innerText || '');
  expect(content).toContain('联系老许');
});

// ═══════════════════════════════════════════════════════════════
// Test: reports tab loads (shows weekly sub-tab by default)
// ═══════════════════════════════════════════════════════════════
test('L2 MineTab: reports tab loads with sub-tabs', async ({ page }) => {
  await loginAndWait(page);
  await page.click('#billingBtn');
  await page.waitForSelector('.mine-tab[data-tab="reports"]', { timeout: 5000 });
  await page.waitForTimeout(1000);
  await page.click('.mine-tab[data-tab="reports"]');
  await page.waitForFunction(() => {
    const c = document.getElementById('mineContent');
    if (!c) return false;
    const text = c.innerText || '';
    return text.includes('周报') || text.includes('Weekly') || text.includes('月度') || text.includes('信号');
  }, { timeout: 5000 });
  const content = await page.evaluate(() => document.getElementById('mineContent')?.innerText || '');
  expect(content.length).toBeGreaterThan(5);
});

// ═══════════════════════════════════════════════════════════════
// Test: settings tab loads
// ═══════════════════════════════════════════════════════════════
test('L2 MineTab: settings tab loads', async ({ page }) => {
  await loginAndWait(page);
  await page.click('#billingBtn');
  await page.waitForSelector('.mine-tab[data-tab="settings"]', { timeout: 5000 });
  await page.waitForTimeout(1000);
  await page.click('.mine-tab[data-tab="settings"]');
  await page.waitForFunction(() => {
    const c = document.getElementById('mineContent');
    if (!c) return false;
    const text = c.innerText || '';
    return text.includes('模型') || text.includes('Model') || text.includes('设置') || text.includes('Settings');
  }, { timeout: 5000 });
  const content = await page.evaluate(() => document.getElementById('mineContent')?.innerText || '');
  expect(content.length).toBeGreaterThan(5);
});

// ═══════════════════════════════════════════════════════════════
// Test: rapid tab switching doesn't freeze page
// ═══════════════════════════════════════════════════════════════
test('L2 MineTab: rapid switching through all tabs does not freeze', async ({ page }) => {
  await loginAndWait(page);
  await page.click('#billingBtn');
  await page.waitForSelector('.mine-tab[data-tab="settings"]', { timeout: 5000 });
  await page.waitForTimeout(1000);

  const tabs = ['overview', 'contacts', 'todos', 'reports', 'settings', 'overview', 'contacts', 'reports'];
  for (const tab of tabs) {
    await page.click(`.mine-tab[data-tab="${tab}"]`);
    await page.waitForTimeout(300);
  }

  // Page should still be responsive
  const isResponsive = await page.evaluate(() => {
    const el = document.getElementById('mineContent');
    return el !== null && el.innerHTML !== '';
  });
  expect(isResponsive).toBe(true);

  // Final tab (contacts) should have loaded
  const content = await page.evaluate(() => document.getElementById('mineContent')?.innerText || '');
  expect(content.length).toBeGreaterThan(5);
});
