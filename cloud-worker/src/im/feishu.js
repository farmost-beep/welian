/**
 * 飞书 / Lark Bot adapter.
 *
 * Webhook: POST /im/feishu/webhook
 *   - 飞书事件订阅，发送 JSON 到你注册的 webhook URL
 *   - 签名验证：X-Lark-Signature = sha256(timestamp + nonce + encrypt_key + body)
 *     headers: X-Lark-Request-Timestamp, X-Lark-Request-Nonce, X-Lark-Signature
 *   - 如果配了 encrypt_key，body 是 {"encrypt": "base64..."} 加密的
 *   - url_verification 事件：返回 {"challenge": "..."} 完成首次验证
 *
 * Outbound: 发消息需要 tenant_access_token
 *   1. POST /open-apis/auth/v3/tenant_access_token/internal {app_id, app_secret}
 *   2. POST /open-apis/im/v1/messages?receive_id_type=chat_id
 *      headers: Authorization: Bearer <tenant_access_token>
 *      body: {receive_id, msg_type, content}
 *
 * Setup (one-time, manual):
 *   1. 在 https://open.feishu.cn 创建企业自建应用
 *   2. 添加「机器人」能力，配置事件订阅 URL: https://api.welian.app/im/feishu/webhook
 *   3. 订阅 im.message.receive_v1 事件
 *   4. 拿到 App ID + App Secret + Encrypt Key + Verification Token
 */

import { makeIncoming, makeOutgoing } from './types.js';

const FEISHU_API_BASE = 'https://open.feishu.cn';

// In-memory tenant_access_token cache (per-isolate)
let _tokenCache = { token: null, expiresAt: 0 };

/**
 * Verify webhook signature.
 * @returns {Promise<boolean>}
 */
export async function verifyWebhook(req, env) {
  const encryptKey = env.FEISHU_ENCRYPT_KEY;

  // If no encrypt key configured, fall back to verification token in body
  if (!encryptKey) {
    // Will be validated in parseIncoming via body.verification_token
    return true;
  }

  const timestamp = req.headers.get('X-Lark-Request-Timestamp') || '';
  const nonce = req.headers.get('X-Lark-Request-Nonce') || '';
  const signature = req.headers.get('X-Lark-Signature') || '';
  const bodyText = await req.text();

  // Recompute: sha256(timestamp + nonce + encrypt_key + body)
  const data = timestamp + nonce + encryptKey + bodyText;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  const expected = Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Decrypt encrypted event body (if encrypt_key is set).
 */
async function decryptBody(encrypted, encryptKey) {
  // 飞书加密：AES-256-CBC, key = sha256(encrypt_key), iv = first 16 bytes of ciphertext
  const keyBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encryptKey));
  const keyBytes = new Uint8Array(keyBuf);

  // encrypted is base64
  const base64 = encrypted.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '=='.slice(0, (4 - base64.length % 4) % 4);
  const binary = atob(padded);
  const allBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) allBytes[i] = binary.charCodeAt(i);

  const iv = allBytes.slice(0, 16);
  const ciphertext = allBytes.slice(16);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv }, cryptoKey, ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

/**
 * Parse incoming webhook payload.
 * Handles: url_verification, im.message.receive_v1
 * @returns {Promise<IncomingMessage | {challenge: string} | null>}
 */
export async function parseIncoming(req, env) {
  const bodyText = await req.text();
  let body;
  try { body = JSON.parse(bodyText); } catch { return null; }

  // Decrypt if needed
  if (body.encrypt && env.FEISHU_ENCRYPT_KEY) {
    const decrypted = await decryptBody(body.encrypt, env.FEISHU_ENCRYPT_KEY);
    body = JSON.parse(decrypted);
  }

  // URL verification challenge — caller must return {challenge}
  if (body.type === 'url_verification' || body.challenge) {
    return { challenge: body.challenge, isVerification: true };
  }

  // Verify verification_token (when no encrypt_key)
  if (env.FEISHU_VERIFICATION_TOKEN && body.token && body.token !== env.FEISHU_VERIFICATION_TOKEN) {
    console.error('[feishu] verification token mismatch');
    return null;
  }

  // Message event: im.message.receive_v1
  const event = body.event;
  if (!event) return null;

  const msg = event.message;
  const sender = event.sender;
  if (!msg) return null;

  // Only handle text messages (p2p or group @mention)
  if (msg.message_type !== 'text') return null;

  let text = '';
  try {
    const content = JSON.parse(msg.content);
    text = content.text || '';
  } catch { return null; }

  // Strip @mention prefix in group chats (飞书 @bot 格式: @_user_1)
  text = text.replace(/@_\w+\s*/g, '').trim();

  if (!text) return null;

  // Detect slash command
  const commandMatch = text.match(/^\/(\w+)(?:\s+(.*))?$/s);
  let command = null;
  let messageText = text;
  if (commandMatch) {
    command = commandMatch[1];
    messageText = (commandMatch[2] || '').trim();
  }

  const chatId = msg.chat_id || '';
  const senderId = sender?.sender_id?.open_id || msg.sender?.sender_id?.open_id || '';

  return makeIncoming({
    platform: 'feishu',
    platformUserId: senderId,
    chatId,
    text: messageText,
    command,
    userName: sender?.sender_id?.name || '',
    raw: body,
  });
}

/**
 * Get tenant_access_token (cached, refreshed when expired).
 */
async function getTenantAccessToken(env) {
  const now = Date.now();
  if (_tokenCache.token && now < _tokenCache.expiresAt - 60000) {
    return _tokenCache.token;
  }

  const resp = await fetch(`${FEISHU_API_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: env.FEISHU_APP_ID,
      app_secret: env.FEISHU_APP_SECRET,
    }),
  });
  const data = await resp.json();
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`feishu token error: ${data.msg || resp.status}`);
  }
  _tokenCache = {
    token: data.tenant_access_token,
    expiresAt: now + (data.expire || 7200) * 1000,
  };
  return _tokenCache.token;
}

/**
 * Send a reply back to the Feishu chat.
 * @param {OutgoingMessage} msg
 * @returns {Promise<boolean>}
 */
export async function sendReply(env, msg) {
  try {
    const token = await getTenantAccessToken(env);

    let msgType = 'text';
    let content;

    if (msg.isCard && msg.buttons && msg.buttons.length > 0) {
      // Interactive card with buttons
      msgType = 'interactive';
      const elements = [
        { tag: 'div', text: { tag: 'lark_md', content: msg.text } },
        {
          tag: 'action',
          actions: msg.buttons.map(b => ({
            tag: 'button',
            text: { tag: 'plain_text', content: b.text },
            type: 'primary',
            url: b.url || undefined,
          })),
        },
      ];
      content = JSON.stringify({
        config: { wide_screen_mode: true },
        elements,
      });
    } else {
      msgType = 'text';
      content = JSON.stringify({ text: msg.text });
    }

    const resp = await fetch(`${FEISHU_API_BASE}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: msg.chatId,
        msg_type: msgType,
        content,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[feishu] sendMessage failed: ${resp.status} ${errText.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[feishu] sendReply error:', e.message);
    return false;
  }
}

/**
 * Build a bind card for Feishu (interactive card with button).
 */
export function buildBindCard(chatId, code, bindUrl) {
  return makeOutgoing({
    platform: 'feishu',
    chatId,
    text: `🔗 绑定小维\n\n配对码：${code}\n\n点击按钮登录 Welian 完成绑定：`,
    isCard: true,
    buttons: [{ text: '前往绑定', url: bindUrl }],
  });
}
