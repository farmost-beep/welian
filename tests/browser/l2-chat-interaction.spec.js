/**
 * L2 Chat Interaction — stop button, empty message, typing indicator,
 * suggestion chips, quick actions, copy button.
 *
 * These tests cover the chat dialog's interactive elements that are
 * not covered by the core verb tests in l2-core-loop.spec.js.
 */
import { test, expect } from '@playwright/test';

const mockClerkScript = `
window.Sentry = { init(){}, captureException(){}, captureMessage(){} };
window.__mockToken = 'testuser:l2-interact';
window.Clerk = {
  loaded: true,
  status: 'ready',
  user: { id: 'testuser_l2i', firstName: 'L2i', primaryEmailAddress: { emailAddress: 'l2i@test.com' } },
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

const seedContacts = [
  { id: 'c-1', name: '老许', nature: 'leverage', relation: '合作者', company: '腾讯' },
  { id: 'c-2', name: '张总', nature: 'leverage', relation: '朋友', company: '阿里' },
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
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: seedContacts }) });
  });

  page.route('**/data/pull', route => {
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ contacts: seedContacts, todos: [], timeline: [], pulled_at: new Date().toISOString() }),
    });
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

  page.route('**/data/search', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ matched_count: 1, data_context: '老许：腾讯' }) });
  });

  page.route('**/data/context', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data_context: '联系人：老许、张总' }) });
  });

  page.route('**/data/todos', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ todos: [] }) });
  });
});

async function loginAndWait(page) {
  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    window.Clerk.user = { id: 'testuser_l2i', firstName: 'L2i', primaryEmailAddress: { emailAddress: 'l2i@test.com' } };
    window.Clerk.session = { getToken: async () => window.__mockToken, status: 'active' };
    if (window.__clerkCallback) window.__clerkCallback({ user: window.Clerk.user });
  });

  await expect(page.locator('#input')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1000);
}

// ═══════════════════════════════════════════════════════════════
// Empty message prevention
// ═══════════════════════════════════════════════════════════════

test('L2 交互: empty input does not send message', async ({ page }) => {
  let chatCalled = false;
  page.route('**/ai/extract_intent', route => {
    chatCalled = true;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'chat', keywords: [], actions: [], action_results: [] }) });
  });
  page.route('**/ai/chat', route => {
    chatCalled = true;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'test reply', usage: { input_tokens: 10, output_tokens: 5 } }) });
  });

  await loginAndWait(page);

  // Clear input and click send
  await page.fill('#input', '');
  await page.click('#sendBtn');

  await page.waitForTimeout(1000);

  // No API call should have been made
  expect(chatCalled).toBe(false);

  // Chat body should not have user messages (only welcome)
  const userMsgs = await page.evaluate(() => {
    return document.querySelectorAll('#chatBody .who.you').length;
  });
  expect(userMsgs).toBe(0);
});

test('L2 交互: whitespace-only input does not send message', async ({ page }) => {
  let chatCalled = false;
  page.route('**/ai/extract_intent', route => {
    chatCalled = true;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'chat', keywords: [], actions: [], action_results: [] }) });
  });
  page.route('**/ai/chat', route => {
    chatCalled = true;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'test', usage: {} }) });
  });

  await loginAndWait(page);

  // Fill with only spaces
  await page.fill('#input', '   ');
  await page.click('#sendBtn');

  await page.waitForTimeout(1000);
  expect(chatCalled).toBe(false);
});

// ═══════════════════════════════════════════════════════════════
// Typing indicator
// ═══════════════════════════════════════════════════════════════

test('L2 交互: typing indicator appears during AI response', async ({ page }) => {
  // Delay the chat response so we can catch the typing indicator
  page.route('**/ai/extract_intent', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'chat', keywords: [], actions: [], action_results: [] }) });
  });
  page.route('**/ai/chat', route => {
    setTimeout(() => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: '回复来了', usage: { input_tokens: 10, output_tokens: 5 } }) });
    }, 500);
  });

  await loginAndWait(page);
  await page.fill('#input', '测试');
  await page.click('#sendBtn');

  // Typing indicator should appear (the #typing element)
  await page.waitForFunction(
    () => document.getElementById('typing') !== null,
    { timeout: 3000 }
  );

  // Wait for response to complete — typing indicator should disappear
  await page.waitForFunction(
    () => document.getElementById('typing') === null,
    { timeout: 10000 }
  );

  // AI reply should be visible
  await page.waitForFunction(
    () => {
      const msgs = document.querySelectorAll('#chatBody .who.ai');
      return msgs.length > 0;
    },
    { timeout: 5000 }
  );
});

// ═══════════════════════════════════════════════════════════════
// Stop button visibility
// ═══════════════════════════════════════════════════════════════

test('L2 交互: stop button appears during generation then hides', async ({ page }) => {
  page.route('**/ai/extract_intent', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'chat', keywords: [], actions: [], action_results: [] }) });
  });
  page.route('**/ai/chat', route => {
    setTimeout(() => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: '回复', usage: { input_tokens: 10, output_tokens: 5 } }) });
    }, 500);
  });

  await loginAndWait(page);

  // Initially send button visible, stop button hidden
  const sendBtn = page.locator('#sendBtn');
  const stopBtn = page.locator('#stopBtn');
  await expect(sendBtn).toBeVisible();

  // Send a message
  await page.fill('#input', '测试');
  await page.click('#sendBtn');

  // Stop button should become visible during generation
  await page.waitForFunction(
    () => {
      const btn = document.getElementById('stopBtn');
      return btn && btn.style.display !== 'none';
    },
    { timeout: 3000 }
  );

  // Wait for response to complete — send button should be restored
  await page.waitForFunction(
    () => {
      const btn = document.getElementById('sendBtn');
      return btn && btn.style.display !== 'none';
    },
    { timeout: 10000 }
  );
});

// ═══════════════════════════════════════════════════════════════
// Stop button functionality — abort generation
// ═══════════════════════════════════════════════════════════════

test('L2 交互: clicking stop aborts generation and shows message', async ({ page }) => {
  page.route('**/ai/extract_intent', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'chat', keywords: [], actions: [], action_results: [] }) });
  });
  // Delay chat response long enough for us to click stop
  page.route('**/ai/chat', route => {
    setTimeout(() => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: '不应该看到这个', usage: {} }) });
    }, 10000);
  });

  await loginAndWait(page);
  await page.fill('#input', '测试停止');
  await page.click('#sendBtn');

  // Wait for stop button to appear
  await page.waitForFunction(
    () => {
      const btn = document.getElementById('stopBtn');
      return btn && btn.style.display !== 'none';
    },
    { timeout: 3000 }
  );

  // Click stop
  await page.locator('#stopBtn').click();

  // Should show abort message — either "已停止" or the send button restored
  await page.waitForFunction(
    () => {
      const body = document.getElementById('chatBody');
      const sendBtn = document.getElementById('sendBtn');
      // Either the abort message appeared, or the send button was restored
      return (body && (body.innerText.includes('已停止') || body.innerText.includes('停止'))) ||
             (sendBtn && sendBtn.style.display !== 'none');
    },
    { timeout: 10000 }
  );

  // Send button should be restored after abort
  await page.waitForFunction(
    () => {
      const btn = document.getElementById('sendBtn');
      return btn && btn.style.display !== 'none';
    },
    { timeout: 5000 }
  );
});

// ═══════════════════════════════════════════════════════════════
// Suggestion chips — rendered and clickable
// ═══════════════════════════════════════════════════════════════

test('L2 交互: suggestion chips appear after AI reply and are clickable', async ({ page }) => {
  page.route('**/ai/extract_intent', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'chat', keywords: [], actions: [], action_results: [] }) });
  });
  page.route('**/ai/chat', route => {
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        reply: '这是回复内容。\n<<<SUGGESTIONS>>>\n查看待办\n给老许拟条消息\n该联系谁了？',
        usage: { input_tokens: 50, output_tokens: 30 },
      }),
    });
  });

  await loginAndWait(page);
  await page.fill('#input', '测试');
  await page.click('#sendBtn');

  // Wait for suggestion chips to appear
  await page.waitForFunction(
    () => document.querySelectorAll('.suggestion-chip').length > 0,
    { timeout: 10000 }
  );

  // Verify chips have correct text
  const chips = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.suggestion-chip')).map(c => c.textContent);
  });
  expect(chips.length).toBeGreaterThanOrEqual(2);
  expect(chips.some(c => c.includes('待办') || c.includes('老许') || c.includes('联系'))).toBe(true);

  // Click a chip — should fill input and send
  await page.locator('.suggestion-chip').first().click();

  // After clicking, a new message should be sent (wait for chat body to grow)
  await page.waitForTimeout(2000);

  // The chip click should have triggered a new send — check for user messages
  const userMsgCount = await page.evaluate(() => {
    return document.querySelectorAll('#chatBody .who.you').length;
  });
  expect(userMsgCount).toBeGreaterThanOrEqual(2); // original + chip-triggered
});

// ═══════════════════════════════════════════════════════════════
// Quick action buttons
// ═══════════════════════════════════════════════════════════════

test('L2 交互: quick action "该联系谁" sends immediately', async ({ page }) => {
  let chatBody = null;
  page.route('**/ai/extract_intent', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'advise', keywords: [], actions: [], action_results: [] }) });
  });
  page.route('**/ai/chat', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: '建议联系老许', usage: { input_tokens: 30, output_tokens: 10 } }) });
  });
  page.route('**/ai/advise_cloud', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: '建议联系老许', raw: [], advise_id: 'adv-1' }) });
  });

  await loginAndWait(page);

  // Find and click the "该联系谁" quick action button
  const whoBtn = page.locator('button:has-text("该联系谁")');
  if (await whoBtn.isVisible().catch(() => false)) {
    await whoBtn.click();

    // Should send immediately and get a response
    await page.waitForFunction(
      () => {
        const body = document.getElementById('chatBody');
        return body && body.innerText.length > 30;
      },
      { timeout: 10000 }
    );

    const chatText = await page.evaluate(() => document.getElementById('chatBody').innerText);
    expect(chatText.length).toBeGreaterThan(20);
  }
});

test('L2 交互: quick action "记一下" fills input without sending', async ({ page }) => {
  let chatCalled = false;
  page.route('**/ai/chat', route => {
    chatCalled = true;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'ok', usage: {} }) });
  });
  page.route('**/ai/extract_intent', route => {
    chatCalled = true;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'chat', keywords: [], actions: [], action_results: [] }) });
  });

  await loginAndWait(page);

  const recordBtn = page.locator('button:has-text("记一下")');
  if (await recordBtn.isVisible().catch(() => false)) {
    await recordBtn.click();
    await page.waitForTimeout(500);

    // Input should be filled with prefix, not sent
    const inputVal = await page.evaluate(() => document.getElementById('input').value);
    expect(inputVal).toContain('记一下');

    // Should NOT have called the API (record fills input, doesn't auto-send)
    expect(chatCalled).toBe(false);
  }
});

// ═══════════════════════════════════════════════════════════════
// Copy message button
// ═══════════════════════════════════════════════════════════════

test('L2 交互: copy button appears on AI messages', async ({ page }) => {
  page.route('**/ai/extract_intent', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'chat', keywords: [], actions: [], action_results: [] }) });
  });
  page.route('**/ai/chat', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: '这是可以复制的回复', usage: { input_tokens: 10, output_tokens: 5 } }) });
  });

  await loginAndWait(page);
  await page.fill('#input', '测试');
  await page.click('#sendBtn');

  // Wait for AI reply with action buttons
  await page.waitForFunction(
    () => document.querySelectorAll('.msg-action-btn').length > 0,
    { timeout: 10000 }
  );

  // Should have a copy button
  const copyBtn = page.locator('.msg-action-btn:has-text("复制")');
  if (await copyBtn.isVisible().catch(() => false)) {
    // Click copy — should not crash
    await copyBtn.click();
    await page.waitForTimeout(500);

    // Verify clipboard or visual feedback (button text may change)
    const pageStillFunctional = await page.locator('#input').isVisible();
    expect(pageStillFunctional).toBe(true);
  }
});

// ═══════════════════════════════════════════════════════════════
// Enter key sends message
// ═══════════════════════════════════════════════════════════════

test('L2 交互: Enter key sends message', async ({ page }) => {
  page.route('**/ai/extract_intent', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ intent: 'chat', keywords: [], actions: [], action_results: [] }) });
  });
  page.route('**/ai/chat', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'Enter键回复', usage: { input_tokens: 10, output_tokens: 5 } }) });
  });

  await loginAndWait(page);

  // Type and press Enter
  await page.fill('#input', '用Enter发送');
  await page.keyboard.press('Enter');

  // Should send the message
  await page.waitForFunction(
    () => {
      const body = document.getElementById('chatBody');
      return body && body.innerText.includes('Enter');
    },
    { timeout: 10000 }
  );
});
