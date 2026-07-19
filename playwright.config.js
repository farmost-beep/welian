/**
 * Playwright config for browser E2E tests.
 *
 * Two test projects:
 * 1. mock-clerk  — mock window.Clerk, test UI logic (fast, no external deps)
 * 2. real-clerk  — real Clerk with testing token (needs CLERK_SECRET_KEY)
 */
import { defineConfig, devices } from '@playwright/test';

const hasClerkKeys = !!(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  retries: 0,
  // Global setup only if Clerk keys are available (auto-generates testing token)
  globalSetup: hasClerkKeys ? './tests/browser/global.setup.js' : undefined,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'mock-clerk',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'mock.*.spec.js',
    },
    {
      name: 'real-clerk',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'real.*.spec.js',
    },
  ],
  webServer: {
    command: 'python3 -m http.server 8899 --directory public',
    port: 8899,
    reuseExistingServer: true,
    timeout: 10000,
  },
});
