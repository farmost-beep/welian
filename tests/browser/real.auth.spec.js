/**
 * Real Clerk tests — verify actual authentication flows.
 *
 * Uses @clerk/testing/playwright to simulate login without real OAuth redirects.
 * Requires CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY env vars.
 * clerkSetup() in global.setup.js auto-generates the testing token.
 *
 * Tests:
 * - Email sign-in (server-side token, bypasses verification)
 * - Sign-out
 * - Session persistence across page reload
 * - getClerkToken returns valid JWT
 */
import { test, expect } from '@playwright/test';
import { clerk } from '@clerk/testing/playwright';

const hasClerkKeys = !!(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

// Test instance publishable key (overrides live key in state.js for testing)
const TEST_PK = process.env.CLERK_PUBLISHABLE_KEY || '';

test.describe('Real Clerk authentication', () => {
  test.beforeEach(async ({ page }) => {
    if (!hasClerkKeys) {
      test.skip(true, 'CLERK_PUBLISHABLE_KEY/CLERK_SECRET_KEY not set');
    }

    // Intercept Sentry CDN
    await page.route('**/sentry-cdn.com/**', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.Sentry={init(){},captureException(){}};' });
    });

    // Override publishable key in index.html (Clerk CDN script data attribute)
    await page.route('**/index.html', route => {
      return route.fetch().then(response => {
        return response.text().then(text => {
          const modified = text.replace(
            /data-clerk-publishable-key="[^"]*"/g,
            `data-clerk-publishable-key="${TEST_PK}"`
          );
          return route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: modified,
          });
        });
      });
    });

    // Override the publishable key in state.js to use test instance
    await page.route('**/modules/state.js', route => {
      return route.fetch().then(response => {
        return response.text().then(text => {
          const modified = text.replace(
            /CLERK_PUBLISHABLE_KEY\s*=\s*['"][^'"]*['"]/,
            `CLERK_PUBLISHABLE_KEY = '${TEST_PK}'`
          );
          return route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: modified,
          });
        });
      });
    });
  });

  test('email sign-in: user can log in with email', async ({ page }) => {
    await page.goto('http://localhost:8899/index.html');
    await page.waitForTimeout(3000);

    // Open auth modal
    await page.click('#authBtn');
    await page.waitForTimeout(2000);

    // Sign in using Clerk testing helper (server-side token, bypasses verification)
    await clerk.signIn({
      page,
      emailAddress: 'test+e2e@welian.app',
    });

    // Auth button should show user info
    await expect(page.locator('#authBtn')).not.toContainText('登录', { timeout: 10000 });
    // Nav status should be visible
    await expect(page.locator('#navStatus')).toBeVisible({ timeout: 10000 });
  });

  test('sign-out: logged-in user can sign out', async ({ page }) => {
    await page.goto('http://localhost:8899/index.html');
    await page.waitForTimeout(3000);

    // Sign in first
    await clerk.signIn({
      page,
      emailAddress: 'test+signout@welian.app',
    });
    await expect(page.locator('#navStatus')).toBeVisible({ timeout: 10000 });

    // Click auth button to sign out
    await page.click('#authBtn');
    await expect(page.locator('#authBtn')).toContainText(/登录|Sign in/i, { timeout: 5000 });
    await expect(page.locator('#navStatus')).not.toBeVisible();
  });

  test('session persists after page reload', async ({ page }) => {
    await page.goto('http://localhost:8899/index.html');
    await page.waitForTimeout(3000);

    // Sign in
    await clerk.signIn({
      page,
      emailAddress: 'test+persist@welian.app',
    });
    await expect(page.locator('#navStatus')).toBeVisible({ timeout: 10000 });

    // Reload page
    await page.reload();
    await page.waitForTimeout(3000);

    // Should still be logged in (Clerk session persists in cookie/localStorage)
    await expect(page.locator('#navStatus')).toBeVisible({ timeout: 10000 });
  });

  test('getClerkToken returns valid JWT after login', async ({ page }) => {
    await page.goto('http://localhost:8899/index.html');
    await page.waitForTimeout(3000);

    await clerk.signIn({
      page,
      emailAddress: 'test+token@welian.app',
    });
    await expect(page.locator('#navStatus')).toBeVisible({ timeout: 10000 });

    // Get token via module
    const token = await page.evaluate(async () => {
      const mod = await import('/modules/auth.js');
      return await mod.getClerkToken();
    });
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(20); // JWT should be long
  });
});
