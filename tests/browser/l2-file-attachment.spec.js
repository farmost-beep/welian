/**
 * L2 File Attachment — image recognition does not go through agent WebSocket.
 *
 * Root cause: base64-encoded images exceed Cloudflare WebSocket 1MB message
 * limit, causing ws-close and "agent offline". Fix: file attachments always
 * go through cloud LLM via fetch (no WebSocket size limit).
 */
import { test, expect } from '@playwright/test';

const mockClerkScript = `
window.Sentry = { init(){}, captureException(){}, captureMessage(){} };
window.__mockToken = 'testuser:l2-file-attach';
window.Clerk = {
  loaded: true,
  status: 'ready',
  user: { id: 'testuser_fa', firstName: 'FA', primaryEmailAddress: { emailAddress: 'fa@test.com' } },
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
});

async function loginAndWait(page) {
  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    window.Clerk.user = { id: 'testuser_fa', firstName: 'FA', primaryEmailAddress: { emailAddress: 'fa@test.com' } };
    window.Clerk.session = { getToken: async () => window.__mockToken, status: 'active' };
    if (window.__clerkCallback) window.__clerkCallback({ user: window.Clerk.user });
  });

  await expect(page.locator('#input')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1000);
}

// ═══════════════════════════════════════════════════════════════
// Test 1: Image attachment goes to cloud LLM, not agent WebSocket
// ═══════════════════════════════════════════════════════════════

test('L2 图片: image attachment routes to cloud LLM via fetch, not agent WebSocket', async ({ page }) => {
  let chatCallBody = null;
  let chatCalled = false;

  page.route('**/ai/chat', route => {
    chatCalled = true;
    const body = route.request().postDataJSON();
    chatCallBody = body;
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ reply: '图片识别结果：这是一张风景照', usage: { input_tokens: 100, output_tokens: 20 } }),
    });
  });

  await loginAndWait(page);

  // Simulate file upload via the hidden file input
  await page.setInputFiles('#chatFileInput', {
    name: 'test.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
  });

  // Wait for file preview to appear
  await page.waitForFunction(
    () => {
      const preview = document.getElementById('chatFilePreview');
      return preview && preview.style.display !== 'none';
    },
    { timeout: 3000 }
  );

  // Type a message and send
  await page.fill('#input', '识别这张图片');
  await page.click('#sendBtn');

  // Wait for cloud LLM response
  await page.waitForFunction(
    () => {
      const body = document.getElementById('chatBody');
      return body && body.innerText.includes('图片识别结果');
    },
    { timeout: 15000 }
  );

  // Verify /ai/chat was called (cloud path), not agent WebSocket
  expect(chatCalled).toBe(true);

  // Verify the request body contains multimodal content (image)
  if (chatCallBody && chatCallBody.messages) {
    const lastMsg = chatCallBody.messages[chatCallBody.messages.length - 1];
    // Multimodal content is an array with image block
    const hasImage = Array.isArray(lastMsg.content) &&
      lastMsg.content.some(c => c.type === 'image' || (c.source && c.source.type === 'base64'));
    expect(hasImage).toBe(true);
  }

  // Should NOT have "agent offline" message
  const chatText = await page.evaluate(() => document.getElementById('chatBody').innerText);
  expect(chatText).not.toContain('agent offline');
  expect(chatText).not.toContain('Offline');
});

// ═══════════════════════════════════════════════════════════════
// Test 2: File preview shows filename
// ═══════════════════════════════════════════════════════════════

test('L2 图片: file preview shows filename after upload', async ({ page }) => {
  await loginAndWait(page);

  await page.setInputFiles('#chatFileInput', {
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
  });

  await page.waitForFunction(
    () => {
      const name = document.getElementById('chatFileName');
      return name && name.textContent.includes('photo.jpg');
    },
    { timeout: 3000 }
  );

  const fileName = await page.evaluate(() => document.getElementById('chatFileName').textContent);
  expect(fileName).toContain('photo.jpg');
});

// ═══════════════════════════════════════════════════════════════
// Test 3: File over 10MB is rejected
// ═══════════════════════════════════════════════════════════════

test('L2 图片: file over 10MB is rejected with alert', async ({ page }) => {
  await loginAndWait(page);

  // Create a buffer > 10MB
  const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 0);

  // Listen for dialog
  let dialogMessage = '';
  page.on('dialog', dialog => {
    dialogMessage = dialog.message();
    dialog.dismiss();
  });

  await page.setInputFiles('#chatFileInput', {
    name: 'huge.png',
    mimeType: 'image/png',
    buffer: largeBuffer,
  });

  await page.waitForTimeout(1000);

  // Should have triggered alert about file size
  expect(dialogMessage).toContain('10MB');

  // File preview should NOT be visible
  const previewVisible = await page.evaluate(() => {
    const preview = document.getElementById('chatFilePreview');
    return preview && preview.style.display !== 'none';
  });
  expect(previewVisible).toBe(false);
});

// ═══════════════════════════════════════════════════════════════
// Test 4: Text without file still works (no regression)
// ═══════════════════════════════════════════════════════════════

test('L2 图片: text-only message still works (no regression)', async ({ page }) => {
  page.route('**/ai/chat', route => {
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ reply: '纯文本回复', usage: { input_tokens: 10, output_tokens: 5 } }),
    });
  });

  await loginAndWait(page);
  await page.fill('#input', '普通文本消息');
  await page.click('#sendBtn');

  await page.waitForFunction(
    () => {
      const body = document.getElementById('chatBody');
      return body && body.innerText.includes('纯文本回复');
    },
    { timeout: 15000 }
  );
});
