/**
 * Multi-platform IM binding flow.
 *
 * Flow:
 *   1. User adds Welian bot on IM, sends /bind
 *   2. Bot (via adapter) calls cloud: POST /im/bind/start { platform, platform_user_id, chat_id }
 *      → cloud stores bind_code:<6-digit> → { platform, platform_user_id, chat_id, expires_at }
 *      → returns { code, bind_url: 'https://welian.app/bind?platform=telegram&code=123456' }
 *   3. Bot sends user a card with the bind_url + code
 *   4. User clicks link → logs in on web (Clerk) → web calls POST /im/bind/confirm { code, session_token }
 *      → cloud verifies Clerk token, looks up bind_code, stores:
 *          <platform>_bind:<platform>_<id> → clerk_user_id
 *          im_user:<clerk_user_id>:<platform> → <platform>_<id>
 *      → returns { ok, platform, platform_user_id }
 *   5. Web shows success; user returns to IM and sends any message → bot is now bound
 *
 * Backward compat: wechat binding still uses /ai/bind_wechat (unchanged).
 */

import { kvKeys, generateBindCode, platformScopedId, PLATFORMS } from './types.js';

const BIND_CODE_TTL_SECONDS = 600; // 10 minutes

/**
 * Start a binding session. Called by IM adapter when user sends /bind.
 *
 * @returns {Promise<{status: number, data: Object}>}
 *   200: { code, bind_url, expires_in }
 *   400: missing/invalid params
 */
export async function handleBindStart(env, { platform, platform_user_id, chat_id, user_name }) {
  if (!PLATFORMS.includes(platform)) {
    return { status: 400, data: { error: `unsupported platform: ${platform}` } };
  }
  if (!platform_user_id || !chat_id) {
    return { status: 400, data: { error: 'platform_user_id and chat_id required' } };
  }

  // If already bound, return early with the bound clerk user info (idempotent)
  const scopedId = platformScopedId(platform, platform_user_id);
  const existing = await env.USER_DATA.get(kvKeys.bind(platform, scopedId));
  if (existing) {
    return {
      status: 200,
      data: {
        already_bound: true,
        clerk_user_id: existing,
        message: '已绑定，直接发消息即可使用小维。',
      },
    };
  }

  const code = generateBindCode();
  const payload = {
    platform,
    platform_user_id,
    chat_id,
    user_name: user_name || '',
    created_at: Date.now(),
    expires_at: Date.now() + BIND_CODE_TTL_SECONDS * 1000,
  };
  await env.USER_DATA.put(kvKeys.bindCode(code), JSON.stringify(payload), {
    expirationTtl: BIND_CODE_TTL_SECONDS,
  });

  const bindUrl = `https://welian.app/bind?platform=${platform}&code=${code}`;
  return {
    status: 200,
    data: { code, bind_url: bindUrl, expires_in: BIND_CODE_TTL_SECONDS },
  };
}

/**
 * Confirm binding from the web (after Clerk login).
 *
 * Caller must be authenticated via Clerk JWT (verified by the route handler
 * before calling this — we receive clerkUserId directly).
 *
 * @returns {Promise<{status: number, data: Object}>}
 *   200: { ok, platform, platform_user_id }
 *   400: missing/invalid code
 *   404: code not found or expired
 */
export async function handleBindConfirm(env, clerkUserId, { code }) {
  if (!clerkUserId) {
    return { status: 401, data: { error: 'Authentication required — login on web first' } };
  }
  if (!code || !/^\d{6}$/.test(code)) {
    return { status: 400, data: { error: '6-digit code required' } };
  }

  const raw = await env.USER_DATA.get(kvKeys.bindCode(code));
  if (!raw) {
    return { status: 404, data: { error: '配对码无效或已过期，请在 IM 里重新发 /bind' } };
  }
  const payload = JSON.parse(raw);

  // Check expiry (defensive — KV TTL should have removed it already)
  if (Date.now() > payload.expires_at) {
    await env.USER_DATA.delete(kvKeys.bindCode(code));
    return { status: 404, data: { error: '配对码已过期，请重新发 /bind' } };
  }

  const scopedId = platformScopedId(payload.platform, payload.platform_user_id);

  // Store forward + reverse mapping
  // For reverse mapping, store { scopedId, chat_id, user_name } so we can push proactively
  await env.USER_DATA.put(kvKeys.bind(payload.platform, scopedId), clerkUserId);
  await env.USER_DATA.put(kvKeys.userPlatform(clerkUserId, payload.platform), JSON.stringify({
    scoped_id: scopedId,
    chat_id: payload.chat_id,
    user_name: payload.user_name || '',
  }));

  // Consume the code
  await env.USER_DATA.delete(kvKeys.bindCode(code));

  return {
    status: 200,
    data: {
      ok: true,
      platform: payload.platform,
      platform_user_id: payload.platform_user_id,
      clerk_user_id: clerkUserId,
      message: `绑定成功！现在可以在 ${payload.platform} 里直接和小维对话了。`,
    },
  };
}

/**
 * Look up the bound Clerk user_id for a platform-scoped id.
 * Used by the dispatcher on every incoming IM message.
 *
 * @returns {Promise<string|null>} clerk_user_id or null if not bound
 */
export async function lookupBinding(env, platform, platformUserId) {
  const scopedId = platformScopedId(platform, platformUserId);
  const clerkUserId = await env.USER_DATA.get(kvKeys.bind(platform, scopedId));
  return clerkUserId || null;
}

/**
 * Unbind a platform from a Clerk user.
 * Called from web (authenticated) or from IM via /unbind command (adapter verifies identity).
 *
 * @returns {Promise<{status, data}>}
 */
export async function handleUnbind(env, clerkUserId, { platform }) {
  if (!clerkUserId) return { status: 401, data: { error: 'Authentication required' } };
  if (!PLATFORMS.includes(platform)) return { status: 400, data: { error: 'invalid platform' } };

  const reverseRaw = await env.USER_DATA.get(kvKeys.userPlatform(clerkUserId, platform));
  if (!reverseRaw) {
    return { status: 404, data: { error: `未绑定 ${platform}` } };
  }

  // Handle both old (plain string) and new (JSON) formats
  let scopedId;
  try {
    const parsed = JSON.parse(reverseRaw);
    scopedId = parsed.scoped_id || reverseRaw;
  } catch {
    scopedId = reverseRaw; // old format: plain string
  }

  await env.USER_DATA.delete(kvKeys.bind(platform, scopedId));
  await env.USER_DATA.delete(kvKeys.userPlatform(clerkUserId, platform));

  return { status: 200, data: { ok: true, platform, unbound: scopedId } };
}
