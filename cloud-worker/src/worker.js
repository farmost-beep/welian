/**
 * Welian Cloud AI API — Cloudflare Worker
 *
 * SPEC §7.1: 数据归你，智能来云。
 *
 * This Worker receives ONLY minimal context snippets from edge clients.
 * It never sees full contacts.json, timeline.json, or any user data.
 * It processes AI requests and returns results. Nothing is stored.
 *
 * Endpoints:
 * - POST /ai/draft     — draft a message from minimal context
 * - POST /ai/extract   — extract todos/key_points from interaction text
 * - POST /ai/advise    — format advise from candidate list
 * - GET  /auth/wechat          — redirect to WeChat OAuth
 * - GET  /auth/wechat/callback — handle WeChat OAuth callback
 * - POST /auth/sms/send        — send SMS OTP via Aliyun
 * - POST /auth/sms/verify      — verify SMS OTP, return Clerk session
 * - GET  /discover/register    — register tunnel URL
 * - GET  /discover/lookup      — lookup tunnel URL by user_id
 * - GET  /health       — health check
 * - GET  /             — API info
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── System prompts (mirror Python server.py) ──

const DRAFT_SYSTEM = `You are Welian, an AI companion that helps people be better friends, family members, and collaborators.

Draft a short, natural message. Return ONLY the message text.
- For nurture relationships: warm, no agenda, just reaching out
- For leverage relationships: respectful but purposeful
- Keep it under 80 characters, like a real text message`;

const EXTRACT_SYSTEM = `Extract actionable items from an interaction record.
Return JSON: {"pending": "follow-up task or empty", "key_points": ["point1", "point2"]}
Be concise. Only extract real action items.`;

const ADVISE_SYSTEM = `You are Welian. Format relationship suggestions in a warm, human way.
- For leverage ties: who + why + what to talk about
- For nurture bonds: gentle reminders, no urgency, no scores
Return formatted text only.`;

// ── LLM call (Anthropic-compatible API) ──

async function callLLM(prompt, system, env) {
  const apiKey = env.LLM_API_KEY;
  if (!apiKey) {
    console.error('LLM_API_KEY not set');
    return null;
  }

  const model = env.LLM_MODEL || 'claude-sonnet-4-6';
  const baseUrl = env.LLM_BASE_URL || 'https://api.anthropic.com';

  const body = {
    model: model,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  };
  if (system) {
    body.system = system;
  }

  try {
    const resp = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      console.error(`LLM error: ${resp.status} ${await resp.text()}`);
      return null;
    }

    const data = await resp.json();
    const content = data.content;
    if (!content || !Array.isArray(content)) return null;

    for (const block of content) {
      if (block.type === 'text' && block.text) {
        return block.text;
      }
    }
    return null;
  } catch (e) {
    console.error('LLM call failed:', e.message);
    return null;
  }
}

// ── Route handlers ──

async function handleDraft(req, env) {
  const body = await req.json();

  const name = body.name || '';
  const nature = body.nature || null;
  const memories = body.memories || [];
  const lastInteraction = body.last_interaction || '';
  const userContext = body.user_context || '';
  const tone = body.tone || 'warm';

  // Build prompt from minimal context
  const parts = [`Draft a message to ${name}.`];
  if (nature === 'nurture') {
    parts.push('This is a lifelong bond — be warm, no agenda.');
  } else if (nature === 'leverage') {
    parts.push('This is a professional tie — be respectful but purposeful.');
  }
  if (memories.length > 0) {
    parts.push(`What I remember: ${memories.join('; ')}`);
  }
  if (lastInteraction) {
    parts.push(`Last interaction: ${lastInteraction}`);
  }
  if (userContext) {
    parts.push(`Context: ${userContext}`);
  }
  parts.push(`Tone: ${tone}`);

  const prompt = parts.join('\n');
  let result = await callLLM(prompt, DRAFT_SYSTEM, env);

  if (!result) {
    // Fallback: template
    if (nature === 'nurture') {
      result = `嘿 ${name}，好久没联系了，最近怎么样？想你了 😊`;
    } else if (nature === 'leverage') {
      result = `${name}你好，最近忙吗？有个事想跟你聊聊。`;
    } else {
      result = `${name}，好久不见！最近怎么样？`;
    }
  }

  return { result };
}

async function handleExtract(req, env) {
  const body = await req.json();

  const interactionText = body.interaction_text || '';
  const contactName = body.contact_name || '';

  const prompt = `Interaction: ${interactionText}\nContact: ${contactName || 'unknown'}`;
  const result = await callLLM(prompt, EXTRACT_SYSTEM, env);

  if (result) {
    try {
      const start = result.indexOf('{');
      const end = result.lastIndexOf('}') + 1;
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(result.slice(start, end));
        return { result: parsed };
      }
    } catch (e) {
      // fall through to heuristic
    }
  }

  // Fallback: simple heuristic
  let pending = '';
  const text = interactionText.toLowerCase();
  if (['下周', '跟进', 'follow up', 'remind', '待办'].some(kw => text.includes(kw))) {
    pending = 'Follow up on this interaction';
  }
  return { result: { pending, key_points: [] } };
}

async function handleAdvise(req, env) {
  const body = await req.json();

  const leverage = body.leverage || [];
  const nurture = body.nurture || [];

  const parts = [];

  if (leverage.length > 0) {
    parts.push(`💡 这周值得联系的人（${leverage.length}位）\n`);
    for (const c of leverage) {
      const days = c.days_since || 0;
      const icon = days >= 21 ? '🔴' : '🟡';
      let line = `${icon} ${c.name} — ${days}天没联系了`;
      if (c.leverage_goals) {
        line += `\n   为${(c.leverage_goals || []).join(',')}联结`;
      }
      if (c.last_interaction) {
        line += `\n   上次：${(c.last_interaction || '').slice(0, 60)}`;
      }
      parts.push(line);
    }
    parts.push('\n📌 好关系是互相搭桥 🤝');
  }

  if (nurture.length > 0) {
    parts.push('\n💛 值得记得的事\n');
    for (const r of nurture) {
      if (r.type === 'important_date') {
        parts.push(`  · ${r.name}的${r.label || ''}快到了`);
        parts.push(`    要不要发条消息？`);
      } else if (r.type === 'memory_followup') {
        parts.push(`  · ${r.name}：你记着「${(r.content || '').slice(0, 40)}」`);
      }
    }
    parts.push('\n（这种关系不算什么分，也不催你——用心就好）');
  }

  if (parts.length === 0) {
    return { result: '这周没有特别需要联系的。' };
  }

  // Try LLM for enhanced formatting
  const llmResult = await callLLM(parts.join('\n'), ADVISE_SYSTEM, env);
  return { result: llmResult || parts.join('\n') };
}

// ── Main worker entry ──

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Routes
    try {
      if (path === '/health' && method === 'GET') {
        return jsonResponse({
          status: 'ok',
          version: '2.0.0',
          mode: 'ai-only',
          model: env.LLM_MODEL || 'claude-sonnet-4-6',
        });
      }

      if (path === '/' && method === 'GET') {
        return jsonResponse({
          name: 'Welian Cloud AI API',
          version: '2.0.0',
          endpoints: ['/ai/draft', '/ai/extract', '/ai/advise', '/health'],
          spec: 'SPEC §7.1: 数据归你，智能来云',
        });
      }

      if (path === '/ai/draft' && method === 'POST') {
        const result = await handleDraft(request, env);
        return jsonResponse(result);
      }

      if (path === '/ai/extract' && method === 'POST') {
        const result = await handleExtract(request, env);
        return jsonResponse(result);
      }

      if (path === '/ai/advise' && method === 'POST') {
        const result = await handleAdvise(request, env);
        return jsonResponse(result);
      }

      // ── WeChat OAuth ──

      if (path === '/auth/wechat' && method === 'GET') {
        // Redirect to WeChat OAuth
        const appId = env.WECHAT_APP_ID;
        if (!appId) {
          return jsonResponse({ error: 'WeChat App ID not configured' }, 500);
        }
        const redirectUri = encodeURIComponent(`${url.origin}/auth/wechat/callback`);
        const state = url.searchParams.get('redirect') || '';
        const wechatUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=${appId}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_login&state=${encodeURIComponent(state)}#wechat_redirect`;
        return Response.redirect(wechatUrl, 302);
      }

      if (path === '/auth/wechat/callback' && method === 'GET') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state') || ''; // original redirect URL
        if (!code) {
          return jsonResponse({ error: 'Missing code parameter' }, 400);
        }

        const appId = env.WECHAT_APP_ID;
        const appSecret = env.WECHAT_APP_SECRET;
        const clerkSecretKey = env.CLERK_SECRET_KEY;
        if (!appId || !appSecret || !clerkSecretKey) {
          return jsonResponse({ error: 'WeChat or Clerk not configured' }, 500);
        }

        // Step 1: Exchange code for access_token + openid
        const tokenResp = await fetch(
          `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${code}&grant_type=authorization_code`
        );
        const tokenData = await tokenResp.json();
        if (tokenData.errcode) {
          return jsonResponse({ error: 'WeChat token error', detail: tokenData }, 500);
        }
        const { access_token, openid } = tokenData;

        // Step 2: Get user info (nickname, avatar)
        const userInfoResp = await fetch(
          `https://api.weixin.qq.com/sns/userinfo?access_token=${access_token}&openid=${openid}`
        );
        const userInfo = await userInfoResp.json();
        const nickname = userInfo.nickname || '微信用户';

        // Step 3: Find or create Clerk user by WeChat openid
        // Search for existing user with external_id = wechat_openid
        const searchResp = await fetch(
          `https://api.clerk.com/v1/users?external_id=wechat_${openid}`,
          { headers: { 'Authorization': `Bearer ${clerkSecretKey}` } }
        );
        const searchResult = await searchResp.json();
        let clerkUserId;

        if (searchResult.response && searchResult.response.length > 0) {
          // User exists
          clerkUserId = searchResult.response[0].id;
        } else {
          // Create new user
          const createResp = await fetch('https://api.clerk.com/v1/users', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${clerkSecretKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              external_id: `wechat_${openid}`,
              first_name: nickname,
              unsafe_metadata: { wechat_openid: openid, wechat_avatar: userInfo.headimgurl },
            }),
          });
          const created = await createResp.json();
          if (created.errors) {
            return jsonResponse({ error: 'Clerk user creation failed', detail: created.errors }, 500);
          }
          clerkUserId = created.id;
        }

        // Step 4: Create a session for this user
        const sessionResp = await fetch('https://api.clerk.com/v1/sessions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${clerkSecretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ user_id: clerkUserId }),
        });
        const session = await sessionResp.json();
        if (session.errors) {
          return jsonResponse({ error: 'Session creation failed', detail: session.errors }, 500);
        }

        // Step 5: Generate a session token
        const tokenResp2 = await fetch(`https://api.clerk.com/v1/sessions/${session.id}/tokens`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${clerkSecretKey}`,
            'Content-Type': 'application/json',
          },
        });
        const tokenData2 = await tokenResp2.json();
        if (tokenData2.errors) {
          return jsonResponse({ error: 'Token creation failed', detail: tokenData2.errors }, 500);
        }

        // Redirect back to frontend with session token
        const frontendUrl = state || 'https://welian.app';
        const redirectUrl = `${frontendUrl}${frontendUrl.includes('?') ? '&' : '?'}clerk_session_token=${encodeURIComponent(tokenData2.jwt)}`;
        return Response.redirect(redirectUrl, 302);
      }

      // ── SMS OTP (phone login via Aliyun SMS) ──

      if (path === '/auth/sms/send' && method === 'POST') {
        const { phone } = await request.json();
        if (!phone || !/^1[3-9]\d{9}$/.test(phone.replace(/\s|-/g, ''))) {
          return jsonResponse({ error: 'Invalid phone number' }, 400);
        }

        const cleanPhone = phone.replace(/\s|-/g, '');
        const accessKeyId = env.ALIYUN_SMS_KEY;
        const accessKeySecret = env.ALIYUN_SMS_SECRET;
        const signName = env.ALIYUN_SMS_SIGN;
        const templateCode = env.ALIYUN_SMS_TEMPLATE;

        if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
          return jsonResponse({ error: 'SMS service not configured' }, 500);
        }

        // Generate 6-digit code
        const code = String(Math.floor(100000 + Math.random() * 900000));

        // Store code in KV with 5-min TTL
        await env.DEVICES.put(`sms:${cleanPhone}`, code, { expirationTtl: 300 });

        // Call Aliyun SMS API
        const smsResult = await sendAliyunSMS(accessKeyId, accessKeySecret, signName, templateCode, cleanPhone, { code });

        if (smsResult.Code && smsResult.Code !== 'OK') {
          return jsonResponse({ error: 'SMS send failed', detail: smsResult }, 500);
        }

        return jsonResponse({ ok: true, message: 'Code sent' });
      }

      if (path === '/auth/sms/verify' && method === 'POST') {
        const { phone, code, redirect } = await request.json();
        if (!phone || !code) {
          return jsonResponse({ error: 'Missing phone or code' }, 400);
        }

        const cleanPhone = phone.replace(/\s|-/g, '');
        const storedCode = await env.DEVICES.get(`sms:${cleanPhone}`);
        if (!storedCode || storedCode !== code) {
          return jsonResponse({ error: 'Invalid or expired code' }, 400);
        }

        // Delete used code
        await env.DEVICES.delete(`sms:${cleanPhone}`);

        const clerkSecretKey = env.CLERK_SECRET_KEY;
        if (!clerkSecretKey) {
          return jsonResponse({ error: 'Clerk not configured' }, 500);
        }

        // Find or create Clerk user by phone number
        const externalId = `phone_${cleanPhone}`;
        const searchResp = await fetch(
          `https://api.clerk.com/v1/users?external_id=${externalId}`,
          { headers: { 'Authorization': `Bearer ${clerkSecretKey}` } }
        );
        const searchResult = await searchResp.json();
        let clerkUserId;

        if (searchResult.response && searchResult.response.length > 0) {
          clerkUserId = searchResult.response[0].id;
        } else {
          // Create new user with phone number
          const createResp = await fetch('https://api.clerk.com/v1/users', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${clerkSecretKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              external_id: externalId,
              phone_number: `+86${cleanPhone}`,
              unsafe_metadata: { login_method: 'sms' },
            }),
          });
          const created = await createResp.json();
          if (created.errors) {
            return jsonResponse({ error: 'Clerk user creation failed', detail: created.errors }, 500);
          }
          clerkUserId = created.id;
        }

        // Create session + token
        const sessionResp = await fetch('https://api.clerk.com/v1/sessions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${clerkSecretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ user_id: clerkUserId }),
        });
        const session = await sessionResp.json();
        if (session.errors) {
          return jsonResponse({ error: 'Session creation failed', detail: session.errors }, 500);
        }

        const tokenResp = await fetch(`https://api.clerk.com/v1/sessions/${session.id}/tokens`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${clerkSecretKey}`,
            'Content-Type': 'application/json',
          },
        });
        const tokenData = await tokenResp.json();
        if (tokenData.errors) {
          return jsonResponse({ error: 'Token creation failed', detail: tokenData.errors }, 500);
        }

        return jsonResponse({ ok: true, jwt: tokenData.jwt, user_id: clerkUserId });
      }

      // ── Device discovery (tunnel registry) ──

      if (path === '/discover/register' && method === 'POST') {
        // Register tunnel URL. Key can be device_id or Clerk user_id.
        const body = await request.json();
        const key = body.device_id || body.user_id;
        const tunnelUrl = body.tunnel_url;
        if (!key || !tunnelUrl) {
          return jsonResponse({ error: 'device_id/user_id and tunnel_url required' }, 400);
        }
        // Store tunnel URL directly under the key, TTL 24h
        await env.DEVICES.put(`dev:${key}`, JSON.stringify({
          tunnel_url: tunnelUrl,
          updated: Date.now(),
        }), { expirationTtl: 86400 });
        return jsonResponse({ ok: true });
      }

      if (path === '/discover/lookup' && method === 'GET') {
        // Lookup tunnel URL by Clerk user_id (or device_id)
        const userId = url.searchParams.get('user_id');
        if (!userId) {
          return jsonResponse({ error: 'user_id required' }, 400);
        }
        // Direct lookup: agent may have registered with user_id as key
        const devData = await env.DEVICES.get(`dev:${userId}`);
        if (devData) {
          const parsed = JSON.parse(devData);
          return jsonResponse({ found: true, tunnel_url: parsed.tunnel_url });
        }
        // Indirect lookup: browser may have linked user_id → device_id
        const deviceId = await env.DEVICES.get(`user:${userId}`);
        if (deviceId) {
          const linkedData = await env.DEVICES.get(`dev:${deviceId}`);
          if (linkedData) {
            const parsed = JSON.parse(linkedData);
            return jsonResponse({ found: true, tunnel_url: parsed.tunnel_url });
          }
        }
        return jsonResponse({ found: false });
      }

      // 404
      return jsonResponse({ error: 'Not found', path }, 404);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

// ── Aliyun SMS helper ──

async function sendAliyunSMS(accessKeyId, accessKeySecret, signName, templateCode, phone, templateParam) {
  // Build Aliyun SMS API request (dysmsapi.aliyuncs.com)
  const params = {
    AccessKeyId: accessKeyId,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: phone,
    RegionId: 'cn-hangzhou',
    SignName: signName,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    TemplateCode: templateCode,
    TemplateParam: JSON.stringify(templateParam),
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    Version: '2017-05-25',
  };

  // Sort keys and build canonical query string
  const sortedKeys = Object.keys(params).sort();
  const canonicalQuery = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');

  // Build string to sign
  const stringToSign = `GET&${encodeURIComponent('/')}&${encodeURIComponent(canonicalQuery)}`;

  // Sign with HMAC-SHA1
  const key = accessKeySecret + '&';
  const signature = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', signature, new TextEncoder().encode(stringToSign));
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  params.Signature = sigBase64;

  // Build final URL
  const finalQuery = Object.keys(params)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');

  const resp = await fetch(`https://dysmsapi.aliyuncs.com/?${finalQuery}`);
  return resp.json();
}
