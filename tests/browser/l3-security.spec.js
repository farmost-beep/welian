/**
 * L3 Security tests — XSS prevention in chat and contact rendering.
 *
 * Verifies that user-provided content containing HTML/script tags is escaped
 * and does not execute in the browser. Tests both chat messages and contact
 * names rendered in the Mine tab.
 */
import { test, expect } from '@playwright/test';

const mockClerkScript = `
window.Sentry = { init(){}, captureException(){}, captureMessage(){} };
window.__mockToken = 'testuser:l3-xss';
window.Clerk = {
  loaded: true,
  status: 'ready',
  user: { id: 'testuser_l3', firstName: 'L3', primaryEmailAddress: { emailAddress: 'l3@test.com' } },
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

// Contact with XSS payload in name
const xssContacts = [
  {
    id: 'c-xss-1',
    name: '<script>alert("xss")</script>',
    nature: 'leverage',
    relation: '朋友',
    company: '<img src=x onerror=alert(1)>',
  },
  {
    id: 'c-xss-2',
    name: '老许',
    nature: 'leverage',
    relation: '合作者',
    company: '腾讯',
  },
];

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
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ contacts: xssContacts }),
    });
  });

  page.route('**/data/pull', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contacts: xssContacts,
        todos: [],
        timeline: [],
        pulled_at: new Date().toISOString(),
      }),
    });
  });

  page.route('**/ai/billing', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ plan: 'free', allowance: 100, remaining: 100, used: 0 }),
    });
  });

  page.route('**/data/sessions', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  page.route('**/ai/config', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ mode: 'cloud', dataPriority: ['cloud_kv'] }),
    });
  });
});

async function loginAndWait(page) {
  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    window.Clerk.user = { id: 'testuser_l3', firstName: 'L3', primaryEmailAddress: { emailAddress: 'l3@test.com' } };
    window.Clerk.session = { getToken: async () => window.__mockToken, status: 'active' };
    if (window.__clerkCallback) window.__clerkCallback({ user: window.Clerk.user });
  });

  await expect(page.locator('#input')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1000);
}

// ═══════════════════════════════════════════════════════════════
// XSS in contact names — Mine tab rendering
// ═══════════════════════════════════════════════════════════════

test('L3 XSS: contact name with <script> tag does not execute', async ({ page }) => {
  await loginAndWait(page);

  // Open Mine tab
  await page.click('#billingBtn');
  await page.waitForTimeout(2000);

  // Check that no alert dialog was triggered
  // (If the script executed, Playwright would fire a 'dialog' event)
  let dialogFired = false;
  page.on('dialog', dialog => {
    dialogFired = true;
    dialog.dismiss();
  });

  // Navigate to contacts subtab if available
  const contactsTab = page.locator('[data-tab="contacts"]');
  if (await contactsTab.isVisible().catch(() => false)) {
    await contactsTab.click();
    await page.waitForTimeout(1000);
  }

  // Wait a bit for any potential script execution
  await page.waitForTimeout(2000);

  // No dialog should have fired
  expect(dialogFired).toBe(false);

  // The XSS payload should NOT create a script element in the DOM
  const hasScriptElement = await page.evaluate(() => {
    return document.querySelector('script:not([src])') !== null &&
           document.body.innerHTML.indexOf('<script>alert') !== -1;
  });
  // escapeHtml should have converted <script> to &lt;script&gt;
  // So there should be no actual script element from the contact name
  expect(hasScriptElement).toBe(false);
});

test('L3 XSS: contact company with onerror handler does not execute', async ({ page }) => {
  await loginAndWait(page);

  let dialogFired = false;
  page.on('dialog', dialog => {
    dialogFired = true;
    dialog.dismiss();
  });

  // Open Mine tab to render contacts
  await page.click('#billingBtn');
  await page.waitForTimeout(2000);

  // Navigate to contacts
  const contactsTab = page.locator('[data-tab="contacts"]');
  if (await contactsTab.isVisible().catch(() => false)) {
    await contactsTab.click();
    await page.waitForTimeout(1000);
  }

  // Check for the contact with XSS in company field
  // Open contact detail for the XSS contact
  const xssContact = page.locator('text=老许');
  if (await xssContact.isVisible().catch(() => false)) {
    await xssContact.first().click();
    await page.waitForTimeout(1000);
  }

  await page.waitForTimeout(2000);
  expect(dialogFired).toBe(false);
});

// ═══════════════════════════════════════════════════════════════
// XSS in chat messages — AI reply with script tags
// ═══════════════════════════════════════════════════════════════

test('L3 XSS: AI reply containing <script> does not execute in chat', async ({ page }) => {
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
        reply: '<script>alert("xss-from-ai")</script>好的，记下了',
        usage: { input_tokens: 50, output_tokens: 20 },
      }),
    });
  });

  await loginAndWait(page);

  let dialogFired = false;
  page.on('dialog', dialog => {
    dialogFired = true;
    dialog.dismiss();
  });

  await page.fill('#input', '记一下测试');
  await page.click('#sendBtn');

  // Wait for response to render
  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      return log && log.innerText.length > 10;
    },
    { timeout: 15000 }
  );

  await page.waitForTimeout(2000);

  // No dialog should have fired
  expect(dialogFired).toBe(false);

  // The chat body should not contain a script element
  const hasScript = await page.evaluate(() => {
    const chatBody = document.getElementById('chatBody');
    if (!chatBody) return false;
    return chatBody.querySelector('script') !== null;
  });
  expect(hasScript).toBe(false);
});

test('L3 XSS: AI reply with img onerror does not execute', async ({ page }) => {
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
        reply: '<img src=x onerror=alert("xss-img")> 这是回复',
        usage: { input_tokens: 50, output_tokens: 20 },
      }),
    });
  });

  await loginAndWait(page);

  let dialogFired = false;
  page.on('dialog', dialog => {
    dialogFired = true;
    dialog.dismiss();
  });

  await page.fill('#input', '测试');
  await page.click('#sendBtn');

  await page.waitForFunction(
    () => {
      const log = document.getElementById('chatBody');
      return log && log.innerText.length > 5;
    },
    { timeout: 15000 }
  );

  await page.waitForTimeout(2000);
  expect(dialogFired).toBe(false);
});
