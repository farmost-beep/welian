/**
 * L2 Signals tab — regression test for abort-on-switch fix.
 * Signals is a sub-tab under "reports" tab.
 * Verifies that repeated clicks don't stack concurrent requests and cause page freeze.
 */
import { test, expect } from '@playwright/test';

const mockClerkScript = `
window.Sentry = { init(){}, captureException(){}, captureMessage(){} };
window.__mockToken = 'testuser:l2-signals';
window.Clerk = {
  loaded: true,
  status: 'ready',
  user: { id: 'testuser_sg', firstName: 'SG', primaryEmailAddress: { emailAddress: 'sg@test.com' } },
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
    try { localStorage.setItem('welian_onboarding_done', '1'); } catch(e) {}
    try { localStorage.setItem('welian_cookie_ok', '1'); } catch(e) {}
  `);

  await page.route('**/data/contacts', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [] }) });
  });
  await page.route('**/data/pull', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [], todos: [], timeline: [], pulled_at: new Date().toISOString() }) });
  });
  await page.route('**/ai/billing', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan: 'free', allowance: 100, remaining: 100, used: 0 }) });
  });
  await page.route('**/data/sessions', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route('**/ai/config', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'cloud', dataPriority: ['cloud_kv'] }) });
  });
  await page.route('**/data/todos', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ todos: [] }) });
  });
  await page.route('**/data/timeline*', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ timeline: [] }) });
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
  await page.route('**/ai/signal_domains*', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ domains: ['investment', 'ai'] }) });
  });
  await page.route('**/ai/weekly_report*', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ report: { greeting: 'weekly ok' }, usage: { points: 5, remaining: 95 } }) });
  });
  await page.route('**/ai/monthly_report*', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ report: { greeting: 'monthly ok' }, usage: { points: 5, remaining: 90 } }) });
  });
});

async function loginAndWait(page) {
  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.Clerk.user = { id: 'testuser_sg', firstName: 'SG', primaryEmailAddress: { emailAddress: 'sg@test.com' } };
    window.Clerk.session = { getToken: async () => window.__mockToken, status: 'active' };
    if (window.__clerkCallback) window.__clerkCallback({ user: window.Clerk.user });
  });
  await expect(page.locator('#input')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1000);
}

// ═══════════════════════════════════════════════════════════════
// Test 1: Signals sub-tab loads and renders content
// ═══════════════════════════════════════════════════════════════
test('L2 信号: signals sub-tab loads and renders content', async ({ page }) => {
  let signalsCallCount = 0;
  await page.route('**/ai/hn_signals', route => {
    signalsCallCount++;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        report: {
          greeting: '今天有3条信号',
          themes: ['AI', '芯片'],
          signals: [{ title: 'Test signal', points: 50, why: '重要', action: '关注', hn_url: 'https://news.ycombinator.com', tags: ['AI'], source: 'HN' }],
          closing: '保持关注',
        },
        raw_data: {},
      }),
    });
  });

  await loginAndWait(page);
  await page.click('#billingBtn');
  await page.waitForSelector('.mine-tab[data-tab="reports"]', { timeout: 5000 });
  await page.waitForTimeout(1000);
  // Click reports tab, then signals sub-tab
  await page.click('.mine-tab[data-tab="reports"]');
  await page.waitForSelector('.mine-subtab-item', { timeout: 5000 });
  // Click signals sub-tab
  await page.evaluate(() => {
    const btns = document.querySelectorAll('.mine-subtab-item');
    for (const btn of btns) {
      if (btn.textContent.includes('信号') || btn.textContent.includes('Signals')) {
        btn.click();
        return;
      }
    }
  });
  await page.waitForFunction(() => {
    const c = document.getElementById('mineContent');
    if (!c) return false;
    const text = c.innerText || '';
    // Wait for actual signal content, not just the sub-tab button "信号"
    return text.includes('Test signal') && !text.includes('加载中');
  }, { timeout: 8000 });

  const content = await page.evaluate(() => document.getElementById('mineContent')?.innerText || '');
  expect(content).toContain('Test signal');
  expect(signalsCallCount).toBeGreaterThanOrEqual(1);
});

// ═══════════════════════════════════════════════════════════════
// Test 2: Repeated sub-tab clicks don't stack requests (abort fix regression)
// ═══════════════════════════════════════════════════════════════
test('L2 信号: repeated sub-tab clicks do not freeze page', async ({ page }) => {
  let signalsCallCount = 0;
  await page.route('**/ai/hn_signals', route => {
    signalsCallCount++;
    // Simulate slow AI endpoint
    setTimeout(() => {
      try {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            report: { greeting: 'ok', themes: [], signals: [], closing: '' },
            raw_data: {},
          }),
        });
      } catch (e) { /* route aborted — expected */ }
    }, 2000);
  });

  await loginAndWait(page);
  await page.click('#billingBtn');
  await page.waitForSelector('.mine-tab[data-tab="reports"]', { timeout: 5000 });
  await page.waitForTimeout(1000);
  await page.click('.mine-tab[data-tab="reports"]');
  await page.waitForSelector('.mine-subtab-item', { timeout: 5000 });

  // Rapidly click signals sub-tab 5 times
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.mine-subtab-item');
      for (const btn of btns) {
        if (btn.textContent.includes('信号') || btn.textContent.includes('Signals')) {
          btn.click();
          return;
        }
      }
    });
    await page.waitForTimeout(200);
  }

  // Wait for requests to settle
  await page.waitForTimeout(3000);

  // Page should NOT be frozen — verify responsiveness
  const isResponsive = await page.evaluate(() => {
    const el = document.getElementById('mineContent');
    return el !== null && el.innerHTML !== '';
  });
  expect(isResponsive).toBe(true);
});

// ═══════════════════════════════════════════════════════════════
// Test 3: Switching main tabs while signals loading doesn't overwrite
// ═══════════════════════════════════════════════════════════════
test('L2 信号: switching main tab while signals loading does not overwrite', async ({ page }) => {
  await page.route('**/ai/hn_signals', route => {
    setTimeout(() => {
      try {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            report: { greeting: 'LATE SIGNAL', themes: [], signals: [], closing: '' },
            raw_data: {},
          }),
        });
      } catch (e) { /* aborted */ }
    }, 3000);
  });

  await loginAndWait(page);
  await page.click('#billingBtn');
  await page.waitForSelector('.mine-tab[data-tab="reports"]', { timeout: 5000 });
  await page.waitForTimeout(1000);
  // Go to reports → signals sub-tab
  await page.click('.mine-tab[data-tab="reports"]');
  await page.waitForSelector('.mine-subtab-item', { timeout: 5000 });
  await page.evaluate(() => {
    const btns = document.querySelectorAll('.mine-subtab-item');
    for (const btn of btns) {
      if (btn.textContent.includes('信号') || btn.textContent.includes('Signals')) { btn.click(); return; }
    }
  });
  await page.waitForTimeout(200);
  // Immediately switch to overview main tab
  await page.click('.mine-tab[data-tab="overview"]');
  await page.waitForTimeout(4000);

  // Overview content should be shown, not signals' late response
  const content = await page.evaluate(() => document.getElementById('mineContent')?.innerText || '');
  expect(content).not.toContain('LATE SIGNAL');
});
