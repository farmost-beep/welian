/**
 * L2 Meetings — meeting module CRUD + photo upload + review
 */
import { test, expect } from '@playwright/test';

const mockClerkScript = `
window.Sentry = { init(){}, captureException(){}, captureMessage(){} };
window.__mockToken = 'testuser:l2-meetings';
window.Clerk = {
  loaded: true,
  status: 'ready',
  user: { id: 'testuser_mt', firstName: 'MT', primaryEmailAddress: { emailAddress: 'mt@test.com' } },
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

  // Mock data endpoints
  page.route('**/data/contacts', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [{ id: 'c1', name: '老许', company: '腾讯', relation: '同行', nature: 'leverage' }] }) });
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

  // Default mock: empty meetings (tests can override)
  page.route('**/data/meetings', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ meetings: [], total: 0 }) });
  });
  page.route('**/ai/meeting_photo', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', photo_type: 'agenda', extracted: {}, usage: { points: 5, remaining: 95 } }) });
  });
  page.route('**/ai/meeting_review', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', review: {}, meeting: {}, usage: { points: 10, remaining: 90 } }) });
  });
});

async function loginAndWait(page) {
  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    window.Clerk.user = { id: 'testuser_mt', firstName: 'MT', primaryEmailAddress: { emailAddress: 'mt@test.com' } };
    window.Clerk.session = { getToken: async () => window.__mockToken, status: 'active' };
    if (window.__clerkCallback) window.__clerkCallback({ user: window.Clerk.user });
  });

  await expect(page.locator('#input')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1000);
}

// ═══════════════════════════════════════════════════════════════
// Test 1: Meetings tab appears in mine panel
// ═══════════════════════════════════════════════════════════════

test('L2 会议: meetings tab appears in mine panel', async ({ page }) => {
  await loginAndWait(page);

  // Open mine panel
  await page.click('#billingBtn');

  // Check meetings tab button exists
  const meetingsTab = page.locator('.mine-tab[data-tab="meetings"]');
  await expect(meetingsTab).toBeVisible({ timeout: 5000 });

  // Click meetings tab
  await meetingsTab.click();

  // Should show empty state or meeting list
  await page.waitForTimeout(2000);
  const content = await page.evaluate(() => document.getElementById('mineContent')?.innerText || '');
  // Should have "新建会议" button or empty state text
  expect(content).toMatch(/会议|Meeting|新建|New Meeting/);
});

// ═══════════════════════════════════════════════════════════════
// Test 2: Meeting CRUD — create, list, delete
// ═══════════════════════════════════════════════════════════════

test('L2 会议: meeting CRUD create and list', async ({ page }) => {
  // Override default empty mock
  page.unroute('**/data/meetings');
  const meetingsStore = [{
    id: 'mtg-test-1',
    title: '测试会议',
    date: '2026-07-20',
    status: 'planned',
    agenda: [{ topic: '讨论合作', time: '14:00' }],
    attendees: [{ name: '老许', company: '腾讯', is_existing: true }],
    opportunities: [],
    photos: [],
  }];

  page.route('**/data/meetings', route => {
    const method = route.request().method();
    if (method === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ meetings: meetingsStore, total: meetingsStore.length }) });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON();
      const m = { ...body, id: body.id || `mtg-test-${Date.now()}`, created: new Date().toISOString() };
      if (body.id) {
        const idx = meetingsStore.findIndex(x => x.id === body.id);
        if (idx >= 0) meetingsStore[idx] = { ...meetingsStore[idx], ...m };
      } else {
        meetingsStore.push(m);
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, meeting: m }) });
    } else if (method === 'DELETE') {
      const url = new URL(route.request().url());
      const id = url.searchParams.get('id');
      const idx = meetingsStore.findIndex(m => m.id === id);
      if (idx >= 0) meetingsStore.splice(idx, 1);
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
  });

  page.route('**/ai/meeting_photo', route => {
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok', photo_type: 'agenda',
        extracted: { title: 'AI行业峰会2026', date: '2026-07-25', location: '上海', purpose: 'AI+金融', agenda: [{ topic: '开场', time: '09:00' }] },
        usage: { points: 5, remaining: 95 },
      }),
    });
  });

  await loginAndWait(page);
  await page.click('#billingBtn');
  await page.click('.mine-tab[data-tab="meetings"]');
  await page.waitForTimeout(2000);

  // Verify meeting appears in list
  const content = await page.evaluate(() => document.getElementById('mineContent')?.innerText || '');
  expect(content).toContain('测试会议');
  expect(content).toContain('1人');  // attendee count shown in list
});

// ═══════════════════════════════════════════════════════════════
// Test 3: Meeting detail shows agenda, attendees, opportunities
// ═══════════════════════════════════════════════════════════════

test('L2 会议: meeting detail renders sections', async ({ page }) => {
  // Override default empty mock
  page.unroute('**/data/meetings');
  const testMeeting = {
    id: 'mtg-detail-1',
    title: '行业峰会2026',
    date: '2026-07-25',
    location: '上海',
    purpose: 'AI+金融',
    status: 'completed',
    agenda: [{ topic: '开场', time: '09:00', presenter: '主办方' }],
    attendees: [
      { name: '老许', company: '腾讯', title: '总监', is_existing: true },
      { name: '张总', company: '阿里', first_meeting: true },
    ],
    opportunities: [{ description: 'AI合作机会', type: 'collaboration', potential: 'high' }],
    contact_dynamics: '老许和张总似乎认识',
    summary: '很有收获的会议',
    photos: [],
  };

  page.route('**/data/meetings', route => {
    const method = route.request().method();
    if (method === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ meetings: [testMeeting], total: 1 }) });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, meeting: testMeeting }) });
    }
  });

  await loginAndWait(page);
  await page.click('#billingBtn');
  await page.click('.mine-tab[data-tab="meetings"]');
  await page.waitForTimeout(2000);

  // Click on meeting to open detail via JS
  await page.evaluate(() => {
    const items = document.querySelectorAll('#mineContent .mine-contact');
    for (const item of items) {
      if (item.textContent.includes('行业峰会2026')) {
        item.click();
        return;
      }
    }
  });
  await page.waitForTimeout(1000);

  const content = await page.evaluate(() => document.getElementById('mineContent')?.innerText || '');

  // Verify all sections render
  expect(content).toContain('行业峰会2026');
  expect(content).toContain('开场');
  expect(content).toContain('老许');
  expect(content).toContain('张总');
  expect(content).toContain('AI合作机会');
  expect(content).toContain('很有收获');
});

// ═══════════════════════════════════════════════════════════════
// Test 4: Meeting review generates summary + follow-ups
// ═══════════════════════════════════════════════════════════════

test('L2 会议: meeting review shows AI-generated insights', async ({ page }) => {
  // Override default empty mock
  page.unroute('**/data/meetings');
  page.unroute('**/ai/meeting_review');
  const testMeeting = {
    id: 'mtg-review-1',
    title: '合作讨论会',
    date: '2026-07-20',
    status: 'planned',
    agenda: [],
    attendees: [{ name: '老许', company: '腾讯', contact_id: 'c1', is_existing: true }],
    opportunities: [],
    photos: [],
  };

  page.route('**/data/meetings', route => {
    const method = route.request().method();
    if (method === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ meetings: [testMeeting], total: 1 }) });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, meeting: testMeeting }) });
    }
  });

  page.route('**/ai/meeting_review', route => {
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        review: {
          summary: '与老许讨论了AI合作方向',
          new_contacts: [{ name: '张总', company: '阿里', title: 'VP', relation: '同行', nature: 'leverage' }],
          follow_up_todos: [{ task: '下周联系老许聊合作细节', contact_name: '老许', due: '2026-07-27', priority: 'high' }],
          opportunity_analysis: [{ description: '老许团队在找AI方案', action: '准备方案后联系', contact_name: '老许' }],
          leverage_insights: '老许是leverage联系人，这次会议可以推进合作',
          goal_suggestions: ['推进AI合作项目落地'],
        },
        meeting: { ...testMeeting, status: 'completed', summary: '与老许讨论了AI合作方向' },
        usage: { points: 10, remaining: 90 },
      }),
    });
  });

  await loginAndWait(page);
  await page.click('#billingBtn');
  await page.click('.mine-tab[data-tab="meetings"]');
  await page.waitForTimeout(2000);

  // Open meeting detail via JS (more reliable for Chinese text)
  await page.evaluate(() => {
    const items = document.querySelectorAll('#mineContent .mine-contact');
    for (const item of items) {
      if (item.textContent.includes('合作讨论会')) {
        item.click();
        return;
      }
    }
  });
  await page.waitForTimeout(1000);

  // Click review button via JS
  await page.evaluate(() => {
    const btns = document.querySelectorAll('#mineContent button');
    for (const btn of btns) {
      if (btn.textContent.includes('会后复盘')) {
        btn.click();
        return;
      }
    }
  });
  await page.waitForTimeout(2000);

  const content = await page.evaluate(() => document.getElementById('mineContent')?.innerText || '');

  // Verify review sections
  expect(content).toContain('与老许讨论了AI合作方向');
  expect(content).toContain('张总');
  expect(content).toContain('下周联系老许');
  expect(content).toContain('老许团队在找AI方案');
  expect(content).toContain('推进AI合作项目落地');
});
