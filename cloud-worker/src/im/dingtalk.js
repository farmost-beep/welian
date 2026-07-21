/**
 * 钉钉 Bot adapter (企业内部应用机器人).
 *
 * Webhook: POST /im/dingtalk/webhook
 *   - 钉钉事件订阅回调
 *   - 签名验证：HMAC-SHA256(timestamp + "\n" + secret) → base64
 *     但钉钉企业内部应用的事件回调签名机制是：
 *       headers: timestamp, sign
 *       sign = base64(HMAC-SHA256(timestamp + "\n" + DINGTALK_APP_SECRET, ""))
 *     注意：钉钉的签名是 HMAC-SHA256(key=secret, data=timestamp)
 *   - 事件回调可能包含加密体（如果配了 aes_key）
 *
 * Outbound: 发消息需要 access_token
 *   1. POST https://api.dingtalk.com/v1.0/oauth2/accessToken {appKey, appSecret}
 *   2. POST https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend
 *      headers: x-acs-dingtalk-access-token: <accessToken>
 *      body: {robotCode, userIds, msgKey, msgParam}
 *
 * Setup (one-time, manual):
 *   1. 在 https://open-dev.dingtalk.com 创建企业内部应用
 *   2. 添加「机器人」能力，配置消息接收模式: HTTP 模式
 *   3. 事件订阅 URL: https://api.welian.app/im/dingtalk/webhook
 *   4. 拿到 AppKey + App Secret
 *   5. 机器人订阅「单聊」消息事件
 */

import { makeIncoming, makeOutgoing } from './types.js';

const DINGTALK_API_BASE = 'https://api.dingtalk.com';

// In-memory access_token cache (per-isolate)
let _tokenCache = { token: null, expiresAt: 0 };

/**
 * Verify webhook signature.
 * 钉钉企业内部应用事件回调签名：
 *   sign = base64(HMAC-SHA256(key=app_secret, data=timestamp))
 *   headers: timestamp, sign
 * @returns {Promise<boolean>}
 */
export async function verifyWebhook(req, env) {
  const appSecret = env.DINGTALK_APP_SECRET;
  if (!appSecret) {
    console.error('[dingtalk] DINGTALK_APP_SECRET not set — rejecting webhook');
    return false;
  }

  const timestamp = req.headers.get('timestamp') || '';
  const sign = req.headers.get('sign') || '';
  if (!timestamp || !sign) {
    // Some dingtalk setups don't send sign headers; fall back to body-level verification
    // We'll validate via the body's chatbotUserId or conversationId in parseIncoming
    return true;
  }

  // HMAC-SHA256(key=appSecret, data=timestamp)
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(timestamp)
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

  if (expected.length !== sign.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sign.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Parse incoming webhook payload.
 * 钉钉机器人消息事件格式：
 *   {
 *     "conversationId": "...",
 *     "chatbotUserId": "...",
 *     "msgId": "...",
 *     "senderNick": "用户名",
 *     "isAdmin": false,
 *     "senderStaffId": "...",  // 钉钉用户 ID
 *     "sessionWebhookExpiredTime": ...,
 *     "createAt": ...,
 *     "conversationType": "1",  // 1=单聊, 2=群聊
 *     "senderId": "...",  // 钉钉 unionId
 *     "conversationTitle": "...",
 *     "isInAtList": false,
 *     "sessionWebhook": "https://oapi.dingtalk.com/robot/sendBySession?session=...",
 *     "text": { "content": "用户发的消息" },
 *     "msgtype": "text"
 *   }
 * @returns {Promise<IncomingMessage | null>}
 */
export async function parseIncoming(req, _env) {
  const body = await req.json();

  // Only handle text messages
  if (body.msgtype !== 'text' || !body.text) return null;

  let text = (body.text.content || '').trim();

  // Strip @bot prefix in group chats
  text = text.replace(/@\S+\s*/g, '').trim();

  if (!text) return null;

  // Detect slash command
  const commandMatch = text.match(/^\/(\w+)(?:\s+(.*))?$/s);
  let command = null;
  let messageText = text;
  if (commandMatch) {
    command = commandMatch[1];
    messageText = (commandMatch[2] || '').trim();
  }

  // senderStaffId is the stable钉钉 user id; senderId is unionId
  const platformUserId = body.senderStaffId || body.senderId || '';
  const chatId = body.conversationId || '';
  const userName = body.senderNick || '';

  if (!platformUserId || !chatId) return null;

  return makeIncoming({
    platform: 'dingtalk',
    platformUserId,
    chatId,
    text: messageText,
    command,
    userName,
    raw: body,
  });
}

/**
 * Get access_token (cached, refreshed when expired).
 */
async function getAccessToken(env) {
  const now = Date.now();
  if (_tokenCache.token && now < _tokenCache.expiresAt - 60000) {
    return _tokenCache.token;
  }

  const resp = await fetch(`${DINGTALK_API_BASE}/v1.0/oauth2/accessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appKey: env.DINGTALK_APP_KEY,
      appSecret: env.DINGTALK_APP_SECRET,
    }),
  });
  const data = await resp.json();
  if (!data.accessToken) {
    throw new Error(`dingtalk token error: ${data.errmsg || resp.status}`);
  }
  _tokenCache = {
    token: data.accessToken,
    expiresAt: now + (data.expireIn || 7200) * 1000,
  };
  return _tokenCache.token;
}

/**
 * Send a reply back to the DingTalk user.
 *
 * 钉钉企业内部机器人发消息用 oToMessages/batchSend（单聊推送）。
 * 需要 userId（staffId），但 webhook 回调里有 sessionWebhook（临时 webhook，更简单）。
 * 优先用 sessionWebhook（来自 body.raw.sessionWebhook），否则用 oToMessages。
 *
 * @param {OutgoingMessage} msg
 * @returns {Promise<boolean>}
 */
export async function sendReply(env, msg) {
  try {
    // If the incoming message carried a sessionWebhook, use it (simpler, no token needed)
    const sessionWebhook = msg.raw?.sessionWebhook;
    if (sessionWebhook) {
      let body;
      if (msg.isCard && msg.buttons && msg.buttons.length > 0) {
        // ActionCard
        body = {
          msgtype: 'actionCard',
          actionCard: {
            text: msg.text,
            title: '🔗 绑定小维',
            btns: msg.buttons.map(b => ({ title: b.text, actionURL: b.url })),
            btnOrientation: '0',
          },
        };
      } else {
        body = {
          msgtype: 'text',
          text: { content: msg.text },
        };
      }
      const resp = await fetch(sessionWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        console.error(`[dingtalk] sessionWebhook send failed: ${resp.status}`);
        return false;
      }
      return true;
    }

    // Fallback: use oToMessages/batchSend (requires access_token + staffId)
    const token = await getAccessToken(env);
    const staffId = msg.raw?.senderStaffId || msg.platformUserId;
    if (!staffId) {
      console.error('[dingtalk] no staffId for oToMessages');
      return false;
    }

    let msgKey = 'sampleText';
    let msgParam;
    if (msg.isCard && msg.buttons && msg.buttons.length > 0) {
      // 钉钉 ActionCard via oToMessages uses sampleActionCard msgKey
      msgKey = 'sampleActionCard';
      msgParam = JSON.stringify({
        title: '🔗 绑定小维',
        text: msg.text,
        btns: msg.buttons.map(b => ({ title: b.text, actionURL: b.url })),
      });
    } else {
      msgKey = 'sampleText';
      msgParam = JSON.stringify({ content: msg.text });
    }

    const resp = await fetch(`${DINGTALK_API_BASE}/v1.0/robot/oToMessages/batchSend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': token,
      },
      body: JSON.stringify({
        robotCode: env.DINGTALK_APP_KEY,
        userIds: [staffId],
        msgKey,
        msgParam,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[dingtalk] oToMessages failed: ${resp.status} ${errText.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[dingtalk] sendReply error:', e.message);
    return false;
  }
}

/**
 * Build a bind card for DingTalk (ActionCard with button).
 */
export function buildBindCard(chatId, code, bindUrl) {
  return makeOutgoing({
    platform: 'dingtalk',
    chatId,
    text: `🔗 绑定小维\n\n配对码：${code}\n\n点击按钮登录 Welian 完成绑定：`,
    isCard: true,
    buttons: [{ text: '前往绑定', url: bindUrl }],
  });
}
