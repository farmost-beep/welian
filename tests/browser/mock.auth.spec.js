/**
 * Mock Clerk tests — verify frontend UI logic without real Clerk service.
 *
 * Injects a fake window.Clerk before page loads, then tests:
 * - Sign-in button toggles auth modal
 * - onAuthed updates UI (button text, nav visibility, billing button)
 * - onSignedOut resets UI
 * - getClerkToken returns session token
 * - mountClerkSignIn / mountClerkSignUp render without error
 */
import { test, expect } from '@playwright/test';

// Inject mock Clerk before page scripts run
const mockClerkScript = `
// Pre-define Sentry to avoid "Sentry is not defined" error
window.Sentry = { init(){}, captureException(){}, captureMessage(){} };

window.__mockUser = null;
window.__mockToken = 'mock-jwt-token-12345';
window.__mockSignInMounted = false;
window.__mockSignUpMounted = false;

// Set up Clerk mock immediately — before any ES module runs
window.Clerk = {
  loaded: true,  // pretend already loaded
  status: 'ready',
  user: null,
  session: null,
  async load(opts) {
    this.loaded = true;
    return this;
  },
  addListener(callback) {
    window.__clerkCallback = callback;
  },
  mountSignIn(container, opts) {
    container.innerHTML = '<div data-testid="clerk-signin">Mock Sign In Form</div>'
      + '<button data-testid="google-btn">Continue with Google</button>'
      + '<button data-testid="apple-btn">Continue with Apple</button>'
      + '<input data-testid="email-input" type="email" placeholder="Email" />'
      + '<button data-testid="email-submit">Continue</button>';
    window.__mockSignInMounted = true;
  },
  mountSignUp(container, opts) {
    container.innerHTML = '<div data-testid="clerk-signup">Mock Sign Up Form</div>'
      + '<input data-testid="signup-email" type="email" placeholder="Email" />';
    window.__mockSignUpMounted = true;
  },
  signOut() {
    this.user = null;
    this.session = null;
    if (window.__clerkCallback) window.__clerkCallback({ user: null });
  },
  async setActive({ session }) {
    // Simulate session set
  },
};

// Mock Clerk UI loader
window.loadClerkUI = async (key) => {
  window.__internal_ClerkUICtor = function() {};
};

// Simulate login: set user and fire callback
window.__simulateLogin = function(userInfo) {
  const user = userInfo || {
    id: 'user_test123',
    firstName: 'Test',
    primaryEmailAddress: { emailAddress: 'test@example.com' },
    primaryPhoneNumber: { phoneNumber: '+8613800138000' },
  };
  window.Clerk.user = user;
  window.Clerk.session = {
    getToken: async () => window.__mockToken,
    status: 'active',
  };
  if (window.__clerkCallback) window.__clerkCallback({ user });
};
`;

test.beforeEach(async ({ page }) => {
  // Collect console logs
  page.consoleLogs = [];
  page.on('console', msg => page.consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

  // Intercept Clerk CDN scripts — return empty JS so they don't overwrite our mock
  await page.route('**/clerk.browser.js*', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '// clerk mock — skipped' });
  });
  await page.route('**/ui.browser.js*', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '// clerk ui mock — skipped' });
  });
  // Intercept Sentry CDN — return stub that doesn't overwrite our pre-defined Sentry
  await page.route('**/sentry-cdn.com/**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '// sentry stub — skipped' });
  });

  // Add init script that runs before page scripts
  await page.addInitScript(mockClerkScript);

  // After DOM loads, re-assert our mock (index.html inline script may override loadClerkUI)
  await page.addInitScript(`
    // Override loadClerkUI after index.html's version — use a setter to intercept
    let _loadClerkUI = window.loadClerkUI;
    Object.defineProperty(window, 'loadClerkUI', {
      get: () => async (key) => {
        console.log('[MOCK] loadClerkUI called');
        window.__internal_ClerkUICtor = function() {};
        return true;
      },
      set: (v) => { /* ignore index.html's version */ },
      configurable: true,
    });
  `);
});

// Helper: wait for Clerk to be ready
async function waitForClerkReady(page) {
  await page.waitForFunction(() => {
    return window.clerkReady === true || (window.Clerk && window.Clerk.loaded);
  }, { timeout: 10000 });
}

test('sign-in button opens auth modal', async ({ page }) => {
  await page.goto('http://localhost:8899/index.html');
  // Wait for Clerk init to complete
  try {
    await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  } catch (e) {
    console.error('Console logs:', page.consoleLogs.join('\n'));
    throw e;
  }
  await page.waitForTimeout(500);

  // Click sign-in button
  await page.click('#authBtn');
  // Auth modal should be visible (has .show class)
  await expect(page.locator('#clerk-auth')).toHaveClass(/show/, { timeout: 5000 });
});

test('mountClerkSignIn renders form with email + social buttons', async ({ page }) => {
  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  // Open auth modal
  await page.click('#authBtn');
  // Wait for mountSignIn to be called
  await page.waitForFunction(() => window.__mockSignInMounted === true, { timeout: 10000 });

  // Clerk sign-in form should be mounted
  await expect(page.locator('[data-testid="clerk-signin"]')).toBeVisible();
  // Email input should be present
  await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
  // Google button should be present
  await expect(page.locator('[data-testid="google-btn"]')).toBeVisible();
  // Apple button should be present
  await expect(page.locator('[data-testid="apple-btn"]')).toBeVisible();
});

test('onAuthed updates UI after login', async ({ page }) => {
  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  // Simulate login
  await page.evaluate(() => window.__simulateLogin());

  // Auth button should show user name
  await expect(page.locator('#authBtn')).toContainText('Test', { timeout: 5000 });
  // Nav status should be visible
  await expect(page.locator('#navStatus')).toBeVisible();
  // Billing button should be visible
  await expect(page.locator('#billingBtn')).toBeVisible();
});

test('onSignedOut resets UI after logout', async ({ page }) => {
  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  // Login first
  await page.evaluate(() => window.__simulateLogin());
  await expect(page.locator('#authBtn')).toContainText('Test', { timeout: 5000 });

  // Click auth button to sign out (isAuthed → signOut path)
  await page.click('#authBtn');
  // Button should revert to "登录"
  await expect(page.locator('#authBtn')).toContainText(/登录|Sign in/i, { timeout: 5000 });
  // Nav status should be hidden
  await expect(page.locator('#navStatus')).not.toBeVisible();
});

test('getClerkToken returns session token after login', async ({ page }) => {
  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  // Login
  await page.evaluate(() => window.__simulateLogin());

  // Call getClerkToken via the module
  const token = await page.evaluate(async () => {
    const mod = await import('/modules/auth.js');
    return await mod.getClerkToken();
  });
  expect(token).toBe('mock-jwt-token-12345');
});

test('email login flow — type email and submit', async ({ page }) => {
  await page.goto('http://localhost:8899/index.html');
  await page.waitForFunction(() => window.__clerkCallback !== undefined, { timeout: 10000 });
  await page.waitForTimeout(500);

  // Open auth modal
  await page.click('#authBtn');
  await page.waitForFunction(() => window.__mockSignInMounted === true, { timeout: 10000 });

  // Type email
  await page.fill('[data-testid="email-input"]', 'user@example.com');
  // Click continue — mock form, just verify no crash
  await page.click('[data-testid="email-submit"]');
  await page.waitForTimeout(500);
  // Form should still be visible (mock doesn't actually log in)
  await expect(page.locator('[data-testid="clerk-signin"]')).toBeVisible();
});
