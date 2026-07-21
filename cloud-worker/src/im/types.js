/**
 * Unified IM message model — all platform adapters convert to/from this shape.
 *
 * IncomingMessage:  platform → Welian dispatcher
 * OutgoingMessage:  Welian dispatcher → platform adapter
 *
 * Adapters live in telegram.js / feishu.js / dingtalk.js / whatsapp.js.
 * Each adapter exports:
 *   - parseIncoming(req, env): Promise<IncomingMessage | null>
 *   - verifyWebhook(req, env): Promise<boolean>
 *   - sendReply(env, msg: OutgoingMessage): Promise<boolean>
 *   - buildBindCard(platformUserId, code, bindUrl): OutgoingMessage
 */

/** Supported IM platforms. */
export const PLATFORMS = ['telegram', 'feishu', 'dingtalk', 'whatsapp'];

/**
 * Normalized incoming message from any IM platform.
 * @typedef {Object} IncomingMessage
 * @property {string} platform        — 'telegram' | 'feishu' | 'dingtalk' | 'whatsapp'
 * @property {string} platformUserId  — platform-native user id (string)
 * @property {string} chatId          — conversation id to send replies back to
 * @property {string} text            — user's text content (already stripped of @mentions / commands prefix)
 * @property {string} [command]       — slash command name without '/', e.g. 'bind' | 'help' | 'reset'
 * @property {Object} [raw]           — original webhook payload for adapter-specific needs
 * @property {string} [userName]      — display name from platform (best-effort)
 */

/**
 * Normalized outgoing message to any IM platform.
 * @typedef {Object} OutgoingMessage
 * @property {string} platform
 * @property {string} chatId          — target conversation id
 * @property {string} text            — reply body (plain text; adapter handles platform formatting)
 * @property {boolean} [isCard]       — if true, adapter renders as a card/interactive element when supported
 * @property {Array<{text: string, url?: string, callbackData?: string}>} [buttons] — optional inline buttons
 */

/**
 * Build a normalized IncomingMessage.
 */
export function makeIncoming({ platform, platformUserId, chatId, text, command, raw, userName }) {
  if (!platform || !platformUserId || !chatId) {
    throw new Error('makeIncoming: platform, platformUserId, chatId are required');
  }
  return { platform, platformUserId, chatId, text: text || '', command, raw, userName };
}

/**
 * Build a normalized OutgoingMessage.
 */
export function makeOutgoing({ platform, chatId, text, isCard, buttons }) {
  if (!platform || !chatId || !text) {
    throw new Error('makeOutgoing: platform, chatId, text are required');
  }
  return { platform, chatId, text, isCard: !!isCard, buttons: buttons || [] };
}

/**
 * Stable platform-scoped user id used in KV keys: `<platform>_<platformUserId>`.
 * Mirrors the existing `wechat_<id>` convention so getVerifiedUserId keeps working.
 */
export function platformScopedId(platform, platformUserId) {
  return `${platform}_${platformUserId}`;
}

/**
 * KV key templates — single source of truth for binding storage.
 * Generalizes the existing wechat_bind / wechat_user pattern.
 */
export const kvKeys = {
  // <platform>_bind:<platform>_<id> → clerk_user_id
  // (e.g. telegram_bind:telegram_12345 → clerk_xxx)
  bind: (platform, platformScoped) => `${platform}_bind:${platformScoped}`,
  // im_user:<clerk_user_id>:<platform> → <platform>_<id>  (reverse lookup, multi-platform per user)
  userPlatform: (clerkUserId, platform) => `im_user:${clerkUserId}:${platform}`,
  // bind_code:<6-digit> → { platform, platform_user_id, expires_at }
  bindCode: (code) => `bind_code:${code}`,
  // legacy wechat keys (kept for back-compat; new code uses bind()/userPlatform())
  wechatBind: (wechatId) => `wechat_bind:${wechatId}`,
  wechatUser: (clerkUserId) => `wechat_user:${clerkUserId}`,
};

/**
 * Generate a 6-digit pairing code.
 */
export function generateBindCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
