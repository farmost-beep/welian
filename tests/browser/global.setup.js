/**
 * Global setup for Clerk testing.
 * 1. Calls clerkSetup() to auto-generate a Testing Token
 * 2. Creates test users via Clerk Backend API (if they don't exist)
 *
 * Requires CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY env vars.
 */
import { clerkSetup } from '@clerk/testing/playwright';

const TEST_USERS = [
  'test+e2e@welian.app',
  'test+signout@welian.app',
  'test+persist@welian.app',
  'test+token@welian.app',
];

async function ensureTestUsers() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return;

  for (const email of TEST_USERS) {
    try {
      // Check if user already exists
      const searchResp = await fetch(
        `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
        { headers: { 'Authorization': `Bearer ${secretKey}` } }
      );
      const searchResult = await searchResp.json();
      if (searchResult.response && searchResult.response.length > 0) {
        continue; // User exists
      }

      // Create user
      await fetch('https://api.clerk.com/v1/users', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email_address: [email],
          password: 'WelianE2E2026!Secure#Pass',
          first_name: email.split('@')[0].replace('+', ' '),
        }),
      });
      console.log(`[clerk setup] Created test user: ${email}`);
    } catch (e) {
      console.log(`[clerk setup] User ${email} may already exist: ${e.message}`);
    }
  }
}

export default async function globalSetup() {
  await clerkSetup();
  await ensureTestUsers();
}
