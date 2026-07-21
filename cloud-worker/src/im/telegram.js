/**
 * Telegram Bot API adapter.
 *
 * Webhook: POST /im/telegram/webhook
 *   - Telegram sends updates as JSON to the registered webhook URL.
 *   - We verify via `X-Telegram-Bot-Api-Secret-Token` header (set when registering webhook).
 *   - No HMAC signature on Telegram (the secret token is the auth mechanism).
 *
 * Outbound: send via https://api.telegram.org/bot<token>/sendMessage
 *   - Supports MarkdownV2 / HTML parse_mode
 *   - InlineKeyboard for buttons (cards)
 *
 * Setup (one-time, manual):
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *        -d "url=https://api.welian.app/im/telegram/webhook" \
 *        -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
 */

import { makeIncoming, makeOutgoing } from './types.js';

const TG_API_BASE = 'https://api.telegram.org';

function botApiBase(env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
  return `${TG_API_BASE}/bot${token}`;
}

/**
 * Verify webhook authenticity via secret token header.
 * @returns {Promise<boolean>}
 */
export async function verifyWebhook(req, env) {
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    // If no secret configured, reject — never accept unverified webhooks
    console.error('[telegram] TELEGRAM_WEBHOOK_SECRET not set — rejecting webhook');
    return false;
  }
  const received = req.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  // Constant-time comparison
  if (received.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < received.length; i++) {
    diff |= received.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Parse an incoming Telegram webhook payload into our unified IncomingMessage.
 * @returns {Promise<IncomingMessage | null>} null if not a message we handle
 */
export async function parseIncoming(req, _env) {
  const body = await req.json();
  const msg = body.message || body.edited_message || body.channel_post;
  if (!msg) return null;

  const from = msg.from || {};
  const chat = msg.chat || {};
  const text = msg.text || msg.caption || '';

  if (!text) return null; // stickers/photos with no caption — skip for now

  // Detect slash command: /cmd [@bot_username] [args]
  const commandMatch = text.match(/^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/s);
  let command = null;
  let messageText = text;
  if (commandMatch) {
    command = commandMatch[1];
    messageText = (commandMatch[2] || '').trim();
  }

  return makeIncoming({
    platform: 'telegram',
    platformUserId: String(from.id || ''),
    chatId: String(chat.id || ''),
    text: messageText,
    command,
    userName: [from.first_name, from.last_name].filter(Boolean).join(' '),
    raw: msg,
  });
}

/**
 * Send a reply back to the Telegram chat.
 * @param {OutgoingMessage} msg
 * @returns {Promise<boolean>}
 */
export async function sendReply(env, msg) {
  const body = {
    chat_id: msg.chatId,
    text: msg.text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  if (msg.buttons && msg.buttons.length > 0) {
    body.reply_markup = {
      inline_keyboard: msg.buttons.map(b => [{
        text: b.text,
        ...(b.url ? { url: b.url } : {}),
        ...(b.callbackData ? { callback_data: b.callbackData } : {}),
      }]),
    };
  }

  try {
    const resp = await fetch(`${botApiBase(env)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[telegram] sendMessage failed: ${resp.status} ${errText.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[telegram] sendReply error:', e.message);
    return false;
  }
}

/**
 * Build a bind card for Telegram (with inline button to welian.app/bind).
 */
export function buildBindCard(platformUserId, code, bindUrl) {
  return makeOutgoing({
    platform: 'telegram',
    chatId: platformUserId, // caller sets correct chatId
    text: `🔗 绑定小维\n\n配对码：<code>${code}</code>\n\n点击按钮登录 Welian 完成绑定：`,
    isCard: true,
    buttons: [{ text: '前往绑定', url: bindUrl }],
  });
}
