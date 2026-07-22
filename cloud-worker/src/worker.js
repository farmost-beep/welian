// ── Multi-platform IM modules (Phase 1: Telegram, Phase 2: Feishu + DingTalk) ──
import { dispatch as imDispatch } from './im/dispatcher.js';
import * as telegramAdapter from './im/telegram.js';
import * as feishuAdapter from './im/feishu.js';
import * as dingtalkAdapter from './im/dingtalk.js';
import { handleBindStart, handleBindConfirm, handleUnbind } from './im/bind.js';

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
 * - POST /ai/chat      — billing gateway: forward chat to LLM, return usage (方案C)
 * - POST /ai/billing   — query balance (mock; real billing is edge-side tokens.py)
 * - GET  /ai/pricing   — return points pricing info
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
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── Sentry error monitoring (lightweight, no npm dependency) ──
// Enabled when SENTRY_DSN env var is set. Sends events to Sentry's HTTP API.
async function captureException(env, error, context = {}) {
  const dsn = env?.SENTRY_DSN;
  if (!dsn) return; // no-op if not configured
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');
    const publicKey = url.username;
    const envelopeUrl = `https://${url.host}/api/${projectId}/envelope/`;
    const event = {
      event_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      platform: 'javascript',
      level: 'error',
      exception: {
        values: [{
          type: error?.name || 'Error',
          value: error?.message || String(error),
          stacktrace: error?.stack ? { frames: error.stack.split('\n').slice(1).map(l => {
            const m = l.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/) || l.match(/at\s+(.+?):(\d+):(\d+)/);
            return m ? { filename: m[2] || m[1], lineno: parseInt(m[3] || m[2]), colno: parseInt(m[4] || m[3]), function: m[1] } : {};
          }) } : undefined,
        }],
      },
      tags: { source: 'cloudflare-worker', ...context.tags },
      extra: context.extra || {},
      request: context.request,
    };
    const envelope = JSON.stringify({ event_id: event.event_id, sent_at: event.timestamp }) + '\n' + JSON.stringify(event);
    await fetch(envelopeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'X-Sentry-Auth': `Sentry sentry_key=${publicKey}, sentry_version=7` },
      body: envelope,
    });
  } catch (e) { /* silent — never let monitoring break the request */ }
}

// ── Timezone helpers ──
// Cloudflare Workers run in UTC. Users are mostly in China (UTC+8).
// Use CF-IPCountry header to infer timezone offset.
function getTzOffset(req) {
  const country = req?.headers?.get('CF-IPCountry') || '';
  // China, Taiwan, Hong Kong, Singapore, Malaysia, Philippines → UTC+8
  const utcPlus8 = new Set(['CN', 'TW', 'HK', 'SG', 'MY', 'PH']);
  if (utcPlus8.has(country)) return 8;
  // Japan, Korea → UTC+9
  const utcPlus9 = new Set(['JP', 'KR']);
  if (utcPlus9.has(country)) return 9;
  // Default: UTC+8 (most users are in China)
  return 8;
}

// Get local date string (YYYY-MM-DD) in user's timezone
function localDateStr(req) {
  const offset = getTzOffset(req);
  const now = new Date();
  const local = new Date(now.getTime() + offset * 3600000);
  return local.toISOString().slice(0, 10);
}

// Get local Date object (adjusted for user's timezone)
function localDate(req) {
  const offset = getTzOffset(req);
  return new Date(Date.now() + offset * 3600000);
}

// ── Auth: verify Clerk JWT and extract user_id ──

// Clerk JWT is RS256 signed. We verify using JWKS from Clerk's well-known endpoint.
// JWKS is cached in memory to avoid fetching on every request.
let _jwksCache = null;
let _jwksCacheTime = 0;

async function getClerkJwks(clerkDomain) {
  // Cache JWKS for 1 hour
  const now = Date.now();
  if (_jwksCache && (now - _jwksCacheTime) < 3600000) {
    return _jwksCache;
  }

  const resp = await fetch(`https://${clerkDomain}/.well-known/jwks.json`);
  if (!resp.ok) {
    throw new Error(`Failed to fetch JWKS: ${resp.status}`);
  }
  _jwksCache = await resp.json();
  _jwksCacheTime = now;
  return _jwksCache;
}

// Convert base64url to ArrayBuffer
function base64urlToBuffer(base64url) {
  // Add padding
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '=='.slice(0, (4 - base64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Convert JWK (RSA public key) to CryptoKey for signature verification
async function jwkToCryptoKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

// Verify a Clerk JWT and extract user_id
async function verifyClerkToken(token, env) {
  if (!token || typeof token !== 'string') {
    return { valid: false };
  }

  // Clerk domain from publishable key (hardcoded for now, or derive from env)
  const clerkDomain = env.CLERK_FRONTEND_DOMAIN || 'clerk.welian.app';

  try {
    // Split JWT into parts
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode header and payload
    const header = JSON.parse(new TextDecoder().decode(base64urlToBuffer(headerB64)));
    const payload = JSON.parse(new TextDecoder().decode(base64urlToBuffer(payloadB64)));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.error('JWT expired');
      return { valid: false };
    }

    // Check issuer
    const expectedIss = `https://${clerkDomain}`;
    if (payload.iss && payload.iss !== expectedIss) {
      console.error(`JWT issuer mismatch: ${payload.iss} vs ${expectedIss}`);
      return { valid: false };
    }

    // Get kid from header, find matching key in JWKS
    const kid = header.kid;
    if (!kid) {
      return { valid: false };
    }

    const jwks = await getClerkJwks(clerkDomain);
    const jwk = jwks.keys.find(k => k.kid === kid);
    if (!jwk) {
      console.error(`JWKS key not found for kid: ${kid}`);
      return { valid: false };
    }

    // Verify signature
    const cryptoKey = await jwkToCryptoKey(jwk);
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64urlToBuffer(signatureB64);

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signature,
      data
    );

    if (!valid) {
      console.error('JWT signature verification failed');
      return { valid: false };
    }

    // Extract user_id from 'sub' claim
    const userId = payload.sub;
    if (!userId) {
      return { valid: false };
    }

    return { valid: true, user_id: userId };
  } catch (e) {
    console.error('JWT verification error:', e.message);
    return { valid: false };
  }
}

// Check if a todo is done (supports both done field and status field)
const isTodoDone = t => t.done || t.status === 'done' || t.status === 'completed' || t.status === 'canceled';

// Load a prompt md file from KV (internal, not publicly accessible) with 5 min in-memory cache
const _promptCache = new Map();
async function loadPromptFile(env, filename, fallback) {
  const now = Date.now();
  const cached = _promptCache.get(filename);
  if (cached && (now - cached.ts) < 300000) return cached.text;
  try {
    const raw = await env.USER_DATA.get(`prompt:${filename}`);
    if (raw && raw.length > 10) {
      _promptCache.set(filename, { text: raw, ts: now });
      console.log(`[loadPromptFile] Loaded ${filename} from KV, len: ${raw.length}`);
      return raw;
    }
  } catch (e) {
    console.log(`[loadPromptFile] KV read failed for ${filename}:`, e.message);
  }
  return fallback;
}

// Extract + verify token from request (Authorization header or body)
async function getVerifiedUserId(req, env, body) {
  // Try Authorization header first
  const authHeader = req.headers.get('Authorization') || '';
  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }
  // Fall back to body field (for endpoints that accept JSON body)
  if (!token && body && body.session_token) {
    token = body.session_token;
  }

  // Demo token for simulation mode (demo_<scenario_id>:demo_secret)
  if (token && token.startsWith('demo_') && token.endsWith(':demo_secret')) {
    return token.split(':')[0];
  }

  // Sync token for edge agent / WeChat bot (user_id:sync_secret)
  if (token && token.includes(':') && !token.startsWith('eyJ')) {
    const [uid, secret] = token.split(':');
    if (uid && secret && secret === env.WELIAN_SYNC_SECRET) {
      // WeChat bot binding: uid starts with "wechat_" → lookup bound Clerk user_id
      if (uid.startsWith('wechat_')) {
        const bound = await env.USER_DATA.get(`wechat_bind:${uid}`);
        if (bound) return bound;
        return null; // not bound yet
      }
      // Mini program user: uid starts with "wxmp_" → lookup bound Clerk user_id
      if (uid.startsWith('wxmp_')) {
        const bound = await env.USER_DATA.get(`wechat_bind:${uid}`);
        if (bound) return bound;
        // Auto-create a Clerk-less user identity for wxmp users
        // They get their own data namespace under wxmp_<openid>
        return uid;
      }
      return uid;
    }
  }

  const result = await verifyClerkToken(token, env);
  if (!result.valid) {
    return null;
  }
  return result.user_id;
}

// ── System prompts (mirror Python server.py) ──

// System prompts — loaded from KV (prompt:*.md) with inline fallbacks
// Use `node scripts/sync_prompts.cjs` to upload prompts/ directory to KV
const DRAFT_SYSTEM = `You are Welian, an AI companion that helps people be better friends, family members, and collaborators.

Draft a short, natural message. Return ONLY the message text.
- For nurture relationships: warm, no agenda, just reaching out
- For leverage relationships: respectful but purposeful
- Keep it under 80 characters, like a real text message`;

const EXTRACT_SYSTEM = `Extract actionable items from an interaction record.
Return JSON: {"pending": "follow-up task or empty", "key_points": ["point1", "point2"]}
Be concise. Only extract real action items.`;

const IMPLICIT_EXTRACT_SYSTEM = `你是一个关系信息识别助手。判断用户消息是否包含可以记录的关系信息（互动/待办/重要日期/联系人近况）。只返回 JSON，不要其他文字。`;

const ADVISE_SYSTEM = `You are Welian (小维). Format relationship suggestions in a warm, human way.
- For leverage ties: who + why + what to talk about (具体聊什么话题)
- For nurture bonds: gentle reminders, no urgency, no scores
- Use Chinese, friendly tone, with emoji
- Max 5 suggestions total
Return formatted text only.`;

// Prompt file mapping — each scenario loads from KV, falls back to inline constant
async function getPrompt(env, name, fallback) {
  return await loadPromptFile(env, name + '.md', fallback);
}

// ── Cloud suggestion engine (queries KV directly, no edge agent needed) ──

async function handleCloudAdvise(req, env) {
  const userId = await getVerifiedUserId(req, env, await req.json().catch(() => ({})));
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  const contacts = await loadDataset(env, userId, 'contacts');
  const timeline = await loadDataset(env, userId, 'timeline');
  const todos = await loadDataset(env, userId, 'todos');

  const today = localDate(req);
  const todayStr = today.toISOString().slice(0, 10);

  // ── Leverage suggestions: score + sort ──
  const leverageCandidates = [];
  for (const c of contacts) {
    if (c.nature !== 'leverage' && c.nature !== '双重' && c.nature !== 'dual') continue;

    // Days since last interaction
    const contactTimeline = timeline
      .filter(t => t.contact === c.id)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const lastDate = contactTimeline[0]?.date || '';
    let daysSince = 9999;
    if (lastDate) {
      const diff = Math.floor((today - new Date(lastDate)) / 86400000);
      daysSince = isNaN(diff) ? 9999 : diff;
    }

    // Score
    let score = 0;
    if (daysSince >= 21) score += 30;
    else if (daysSince >= 14) score += 20;
    else if (daysSince === 9999) score += 25;
    if (c.leverage?.confirmed) score += 15;
    const pendingTodos = todos.filter(t => t.contact === c.id && t.status === 'pending');
    score += pendingTodos.length * 25;
    score += (c.strength || 3) * 2;

    if (daysSince >= 14 || daysSince === 9999 || pendingTodos.length > 0) {
      leverageCandidates.push({
        contact: c,
        daysSince,
        score,
        lastInteraction: contactTimeline[0]?.summary || '',
        pendingTodos: pendingTodos.map(t => t.task),
        leverageGoals: c.leverage?.goals || [],
        leverageHow: c.leverage?.how || '',
      });
    }
  }
  leverageCandidates.sort((a, b) => b.score - a.score);
  const topLeverage = leverageCandidates.slice(0, 5);

  // ── Nurture reminders: important dates + memory follow-up ──
  const nurtureReminders = [];
  for (const c of contacts) {
    if (c.nature !== 'nurture' && c.nature !== '双重' && c.nature !== 'dual') continue;

    // Important dates within 14 days
    for (const d of (c.important_dates || [])) {
      if (!d.date) continue;
      // Handle MM-DD format
      let dateStr = d.date;
      if (dateStr.length === 5) { // MM-DD
        dateStr = `${today.getFullYear()}-${dateStr}`;
      }
      const targetDate = new Date(dateStr);
      if (isNaN(targetDate)) continue;
      const daysAhead = Math.floor((targetDate - today) / 86400000);
      if (daysAhead >= 0 && daysAhead <= 14) {
        nurtureReminders.push({
          name: c.name,
          type: 'important_date',
          label: d.label,
          date: d.date,
          daysAhead,
        });
      }
    }

    // Memory follow-up: check memories for event keywords
    for (const m of (c.memories || [])) {
      const content = typeof m === 'string' ? m : (m.content || '');
      if (/考试|手术|出差|面试|搬家|生产|住院|升职|跳槽/.test(content)) {
        nurtureReminders.push({
          name: c.name,
          type: 'memory_followup',
          content: content.slice(0, 60),
        });
      }
    }
  }

  // ── Format for LLM ──
  const parts = [];

  if (topLeverage.length > 0) {
    parts.push(`💡 这周值得联系的人（${topLeverage.length}位）\n`);
    for (const c of topLeverage) {
      const icon = c.daysSince >= 21 ? '🔴' : c.daysSince === 9999 ? '⚪' : '🟡';
      let line = `${icon} ${c.contact.name} — ${c.daysSince === 9999 ? '从未联系' : c.daysSince + '天没联系了'}`;
      if (c.leverageGoals && c.leverageGoals.length > 0) {
        line += `\n   为「${Array.isArray(c.leverageGoals) ? c.leverageGoals.join(', ') : String(c.leverageGoals)}」联结`;
      }
      if (c.leverageHow) {
        line += `\n   联结方式：${c.leverageHow}`;
      }
      if (c.lastInteraction) {
        line += `\n   上次：${c.lastInteraction.slice(0, 60)}`;
      }
      if (c.pendingTodos.length > 0) {
        line += `\n   待办：${c.pendingTodos.join('; ')}`;
      }
      parts.push(line);
    }
  }

  if (nurtureReminders.length > 0) {
    parts.push('\n💛 值得记得的事\n');
    for (const r of nurtureReminders.slice(0, 5)) {
      if (r.type === 'important_date') {
        parts.push(`  · ${r.name}的${r.label || ''} ${r.daysAhead === 0 ? '就是今天' : r.daysAhead + '天后'}`);
      } else if (r.type === 'memory_followup') {
        parts.push(`  · ${r.name}：你记着「${r.content}」`);
      }
    }
  }

  if (parts.length === 0) {
    return { status: 200, data: { result: '这周没有特别需要联系的。继续保持用心就好 😊', advise_id: null } };
  }

  // LLM enhanced formatting with conversation topics
  const llmResp = await callLLM(parts.join('\n'), await getPrompt(env, 'advise', ADVISE_SYSTEM), env);
  const llmResult = llmResp ? llmResp.text : null;
  // P0-1: Track advise generation (North Star metric)
  const adviseId = await registerAdvise(env, userId);
  return { status: 200, data: { result: llmResult || parts.join('\n'), raw: parts, advise_id: adviseId } };
}

// ── LLM call (Anthropic-compatible API) ──

async function callLLM(prompt, system, env, options = {}) {
  const apiKey = env.LLM_API_KEY;
  if (!apiKey) {
    console.error('LLM_API_KEY not set');
    return null;
  }

  // Model tier selection: standard (default), enhanced, premium
  const tier = options.model_tier || 'standard';
  const tierModels = {
    standard: env.LLM_MODEL || 'MiniMax-M3',
    enhanced: env.LLM_MODEL_ENHANCED || 'claude-sonnet-4-6',
    premium: env.LLM_MODEL_PREMIUM || 'claude-opus-4-6',
  };
  const tierBaseUrls = {
    standard: env.LLM_BASE_URL || 'https://api.minimaxi.com/anthropic',
    enhanced: env.LLM_BASE_URL_ENHANCED || 'https://api.anthropic.com',
    premium: env.LLM_BASE_URL_PREMIUM || 'https://api.anthropic.com',
  };
  const tierApiKeys = {
    standard: apiKey,
    enhanced: env.LLM_API_KEY_ENHANCED || apiKey,
    premium: env.LLM_API_KEY_PREMIUM || apiKey,
  };

  const model = tierModels[tier] || tierModels.standard;
  const baseUrl = tierBaseUrls[tier] || tierBaseUrls.standard;
  const useApiKey = tierApiKeys[tier] || apiKey;

  const body = {
    model: model,
    max_tokens: options.max_tokens || 1024,
    messages: options.messages || [{ role: 'user', content: prompt }],
  };
  // Premium tier uses priority service_tier (1.5x price, faster + more reliable)
  if (tier === 'premium') {
    body.service_tier = 'priority';
  }
  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }
  if (system) {
    body.system = system;
  }

  // Retry up to 2 times on failure (MiniMax can be flaky)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': useApiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (resp.ok) {
        const data = await resp.json();
        const content = data.content;
        if (!content || !Array.isArray(content)) {
          if (attempt < 2) continue;
          return null;
        }

        let text = null;
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            text = block.text;
            break;
          }
        }
        if (!text) {
          if (attempt < 2) continue;
          return null;
        }

        const usage = data.usage || { input_tokens: 0, output_tokens: 0 };
        const stopReason = data.stop_reason || data.finish_reason || null;
        return { text, usage, stop_reason: stopReason };
      }

      // Non-OK response
      const errText = await resp.text();
      console.error(`LLM error (attempt ${attempt + 1}): ${resp.status} ${errText.substring(0, 300)}`);
      if (resp.status >= 500 && attempt < 2) {
        // Server error — retry after short delay
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      // Client error — don't retry
      return null;
    } catch (e) {
      console.error(`LLM fetch error (attempt ${attempt + 1}): ${e.message}`);
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

// ── Streaming LLM call (for WebSocket chat) ──
// Calls LLM with stream:true, returns an async generator yielding text deltas.
async function* callLLMStream(prompt, system, env, options = {}) {
  const apiKey = env.LLM_API_KEY;
  if (!apiKey) {
    console.error('LLM_API_KEY not set');
    return null;
  }

  const tier = options.model_tier || 'standard';
  const tierModels = {
    standard: env.LLM_MODEL || 'MiniMax-M3',
    enhanced: env.LLM_MODEL_ENHANCED || 'claude-sonnet-4-6',
    premium: env.LLM_MODEL_PREMIUM || 'claude-opus-4-6',
  };
  const tierBaseUrls = {
    standard: env.LLM_BASE_URL || 'https://api.minimaxi.com/anthropic',
    enhanced: env.LLM_BASE_URL_ENHANCED || 'https://api.anthropic.com',
    premium: env.LLM_BASE_URL_PREMIUM || 'https://api.anthropic.com',
  };
  const tierApiKeys = {
    standard: apiKey,
    enhanced: env.LLM_API_KEY_ENHANCED || apiKey,
    premium: env.LLM_API_KEY_PREMIUM || apiKey,
  };

  const model = tierModels[tier] || tierModels.standard;
  const baseUrl = tierBaseUrls[tier] || tierBaseUrls.standard;
  const useApiKey = tierApiKeys[tier] || apiKey;

  const body = {
    model,
    max_tokens: options.max_tokens || 1024,
    messages: options.messages || [{ role: 'user', content: prompt }],
    stream: true,
  };
  if (system) body.system = system;
  if (options.temperature !== undefined) body.temperature = options.temperature;

  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': useApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`LLM stream error: ${resp.status} ${errText.substring(0, 300)}`);
    return null;
  }

  // Parse SSE stream: events separated by \n\n, each has "event: ..." and "data: ..."
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let totalUsage = { input_tokens: 0, output_tokens: 0 };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE events
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const eventStr = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      // Extract data line
      const dataMatch = eventStr.match(/^data: (.+)$/m);
      if (!dataMatch) continue;

      try {
        const data = JSON.parse(dataMatch[1]);
        // content_block_delta has the text delta
        if (data.type === 'content_block_delta' && data.delta?.text) {
          yield data.delta.text;
        }
        // message_delta has usage info
        if (data.type === 'message_delta' && data.usage) {
          totalUsage.output_tokens = data.usage.output_tokens || totalUsage.output_tokens;
        }
        // message_start has input usage
        if (data.type === 'message_start' && data.message?.usage) {
          totalUsage.input_tokens = data.message.usage.input_tokens || 0;
        }
      } catch (e) {
        // Not valid JSON, skip
      }
    }
  }

  // Store usage for the caller to read after generator completes
  callLLMStream._lastUsage = totalUsage;
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
  const llmResp = await callLLM(prompt, await getPrompt(env, 'draft', DRAFT_SYSTEM), env);
  let result = llmResp ? llmResp.text : null;

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

  // P0-1: Track draft generation (North Star metric) — best-effort, don't block on auth
  try {
    const userId = await getVerifiedUserId(req, env, body);
    if (userId) await trackAction(env, userId, 'draft_generated', { draft_recipient: name });
  } catch (e) { /* best-effort tracking, don't block draft response */ }

  return { result };
}

async function handleExtract(req, env) {
  const body = await req.json();

  const interactionText = body.interaction_text || '';
  const contactName = body.contact_name || '';

  const prompt = `Interaction: ${interactionText}\nContact: ${contactName || 'unknown'}`;
  const llmResp = await callLLM(prompt, await getPrompt(env, 'extract', EXTRACT_SYSTEM), env);
  const result = llmResp ? llmResp.text : null;

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
  const llmResp = await callLLM(parts.join('\n'), await getPrompt(env, 'advise', ADVISE_SYSTEM), env);
  const llmResult = llmResp ? llmResp.text : null;
  return { result: llmResult || parts.join('\n') };
}

// ── 方案C：计费网关 ──

// ── Cloud billing system ──

const DEFAULT_PRICING = {
  points_per_1k_input: 0.1,
  points_per_1k_output: 0.2,
  free_monthly: 100,
  pro_monthly: 500,
  // Base prices (before discount)
  pro_price_usd: 4.99,
  pro_price_yearly_usd: 49,
  credit_pack_100_usd: 1.99,
  credit_pack_500_usd: 7.99,
  discount: 100,              // discount percentage (100 = no discount)
};

// ── Paddle product config ──
// Set these in wrangler vars or KV. Paddle price_id maps to product.
const PADDLE_PRODUCTS = {
  pro_monthly:   { price_id_env: 'PADDLE_PRICE_PRO_MONTHLY',   type: 'upgrade',  id: 'pro_monthly',  usd: 4.99 },
  pro_yearly:    { price_id_env: 'PADDLE_PRICE_PRO_YEARLY',    type: 'upgrade',  id: 'pro_yearly',   usd: 49 },
  credits_100:   { price_id_env: 'PADDLE_PRICE_CREDITS_100',   type: 'purchase', id: '100',          usd: 1.99 },
  credits_500:   { price_id_env: 'PADDLE_PRICE_CREDITS_500',   type: 'purchase', id: '500',          usd: 7.99 },
};

function paddleApiBase(env) {
  return env.PADDLE_ENVIRONMENT === 'production'
    ? 'https://api.paddle.com'
    : 'https://sandbox-api.paddle.com';
}

const ADMIN_EMAIL = 'farmost@gmail.com';

async function getPricing(env) {
  const raw = await env.USER_DATA.get('pricing:global');
  const p = raw ? { ...DEFAULT_PRICING, ...JSON.parse(raw) } : { ...DEFAULT_PRICING };
  // Compute discounted prices for display
  const discount = p.discount ?? 100;
  const ratio = discount / 100;
  p.pro_price_usd_display = Math.round((p.pro_price_usd * ratio) * 100) / 100;
  p.pro_price_yearly_usd_display = Math.round((p.pro_price_yearly_usd * ratio) * 100) / 100;
  p.credit_pack_100_usd_display = Math.round((p.credit_pack_100_usd * ratio) * 100) / 100;
  p.credit_pack_500_usd_display = Math.round((p.credit_pack_500_usd * ratio) * 100) / 100;
  return p;
}

async function savePricing(env, pricing) {
  // Strip display fields — they're computed by getPricing, not stored
  const { pro_price_usd_display, pro_price_yearly_usd_display, credit_pack_100_usd_display, credit_pack_500_usd_display, ...toStore } = pricing;
  await env.USER_DATA.put('pricing:global', JSON.stringify(toStore));
}

async function isAdmin(userId, env) {
  if (!userId) return false;
  // Check cache first
  const cacheKey = `admin:${userId}`;
  const cached = await env.USER_DATA.get(cacheKey);
  if (cached === 'true') return true;
  if (cached === 'false') return false;
  // Query Clerk API for user email
  const clerkSecretKey = env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) return false;
  try {
    const resp = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${clerkSecretKey}` },
    });
    if (!resp.ok) return false;
    const user = await resp.json();
    const emails = (user.email_addresses || []).map(e => e.email_address);
    const isAdminUser = emails.includes(ADMIN_EMAIL);
    // Cache for 1 hour
    await env.USER_DATA.put(cacheKey, isAdminUser ? 'true' : 'false', { expirationTtl: 3600 });
    return isAdminUser;
  } catch (e) {
    console.error('Admin check error:', e.message);
    return false;
  }
}

const DEFAULT_MODEL_MULTIPLIERS = { standard: 1, enhanced: 3, premium: 10 };

async function getModelMultipliers(env) {
  const pricing = await getPricing(env);
  return pricing.model_multipliers || DEFAULT_MODEL_MULTIPLIERS;
}

async function getBillingData(env, userId) {
  const raw = await env.USER_DATA.get(`billing:${userId}`);
  if (raw) {
    const data = JSON.parse(raw);
    // Rollover: when month changes, carry over unused subscription allowance (max 1 month)
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (data.monthKey !== monthKey) {
      const allowance = await getMonthlyAllowance(data.plan, env);
      const prevRemaining = Math.max(0, allowance - data.used);
      data.rollover = Math.min(prevRemaining, allowance); // cap at 1 month's allowance
      data.monthKey = monthKey;
      data.used = 0;
      await saveBillingData(env, userId, data);
    }
    return data;
  }
  // Default: free plan
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return {
    plan: 'free',
    monthKey,
    used: 0,
    purchased: 0,        // purchased credits (don't expire monthly)
    rollover: 0,         // unused subscription credits from last month (max 1 month)
    history: [],          // [{date, action, points, detail}]
    subscription: null,   // {plan, start, expire, auto_renew}
  };
}

async function saveBillingData(env, userId, data) {
  try {
    await env.USER_DATA.put(`billing:${userId}`, JSON.stringify(data));
  } catch (e) {
    console.error('[saveBillingData] KV write failed (quota?):', e.message);
  }
}

// Reverse lookup: find user_id by Paddle subscription_id
// Uses KV index: paddle_sub:{subscription_id} → user_id
async function findUserBySubscriptionId(env, subscriptionId) {
  if (!subscriptionId) return null;
  // Check index first
  const cached = await env.USER_DATA.get(`paddle_sub:${subscriptionId}`);
  if (cached) return cached;
  // Fallback: scan recent billing records (expensive, but rare)
  // In practice, the index should be set when subscription is first created
  return null;
}

// Set reverse index when subscription is first associated
async function indexSubscriptionToUser(env, subscriptionId, userId) {
  if (!subscriptionId || !userId) return;
  await env.USER_DATA.put(`paddle_sub:${subscriptionId}`, userId);
}

async function calcPoints(usage, env) {
  if (!usage) return 0;
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const pricing = await getPricing(env);
  return input / 1000 * pricing.points_per_1k_input + output / 1000 * pricing.points_per_1k_output;
}

async function getMonthlyAllowance(plan, env) {
  const pricing = await getPricing(env);
  return plan === 'pro' ? pricing.pro_monthly : pricing.free_monthly;
}

async function getRemaining(billing, env) {
  const allowance = await getMonthlyAllowance(billing.plan, env);
  const rollover = billing.rollover || 0;
  return Math.max(0, allowance + rollover + billing.purchased - billing.used);
}

// ── Unified billing deduction (single entry point for all LLM calls) ──
// Mirrors the logic in handleChat — model tier multiplier + Pro discount.
// All billing deductions should go through this function for consistency.
async function deductBilling(env, userId, usage, action, detail = '', modelTier = 'standard') {
  const billing = await getBillingData(env, userId); // handles month rollover
  const multipliers = await getModelMultipliers(env);
  let tierMultiplier = multipliers[modelTier] || 1;
  // Pro 会员：增强模型不加倍率(×1)，高级模型降为 ×3
  if (billing.plan === 'pro') {
    if (modelTier === 'enhanced') tierMultiplier = 1;
    else if (modelTier === 'premium') tierMultiplier = Math.min(tierMultiplier, 3);
  }
  const basePoints = await calcPoints(usage, env);
  const points = Math.round(basePoints * tierMultiplier * 100) / 100;
  billing.used += points;
  billing.history.push({
    date: new Date().toISOString(),
    action,
    points,
    detail: detail || `tier=${modelTier}, input=${usage?.input_tokens || 0}, output=${usage?.output_tokens || 0}`,
  });
  if (billing.history.length > 100) billing.history = billing.history.slice(-100);
  await saveBillingData(env, userId, billing);
  return { billing, points };
}

async function handleChat(req, env) {
  const body = await req.json();

  const messages = body.messages;
  const system = body.system || '';
  const maxTokens = body.max_tokens || 1024;
  const temperature = body.temperature !== undefined ? body.temperature : 0.7;
  const modelTier = body.model_tier || 'standard';

  // Verify Clerk session and get user_id
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return { status: 400, data: { error: 'messages must be a non-empty array' } };
  }

  // ── Billing: check balance before LLM call ──
  const billing = await getBillingData(env, userId);
  // Reset monthly quota if new month
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (billing.monthKey !== monthKey) {
    billing.monthKey = monthKey;
    billing.used = 0;
  }
  const remaining = await getRemaining(billing, env);
  if (remaining <= 0) {
    const allowance = await getMonthlyAllowance(billing.plan, env);
    return {
      status: 402,
      data: {
        error: '联点已用完',
        detail: `本月已用 ${billing.used} 联点，额度 ${allowance} 联点。升级 Pro 或购买加油包继续使用。`,
        billing: { plan: billing.plan, used: billing.used, remaining: 0, allowance },
      },
    };
  }

  // Forward to LLM with Welian's wholesale API key
  const llmResp = await callLLM(null, system, env, {
    messages,
    max_tokens: maxTokens,
    temperature,
    model_tier: modelTier,
  });

  if (!llmResp) {
    return { status: 502, data: { error: 'LLM call failed' } };
  }

  // G3: Content filter circuit breaker
  // Detect content moderation blocks (Anthropic stop_reason or OpenAI finish_reason)
  const isContentFiltered = (reason) => {
    if (!reason || typeof reason !== 'string') return false;
    const r = reason.toLowerCase();
    return r === 'content_filter' || r === 'safety' || r === 'recitation' ||
           r === 'blocklist' || r === 'prohibited_content' || r === 'spii';
  };
  if (isContentFiltered(llmResp.stop_reason)) {
    console.log('[handleChat] Content filter triggered:', llmResp.stop_reason);
    // Return a graceful fallback instead of the blocked content
    return {
      status: 200,
      data: {
        reply: '抱歉，这条回复被内容安全系统拦截了。请尝试换个方式提问，或稍后再试。',
        usage: { input_tokens: 0, output_tokens: 0, points: 0 },
        billing: {
          plan: billing.plan,
          used: billing.used,
          remaining: await getRemaining(billing, env),
          allowance: await getMonthlyAllowance(billing.plan, env),
        },
        content_filtered: true,
      },
    };
  }

  // ── Billing: deduct points after LLM call (unified) ──
  const { billing: billResult, points } = await deductBilling(
    env, userId, llmResp.usage, 'chat', '', modelTier
  );

  // ── Implicit intent capture: when intent is 'chat' (no 记/问/拟/报/会 match),
  //     silently check if the user's message contains recordable relationship
  //     info. If so, append a gentle prompt asking whether to save it.
  //     No auto-recording — only prompts the user. Uses the standard (cheapest)
  //     model tier, and is rate-limited to 3 prompts per user per day via KV.
  let replyText = llmResp.text;
  const intent = body.intent || 'chat';
  if (intent === 'chat') {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const userText = typeof lastUser?.content === 'string' ? lastUser.content : '';
    if (userText.length > 10) {
      try {
        // Frequency limit: max 3 implicit prompts per user per day
        const todayKey = localDateStr(req);
        const freqKey = `implicit_prompt_count:${userId}:${todayKey}`;
        const countRaw = await env.USER_DATA.get(freqKey);
        const promptCount = countRaw ? parseInt(countRaw, 10) : 0;
        if (promptCount < 3) {
          const implicitSystem = await getPrompt(env, 'implicit_extract', IMPLICIT_EXTRACT_SYSTEM);
          const implicitResp = await callLLM(
            `判断用户消息是否包含可以记录的关系信息。只返回 JSON：\n{"has_relation_info": true/false, "type": "interaction|todo|date|contact_update|none", "summary": "一句话概述"}\n\n用户消息：${userText}`,
            implicitSystem,
            env,
            { max_tokens: 200, temperature: 0, model_tier: 'standard' }
          );
          if (implicitResp) {
            let implicitParsed = null;
            try {
              const jsonMatch = implicitResp.text.match(/\{[\s\S]*\}/);
              implicitParsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
            } catch (e) {
              implicitParsed = null;
            }
            if (implicitParsed && implicitParsed.has_relation_info === true) {
              replyText = `${replyText}\n\n💡 顺便问一下，要我把这个记下来吗？`;
              // Increment daily prompt count only when we actually prompt
              await env.USER_DATA.put(freqKey, String(promptCount + 1));
            }
          }
        }
      } catch (e) {
        console.log('[handleChat] implicit extract error:', e.message);
      }
    }
  }

  // Return reply + usage + billing info
  return {
    status: 200,
    data: {
      reply: replyText,
      usage: {
        input_tokens: llmResp.usage.input_tokens || 0,
        output_tokens: llmResp.usage.output_tokens || 0,
        points: points,
      },
      billing: {
        plan: billResult.plan,
        used: billResult.used,
        remaining: await getRemaining(billResult, env),
        allowance: await getMonthlyAllowance(billResult.plan, env),
      },
    },
  };
}

async function handleBilling(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  const billing = await getBillingData(env, userId);
  // Reset monthly quota if new month
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (billing.monthKey !== monthKey) {
    billing.monthKey = monthKey;
    billing.used = 0;
    await saveBillingData(env, userId, billing);
  }

  return {
    status: 200,
    data: {
      plan: billing.plan,
      used: billing.used,
      remaining: await getRemaining(billing, env),
      allowance: await getMonthlyAllowance(billing.plan, env),
      rollover: billing.rollover || 0,
      purchased: billing.purchased,
      subscription: billing.subscription,
      recent_history: billing.history.slice(-10),
    },
  };
}

async function handleUpgrade(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  const plan = body.plan; // 'pro_monthly' | 'pro_yearly'
  if (!plan) return { status: 400, data: { error: 'plan required' } };

  const billing = await getBillingData(env, userId);
  const now = new Date();
  let expire = new Date(now);
  if (plan === 'pro_monthly') {
    expire.setMonth(expire.getMonth() + 1);
  } else if (plan === 'pro_yearly') {
    expire.setFullYear(expire.getFullYear() + 1);
  } else {
    return { status: 400, data: { error: 'invalid plan' } };
  }

  billing.plan = 'pro';
  billing.subscription = {
    plan,
    start: now.toISOString(),
    expire: expire.toISOString(),
  };
  billing.history.push({
    date: now.toISOString(),
    action: 'upgrade',
    points: 0,
    detail: `upgraded to ${plan}`,
  });
  await saveBillingData(env, userId, billing);

  return {
    status: 200,
    data: {
      ok: true,
      plan: billing.plan,
      subscription: billing.subscription,
      remaining: await getRemaining(billing, env),
      allowance: await getMonthlyAllowance(billing.plan, env),
    },
  };
}

async function handlePurchaseCredits(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  const pack = body.pack; // '100' | '500'
  const points = pack === '500' ? 500 : 100;
  if (!pack) return { status: 400, data: { error: 'pack required (100 or 500)' } };

  const billing = await getBillingData(env, userId);
  billing.purchased += points;
  billing.history.push({
    date: new Date().toISOString(),
    action: 'purchase',
    points,
    detail: `purchased ${points} credits`,
  });
  await saveBillingData(env, userId, billing);

  return {
    status: 200,
    data: {
      ok: true,
      purchased: billing.purchased,
      remaining: await getRemaining(billing, env),
    },
  };
}

// ── WeChat Pay orders (personal QR code mode) ──

async function getOrderPrices(env) {
  const p = await getPricing(env);
  return {
    upgrade_pro_monthly: p.pro_price_usd_display,
    upgrade_pro_yearly: p.pro_price_yearly_usd_display,
    purchase_100: p.credit_pack_100_usd_display,
    purchase_500: p.credit_pack_500_usd_display,
  };
}

async function handleCreateOrder(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  const { type, id, amount } = body;
  if (!type || !id) return { status: 400, data: { error: 'type and id required' } };

  const key = `${type}_${id}`;
  const orderPrices = await getOrderPrices(env);
  const expectedAmount = orderPrices[key];
  if (!expectedAmount) return { status: 400, data: { error: 'invalid product' } };

  const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const order = {
    order_id: orderId,
    user_id: userId,
    type,
    id,
    amount: expectedAmount,
    status: 'pending',
    created_at: new Date().toISOString(),
    confirmed_at: null,
  };

  await env.USER_DATA.put(`order:${orderId}`, JSON.stringify(order));
  // Also index by user for listing
  const userOrdersRaw = await env.USER_DATA.get(`orders:${userId}`) || '[]';
  const userOrders = JSON.parse(userOrdersRaw);
  userOrders.push(orderId);
  await env.USER_DATA.put(`orders:${userId}`, JSON.stringify(userOrders.slice(-50)));

  return { status: 200, data: { order_id: orderId, amount: expectedAmount, status: 'pending' } };
}

async function handleConfirmOrder(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  const { order_id } = body;
  if (!order_id) return { status: 400, data: { error: 'order_id required' } };

  const raw = await env.USER_DATA.get(`order:${order_id}`);
  if (!raw) return { status: 404, data: { error: 'order not found' } };

  const order = JSON.parse(raw);
  if (order.user_id !== userId) return { status: 403, data: { error: 'not your order' } };
  if (order.status === 'confirmed') return { status: 200, data: { ok: true, already_confirmed: true } };

  // Mark as confirmed
  order.status = 'confirmed';
  order.confirmed_at = new Date().toISOString();
  await env.USER_DATA.put(`order:${order_id}`, JSON.stringify(order));

  // Apply the purchase
  const billing = await getBillingData(env, userId);
  if (order.type === 'upgrade') {
    const now = new Date();
    let expire = new Date(now);
    if (order.id === 'pro_yearly') expire.setFullYear(expire.getFullYear() + 1);
    else expire.setMonth(expire.getMonth() + 1);
    billing.plan = 'pro';
    billing.subscription = { plan: order.id, start: now.toISOString(), expire: expire.toISOString() };
    billing.history.push({ date: now.toISOString(), action: 'upgrade', points: 0, detail: `paid $${order.amount} for ${order.id}` });
  } else if (order.type === 'purchase') {
    const points = order.id === '500' ? 500 : 100;
    billing.purchased += points;
    billing.history.push({ date: new Date().toISOString(), action: 'purchase', points, detail: `paid $${order.amount} for ${points} credits` });
  }
  await saveBillingData(env, userId, billing);

  return { status: 200, data: { ok: true, status: 'confirmed', plan: billing.plan, remaining: await getRemaining(billing, env) } };
}

async function handleListOrders(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  const userOrdersRaw = await env.USER_DATA.get(`orders:${userId}`) || '[]';
  const orderIds = JSON.parse(userOrdersRaw);
  const orders = [];
  for (const oid of orderIds.slice(-10)) {
    const raw = await env.USER_DATA.get(`order:${oid}`);
    if (raw) orders.push(JSON.parse(raw));
  }
  return { status: 200, data: { orders } };
}

// ── Paddle checkout + webhook ──

async function handlePaddleCheckout(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  const { product } = body; // 'pro_monthly' | 'pro_yearly' | 'credits_100' | 'credits_500'
  const prod = PADDLE_PRODUCTS[product];
  if (!prod) return { status: 400, data: { error: 'invalid product', available: Object.keys(PADDLE_PRODUCTS) } };

  const priceId = env[prod.price_id_env];
  if (!priceId) return { status: 500, data: { error: 'Paddle price ID not configured for ' + product } };

  // Check if discount applies
  const pricing = await getPricing(env);
  const discount = pricing.discount ?? 100;
  let discountId = null;

  if (discount < 100 && env.PADDLE_API_KEY) {
    try {
      const offPct = Math.round(100 - discount);
      const recur = product.startsWith('pro');
      // Cache key: discount ID by percentage + recur flag
      const cacheKey = `paddle_discount:${offPct}:${recur}`;
      // Try cached discount ID first
      const cached = await env.USER_DATA.get(cacheKey);
      if (cached) {
        discountId = cached;
        console.log(`[checkout] Using cached discount: ${discountId} (${offPct}% off)`);
      } else {
        // Create a percentage discount via Paddle API
        const dResp = await fetch(`${paddleApiBase(env)}/discounts`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.PADDLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'percentage',
            amount: String(offPct),
            description: `Welian ${offPct}% off`,
            enabled_for_checkout: true,
            recur: recur,
          }),
        });
        if (dResp.ok) {
          const dData = await dResp.json();
          discountId = dData.data?.id || null;
          if (discountId) {
            // Cache for 24 hours
            await env.USER_DATA.put(cacheKey, discountId, { expirationTtl: 86400 });
          }
          console.log(`[checkout] Discount created: ${discountId} (${offPct}% off)`);
        } else {
          const errText = await dResp.text().catch(() => '');
          console.log(`[checkout] Discount creation failed: ${dResp.status} ${errText}`);
        }
      }
    } catch (e) {
      console.log(`[checkout] Discount creation error: ${e.message}`);
    }
  } else if (discount < 100 && !env.PADDLE_API_KEY) {
    console.log('[checkout] Discount configured but PADDLE_API_KEY not set');
  }

  // Return price_id + discount_id + custom_data for frontend Paddle.Checkout.open()
  return {
    status: 200,
    data: {
      price_id: priceId,
      discount_id: discountId,
      product_type: prod.type,
      product_id: prod.id,
      user_id: userId,
    },
  };
}

async function handlePaddleWebhook(req, env) {
  // Paddle sends webhook events with a Paddle-Signature header
  const signature = req.headers.get('Paddle-Signature') || '';
  const rawBody = await req.text();
  console.log(`[webhook] Received event, signature len=${signature.length}, body len=${rawBody.length}`);

  // Verify signature
  const webhookSecret = env.PADDLE_WEBHOOK_SECRET;
  if (!webhookSecret) return { status: 500, data: { error: 'Webhook secret not configured' } };

  // Paddle signature format: "ts=1234567890;h1=abcdef..."
  const sigParts = {};
  for (const part of signature.split(';')) {
    const [k, v] = part.split('=');
    sigParts[k] = v;
  }
  const ts = sigParts.ts;
  const h1 = sigParts.h1;
  if (!ts || !h1) return { status: 401, data: { error: 'Invalid signature format' } };

  // Compute HMAC-SHA256: key = webhook_secret, message = ts:rawBody
  const keyData = new TextEncoder().encode(webhookSecret);
  const msgData = new TextEncoder().encode(`${ts}:${rawBody}`);
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBytes = await crypto.subtle.sign('HMAC', key, msgData);
  const computed = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (computed !== h1) {
    console.log(`[webhook] Signature mismatch: computed=${computed.substring(0,20)}... vs h1=${h1.substring(0,20)}...`);
    return { status: 401, data: { error: 'Signature verification failed' } };
  }

  const event = JSON.parse(rawBody);
  const eventType = event.event_type || event.alert_id;
  console.log(`[webhook] Event type: ${eventType}`);

  // Handle subscription events
  if (eventType === 'subscription.created' || eventType === 'subscription.updated' || eventType === 'subscription.canceled') {
    const subData = event.data;
    const subCustomData = subData?.custom_data || {};
    let subUserId = subCustomData.user_id;

    // Fallback: if no custom_data, try to find user by subscription_id in existing billing records
    if (!subUserId && subData?.id) {
      subUserId = await findUserBySubscriptionId(env, subData.id);
    }

    if (subUserId) {
      const billing = await getBillingData(env, subUserId);
      // Index subscription → user for future renewal lookups
      if (subData?.id) {
        await indexSubscriptionToUser(env, subData.id, subUserId);
      }
      if (eventType === 'subscription.canceled') {
        billing.subscription = billing.subscription || {};
        billing.subscription.status = 'canceled';
        billing.subscription.canceled_at = new Date().toISOString();
        billing.history.push({ date: new Date().toISOString(), action: 'cancel_sub', points: 0, detail: 'subscription canceled' });
      } else {
        billing.subscription = {
          ...billing.subscription,
          paddle_subscription_id: subData?.id,
          status: subData?.status || 'active',
          plan: subCustomData.product_id || billing.subscription?.plan,
          channel: 'paddle',
        };
      }
      await saveBillingData(env, subUserId, billing);
    }
    return { status: 200, data: { ok: true, handled: eventType } };
  }

  // Only process payment completed events
  if (eventType !== 'transaction.completed' && eventType !== 'payment_succeeded') {
    return { status: 200, data: { ok: true, ignored: eventType } };
  }

  const txData = event.data;
  const customData = txData?.custom_data || {};
  let userId = customData?.user_id;
  const productType = customData?.product_type;
  const productId = customData?.product_id;
  const transactionId = txData?.id;
  const subscriptionId = txData?.subscription_id;

  // Fallback for subscription renewals: custom_data may not be carried over
  // Look up user by subscription_id in existing billing records
  if (!userId && subscriptionId) {
    userId = await findUserBySubscriptionId(env, subscriptionId);
  }

  if (!userId) {
    console.log('[webhook] Missing user_id, ignoring');
    return { status: 200, data: { ok: true, ignored: 'missing user_id (no custom_data and no subscription match)' } };
  }
  console.log(`[webhook] Processing: user=${userId}, type=${productType}, id=${productId}`);

  // For renewals (transaction.completed with subscription_id but no product_type),
  // treat as subscription renewal — just extend the expiry
  if (!productType && subscriptionId) {
    const billing = await getBillingData(env, userId);
    if (billing.subscription?.paddle_subscription_id === subscriptionId && billing.plan === 'pro') {
      // Extend subscription expiry
      const now = new Date();
      let expire = new Date(billing.subscription.expire);
      if (billing.subscription.plan === 'pro_yearly') {
        expire.setFullYear(expire.getFullYear() + 1);
      } else {
        expire.setMonth(expire.getMonth() + 1);
      }
      billing.subscription.expire = expire.toISOString();
      billing.subscription.status = 'active';
      billing.history.push({ date: now.toISOString(), action: 'renewal', points: 0, detail: `paddle renewal for ${subscriptionId}` });
      await saveBillingData(env, userId, billing);
      return { status: 200, data: { ok: true, status: 'renewed', user_id: userId } };
    }
  }

  if (!productType) {
    return { status: 200, data: { ok: true, ignored: 'missing product_type' } };
  }

  // Find and update order
  const orderId = `paddle_${transactionId}`;
  const orderRaw = await env.USER_DATA.get(`order:${orderId}`);
  let order = orderRaw ? JSON.parse(orderRaw) : null;

  if (order && order.status === 'confirmed') {
    return { status: 200, data: { ok: true, already_confirmed: true } };
  }

  if (order) {
    order.status = 'confirmed';
    order.confirmed_at = new Date().toISOString();
    await env.USER_DATA.put(`order:${orderId}`, JSON.stringify(order));
  }

  // Apply the purchase
  const billing = await getBillingData(env, userId);
  if (productType === 'upgrade') {
    const now = new Date();
    let expire = new Date(now);
    if (productId === 'pro_yearly') expire.setFullYear(expire.getFullYear() + 1);
    else expire.setMonth(expire.getMonth() + 1);
    billing.plan = 'pro';
    billing.subscription = {
      plan: productId,
      start: now.toISOString(),
      expire: expire.toISOString(),
      channel: 'paddle',
      status: 'active',
      paddle_subscription_id: subscriptionId || billing.subscription?.paddle_subscription_id,
    };
    billing.history.push({ date: now.toISOString(), action: 'upgrade', points: 0, detail: `paddle paid $${txData?.totals?.total || '?'} for ${productId}` });
    // Index subscription → user for renewal lookups
    if (subscriptionId) {
      await indexSubscriptionToUser(env, subscriptionId, userId);
    }
  } else if (productType === 'purchase') {
    const points = productId === '500' ? 500 : 100;
    billing.purchased += points;
    billing.history.push({ date: new Date().toISOString(), action: 'purchase', points, detail: `paddle paid $${txData?.totals?.total || '?'} for ${points} credits` });
    console.log(`[webhook] Credits added: +${points} for user=${userId}, total purchased=${billing.purchased}`);
  }
  await saveBillingData(env, userId, billing);
  console.log(`[webhook] Billing saved for user=${userId}`);

  // Send receipt email (async, don't block response)
  getUserEmailFromClerk(env, userId).then(email => {
    if (email) {
      const detail = {
        product: productType === 'upgrade' ? `Pro ${productId === 'pro_yearly' ? '年付' : '月付'}` : `${productId === '500' ? 500 : 100} 联点`,
        amount: `$${txData?.totals?.total || '?'}`,
        credits: productType === 'purchase' ? (productId === '500' ? 500 : 100) : (productId === 'pro_yearly' ? 6000 : 500),
        date: new Date().toLocaleDateString('zh-CN'),
      };
      sendReceiptEmail(env, email, detail);
    }
  }).catch(e => console.log('[email] receipt send failed:', e.message));

  return { status: 200, data: { ok: true, status: 'confirmed', user_id: userId, plan: billing.plan } };
}

async function handlePaddleCancel(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  const billing = await getBillingData(env, userId);
  const subId = billing.subscription?.paddle_subscription_id;
  if (!subId) return { status: 400, data: { error: 'No active subscription' } };

  // Try Paddle API first, but fall back to local cancel if API fails
  const apiKey = env.PADDLE_API_KEY;
  if (apiKey) {
    try {
      const resp = await fetch(`${paddleApiBase(env)}/subscriptions/${subId}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!resp.ok) {
        const err = await resp.text();
        console.log('Paddle cancel API failed, falling back to local cancel:', err);
      }
    } catch (e) {
      console.log('Paddle cancel API error, falling back to local cancel:', e.message);
    }
  }

  // Update local state regardless (webhook would confirm if API succeeded)
  billing.subscription.status = 'canceled';
  billing.subscription.canceled_at = new Date().toISOString();
  billing.history.push({ date: new Date().toISOString(), action: 'cancel_sub', points: 0, detail: 'canceled via API' });
  await saveBillingData(env, userId, billing);

  return { status: 200, data: { ok: true, status: 'canceled' } };
}

// ── Delete account (注销即焚) ──

async function handleDeleteAccount(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  // Delete all user data from KV
  const datasets = ['contacts', 'timeline', 'todos'];
  for (const ds of datasets) {
    await saveDataset(env, userId, ds, []);
  }
  // Delete billing data
  await env.USER_DATA.delete(`billing:${userId}`);
  // Delete orders
  const ordersRaw = await env.USER_DATA.get(`orders:${userId}`) || '[]';
  const orderIds = JSON.parse(ordersRaw);
  for (const oid of orderIds) {
    await env.USER_DATA.delete(`order:${oid}`);
  }
  await env.USER_DATA.delete(`orders:${userId}`);
  // Delete wechat binding
  const wechatId = await env.USER_DATA.get(`wechat_user:${userId}`);
  if (wechatId) {
    await env.USER_DATA.delete(`wechat_bind:${wechatId}`);
    await env.USER_DATA.delete(`wechat_user:${userId}`);
  }
  // Delete chat sessions
  await env.USER_DATA.delete(`sessions:${userId}`);
  // Delete report caches (weekly/monthly/hn_signals) — KV list + delete by prefix
  const cachePrefixes = [
    `weekly_cache:${userId}:`,
    `monthly_cache:${userId}:`,
    `hn_signals:${userId}:`,
  ];
  for (const prefix of cachePrefixes) {
    let cursor;
    do {
      const listResult = await env.USER_DATA.list({ prefix, cursor });
      for (const key of listResult.keys) {
        await env.USER_DATA.delete(key.name);
      }
      cursor = listResult.list_complete ? undefined : listResult.cursor;
    } while (cursor);
  }
  // Delete Clerk account via Backend API (doesn't require deleteSelfEnabled)
  const clerkSecretKey = env.CLERK_SECRET_KEY;
  let clerkDeleted = false;
  if (clerkSecretKey) {
    try {
      const clerkResp = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${clerkSecretKey}`,
          'Content-Type': 'application/json',
        },
      });
      clerkDeleted = clerkResp.ok;
      if (!clerkDeleted) {
        const errBody = await clerkResp.text().catch(() => '');
        console.log(`[deleteAccount] Clerk delete failed: ${clerkResp.status} ${errBody}`);
      }
    } catch (e) {
      console.log(`[deleteAccount] Clerk delete error: ${e.message}`);
    }
  }

  return { status: 200, data: { ok: true, deleted: true, clerk_deleted: clerkDeleted } };
}

// ── Email (Resend) ──

async function getUserEmailFromClerk(env, userId) {
  const clerkSecretKey = env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) return null;
  try {
    const resp = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${clerkSecretKey}` },
    });
    if (!resp.ok) return null;
    const user = await resp.json();
    const primaryEmailId = user.primary_email_address_id;
    const emailObj = (user.email_addresses || []).find(e => e.id === primaryEmailId);
    return emailObj?.email_address || null;
  } catch (e) {
    console.log(`[email] Clerk lookup failed: ${e.message}`);
    return null;
  }
}

async function sendEmail(env, to, subject, html) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) { console.log('[email] RESEND_API_KEY not set'); return false; }
  // Use verified domain if available, fallback to Resend's testing sender
  const from = 'Welian <contact@welian.app>';
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.log(`[email] Send failed: ${resp.status} ${err}`);
      return false;
    }
    const data = await resp.json();
    console.log(`[email] Sent: ${data.id} to ${to}`);
    return true;
  } catch (e) {
    console.log(`[email] Error: ${e.message}`);
    return false;
  }
}

async function sendWelcomeEmail(env, email) {
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#2C2C2C">
  <h1 style="color:#4A6741">欢迎来到 Welian 🌱</h1>
  <p>每段关系都值得用心。</p>
  <p>Welian 是你的关系网络智能体，帮你：</p>
  <ul>
    <li>📝 随手记录每次互动</li>
    <li>🔔 智能提醒该联系谁</li>
    <li>📋 每周自动生成周报</li>
    <li>✍️ 帮你拟写消息草稿</li>
  </ul>
  <p>第一步：添加几个重要的人，开始记录你们的互动。</p>
  <a href="https://welian.app" style="display:inline-block;padding:12px 28px;background:#4A6741;color:#fff;text-decoration:none;border-radius:8px;margin:16px 0">开始使用</a>
  <p style="color:#8B8B8B;font-size:.8em;margin-top:24px">— Welian 小维 · <a href="https://welian.app" style="color:#4A6741">welian.app</a></p>
</body></html>`;
  return sendEmail(env, email, '欢迎来到 Welian 🌱', html);
}

async function sendReceiptEmail(env, email, detail) {
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#2C2C2C">
  <h1 style="color:#4A6741">付款确认 ✓</h1>
  <p>你的支付已成功处理。</p>
  <div style="background:#FAFAF7;border:1px solid #E0E0E0;border-radius:8px;padding:16px;margin:16px 0">
    <p style="margin:4px 0"><strong>商品：</strong>${detail.product}</p>
    <p style="margin:4px 0"><strong>金额：</strong>${detail.amount}</p>
    <p style="margin:4px 0"><strong>联点：</strong>+${detail.credits}</p>
    <p style="margin:4px 0"><strong>日期：</strong>${detail.date}</p>
  </div>
  <p>感谢你的支持！</p>
  <a href="https://welian.app" style="display:inline-block;padding:12px 28px;background:#4A6741;color:#fff;text-decoration:none;border-radius:8px;margin:16px 0">继续使用</a>
  <p style="color:#8B8B8B;font-size:.8em;margin-top:24px">— Welian 小维 · <a href="https://welian.app" style="color:#4A6741">welian.app</a></p>
</body></html>`;
  return sendEmail(env, email, 'Welian 付款确认', html);
}

async function sendWeeklyReportEmail(env, email, reportSummary) {
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#2C2C2C">
  <h1 style="color:#4A6741">📋 本周关系回顾</h1>
  <p>${reportSummary.greeting || '本周回顾来啦～'}</p>
  <div style="background:#FAFAF7;border:1px solid #E0E0E0;border-radius:8px;padding:16px;margin:16px 0">
    <p style="margin:4px 0"><strong>本周互动：</strong>${reportSummary.interactions || 0} 次</p>
    <p style="margin:4px 0"><strong>新增待办：</strong>${reportSummary.new_todos || 0}</p>
    <p style="margin:4px 0"><strong>已完成：</strong>${reportSummary.completed_todos || 0}</p>
  </div>
  ${reportSummary.suggestions ? `<p><strong>下周建议联系：</strong></p><ul>${reportSummary.suggestions.map(s=>`<li>${s}</li>`).join('')}</ul>` : ''}
  <a href="https://welian.app" style="display:inline-block;padding:12px 28px;background:#4A6741;color:#fff;text-decoration:none;border-radius:8px;margin:16px 0">查看完整周报</a>
  <p style="color:#8B8B8B;font-size:.8em;margin-top:24px">— Welian 小维 · <a href="https://welian.app" style="color:#4A6741">welian.app</a></p>
</body></html>`;
  return sendEmail(env, email, '📋 Welian 周报回顾', html);
}

// ── Meeting prep (见面功课) ──

async function handleMeetingPrep(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  const { contact_id, contact_name } = body;
  let contact = null;
  const contacts = await loadDataset(env, userId, 'contacts');

  if (contact_id) {
    contact = contacts.find(c => c.id === contact_id);
  } else if (contact_name) {
    contact = contacts.find(c =>
      c.name === contact_name ||
      (c.aliases || []).includes(contact_name) ||
      (c.alias || []).includes(contact_name)
    );
  }

  if (!contact) return { status: 404, data: { error: 'contact not found' } };

  // Get timeline for this contact
  const allTimeline = await loadDataset(env, userId, 'timeline');
  const contactTimeline = allTimeline
    .filter(t => t.contact === contact.id)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 5);

  // Get pending todos
  const todos = await loadDataset(env, userId, 'todos');
  const contactTodos = todos.filter(t => t.contact === contact.id && !isTodoDone(t));

  // Build context for AI
  const context = {
    contact: { name: contact.name, relation: contact.relation, nature: contact.nature },
    last_interactions: contactTimeline.map(t => ({ date: t.date, summary: t.summary || t.action })),
    pending_todos: contactTodos.map(t => t.task),
    nurture: contact.nurture || {},
    memories: (contact.memories || []).slice(0, 5),
    important_dates: contact.important_dates || [],
  };

  // Call LLM for meeting prep suggestions
  const system = await getPrompt(env, 'meeting_prep', `You are Welian (小维), a social relationship assistant. The user is about to meet someone. Based on the contact info, recent interactions, and pending todos, provide a concise meeting prep briefing in the user's language (Chinese if contact names are Chinese, otherwise English). Include: 1) Last conversation recap (1-2 lines), 2) Pending items to follow up, 3) 2-3 conversation tips based on memories and important dates. Keep it under 200 words.`);

  const userMsg = `Contact: ${JSON.stringify(context)}`;

  const result = await callLLM(userMsg, system, env, { max_tokens: 512, temperature: 0.5, messages: [{ role: 'user', content: userMsg }] });

  // LLM fallback: if call fails, return raw context data with a default prep message
  // so the user still gets useful meeting info instead of a 500 error
  if (!result) {
    const lastInteraction = contactTimeline.length > 0
      ? `${contactTimeline[0].date}: ${contactTimeline[0].summary || contactTimeline[0].action || ''}`
      : '暂无互动记录';
    const pendingTodos = contactTodos.length > 0
      ? contactTodos.map(t => `• ${t.task}`).join('\n')
      : '暂无待办';
    const fallbackPrep = `📋 会前准备（离线模式）\n\n上次互动：${lastInteraction}\n\n待跟进事项：\n${pendingTodos}`;
    return {
      status: 200,
      data: {
        contact: { name: contact.name, relation: contact.relation, nature: contact.nature },
        timeline: contactTimeline,
        todos: contactTodos,
        prep: fallbackPrep,
        usage: { points: 0, remaining: 0, fallback: true },
      },
    };
  }

  // Billing (unified)
  const { billing, points } = await deductBilling(
    env, userId, result.usage, 'meeting_prep', `meeting prep for ${contact.name}`
  );

  return {
    status: 200,
    data: {
      contact: { name: contact.name, relation: contact.relation, nature: contact.nature },
      timeline: contactTimeline,
      todos: contactTodos,
      prep: result.text,
      usage: { points, remaining: await getRemaining(billing, env) },
    },
  };
}

// ── Meetings CRUD ──

async function handleMeetingsCRUD(req, env, method) {
  const body = method === 'GET' ? null : await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  if (method === 'GET') {
    const meetings = await loadDataset(env, userId, 'meetings');
    meetings.sort((a, b) => new Date(b.date || '1970-01-01') - new Date(a.date || '1970-01-01'));
    return { status: 200, data: { meetings, total: meetings.length } };
  }

  if (method === 'POST') {
    const title = (body.title || '').trim();
    if (!title) {
      return { status: 400, data: { error: 'title required' } };
    }

    // Update existing if id provided
    if (body.id) {
      const meetings = await loadDataset(env, userId, 'meetings');
      const idx = meetings.findIndex(m => m.id === body.id);
      if (idx >= 0) {
        meetings[idx] = { ...meetings[idx], ...body, id: body.id, updated: new Date().toISOString() };
        await saveDataset(env, userId, 'meetings', meetings);
        return { status: 200, data: { ok: true, meeting: meetings[idx] } };
      }
    }

    // Create new meeting (with dedup: merge into existing same-date+title meeting)
    const meetingDate = body.date || new Date().toISOString().slice(0, 10);
    const meetings = await loadDataset(env, userId, 'meetings');
    // Check for existing meeting with same date + similar title
    const existing = meetings.find(m =>
      m.date === meetingDate &&
      (m.title || '').trim() === title &&
      m.status !== 'completed'
    );
    if (existing) {
      // Merge: append new photos/attendees/agenda into existing meeting
      existing.photos = [...(existing.photos || []), ...(body.photos || [])];
      existing.attendees = [...(existing.attendees || []), ...(body.attendees || [])];
      existing.agenda = [...(existing.agenda || []), ...(body.agenda || [])];
      if (body.location) existing.location = body.location;
      if (body.purpose) existing.purpose = body.purpose;
      existing.updated = new Date().toISOString();
      await saveDataset(env, userId, 'meetings', meetings);
      return { status: 200, data: { ok: true, meeting: existing, merged: true } };
    }
    const id = body.id || `mtg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const meeting = {
      id,
      title,
      date: meetingDate,
      location: body.location || '',
      purpose: body.purpose || '',
      status: body.status || 'planned',
      agenda: body.agenda || [],
      attendees: body.attendees || [],
      opportunities: body.opportunities || [],
      contact_dynamics: body.contact_dynamics || '',
      follow_ups: body.follow_ups || [],
      goal_links: body.goal_links || [],
      photos: body.photos || [],
      summary: body.summary || '',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
    meetings.push(meeting);
    await saveDataset(env, userId, 'meetings', meetings);
    return { status: 200, data: { ok: true, meeting } };
  }

  if (method === 'DELETE') {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return { status: 400, data: { error: 'id required' } };
    }
    let meetings = await loadDataset(env, userId, 'meetings');
    meetings = meetings.filter(m => m.id !== id);
    await saveDataset(env, userId, 'meetings', meetings);
    return { status: 200, data: { ok: true } };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

// ── Meeting photo recognition ──

async function handleMeetingPhoto(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  const { photo_type, base64, media_type, meeting_id, existing_attendees } = body;
  if (!base64 || !photo_type) {
    return { status: 400, data: { error: 'base64 and photo_type required' } };
  }

  const validTypes = ['agenda', 'card', 'notes', 'roster'];
  if (!validTypes.includes(photo_type)) {
    return { status: 400, data: { error: `photo_type must be one of: ${validTypes.join(', ')}` } };
  }

  // Build multimodal message with image
  const imageBlock = {
    type: 'image',
    source: {
      type: 'base64',
      media_type: media_type || 'image/jpeg',
      data: base64,
    },
  };

  const prompts = {
    agenda: `你是Welian小维的会议助手。请分析这张议程照片，提取以下信息并以JSON格式返回：
{
  "title": "会议名称（从议程推断）",
  "date": "日期（如能识别，格式YYYY-MM-DD，否则空）",
  "location": "地点（如能识别，否则空）",
  "agenda": [{"topic": "议题", "time": "时间（如09:30）", "presenter": "演讲人（如能识别）"}],
  "purpose": "会议目的（一句话概括）"
}
只返回JSON对象，第一个字符必须是{，最后一个字符必须是}。不要markdown代码块，不要任何解释文字。`,

    card: `你是Welian小维的会议助手。请分析这张名片/合影照片，识别其中的人物信息，以JSON格式返回：
{
  "attendees": [{"name": "姓名", "title": "职位（如能识别，否则空字符串）", "company": "公司（如能识别，否则空字符串）", "relationship": "与用户的关系（如能推断，否则空字符串）"}]
}
核心目标：识别出人名。其他信息（职位、公司等）能识别就填，识别不到就留空，不要猜测。
如果是名片，提取名片上的姓名和可选信息。如果是合影，识别能看到的人名（如胸牌、字幕等），识别不到具体名字的可以描述角色（如"主讲人""主持人"）。
只返回JSON对象，第一个字符必须是{，最后一个字符必须是}。不要markdown代码块，不要任何解释文字。`,

    notes: `你是Welian小维的会议助手。请分析这张会议笔记/白板照片，提取关键信息，以JSON格式返回：
{
  "opportunities": [{"description": "机会描述", "type": "collaboration|referral|insight|resource", "potential": "high|medium|low"}],
  "follow_ups": [{"task": "跟进事项", "contact_name": "相关人名（如有）", "due": "建议时间（如有）"}],
  "contact_dynamics": "人际观察（谁和谁熟、谁支持什么观点等，一段话）",
  "key_points": ["关键要点1", "关键要点2"]
}
只返回JSON对象，第一个字符必须是{，最后一个字符必须是}。不要markdown代码块，不要任何解释文字。`,

    roster: `你是Welian小维的会议助手。请分析这张参会名单/签到表/出席人员表照片，识别其中的参会人员，以JSON格式返回：
{
  "attendees": [{"name": "姓名", "title": "职位（如能识别，否则空字符串）", "company": "公司（如能识别，否则空字符串）", "relationship": "与用户的关系（如能推断，否则空字符串）"}]
}
核心目标：识别出名单上所有的人名。逐行逐列识别，不要遗漏。其他信息（职位、公司等）能识别就填，识别不到就留空，不要猜测。
只返回JSON对象，第一个字符必须是{，最后一个字符必须是}。不要markdown代码块，不要任何解释文字。`,
  };

  const system = prompts[photo_type];
  const userMsg = { type: 'text', text: '请分析这张图片并提取信息。' };

  const result = await callLLM(null, 'You are a helpful assistant that extracts structured data from images. Always respond with valid JSON only.', env, {
    max_tokens: 1024,
    model_tier: 'enhanced',
    messages: [{ role: 'user', content: [imageBlock, userMsg] }],
  });

  if (!result) {
    return { status: 200, data: { status: 'error', error: '图片识别失败，请重试', fallback: true } };
  }

  // Parse JSON from LLM response
  let extracted;
  let unstructured = false;
  try {
    // Strip markdown code fences if present
    const jsonText = result.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    extracted = JSON.parse(jsonText);
  } catch (e) {
    console.error('[meeting_photo] JSON parse failed:', e.message, result.text.substring(0, 200));
    // Fallback 1: try to extract the first { ... } block (LLM may have wrapped JSON in prose)
    try {
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) {
        extracted = JSON.parse(match[0]);
        console.log('[meeting_photo] recovered via fallback block extraction');
      } else {
        // Fallback 2: LLM returned prose with no JSON at all — return raw text so user sees what AI recognized
        console.log('[meeting_photo] no JSON block found, returning raw text');
        extracted = { raw_text: result.text };
        unstructured = true;
      }
    } catch (e2) {
      // Fallback 2: block extraction found something but it's not valid JSON — return raw text
      console.log('[meeting_photo] block extraction failed, returning raw text');
      extracted = { raw_text: result.text };
      unstructured = true;
    }
  }

  // For card and roster types: match attendees against existing contacts
  // (skip if unstructured — no attendees array to match)
  if (!unstructured && (photo_type === 'card' || photo_type === 'roster') && extracted.attendees) {
    const contacts = await loadDataset(env, userId, 'contacts');
    const existingNames = new Map(contacts.map(c => [c.name, c]));
    extracted.attendees = extracted.attendees.map(a => {
      const matched = existingNames.get(a.name);
      if (matched) {
        a.contact_id = matched.id;
        a.first_meeting = false;
        a.is_existing = true;
      } else {
        a.first_meeting = true;
        a.is_existing = false;
      }
      return a;
    });
  }

  // For agenda type: match existing attendees if provided
  if (photo_type === 'agenda' && existing_attendees && extracted.agenda) {
    extracted.attendees = existing_attendees;
  }

  // Billing
  const { billing, points } = await deductBilling(
    env, userId, result.usage, 'meeting_photo', `meeting photo ${photo_type}`
  );

  return {
    status: 200,
    data: {
      status: 'ok',
      photo_type,
      extracted,
      unstructured,
      usage: { points, remaining: await getRemaining(billing, env) },
    },
  };
}

// ── Meeting review (会后复盘) ──

async function handleMeetingReview(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  const { meeting_id } = body;
  if (!meeting_id) {
    return { status: 400, data: { error: 'meeting_id required' } };
  }

  const meetings = await loadDataset(env, userId, 'meetings');
  const meeting = meetings.find(m => m.id === meeting_id);
  if (!meeting) {
    return { status: 404, data: { error: 'meeting not found' } };
  }

  const contacts = await loadDataset(env, userId, 'contacts');
  let todos = await loadDataset(env, userId, 'todos');

  // Build context for LLM
  const attendeeNames = (meeting.attendees || []).map(a => a.name).filter(Boolean);
  const existingAttendees = (meeting.attendees || []).filter(a => a.contact_id);
  const existingContext = existingAttendees.map(a => {
    const c = contacts.find(c => c.id === a.contact_id);
    if (!c) return '';
    return `${c.name}（${c.company || ''}，${c.relation || ''}，上次互动：${(() => {
      const tl = todos.filter(t => t.contact === c.id && !isTodoDone(t));
      return tl.length > 0 ? `有待办${tl.length}条` : '无待办';
    })()}）`;
  }).filter(Boolean).join('\n');

  const system = `你是Welian小维，关系网络智能体。用户刚参加完一场会议，请基于会议信息生成会后复盘建议。

会议信息：
- 标题：${meeting.title}
- 日期：${meeting.date}
- 目的：${meeting.purpose || '未指定'}
- 议程：${JSON.stringify(meeting.agenda || [])}
- 参会人：${JSON.stringify(meeting.attendees || [])}
- 识别到的机会：${JSON.stringify(meeting.opportunities || [])}
- 人际观察：${meeting.contact_dynamics || '无'}
- 现有待办：${JSON.stringify(todos.filter(t => !isTodoDone(t)).slice(0, 10))}

已有联系人在场情况：
${existingContext || '无已有联系人'}

请以JSON格式返回复盘建议：
{
  "summary": "会议总结（2-3句话）",
  "new_contacts": [{"name": "新认识的人名", "company": "公司", "title": "职位", "relation": "建议关系类型", "nature": "leverage|nurture|dual"}],
  "follow_up_todos": [{"task": "具体行动描述", "contact_name": "相关人", "due": "建议日期YYYY-MM-DD", "priority": "high|medium|low"}],
  "opportunity_analysis": [{"description": "机会描述", "action": "建议行动", "contact_name": "相关人"}],
  "leverage_insights": "如何借这次会议撬动现有合作型联系人的建议（一段话）",
  "goal_suggestions": ["这次会议可能推进的目标方向"]
}

follow_up_todos 规则（重要）：
- 最多 5 条，按重要性排序，只选最值得跟进的
- 每条必须是具体可执行的行动，不是"联系XX探讨YY"这种模糊话题
- 格式："发[微信/邮件]给[姓名]（[公司]），[具体动作]" 或 "约[姓名]（[公司]）[时间]见面聊[具体话题]"
- 优先选择：有明确合作意向的 > 可索取演讲材料/报告的 > 单纯交换名片的
- 有潜力但非紧急的机会，放在 opportunity_analysis 里，不要变成 todo
- 如果会议没有值得立即跟进的事项，返回空数组 []

只返回JSON对象，第一个字符必须是{，最后一个字符必须是}。不要markdown代码块，不要任何解释文字。`;

  const result = await callLLM('请生成会后复盘建议。', system, env, {
    max_tokens: 2048,
    temperature: 0.5,
  });

  if (!result) {
    return { status: 200, data: { status: 'error', error: '复盘生成失败，请重试', fallback: true } };
  }

  let review;
  let reviewUnstructured = false;
  try {
    const jsonText = result.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    review = JSON.parse(jsonText);
  } catch (e) {
    // Fallback 1: try to extract the first { ... } block
    try {
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) {
        review = JSON.parse(match[0]);
        console.log('[meeting_review] recovered via fallback block extraction');
      } else {
        // Fallback 2: no JSON at all — use raw text as summary so user sees AI's output
        console.log('[meeting_review] no JSON block found, using raw text as summary');
        review = { summary: result.text, new_contacts: [], follow_up_todos: [], opportunity_analysis: [], leverage_insights: '', goal_suggestions: [] };
        reviewUnstructured = true;
      }
    } catch (e2) {
      // Fallback 2: block extraction found something but invalid JSON — use raw text as summary
      console.log('[meeting_review] block extraction failed, using raw text as summary');
      review = { summary: result.text, new_contacts: [], follow_up_todos: [], opportunity_analysis: [], leverage_insights: '', goal_suggestions: [] };
      reviewUnstructured = true;
    }
  }

  // Auto-create new contacts
  if (review.new_contacts && review.new_contacts.length > 0) {
    for (const nc of review.new_contacts) {
      if (!nc.name) continue;
      const exists = contacts.find(c => c.name === nc.name);
      if (!exists) {
        contacts.push({
          id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: nc.name,
          company: nc.company || '',
          title: nc.title || '',
          relation: nc.relation || '',
          nature: nc.nature || 'leverage',
          strength: 3,
          tags: [],
          platforms: {},
          phone: '',
          email: '',
          notes: `从会议「${meeting.title}」认识`,
          memories: [],
          important_dates: [],
          leverage: {},
          nurture: {},
          aliases: [],
          alias: [],
          snooze_until: '',
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        });
      }
    }
    await saveDataset(env, userId, 'contacts', contacts);
  }

  // Auto-create follow-up todos (capped at 5, deduplicated)
  const followUps = (review.follow_up_todos || []).slice(0, 5);
  let createdCount = 0;
  let skippedDupes = 0;
  if (followUps.length > 0) {
    for (const ft of followUps) {
      if (!ft.task) continue;
      const contact = ft.contact_name ? contacts.find(c => c.name === ft.contact_name) : null;
      // Dedupe: skip if same contact already has a pending todo from this meeting
      const taskPrefix = ft.task.slice(0, 10);
      const exists = todos.some(t =>
        t.status === 'pending' &&
        t.source === `meeting:${meeting.id}` &&
        t.contact === (contact ? contact.id : '') &&
        (t.task || '').includes(taskPrefix)
      );
      if (exists) { skippedDupes++; continue; }
      todos.push({
        id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        task: ft.task,
        contact: contact ? contact.id : '',
        status: 'pending',
        due: ft.due || '',
        priority: ft.priority || 'medium',
        source: `meeting:${meeting.id}`,
        created: new Date().toISOString(),
      });
      createdCount++;
    }
    if (createdCount > 0) {
      await saveDataset(env, userId, 'todos', todos);
    }
  }

  // Update meeting with review (persist full review so user can re-open it)
  meeting.summary = review.summary || '';
  meeting.review = review;
  meeting.status = 'completed';
  meeting.updated = new Date().toISOString();
  const idx = meetings.findIndex(m => m.id === meeting_id);
  meetings[idx] = meeting;
  await saveDataset(env, userId, 'meetings', meetings);

  // Auto-complete prep todos: mark pending todos whose task matches the meeting title as done
  // e.g. todo "拜访老许" → meeting "拜访老许" completed → todo auto-completed
  if (todos === null) todos = await loadDataset(env, userId, 'todos');
  let completedTodoCount = 0;
  const meetingTitle = meeting.title || '';
  if (meetingTitle && meetingTitle !== '未命名会议' && meetingTitle !== 'Untitled Meeting') {
    for (const t of todos) {
      if (t.status !== 'pending') continue;
      // Match: todo task contains meeting title, or meeting title contains todo task
      // (handles "拜访老许" todo vs "拜访老许 - Q3讨论" meeting, and vice versa)
      const task = t.task || '';
      if (task.length >= 2 && (task.includes(meetingTitle) || meetingTitle.includes(task))) {
        t.status = 'done';
        t.completed_at = new Date().toISOString();
        t.updated = new Date().toISOString();
        completedTodoCount++;
      }
    }
    if (completedTodoCount > 0) {
      await saveDataset(env, userId, 'todos', todos);
      console.log(`[meeting_review] Auto-completed ${completedTodoCount} prep todo(s) matching "${meetingTitle}"`);
    }
  }

  // Billing
  const { billing, points } = await deductBilling(
    env, userId, result.usage, 'meeting_review', `meeting review ${meeting.title}`
  );

  return {
    status: 200,
    data: {
      status: 'ok',
      review,
      meeting,
      unstructured: reviewUnstructured,
      auto_completed_todos: completedTodoCount,
      created_todos: createdCount,
      skipped_dupes: skippedDupes,
      opportunity_count: (review.opportunity_analysis || []).length,
      usage: { points, remaining: await getRemaining(billing, env) },
    },
  };
}

// ── Cost estimation ──

const COST_ESTIMATES = {
  chat: { input: 2000, output: 500 },
  draft: { input: 3000, output: 500 },
  advise: { input: 6000, output: 1500 },
  meeting_prep: { input: 4000, output: 1000 },
  weekly: { input: 8000, output: 2000 },
  monthly: { input: 5000, output: 2000 },
};

async function handleEstimateCost(req, env) {
  const body = await req.json().catch(() => ({}));
  const { action, model_tier } = body;
  const multipliers = await getModelMultipliers(env);
  const tier = multipliers[model_tier || 'standard'] || 1;
  const pricing = await getPricing(env);
  const est = COST_ESTIMATES[action];
  if (!est) return { status: 400, data: { error: 'unknown action' } };
  const points = Math.round((est.input / 1000 * pricing.points_per_1k_input + est.output / 1000 * pricing.points_per_1k_output) * tier * 100) / 100;
  return { status: 200, data: { action, model_tier: model_tier || 'standard', estimated_points: points } };
}

// ── WeChat bot binding ──

async function getClerkUserInfo(userId, env) {
  // Fetch user info from Clerk Backend API
  const secretKey = env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  try {
    const resp = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${secretKey}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const email = data.email_addresses?.find(e => e.id === data.primary_email_address_id)?.email_address || '';
    const firstName = data.first_name || '';
    const lastName = data.last_name || '';
    const name = (firstName + ' ' + lastName).trim() || data.username || email.split('@')[0] || '';
    return { name, email, username: data.username || '' };
  } catch (e) {
    console.error('Clerk user fetch error:', e.message);
    return null;
  }
}

async function getClerkUserIdByEmail(email, env) {
  const secretKey = env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  try {
    const resp = await fetch(`https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`, {
      headers: { 'Authorization': `Bearer ${secretKey}` },
    });
    if (!resp.ok) return null;
    const users = await resp.json();
    if (users.length === 0) return null;
    return users[0].id;
  } catch (e) {
    console.error('Clerk email lookup error:', e.message);
    return null;
  }
}

async function handleGiftCredits(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  const { recipient_email, points } = body;
  if (!recipient_email || !points) return { status: 400, data: { error: 'recipient_email and points required' } };
  const pts = Math.round(points * 10) / 10;
  if (pts < 10) return { status: 400, data: { error: '最少赠予 10 联点' } };
  if (pts > 500) return { status: 400, data: { error: '最多赠予 500 联点' } };

  // Can't gift yourself
  const senderInfo = await getClerkUserInfo(userId, env);
  if (senderInfo && senderInfo.email === recipient_email) {
    return { status: 400, data: { error: '不能赠予自己' } };
  }

  // Check sender has enough purchased credits
  const senderBilling = await getBillingData(env, userId);
  const senderRemaining = await getRemaining(senderBilling, env);
  if (senderRemaining < pts) {
    return { status: 402, data: { error: `联点不足，当前剩余 ${senderRemaining}` } };
  }

  // Find recipient by email
  const recipientId = await getClerkUserIdByEmail(recipient_email, env);
  if (!recipientId) return { status: 404, data: { error: '收件人未注册' } };

  // Transfer: deduct from sender purchased, add to recipient purchased
  senderBilling.purchased = Math.max(0, (senderBilling.purchased || 0) - pts);
  senderBilling.history.push({ date: new Date().toISOString(), action: 'gift_out', points: -pts, detail: `赠予 ${recipient_email}` });
  if (senderBilling.history.length > 100) senderBilling.history = senderBilling.history.slice(-100);
  await saveBillingData(env, userId, senderBilling);

  const recipientBilling = await getBillingData(env, recipientId);
  recipientBilling.purchased = (recipientBilling.purchased || 0) + pts;
  recipientBilling.history.push({ date: new Date().toISOString(), action: 'gift_in', points: pts, detail: `收到 ${senderInfo?.email || '好友'} 赠予` });
  if (recipientBilling.history.length > 100) recipientBilling.history = recipientBilling.history.slice(-100);
  await saveBillingData(env, recipientId, recipientBilling);

  return { status: 200, data: { ok: true, gifted: pts, remaining: await getRemaining(senderBilling, env) } };
}

// ── Coupon system (role play reward) ──

async function handleCreateCoupon(req, env) {
  const body = await req.json().catch(() => ({}));
  // No auth required — this is called from the frontend after completing role play
  // Generate a unique coupon code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const code = `WELIAN-${seg()}-${seg()}`;
  const points = body.points || 100;
  const coupon = { code, points, used: false, created: new Date().toISOString(), scenario: body.scenario || '' };
  await env.USER_DATA.put(`coupon:${code}`, JSON.stringify(coupon), { expirationTtl: 2592000 }); // 30 days
  return { status: 200, data: { ok: true, code, points } };
}

async function handleRedeemCoupon(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  const { code } = body;
  if (!code) return { status: 400, data: { error: 'Coupon code required' } };

  const raw = await env.USER_DATA.get(`coupon:${code.toUpperCase()}`);
  if (!raw) return { status: 404, data: { error: 'Invalid or already used coupon' } };
  const coupon = JSON.parse(raw);
  if (coupon.used) return { status: 400, data: { error: 'Coupon already used' } };

  // Mark as used
  coupon.used = true;
  coupon.redeemed_by = userId;
  coupon.redeemed_at = new Date().toISOString();
  await env.USER_DATA.put(`coupon:${code.toUpperCase()}`, JSON.stringify(coupon), { expirationTtl: 2592000 });

  // Add credits to user's purchased balance
  const billing = await getBillingData(env, userId);
  billing.purchased = (billing.purchased || 0) + coupon.points;
  billing.history.push({ date: new Date().toISOString(), action: 'coupon', points: coupon.points, detail: `奖券兑换 ${code}` });
  if (billing.history.length > 100) billing.history = billing.history.slice(-100);
  await saveBillingData(env, userId, billing);

  const remaining = await getRemaining(billing, env);
  return { status: 200, data: { ok: true, points: coupon.points, remaining } };
}

// ── Invite system: referral codes + reward both sides ──

async function handleInviteCreate(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  // Check if user already has an invite code
  const existing = await env.USER_DATA.get(`invite_code:${userId}`);
  if (existing) {
    // Return existing code + stats
    const stats = await getInviteStats(env, userId);
    return { status: 200, data: { ok: true, code: existing, ...stats } };
  }

  // Generate 6-char invite code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  let attempts = 0;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    attempts++;
    // Check for collision
    const collision = await env.USER_DATA.get(`invite_code_reverse:${code}`);
    if (!collision) break;
  } while (attempts < 10);

  await env.USER_DATA.put(`invite_code:${userId}`, code);
  await env.USER_DATA.put(`invite_code_reverse:${code}`, userId);

  return { status: 200, data: { ok: true, code, invited: [], total_credits: 0 } };
}

async function handleInviteRedeem(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  const { code } = body;
  if (!code) return { status: 400, data: { error: 'Invite code required' } };

  // Check if already invited by someone
  const alreadyInvited = await env.USER_DATA.get(`invited_by:${userId}`);
  if (alreadyInvited) return { status: 400, data: { error: 'already_invited', inviter: alreadyInvited } };

  // Find inviter by code
  const inviterId = await env.USER_DATA.get(`invite_code_reverse:${code.toUpperCase()}`);
  if (!inviterId) return { status: 404, data: { error: 'Invalid invite code' } };

  // Can't invite yourself
  if (inviterId === userId) return { status: 400, data: { error: '不能邀请自己' } };

  // Check invite limit (max 50 per inviter)
  const MAX_INVITES = 50;
  const inviteListRaw = await env.USER_DATA.get(`invite_list:${inviterId}`);
  const existingList = inviteListRaw ? JSON.parse(inviteListRaw) : [];
  if (existingList.length >= MAX_INVITES) {
    return { status: 400, data: { error: `邀请人数已达上限（${MAX_INVITES}人）` } };
  }

  // Record the invitation
  await env.USER_DATA.put(`invited_by:${userId}`, inviterId);

  // Add to inviter's invited list (reuse existingList from limit check)
  existingList.push({ user_id: userId, date: new Date().toISOString(), rewarded: true });
  await env.USER_DATA.put(`invite_list:${inviterId}`, JSON.stringify(existingList));

  // Reward: 100 credits to both inviter and invitee
  const REWARD = 100;

  // Inviter gets 100
  const inviterBilling = await getBillingData(env, inviterId);
  inviterBilling.purchased = (inviterBilling.purchased || 0) + REWARD;
  inviterBilling.history.push({ date: new Date().toISOString(), action: 'invite_reward', points: REWARD, detail: `邀请好友奖励` });
  if (inviterBilling.history.length > 100) inviterBilling.history = inviterBilling.history.slice(-100);
  await saveBillingData(env, inviterId, inviterBilling);

  // Invitee gets 100
  const inviteeBilling = await getBillingData(env, userId);
  inviteeBilling.purchased = (inviteeBilling.purchased || 0) + REWARD;
  inviteeBilling.history.push({ date: new Date().toISOString(), action: 'invite_bonus', points: REWARD, detail: `受邀注册奖励 (邀请码 ${code})` });
  if (inviteeBilling.history.length > 100) inviteeBilling.history = inviteeBilling.history.slice(-100);
  await saveBillingData(env, userId, inviteeBilling);

  const remaining = await getRemaining(inviteeBilling, env);
  return { status: 200, data: { ok: true, reward: REWARD, remaining } };
}

async function handleInviteStatus(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  const code = await env.USER_DATA.get(`invite_code:${userId}`);
  if (!code) return { status: 200, data: { ok: true, code: null, invited: [], total_credits: 0 } };

  const stats = await getInviteStats(env, userId);
  return { status: 200, data: { ok: true, code, ...stats } };
}

async function getInviteStats(env, userId) {
  const inviteListRaw = await env.USER_DATA.get(`invite_list:${userId}`);
  const invited = inviteListRaw ? JSON.parse(inviteListRaw) : [];
  const totalCredits = invited.reduce((sum, i) => sum + (i.rewarded ? 100 : 0), 0);
  return { invited: invited.length, max_invites: 50, total_credits: totalCredits, invitees: invited.map(i => ({ date: i.date, rewarded: i.rewarded })) };
}

async function handleBindWechat(req, env) {
  // Called by Web after Clerk login: binds wechat_user_id → clerk_user_id
  const body = await req.json();
  const wechatId = body.wechat_user_id;
  if (!wechatId || !wechatId.startsWith('wechat_')) {
    return { status: 400, data: { error: 'wechat_user_id required (must start with wechat_)' } };
  }

  // Two auth paths:
  // 1. Clerk JWT (from web login) — normal user binding
  // 2. Sync token with clerk_user_id in body — admin/edge agent binding
  let clerkUserId = await getVerifiedUserId(req, env, body);

  // Allow explicit clerk_user_id in body when using sync token auth
  if (!clerkUserId && body.clerk_user_id) {
    // Verify the caller has sync secret (already checked in getVerifiedUserId for non-wechat tokens)
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : (body.session_token || '');
    if (token && token.includes(':') && !token.startsWith('eyJ') && !token.startsWith('wechat_')) {
      const [uid, secret] = token.split(':');
      if (secret === env.WELIAN_SYNC_SECRET) {
        clerkUserId = body.clerk_user_id;
      }
    }
  }

  if (!clerkUserId) {
    return { status: 401, data: { error: 'Authentication required — login on web first' } };
  }

  // Store binding
  await env.USER_DATA.put(`wechat_bind:${wechatId}`, clerkUserId);

  // Also store reverse mapping for lookup
  await env.USER_DATA.put(`wechat_user:${clerkUserId}`, wechatId);

  // Fetch user info for display
  const userInfo = await getClerkUserInfo(clerkUserId, env);
  const displayName = userInfo?.name || '';
  const displayEmail = userInfo?.email || '';

  // Notify WeChat user via ilink bot
  await sendWechatNotification(env, wechatId, clerkUserId, displayName, displayEmail);

  return {
    status: 200,
    data: {
      ok: true,
      wechat_user_id: wechatId,
      clerk_user_id: clerkUserId,
      name: displayName,
      email: displayEmail,
      message: '绑定成功！现在可以在微信里使用小维了。',
    },
  };
}

// Send a message to a WeChat user via ilink bot API
async function sendWechatNotification(env, wechatHashId, clerkUserId, name, email) {
  const botToken = env.WELIAN_BOT_TOKEN;
  if (!botToken) {
    console.log('WELIAN_BOT_TOKEN not set, skipping notification');
    return;
  }

  // Look up the raw WeChat user ID from bot_users stored in KV
  // The bot stores wechat user IDs in DEVICES namespace or we can reverse-lookup
  // Actually, we need the raw ilink user_id to send a message.
  // Store a mapping from wechat_hash → raw_wechat_id when bot calls check_bind
  // For now, the bot will check for bind notifications on next interaction.

  // Store a notification in KV that the bot will pick up
  await env.USER_DATA.put(`bind_notify:${wechatHashId}`, JSON.stringify({
    clerk_user_id: clerkUserId,
    name,
    email,
    timestamp: new Date().toISOString(),
  }), { expirationTtl: 3600 }); // expires in 1 hour
}

async function handleCheckBind(req, env) {
  // Check if a wechat user is bound (called by bot)
  const body = await req.json();
  const wechatId = body.wechat_user_id;
  if (!wechatId) {
    return { status: 400, data: { error: 'wechat_user_id required' } };
  }

  const bound = await env.USER_DATA.get(`wechat_bind:${wechatId}`);
  if (!bound) {
    return { status: 200, data: { bound: false, clerk_user_id: null } };
  }

  // Fetch user info for display
  const userInfo = await getClerkUserInfo(bound, env);

  // Check for bind notification (set when user just bound on web)
  const checkNotify = req.headers.get('X-Check-Notify') === '1';
  let justBound = false;
  if (checkNotify) {
    const notify = await env.USER_DATA.get(`bind_notify:${wechatId}`);
    if (notify) {
      justBound = true;
      // Delete notification so it's only shown once
      await env.USER_DATA.delete(`bind_notify:${wechatId}`);
    }
  }

  return {
    status: 200,
    data: {
      bound: true,
      clerk_user_id: bound,
      name: userInfo?.name || '',
      email: userInfo?.email || '',
      just_bound: justBound,
    },
  };
}

async function handleUnbindWechat(req, env) {
  // Unbind a wechat user from their Clerk account
  const body = await req.json();
  const wechatId = body.wechat_user_id;
  if (!wechatId || !wechatId.startsWith('wechat_')) {
    return { status: 400, data: { error: 'wechat_user_id required (must start with wechat_)' } };
  }

  // Verify caller is the bound user (sync token with wechat_ prefix)
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required — not bound or invalid token' } };
  }

  // Delete binding
  await env.USER_DATA.delete(`wechat_bind:${wechatId}`);
  await env.USER_DATA.delete(`wechat_user:${userId}`);

  return {
    status: 200,
    data: {
      ok: true,
      message: '已解绑。发送 /login 可重新绑定。',
    },
  };
}

// ── Data sync (full cloud mode) ──

async function handleExtractIntent(req, env) {
  // Step 1 of two-step LLM flow: extract intent + keywords + data actions
  // Also executes data write actions (add contact, timeline, todo) directly in KV
  const body = await req.json();
  const text = body.text;

  // Verify Clerk session
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }
  if (!text) {
    return { status: 400, data: { error: 'text required' } };
  }

  const todayDateStr = localDateStr(req);
  const isOnboarding = body.onboarding === true;
  // Minimal fallback — only used if KV prompt:intent.md is unavailable.
  // The full prompt (with visit rules, memory_save, goal_evidence, profile_updates,
  // and all examples) lives in prompts/intent.md synced to KV. This fallback only
  // ensures basic 记/问/拟/报 still works if KV is down. Do NOT duplicate full rules here.
  const _intentFallback = `你是一个关系网络智能体。分析用户消息，提取意图和数据操作。只返回JSON，不要其他内容。

今天是 ${todayDateStr}。所有日期计算以此为准。

JSON格式：
{
  "intent": "query_contact|query_todo|record|draft|advise|report|chat|help|update_profile",
  "contact_name": "用户提到的人名或昵称，没有则为空字符串",
  "keywords": ["搜索关键词"],
  "actions": [],
  "profile_updates": {},
  "memory_save": null,
  "goal_evidence": null,
  "needs_search": false,
  "search_query": ""
}

intent 说明：
- query_contact: 查询某人信息
- query_todo: 查看待办
- record: 记录互动/添加待办/添加联系人
- draft: 拟写消息
- advise: 建议联系谁
- report: 回顾/报告
- chat: 闲聊/其他
- help: 帮助
- update_profile: 更新画像

actions 元素格式：
- {"type":"add_timeline","contact_name":"人名","summary":"互动摘要","date":"YYYY-MM-DD"}
- {"type":"add_contact","name":"人名","relation":"关系","notes":"备注"}
- {"type":"add_todo","task":"待办内容","contact_name":"关联人名","due":"YYYY-MM-DD","priority":"P0|P1|P2","source":"ai_extract"}
- {"type":"complete_todo","task":"待办关键词","contact_name":"关联人名"}
- {"type":"delete_todo","task":"待办关键词","contact_name":"关联人名"}
- {"type":"update_contact","contact_name":"人名","fields":{"name":"新名","relation":"新关系","company":"新公司","title":"新职位","notes":"新备注","nature":"leverage|nurture"}}
- {"type":"merge_contact","source_name":"被合并的联系人名","target_name":"保留的联系人名"}

【核心规则】：
1. 只有用户明确表达记录/提醒/添加/完成/删除/修改/合并意图时才生成 actions，否则 actions=[]
2. summary 和 task 必须来自用户原话，不能编造
3. contact_name 必须在用户消息中明确出现，不能凭空创造
4. add_todo 的 due：用户说了时间就推算为 YYYY-MM-DD，没说就用今天后 7 天
5. add_timeline 的 date：用户说了就用，没说用今天

示例：
- "老许啥情况" → intent=query_contact, actions=[]
- "有啥待办" → intent=query_todo, actions=[]
- "记一下今天和老许聊了Q3预算" → intent=record, actions=[{"type":"add_timeline","contact_name":"老许","summary":"聊了Q3预算","date":"${todayDateStr}"}]
- "提醒我下周联系张总" → intent=record, actions=[{"type":"add_todo","task":"联系张总","contact_name":"张总","due":"7天后日期","priority":"P1","source":"ai_extract"}]
- "下周三和老许吃饭" → intent=record, actions=[{"type":"add_todo","task":"和老许聚餐","contact_name":"老许","due":"下周三日期","priority":"P1","source":"dinner"},{"type":"add_todo","task":"聚餐前查阅与老许的最近互动和近况","contact_name":"老许","due":"下周二日期","priority":"P2","source":"dinner_prep"}]
- "刚和老许吃完饭，聊了合作" → intent=record, actions=[{"type":"add_timeline","contact_name":"老许","summary":"和老许聚餐，聊了合作","date":"${todayDateStr}"}]
- "把老许的公司改成腾讯" → intent=record, actions=[{"type":"update_contact","contact_name":"老许","fields":{"company":"腾讯"}}]
- "你好" → intent=chat, actions=[]

注意：这是降级模式（KV prompt 不可用）。完整的拜访规则、记忆提取、目标证据、画像更新等高级功能在 prompts/intent.md 中，此 fallback 不包含。`;

  // Onboarding mode: append special rules to the prompt (whether from KV or fallback)
  const onboardingSuffix = isOnboarding ? `

【引导模式特殊规则】这是新用户引导场景，用户正在描述最近和谁聊过。即使没有"记一下"等指令词，也要：
- 从用户消息中提取所有人名，为每个不重复的人名生成 add_contact action
- 如果用户提到了互动内容（吃了饭、开了会、聊了XX），同时生成 add_timeline action
- intent 固定为 "record"
- 不要等待用户说"记一下"，直接提取并创建` : '';

  try {
    let system = await getPrompt(env, 'intent', _intentFallback);
    system += onboardingSuffix;
    const llmResp = await callLLM(text, system, env, {
      max_tokens: 800,
      temperature: 0,
    });

    if (!llmResp) {
      return { status: 502, data: { error: 'LLM call failed' } };
    }

    // Parse JSON from LLM response
    let parsed;
    try {
      const jsonMatch = llmResp.text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (e) {
      parsed = null;
    }

    if (!parsed) {
      parsed = { intent: 'chat', contact_name: '', keywords: [], actions: [] };
    }
    if (!parsed.actions) parsed.actions = [];

    // Debug: log actions and memory_save extraction
    console.log('[extractIntent] actions:', JSON.stringify(parsed.actions));
    console.log('[extractIntent] memory_save from LLM:', parsed.memory_save ? JSON.stringify(parsed.memory_save).slice(0, 100) : 'null');

    // Execute data actions (data flywheel — write during conversation)
    // Batch mode: load all datasets once, apply all actions in memory, save once at end
    const actionResults = [];
    let contacts = null, todos = null, timeline = null;
    let contactsDirty = false, todosDirty = false, timelineDirty = false;

    for (const action of parsed.actions) {
      try {
        if (action.type === 'add_contact' && action.name) {
          if (contacts === null) contacts = await loadDataset(env, userId, 'contacts');
          let contact = contacts.find(c => c.name === action.name);
          console.log(`[extractIntent] add_contact: name=${action.name}, found=${!!contact}, totalContacts=${contacts.length}`);
          if (!contact) {
            contact = createContact(action.name, {
              relation: action.relation,
              phone: action.phone,
              email: action.email,
              notes: action.notes,
            });
            contacts.push(contact);
            contactsDirty = true;
            actionResults.push({ type: 'add_contact', ok: true, name: action.name });
          } else {
            actionResults.push({ type: 'add_contact', ok: false, reason: 'already exists' });
          }
        }

        if (action.type === 'add_timeline' && action.summary) {
          if (timeline === null) timeline = await loadDataset(env, userId, 'timeline');
          if (contacts === null) contacts = await loadDataset(env, userId, 'contacts');
          let contactId = '';
          if (action.contact_name) {
            const c = contacts.find(c => c.name === action.contact_name ||
              c.name.includes(action.contact_name) ||
              (c.aliases && c.aliases.some(a => a.includes(action.contact_name))));
            if (c) contactId = c.id;
            // If contact doesn't exist, create it
            if (!c && action.contact_name) {
              const newContact = createContact(action.contact_name);
              contacts.push(newContact);
              contactsDirty = true;
              contactId = newContact.id;
            }
          }
          const entry = createTimelineEntry(contactId, action.summary, {
            date: action.date || localDateStr(req),
          });
          timeline.push(entry);
          timelineDirty = true;
          actionResults.push({ type: 'add_timeline', ok: true, summary: action.summary, contact_name: action.contact_name || '' });
          // P0-1: Track interaction recording (North Star metric)
          trackAction(env, userId, 'interaction_recorded', { contact_name: action.contact_name || '' }).catch(() => {});
        }

        if (action.type === 'add_todo' && action.task) {
          if (todos === null) todos = await loadDataset(env, userId, 'todos');
          if (contacts === null) contacts = await loadDataset(env, userId, 'contacts');
          let contactId = '';
          if (action.contact_name) {
            const c = contacts.find(c => c.name === action.contact_name ||
              c.name.includes(action.contact_name) ||
              (c.aliases && c.aliases.some(a => a.includes(action.contact_name))) ||
              (c.alias && c.alias.some(a => a.includes(action.contact_name))));
            if (c) {
              contactId = c.id;
            } else {
              // Auto-create contact if not found (same as add_timeline logic)
              const newContact = createContact(action.contact_name);
              contacts.push(newContact);
              contactsDirty = true;
              contactId = newContact.id;
            }
          }
          // Default due: 7 days from now if not provided (in user's timezone)
          let due = action.due || '';
          if (!due) {
            const d = localDate(req);
            d.setDate(d.getDate() + 7);
            due = d.toISOString().slice(0, 10);
          }
          // Dedup: skip if same task + contact already pending
          const dup = findDuplicateTodo(todos, action.task, contactId);
          if (dup) {
            // Update due date if new one is earlier
            if (due && (!dup.due || due < dup.due)) {
              dup.due = due;
              dup.updated = new Date().toISOString();
              todosDirty = true;
            }
            actionResults.push({ type: 'add_todo', ok: true, task: action.task, contact_name: action.contact_name || '', dedup: true });
          } else {
            const todo = createTodo(contactId, action.task, {
              priority: action.priority || 'P1',
              due,
              source: action.source || 'ai_extract',
            });
            todos.push(todo);
            todosDirty = true;
            actionResults.push({ type: 'add_todo', ok: true, task: action.task, contact_name: action.contact_name || '' });
          }
        }

        // ── Complete todo ──
        if (action.type === 'complete_todo' && action.task) {
          if (todos === null) todos = await loadDataset(env, userId, 'todos');
          if (contacts === null) contacts = await loadDataset(env, userId, 'contacts');
          // Find matching pending todo by task keyword + optional contact
          const candidates = todos.filter(t =>
            t.status === 'pending' &&
            t.task && t.task.includes(action.task)
          );
          // Narrow by contact if specified
          let matched = candidates;
          if (action.contact_name) {
            const c = contacts.find(c => c.name === action.contact_name || c.name.includes(action.contact_name));
            if (c) {
              const byContact = candidates.filter(t => t.contact === c.id);
              if (byContact.length > 0) matched = byContact;
            }
          }
          if (matched.length > 0) {
            const todo = matched[0]; // complete the first match
            todo.status = 'done';
            todo.completed_at = new Date().toISOString();
            todo.updated = new Date().toISOString();
            todosDirty = true;
            actionResults.push({ type: 'complete_todo', ok: true, task: todo.task, contact_name: action.contact_name || '' });
            // P0-1: Track todo completion (North Star metric)
            trackAction(env, userId, 'todo_completed', { contact_name: action.contact_name || '', task: todo.task }).catch(() => {});
          } else {
            actionResults.push({ type: 'complete_todo', ok: false, reason: 'no matching pending todo' });
          }
        }

        // ── Delete todo ──
        if (action.type === 'delete_todo' && action.task) {
          if (todos === null) todos = await loadDataset(env, userId, 'todos');
          if (contacts === null) contacts = await loadDataset(env, userId, 'contacts');
          const candidates = todos.filter(t =>
            t.status === 'pending' &&
            t.task && t.task.includes(action.task)
          );
          let matched = candidates;
          if (action.contact_name) {
            const c = contacts.find(c => c.name === action.contact_name || c.name.includes(action.contact_name));
            if (c) {
              const byContact = candidates.filter(t => t.contact === c.id);
              if (byContact.length > 0) matched = byContact;
            }
          }
          if (matched.length > 0) {
            const todo = matched[0];
            const idx = todos.indexOf(todo);
            todos.splice(idx, 1);
            todosDirty = true;
            actionResults.push({ type: 'delete_todo', ok: true, task: todo.task, contact_name: action.contact_name || '' });
          } else {
            actionResults.push({ type: 'delete_todo', ok: false, reason: 'no matching todo' });
          }
        }

        // ── Update contact ──
        if (action.type === 'update_contact' && action.contact_name && action.fields) {
          if (contacts === null) contacts = await loadDataset(env, userId, 'contacts');
          // Find by name (exact or partial match)
          let contact = contacts.find(c => c.name === action.contact_name);
          if (!contact) {
            contact = contacts.find(c => c.name.includes(action.contact_name) ||
              (c.aliases && c.aliases.some(a => a.includes(action.contact_name))));
          }
          if (contact) {
            const allowedFields = ['name', 'relation', 'role', 'company', 'title', 'notes', 'nature', 'tags', 'phone', 'email'];
            let changed = false;
            for (const [key, value] of Object.entries(action.fields)) {
              if (allowedFields.includes(key)) {
                if (key === 'relation' || key === 'role') {
                  // relation and role are mirrored
                  contact.relation = value;
                  contact.role = value;
                } else {
                  contact[key] = value;
                }
                changed = true;
              }
            }
            if (changed) {
              contact.updated = new Date().toISOString();
              contactsDirty = true;
              actionResults.push({ type: 'update_contact', ok: true, contact_name: contact.name, fields: Object.keys(action.fields) });
            } else {
              actionResults.push({ type: 'update_contact', ok: false, reason: 'no valid fields to update' });
            }
          } else {
            actionResults.push({ type: 'update_contact', ok: false, reason: 'contact not found' });
          }
        }

        // ── Merge contact ──
        // Move source contact's timeline + todos to target, add source name as alias, delete source
        if (action.type === 'merge_contact' && action.source_name && action.target_name) {
          if (contacts === null) contacts = await loadDataset(env, userId, 'contacts');
          if (timeline === null) timeline = await loadDataset(env, userId, 'timeline');
          if (todos === null) todos = await loadDataset(env, userId, 'todos');

          // Find source and target contacts
          let source = contacts.find(c => c.name === action.source_name || c.id === action.source_name);
          if (!source) source = contacts.find(c => c.name.includes(action.source_name) ||
            (c.aliases && c.aliases.some(a => a.includes(action.source_name))));
          let target = contacts.find(c => c.name === action.target_name || c.id === action.target_name);
          if (!target) target = contacts.find(c => c.name.includes(action.target_name) ||
            (c.aliases && c.aliases.some(a => a.includes(action.target_name))));

          if (!source) {
            actionResults.push({ type: 'merge_contact', ok: false, reason: `source "${action.source_name}" not found` });
          } else if (!target) {
            actionResults.push({ type: 'merge_contact', ok: false, reason: `target "${action.target_name}" not found` });
          } else if (source.id === target.id) {
            actionResults.push({ type: 'merge_contact', ok: false, reason: 'source and target are the same contact' });
          } else {
            const sourceId = source.id;
            const sourceName = source.name;
            const targetId = target.id;
            const targetName = target.name;

            // 1. Reassign timeline entries from source to target
            // Timeline entries may reference contact by id OR name, so match both
            let timelineMoved = 0;
            for (const t of timeline) {
              if (t.contact === sourceId || t.contact === sourceName) {
                t.contact = targetId;
                t.updated = new Date().toISOString();
                timelineMoved++;
              }
            }
            if (timelineMoved > 0) timelineDirty = true;

            // 2. Reassign todos from source to target
            let todosMoved = 0;
            for (const t of todos) {
              if (t.contact === sourceId || t.contact === sourceName) {
                t.contact = targetId;
                t.updated = new Date().toISOString();
                todosMoved++;
              }
            }
            if (todosMoved > 0) todosDirty = true;

            // 3. Merge source fields into target (fill missing fields only, don't overwrite)
            const mergeFields = ['relation', 'sub_relation', 'company', 'title', 'notes', 'nature'];
            let fieldsMerged = [];
            for (const f of mergeFields) {
              if (source[f] && !target[f]) {
                target[f] = source[f];
                fieldsMerged.push(f);
              }
            }
            // Merge tags (union)
            if (source.tags && source.tags.length > 0) {
              const existingTags = new Set(target.tags || []);
              for (const tag of source.tags) {
                if (!existingTags.has(tag)) {
                  target.tags = target.tags || [];
                  target.tags.push(tag);
                }
              }
            }
            // Merge memories (append unique)
            if (source.memories && source.memories.length > 0) {
              target.memories = target.memories || [];
              for (const m of source.memories) {
                const exists = target.memories.some(tm => tm.content === m.content);
                if (!exists) target.memories.push(m);
              }
            }
            // Merge leverage/nurture (fill if target empty)
            if (source.leverage && Object.keys(source.leverage).length > 0) {
              if (!target.leverage || Object.keys(target.leverage).length === 0) {
                target.leverage = source.leverage;
              }
            }
            if (source.nurture && Object.keys(source.nurture).length > 0) {
              if (!target.nurture || Object.keys(target.nurture).length === 0) {
                target.nurture = source.nurture;
              }
            }

            // 4. Add source name as alias to target
            target.aliases = target.aliases || [];
            if (!target.aliases.includes(sourceName) && target.name !== sourceName) {
              target.aliases.push(sourceName);
            }
            // Also merge source's aliases
            if (source.aliases) {
              for (const a of source.aliases) {
                if (!target.aliases.includes(a) && target.name !== a) {
                  target.aliases.push(a);
                }
              }
            }

            target.updated = new Date().toISOString();
            contactsDirty = true;

            // 5. Delete source contact
            const idx = contacts.indexOf(source);
            contacts.splice(idx, 1);

            actionResults.push({
              type: 'merge_contact', ok: true,
              source_name: sourceName, target_name: target.name,
              timeline_moved: timelineMoved, todos_moved: todosMoved,
              fields_merged: fieldsMerged,
            });
          }
        }

      } catch (e) {
        actionResults.push({ type: action.type, ok: false, error: e.message });
      }
    }

    // Batch save: only write datasets that actually changed (saves KV put quota)
    if (contactsDirty) {
      console.log(`[extractIntent] Saving contacts: ${contacts.length} total`);
      await saveDataset(env, userId, 'contacts', contacts);
    }
    if (timelineDirty) await saveDataset(env, userId, 'timeline', timeline);
    if (todosDirty) await saveDataset(env, userId, 'todos', todos);

    parsed.action_results = actionResults;

    // Process profile_updates — auto-learn user profile from conversation
    const profileUpdates = parsed.profile_updates;
    if (profileUpdates && typeof profileUpdates === 'object' && Object.keys(profileUpdates).length > 0) {
      try {
        const raw = await env.USER_DATA.get(`profile:${userId}`);
        let existing = raw ? JSON.parse(raw) : {};
        let changed = false;
        const allowedFields = ['name','occupation','company','industry','location','communication_style','address_habit','focus_areas','message_tone','career_goal','current_projects','network_direction','notes'];
        for (const k of allowedFields) {
          if (profileUpdates[k] && profileUpdates[k].trim()) {
            existing[k] = profileUpdates[k].trim();
            changed = true;
          }
        }
        if (changed) {
          existing.updated = new Date().toISOString();
          await env.USER_DATA.put(`profile:${userId}`, JSON.stringify(existing));
          parsed.profile_updated = true;
          console.log('[extractIntent] Profile auto-updated:', Object.keys(profileUpdates));
        }
      } catch (e) {
        console.log('[extractIntent] Profile update failed:', e.message);
      }
    }

    // Auto-save memory if extracted
    if (parsed.memory_save && parsed.memory_save.title && parsed.memory_save.content) {
      try {
        const mem = await saveMemory(
          env, userId,
          parsed.memory_save.type || 'context',
          parsed.memory_save.title,
          parsed.memory_save.content,
          parsed.memory_save.tags || []
        );
        parsed.memory_saved = true;
        parsed.memory_saved_id = mem.id;
        console.log('[extractIntent] Memory saved:', mem.title);
      } catch (e) {
        console.log('[extractIntent] Memory save failed:', e.message);
      }
    }

    // G1: Auto-link goal evidence if extracted
    if (parsed.goal_evidence && parsed.goal_evidence.criterion_text) {
      try {
        const goals = await loadGoals(env, userId);
        const activeGoals = goals.filter(g => g.status === 'active');
        for (const goal of activeGoals) {
          // Match by goal_id if provided, else by criterion text fuzzy match
          const goalMatch = !parsed.goal_evidence.goal_id || goal.id === parsed.goal_evidence.goal_id;
          if (!goalMatch) continue;
          const criterion = goal.criteria.find(c =>
            c.status === 'pending' && (
              c.text === parsed.goal_evidence.criterion_text ||
              c.text.includes(parsed.goal_evidence.criterion_text) ||
              parsed.goal_evidence.criterion_text.includes(c.text)
            )
          );
          if (criterion) {
            criterion.evidence.push({
              id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
              text: parsed.goal_evidence.evidence_text || parsed.goal_evidence.criterion_text,
              source: 'auto',
              timestamp: new Date().toISOString(),
            });
            criterion.status = 'satisfied';
            goal.updated_at = new Date().toISOString();
            if (goal.criteria.every(c => c.status === 'satisfied')) {
              goal.status = 'completed';
              goal.completed_at = new Date().toISOString();
            }
            parsed.goal_evidence_linked = true;
            parsed.goal_evidence_goal_title = goal.title;
            console.log('[extractIntent] Goal evidence linked:', goal.title, criterion.text);
            break;
          }
        }
        if (parsed.goal_evidence_linked) {
          await saveGoals(env, userId, goals);
        }
      } catch (e) {
        console.log('[extractIntent] Goal evidence link failed:', e.message);
      }
    }

    return { status: 200, data: parsed };
  } catch (e) {
    return { status: 500, data: { error: e.message } };
  }
}

// Verify agent sync token (for data sync endpoints, no Clerk session)
// Agent uses WELIAN_SYNC_TOKEN env var, which is "<user_id>:<random_secret>"
async function getAgentSyncUserId(body, env) {
  const syncToken = body.sync_token;
  if (!syncToken || typeof syncToken !== 'string') {
    return null;
  }

  // Demo token: demo_<scenario_id>:demo_secret (for simulation mode)
  if (syncToken.startsWith('demo_') && syncToken.endsWith(':demo_secret')) {
    const userId = syncToken.split(':')[0];
    return userId;
  }

  // sync_token format: "<clerk_user_id>:<secret>"
  // The secret must match WELIAN_SYNC_SECRET env var
  const parts = syncToken.split(':');
  if (parts.length !== 2) {
    return null;
  }

  const [userId, secret] = parts;
  const expectedSecret = env.WELIAN_SYNC_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return null;
  }

  if (!userId || userId.length < 10) {
    return null;
  }

  return userId;
}

// ── File import: AI extracts contacts from uploaded file, batch creates ──
async function handleImportContacts(req, env) {
  const body = await req.json();
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  const base64 = body.base64 || '';
  const filename = body.filename || 'upload';
  const mimeType = body.mime_type || 'application/octet-stream';

  if (!base64) {
    return { status: 400, data: { error: '文件内容为空' } };
  }

  // Auto-detect text vs binary via magic bytes + UTF-8 validity
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const sig = bytes.slice(0, 12);
  const isPdf = sig[0] === 0x25 && sig[1] === 0x50 && sig[2] === 0x44 && sig[3] === 0x46; // %PDF
  const isPng = sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4E && sig[3] === 0x47; // \x89PNG
  const isJpeg = sig[0] === 0xFF && sig[1] === 0xD8 && sig[2] === 0xFF; // \xFF\xD8\xFF
  const isGif = sig[0] === 0x47 && sig[1] === 0x49 && sig[2] === 0x46; // GIF
  const isBmp = sig[0] === 0x42 && sig[1] === 0x4D; // BM
  const isWebp = sig[0] === 0x52 && sig[1] === 0x49 && sig[2] === 0x46 && sig[3] === 0x46 && sig[8] === 0x57 && sig[9] === 0x45 && sig[10] === 0x42 && sig[11] === 0x50; // RIFF....WEBP
  const isZip = sig[0] === 0x50 && sig[1] === 0x4B && (sig[2] === 0x03 || sig[2] === 0x05); // PK (xlsx/docx are zip)
  const isBinary = isPdf || isPng || isJpeg || isGif || isBmp || isWebp || isZip;

  // Use enhanced model (Claude Sonnet) for document understanding
  const apiKey = env.LLM_API_KEY_ENHANCED || env.LLM_API_KEY;
  const model = env.LLM_MODEL_ENHANCED || 'claude-sonnet-4-6';
  const baseUrl = env.LLM_BASE_URL_ENHANCED || 'https://api.anthropic.com';

  const _importFallback = `你是一个联系人信息提取专家。从用户提供的文件内容中提取联系人信息，输出 JSON 数组。

规则：
1. 每个联系人提取以下字段（有就填，没有就留空）：
   - name: 姓名（必须有，否则跳过该条目）
   - relation: 关系（如"朋友""同事""客户""同行"等，根据上下文推断）
   - company: 公司
   - title: 职位
   - phone: 电话
   - email: 邮箱
   - notes: 备注（其他有价值的信息，如地址、行业、来源等）
2. 如果内容是表格/CSV格式，每行通常是一个联系人
3. 跳过明显不是联系人的行（如表头、空行、说明文字）
4. 如果内容中没有明确的联系人信息，返回空数组 []
5. 只提取已看到的内容，不要编造

输出格式（只输出 JSON，不要其他文字）：
[{"name":"张三","relation":"同事","company":"腾讯","title":"产品经理","phone":"13800138000","email":"zhangsan@qq.com","notes":"微信好友"}]`;
  const system = await getPrompt(env, "import", _importFallback);

  // ── Extraction: try direct parse first, fall back to LLM ──
  let allContacts = [];
  let totalUsage = null;

  if (isBinary) {
    // Binary file (PDF/image/xlsx/docx) — single LLM call, AI reads natively
    const lowerFilename = (filename || '').toLowerCase();
    const isImage = isPng || isJpeg || isGif || isBmp || isWebp;
    const docType = isPdf ? 'application/pdf'
      : isPng ? 'image/png'
      : isJpeg ? 'image/jpeg'
      : isGif ? 'image/gif'
      : isBmp ? 'image/bmp'
      : isWebp ? 'image/webp'
      : lowerFilename.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : lowerFilename.endsWith('.xls') ? 'application/vnd.ms-excel'
      : lowerFilename.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : lowerFilename.endsWith('.doc') ? 'application/msword'
      : mimeType || 'application/octet-stream';
    // Images use 'image' type, PDFs/Office docs use 'document' type
    const fileBlock = isImage
      ? { type: 'image', source: { type: 'base64', media_type: docType, data: base64 } }
      : { type: 'document', source: { type: 'base64', media_type: docType, data: base64 } };
    const llmContent = [
      fileBlock,
      { type: 'text', text: isImage
        ? '提取这张名片图片中的联系人信息。识别姓名、公司、职位、电话、邮箱、地址等。只输出 JSON 数组，不要其他文字。'
        : '提取这个文件中的所有联系人信息。' },
    ];
    const result = await _llmExtractContacts(baseUrl, apiKey, model, system, llmContent);
    if (result.error) return { status: 502, data: { error: result.error } };
    allContacts = result.contacts;
    totalUsage = result.usage;
  } else {
    // Text file — decode
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (decoded.trim().length < 10) {
      return { status: 400, data: { error: '文件内容不足' } };
    }

    // Try direct parsing: vCard (.vcf) or CSV — instant, no LLM, handles 5000+ contacts
    const lowerName = filename.toLowerCase();
    const isVcf = lowerName.endsWith('.vcf') || lowerName.endsWith('.vcard') || decoded.trimStart().startsWith('BEGIN:VCARD');
    const isCsv = lowerName.endsWith('.csv') || (decoded.includes(',') && decoded.includes('\n') && !decoded.trimStart().startsWith('{'));

    if (isVcf) {
      allContacts = _parseVCard(decoded);
    } else if (isCsv) {
      allContacts = _parseCSV(decoded);
    }

    // Fallback: if direct parse found nothing, use LLM (single call, small files only)
    if (allContacts.length === 0) {
      const truncated = decoded.length > 100000 ? decoded.slice(0, 100000) + '\n...(已截断)' : decoded;
      const llmContent = [{ type: 'text', text: truncated }];
      const result = await _llmExtractContacts(baseUrl, apiKey, model, system, llmContent);
      if (result.error) return { status: 502, data: { error: result.error } };
      allContacts = result.contacts;
      totalUsage = result.usage;
    }
  }

  if (allContacts.length === 0) {
    return { status: 200, data: { imported: 0, skipped: 0, message: '未提取到联系人' } };
  }

  // Load existing contacts for dedup
  const existing = await loadDataset(env, userId, 'contacts');
  const existingNames = new Set(existing.map(c => c.name));

  let imported = 0;
  let skipped = 0;
  for (const c of allContacts) {
    const name = (c.name || '').trim();
    if (!name) { skipped++; continue; }
    if (existingNames.has(name)) { skipped++; continue; }

    existing.push(createContact(name, {
      relation: c.relation,
      company: c.company,
      title: c.title,
      phone: c.phone,
      email: c.email,
      notes: c.notes,
    }));
    existingNames.add(name);
    imported++;
  }

  if (imported > 0) await saveDataset(env, userId, 'contacts', existing);

  // Deduct billing (unified — enhanced model tier for import)
  await deductBilling(env, userId, totalUsage, 'import', `imported ${imported} from ${filename}`, 'enhanced');

  return { status: 200, data: { imported, skipped, total: allContacts.length } };
}

// ── Batch import: client-side parsed contacts → dedup + save (no LLM) ──
async function handleImportBatch(req, env) {
  const body = await req.json();
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  const contacts = body.contacts || [];
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return { status: 400, data: { error: '没有联系人' } };
  }

  const existing = await loadDataset(env, userId, 'contacts');
  const existingNames = new Set(existing.map(c => c.name));

  let imported = 0, skipped = 0;
  for (const c of contacts) {
    const name = (c.name || '').trim();
    if (!name) { skipped++; continue; }
    if (existingNames.has(name)) { skipped++; continue; }
    existing.push(createContact(name, {
      relation: c.relation,
      company: c.company,
      title: c.title,
      phone: c.phone,
      email: c.email,
      notes: c.notes,
    }));
    existingNames.add(name);
    imported++;
  }

  if (imported > 0) await saveDataset(env, userId, 'contacts', existing);
  return { status: 200, data: { imported, skipped, total: contacts.length } };
}

// ── Chunk extraction: LLM extracts contacts from one text chunk ──
async function handleImportChunk(req, env) {
  const body = await req.json();
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  const text = body.text || '';
  if (!text.trim()) return { status: 200, data: { contacts: [] } };

  const system = `你是一个联系人信息提取专家。从用户提供的文件内容中提取联系人信息，输出 JSON 数组。

规则：
1. 每个联系人提取以下字段（有就填，没有就留空）：
   - name: 姓名（必须有，否则跳过该条目）
   - relation: 关系（如"朋友""同事""客户""同行"等，根据上下文推断）
   - company: 公司
   - title: 职位
   - phone: 电话
   - email: 邮箱
   - notes: 备注（其他有价值的信息，如地址、行业、来源等）
2. 如果内容是表格/CSV格式，每行通常是一个联系人
3. 跳过明显不是联系人的行（如表头、空行、说明文字）
4. 如果内容中没有明确的联系人信息，返回空数组 []
5. 只提取已看到的内容，不要编造

输出格式（只输出 JSON，不要其他文字）：
[{"name":"张三","relation":"同事","company":"腾讯","title":"产品经理","phone":"13800138000","email":"zhangsan@qq.com","notes":"微信好友"}]`;

  const apiKey = env.LLM_API_KEY_ENHANCED || env.LLM_API_KEY;
  const model = env.LLM_MODEL_ENHANCED || 'claude-sonnet-4-6';
  const baseUrl = env.LLM_BASE_URL_ENHANCED || 'https://api.anthropic.com';

  const result = await _llmExtractContacts(baseUrl, apiKey, model, system, [{ type: 'text', text }]);
  if (result.error) return { status: 502, data: { error: result.error } };

  // Deduct billing (unified — enhanced model tier for import)
  if (result.usage) {
    await deductBilling(env, userId, result.usage, 'import_chunk', '', 'enhanced');
  }

  return { status: 200, data: { contacts: result.contacts } };
}

// ── Direct parsers for structured contact files (no LLM needed) ──

// Parse vCard (.vcf) — handles 3.0/4.0, multi-line folding, multiple entries
function _parseVCard(text) {
  const contacts = [];
  // Unfold: vCard folds long lines with \r\n + space/tab
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const blocks = unfolded.split(/BEGIN:VCARD/i).slice(1);

  for (const block of blocks) {
    const endIdx = block.search(/END:VCARD/i);
    if (endIdx < 0) continue;
    const lines = block.slice(0, endIdx).split(/\r?\n/).filter(l => l.trim());

    let name = '', company = '', title = '', phone = '', email = '', note = '';
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx < 0) continue;
      const prop = line.slice(0, colonIdx).toUpperCase();
      const val = line.slice(colonIdx + 1).trim();

      if (prop.startsWith('FN')) name = val;
      else if (prop.startsWith('N') && !name) {
        // N:Last;First;Middle;Prefix;Suffix
        const parts = val.split(';');
        name = [parts[1], parts[2], parts[0]].filter(Boolean).join(' ').trim() || val;
      }
      else if (prop.startsWith('ORG')) company = val.split(';').filter(Boolean).join(' ');
      else if (prop.startsWith('TITLE')) title = val;
      else if (prop.startsWith('TEL')) phone = val;
      else if (prop.startsWith('EMAIL')) email = val;
      else if (prop.startsWith('NOTE')) note = val;
    }
    if (name) contacts.push({ name, company, title, phone, email, notes: note, relation: '' });
  }
  return contacts;
}

// Parse CSV — auto-detect delimiter, map common header names
function _parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Detect delimiter: comma, tab, or semicolon
  const sample = lines[0];
  const delim = sample.includes('\t') ? '\t' : sample.includes(';') && !sample.includes(',') ? ';' : ',';

  // Parse CSV with quoted field support
  function parseLine(line) {
    const fields = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuote = false;
        } else cur += ch;
      } else {
        if (ch === '"') inQuote = true;
        else if (ch === delim) { fields.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    fields.push(cur);
    return fields.map(f => f.trim());
  }

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/["']/g, '').trim());

  // Map common header names to fields
  const fieldMap = {
    name: ['姓名', 'name', '名称', '昵称', 'nickname', 'display name', 'fn'],
    company: ['公司', 'company', 'organization', 'org', '单位'],
    title: ['职位', 'title', '职务', '头衔', 'position'],
    phone: ['电话', 'phone', '手机', 'mobile', 'tel', '电话号码', '联系电话'],
    email: ['邮箱', 'email', 'e-mail', '电子邮件', 'email地址'],
    notes: ['备注', 'notes', 'note', '说明', '描述', 'description'],
    relation: ['关系', 'relation', '分组', 'group', '类别', 'category'],
  };

  const colIdx = {};
  for (const [field, aliases] of Object.entries(fieldMap)) {
    for (let i = 0; i < headers.length; i++) {
      if (aliases.some(a => headers[i] === a || headers[i].includes(a))) {
        colIdx[field] = i;
        break;
      }
    }
  }

  // If no name column found, try first non-empty column as name
  if (colIdx.name === undefined) {
    // Check if first column looks like names (not a header like "id" or "序号")
    if (headers[0] && !['id', '序号', '编号', 'no', 'index'].includes(headers[0])) {
      colIdx.name = 0;
    } else if (headers.length > 1) {
      colIdx.name = 1;
    }
  }

  if (colIdx.name === undefined) return [];

  const contacts = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i]);
    const name = (fields[colIdx.name] || '').trim();
    if (!name) continue;

    contacts.push({
      name,
      company: colIdx.company !== undefined ? (fields[colIdx.company] || '').trim() : '',
      title: colIdx.title !== undefined ? (fields[colIdx.title] || '').trim() : '',
      phone: colIdx.phone !== undefined ? (fields[colIdx.phone] || '').trim() : '',
      email: colIdx.email !== undefined ? (fields[colIdx.email] || '').trim() : '',
      notes: colIdx.notes !== undefined ? (fields[colIdx.notes] || '').trim() : '',
      relation: colIdx.relation !== undefined ? (fields[colIdx.relation] || '').trim() : '',
    });
  }
  return contacts;
}

// Helper: call LLM to extract contacts from one chunk
async function _llmExtractContacts(baseUrl, apiKey, model, system, llmContent) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 16000, temperature: 0, system, messages: [{ role: 'user', content: llmContent }] }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const llmText = (data.content || []).map(b => b.text || '').join('');
        const jsonMatch = llmText.match(/\[[\s\S]*\]/);
        const contacts = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        return { contacts: Array.isArray(contacts) ? contacts : [], usage: data.usage };
      }
      if (attempt === 2) return { error: `AI 提取失败: ${resp.status}` };
    } catch (e) {
      if (attempt === 2) return { error: `AI 请求失败: ${e.message}` };
    }
  }
  return { contacts: [] };
}

// ── Proactive suggestion: AI generates 1-2 personalized tips based on full context ──
async function handleProactiveSuggestion(req, env) {
  const body = await req.json();
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  // Load user data
  const [contacts, todos, timeline] = await Promise.all([
    loadDataset(env, userId, 'contacts'),
    loadDataset(env, userId, 'todos'),
    loadDataset(env, userId, 'timeline'),
  ]);

  // Build context from user data + client-provided environment
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const ctx = body.context || {};

  // Stale leverage contacts (14+ days)
  const lastContact = {};
  timeline.forEach(t => { if (t.contact) lastContact[t.contact] = t.date; });
  const staleContacts = contacts
    .filter(c => (c.nature === 'leverage' || c.nature === 'dual') && (!c.snooze_until || c.snooze_until.slice(0,10) < todayStr))
    .map(c => {
      const last = lastContact[c.id] || lastContact[c.name];
      const days = last ? Math.floor((new Date(todayStr) - new Date(last.slice(0,10))) / 86400000) : 999;
      return { name: c.name, days, company: c.company, relation: c.relation || c.role };
    })
    .filter(x => x.days >= 14)
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);

  // Overdue todos (exclude done/completed/canceled)
  const overdueTodos = todos
    .filter(t => !isTodoDone(t) && t.due && t.due.slice(0,10) < todayStr)
    .sort((a, b) => (a.due||'').localeCompare(b.due||''))
    .slice(0, 3);

  // Upcoming important dates (30 days)
  const upcomingDates = [];
  contacts.forEach(c => {
    (c.important_dates || []).forEach(dt => {
      const dateStr = dt.date || '';
      if (dateStr.length >= 5) {
        const mmdd = dateStr.length === 5 ? dateStr : dateStr.slice(5);
        const dDate = new Date(`${now.getFullYear()}-${mmdd}`);
        const delta = Math.floor((dDate - now) / 86400000);
        if (delta >= 0 && delta <= 30) {
          upcomingDates.push({ name: c.name, date: mmdd, label: dt.label, delta });
        }
      }
    });
  });
  upcomingDates.sort((a, b) => a.delta - b.delta);

  // Today's interactions
  const todayCount = timeline.filter(t => (t.date||'').slice(0,10) === todayStr).length;

  // Build prompt for AI
  const envParts = [];
  envParts.push(`当前时间：${now.toLocaleString('zh-CN')}`);
  if (ctx.city) envParts.push(`用户所在地：${ctx.city}`);
  if (ctx.weather) envParts.push(`天气：${ctx.weather}`);
  if (ctx.timeSlot) envParts.push(`时段：${ctx.timeSlot}`);
  if (ctx.device) envParts.push(`设备：${ctx.device}`);
  if (ctx.holidays?.length) envParts.push(`近期节日：${ctx.holidays.join('、')}`);
  envParts.push(`今日已记录互动：${todayCount}条`);
  if (ctx.traveling) envParts.push(`用户正在出差/外出`);

  const dataParts = [];
  if (staleContacts.length) dataParts.push(`该联系的人（14天+未联系）：${staleContacts.map(c => `${c.name}(${c.days===999?'从未':c.days+'天'})`).join('、')}`);
  if (overdueTodos.length) dataParts.push(`超期待办：${overdueTodos.map(t => t.task).join('、')}`);
  if (upcomingDates.length) dataParts.push(`近期重要日期：${upcomingDates.map(d => `${d.name}-${d.label}(${d.delta}天后)`).join('、')}`);

  // Skip if nothing to suggest
  if (staleContacts.length === 0 && overdueTodos.length === 0 && upcomingDates.length === 0 && !ctx.holidays?.length) {
    return { status: 200, data: { suggestions: [], reason: 'no_actionable_items' } };
  }

  const system = await getPrompt(env, 'proactive', `你是小维，一个关系网络智能体。根据用户当前的环境和数据，生成 1-2 条贴心建议。只引用数据中提供的信息，不能编造事件。输出 JSON 数组。`);

  const prompt = `环境信息：\n${envParts.join('\n')}\n\n数据：\n${dataParts.join('\n') || '无特别需要关注的数据'}\n\n请生成 1-2 条贴心建议。如果数据中没有可操作的内容，只根据环境生成建议；如果环境也没有特殊因素，返回空数组。`;

  const llmResp = await callLLM(prompt, system, env, { max_tokens: 500, temperature: 0.3 });

  if (!llmResp) {
    return { status: 200, data: { suggestions: [], reason: 'ai_failed' } };
  }

  let suggestions = [];
  try {
    const jsonMatch = llmResp.text.match(/\[[\s\S]*\]/);
    suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch (e) {
    // Fallback: use raw text as single suggestion
    suggestions = [{ text: llmResp.text.slice(0, 80), action: '' }];
  }

  // Deduct billing (unified)
  await deductBilling(env, userId, llmResp.usage, 'proactive', 'proactive suggestion');

  return { status: 200, data: { suggestions: suggestions.slice(0, 2) } };
}

async function handleDataSync(req, env) {
  const body = await req.json();
  const dataContext = body.data_context;

  // Verify agent sync token
  const userId = await getAgentSyncUserId(body, env);
  if (!userId) {
    return { status: 401, data: { error: 'Invalid sync token' } };
  }

  if (!dataContext || typeof dataContext !== 'string' || dataContext.length === 0) {
    return { status: 200, data: { ok: false, reason: 'empty data_context' } };
  }

  // Store in KV with 7-day TTL (agent re-syncs periodically)
  await env.USER_DATA.put(`ctx:${userId}`, dataContext, { expirationTtl: 604800 });

  return { status: 200, data: { ok: true, synced_at: new Date().toISOString() } };
}

// Merge two datasets by unique key, preferring newer updated/created timestamp
function mergeDatasets(cloudItems, edgeItems, idField) {
  const map = new Map();
  // Start with cloud items (may have flywheel-added entries)
  for (const item of cloudItems) {
    const key = item[idField] || item.id;
    if (key) map.set(key, item);
  }
  // Merge edge items — overwrite if edge item is newer
  for (const item of edgeItems) {
    const key = item[idField] || item.id;
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      // New item from edge, add it
      map.set(key, item);
    } else {
      // Compare timestamps — keep newer
      const edgeTime = item.updated || item.created || '';
      const cloudTime = existing.updated || existing.created || '';
      if (edgeTime >= cloudTime) {
        map.set(key, item);
      }
    }
  }
  return Array.from(map.values());
}

async function handleDataSyncFull(req, env) {
  // Bidirectional merge sync: edge data merges with cloud data (not overwrite)
  // Cloud may have flywheel-added entries from conversation; edge has local data
  const body = await req.json();

  // Verify agent sync token
  const userId = await getAgentSyncUserId(body, env);
  if (!userId) {
    return { status: 401, data: { error: 'Invalid sync token' } };
  }

  const edgeContacts = body.contacts || [];
  const edgeTodos = body.todos || [];
  const edgeTimeline = body.timeline || [];

  // Load existing cloud data
  const cloudContacts = await loadDataset(env, userId, 'contacts');
  const cloudTodos = await loadDataset(env, userId, 'todos');
  const cloudTimeline = await loadDataset(env, userId, 'timeline');

  // Merge: cloud items + edge items, dedup by id, keep newer
  const mergedContacts = mergeDatasets(cloudContacts, edgeContacts, 'id');
  const mergedTodos = mergeDatasets(cloudTodos, edgeTodos, 'id');
  const mergedTimeline = mergeDatasets(cloudTimeline, edgeTimeline, 'id');

  // Save merged data back to cloud — skip write if nothing changed (saves KV put quota)
  const contactsChanged = JSON.stringify(mergedContacts) !== JSON.stringify(cloudContacts);
  const todosChanged = JSON.stringify(mergedTodos) !== JSON.stringify(cloudTodos);
  const timelineChanged = JSON.stringify(mergedTimeline) !== JSON.stringify(cloudTimeline);
  if (contactsChanged) await saveDataset(env, userId, 'contacts', mergedContacts);
  if (todosChanged) await saveDataset(env, userId, 'todos', mergedTodos);
  if (timelineChanged) await saveDataset(env, userId, 'timeline', mergedTimeline);

  // Return cloud-only items (items in cloud but not in edge) so agent can pull them
  const edgeContactIds = new Set(edgeContacts.map(c => c.id));
  const edgeTodoIds = new Set(edgeTodos.map(t => t.id));
  const edgeTimelineIds = new Set(edgeTimeline.map(t => t.id));
  const cloudOnlyContacts = mergedContacts.filter(c => !edgeContactIds.has(c.id));
  const cloudOnlyTodos = mergedTodos.filter(t => !edgeTodoIds.has(t.id));
  const cloudOnlyTimeline = mergedTimeline.filter(t => !edgeTimelineIds.has(t.id));

  return {
    status: 200,
    data: {
      ok: true,
      synced_at: new Date().toISOString(),
      counts: { contacts: mergedContacts.length, todos: mergedTodos.length, timeline: mergedTimeline.length },
      // Cloud-only items for agent to merge into local
      cloud_only: {
        contacts: cloudOnlyContacts,
        todos: cloudOnlyTodos,
        timeline: cloudOnlyTimeline,
      },
    },
  };
}

async function handleDataSearch(req, env) {
  // Search contacts in cloud KV by keywords (full cloud mode, no agent needed)
  const body = await req.json();
  const keywords = body.keywords || [];
  const contactName = body.contact_name || '';

  // Verify Clerk session
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  // Build search terms
  const searchTerms = [...new Set([...keywords, contactName].filter(t => t))];
  if (searchTerms.length === 0) {
    // No keywords — return overview from data_context KV
    const dataContext = await env.USER_DATA.get(`ctx:${userId}`);
    return { status: 200, data: { data_context: dataContext || '', matched_count: 0 } };
  }

  // Load contacts from KV
  const contactsRaw = await env.USER_DATA.get(`contacts:${userId}`);
  if (!contactsRaw) {
    return { status: 200, data: { data_context: '', matched_count: 0, reason: 'no data synced' } };
  }

  let contacts;
  try {
    contacts = JSON.parse(contactsRaw);
  } catch (e) {
    return { status: 500, data: { error: 'Failed to parse contacts data' } };
  }

  // Load todos and timeline for enriching results
  const todosRaw = await env.USER_DATA.get(`todos:${userId}`);
  const timelineRaw = await env.USER_DATA.get(`timeline:${userId}`);
  const todos = todosRaw ? JSON.parse(todosRaw) : [];
  const timeline = timelineRaw ? JSON.parse(timelineRaw) : [];

  // Fuzzy match contacts
  const results = [];
  for (const c of contacts) {
    const name = c.name || '';
    const aliases = (c.aliases || []).join(' ');
    const notes = c.notes || '';
    const relation = c.relation || '';
    const subRelation = c.sub_relation || '';
    const searchable = `${name} ${aliases} ${notes} ${relation} ${subRelation}`;

    const matched = searchTerms.some(term => name.includes(term) || searchable.includes(term));
    if (matched) results.push(c);
  }

  // Build detailed context for matched contacts (top 10)
  const lines = [];
  for (const c of results.slice(0, 10)) {
    const name = c.name || '';
    const nature = c.nature || 'leverage';
    const role = c.role || c.relation || '';
    const relation = c.relation || '';
    const notes = c.notes || '';
    const strength = c.strength || 3;
    const leverage = c.leverage || {};
    const importantDates = c.important_dates || [];
    const cid = c.id || '';

    const detailLines = [`【${name}】`];
    detailLines.push(`  类型：${nature} | 角色：${role} | 关系强度：${strength}/5`);
    if (relation) detailLines.push(`  关系：${relation}`);
    if (notes) detailLines.push(`  备注：${notes.substring(0, 200)}`);
    if (leverage && leverage.goals) detailLines.push(`  经营目标：${String(leverage.goals).substring(0, 100)}`);
    if (leverage && leverage.how) detailLines.push(`  联结方式：${String(leverage.how).substring(0, 100)}`);
    for (const d of importantDates.slice(0, 3)) {
      detailLines.push(`  重要日期：${d.label || ''} ${d.date || ''}`);
    }

    // Timeline (last 5 interactions for this contact)
    const contactTl = timeline
      .filter(t => t.contact === cid)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 5);
    if (contactTl.length > 0) {
      detailLines.push('  近期互动：');
      for (const t of contactTl) {
        detailLines.push(`    · ${(t.date || '').substring(0, 10)} ${(t.summary || t.content || '').substring(0, 80)}`);
      }
    }

    // Related pending todos
    const contactTodos = todos.filter(t => t.contact === cid && t.status === 'pending').slice(0, 5);
    if (contactTodos.length > 0) {
      detailLines.push('  相关待办：');
      for (const t of contactTodos) {
        detailLines.push(`    · ${(t.task || t.content || '').substring(0, 80)}`);
      }
    }

    lines.push(detailLines.join('\n'));
  }

  // Build todo overview
  const pendingTodos = todos.filter(t => t.status === 'pending');
  let todoCtx = '';
  if (pendingTodos.length > 0) {
    const today = localDateStr(req);
    const todoLines = [`【待办】共 ${pendingTodos.length} 条`];
    for (const t of pendingTodos) {
      const due = (t.due || '').substring(0, 10);
      const task = (t.task || t.content || '').substring(0, 80);
      const contact = t.contact || '';
      if (due) {
        const delta = Math.floor((new Date(due) - new Date(today)) / 86400000);
        if (delta < 0) todoLines.push(`  · [${contact}] ${task}（超期${-delta}天）`);
        else if (delta === 0) todoLines.push(`  · [${contact}] ${task}（今天）`);
        else todoLines.push(`  · [${contact}] ${task}（${delta}天后）`);
      } else {
        todoLines.push(`  · [${contact}] ${task}`);
      }
    }
    todoCtx = '\n\n' + todoLines.join('\n');
  }

  const resultText = `搜索关键词：${searchTerms.join(', ')}\n匹配到 ${results.length} 个联系人\n\n` +
    lines.join('\n\n') + todoCtx;

  return {
    status: 200,
    data: {
      data_context: resultText,
      matched_count: results.length,
    },
  };
}

async function handleDataContext(req, env) {
  // Verify Clerk session (token from Authorization header)
  const userId = await getVerifiedUserId(req, env, null);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  const dataContext = await env.USER_DATA.get(`ctx:${userId}`);

  if (!dataContext) {
    return { status: 200, data: { data_context: '', synced_at: null } };
  }

  return { status: 200, data: { data_context: dataContext } };
}

// ── Cloud-native CRUD: direct data management in cloud KV ──

// Helper: load a dataset from KV
async function loadDataset(env, userId, name) {
  const raw = await env.USER_DATA.get(`${name}:${userId}`);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// Helper: save a dataset to KV
const KV_MAX_VALUE_SIZE = 25 * 1024 * 1024; // 25MB Cloudflare KV limit
async function saveDataset(env, userId, name, data) {
  // No expirationTtl — todos/timeline/contacts should persist indefinitely.
  // (Previous 604800s/7day TTL caused data loss and stale reads.)
  const serialized = JSON.stringify(data);
  if (serialized.length > KV_MAX_VALUE_SIZE) {
    const sizeMB = (serialized.length / 1024 / 1024).toFixed(1);
    throw new Error(`Dataset ${name} exceeds 25MB KV limit (${sizeMB}MB). Consider archiving old data.`);
  }
  try {
    await env.USER_DATA.put(`${name}:${userId}`, serialized);
  } catch (e) {
    console.error(`[saveDataset] KV write failed for ${name}:${userId} (quota?):`, e.message);
    throw new Error(`数据保存失败，请稍后重试`);
  }
}

// ── Network algorithms: path search, scenario recommendation, graph ──

function contactMatchesName(contact, name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  if (contact.name && contact.name.toLowerCase().includes(lower)) return true;
  if (contact.aliases) {
    for (const a of contact.aliases) {
      if (a && a.toLowerCase().includes(lower)) return true;
    }
  }
  if (contact.alias) {
    for (const a of contact.alias) {
      if (a && a.toLowerCase().includes(lower)) return true;
    }
  }
  return false;
}

function findRelationshipPath(contacts, fromName, toName, maxHops = 4) {
  // BFS through contact.connections to find shortest path from→to
  const fromContact = contacts.find(c => contactMatchesName(c, fromName));
  const toContact = contacts.find(c => contactMatchesName(c, toName));
  if (!fromContact) return { found: false, error: `未找到联系人「${fromName}」` };
  if (!toContact) return { found: false, error: `未找到联系人「${toName}」` };
  if (fromContact.id === toContact.id) return { found: true, path: [fromContact.name], hops: 0 };

  // Build adjacency from connections field
  const adj = {};
  for (const c of contacts) {
    adj[c.id] = [];
    if (c.connections) {
      for (const conn of c.connections) {
        if (contacts.find(x => x.id === conn.id)) {
          adj[c.id].push({ id: conn.id, desc: conn.desc || '' });
        }
      }
    }
  }

  // BFS
  const visited = new Set([fromContact.id]);
  const queue = [{ id: fromContact.id, path: [{ name: fromContact.name, id: fromContact.id }] }];
  while (queue.length > 0) {
    const { id, path } = queue.shift();
    if (path.length - 1 >= maxHops) continue;
    const neighbors = adj[id] || [];
    for (const neighbor of neighbors) {
      if (visited.has(neighbor.id)) continue;
      visited.add(neighbor.id);
      const neighborContact = contacts.find(c => c.id === neighbor.id);
      const newPath = [...path, { name: neighborContact ? neighborContact.name : neighbor.id, id: neighbor.id, desc: neighbor.desc }];
      if (neighbor.id === toContact.id) {
        return { found: true, path: newPath, hops: newPath.length - 1 };
      }
      queue.push({ id: neighbor.id, path: newPath });
    }
  }
  return { found: false, error: `没有找到从「${fromName}」到「${toName}」的路径（≤${maxHops}跳）` };
}

function recommendByScenario(contacts, scenario, topN = 10) {
  const lower = scenario.toLowerCase();
  const scored = contacts.map(c => {
    let score = 0;
    const reasons = [];
    // Match by tags
    if (c.tags) {
      for (const tag of c.tags) {
        if (tag && lower.includes(tag.toLowerCase())) { score += 3; reasons.push(`标签匹配: ${tag}`); }
        if (tag && tag.toLowerCase().includes(lower)) { score += 2; reasons.push(`标签相关: ${tag}`); }
      }
    }
    // Match by company
    if (c.company && lower.includes(c.company.toLowerCase())) { score += 3; reasons.push(`公司: ${c.company}`); }
    if (c.company && c.company.toLowerCase().includes(lower)) { score += 1; reasons.push(`公司相关: ${c.company}`); }
    // Match by title/role
    if (c.title && lower.includes(c.title.toLowerCase())) { score += 2; reasons.push(`职位: ${c.title}`); }
    if (c.role && lower.includes(c.role.toLowerCase())) { score += 2; reasons.push(`角色: ${c.role}`); }
    // Match by notes
    if (c.notes && c.notes.toLowerCase().includes(lower)) { score += 1; reasons.push('备注中有相关关键词'); }
    // Match by leverage fields
    if (c.leverage && c.leverage.value && lower.includes(String(c.leverage.value).toLowerCase())) { score += 2; reasons.push(`能提供: ${c.leverage.value}`); }
    // Boost by strength
    score += (c.strength || 3) * 0.5;
    return { contact: { id: c.id, name: c.name, company: c.company, title: c.title, tags: c.tags, nature: c.nature }, score, reasons };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, topN);
  return scored;
}

function buildNetworkGraph(contacts) {
  const nodes = contacts.map(c => ({
    id: c.id,
    name: c.name,
    company: c.company || '',
    title: c.title || '',
    nature: c.nature || 'leverage',
    strength: c.strength || 3,
    tags: c.tags || [],
  }));
  const edges = [];
  const seen = new Set();
  for (const c of contacts) {
    if (!c.connections) continue;
    for (const conn of c.connections) {
      const key = [c.id, conn.id].sort().join('→');
      if (seen.has(key)) continue;
      seen.add(key);
      const target = contacts.find(x => x.id === conn.id);
      if (target) {
        edges.push({ source: c.id, sourceName: c.name, target: conn.id, targetName: target.name, desc: conn.desc || '' });
      }
    }
  }
  return { nodes, edges, stats: { totalContacts: nodes.length, totalConnections: edges.length } };
}

// ── Shared data models (single source of truth) ──
// Mirrors src/welian/models.py — keep in sync.
function createContact(name, opts = {}) {
  const now = new Date().toISOString();
  return {
    id: opts.id || `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    relation: opts.relation || '',
    role: opts.role || opts.relation || '',
    sub_relation: opts.sub_relation || '',
    company: opts.company || '',
    title: opts.title || '',
    nature: opts.nature || 'leverage',
    strength: opts.strength || 3,
    tags: opts.tags || [],
    platforms: opts.platforms || {},
    phone: opts.phone || '',
    email: opts.email || '',
    notes: opts.notes || '',
    memories: opts.memories || [],
    important_dates: opts.important_dates || [],
    leverage: opts.leverage || {},
    nurture: opts.nurture || {},
    aliases: opts.aliases || [],
    alias: opts.alias || [],
    connections: opts.connections || [],
    created: opts.created || now,
    updated: opts.updated || now,
  };
}

function createTimelineEntry(contactId, summary, opts = {}) {
  const now = new Date().toISOString();
  return {
    id: opts.id || `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: opts.date || now.slice(0, 10),
    contact: contactId,
    type: opts.type || 'message',
    summary,
    key_points: opts.key_points || [],
    pending: opts.pending || '',
    created: opts.created || now,
  };
}

function createTodo(contactId, task, opts = {}) {
  const now = new Date().toISOString();
  return {
    id: opts.id || `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    contact: contactId,
    task,
    priority: opts.priority || 'P1',
    due: opts.due || '',
    status: opts.status || 'pending',
    source: opts.source || '',
    created: opts.created || now,
  };
}

// ── Metrics tracking (P0: North Star + Advice Adoption) ──
// Stores weekly action counters and advise adoption events.
// Key: metrics:${userId} → { weekly: { 'YYYY-WW': {advise_generated, todo_completed, interaction_recorded, draft_generated} }, adoptions: [{advise_id, action_type, ts}], last_advise_ts, last_advise_id }

async function loadMetrics(env, userId) {
  const raw = await env.USER_DATA.get(`metrics:${userId}`);
  if (!raw) return { weekly: {}, adoptions: [], last_advise_ts: null, last_advise_id: null };
  try { return JSON.parse(raw); } catch { return { weekly: {}, adoptions: [], last_advise_ts: null, last_advise_id: null }; }
}

async function saveMetrics(env, userId, metrics) {
  try {
    await env.USER_DATA.put(`metrics:${userId}`, JSON.stringify(metrics));
  } catch (e) {
    console.error('[saveMetrics] KV write failed (quota?):', e.message);
  }
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  // ISO 8601 week calculation
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}

// ── DAU tracking ──
// Stores daily active users as a comma-separated list in KV (lightweight set)
// Key: dau:YYYY-MM-DD, TTL: 35 days
async function trackDAU(env, userId) {
  if (!userId) return;
  const today = new Date().toISOString().slice(0, 10);
  const key = `dau:${today}`;
  const existing = await env.USER_DATA.get(key);
  const users = existing ? existing.split(',').filter(Boolean) : [];
  if (!users.includes(userId)) {
    users.push(userId);
    await env.USER_DATA.put(key, users.join(','), { expirationTtl: 3024000 }); // 35 days
  }
}

// Get DAU stats for last N days (public, no auth required)
async function handleDauStats(env) {
  const days = 14;
  const stats = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const dateKey = d.toISOString().slice(0, 10);
    const data = await env.USER_DATA.get(`dau:${dateKey}`);
    const count = data ? data.split(',').filter(Boolean).length : 0;
    stats.push({ date: dateKey, dau: count });
  }
  // Also track anonymous pageviews (signals.html visitors)
  const todayKey = now.toISOString().slice(0, 10);
  const pvData = await env.USER_DATA.get(`pageviews:${todayKey}`);
  const pageviews = pvData ? parseInt(pvData) : 0;
  return {
    status: 200,
    data: {
      days: stats,
      today_dau: stats[stats.length - 1]?.dau || 0,
      avg_dau_7d: Math.round(stats.slice(-7).reduce((a, b) => a + b.dau, 0) / 7),
      pageviews_today: pageviews,
      goal: 1000,
      progress: Math.round(((stats[stats.length - 1]?.dau || 0) / 1000) * 100),
    },
  };
}

// In-memory dedup cache: {userId_actionType: timestamp}
// Prevents redundant KV writes when the same action fires repeatedly within 5 min.
const _trackActionCache = new Map();
const TRACK_ACTION_DEDUP_MS = 300000; // 5 minutes
// Test helper: clear dedup cache between tests
if (typeof globalThis !== 'undefined') {
  globalThis._clearTrackActionCache = () => _trackActionCache.clear();
}

// Track a relationship action event (North Star metric)
async function trackAction(env, userId, actionType, meta = {}) {
  if (!userId) return;
  // Dedup: skip if same user+action tracked within 5 min (saves KV writes)
  const cacheKey = `${userId}:${actionType}`;
  const lastTracked = _trackActionCache.get(cacheKey);
  if (lastTracked && (Date.now() - lastTracked) < TRACK_ACTION_DEDUP_MS) {
    // Still track DAU (cheap — only writes once per user per day)
    trackDAU(env, userId).catch(() => {});
    return;
  }
  _trackActionCache.set(cacheKey, Date.now());
  // Clean old entries periodically
  if (_trackActionCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of _trackActionCache) {
      if (now - v > TRACK_ACTION_DEDUP_MS) _trackActionCache.delete(k);
    }
  }
  // Track DAU (fire-and-forget, non-blocking)
  trackDAU(env, userId).catch(() => {});
  const metrics = await loadMetrics(env, userId);
  const wk = getWeekKey(new Date().toISOString());
  if (!metrics.weekly[wk]) {
    metrics.weekly[wk] = { advise_generated: 0, todo_completed: 0, interaction_recorded: 0, draft_generated: 0, signal_action: 0 };
  }
  if (metrics.weekly[wk][actionType] !== undefined) {
    metrics.weekly[wk][actionType]++;
  } else if (actionType === 'signal_action') {
    // New action type not in old weekly objects — initialize if missing
    metrics.weekly[wk].signal_action = (metrics.weekly[wk].signal_action || 0) + 1;
  }

  // P0-2: Advice adoption — if this action happens within 7 days of last advise, count as adoption
  if (metrics.last_advise_ts && (actionType === 'todo_completed' || actionType === 'interaction_recorded' || actionType === 'draft_generated')) {
    const daysSinceAdvise = (Date.now() - new Date(metrics.last_advise_ts).getTime()) / 86400000;
    if (daysSinceAdvise <= 7) {
      metrics.adoptions.push({
        advise_id: metrics.last_advise_id,
        action_type: actionType,
        ts: new Date().toISOString(),
        contact: meta.contact_name || null,
      });
      // Keep only last 100 adoptions
      if (metrics.adoptions.length > 100) metrics.adoptions = metrics.adoptions.slice(-100);
    }
  }

  await saveMetrics(env, userId, metrics);
}

// Register an advise event and return its unique ID
async function registerAdvise(env, userId) {
  if (!userId) return null;
  const adviseId = `adv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const metrics = await loadMetrics(env, userId);
  const wk = getWeekKey(new Date().toISOString());
  if (!metrics.weekly[wk]) {
    metrics.weekly[wk] = { advise_generated: 0, todo_completed: 0, interaction_recorded: 0, draft_generated: 0, signal_action: 0 };
  }
  metrics.weekly[wk].advise_generated++;
  metrics.last_advise_ts = new Date().toISOString();
  metrics.last_advise_id = adviseId;
  await saveMetrics(env, userId, metrics);
  return adviseId;
}

// POST /data/contacts — add or update a contact
// GET  /data/contacts — list all contacts (minimal)
// DELETE /data/contacts?id=xxx — delete a contact
async function handleContactsCRUD(req, env, method) {
  // Read body once for both auth and CRUD
  const body = method === 'GET' ? null : await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  if (method === 'GET') {
    const contacts = await loadDataset(env, userId, 'contacts');
    // Pagination support (for mini program with large contact lists)
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '0');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const search = url.searchParams.get('q') || '';
    const compact = url.searchParams.get('compact') === '1';

    // Filter by search first (before slicing)
    let filtered = contacts;
    if (search) {
      filtered = contacts.filter(c => (c.name || '').includes(search) || (c.aliases || []).some(a => a.includes(search)));
    }
    const total = filtered.length;

    // Slice before mapping to reduce work
    let paged = filtered;
    if (limit > 0) {
      paged = filtered.slice(offset, offset + limit);
    }

    // compact mode: only essential fields for list display (much smaller response)
    const list = paged.map(c => compact ? {
      id: c.id, name: c.name, nature: c.nature || 'leverage',
      company: c.company || '', title: c.title || '',
      relation: c.relation || '', role: c.role || c.relation || '',
      phone: c.phone || '', email: c.email || '',
      birthday: c.birthday || '',
    } : {
      id: c.id, name: c.name, relation: c.relation || '',
      sub_relation: c.sub_relation || '', company: c.company || '',
      title: c.title || '', nature: c.nature || 'leverage',
      role: c.role || c.relation || '', strength: c.strength || 0,
      tags: (c.tags || []).slice(0, 5),
      aliases: c.aliases || c.alias || [],
      snooze_until: c.snooze_until || '',
      phone: c.phone || '',
      email: c.email || '',
      leverage: c.leverage || null,
      nurture: c.nurture || null,
      important_dates: c.important_dates || [],
      memories: c.memories || [],
      presence_events: c.presence_events || [],
      birthday: c.birthday || '',
      updated: c.updated || '',
    });
    return { status: 200, data: { contacts: list, total, offset, limit: limit || total } };
  }

  if (method === 'POST') {
    const contacts = await loadDataset(env, userId, 'contacts');

    const name = (body.name || '').trim();
    if (!name) {
      return { status: 400, data: { error: 'name required' } };
    }

    // Check if updating existing (by id)
    const existingId = body.id;
    if (existingId) {
      const idx = contacts.findIndex(c => c.id === existingId);
      if (idx >= 0) {
        // Update existing contact
        contacts[idx] = { ...contacts[idx], ...body, id: existingId, updated: new Date().toISOString() };
        await saveDataset(env, userId, 'contacts', contacts);
        return { status: 200, data: { ok: true, contact: contacts[idx] } };
      }
    }

    // Create new contact
    const id = body.id || `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const contact = {
      id,
      name,
      relation: body.relation || '',
      sub_relation: body.sub_relation || '',
      company: body.company || '',
      title: body.title || '',
      role: body.relation || '',
      nature: body.nature || 'leverage',
      strength: body.strength || 3,
      tags: body.tags || [],
      platforms: body.platforms || {},
      phone: body.phone || '',
      email: body.email || '',
      notes: body.notes || '',
      memories: [],
      important_dates: body.important_dates || [],
      leverage: body.leverage || {},
      nurture: body.nurture || {},
      aliases: body.aliases || [],
      alias: body.alias || [],
      snooze_until: body.snooze_until || '',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
    contacts.push(contact);
    await saveDataset(env, userId, 'contacts', contacts);
    return { status: 200, data: { ok: true, contact } };
  }

  if (method === 'DELETE') {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return { status: 400, data: { error: 'id required' } };
    }
    let contacts = await loadDataset(env, userId, 'contacts');
    contacts = contacts.filter(c => c.id !== id);
    await saveDataset(env, userId, 'contacts', contacts);
    // Also remove related timeline + todos
    let todos = await loadDataset(env, userId, 'todos');
    todos = todos.filter(t => t.contact !== id);
    await saveDataset(env, userId, 'todos', todos);
    let timeline = await loadDataset(env, userId, 'timeline');
    timeline = timeline.filter(t => t.contact !== id);
    await saveDataset(env, userId, 'timeline', timeline);
    return { status: 200, data: { ok: true } };
  }

  if (method === 'PUT') {
    // Incremental dedup: merge duplicates by name, keep richer record, don't overwrite non-duplicate data
    const contacts = await loadDataset(env, userId, 'contacts');
    const byName = new Map();
    const noName = [];
    const mergedIds = [];
    for (const c of contacts) {
      const name = (c.name || '').trim();
      if (!name) { noName.push(c); continue; }
      if (byName.has(name)) {
        const existing = byName.get(name);
        const existingScore = (existing.strength || 0) + (existing.relation ? 1 : 0) + (existing.sub_relation ? 1 : 0) + (existing.tags || []).length;
        const newScore = (c.strength || 0) + (c.relation ? 1 : 0) + (c.sub_relation ? 1 : 0) + (c.tags || []).length;
        if (newScore > existingScore) {
          // Merge existing into c, keep c as primary
          for (const k of Object.keys(existing)) {
            if (k === 'id') continue;
            if (!c[k] && existing[k]) c[k] = existing[k];
            else if (k === 'tags' && Array.isArray(existing[k]) && Array.isArray(c[k])) {
              c[k] = [...new Set([...c[k], ...existing[k]])];
            }
          }
          mergedIds.push(existing.id);
          byName.set(name, c);
        } else {
          // Merge c into existing, keep existing as primary
          for (const k of Object.keys(c)) {
            if (k === 'id') continue;
            if (!existing[k] && c[k]) existing[k] = c[k];
            else if (k === 'tags' && Array.isArray(c[k]) && Array.isArray(existing[k])) {
              existing[k] = [...new Set([...existing[k], ...c[k]])];
            }
          }
          mergedIds.push(c.id);
        }
      } else {
        byName.set(name, c);
      }
    }
    const deduped = [...byName.values(), ...noName];
    await saveDataset(env, userId, 'contacts', deduped);
    return { status: 200, data: { ok: true, total: deduped.length, removed: mergedIds.length, merged_ids: mergedIds } };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

// ── Persistent Memory System (F1) ──
// KV key: memory:{userId} → JSON array of {type, title, content, tags, timestamp}
// Token-based relevance scoring for recall, top results injected into system prompt

const MEMORY_TYPES = ['preference', 'context', 'milestone', 'contact_note'];
const MAX_MEMORIES = 200;
const MAX_MEMORY_CHARS = 2000;

// CJK-aware tokenization for relevance scoring
function tokenize(text) {
  if (!text) return new Set();
  const tokens = new Set();
  // Latin tokens: 3+ chars
  const latin = text.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  latin.forEach(t => tokens.add(t));
  // CJK: each char is a token
  const cjk = text.match(/[\u4e00-\u9fff\uu3400-\u4dbf]/g) || [];
  cjk.forEach(t => tokens.add(t));
  return tokens;
}

async function saveMemory(env, userId, memType, title, content, tags = []) {
  if (!MEMORY_TYPES.includes(memType)) {
    throw new Error(`Invalid memory_type: ${memType}`);
  }
  if (!title || !title.trim()) throw new Error('title required');
  if (!content || !content.trim()) throw new Error('content required');
  const key = `memory:${userId}`;
  const raw = await env.USER_DATA.get(key);
  const memories = raw ? JSON.parse(raw) : [];
  // Truncate content
  const truncated = content.length > MAX_MEMORY_CHARS
    ? content.slice(0, MAX_MEMORY_CHARS) + '…'
    : content;
  memories.push({
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: memType,
    title: title.trim(),
    content: truncated.trim(),
    tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
    timestamp: new Date().toISOString(),
  });
  // Cap at MAX_MEMORIES, drop oldest
  const capped = memories.length > MAX_MEMORIES
    ? memories.slice(-MAX_MEMORIES)
    : memories;
  await env.USER_DATA.put(key, JSON.stringify(capped));
  return capped[capped.length - 1];
}

async function recallMemories(env, userId, query, limit = 3) {
  const raw = await env.USER_DATA.get(`memory:${userId}`);
  if (!raw) return [];
  const memories = JSON.parse(raw);
  if (memories.length === 0) return [];
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) {
    // No query tokens → return most recent
    return memories.slice(-limit).reverse();
  }
  const scored = memories.map(m => {
    const memTokens = tokenize(m.title + ' ' + m.content + ' ' + (m.tags || []).join(' '));
    let intersection = 0;
    queryTokens.forEach(t => { if (memTokens.has(t)) intersection++; });
    const score = intersection / queryTokens.size;
    return { score, memory: m };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score > 0).slice(0, limit).map(s => s.memory);
}

async function deleteMemory(env, userId, memId) {
  const key = `memory:${userId}`;
  const raw = await env.USER_DATA.get(key);
  if (!raw) return false;
  const memories = JSON.parse(raw);
  const filtered = memories.filter(m => m.id !== memId);
  if (filtered.length === memories.length) return false;
  await env.USER_DATA.put(key, JSON.stringify(filtered));
  return true;
}

// GET /data/memory — list memories (optional ?q=query for recall)
// POST /data/memory — {action: save|delete, type, title, content, tags, id}
async function handleMemory(req, env, method) {
  // Read body once for both auth and POST logic (avoids double-read bug)
  const body = method === 'GET' ? null : await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  if (method === 'GET') {
    const url = new URL(req.url);
    const q = url.searchParams.get('q') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);
    if (q) {
      const recalled = await recallMemories(env, userId, q, Math.min(limit, 5));
      return { status: 200, data: { memories: recalled } };
    }
    const raw = await env.USER_DATA.get(`memory:${userId}`);
    const memories = raw ? JSON.parse(raw) : [];
    return { status: 200, data: { memories: memories.slice(-limit).reverse() } };
  }

  if (method === 'POST') {
    const action = body.action || 'save';
    if (action === 'delete') {
      const ok = await deleteMemory(env, userId, body.id);
      return { status: ok ? 200 : 404, data: { ok, deleted: ok } };
    }
    // save
    try {
      const mem = await saveMemory(env, userId, body.type || 'context', body.title, body.content, body.tags);
      return { status: 200, data: { ok: true, memory: mem } };
    } catch (e) {
      return { status: 400, data: { error: e.message } };
    }
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

// ── Relationship Behavior Diagnostics (F3) ──
// Analyzes timeline data to extract interaction patterns and behavior biases

async function handleDiagnostics(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  // Load timeline + contacts
  const timelineRaw = await env.USER_DATA.get(`timeline:${userId}`);
  const contactsRaw = await env.USER_DATA.get(`contacts:${userId}`);
  const timeline = timelineRaw ? JSON.parse(timelineRaw) : [];
  const contacts = contactsRaw ? JSON.parse(contactsRaw) : [];

  if (timeline.length === 0) {
    return { status: 200, data: {
      summary: '暂无互动记录，无法分析行为模式',
      patterns: [],
      recommendations: [],
    }};
  }

  const now = new Date();
  const patterns = [];

  // 1. Interaction frequency distribution (pulse vs steady)
  const byMonth = {};
  timeline.forEach(t => {
    const d = (t.date || t.timestamp || '').substring(0, 7);
    if (d) byMonth[d] = (byMonth[d] || 0) + 1;
  });
  const monthCounts = Object.values(byMonth);
  const avgMonthly = monthCounts.length > 0 ? monthCounts.reduce((a, b) => a + b, 0) / monthCounts.length : 0;
  const maxMonth = Math.max(...monthCounts, 0);
  const minMonth = Math.min(...monthCounts, 0);
  const isPulse = maxMonth > avgMonthly * 3 && minMonth === 0;
  patterns.push({
    type: 'frequency_distribution',
    label: isPulse ? '脉冲式互动' : '持续式互动',
    detail: isPulse
      ? `互动集中在某些月份（最高${maxMonth}次 vs 平均${avgMonthly.toFixed(1)}次），有月份为0。建议保持持续经营。`
      : `互动分布较均匀（平均${avgMonthly.toFixed(1)}次/月），持续经营中。`,
    severity: isPulse ? 'warning' : 'good',
  });

  // 2. Relationship asymmetry — who you contact most vs least
  const byContact = {};
  timeline.forEach(t => {
    const name = t.contact || t.name || '';
    if (name) byContact[name] = (byContact[name] || 0) + 1;
  });
  const sortedContacts = Object.entries(byContact).sort((a, b) => b[1] - a[1]);
  const topContacts = sortedContacts.slice(0, 3).map(([name, count]) => ({ name, count }));
  const coldContacts = sortedContacts.slice(-3).filter(([, count]) => count <= 1).map(([name, count]) => ({ name, count }));
  if (topContacts.length > 0) {
    patterns.push({
      type: 'contact_concentration',
      label: '互动集中度',
      detail: `最常联系：${topContacts.map(c => `${c.name}(${c.count}次)`).join('、')}${coldContacts.length > 0 ? `。冷门联系人：${coldContacts.map(c => c.name).join('、')}` : ''}`,
      severity: topContacts[0].count > avgMonthly * 5 ? 'warning' : 'info',
    });
  }

  // 3. Procrastination pattern — interactions clustered before deadlines/events
  const recentTimeline = timeline.filter(t => {
    const d = new Date((t.date || t.timestamp || '1970-01-01').substring(0, 10));
    return (now - d) / 86400000 < 90; // last 90 days
  });
  const recentByContact = {};
  recentTimeline.forEach(t => {
    const name = t.contact || t.name || '';
    if (name) {
      if (!recentByContact[name]) recentByContact[name] = [];
      recentByContact[name].push((t.date || t.timestamp || '').substring(0, 10));
    }
  });
  const procrastinationTargets = [];
  Object.entries(recentByContact).forEach(([name, dates]) => {
    if (dates.length >= 2) {
      dates.sort();
      const gaps = [];
      for (let i = 1; i < dates.length; i++) {
        gaps.push((new Date(dates[i]) - new Date(dates[i - 1])) / 86400000);
      }
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const maxGap = Math.max(...gaps);
      if (maxGap > avgGap * 3 && maxGap > 60) {
        procrastinationTargets.push({ name, avgGap: avgGap.toFixed(0), maxGap: maxGap.toFixed(0) });
      }
    }
  });
  if (procrastinationTargets.length > 0) {
    patterns.push({
      type: 'procrastination',
      label: '拖延式联系',
      detail: `${procrastinationTargets.map(t => `${t.name}（间隔从${t.avgGap}天跳到${t.maxGap}天）`).join('、')}。存在"想起来才联系"模式。`,
      severity: 'warning',
    });
  }

  // 4. Tool-type vs emotional-type ratio (based on interaction content keywords)
  const toolKeywords = ['项目', '合作', '帮忙', '介绍', '对接', '推进', '汇报', '请托', '咨询', '请教'];
  const emotionalKeywords = ['问候', '关心', '生日', '祝福', '聚聚', '聊聊', '想念', '感谢', '陪伴', '家里'];
  let toolCount = 0, emotionalCount = 0;
  timeline.forEach(t => {
    const text = (t.content || t.summary || t.note || '').toLowerCase();
    if (toolKeywords.some(k => text.includes(k))) toolCount++;
    if (emotionalKeywords.some(k => text.includes(k))) emotionalCount++;
  });
  const totalCategorized = toolCount + emotionalCount;
  if (totalCategorized > 0) {
    const toolRatio = toolCount / totalCategorized;
    patterns.push({
      type: 'relationship_type_ratio',
      label: toolRatio > 0.7 ? '工具型偏重' : toolRatio < 0.3 ? '情感型偏重' : '平衡型',
      detail: `近期互动中，事务性互动${toolCount}次，情感性互动${emotionalCount}次（占比${(toolRatio * 100).toFixed(0)}% : ${((1 - toolRatio) * 100).toFixed(0)}%）。${toolRatio > 0.7 ? '建议增加情感性互动，避免关系单一化。' : toolRatio < 0.3 ? '事业型关系经营不足，可适当增加专业交流。' : '关系类型分布均衡。'}`,
      severity: toolRatio > 0.7 ? 'warning' : 'info',
    });
  }

  // 5. Response latency estimation (based on todo completion patterns)
  const todosRaw = await env.USER_DATA.get(`todos:${userId}`);
  const todos = todosRaw ? JSON.parse(todosRaw) : [];
  const overdueTodos = todos.filter(t => {
    if (t.status === 'done' || t.status === 'cancelled') return false;
    const due = t.due_date || t.date || '';
    if (!due) return false;
    return new Date(due.substring(0, 10)) < now;
  });
  if (overdueTodos.length > 0) {
    patterns.push({
      type: 'overdue_todos',
      label: '待办积压',
      detail: `${overdueTodos.length}个待办已过期未完成。涉及：${overdueTodos.slice(0, 3).map(t => t.contact || t.task || '').filter(Boolean).join('、')}。可能存在"计划了但没执行"的倾向。`,
      severity: overdueTodos.length > 5 ? 'warning' : 'info',
    });
  }

  // Generate recommendations
  const recommendations = [];
  if (isPulse) recommendations.push('尝试每周固定时间联系2-3人，避免"想起来才批量联系"');
  if (procrastinationTargets.length > 0) recommendations.push(`对${procrastinationTargets[0].name}等设置月度提醒，保持稳定节奏`);
  if (patterns.find(p => p.type === 'relationship_type_ratio' && p.severity === 'warning')) {
    recommendations.push('主动增加1-2次纯问候互动，不带事务目的');
  }
  if (overdueTodos.length > 3) recommendations.push('清理过期待办，重新评估优先级或取消');
  if (coldContacts.length > 0) recommendations.push(`考虑重新激活冷门联系人：${coldContacts.slice(0, 2).map(c => c.name).join('、')}`);

  const summary = `分析了${timeline.length}条互动记录、${contacts.length}个联系人，识别出${patterns.length}个行为模式。`;

  return { status: 200, data: { summary, patterns, recommendations, stats: {
    total_interactions: timeline.length,
    total_contacts: contacts.length,
    avg_monthly: avgMonthly.toFixed(1),
    active_months: monthCounts.length,
  }}};
}

// ── Session Persistence (H4) ──
// KV key: sessions:{userId} → JSON array of session objects
// Each session: {id, title, messages, created_at, updated_at}
// Messages: [{role, content, timestamp}]

const MAX_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 100;

async function loadSessions(env, userId) {
  const raw = await env.USER_DATA.get(`sessions:${userId}`);
  return raw ? JSON.parse(raw) : [];
}

async function saveSessions(env, userId, sessions) {
  await env.USER_DATA.put(`sessions:${userId}`, JSON.stringify(sessions.slice(-MAX_SESSIONS)));
}

// GET /data/sessions — list sessions (returns metadata only, no messages)
// GET /data/sessions?id=xxx — get full session with messages
// POST /data/sessions — {action: create|append|delete|clear, ...}
async function handleSessions(req, env, method) {
  const body = method === 'GET' ? null : await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  if (method === 'GET') {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('id');
    const sessions = await loadSessions(env, userId);
    if (sessionId) {
      const session = sessions.find(s => s.id === sessionId);
      if (!session) return { status: 404, data: { error: 'session not found' } };
      return { status: 200, data: { session } };
    }
    // Return metadata only (no messages) for list view
    const meta = sessions.map(s => ({
      id: s.id, title: s.title, message_count: (s.messages || []).length,
      created_at: s.created_at, updated_at: s.updated_at,
    })).reverse();
    return { status: 200, data: { sessions: meta } };
  }

  if (method === 'POST') {
    const action = body.action || 'create';

    if (action === 'create') {
      const sessions = await loadSessions(env, userId);
      const session = {
        id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: (body.title || '新对话').slice(0, 50),
        messages: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      sessions.push(session);
      await saveSessions(env, userId, sessions);
      return { status: 200, data: { ok: true, session } };
    }

    if (action === 'append') {
      const sessions = await loadSessions(env, userId);
      let session = sessions.find(s => s.id === body.session_id);
      if (!session) {
        // Auto-create if not found
        session = {
          id: body.session_id || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: (body.title || '新对话').slice(0, 50),
          messages: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        sessions.push(session);
      }
      // Append user and assistant messages
      if (body.user_message) {
        session.messages.push({ role: 'user', content: body.user_message, timestamp: new Date().toISOString() });
      }
      // Auto-title from first user message (before pushing assistant, so length check works)
      if (session.messages.length === 1 && body.user_message) {
        session.title = body.user_message.slice(0, 50);
      }
      if (body.assistant_message) {
        session.messages.push({ role: 'assistant', content: body.assistant_message, timestamp: new Date().toISOString() });
      }
      // Trim to max messages
      if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
        session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
      }
      session.updated_at = new Date().toISOString();
      await saveSessions(env, userId, sessions);
      return { status: 200, data: { ok: true, session_id: session.id } };
    }

    if (action === 'delete') {
      const sessions = await loadSessions(env, userId);
      const filtered = sessions.filter(s => s.id !== body.session_id);
      await saveSessions(env, userId, filtered);
      return { status: 200, data: { ok: true } };
    }

    if (action === 'clear') {
      await saveSessions(env, userId, []);
      return { status: 200, data: { ok: true } };
    }

    return { status: 400, data: { error: 'unknown action' } };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

// ── Custom Skills (H2) ──
// KV key: skills:{userId} → JSON array of custom skill objects
// Each skill: {id, name, triggers[], content, created_at, updated_at, usage_count, last_used, avg_score}
// Lifecycle: active → monitoring (low score) → disabled

async function loadCustomSkills(env, userId) {
  const raw = await env.USER_DATA.get(`skills:${userId}`);
  return raw ? JSON.parse(raw) : [];
}

async function saveCustomSkills(env, userId, skills) {
  await env.USER_DATA.put(`skills:${userId}`, JSON.stringify(skills));
}

// GET /data/skills — list custom skills
// POST /data/skills — {action: create|update|delete|record_use, ...}
// DELETE /data/skills — {skill_id, ...} (same as POST delete)
async function handleCustomSkills(req, env, method) {
  const body = method === 'GET' ? null : await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  if (method === 'GET') {
    const skills = await loadCustomSkills(env, userId);
    return { status: 200, data: { skills } };
  }

  if (method === 'POST' || method === 'DELETE') {
    const action = body.action || (method === 'DELETE' ? 'delete' : 'create');

    if (action === 'create') {
      const skills = await loadCustomSkills(env, userId);
      const skill = {
        id: `skill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: (body.name || '我的技能').slice(0, 50),
        triggers: Array.isArray(body.triggers) ? body.triggers.slice(0, 10) : [],
        content: (body.content || '').slice(0, 2000),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        usage_count: 0,
        last_used: null,
        avg_score: null,
        status: 'active',
      };
      skills.push(skill);
      await saveCustomSkills(env, userId, skills);
      return { status: 200, data: { ok: true, skill } };
    }

    if (action === 'update') {
      const skills = await loadCustomSkills(env, userId);
      const skill = skills.find(s => s.id === body.skill_id);
      if (!skill) return { status: 404, data: { error: 'skill not found' } };
      if (body.name !== undefined) skill.name = body.name.slice(0, 50);
      if (Array.isArray(body.triggers)) skill.triggers = body.triggers.slice(0, 10);
      if (body.content !== undefined) skill.content = body.content.slice(0, 2000);
      skill.updated_at = new Date().toISOString();
      await saveCustomSkills(env, userId, skills);
      return { status: 200, data: { ok: true, skill } };
    }

    if (action === 'delete') {
      const skills = await loadCustomSkills(env, userId);
      const filtered = skills.filter(s => s.id !== body.skill_id);
      await saveCustomSkills(env, userId, filtered);
      return { status: 200, data: { ok: true } };
    }

    if (action === 'record_use') {
      // Record skill usage + score for decay tracking
      const skills = await loadCustomSkills(env, userId);
      const skill = skills.find(s => s.id === body.skill_id);
      if (!skill) return { status: 404, data: { error: 'skill not found' } };
      skill.usage_count = (skill.usage_count || 0) + 1;
      skill.last_used = new Date().toISOString();
      // Update running average score (1-5 scale)
      if (body.score && body.score >= 1 && body.score <= 5) {
        const prevTotal = (skill.avg_score || 0) * Math.max(skill.usage_count - 1, 0);
        skill.avg_score = (prevTotal + body.score) / skill.usage_count;
        // Auto-degrade if avg score drops below 2.5 after 5+ uses
        if (skill.usage_count >= 5 && skill.avg_score < 2.5) {
          skill.status = 'monitoring';
        }
      }
      await saveCustomSkills(env, userId, skills);
      return { status: 200, data: { ok: true, skill } };
    }

    return { status: 400, data: { error: 'unknown action' } };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

// Load and merge custom skills into intent matching (called by handleChat)
async function getCustomSkillsForIntent(env, userId, intent) {
  if (!intent) return [];
  const skills = await loadCustomSkills(env, userId);
  return skills
    .filter(s => s.status === 'active' && s.triggers.includes(intent))
    .map(s => ({ id: s.id, name: s.name, content: s.content, custom: true }));
}

// ── Relationship Goal System (G1) ──
// KV key: goals:{userId} → JSON array of goal objects
// Lifecycle: active → completed | abandoned
// Each goal has criteria with evidence (auto-linked from interactions)

const GOAL_STATUSES = ['active', 'completed', 'abandoned'];
const MAX_GOALS = 20;

async function loadGoals(env, userId) {
  const raw = await env.USER_DATA.get(`goals:${userId}`);
  return raw ? JSON.parse(raw) : [];
}

async function saveGoals(env, userId, goals) {
  await env.USER_DATA.put(`goals:${userId}`, JSON.stringify(goals.slice(-MAX_GOALS)));
}

// GET /data/goals — list goals (optional ?status=active)
// POST /data/goals — {action: create|update|delete|add_evidence, ...}
async function handleGoals(req, env, method) {
  const body = method === 'GET' ? null : await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  if (method === 'GET') {
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get('status') || '';
    let goals = await loadGoals(env, userId);
    if (statusFilter && GOAL_STATUSES.includes(statusFilter)) {
      goals = goals.filter(g => g.status === statusFilter);
    }
    return { status: 200, data: { goals: goals.reverse() } };
  }

  if (method === 'POST') {
    const action = body.action || 'create';

    if (action === 'delete') {
      const goals = await loadGoals(env, userId);
      const filtered = goals.filter(g => g.id !== body.id);
      await saveGoals(env, userId, filtered);
      return { status: 200, data: { ok: true } };
    }

    if (action === 'create') {
      const title = (body.title || '').trim();
      const criteria = Array.isArray(body.criteria) ? body.criteria.filter(c => c && c.trim()) : [];
      if (!title) return { status: 400, data: { error: 'title required' } };
      if (criteria.length === 0) return { status: 400, data: { error: '至少需要一个验收标准' } };
      const goals = await loadGoals(env, userId);
      const goal = {
        id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title,
        criteria: criteria.map(c => ({ id: `crit_${Math.random().toString(36).slice(2, 7)}`, text: c.trim(), status: 'pending', evidence: [] })),
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      goals.push(goal);
      await saveGoals(env, userId, goals);
      return { status: 200, data: { ok: true, goal } };
    }

    if (action === 'update_status') {
      const goals = await loadGoals(env, userId);
      const goal = goals.find(g => g.id === body.goal_id);
      if (!goal) return { status: 404, data: { error: 'goal not found' } };
      if (!GOAL_STATUSES.includes(body.status)) return { status: 400, data: { error: 'invalid status' } };
      goal.status = body.status;
      goal.updated_at = new Date().toISOString();
      if (body.status === 'completed') goal.completed_at = new Date().toISOString();
      await saveGoals(env, userId, goals);
      return { status: 200, data: { ok: true, goal } };
    }

    if (action === 'add_evidence') {
      const goals = await loadGoals(env, userId);
      const goal = goals.find(g => g.id === body.goal_id);
      if (!goal) return { status: 404, data: { error: 'goal not found' } };
      const criterion = goal.criteria.find(c => c.id === body.criterion_id);
      if (!criterion) return { status: 404, data: { error: 'criterion not found' } };
      criterion.evidence.push({
        id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        text: (body.text || '').trim(),
        source: body.source || 'manual',
        timestamp: new Date().toISOString(),
      });
      criterion.status = 'satisfied';
      goal.updated_at = new Date().toISOString();
      // Auto-complete goal if all criteria satisfied
      if (goal.criteria.every(c => c.status === 'satisfied')) {
        goal.status = 'completed';
        goal.completed_at = new Date().toISOString();
      }
      await saveGoals(env, userId, goals);
      return { status: 200, data: { ok: true, goal } };
    }

    return { status: 400, data: { error: 'unknown action' } };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

// ── Skills System (F4) ──
// Built-in skills loaded by intent, injected into system prompt context

const BUILTIN_SKILLS = {
  'follow-up-strategy': {
    name: '跟进策略',
    triggers: ['advise', 'report'],
    content: `## 跟进策略 Skill

当用户问"该联系谁了"或"这周联系谁"时，按以下框架建议：

1. **逾期联系人**：超过预期频率未联系的人（优先级最高）
2. **待办关联人**：有待办涉及的人
3. **即将到来的重要日期**：生日/纪念日/晋升等
4. **冷却预警**：即将进入冷却期的人

建议格式：
- 每人给出"为什么现在联系"+"聊什么话题"
- 区分经营型（给理由）和陪伴型（给心意）
- 最多推荐3-5人，不制造焦虑`,
  },
  'reconnection-outreach': {
    name: '重新联系',
    triggers: ['advise', 'draft'],
    content: `## 重新联系 Skill

当用户想重新联系很久没联系的人时：

1. **破冰角度**：找一个自然的切入点（共同经历/行业动态/节日/对方近况）
2. **消息结构**：暖场 → 提及近况 → 轻量邀约/问候 → 不给压力
3. **频率建议**：首次重新联系后，建议1-2周后跟进第二次
4. **话术原则**：
   - 不道歉"很久没联系"（显得有负担）
   - 用"最近想到你"代替"好久不见"
   - 给对方容易回应的话题，不开放式问"最近怎么样"`,
  },
  'conflict-repair': {
    name: '关系修复',
    triggers: ['draft', 'advise'],
    content: `## 关系修复 Skill

当用户提到关系紧张、误会、冷战时：

1. **评估严重度**：是误会/分歧/冲突/决裂？
2. **修复路径**：
   - 误会：直接澄清事实，不翻旧账
   - 分歧：承认对方立场合理性，表达自己立场，求同存异
   - 冲突：先道歉自己部分，再表达感受，不要求对方道歉
   - 决裂：不主动修复，等对方信号或通过中间人
3. **消息原则**：
   - 用"我感受到"代替"你做了"
   - 不用"但是"，用"同时"
   - 不在消息里要求即时回应`,
  },
  'gift-suggestion': {
    name: '礼物建议',
    triggers: ['chat', 'advise'],
    content: `## 礼物建议 Skill

当用户问"送什么礼"时：

1. **关系定位**：经营型（有分寸感）vs 陪伴型（有心意）
2. **场景判断**：生日/晋升/乔居/感谢/节日
3. **礼物层次**：
   - 信息层：对方最近关注什么/缺什么
   - 象征层：礼物传递的关系信号（不过度/不不足）
   - 实用层：对方能用得上 vs 纯装饰
4. **禁忌**：
   - 经营型关系不送太贵重的（有贿赂感）
   - 陪伴型关系不送太实用的（显得敷衍）
   - 不送对方忌讳的（宗教/文化/个人）`,
  },
};

// Get skill content by intent
function getSkillsForIntent(intent) {
  if (!intent) return [];
  const matched = [];
  for (const [id, skill] of Object.entries(BUILTIN_SKILLS)) {
    if (skill.triggers.includes(intent)) {
      matched.push({ id, name: skill.name, content: skill.content });
    }
  }
  return matched;
}

// Format skills for system prompt injection
function formatSkillsContext(skills) {
  if (!skills || skills.length === 0) return '';
  let text = '\n\n--- 可用技能 ---\n';
  skills.forEach(s => {
    text += s.content + '\n';
  });
  return text;
}

// GET /data/profile — get user profile
// POST /data/profile — save user profile
async function handleProfile(req, env, method) {
  const body = method === 'GET' ? null : await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  if (method === 'GET') {
    const raw = await env.USER_DATA.get(`profile:${userId}`);
    if (!raw) {
      return { status: 200, data: { profile: null } };
    }
    try {
      return { status: 200, data: { profile: JSON.parse(raw) } };
    } catch {
      return { status: 200, data: { profile: null } };
    }
  }

  if (method === 'POST') {
    const profile = {
      name: (body.name || '').trim(),
      occupation: (body.occupation || '').trim(),
      company: (body.company || '').trim(),
      industry: (body.industry || '').trim(),
      location: (body.location || '').trim(),
      communication_style: (body.communication_style || '').trim(),
      address_habit: (body.address_habit || '').trim(),
      focus_areas: (body.focus_areas || '').trim(),
      message_tone: (body.message_tone || '').trim(),
      career_goal: (body.career_goal || '').trim(),
      current_projects: (body.current_projects || '').trim(),
      network_direction: (body.network_direction || '').trim(),
      notes: (body.notes || '').trim(),
      updated: new Date().toISOString(),
    };
    await env.USER_DATA.put(`profile:${userId}`, JSON.stringify(profile));
    return { status: 200, data: { ok: true, profile } };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

// POST /data/timeline — add a timeline entry
// GET  /data/timeline?contact_id=xxx — list timeline (optionally filtered)
async function handleTimelineCRUD(req, env, method) {
  const body = method === 'GET' ? null : await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  if (method === 'GET') {
    const url = new URL(req.url);
    const contactId = url.searchParams.get('contact_id');
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const limit = parseInt(url.searchParams.get('limit') || '200', 10);
    let timeline = await loadDataset(env, userId, 'timeline');
    if (contactId) {
      timeline = timeline.filter(t => t.contact === contactId);
    }
    timeline.sort((a, b) => new Date((b.date || '1970-01-01').substring(0, 10)) - new Date((a.date || '1970-01-01').substring(0, 10)));
    const totalCount = timeline.length;
    const page = timeline.slice(offset, offset + limit);
    return { status: 200, data: { timeline: page, total: totalCount, offset, limit, has_more: offset + limit < totalCount } };
  }

  if (method === 'POST') {
    const summary = (body.summary || '').trim();
    const contactId = body.contact_id || body.contact || '';
    if (!summary) {
      return { status: 400, data: { error: 'summary required' } };
    }

    // Update existing if id provided
    if (body.id) {
      const timeline = await loadDataset(env, userId, 'timeline');
      const idx = timeline.findIndex(t => t.id === body.id);
      if (idx >= 0) {
        timeline[idx] = {
          ...timeline[idx],
          summary,
          date: body.date || timeline[idx].date,
          contact: contactId || timeline[idx].contact,
          sentiment: body.sentiment || timeline[idx].sentiment || '',
          updated: new Date().toISOString(),
        };
        await saveDataset(env, userId, 'timeline', timeline);
        return { status: 200, data: { ok: true, entry: timeline[idx] } };
      }
    }

    const timeline = await loadDataset(env, userId, 'timeline');
    const entry = createTimelineEntry(contactId, summary, {
      date: body.date || new Date().toISOString().slice(0, 10),
    });
    if (body.sentiment) entry.sentiment = body.sentiment;
    timeline.push(entry);
    await saveDataset(env, userId, 'timeline', timeline);
    return { status: 200, data: { ok: true, entry } };
  }

  if (method === 'PUT') {
    const summary = (body.summary || '').trim();
    if (!body.id || !summary) {
      return { status: 400, data: { error: 'id and summary required' } };
    }
    const timeline = await loadDataset(env, userId, 'timeline');
    const idx = timeline.findIndex(t => t.id === body.id);
    if (idx < 0) {
      return { status: 404, data: { error: 'timeline entry not found' } };
    }
    timeline[idx] = {
      ...timeline[idx],
      summary,
      date: body.date || timeline[idx].date,
      contact: body.contact_id || body.contact || timeline[idx].contact,
      sentiment: body.sentiment || timeline[idx].sentiment || '',
      updated: new Date().toISOString(),
    };
    await saveDataset(env, userId, 'timeline', timeline);
    return { status: 200, data: { ok: true, entry: timeline[idx] } };
  }

  if (method === 'DELETE') {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    let timeline = await loadDataset(env, userId, 'timeline');
    timeline = timeline.filter(t => t.id !== id);
    await saveDataset(env, userId, 'timeline', timeline);
    return { status: 200, data: { ok: true } };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

// ── Session summary: POST /ai/session_summary ──
// Generates a brief LLM summary of a session for next-day welcome
async function handleSessionSummary(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };
  const sessionId = body.session_id;
  if (!sessionId) return { status: 400, data: { error: 'session_id required' } };

  const sessions = await loadSessions(env, userId);
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return { status: 404, data: { error: 'session not found' } };

  const msgs = (session.messages || []).filter(m => m.content);
  if (msgs.length === 0) return { status: 200, data: { summary: '' } };

  // Build full conversation excerpt (all messages, each truncated to 300 chars)
  const excerpt = msgs.map(m =>
    `${m.role === 'user' ? '用户' : '小维'}：${m.content.slice(0, 300)}`
  ).join('\n');

  const system = await getPrompt(env, 'session_summary', `你是一个对话摘要助手。用一段话（不超过100字）概括下面这段对话的核心内容、涉及的人物和关键结论。只输出摘要，不要其他文字。`);
  const prompt = `请概括这段对话：\n${excerpt}`;

  const result = await callLLM(prompt, system, env, { max_tokens: 200, temperature: 0 });
  const summary = result?.text || session.title || '';
  return { status: 200, data: { summary } };
}

// ── iCal feed: GET /data/calendar/feed?token=user_id:sync_secret ──
async function handleCalendarFeed(req, env) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  // Validate token: user_id:sync_secret
  if (!token.includes(':')) return new Response('Unauthorized', { status: 401 });
  const [uid, secret] = token.split(':');
  if (!uid || !secret || secret !== env.WELIAN_SYNC_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  const userId = uid;

  // Load todos and contacts
  const todos = await loadDataset(env, userId, 'todos');
  const contacts = await loadDataset(env, userId, 'contacts');

  const now = new Date();
  const dtstamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  let events = [];

  // Helper: compute next day for DTEND (all-day events require DTEND in Outlook)
  function nextDay(yyyymmdd) {
    const y = parseInt(yyyymmdd.slice(0, 4));
    const m = parseInt(yyyymmdd.slice(4, 6));
    const d = parseInt(yyyymmdd.slice(6, 8));
    const dt = new Date(y, m - 1, d + 1);
    return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
  }

  // Pending todos with due dates → VEVENT (all-day)
  todos.forEach(t => {
    if (t.status && t.status !== 'pending') return;
    if (!t.due) return;
    const due = t.due.length === 10 ? t.due : t.due.substring(0, 10);
    if (!due) return;
    const dueCompact = due.replace(/-/g, '');
    const summary = escapeICal(t.task || '待办');
    const contactName = (contacts.find(c => c.id === t.contact) || {}).name;
    const desc = contactName ? escapeICal(`联系人: ${contactName}`) : '';
    const priorityMap = { P1: '1', P2: '5', P3: '9' };
    // LAST-MODIFIED: use todo's updated/created timestamp if available, else now
    const modTs = t.updated_at || t.created_at || t.timestamp;
    const lastMod = modTs ? new Date(modTs).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z' : dtstamp;
    events.push(
      `BEGIN:VEVENT` +
      `\nUID:${t.id}@welian.app` +
      `\nDTSTAMP:${dtstamp}` +
      `\nDTSTART;VALUE=DATE:${dueCompact}` +
      `\nDTEND;VALUE=DATE:${nextDay(dueCompact)}` +
      `\nSUMMARY:${summary}` +
      (desc ? `\nDESCRIPTION:${desc}` : '') +
      (t.priority ? `\nPRIORITY:${priorityMap[t.priority] || '5'}` : '') +
      `\nLAST-MODIFIED:${lastMod}` +
      `\nSTATUS:CONFIRMED` +
      `\nEND:VEVENT`
    );
  });

  // Contact important dates → VEVENT (YEARLY recurrence for birthdays/anniversaries)
  contacts.forEach(c => {
    (c.important_dates || []).forEach(dt => {
      const dateStr = dt.date || '';
      if (dateStr.length < 5) return;
      // Support MM-DD or YYYY-MM-DD
      const mmdd = dateStr.length === 5 ? dateStr : dateStr.substring(5);
      const year = dateStr.length >= 10 ? dateStr.substring(0, 4) : now.getFullYear();
      const yyyymmdd = `${year}${mmdd.replace(/-/g, '')}`;
      const label = dt.label || '重要日期';
      events.push(
        `BEGIN:VEVENT` +
        `\nUID:${c.id}-${mmdd}@welian.app` +
        `\nDTSTAMP:${dtstamp}` +
        `\nDTSTART;VALUE=DATE:${yyyymmdd}` +
        `\nDTEND;VALUE=DATE:${nextDay(yyyymmdd)}` +
        `\nSUMMARY:${escapeICal(c.name)} - ${escapeICal(label)}` +
        `\nRRULE:FREQ=YEARLY` +
        `\nLAST-MODIFIED:${dtstamp}` +
        `\nSTATUS:CONFIRMED` +
        `\nEND:VEVENT`
      );
    });
  });

  const CRLF = '\r\n';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Welian//Calendar Sync//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Welian 待办与重要日期',
  ];
  // Add event lines (each event is already multi-line with \n, split and rejoin with CRLF)
  events.forEach(ev => {
    ev.split('\n').forEach(line => lines.push(line));
  });
  lines.push('END:VCALENDAR');
  const ical = lines.join(CRLF);

  return new Response(ical, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'max-age=300, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function escapeICal(text) {
  return (text || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// ── Calendar sync token: GET /data/calendar/token (Clerk auth) ──
// Returns feed URL with long-lived token (user_id:sync_secret) for calendar subscription
async function handleCalendarToken(req, env, userId) {
  const token = `${userId}:${env.WELIAN_SYNC_SECRET}`;
  const baseUrl = `https://api.welian.app`;
  const feedUrl = `${baseUrl}/data/calendar/feed?token=${encodeURIComponent(token)}`;
  return { status: 200, data: { feed_url: feedUrl } };
}

// GET  /data/todos — list pending todos
// POST /data/todos/done — mark todo as done
// ── Todo dedup helper ──
// Normalize task text for comparison: lowercase, trim, remove punctuation/whitespace
function normalizeTask(text) {
  return (text || '').toLowerCase().replace(/[\s，。,.！!？?、：:；;""''"'']+/g, '').trim();
}

// Check if a pending todo with the same normalized task + contact already exists
function findDuplicateTodo(todos, task, contactId) {
  const normTask = normalizeTask(task);
  if (!normTask) return null;
  return todos.find(t =>
    (t.status === 'pending' || !t.status) &&
    normalizeTask(t.task) === normTask &&
    (t.contact || '') === (contactId || '')
  );
}

async function handleTodosCRUD(req, env, method, path) {
  const body = method === 'GET' ? null : await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  if (method === 'GET') {
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get('status');
    let todos = await loadDataset(env, userId, 'todos');
    // Auto-cleanup: remove todos with empty/null/undefined task
    const validTodos = todos.filter(t => t && (t.task || '').trim());
    if (validTodos.length < todos.length) {
      todos = validTodos;
      await saveDataset(env, userId, 'todos', todos);
    }
    if (statusFilter === 'done') {
      // Return only done todos, sorted by completed_at desc
      const done = todos.filter(t => isTodoDone(t) && t.status !== 'canceled');
      done.sort((a, b) => (b.completed_at || b.updated || '').localeCompare(a.completed_at || a.updated || ''));
      return { status: 200, data: { todos: done } };
    }
    // Default: return pending (exclude done + canceled) + done_count
    const pending = todos.filter(t => !isTodoDone(t));
    pending.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const doneCount = todos.filter(t => isTodoDone(t) && t.status !== 'canceled').length;
    const canceledCount = todos.filter(t => t.status === 'canceled').length;
    return { status: 200, data: { todos: pending, done_count: doneCount, canceled_count: canceledCount } };
  }

  if (method === 'POST' && path === '/data/todos/done') {
    const todoId = body.id;
    const todos = await loadDataset(env, userId, 'todos');
    const idx = todos.findIndex(t => t.id === todoId);
    if (idx < 0) {
      return { status: 404, data: { error: 'todo not found' } };
    }
    // Set both status and done for backward compatibility
    todos[idx].status = 'done';
    todos[idx].done = true;
    todos[idx].completed_at = new Date().toISOString();
    await saveDataset(env, userId, 'todos', todos);
    return { status: 200, data: { ok: true } };
  }

  if (method === 'POST' && path === '/data/todos/reopen') {
    const todoId = body.id;
    const todos = await loadDataset(env, userId, 'todos');
    const idx = todos.findIndex(t => t.id === todoId);
    if (idx < 0) {
      return { status: 404, data: { error: 'todo not found' } };
    }
    todos[idx].status = 'pending';
    todos[idx].done = false;
    delete todos[idx].completed_at;
    todos[idx].updated = new Date().toISOString();
    await saveDataset(env, userId, 'todos', todos);
    return { status: 200, data: { ok: true } };
  }

  if (method === 'POST' && path === '/data/todos/cancel') {
    const todoId = body.id;
    const todos = await loadDataset(env, userId, 'todos');
    const idx = todos.findIndex(t => t.id === todoId);
    if (idx < 0) {
      return { status: 404, data: { error: 'todo not found' } };
    }
    todos[idx].status = 'canceled';
    todos[idx].canceled_at = new Date().toISOString();
    todos[idx].updated = new Date().toISOString();
    await saveDataset(env, userId, 'todos', todos);
    return { status: 200, data: { ok: true } };
  }

  if (method === 'POST' && path === '/data/todos/postpone') {
    const todoId = body.id;
    const newDue = body.due;
    if (!todoId || !newDue) {
      return { status: 400, data: { error: 'id and due required' } };
    }
    const todos = await loadDataset(env, userId, 'todos');
    const idx = todos.findIndex(t => t.id === todoId);
    if (idx < 0) {
      return { status: 404, data: { error: 'todo not found' } };
    }
    const oldDue = todos[idx].due || '';
    todos[idx].due = newDue;
    todos[idx].postponed = (todos[idx].postponed || 0) + 1;
    todos[idx].postponed_from = oldDue;
    todos[idx].updated = new Date().toISOString();
    await saveDataset(env, userId, 'todos', todos);
    return { status: 200, data: { ok: true, todo: todos[idx] } };
  }

  if (method === 'POST') {
    const task = (body.task || '').trim();
    if (!task) {
      return { status: 400, data: { error: 'task required' } };
    }

    const todos = await loadDataset(env, userId, 'todos');

    // Update existing todo if id is provided
    if (body.id) {
      const idx = todos.findIndex(t => t.id === body.id);
      if (idx >= 0) {
        todos[idx] = {
          ...todos[idx],
          task,
          contact: body.contact_id || body.contact || todos[idx].contact || '',
          priority: body.priority || todos[idx].priority || 'P1',
          due: body.due || todos[idx].due || '',
          location: body.location !== undefined ? body.location : (todos[idx].location || ''),
          updated: new Date().toISOString(),
        };
        await saveDataset(env, userId, 'todos', todos);
        return { status: 200, data: { ok: true, todo: todos[idx] } };
      }
    }

    // Dedup: check if same task + contact already pending
    const contactId = body.contact_id || body.contact || '';
    // Default due: 7 days from now if not provided
    let due = body.due || '';
    if (!due) {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      due = d.toISOString().slice(0, 10);
    }
    const dup = findDuplicateTodo(todos, task, contactId);
    if (dup) {
      // Update due date if new one is provided and earlier
      if (due && (!dup.due || due < dup.due)) {
        dup.due = due;
        dup.updated = new Date().toISOString();
        await saveDataset(env, userId, 'todos', todos);
      }
      return { status: 200, data: { ok: true, todo: dup, dedup: true } };
    }

    const todo = createTodo(contactId, task, {
      priority: body.priority || 'P1',
      due,
      source: body.source || 'manual',
    });
    if (body.location) todo.location = body.location;
    todos.push(todo);
    await saveDataset(env, userId, 'todos', todos);
    return { status: 200, data: { ok: true, todo } };
  }

  if (method === 'DELETE') {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    let todos = await loadDataset(env, userId, 'todos');
    todos = todos.filter(t => t.id !== id);
    await saveDataset(env, userId, 'todos', todos);
    return { status: 200, data: { ok: true } };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

// ── Main worker entry ──

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } });
    }

    // ── WebSocket upgrade for mini program chat ──
    if (path === '/ai/wxmp_chat_ws' && request.headers.get('Upgrade') === 'websocket') {
      const token = url.searchParams.get('token');
      if (!token) return new Response('Missing token', { status: 401 });

      // Verify sync token (same logic as getVerifiedUserId but without Request)
      let userId = null;
      if (token.includes(':') && !token.startsWith('eyJ')) {
        const [uid, secret] = token.split(':');
        if (uid && secret && secret === env.WELIAN_SYNC_SECRET) {
          if (uid.startsWith('wxmp_')) {
            const bound = await env.USER_DATA.get(`wechat_bind:${uid}`);
            userId = bound || uid;
          } else {
            userId = uid;
          }
        }
      }
      if (!userId) return new Response('Invalid token', { status: 401 });

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();

      server.addEventListener('message', async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type !== 'chat') return;

          const message = data.message || '';
          const history = data.history || [];
          if (!message) {
            server.send(JSON.stringify({ type: 'error', error: 'message required' }));
            return;
          }

          // 1. Check billing
          const billing = await getBillingData(env, userId);
          const now = new Date();
          const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          if (billing.monthKey !== monthKey) {
            billing.monthKey = monthKey;
            billing.used = 0;
          }
          const remaining = await getRemaining(billing, env);
          if (remaining <= 0) {
            server.send(JSON.stringify({
              type: 'error',
              error: '联点已用完',
              code: 'OUT_OF_CREDITS',
            }));
            return;
          }

          // 2. Extract intent (lightweight — just for data context)
          const _chatIntentFallback = `你是一个关系网络智能体。分析用户消息，提取意图和数据操作。只返回JSON，不要其他内容。
今天是 ${new Date().toISOString().slice(0, 10)}。
JSON格式：{"intent":"query_contact|query_todo|record|draft|advise|report|chat","contact_name":"","keywords":[],"actions":[]}
intent说明：query_contact=查询某人,query_todo=查看待办,record=记录互动/添加待办,draft=拟写消息,advise=建议联系谁,report=回顾,chat=闲聊
actions元素：{"type":"add_timeline","contact_name":"人名","summary":"摘要","date":"YYYY-MM-DD"},{"type":"add_todo","task":"内容","contact_name":"人名","due":"YYYY-MM-DD","priority":"P1"},{"type":"add_contact","name":"人名","relation":"关系"},{"type":"complete_todo","task":"关键词"}
只有用户明确表达记录/提醒/添加/完成意图时才生成actions，否则actions=[]。`;
          const intentResp = await callLLM(message, await getPrompt(env, 'intent', _chatIntentFallback), env, {
            max_tokens: 800, temperature: 0,
          });
          let intent = { intent: 'chat', contact_name: '', keywords: [], actions: [] };
          if (intentResp) {
            try {
              const jsonMatch = intentResp.text.match(/\{[\s\S]*\}/);
              intent = jsonMatch ? JSON.parse(jsonMatch[0]) : intent;
            } catch {}
          }

          // 3. Execute data actions (record/todo/contact) from intent
          if (intent.actions && intent.actions.length > 0) {
            let contacts = null, todos = null, timeline = null;
            let contactsDirty = false, todosDirty = false, timelineDirty = false;
            for (const action of intent.actions) {
              try {
                if (action.type === 'add_timeline' && action.summary) {
                  if (timeline === null) timeline = await loadDataset(env, userId, 'timeline');
                  if (contacts === null) contacts = await loadDataset(env, userId, 'contacts');
                  let contactId = '';
                  if (action.contact_name) {
                    const c = contacts.find(c => c.name === action.contact_name ||
                      c.name.includes(action.contact_name) ||
                      (c.aliases && c.aliases.some(a => a.includes(action.contact_name))));
                    if (c) contactId = c.id;
                    if (!c) {
                      const nc = createContact(action.contact_name);
                      contacts.push(nc); contactsDirty = true; contactId = nc.id;
                    }
                  }
                  timeline.push(createTimelineEntry(contactId, action.summary, { date: action.date || new Date().toISOString().slice(0, 10) }));
                  timelineDirty = true;
                  trackAction(env, userId, 'interaction_recorded', { contact_name: action.contact_name || '' }).catch(() => {});
                }
                if (action.type === 'add_todo' && action.task) {
                  if (todos === null) todos = await loadDataset(env, userId, 'todos');
                  if (contacts === null) contacts = await loadDataset(env, userId, 'contacts');
                  let contactId = '';
                  if (action.contact_name) {
                    const c = contacts.find(c => c.name === action.contact_name ||
                      c.name.includes(action.contact_name) ||
                      (c.aliases && c.aliases.some(a => a.includes(action.contact_name))) ||
                      (c.alias && c.alias.some(a => a.includes(action.contact_name))));
                    if (c) contactId = c.id;
                    if (!c) {
                      const nc = createContact(action.contact_name);
                      contacts.push(nc); contactsDirty = true; contactId = nc.id;
                    }
                  }
                  const dueDate = action.due || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
                  todos.push({
                    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    task: action.task, contact: contactId, due: dueDate,
                    priority: action.priority || 'P1', status: 'pending',
                    source: action.source || 'wxmp_chat', created_at: new Date().toISOString(),
                  });
                  todosDirty = true;
                }
                if (action.type === 'add_contact' && action.name) {
                  if (contacts === null) contacts = await loadDataset(env, userId, 'contacts');
                  if (!contacts.find(c => c.name === action.name)) {
                    contacts.push(createContact(action.name, { relation: action.relation, notes: action.notes }));
                    contactsDirty = true;
                  }
                }
                if (action.type === 'complete_todo' && action.task) {
                  if (todos === null) todos = await loadDataset(env, userId, 'todos');
                  const t = todos.find(t => t.task.includes(action.task) && t.status === 'pending');
                  if (t) { t.status = 'completed'; t.completed_at = new Date().toISOString(); todosDirty = true; }
                }
              } catch (e) { console.error('[wxmp_chat] action error:', e.message); }
            }
            if (contactsDirty) await saveDataset(env, userId, 'contacts', contacts);
            if (todosDirty) await saveDataset(env, userId, 'todos', todos);
            if (timelineDirty) await saveDataset(env, userId, 'timeline', timeline);
          }

          // 4. Build data context from KV
          const contacts = await loadDataset(env, userId, 'contacts');
          const todos = await loadDataset(env, userId, 'todos');
          const timeline = await loadDataset(env, userId, 'timeline');
          let dataContext = '';
          if (intent.contact_name) {
            const c = contacts.find(c => c.name === intent.contact_name ||
              c.name.includes(intent.contact_name) ||
              (c.aliases && c.aliases.some(a => a.includes(intent.contact_name))));
            if (c) {
              const cTimeline = timeline.filter(t => t.contact === c.id).slice(-5);
              const cTodos = todos.filter(t => t.contact === c.id && t.status === 'pending');
              dataContext = `【联系人信息】\n姓名: ${c.name}\n公司: ${c.company || ''}\n职位: ${c.title || ''}\n关系: ${c.relation || ''}\n性质: ${c.nature || ''}\n备注: ${c.notes || ''}\n`;
              if (cTimeline.length) dataContext += `最近互动: ${cTimeline.map(t => `${t.date}: ${t.summary}`).join('; ')}\n`;
              if (cTodos.length) dataContext += `待办: ${cTodos.map(t => t.task).join('; ')}\n`;
            }
          }
          if (!dataContext && intent.intent === 'advise') {
            // Provide top contacts for advise intent
            const top = contacts.slice(0, 10).map(c => `- ${c.name} (${c.relation || c.nature || ''})`).join('\n');
            dataContext = `【联系人列表】\n${top}\n`;
          }
          if (intent.intent === 'query_todo') {
            const pending = todos.filter(t => t.status === 'pending').slice(0, 15);
            dataContext = `【待办列表】\n${pending.map(t => `- ${t.task} (due: ${t.due || '无'})`).join('\n')}\n`;
          }

          // 5. Build system prompt (小维人格 + 数据上下文)
          const chatSystem = `你是小维（Welian），一个关系网络智能体。你帮用户成为更好的朋友、更好的家人、更好的合作者。

你的信念：每段关系都值得用心。
你的人格：事实和数据方面按照诚实原则，具有天才头脑。人情世故方面，有趣的灵魂，有温度的表达。

回复风格：
- 简洁友好，像朋友在聊天，不是助理在汇报
- 中文回复，适当用 emoji
- 回复不要太长，重点突出
- 记录时：确认记下了并简要复述
- 查待办时：只列出数据中有的，按紧急程度分组
- 闲聊时：自然回应，可以引导到关系管理话题
- 拟写消息时：给出完整可发送的草稿

${dataContext ? `以下是用户的相关数据，回答时参考：\n${dataContext}` : ''}

每次回复末尾附上 3-4 条与当前对话上下文直接相关的后续操作建议，格式：
<<<SUGGESTIONS>>>
建议1
建议2
建议3`;

          // 6. Build messages with history
          const messages = [
            ...history.slice(-6).map(h => ({ role: h.role || 'user', content: h.content || '' })),
            { role: 'user', content: message },
          ];

          // 7. Call LLM with streaming
          server.send(JSON.stringify({ type: 'start' }));
          const gen = callLLMStream(null, chatSystem, env, {
            messages, max_tokens: 1024, temperature: 0.7, model_tier: 'standard',
          });

          let fullText = '';
          for await (const chunk of gen) {
            fullText += chunk;
            server.send(JSON.stringify({ type: 'chunk', text: chunk }));
          }

          // 8. Billing deduction
          const usage = callLLMStream._lastUsage || { input_tokens: 0, output_tokens: 0 };
          const points = (usage.input_tokens * 0.0001 + usage.output_tokens * 0.0003) * 1;
          billing.used = (billing.used || 0) + points;
          await saveBillingData(env, userId, billing);

          server.send(JSON.stringify({
            type: 'done',
            intent: intent.intent,
            actions: intent.actions || [],
            usage,
            billing: { plan: billing.plan, used: billing.used, remaining: remaining - points },
          }));
        } catch (e) {
          console.error('[wxmp_chat_ws] error:', e.message);
          server.send(JSON.stringify({ type: 'error', error: e.message }));
        }
      });

      server.addEventListener('close', () => {
        console.log('[wxmp_chat_ws] connection closed');
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    // ── Mini program → Local Agent WebSocket proxy ──
    // Authenticates wxmp user, discovers tunnel URL, pipes WebSocket to local agent.
    // Falls back with error if no local agent is online.
    if (path === '/ai/wxmp_agent_ws' && request.headers.get('Upgrade') === 'websocket') {
      const token = url.searchParams.get('token');
      if (!token) return new Response('Missing token', { status: 401 });

      // Verify token (same logic as wxmp_chat_ws)
      let userId = null;
      let clerkUserId = null;
      if (token.includes(':') && !token.startsWith('eyJ')) {
        const [uid, secret] = token.split(':');
        if (uid && secret && secret === env.WELIAN_SYNC_SECRET) {
          if (uid.startsWith('wxmp_')) {
            const bound = await env.USER_DATA.get(`wechat_bind:${uid}`);
            clerkUserId = bound || null;
            userId = bound || uid;
          } else {
            clerkUserId = uid;
            userId = uid;
          }
        }
      }
      if (!userId) return new Response('Invalid token', { status: 401 });

      // Discover local agent tunnel URL
      let tunnelUrl = null;
      if (clerkUserId) {
        try {
          // Direct lookup
          const devData = await env.DEVICES.get(`dev:${clerkUserId}`);
          if (devData) {
            const parsed = JSON.parse(devData);
            tunnelUrl = parsed.tunnel_url;
          } else {
            // Indirect lookup via user→device mapping
            const deviceId = await env.DEVICES.get(`user:${clerkUserId}`);
            if (deviceId) {
              const linkedData = await env.DEVICES.get(`dev:${deviceId}`);
              if (linkedData) {
                const parsed = JSON.parse(linkedData);
                tunnelUrl = parsed.tunnel_url;
              }
            }
          }
        } catch (e) {
          console.error('[wxmp_agent_ws] discovery error:', e.message);
        }
      }

      if (!tunnelUrl) {
        // No local agent — return a WebSocket that immediately sends error and closes
        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];
        server.accept();
        server.send(JSON.stringify({ type: 'error', error: 'no_local_agent', message: '没有找到本地 Agent' }));
        server.close();
        return new Response(null, { status: 101, webSocket: client });
      }

      // Connect to local agent via tunnel
      const agentWsUrl = tunnelUrl.replace(/^http/, 'ws') + '/ws' +
        (clerkUserId ? '?clerk_uid=' + encodeURIComponent(clerkUserId) : '');

      try {
        const agentResp = await fetch(agentWsUrl, {
          headers: { 'Upgrade': 'websocket' },
        });
        if (agentResp.status !== 101 || !agentResp.webSocket) {
          // Local agent unreachable
          const pair = new WebSocketPair();
          const client = pair[0];
          const server = pair[1];
          server.accept();
          server.send(JSON.stringify({ type: 'error', error: 'agent_unreachable', message: '本地 Agent 无法连接' }));
          server.close();
          return new Response(null, { status: 101, webSocket: client });
        }

        const agentWs = agentResp.webSocket;
        agentWs.accept();

        // Accept client WebSocket
        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];
        server.accept();

        // Notify client: connected to local agent
        server.send(JSON.stringify({ type: 'agent_connected' }));

        // Client → Agent: pipe messages, translating protocol
        server.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            // Translate mini program protocol → local agent protocol
            if (data.type === 'chat') {
              agentWs.send(JSON.stringify({
                cmd: 'chat',
                id: data.id || `msg_${Date.now()}`,
                text: data.message || '',
                history: data.history || [],
              }));
            } else {
              // Pass through other commands
              agentWs.send(event.data);
            }
          } catch {
            agentWs.send(event.data);
          }
        });

        // Agent → Client: pipe messages, translating protocol
        agentWs.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            // Translate local agent protocol → mini program protocol
            if (data.type === 'stream') {
              server.send(JSON.stringify({ type: 'chunk', text: data.text || data.chunk || '' }));
            } else if (data.type === 'response') {
              server.send(JSON.stringify({ type: 'done', text: data.text || '' }));
            } else if (data.type === 'auth_ok') {
              server.send(JSON.stringify({ type: 'auth_ok' }));
            } else if (data.type === 'error') {
              server.send(JSON.stringify({ type: 'error', error: data.error || 'agent error' }));
            } else {
              // Pass through unknown types
              server.send(event.data);
            }
          } catch {
            server.send(event.data);
          }
        });

        // Close handling
        server.addEventListener('close', () => {
          try { agentWs.close(); } catch {}
        });
        agentWs.addEventListener('close', () => {
          server.send(JSON.stringify({ type: 'error', error: 'agent_disconnected', message: '本地 Agent 已断开' }));
          try { server.close(); } catch {}
        });
        agentWs.addEventListener('error', () => {
          server.send(JSON.stringify({ type: 'error', error: 'agent_error', message: '本地 Agent 连接错误' }));
        });

        return new Response(null, { status: 101, webSocket: client });
      } catch (e) {
        console.error('[wxmp_agent_ws] connect error:', e.message);
        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];
        server.accept();
        server.send(JSON.stringify({ type: 'error', error: 'agent_connect_failed', message: e.message }));
        server.close();
        return new Response(null, { status: 101, webSocket: client });
      }
    }

    // Routes
    try {
      // ── Article content API for mini program rich-text ──
      // Fetches original article, extracts main content as HTML for rich-text rendering.
      // No web-view needed, no business domain config, works on personal mini programs.
      if (path === '/ai/proxy_article' && method === 'GET') {
        const targetUrl = url.searchParams.get('url');
        if (!targetUrl) return jsonResponse({ error: 'Missing url' }, 400);
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
          return jsonResponse({ error: 'Invalid url' }, 400);
        }
        try {
          const resp = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; WelianBot/1.0)',
              'Accept': 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
          });
          const contentType = resp.headers.get('content-type') || '';
          if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
            return jsonResponse({ ok: true, title: '', content: '', url: targetUrl, unsupported: true });
          }
          let html = await resp.text();
          // Extract <title>
          let title = '';
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          if (titleMatch) title = titleMatch[1].trim();

          // Remove scripts, styles, noscript, nav, header, footer, aside
          html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
          html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
          html = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
          html = html.replace(/<nav[\s\S]*?<\/nav>/gi, '');
          html = html.replace(/<header[\s\S]*?<\/header>/gi, '');
          html = html.replace(/<footer[\s\S]*?<\/footer>/gi, '');
          html = html.replace(/<aside[\s\S]*?<\/aside>/gi, '');

          // Try <article>, then <main>, then <body>
          let contentHtml = '';
          const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
          if (articleMatch) {
            contentHtml = articleMatch[0];
          } else {
            const mainMatch = html.match(/<main[\s\S]*?<\/main>/i);
            if (mainMatch) {
              contentHtml = mainMatch[0];
            } else {
              const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
              contentHtml = bodyMatch ? bodyMatch[1] : html;
            }
          }

          // Remove common ad/nav/comment divs
          contentHtml = contentHtml.replace(/<div[^>]*class="[^"]*(?:ad|advert|banner|sidebar|comment|share|recommend|related|footer|copyright)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

          // Fix relative image URLs + make responsive
          const baseUrl = new URL(targetUrl);
          contentHtml = contentHtml.replace(/<img([^>]*?)src=["'](\/[^"']*?)["']([^>]*?)>/gi,
            (m, pre, path, post) => `<img${pre}src="${baseUrl.origin}${path}"${post} style="max-width:100%;height:auto;border-radius:8px;margin:12px 0" />`);
          contentHtml = contentHtml.replace(/<img([^>]*?)(?<!style="[^"]*")>/gi,
            (m, attrs) => m.includes('style=') ? m : `<img${attrs} style="max-width:100%;height:auto;border-radius:8px;margin:12px 0" />`);

          // Clean empty paragraphs
          contentHtml = contentHtml.replace(/<p>\s*<\/p>/gi, '');

          // Limit size (rich-text has limits)
          if (contentHtml.length > 100000) {
            contentHtml = contentHtml.substring(0, 100000) + '<p>...（内容过长已截断）</p>';
          }

          return jsonResponse({
            ok: true,
            title,
            content: contentHtml,
            url: targetUrl,
          }, 200, { 'cache-control': 'public, max-age=3600' });
        } catch (e) {
          return jsonResponse({ ok: false, error: e.message, url: targetUrl }, 200);
        }
      }

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
          endpoints: ['/ai/draft', '/ai/extract', '/ai/advise', '/ai/chat', '/ai/billing', '/ai/pricing', '/health'],
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

      if (path === '/ai/advise_cloud' && method === 'POST') {
        const r = await handleCloudAdvise(request, env);
        return jsonResponse(r.data, r.status);
      }

      // ── 方案C：计费网关 ──

      if (path === '/ai/chat' && method === 'POST') {
        const r = await handleChat(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/billing' && method === 'POST') {
        const r = await handleBilling(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/upgrade' && method === 'POST') {
        const r = await handleUpgrade(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/purchase_credits' && method === 'POST') {
        const r = await handlePurchaseCredits(request, env);
        return jsonResponse(r.data, r.status);
      }

      // ── WeChat bot binding ──

      if (path === '/ai/bind_wechat' && method === 'POST') {
        const r = await handleBindWechat(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/check_bind' && method === 'POST') {
        const r = await handleCheckBind(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/unbind_wechat' && method === 'POST') {
        const r = await handleUnbindWechat(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/pricing' && method === 'GET') {
        const pricing = await getPricing(env);
        return jsonResponse(pricing);
      }

      // ── Admin: pricing management ──

      if (path === '/ai/admin/check' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const userId = await getVerifiedUserId(request, env, body);
        if (!userId) return jsonResponse({ is_admin: false }, 200);
        const admin = await isAdmin(userId, env);
        return jsonResponse({ is_admin: admin }, 200);
      }

      if (path === '/ai/admin/pricing' && method === 'GET') {
        const pricing = await getPricing(env);
        return jsonResponse(pricing);
      }

      if (path === '/ai/admin/pricing' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const userId = await getVerifiedUserId(request, env, body);
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const admin = await isAdmin(userId, env);
        if (!admin) return jsonResponse({ error: 'Admin access required' }, 403);
        const current = await getPricing(env);
        const updated = { ...current };
        const allowedFields = [
          'points_per_1k_input', 'points_per_1k_output',
          'free_monthly', 'pro_monthly',
          'pro_price_usd', 'pro_price_yearly_usd',
          'credit_pack_100_usd', 'credit_pack_500_usd',
          'discount',
        ];
        for (const field of allowedFields) {
          if (body[field] !== undefined && typeof body[field] === 'number') {
            updated[field] = body[field];
          }
        }
        if (body.model_multipliers && typeof body.model_multipliers === 'object') {
          updated.model_multipliers = {
            standard: typeof body.model_multipliers.standard === 'number' ? body.model_multipliers.standard : (updated.model_multipliers?.standard ?? 1),
            enhanced: typeof body.model_multipliers.enhanced === 'number' ? body.model_multipliers.enhanced : (updated.model_multipliers?.enhanced ?? 3),
            premium: typeof body.model_multipliers.premium === 'number' ? body.model_multipliers.premium : (updated.model_multipliers?.premium ?? 10),
          };
        }
        await savePricing(env, updated);
        return jsonResponse({ ok: true, pricing: updated });
      }

      // ── Gift credits ──

      if (path === '/ai/gift_credits' && method === 'POST') {
        const r = await handleGiftCredits(request, env);
        return jsonResponse(r.data, r.status);
      }

      // ── Coupon system (role play reward) ──

      if (path === '/ai/create_coupon' && method === 'POST') {
        const r = await handleCreateCoupon(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/redeem_coupon' && method === 'POST') {
        const r = await handleRedeemCoupon(request, env);
        return jsonResponse(r.data, r.status);
      }

      // ── Invite system (referral codes) ──

      if (path === '/ai/invite/create' && method === 'POST') {
        const r = await handleInviteCreate(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/invite/redeem' && method === 'POST') {
        const r = await handleInviteRedeem(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/invite/status' && method === 'POST') {
        const r = await handleInviteStatus(request, env);
        return jsonResponse(r.data, r.status);
      }

      // ── Public signals preview (no auth required) ──

      if (path === '/ai/signals_preview' && method === 'GET') {
        const r = await handleSignalsPreview(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/signals_history' && method === 'GET') {
        const r = await handleSignalsHistory(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/signal_action' && method === 'POST') {
        const userId = await getVerifiedUserId(request, env, await request.json().catch(() => ({})));
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const body = await request.json().catch(() => ({}));
        trackAction(env, userId, 'signal_action', { type: body.type || 'view', signal_title: body.title || '' });
        return jsonResponse({ ok: true });
      }

      // ── Signal domain preferences ──
      if (path === '/ai/signal_domains' && method === 'GET') {
        const userId = await getVerifiedUserId(request, env, {});
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const raw = await env.USER_DATA.get(`signal_domains:${userId}`);
        const domains = raw ? JSON.parse(raw) : ['investment', 'ai', 'tech_finance'];
        return jsonResponse({ ok: true, domains });
      }
      if (path === '/ai/signal_domains' && method === 'POST') {
        const userId = await getVerifiedUserId(request, env, await request.json().catch(() => ({})));
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const body = await request.json().catch(() => ({}));
        const valid = ['investment', 'ai', 'tech_finance'];
        const domains = (body.domains || []).filter(d => valid.includes(d));
        await env.USER_DATA.put(`signal_domains:${userId}`, JSON.stringify(domains));
        return jsonResponse({ ok: true, domains });
      }

      // ── Custom signal sources (RSS/Atom) ──

      if (path === '/ai/signals/custom_sources' && method === 'GET') {
        const r = await handleGetCustomSources(request, env);
        return jsonResponse(r.data, r.status);
      }
      if (path === '/ai/signals/custom_sources' && method === 'POST') {
        const r = await handleAddCustomSource(request, env);
        return jsonResponse(r.data, r.status);
      }
      if (path === '/ai/signals/custom_sources' && method === 'DELETE') {
        const r = await handleDeleteCustomSource(request, env);
        return jsonResponse(r.data, r.status);
      }

      // ── Manual trigger for daily signals push (admin only) ──

      if (path === '/ai/daily_signals_push' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const userId = await getVerifiedUserId(request, env, body);
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        // Only admin can trigger
        const admin = await isAdmin(userId, env);
        if (!admin) return jsonResponse({ error: 'Admin only' }, 403);
        const result = await handleDailySignalsPush(env);
        return jsonResponse({ ok: true, message: 'Daily signals push triggered' });
      }

      // ── Manual trigger for evening recap push (admin only) ──

      if (path === '/ai/evening_recap_push' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const userId = await getVerifiedUserId(request, env, body);
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const admin = await isAdmin(userId, env);
        if (!admin) return jsonResponse({ error: 'Admin only' }, 403);
        const result = await handleEveningSignalsPush(env);
        return jsonResponse({ ok: true, message: 'Evening recap push triggered' });
      }

      // ── Diagnostic: WeChat token + signals push status (admin only) ──

      if (path === '/ai/wechat_diagnostic' && method === 'GET') {
        const userId = await getVerifiedUserId(request, env, {});
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const admin = await isAdmin(userId, env);
        if (!admin) return jsonResponse({ error: 'Admin only' }, 403);
        const diag = { ok: true, checks: {} };
        // Check WeChat config
        diag.checks.wechat_app_id = !!env.WECHAT_APP_ID;
        diag.checks.wechat_app_secret = !!env.WECHAT_APP_SECRET;
        // Check cached token
        const cachedToken = await env.USER_DATA.get('wechat_access_token');
        diag.checks.cached_token = !!cachedToken;
        // Try fetch token (stable_token API)
        if (env.WECHAT_APP_ID && env.WECHAT_APP_SECRET) {
          try {
            const resp = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                grant_type: 'client_credential',
                appid: env.WECHAT_APP_ID,
                secret: env.WECHAT_APP_SECRET,
                force_refresh: false,
              }),
            });
            const data = await resp.json();
            diag.checks.token_fetch_ok = !!data.access_token;
            diag.checks.token_error = data.errmsg || null;
            diag.checks.token_errcode = data.errcode || null;
            if (data.access_token) {
              await env.USER_DATA.put('wechat_access_token', data.access_token, { expirationTtl: 5400 });
              // Check cached thumb
              const cachedThumb = await env.USER_DATA.get('wechat_thumb_media_id');
              diag.checks.cached_thumb = !!cachedThumb;
            }
          } catch (e) {
            diag.checks.token_fetch_ok = false;
            diag.checks.token_error = e.message;
          }
        }
        // Check signals preview
        const todayKey = new Date().toISOString().slice(0, 13);
        const cachedPreview = await env.USER_DATA.get(`signals_preview:${todayKey}`);
        diag.checks.signals_cached = !!cachedPreview;
        if (cachedPreview) {
          try {
            const parsed = JSON.parse(cachedPreview);
            diag.checks.signals_count = parsed.report?.signals?.length || 0;
          } catch {}
        }
        // Check signals history
        const todayDate = new Date().toISOString().slice(0, 10);
        const todaySnapshot = await env.USER_DATA.get(`signals_history:${todayDate}`);
        diag.checks.today_snapshot = !!todaySnapshot;
        return jsonResponse(diag);
      }

      // ── Funnel metrics (admin only) ──

      if (path === '/ai/funnel_metrics' && method === 'GET') {
        const userId = await getVerifiedUserId(request, env, {});
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const admin = await isAdmin(userId, env);
        if (!admin) return jsonResponse({ error: 'Admin only' }, 403);
        const r = await handleFunnelMetrics(env);
        return jsonResponse(r.data, r.status);
      }

      // ── DAU stats (public, no auth) ──
      if (path === '/ai/dau_stats' && method === 'GET') {
        const r = await handleDauStats(env);
        return jsonResponse(r.data, r.status);
      }

      // ── Anonymous pageview & event tracking (public) ──
      // No-op: KV writes are too expensive on free plan (1,000/day limit).
      // Use Cloudflare Analytics for pageview tracking instead.
      if (path === '/ai/track_pageview' && method === 'POST') {
        return jsonResponse({ ok: true });
      }

      // ── WeChat Mini Program login (public) ──
      if (path === '/ai/wxmp_login' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const code = body.code;
        if (!code) return jsonResponse({ error: 'code required' }, 400);

        // Use mini program AppID/Secret (separate from public account)
        const mpAppId = env.WXMP_APP_ID || env.WECHAT_APP_ID;
        const mpSecret = env.WXMP_APP_SECRET || env.WECHAT_APP_SECRET;
        if (!mpAppId || !mpSecret) {
          return jsonResponse({ error: 'Mini program not configured' }, 500);
        }

        // Exchange code for openid + session_key
        const sessionUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${mpAppId}&secret=${mpSecret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
        const sessionResp = await fetch(sessionUrl);
        const sessionData = await sessionResp.json();

        if (sessionData.errcode || !sessionData.openid) {
          console.error('[wxmp_login] jscode2session failed:', JSON.stringify(sessionData));
          return jsonResponse({ error: 'Login failed: ' + (sessionData.errmsg || 'unknown') }, 401);
        }

        const openid = sessionData.openid;
        const wxmpUserId = `wxmp_${openid}`;

        // Check if already bound to a Clerk user
        const boundClerkId = await env.USER_DATA.get(`wechat_bind:${wxmpUserId}`);
        let token;
        if (boundClerkId) {
          // Return sync token for the bound Clerk user
          token = `${boundClerkId}:${env.WELIAN_SYNC_SECRET}`;
        } else {
          // New user — create a mini program user identity
          // Store wxmp user mapping; they can bind to Clerk later
          await env.USER_DATA.put(`wxmp_user:${wxmpUserId}`, JSON.stringify({
            openid,
            created_at: new Date().toISOString(),
            nickname: body.nickname || null,
            avatar: body.avatar || null,
          }));
          // Return a wxmp sync token (works with getVerifiedUserId's wechat_ prefix logic)
          token = `${wxmpUserId}:${env.WELIAN_SYNC_SECRET}`;
        }

        return jsonResponse({
          ok: true,
          token,
          is_new_user: !boundClerkId,
          openid,
        });
      }

      // ── Bind mini program: send verification code (public) ──
      if (path === '/ai/wxmp_bind_sendcode' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { openid, email } = body;
        if (!openid || !email) {
          return jsonResponse({ error: 'openid and email required' }, 400);
        }
        const normalizedEmail = email.trim().toLowerCase();
        // Check if email exists in Clerk
        const clerkUserId = await getClerkUserIdByEmail(normalizedEmail, env);
        const isNewUser = !clerkUserId;
        // Generate 6-digit code regardless — works for both existing and new users
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const codeKey = `wxmp_bindcode:${openid}`;
        await env.USER_DATA.put(codeKey, JSON.stringify({
          code, email: normalizedEmail,
          clerkUserId: clerkUserId || null,
          is_new: isNewUser,
          created_at: Date.now(),
        }), { expirationTtl: 300 }); // 5 minutes

        // Send verification email
        const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:400px;margin:0 auto;padding:20px;text-align:center">
          <h2 style="color:#4A6741">Welian 小程序绑定验证</h2>
          <p>你的验证码是：</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#C96442;margin:20px 0">${code}</p>
          <p style="color:#999;font-size:13px">5 分钟内有效。如非本人操作请忽略。</p>
        </body></html>`;
        await sendEmail(env, normalizedEmail, 'Welian 绑定验证码', html);
        return jsonResponse({
          ok: true,
          message: isNewUser ? '验证码已发送，验证后将自动注册新账号' : '验证码已发送到邮箱',
          is_new_user: isNewUser,
        });
      }

      // ── Bind mini program: verify code and bind (public) ──
      if (path === '/ai/wxmp_bind_verify' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { openid, code } = body;
        if (!openid || !code) {
          return jsonResponse({ error: 'openid and code required' }, 400);
        }
        const codeKey = `wxmp_bindcode:${openid}`;
        const stored = await env.USER_DATA.get(codeKey);
        if (!stored) {
          return jsonResponse({ error: '验证码已过期，请重新获取' }, 400);
        }
        const parsed = JSON.parse(stored);
        if (parsed.code !== String(code)) {
          return jsonResponse({ error: '验证码错误' }, 400);
        }
        // Code correct — bind or create+bind
        const wxmpUserId = `wxmp_${openid}`;
        let clerkUserId = parsed.clerkUserId;

        // New user: create Clerk account with email
        if (parsed.is_new || !clerkUserId) {
          const clerkSecretKey = env.CLERK_SECRET_KEY;
          if (!clerkSecretKey) {
            return jsonResponse({ error: '服务器未配置认证服务，请联系管理员' }, 500);
          }
          try {
            const createResp = await fetch('https://api.clerk.com/v1/users', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${clerkSecretKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                email_address: [parsed.email],
                unsafe_metadata: { registered_from: 'wxmp', wxmp_openid: openid },
              }),
            });
            const created = await createResp.json();
            if (created.errors) {
              return jsonResponse({ error: '注册失败', detail: created.errors }, 500);
            }
            clerkUserId = created.id;
          } catch (e) {
            console.error('[wxmp_bind_verify] Clerk create error:', e.message);
            return jsonResponse({ error: '注册失败，请重试' }, 500);
          }
        }

        await env.USER_DATA.put(`wechat_bind:${wxmpUserId}`, clerkUserId);
        await env.USER_DATA.delete(codeKey); // consume code
        const token = `${clerkUserId}:${env.WELIAN_SYNC_SECRET}`;
        // Count contacts for message
        const contacts = await loadDataset(env, clerkUserId, 'contacts');
        return jsonResponse({
          ok: true,
          token,
          is_new_user: !!parsed.is_new,
          message: parsed.is_new
            ? `注册并绑定成功，开始使用吧`
            : `绑定成功（${contacts.length} 个联系人）`,
        });
      }

      // ── Contact stats (mini program, lightweight) ──
      if (path === '/ai/wxmp_contact_stats' && method === 'GET') {
        const userId = await getVerifiedUserId(request, env, {});
        if (!userId) {
          return jsonResponse({ error: 'Authentication required' }, 401);
        }
        const contacts = await loadDataset(env, userId, 'contacts');
        const stats = {
          total: contacts.length,
          leverage: contacts.filter(c => ['leverage', 'dual', '双重'].includes(c.nature)).length,
          nurture: contacts.filter(c => ['nurture', 'dual', '双重'].includes(c.nature)).length,
          dual: contacts.filter(c => ['dual', '双重'].includes(c.nature)).length,
        };
        return jsonResponse({ ok: true, stats });
      }

      // ── Scan business card and create contact (mini program) ──
      if (path === '/ai/wxmp_card_scan' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const userId = await getVerifiedUserId(request, env, body);
        if (!userId) {
          return jsonResponse({ error: 'Authentication required' }, 401);
        }
        const { base64, media_type } = body;
        if (!base64) {
          return jsonResponse({ error: 'base64 required' }, 400);
        }
        // LLM multimodal: extract card info
        const imageBlock = {
          type: 'image',
          source: { type: 'base64', media_type: media_type || 'image/jpeg', data: base64 },
        };
        const cardPrompt = `请分析这张名片照片，提取信息以JSON格式返回：
{
  "name": "姓名（必填，识别不到也要猜一个）",
  "company": "公司（如能识别，否则空字符串）",
  "title": "职位（如能识别，否则空字符串）",
  "phone": "电话（如能识别，否则空字符串）",
  "email": "邮箱（如能识别，否则空字符串）",
  "relation": "关系类型推断（同行/客户/合作方/校友/朋友/其他，默认同行）"
}
只返回JSON对象，第一个字符必须是{，最后一个字符必须是}。不要markdown代码块。`;
        const result = await callLLM(null, 'You extract business card info. Respond with JSON only.', env, {
          max_tokens: 512,
          model_tier: 'enhanced',
          messages: [{ role: 'user', content: [imageBlock, { type: 'text', text: '请分析这张名片并提取信息。' }] }],
        });
        if (!result) {
          return jsonResponse({ error: '识别失败，请重试' }, 500);
        }
        let card;
        try {
          const jsonText = result.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          card = JSON.parse(jsonText);
        } catch (e) {
          const match = result.text.match(/\{[\s\S]*\}/);
          if (match) {
            card = JSON.parse(match[0]);
          } else {
            return jsonResponse({ error: '识别失败', raw_text: result.text }, 500);
          }
        }
        if (!card.name) {
          return jsonResponse({ error: '未识别到姓名', raw_text: result.text }, 400);
        }
        // Ensure all fields are strings (LLM may return objects/arrays for some fields)
        // For objects/arrays: extract first string value or return empty — never JSON.stringify
        const str = (v) => {
          if (v == null) return '';
          if (typeof v === 'string') return v;
          if (typeof v === 'number') return String(v);
          if (Array.isArray(v)) {
            // Find first string element
            const first = v.find(e => typeof e === 'string');
            return first || '';
          }
          if (typeof v === 'object') {
            // Try common keys: name, type, value, label
            for (const k of ['name', 'type', 'value', 'label', 'text']) {
              if (typeof v[k] === 'string') return v[k];
            }
            // Fallback: first string value
            const vals = Object.values(v).filter(e => typeof e === 'string');
            return vals[0] || '';
          }
          return String(v);
        };
        card = {
          name: str(card.name),
          company: str(card.company),
          title: str(card.title),
          phone: str(card.phone),
          email: str(card.email),
          relation: str(card.relation) || '同行',
        };
        // Create contact
        const contacts = await loadDataset(env, userId, 'contacts');
        // Check duplicate by name
        const existing = contacts.find(c => c.name === card.name);
        if (existing) {
          return jsonResponse({
            ok: true,
            contact: card,
            is_duplicate: true,
            existing_id: existing.id,
            message: `「${card.name}」已在你的联系人中`,
          });
        }
        const newContact = {
          id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: card.name,
          company: card.company,
          title: card.title,
          phone: card.phone,
          email: card.email,
          relation: card.relation,
          nature: 'leverage',
          strength: 3,
          tags: ['名片扫描'],
          memories: [],
          important_dates: [],
          created_at: new Date().toISOString(),
          updated: new Date().toISOString(),
        };
        contacts.push(newContact);
        await saveDataset(env, userId, 'contacts', contacts);
        return jsonResponse({
          ok: true,
          contact: newContact,
          is_duplicate: false,
          message: `已添加「${card.name}」`,
        });
      }

      // ── Register new account from mini program (public) ──
      if (path === '/ai/wxmp_register' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { openid, nickname } = body;
        if (!openid) {
          return jsonResponse({ error: 'openid required' }, 400);
        }
        const wxmpUserId = `wxmp_${openid}`;
        // Check if already bound to a Web account
        const existingBind = await env.USER_DATA.get(`wechat_bind:${wxmpUserId}`);
        if (existingBind) {
          // Already bound — return existing token
          const token = `${existingBind}:${env.WELIAN_SYNC_SECRET}`;
          return jsonResponse({ ok: true, token, is_existing: true, message: '已注册' });
        }
        // Check if already registered (self-registered, not bound to Web)
        const existingReg = await env.USER_DATA.get(`wxmp_registered:${wxmpUserId}`);
        if (existingReg) {
          const token = `${wxmpUserId}:${env.WELIAN_SYNC_SECRET}`;
          return jsonResponse({ ok: true, token, is_existing: true, message: '已注册' });
        }
        // New registration: mark as registered, data lives under wxmp_<openid> namespace
        // No Clerk account needed — getVerifiedUserId returns wxmp_<openid> for unbound wxmp tokens
        await env.USER_DATA.put(`wxmp_registered:${wxmpUserId}`, JSON.stringify({
          openid, nickname: nickname || '微信用户',
          created_at: new Date().toISOString(),
        }));
        const token = `${wxmpUserId}:${env.WELIAN_SYNC_SECRET}`;
        return jsonResponse({
          ok: true,
          token,
          is_new: true,
          message: '注册成功，开始使用吧',
        });
      }

      // ── Unbind mini program from Web account (public) ──
      if (path === '/ai/wxmp_unbind' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { openid, clerk_user_id } = body;
        // Prefer openid; fallback to clerk_user_id (for bound users whose token is user_ prefix)
        if (openid) {
          const wxmpUserId = `wxmp_${openid}`;
          await env.USER_DATA.delete(`wechat_bind:${wxmpUserId}`);
          const token = `${wxmpUserId}:${env.WELIAN_SYNC_SECRET}`;
          return jsonResponse({ ok: true, token, message: '已解绑' });
        }
        if (clerk_user_id) {
          // Find the wxmp binding that points to this clerk user
          // List all wechat_bind: keys and find the one matching clerk_user_id
          const listResult = await env.USER_DATA.list({ prefix: 'wechat_bind:' });
          for (const key of listResult.keys || []) {
            const val = await env.USER_DATA.get(key.name);
            if (val === clerk_user_id) {
              await env.USER_DATA.delete(key.name);
              // Extract openid from key name: wechat_bind:wxmp_<openid>
              const openidFromKey = key.name.replace('wechat_bind:wxmp_', '');
              const token = `wxmp_${openidFromKey}:${env.WELIAN_SYNC_SECRET}`;
              return jsonResponse({ ok: true, token, message: '已解绑' });
            }
          }
          return jsonResponse({ error: '未找到绑定记录' }, 400);
        }
        return jsonResponse({ error: 'openid or clerk_user_id required' }, 400);
      }

      // ── Bind mini program to existing Web account (legacy, public) ──
      if (path === '/ai/wxmp_bind' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { openid, email, clerk_user_id } = body;
        if (!openid) {
          return jsonResponse({ error: 'openid required' }, 400);
        }
        // Resolve email → clerk_user_id if email provided
        let resolvedUserId = clerk_user_id;
        if (!resolvedUserId && email) {
          resolvedUserId = await getClerkUserIdByEmail(email.trim().toLowerCase(), env);
          if (!resolvedUserId) {
            return jsonResponse({ error: '未找到该邮箱对应的 Web 账号，请确认邮箱正确' }, 400);
          }
        }
        if (!resolvedUserId) {
          return jsonResponse({ error: '请提供 email 或 clerk_user_id' }, 400);
        }
        const wxmpUserId = `wxmp_${openid}`;
        // Verify the clerk_user_id has data (contacts exist)
        const contacts = await loadDataset(env, resolvedUserId, 'contacts');
        if (contacts.length === 0) {
          return jsonResponse({ error: '该账号暂无联系人数据' }, 400);
        }
        // Create binding
        await env.USER_DATA.put(`wechat_bind:${wxmpUserId}`, resolvedUserId);
        // Return new token bound to Clerk user
        const token = `${resolvedUserId}:${env.WELIAN_SYNC_SECRET}`;
        return jsonResponse({
          ok: true,
          token,
          message: `已绑定（${contacts.length} 个联系人）`,
        });
      }

      // ── Email subscription for daily signals digest (public) ──
      if (path === '/ai/subscribe' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const email = (body.email || '').trim().toLowerCase();
        if (!email || !email.includes('@') || !email.includes('.')) {
          return jsonResponse({ error: '请输入有效邮箱' }, 400);
        }
        // Store subscription (dedup by email)
        const subKey = `sub:${email}`;
        const existing = await env.USER_DATA.get(subKey);
        if (existing) {
          return jsonResponse({ ok: true, message: '已订阅，无需重复' });
        }
        const subId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await env.USER_DATA.put(subKey, JSON.stringify({
          email, subId, subscribed_at: new Date().toISOString(),
        }));
        // Add to daily digest list
        const listKey = 'subscribers:daily_signals';
        const list = await env.USER_DATA.get(listKey);
        const emails = list ? JSON.parse(list) : [];
        if (!emails.includes(email)) {
          emails.push(email);
          await env.USER_DATA.put(listKey, JSON.stringify(emails));
        }
        // Send welcome email
        const welcomeHtml = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#2C2C2C">
          <h1 style="color:#4A6741">订阅成功 ✅</h1>
          <p>每天早上 7:00，你会收到今日科技商业信号摘要：</p>
          <ul>
            <li>📊 15 条高信号新闻（按价值排序）</li>
            <li>🔥 当日热点主题</li>
            <li>💡 AI 解读为什么重要</li>
          </ul>
          <p>覆盖 AI、投资、科技金融三大领域，从 23 个信息源筛选。</p>
          <p style="margin-top:24px;font-size:13px;color:#999">
            不想再收到？<a href="https://api.welian.app/ai/unsubscribe?email=${encodeURIComponent(email)}&id=${subId}" style="color:#4A6741">取消订阅</a>
          </p>
          <p style="margin-top:16px"><a href="https://welian.app/signals.html" style="display:inline-block;padding:10px 24px;background:#4A6741;color:#fff;border-radius:8px;text-decoration:none">查看完整信号 →</a></p>
        </body></html>`;
        await sendEmail(env, email, '订阅成功 | Welian 每日信号', welcomeHtml);
        return jsonResponse({ ok: true, message: '订阅成功，请查收确认邮件' });
      }

      // ── Unsubscribe (public, GET with query params) ──
      if (path === '/ai/unsubscribe' && method === 'GET') {
        const email = (url.searchParams.get('email') || '').trim().toLowerCase();
        const subId = url.searchParams.get('id') || '';
        if (!email) return jsonResponse({ error: '缺少参数' }, 400);
        const subKey = `sub:${email}`;
        const existing = await env.USER_DATA.get(subKey);
        if (existing) {
          const parsed = JSON.parse(existing);
          if (parsed.subId === subId || !subId) {
            await env.USER_DATA.delete(subKey);
            // Remove from list
            const listKey = 'subscribers:daily_signals';
            const list = await env.USER_DATA.get(listKey);
            if (list) {
              const emails = JSON.parse(list).filter(e => e !== email);
              await env.USER_DATA.put(listKey, JSON.stringify(emails));
            }
            return new Response('<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px"><h1 style="color:#4A6741">已取消订阅</h1><p>不会再收到每日信号邮件了。</p><p><a href="https://welian.app/signals.html">仍可随时访问网页版 →</a></p></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
          }
        }
        return new Response('<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px"><h1>链接已失效</h1><p>可能是已取消或链接过期。</p></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // ── Network: relationship path search & recommendations ──

      if (path === '/ai/network/path' && method === 'POST') {
        const userId = await getVerifiedUserId(request, env, {});
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const body = await request.json().catch(() => ({}));
        const { from_name, to_name, max_hops = 4 } = body;
        if (!from_name || !to_name) return jsonResponse({ error: 'from_name and to_name required' }, 400);
        const contacts = await loadDataset(env, userId, 'contacts');
        const result = findRelationshipPath(contacts, from_name, to_name, max_hops);
        return jsonResponse(result);
      }

      if (path === '/ai/network/recommend' && method === 'POST') {
        const userId = await getVerifiedUserId(request, env, {});
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const body = await request.json().catch(() => ({}));
        const { scenario, top_n = 10 } = body;
        if (!scenario) return jsonResponse({ error: 'scenario required' }, 400);
        const contacts = await loadDataset(env, userId, 'contacts');
        const result = recommendByScenario(contacts, scenario, top_n);
        return jsonResponse({ scenario, recommendations: result });
      }

      if (path === '/ai/network/graph' && method === 'GET') {
        const userId = await getVerifiedUserId(request, env, {});
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const contacts = await loadDataset(env, userId, 'contacts');
        const graph = buildNetworkGraph(contacts);
        return jsonResponse(graph);
      }

      if (path === '/ai/network/connect' && method === 'POST') {
        const userId = await getVerifiedUserId(request, env, {});
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const body = await request.json().catch(() => ({}));
        const { contact_id, target_id, relation_desc = '' } = body;
        if (!contact_id || !target_id) return jsonResponse({ error: 'contact_id and target_id required' }, 400);
        const contacts = await loadDataset(env, userId, 'contacts');
        const contact = contacts.find(c => c.id === contact_id);
        const target = contacts.find(c => c.id === target_id);
        if (!contact || !target) return jsonResponse({ error: 'contact not found' }, 404);
        // Add bidirectional connection
        if (!contact.connections) contact.connections = [];
        if (!contact.connections.some(c => c.id === target_id)) {
          contact.connections.push({ id: target_id, name: target.name, desc: relation_desc });
        }
        if (!target.connections) target.connections = [];
        if (!target.connections.some(c => c.id === contact_id)) {
          target.connections.push({ id: contact_id, name: contact.name, desc: relation_desc });
        }
        contact.updated = new Date().toISOString();
        target.updated = new Date().toISOString();
        await saveDataset(env, userId, 'contacts', contacts);
        return jsonResponse({ ok: true, message: `Connected ${contact.name} ↔ ${target.name}` });
      }

      // ── Advise push history ──

      if (path === '/ai/advise_history' && method === 'GET') {
        const userId = await getVerifiedUserId(request, env, {});
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const listResult = await env.USER_DATA.list({ prefix: `advise_history:${userId}:` });
        const history = [];
        for (const key of listResult.keys) {
          const raw = await env.USER_DATA.get(key.name);
          if (raw) {
            try { history.push(JSON.parse(raw)); } catch { /* skip */ }
          }
        }
        history.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return jsonResponse({ history: history.slice(0, 30) });
      }

      // ── WeChat contacts import ──

      if (path === '/ai/contacts/import_wechat' && method === 'POST') {
        const userId = await getVerifiedUserId(request, env, {});
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const body = await request.json().catch(() => ({}));
        const { contacts: importContacts = [] } = body;
        if (!Array.isArray(importContacts) || importContacts.length === 0) {
          return jsonResponse({ error: 'contacts array required' }, 400);
        }
        const existing = await loadDataset(env, userId, 'contacts');
        const existingNames = new Set(existing.map(c => c.name.toLowerCase()));
        let added = 0;
        let skipped = 0;
        for (const ic of importContacts) {
          const name = (ic.name || '').trim();
          if (!name || existingNames.has(name.toLowerCase())) { skipped++; continue; }
          const contact = createContact(name, {
            phone: ic.phone || '',
            wechat: ic.wechat || ic.wxid || '',
            company: ic.company || '',
            title: ic.title || '',
            tags: ic.tags || [],
            nature: 'leverage',
          });
          if (ic.wechat || ic.wxid) {
            contact.platforms = { wechat: ic.wechat || ic.wxid };
          }
          existing.push(contact);
          existingNames.add(name.toLowerCase());
          added++;
        }
        if (added > 0) {
          await saveDataset(env, userId, 'contacts', existing);
        }
        return jsonResponse({ ok: true, added, skipped, total: existing.length });
      }

      // ── Auto-extract interactions from chat messages ──

      if (path === '/ai/interactions/auto_extract' && method === 'POST') {
        const userId = await getVerifiedUserId(request, env, {});
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const body = await request.json().catch(() => ({}));
        const { messages = [], contact_name = '' } = body;
        if (!Array.isArray(messages) || messages.length === 0) {
          return jsonResponse({ error: 'messages array required' }, 400);
        }
        const contacts = await loadDataset(env, userId, 'contacts');
        const timeline = await loadDataset(env, userId, 'timeline');

        // Find matching contact
        let targetContact = null;
        if (contact_name) {
          targetContact = contacts.find(c => contactMatchesName(c, contact_name));
        }
        if (!targetContact) {
          // Try to match from message content
          const allText = messages.map(m => m.content || m.text || '').join(' ');
          targetContact = contacts.find(c => allText.includes(c.name));
        }
        if (!targetContact) {
          return jsonResponse({ error: '无法匹配到联系人，请指定 contact_name' }, 404);
        }

        // Build chat text for LLM extraction
        const chatText = messages.map(m => {
          const sender = m.is_me ? '我' : (m.sender || targetContact.name);
          return `[${m.time || ''}] ${sender}: ${m.content || m.text || ''}`;
        }).join('\n');

        const extractPrompt = `分析以下与「${targetContact.name}」的微信聊天记录，提取最近互动摘要。

聊天记录：
${chatText}

请提取：
1. 互动摘要（1-2句话概括聊天内容）
2. 关键要点（最多3条）
3. 待办事项（如果对方提到了需要跟进的事情）

返回JSON格式：
{"summary":"...","key_points":["..."],"pending":"..."}`;

        const llmResp = await callLLM(extractPrompt, '你是关系管理助手，擅长从聊天记录中提取关键信息。', env, { max_tokens: 512, temperature: 0.3 });

        let extracted = { summary: '', key_points: [], pending: '' };
        if (llmResp) {
          try {
            const jsonMatch = llmResp.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
          } catch { /* fallback */ }
        }
        if (!extracted.summary) {
          extracted.summary = `与${targetContact.name}微信聊天，${messages.length}条消息`;
        }

        // Create timeline entry
        const entry = createTimelineEntry(targetContact.id, extracted.summary, {
          type: 'message',
          key_points: extracted.key_points || [],
          pending: extracted.pending || '',
          date: new Date().toISOString().slice(0, 10),
        });
        timeline.push(entry);
        await saveDataset(env, userId, 'timeline', timeline);

        // Create todo if pending found
        let todoCreated = false;
        if (extracted.pending) {
          const todos = await loadDataset(env, userId, 'todos');
          const todo = createTodo(targetContact.id, extracted.pending, { priority: 'P1' });
          todos.push(todo);
          await saveDataset(env, userId, 'todos', todos);
          todoCreated = true;
        }

        return jsonResponse({
          ok: true,
          contact: targetContact.name,
          timeline_entry: entry,
          todo_created: todoCreated,
          extracted,
        });
      }

      // ── Web search ──

      if (path === '/ai/search' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const userId = await getVerifiedUserId(request, env, body);
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const query = (body.query || '').trim();
        if (!query) return jsonResponse({ error: 'query required' }, 400);
        const searchResult = await webSearch(query, env, 5);
        const searchContext = formatSearchResults(searchResult);
        return jsonResponse({
          search_context: searchContext,
          provider: searchResult.provider,
          result_count: searchResult.results.length,
          results: searchResult.results,
        });
      }

      if (path === '/ai/read_url' && method === 'POST') {
        const r = await handleReadUrl(request, env);
        return jsonResponse(r.data, r.status);
      }

      // ── WeChat Pay orders ──

      if (path === '/ai/create_order' && method === 'POST') {
        const r = await handleCreateOrder(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/confirm_order' && method === 'POST') {
        const r = await handleConfirmOrder(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/list_orders' && method === 'POST') {
        const r = await handleListOrders(request, env);
        return jsonResponse(r.data, r.status);
      }

      // ── Paddle (global payments) ──
      if (path === '/ai/paddle/checkout' && method === 'POST') {
        const r = await handlePaddleCheckout(request, env);
        return jsonResponse(r.data, r.status);
      }
      if (path === '/ai/paddle/webhook' && method === 'POST') {
        const r = await handlePaddleWebhook(request, env);
        return jsonResponse(r.data, r.status);
      }
      if (path === '/ai/paddle/cancel' && method === 'POST') {
        const r = await handlePaddleCancel(request, env);
        return jsonResponse(r.data, r.status);
      }
      if (path === '/ai/paddle/config' && method === 'GET') {
        return jsonResponse({
          environment: env.PADDLE_ENVIRONMENT || 'sandbox',
          client_token: env.PADDLE_CLIENT_TOKEN || '',
          products: Object.keys(PADDLE_PRODUCTS),
        });
      }

      // ── Data sync (full cloud mode) ──

      if (path === '/ai/extract_intent' && method === 'POST') {
        const r = await handleExtractIntent(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/session_summary' && method === 'POST') {
        const r = await handleSessionSummary(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/import' && method === 'POST') {
        const r = await handleImportContacts(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/import_batch' && method === 'POST') {
        const r = await handleImportBatch(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/import_chunk' && method === 'POST') {
        const r = await handleImportChunk(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/proactive' && method === 'POST') {
        const r = await handleProactiveSuggestion(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/data/sync' && method === 'POST') {
        const r = await handleDataSync(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/data/sync_full' && method === 'POST') {
        const r = await handleDataSyncFull(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/data/search' && method === 'POST') {
        const r = await handleDataSearch(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/data/context' && method === 'GET') {
        const r = await handleDataContext(request, env);
        return jsonResponse(r.data, r.status);
      }

      // ── Cloud → Edge one-way pull (full datasets) ──
      if (path === '/data/pull' && method === 'GET') {
        const userId = await getVerifiedUserId(request, env, null);
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const [contacts, todos, timeline] = await Promise.all([
          loadDataset(env, userId, 'contacts'),
          loadDataset(env, userId, 'todos'),
          loadDataset(env, userId, 'timeline'),
        ]);
        return jsonResponse({ contacts, todos, timeline, pulled_at: new Date().toISOString() });
      }

      if (path === '/data/push' && method === 'POST') {
        const userId = await getVerifiedUserId(request, env, null);
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const body = await request.json();
        if (Array.isArray(body.contacts)) {
          await saveDataset(env, userId, 'contacts', body.contacts);
          return jsonResponse({ ok: true, count: body.contacts.length });
        }
        return jsonResponse({ error: 'No contacts array' }, 400);
      }

      // ── Cloud-native CRUD ──

      if (path === '/data/contacts' && (method === 'GET' || method === 'POST' || method === 'PUT' || method === 'DELETE')) {
        const r = await handleContactsCRUD(request, env, method);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/data/timeline' && (method === 'GET' || method === 'POST' || method === 'PUT' || method === 'DELETE')) {
        const r = await handleTimelineCRUD(request, env, method);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/data/meetings' && (method === 'GET' || method === 'POST' || method === 'DELETE')) {
        const r = await handleMeetingsCRUD(request, env, method);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/data/profile' && (method === 'GET' || method === 'POST')) {
        const r = await handleProfile(request, env, method);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/data/memory' && (method === 'GET' || method === 'POST')) {
        const r = await handleMemory(request, env, method);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/diagnostics' && method === 'POST') {
        const r = await handleDiagnostics(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/skills' && method === 'GET') {
        const url = new URL(request.url);
        const intent = url.searchParams.get('intent') || '';
        const skills = getSkillsForIntent(intent);
        // H2: Merge custom skills from user's KV store
        const userId = await getVerifiedUserId(request, env, {});
        if (userId) {
          const customSkills = await getCustomSkillsForIntent(env, userId, intent);
          skills.push(...customSkills);
        }
        return jsonResponse({ skills, intent });
      }

      // ── Routing config (frontend reads this to decide Live vs Cloud) ──
      if (path === '/ai/config' && method === 'GET') {
        // Defaults match config/welian.yaml routing + cloud.data_priority sections
        let routing = { mode: 'auto', live_timeout_ms: 30000, agent_context_timeout_ms: 5000 };
        let dataPriority = ['cloud_kv', 'agent'];
        try {
          const stored = await env.USER_DATA.get('config:routing');
          if (stored) routing = { ...routing, ...JSON.parse(stored) };
        } catch (e) { /* use defaults */ }
        try {
          const storedDp = await env.USER_DATA.get('config:data_priority');
          if (storedDp) dataPriority = JSON.parse(storedDp);
        } catch (e) { /* use defaults */ }
        return jsonResponse({
          routing,
          data_priority: dataPriority,
          tiers: {
            standard: env.LLM_MODEL || 'MiniMax-M3',
            enhanced: env.LLM_MODEL_ENHANCED || 'claude-sonnet-4-6',
            premium: env.LLM_MODEL_PREMIUM || 'claude-opus-4-6',
          },
        });
      }

      if (path === '/data/goals' && (method === 'GET' || method === 'POST')) {
        const r = await handleGoals(request, env, method);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/data/sessions' && (method === 'GET' || method === 'POST')) {
        const r = await handleSessions(request, env, method);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/data/skills' && (method === 'GET' || method === 'POST' || method === 'DELETE')) {
        const r = await handleCustomSkills(request, env, method);
        return jsonResponse(r.data, r.status);
      }

      if ((path === '/data/todos' || path === '/data/todos/done' || path === '/data/todos/reopen' || path === '/data/todos/cancel' || path === '/data/todos/postpone') && (method === 'GET' || method === 'POST' || method === 'DELETE')) {
        const r = await handleTodosCRUD(request, env, method, path);
        return jsonResponse(r.data, r.status);
      }

      // iCal feed — no Clerk auth, uses token query param (user_id:sync_secret)
      if (path === '/data/calendar/feed' && method === 'GET') {
        return handleCalendarFeed(request, env);
      }

      // Calendar sync token — requires Clerk auth, returns feed URL
      if (path === '/data/calendar/token' && method === 'GET') {
        const userId = await getVerifiedUserId(request, env, {});
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const r = await handleCalendarToken(request, env, userId);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/data/delete_account' && method === 'POST') {
        const r = await handleDeleteAccount(request, env);
        return jsonResponse(r.data, r.status);
      }

      // ── Multi-platform IM webhooks & binding (Phase 1: Telegram) ──

      // Telegram webhook: Telegram sends updates as JSON, verified via secret token header
      if (path === '/im/telegram/webhook' && method === 'POST') {
        const ok = await telegramAdapter.verifyWebhook(request, env);
        if (!ok) return jsonResponse({ error: 'invalid secret token' }, 401);
        const msg = await telegramAdapter.parseIncoming(request, env);
        // Telegram expects 200 OK quickly; reply asynchronously via sendMessage API
        if (msg) {
          ctx.waitUntil((async () => {
            try {
              const outgoing = await imDispatch(env, msg, {
                callLLM, deductBilling, loadDataset, getPrompt, trackAction,
              });
              await telegramAdapter.sendReply(env, outgoing);
            } catch (e) {
              console.error('[im/telegram] dispatch error:', e.message);
              try {
                await telegramAdapter.sendReply(env, {
                  platform: 'telegram', chatId: msg.chatId,
                  text: '⚠️ 处理消息时出错了，请稍后再试。',
                });
              } catch { /* best-effort error reply */ }
            }
          })());
        }
        return jsonResponse({ ok: true }); // ack to Telegram immediately
      }

      // Feishu webhook: event subscription callback
      if (path === '/im/feishu/webhook' && method === 'POST') {
        const ok = await feishuAdapter.verifyWebhook(request, env);
        if (!ok) return jsonResponse({ error: 'invalid signature' }, 401);
        const parsed = await feishuAdapter.parseIncoming(request, env);
        // URL verification challenge — must return {challenge} synchronously
        if (parsed && parsed.isVerification) {
          return jsonResponse({ challenge: parsed.challenge });
        }
        if (parsed) {
          ctx.waitUntil((async () => {
            try {
              const outgoing = await imDispatch(env, parsed, {
                callLLM, deductBilling, loadDataset, getPrompt, trackAction,
              });
              await feishuAdapter.sendReply(env, outgoing);
            } catch (e) {
              console.error('[im/feishu] dispatch error:', e.message);
            }
          })());
        }
        return jsonResponse({ ok: true });
      }

      // DingTalk webhook: event subscription callback
      if (path === '/im/dingtalk/webhook' && method === 'POST') {
        const ok = await dingtalkAdapter.verifyWebhook(request, env);
        if (!ok) return jsonResponse({ error: 'invalid signature' }, 401);
        const msg = await dingtalkAdapter.parseIncoming(request, env);
        if (msg) {
          ctx.waitUntil((async () => {
            try {
              const outgoing = await imDispatch(env, msg, {
                callLLM, deductBilling, loadDataset, getPrompt, trackAction,
              });
              // Preserve raw (for sessionWebhook) on outgoing
              outgoing.raw = msg.raw;
              await dingtalkAdapter.sendReply(env, outgoing);
            } catch (e) {
              console.error('[im/dingtalk] dispatch error:', e.message);
            }
          })());
        }
        return jsonResponse({ ok: true });
      }

      // Start binding from IM (called by adapter, but also exposed for testing)
      if (path === '/im/bind/start' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const r = await handleBindStart(env, body);
        return jsonResponse(r.data, r.status);
      }

      // Confirm binding from web (after Clerk login)
      if (path === '/im/bind/confirm' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const clerkUserId = await getVerifiedUserId(request, env, body);
        const r = await handleBindConfirm(env, clerkUserId, body);
        return jsonResponse(r.data, r.status);
      }

      // Unbind a platform (web, authenticated)
      if (path === '/im/bind/unbind' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const clerkUserId = await getVerifiedUserId(request, env, body);
        const r = await handleUnbind(env, clerkUserId, body);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/meeting_prep' && method === 'POST') {
        const r = await handleMeetingPrep(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/meeting_photo' && method === 'POST') {
        const r = await handleMeetingPhoto(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/meeting_review' && method === 'POST') {
        const r = await handleMeetingReview(request, env);
        return jsonResponse(r.data, r.status);
      }

      // ── Weekly/Monthly reports (structured, not ad-hoc prompt) ──

      if (path === '/ai/weekly_report' && method === 'POST') {
        const r = await handleWeeklyReport(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/monthly_report' && method === 'POST') {
        const r = await handleMonthlyReport(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/annual_report' && method === 'POST') {
        const r = await handleAnnualReport(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/hn_signals' && method === 'POST') {
        const r = await handleHnSignals(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/contact_web_search' && method === 'POST') {
        const r = await handleContactWebSearch(request, env);
        return jsonResponse(r.data, r.status);
      }

      // ── Onboarding (activation funnel) ──

      if (path === '/ai/onboarding/create_contacts' && method === 'POST') {
        const r = await handleOnboardingCreateContacts(request, env);
        return jsonResponse(r.data, r.status);
      }

      // ── Metrics (P0: North Star + Advice Adoption) ──

      if (path === '/data/metrics' && method === 'GET') {
        const userId = await getVerifiedUserId(request, env, {});
        if (!userId) return jsonResponse({ error: 'Authentication required' }, 401);
        const metrics = await loadMetrics(env, userId);
        // Compute adoption rate: adoptions / advise_generated (last 30 days ≈ 5 weeks)
        const thirtyDaysAgo = Date.now() - 30 * 86400000;
        const recentAdoptions = (metrics.adoptions || []).filter(a => new Date(a.ts).getTime() >= thirtyDaysAgo);
        // Sum advise_generated for last ~5 weeks (covers 30+ days)
        const recentWeekKeys = [];
        for (let i = 0; i < 5; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i * 7);
          recentWeekKeys.push(getWeekKey(d.toISOString()));
        }
        const totalAdvise30d = recentWeekKeys.reduce((sum, wk) => {
          return sum + ((metrics.weekly?.[wk]?.advise_generated) || 0);
        }, 0);
        const adoptionRate = totalAdvise30d > 0 ? (recentAdoptions.length / totalAdvise30d) : 0;
        // North Star: this week's total actions
        const thisWk = getWeekKey(new Date().toISOString());
        const thisWeekActions = metrics.weekly?.[thisWk] || {};
        const northStar = (thisWeekActions.todo_completed || 0) + (thisWeekActions.interaction_recorded || 0) + (thisWeekActions.draft_generated || 0);
        return jsonResponse({
          north_star_this_week: northStar,
          weekly: metrics.weekly,
          adoptions: metrics.adoptions,
          adoption_rate_30d: adoptionRate,
          total_advise_30d: totalAdvise30d,
          total_adoptions_30d: recentAdoptions.length,
        });
      }

      // ── Push poll (bot picks up queued messages) ──

      if (path === '/ai/relationship_health' && method === 'POST') {
        const r = await handleRelationshipHealth(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/push_poll' && method === 'POST') {
        const r = await handlePushPoll(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/estimate_cost' && method === 'POST') {
        const r = await handleEstimateCost(request, env);
        return jsonResponse(r.data, r.status);
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
      ctx.waitUntil(captureException(env, e, {
        tags: { path, method },
        request: { url: request.url, method },
      }));
      return jsonResponse({ error: e.message }, 500);
    }
  },

  // ── Cron handler: weekly report push every Monday 9:00 AM CST (01:00 UTC) ──
  async scheduled(event, env, ctx) {
    const cronExpr = event.cron || '';
    const tasks = [];
    // Monday 01:00 UTC → weekly report push
    if (cronExpr === '0 1 * * 1') {
      tasks.push(handleScheduledPush(env).catch(e => captureException(env, e, { tags: { handler: 'scheduled' } })));
    }
    // Daily 23:00 UTC (07:00 CST) → daily signals push to WeChat
    if (cronExpr === '0 23 * * *') {
      tasks.push(handleDailySignalsPush(env).catch(e => captureException(env, e, { tags: { handler: 'daily_signals' } })));
      tasks.push(handleDailyAdvisePush(env).catch(e => captureException(env, e, { tags: { handler: 'daily_advise' } })));
    }
    // Daily 14:00 UTC (22:00 CST) → evening recap push to WeChat
    if (cronExpr === '0 14 * * *') {
      tasks.push(handleEveningSignalsPush(env).catch(e => captureException(env, e, { tags: { handler: 'evening_recap' } })));
    }
    // Daily 13:00 UTC (21:00 CST) → festival & important date reminder push (3 days ahead)
    if (cronExpr === '0 13 * * *') {
      tasks.push(handleFestivalReminderPush(env).catch(e => captureException(env, e, { tags: { handler: 'festival_reminder' } })));
    }
    // 1st & 15th of month 01:00 UTC (09:00 CST) → biweekly health warning push
    if (cronExpr === '0 1 1,15 * *') {
      tasks.push(handleHealthWarningPush(env).catch(e => captureException(env, e, { tags: { handler: 'health_warning' } })));
    }
    // Fallback: if no cron match, run weekly (backward compat)
    if (tasks.length === 0) {
      tasks.push(handleScheduledPush(env).catch(e => captureException(env, e, { tags: { handler: 'scheduled' } })));
    }
    ctx.waitUntil(Promise.all(tasks));
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

// ── Weekly report: structured generation (not ad-hoc prompt) ──

const WEEKLY_SYSTEM = `You are Welian (小维), generating a weekly relationship review.

IMPORTANT: Return ONLY a valid JSON object. No markdown, no code fences, no text before or after the JSON.

Return JSON with this exact structure:
{
  "greeting": "一句话开场（温暖、像朋友）",
  "review": {"interactions": 0, "new_todos": 0, "completed_todos": 0, "summary": "一句话本周回顾"},
  "suggest_contact": [{"name": "名字", "reason": "为什么这周该联系", "topic": "聊什么"}],
  "upcoming_dates": [{"name": "名字", "date": "MM-DD", "label": "生日/纪念日"}],
  "todo_reminders": [{"contact": "名字", "task": "待办内容", "urgency": "high/medium/low"}],
  "closing": "一句话收尾（鼓励、不焦虑）"
}
Rules:
- Max 5 suggest_contact entries
- Use Chinese, warm tone
- For nurture relationships: gentle, no urgency
- For leverage relationships: purposeful, with topic
- If no data, say so honestly (不要编造)
- Output MUST be valid JSON, nothing else`;

async function handleWeeklyReport(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  // Cache: return same-day cached report if exists
  const todayKey = localDateStr(req);
  const cacheKey = `weekly_cache:${userId}:${todayKey}`;
  const cached = await env.USER_DATA.get(cacheKey);
  if (cached) {
    return { status: 200, data: JSON.parse(cached) };
  }

  const contacts = await loadDataset(env, userId, 'contacts');
  const timeline = await loadDataset(env, userId, 'timeline');
  const todos = await loadDataset(env, userId, 'todos');

  // Calculate date range (last 7 days) in user's timezone
  const now = localDate(req);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);

  const weekTimeline = timeline.filter(t => (t.date || '') >= weekAgoStr);
  const weekTodos = todos.filter(t => !isTodoDone(t));
  const completedTodos = todos.filter(t => isTodoDone(t) && (t.completed_at || t.date || '') >= weekAgoStr);

  // Upcoming important dates (next 7 days)
  const upcomingDates = [];
  const todayStr = now.toISOString().slice(5, 10); // MM-DD
  const nextWeekStr = new Date(now.getTime() + 7 * 86400000).toISOString().slice(5, 10);
  for (const c of contacts) {
    if (!c.important_dates) continue;
    for (const d of c.important_dates) {
      const mmdd = (d.date || '').slice(5, 10);
      if (mmdd >= todayStr && mmdd <= nextWeekStr) {
        upcomingDates.push({ name: c.name, date: d.date, label: d.label || '重要日期' });
      }
    }
  }

  // Build context for LLM
  const contextData = {
    weekSummary: {
      interactions: weekTimeline.length,
      new_todos: weekTodos.length,
      completed_todos: completedTodos.length,
    },
    recentInteractions: weekTimeline.slice(-10).map(t => ({
      contact: t.contact_name || t.contact || '',
      date: t.date,
      summary: (t.summary || t.content || '').slice(0, 100),
    })),
    pendingTodos: weekTodos.slice(0, 10).map(t => ({
      contact: t.contact_name || t.contact || '',
      task: t.task || t.content || '',
      urgency: t.urgency || 'medium',
    })),
    upcomingDates: upcomingDates.slice(0, 5),
    topContacts: contacts
      .filter(c => c.strength >= 4)
      .slice(0, 20)
      .map(c => ({ name: c.name, nature: c.nature || '', strength: c.strength, last_interaction: c.last_interaction || '' })),
  };

  const llmResp = await callLLM(
    JSON.stringify(contextData),
    await getPrompt(env, 'weekly', WEEKLY_SYSTEM),
    env,
    { max_tokens: 2048, temperature: 0.7, model_tier: 'standard' }
  );

  if (!llmResp) {
    // Fallback: return structured data without LLM
    return {
      status: 200,
      data: {
        ok: true,
        report: {
          greeting: '这是你的本周回顾',
          review: contextData.weekSummary,
          suggest_contact: [],
          upcoming_dates: upcomingDates.slice(0, 5),
          todo_reminders: contextData.pendingTodos,
          closing: '下周见',
        },
        raw_data: contextData,
      },
    };
  }

  // Try to parse LLM JSON response
  let report;
  try {
    const text = llmResp.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      report = JSON.parse(jsonMatch[0]);
    } else {
      // LLM didn't return JSON, use raw text as greeting
      report = { greeting: text };
    }
  } catch {
    // JSON parse failed — strip JSON formatting chars from text for readable display
    const cleaned = llmResp.text
      .replace(/[{}[\]"]/g, '')
      .replace(/\\n/g, '\n')
      .replace(/^\s*[a-z_]+:\s*/gim, '')
      .trim();
    report = { greeting: cleaned || '周报生成完成' };
  }

  // Deduct billing (unified)
  await deductBilling(env, userId, llmResp.usage, 'weekly_report');

  const resultData = { ok: true, report, raw_data: contextData };
  // Cache report for the day (TTL 25h to cover timezone edge)
  await env.USER_DATA.put(cacheKey, JSON.stringify(resultData), { expirationTtl: 90000 });
  return { status: 200, data: resultData };
}

// ── Monthly report: structured dashboard data ──

const MONTHLY_SYSTEM = `You are Welian (小维), generating a monthly relationship dashboard.
Return JSON with this structure:
{
  "greeting": "一个月度回顾开场",
  "stats": {"total_contacts": N, "active_contacts": N, "interactions": N, "new_todos": N, "completed_todos": N},
  "role_review": {
    "friends": {"count": N, "interactions": N, "highlight": "一句话"},
    "family": {"count": N, "interactions": N, "highlight": "一句话"},
    "collaborators": {"count": N, "interactions": N, "highlight": "一句话"}
  },
  "trends": {"vs_last_month": "上升/持平/下降", "comment": "一句话分析"},
  "achievements": ["本月做得到的地方"],
  "suggestions": ["下月可以改善的地方（最多3条）"],
  "closing": "鼓励性收尾"
}
Rules: Chinese, warm tone, no scoring, no anxiety. If data is thin, say so.`;

async function handleMonthlyReport(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  // Cache: return same-day cached report if exists
  const todayKey = localDateStr(req);
  const cacheKey = `monthly_cache:${userId}:${todayKey}`;
  const cached = await env.USER_DATA.get(cacheKey);
  if (cached) {
    return { status: 200, data: JSON.parse(cached) };
  }

  const contacts = await loadDataset(env, userId, 'contacts');
  const timeline = await loadDataset(env, userId, 'timeline');
  const todos = await loadDataset(env, userId, 'todos');

  const now = new Date();
  const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  const monthAgoStr = monthAgo.toISOString().slice(0, 10);
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
  const twoMonthsAgoStr = twoMonthsAgo.toISOString().slice(0, 10);

  const monthTimeline = timeline.filter(t => (t.date || '') >= monthAgoStr);
  const prevMonthTimeline = timeline.filter(t => (t.date || '') >= twoMonthsAgoStr && (t.date || '') < monthAgoStr);

  // Role classification (by nature or tags)
  const roles = { friends: [], family: [], collaborators: [] };
  for (const c of contacts) {
    const nature = c.nature || '';
    const tags = (c.tags || []).join(' ').toLowerCase();
    if (nature === 'nurture' || nature === '陪伴' || tags.includes('家人') || tags.includes('family')) {
      roles.family.push(c);
    } else if (nature === 'leverage' || nature === '经营' || tags.includes('合作') || tags.includes('work')) {
      roles.collaborators.push(c);
    } else {
      roles.friends.push(c);
    }
  }

  const activeContactIds = new Set(monthTimeline.map(t => t.contact));
  const contextData = {
    stats: {
      total_contacts: contacts.length,
      active_contacts: activeContactIds.size,
      interactions: monthTimeline.length,
      new_todos: todos.filter(t => !isTodoDone(t)).length,
      completed_todos: todos.filter(t => isTodoDone(t) && (t.completed_at || t.date || '') >= monthAgoStr).length,
    },
    role_review: {
      friends: { count: roles.friends.length, interactions: monthTimeline.filter(t => roles.friends.some(c => c.id === t.contact)).length },
      family: { count: roles.family.length, interactions: monthTimeline.filter(t => roles.family.some(c => c.id === t.contact)).length },
      collaborators: { count: roles.collaborators.length, interactions: monthTimeline.filter(t => roles.collaborators.some(c => c.id === t.contact)).length },
    },
    trends: {
      this_month_interactions: monthTimeline.length,
      last_month_interactions: prevMonthTimeline.length,
    },
    topContacts: contacts.filter(c => c.strength >= 4).slice(0, 15).map(c => ({ name: c.name, nature: c.nature, interactions: monthTimeline.filter(t => t.contact === c.id).length })),
  };

  const llmResp = await callLLM(
    JSON.stringify(contextData),
    await getPrompt(env, 'monthly', MONTHLY_SYSTEM),
    env,
    { max_tokens: 2048, temperature: 0.7, model_tier: 'standard' }
  );

  let report;
  if (llmResp) {
    try {
      const text = llmResp.text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      report = jsonMatch ? JSON.parse(jsonMatch[0]) : { greeting: llmResp.text };
    } catch {
      report = { greeting: llmResp.text };
    }
    // Deduct billing (unified)
    await deductBilling(env, userId, llmResp.usage, 'monthly_report');
  } else {
    report = { greeting: '本月回顾', stats: contextData.stats, role_review: contextData.role_review };
  }

  const resultData = { ok: true, report, raw_data: contextData };
  // Cache report for the day (TTL 25h)
  await env.USER_DATA.put(cacheKey, JSON.stringify(resultData), { expirationTtl: 90000 });
  return { status: 200, data: resultData };
}

// ── Signals: Multi-source briefing (HN + 36氪 + 虎嗅 + Tavily contact search) ──

const HN_SIGNALS_SYSTEM = `You are Welian (小维), generating a personalized signal briefing from multiple news sources.

IMPORTANT: Return ONLY a valid JSON object. No markdown, no code fences, no text before or after the JSON.

Return JSON with this exact structure:
{
  "greeting": "一句话开场，结合用户行业背景",
  "signals": [
    {
      "title": "标题（中文）",
      "url": "原始链接",
      "source": "来源（HN/36氪/36氪快讯/虎嗅/头条/微信/机器之心/华尔街见闻/投资界/Product Hunt/TechCrunch/The Verge/ArXiv/V2EX/财联社/新浪财经/证监会/GitHub/InfoQ/雪球/第一财经/Reddit ML/HuggingFace）",
      "points": 分数或0,
      "why": "为什么这对用户重要（结合用户行业/联系人上下文）",
      "action": "建议行动：可以跟谁聊/分享给谁/关注什么",
      "related_contacts": [
        {
          "name": "联系人姓名（必须来自用户联系人列表，不能编造）",
          "reason": "为什么这条信号和这个联系人相关（基于联系人的公司/行业/标签/上次互动话题）"
        }
      ],
      "tags": ["标签1", "标签2"]
    }
  ],
  "contact_signals": [
    {
      "contact_name": "联系人名",
      "company": "公司名",
      "title": "新闻标题",
      "snippet": "摘要",
      "url": "链接",
      "relevance": "为什么和这个联系人相关"
    }
  ],
  "themes": ["本轮热点主题1", "热点主题2"],
  "closing": "一句话收尾"
}

Rules:
- 最多选 15 条高信号故事（从所有来源中筛选）
- "why" 必须结合用户的行业和联系人网络
- "action" 要具体：提到可以分享给的联系人类型或具体方向
- **related_contacts 是核心功能**：对每条 signal，检查用户联系人列表，找出最相关的 1-3 个联系人。匹配依据：
  1. 联系人的公司/行业与新闻领域重叠
  2. 联系人的标签(tags)与新闻标签匹配
  3. 上次互动话题与新闻主题相关
  4. 联系人的关系类型适合讨论这个话题
  如果确实没有相关联系人，related_contacts 返回空数组 []。绝不能编造不在用户联系人列表中的名字。
- contact_signals 是用户高等级联系人公司的最新动态，每条关联到具体联系人
- 如果同一条新闻在多个来源出现，合并为一条，source 列出所有来源
- 中文输出，简洁有力
- 如果没有特别相关的，诚实说"今天没有强相关信号"`;

// Parse RSS XML (minimal parser for <item><title><link><pubDate>)
function parseRssItems(xml, source, maxItems = 15) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) && items.length < maxItems) {
    const block = match[1];
    const title = (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1]?.trim() || '';
    const link = (block.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i) || [])[1]?.trim() || '';
    const pubDate = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1]?.trim() || '';
    if (title) items.push({ title, url: link, source, pubDate, points: 0 });
  }
  return items;
}

// ── Parse RSS <item> and Atom <entry> blocks (for custom user sources) ──

function parseRssAtomItems(xml, source, maxItems = 5) {
  const items = [];
  // RSS <item> blocks
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) && items.length < maxItems) {
    const block = match[1];
    const title = (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1]?.trim() || '';
    const link = (block.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i) || [])[1]?.trim() || '';
    const pubDate = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1]?.trim() || '';
    if (title) items.push({ title, url: link, source, pubDate, points: 0 });
  }
  // Atom <entry> blocks (link is in href attribute)
  if (items.length < maxItems) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) && items.length < maxItems) {
      const block = match[1];
      const title = (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1]?.trim() || '';
      const link = (block.match(/<link[^>]*href="([^"]*)"/i) || [])[1]?.trim() || '';
      const pubDate = (block.match(/<(?:published|updated)[^>]*>([\s\S]*?)<\/(?:published|updated)>/i) || [])[1]?.trim() || '';
      if (title) items.push({ title, url: link, source, pubDate, points: 0 });
    }
  }
  return items;
}

// ── Custom signal sources CRUD ──

const VALID_CUSTOM_DOMAINS = ['tech', 'ai', 'investment', 'business', 'general'];
const MAX_CUSTOM_SOURCES = 10;

async function handleGetCustomSources(req, env) {
  const userId = await getVerifiedUserId(req, env, {});
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };
  const raw = await env.USER_DATA.get(`signal_sources:${userId}`);
  const sources = raw ? JSON.parse(raw) : [];
  return { status: 200, data: { ok: true, sources } };
}

async function handleAddCustomSource(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };
  const { url, name, domain } = body;
  if (!url || typeof url !== 'string') return { status: 400, data: { error: 'url required' } };
  if (!name || typeof name !== 'string') return { status: 400, data: { error: 'name required' } };
  if (!isUrlAllowed(url)) return { status: 400, data: { error: 'URL not allowed (must be http/https, no localhost/private IPs)' } };
  const srcDomain = VALID_CUSTOM_DOMAINS.includes(domain) ? domain : 'general';

  const raw = await env.USER_DATA.get(`signal_sources:${userId}`);
  const sources = raw ? JSON.parse(raw) : [];
  if (sources.length >= MAX_CUSTOM_SOURCES) {
    return { status: 400, data: { error: `Maximum ${MAX_CUSTOM_SOURCES} custom sources allowed` } };
  }
  // Prevent duplicate URLs
  if (sources.some(s => s.url === url.trim())) {
    return { status: 400, data: { error: 'This URL is already added' } };
  }
  const newSource = {
    id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url: url.trim(),
    name: name.trim(),
    domain: srcDomain,
    enabled: true,
    added_at: new Date().toISOString().slice(0, 10),
  };
  sources.push(newSource);
  await env.USER_DATA.put(`signal_sources:${userId}`, JSON.stringify(sources));
  return { status: 200, data: { ok: true, source: newSource, sources } };
}

async function handleDeleteCustomSource(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };
  const { id } = body;
  if (!id) return { status: 400, data: { error: 'id required' } };
  const raw = await env.USER_DATA.get(`signal_sources:${userId}`);
  const sources = raw ? JSON.parse(raw) : [];
  const filtered = sources.filter(s => s.id !== id);
  await env.USER_DATA.put(`signal_sources:${userId}`, JSON.stringify(filtered));
  return { status: 200, data: { ok: true, sources: filtered } };
}

// ── Fetch custom user signal sources (RSS/Atom) ──

async function fetchCustomSignalSources(userId, env, userDomains) {
  if (!userId) return [];
  let sources = [];
  try {
    const raw = await env.USER_DATA.get(`signal_sources:${userId}`);
    if (raw) sources = JSON.parse(raw);
  } catch { return []; }
  const enabled = sources.filter(s => s.enabled);
  if (enabled.length === 0) return [];

  const results = await Promise.all(enabled.map(async (src) => {
    try {
      const resp = await fetch(src.url, {
        headers: { 'User-Agent': 'Welian/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) return [];
      const xml = await resp.text();
      return parseRssAtomItems(xml, src.name, 5).map(s => ({
        ...s,
        domains: [src.domain || 'general'],
      }));
    } catch (e) {
      console.error(`[custom_source] ${src.name} fetch error:`, e.message);
      return [];
    }
  }));
  return results.flat();
}

// ── Annual relationship report ──

async function handleAnnualReport(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  try {
    const contacts = await loadDataset(env, userId, 'contacts');
    const timeline = await loadDataset(env, userId, 'timeline');
    const todos = await loadDataset(env, userId, 'todos');
    const metrics = await loadMetrics(env, userId);

  const now = new Date();
  const year = now.getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  // Filter to this year's data
  const yearTimeline = timeline.filter(t => (t.date || '') >= yearStart && (t.date || '') <= yearEnd);
  const yearTodos = todos.filter(t => (t.created || t.date || '') >= yearStart);

  // Compute stats
  const contactInteractions = {};
  for (const t of yearTimeline) {
    const name = t.contact_name || t.contact || '';
    if (name) contactInteractions[name] = (contactInteractions[name] || 0) + 1;
  }

  // Top contacts by interaction count
  const topContacts = Object.entries(contactInteractions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Monthly distribution
  const monthlyDist = Array(12).fill(0);
  for (const t of yearTimeline) {
    const month = parseInt((t.date || '').slice(5, 7)) - 1;
    if (month >= 0 && month < 12) monthlyDist[month]++;
  }

  // New contacts this year (by created date if available, otherwise count all)
  const newContacts = contacts.filter(c => (c.created || c.created_at || '') >= yearStart).length;

  // Todo completion
  const completedTodos = yearTodos.filter(t => isTodoDone(t)).length;
  const totalTodos = yearTodos.length;
  const completionRate = totalTodos > 0 ? Math.round(completedTodos / totalTodos * 100) : 0;

  // Relationship health summary (reuse classification logic)
  const DAY = 86400000;
  let activeCount = 0, coolingCount = 0, dormantCount = 0;
  for (const c of contacts) {
    const nature = (c.nature || '').toLowerCase();
    if (nature === 'nurture') continue;
    const contactTimeline = timeline.filter(t => t.contact_name === c.name || t.contact === c.id);
    const lastTs = contactTimeline.length > 0
      ? Math.max(...contactTimeline.map(t => new Date(t.date || 0).getTime() || 0))
      : 0;
    const daysSince = lastTs > 0 ? Math.floor((now.getTime() - lastTs) / DAY) : 999;
    if (daysSince <= 30) activeCount++;
    else if (daysSince <= 90) coolingCount++;
    else dormantCount++;
  }

  // Weekly metrics aggregation
  const weeklyMetrics = metrics.weekly || {};
  let totalAdvise = 0, totalTodoCompleted = 0, totalInteractions = 0, totalDrafts = 0, totalSignalActions = 0;
  for (const wk of Object.keys(weeklyMetrics)) {
    if (wk.startsWith(String(year))) {
      const w = weeklyMetrics[wk];
      totalAdvise += w.advise_generated || 0;
      totalTodoCompleted += w.todo_completed || 0;
      totalInteractions += w.interaction_recorded || 0;
      totalDrafts += w.draft_generated || 0;
      totalSignalActions += w.signal_action || 0;
    }
  }

  // Build context for LLM
  const contextData = {
    year,
    summary: {
      total_contacts: contacts.length,
      new_contacts_this_year: newContacts,
      total_interactions: yearTimeline.length,
      completed_todos: completedTodos,
      total_todos: totalTodos,
      completion_rate: completionRate,
      active_relationships: activeCount,
      cooling_relationships: coolingCount,
      dormant_relationships: dormantCount,
      advise_generated: totalAdvise,
      drafts_generated: totalDrafts,
      signal_actions: totalSignalActions,
    },
    monthly_distribution: monthlyDist,
    top_contacts: topContacts,
    highlights: {
      busiest_month: monthlyDist.indexOf(Math.max(...monthlyDist)) + 1,
      quietest_month: (() => {
        const nonZero = monthlyDist.filter(m => m > 0);
        if (nonZero.length === 0) return 0;
        return monthlyDist.indexOf(Math.min(...nonZero)) + 1;
      })(),
    },
  };

  // Generate narrative via LLM
  const llmResp = await callLLM(
    JSON.stringify(contextData),
    `你是一个关系网络智能体。请根据用户${year}年的关系数据，生成一份温暖、有洞察力的年度关系报告。报告应包含：
1. 年度回顾（用2-3句话总结这一年的关系经营）
2. 关键数字（列出核心数据）
3. 关系健康度（活跃/冷却/休眠分布）
4. 年度高光时刻（互动最多的月份和联系人，用一段连贯的文字描述）
5. 成长轨迹（从进化指标看成长，用一段连贯的文字描述）
6. 明年建议（3条具体可执行的建议）
用中文，语气温暖但不过度煽情。JSON格式：{greeting(string), review(string), key_numbers[{label,value}], health{active,cooling,dormant}, highlights(string), growth(string), suggestions[](string数组)}
注意：highlights 和 growth 必须是字符串，不是对象。`,
    env,
    { max_tokens: 2048, temperature: 0.7, model_tier: 'standard' }
  );

  let report;
  if (llmResp && llmResp.text) {
    try {
      const jsonMatch = llmResp.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) report = JSON.parse(jsonMatch[0]);
      else report = { greeting: llmResp.text };
    } catch {
      report = { greeting: llmResp.text };
    }
  } else {
    report = {
      greeting: `${year}年度关系报告`,
      review: `这一年你记录了${yearTimeline.length}次互动，管理了${contacts.length}段关系。`,
      key_numbers: [
        { label: '总互动次数', value: yearTimeline.length },
        { label: '管理关系数', value: contacts.length },
        { label: '新增联系人', value: newContacts },
        { label: '待办完成率', value: `${completionRate}%` },
      ],
      health: { active: activeCount, cooling: coolingCount, dormant: dormantCount },
      highlights: `互动最频繁的月份是${contextData.highlights.busiest_month}月`,
      growth: `生成了${totalAdvise}条建议，${totalDrafts}条消息草稿`,
      suggestions: ['定期回顾冷却中的关系', '保持每月互动节奏', '关注休眠关系的重新激活'],
    };
  }

  // Attach raw stats
  report.raw_stats = contextData.summary;
  report.monthly_distribution = monthlyDist;
  report.top_contacts = topContacts;
  report.year = year;

  // Cache for 24 hours
    const cacheKey = `annual_cache:${userId}:${year}`;
    await env.USER_DATA.put(cacheKey, JSON.stringify({ ok: true, report }), { expirationTtl: 86400 });

    return { status: 200, data: { ok: true, report } };
  } catch (e) {
    console.error('[annual_report] Error:', e.message, e.stack);
    return { status: 500, data: { error: '年度报告生成失败', detail: e.message } };
  }
}

// ── Shared: fetch all signal sources in parallel ──
// userDomains controls which domain-filtered sources are fetched (pass all 5 for public preview)
async function fetchAllSignalSources(userDomains, userId = null, env = null) {
  const [hnStories, kr36Stories, huxiuStories, kr36FlashStories, jiqizhixinStories, wallstreetStories, bbtStories, toutiaoStories, weixinStories, producthuntStories, techcrunchStories, vergeStories, arxivStories, v2exStories, clsStories, sinaFinanceStories, csrcStories, githubStories, infoqStories, xueqiuStories, yicaiStories, redditMLStories, hfPapersStories] = await Promise.all([
    // Source 1: Hacker News (Algolia API) — general/ai/tech
    (async () => {
      try {
        const resp = await fetch('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30', {
          headers: { 'User-Agent': 'Welian/1.0' },
        });
        if (resp.ok) {
          const data = await resp.json();
          return (data.hits || []).map(h => ({
            title: h.title || h.story_title || '',
            url: h.url || h.story_url || '',
            source: 'HN',
            points: h.points || 0,
            comments: h.num_comments || 0,
            hn_url: `https://news.ycombinator.com/item?id=${h.objectID}`,
            domains: ['ai', 'tech_finance', 'general'],
          })).filter(s => s.title).slice(0, 12);
        }
      } catch (e) { console.error('HN fetch error:', e.message); }
      return [];
    })(),
    // Source 2: 36氪 RSS — tech_finance/general
    (async () => {
      try {
        const resp = await fetch('https://36kr.com/feed', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const xml = await resp.text();
          return parseRssItems(xml, '36氪', 8).map(s => ({ ...s, domains: ['tech_finance', 'general'] }));
        }
      } catch (e) { console.error('36kr fetch error:', e.message); }
      return [];
    })(),
    // Source 3: 虎嗅 RSS (via RSSHub) — general/tech_finance
    (async () => {
      try {
        const resp = await fetch('https://rsshub.rssforever.com/huxiu/article', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const xml = await resp.text();
          return parseRssItems(xml, '虎嗅', 8).map(s => ({ ...s, domains: ['tech_finance', 'general'] }));
        }
      } catch (e) { console.error('huxiu fetch error:', e.message); }
      return [];
    })(),
    // Source 3b: 36氪快讯 (via RSSHub) — tech_finance/general, faster newsflashes
    (async () => {
      try {
        const resp = await fetch('https://rsshub.rssforever.com/36kr/newsflashes', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const xml = await resp.text();
          return parseRssItems(xml, '36氪快讯', 10).map(s => ({ ...s, domains: ['tech_finance', 'general'] }));
        }
      } catch (e) { console.error('36kr newsflashes fetch error:', e.message); }
      return [];
    })(),
    // Source 4: 机器之心 RSS (via RSSHub) — ai
    (async () => {
      if (!userDomains.includes('ai')) return [];
      try {
        const resp = await fetch('https://rsshub.rssforever.com/jiqizhixin/article', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const xml = await resp.text();
          return parseRssItems(xml, '机器之心', 8).map(s => ({ ...s, domains: ['ai'] }));
        }
      } catch (e) { console.error('jiqizhixin fetch error:', e.message); }
      return [];
    })(),
    // Source 5: 华尔街见闻 RSS (via RSSHub) — investment
    (async () => {
      if (!userDomains.includes('investment')) return [];
      try {
        const resp = await fetch('https://rsshub.rssforever.com/wallstreetcn/news/global', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const xml = await resp.text();
          return parseRssItems(xml, '华尔街见闻', 10).map(s => ({ ...s, domains: ['investment'] }));
        }
      } catch (e) { console.error('wallstreetcn fetch error:', e.message); }
      return [];
    })(),
    // Source 6: 投资界/PE日报 RSS (via RSSHub) — investment
    (async () => {
      if (!userDomains.includes('investment')) return [];
      try {
        const resp = await fetch('https://rsshub.rssforever.com/pedaily/pe', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const xml = await resp.text();
          return parseRssItems(xml, '投资界', 10).map(s => ({ ...s, domains: ['investment'] }));
        }
      } catch (e) { console.error('pedaily fetch error:', e.message); }
      return [];
    })(),
    // Source 7: 头条热榜 (JSON API) — general/tech_finance
    (async () => {
      try {
        const resp = await fetch('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        });
        if (resp.ok) {
          const data = await resp.json();
          return (data.data || []).slice(0, 15).map(item => ({
            title: item.Title || '',
            url: item.Url || `https://www.toutiao.com/trending/${item.ClusterId}/`,
            source: '头条',
            points: Math.floor((item.HotValue || 0) / 1000000),
            domains: ['tech_finance', 'general'],
          })).filter(s => s.title);
        }
      } catch (e) { console.error('toutiao fetch error:', e.message); }
      return [];
    })(),
    // Source 8: 微信生态圈 (Tavily search on mp.weixin.qq.com — real WeChat公众号 articles)
    (async () => {
      try {
        // site:mp.weixin.qq.com ensures results are native WeChat公众号 articles, not reposts
        const r = await webSearch('site:mp.weixin.qq.com AI 科技 商业 金融', env, 10, 3);
        const results = (r?.results || []).slice(0, 10).map(item => ({
          title: item.title || '',
          url: item.url || '',
          source: '微信',
          points: 0,
          domains: ['ai', 'tech_finance', 'general'],
        })).filter(s => s.title && s.url.includes('mp.weixin.qq.com'));
        console.log(`[hn_signals] WeChat: ${results.length} articles from mp.weixin.qq.com`);
        return results;
      } catch (e) { console.error('weixin search error:', e.message); }
      return [];
    })(),
    // Source 9: Product Hunt (Atom RSS) — tech/ai, product launches
    (async () => {
      try {
        const resp = await fetch('https://www.producthunt.com/feed', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const xml = await resp.text();
          // Atom feed: <entry><title><link href><content>
          const items = [];
          const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
          let match;
          while ((match = entryRegex.exec(xml)) && items.length < 15) {
            const block = match[1];
            const title = (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1]?.trim() || '';
            const link = (block.match(/<link[^>]*href="([^"]+)"/i) || [])[1]?.trim() || '';
            if (title) items.push({ title, url: link, source: 'Product Hunt', points: 0, domains: ['ai', 'tech_finance', 'general'] });
          }
          return items;
        }
      } catch (e) { console.error('producthunt fetch error:', e.message); }
      return [];
    })(),
    // Source 10: TechCrunch (RSS) — tech_finance, VC/startup
    (async () => {
      try {
        const resp = await fetch('https://techcrunch.com/feed/', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const xml = await resp.text();
          return parseRssItems(xml, 'TechCrunch', 8).map(s => ({ ...s, domains: ['tech_finance', 'general'] }));
        }
      } catch (e) { console.error('techcrunch fetch error:', e.message); }
      return [];
    })(),
    // Source 11: The Verge (RSS) — tech/general, consumer tech
    (async () => {
      try {
        const resp = await fetch('https://www.theverge.com/rss/index.xml', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const xml = await resp.text();
          return parseRssItems(xml, 'The Verge', 8).map(s => ({ ...s, domains: ['tech_finance', 'general'] }));
        }
      } catch (e) { console.error('verge fetch error:', e.message); }
      return [];
    })(),
    // Source 12: ArXiv AI (Atom API) — ai, research papers
    (async () => {
      if (!userDomains.includes('ai')) return [];
      try {
        const resp = await fetch('http://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=10', {
          headers: { 'User-Agent': 'Welian/1.0' },
        });
        if (resp.ok) {
          const xml = await resp.text();
          // ArXiv uses Atom: <entry><title><summary><link href>
          const items = [];
          const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
          let match;
          while ((match = entryRegex.exec(xml)) && items.length < 10) {
            const block = match[1];
            const title = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || '';
            const link = (block.match(/<link[^>]*href="([^"]+)"/i) || [])[1]?.trim() || '';
            if (title) items.push({ title: title.replace(/\n/g, ' ').trim(), url: link, source: 'ArXiv', points: 0, domains: ['ai'] });
          }
          return items;
        }
      } catch (e) { console.error('arxiv fetch error:', e.message); }
      return [];
    })(),
    // Source 13: V2EX 热榜 (JSON API) — tech/general, developer community
    (async () => {
      try {
        const resp = await fetch('https://www.v2ex.com/api/topics/hot.json', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const data = await resp.json();
          return (data || []).slice(0, 15).map(t => ({
            title: t.title || '',
            url: `https://www.v2ex.com/t/${t.id}`,
            source: 'V2EX',
            points: t.replies || 0,
            domains: ['tech_finance', 'general'],
          })).filter(s => s.title);
        }
      } catch (e) { console.error('v2ex fetch error:', e.message); }
      return [];
    })(),
    // Source 14: 财联社电报 (via RSSHub) — investment, A股实时快讯
    (async () => {
      if (!userDomains.includes('investment') && !userDomains.includes('policy')) return [];
      try {
        const resp = await fetch('https://rsshub.rssforever.com/cls/telegraph', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const xml = await resp.text();
          return parseRssItems(xml, '财联社', 10).map(s => ({ ...s, domains: ['investment'] }));
        }
      } catch (e) { console.error('cls fetch error:', e.message); }
      return [];
    })(),
    // Source 15: 新浪财经 (RSS) — investment, A股/港股/银行
    (async () => {
      if (!userDomains.includes('investment')) return [];
      try {
        const resp = await fetch('https://rsshub.rssforever.com/sina/finance', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const xml = await resp.text();
          return parseRssItems(xml, '新浪财经', 8).map(s => ({ ...s, domains: ['investment'] }));
        }
      } catch (e) { console.error('sina finance fetch error:', e.message); }
      return [];
    })(),
    // Source 16: 证监会 (via RSSHub) — policy, 监管政策
    (async () => {
      if (!userDomains.includes('policy')) return [];
      try {
        const resp = await fetch('https://rsshub.rssforever.com/gov/zhengjianhui/bulletin', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const xml = await resp.text();
          return parseRssItems(xml, '证监会', 10).map(s => ({ ...s, domains: ['policy', 'investment'] }));
        }
      } catch (e) { console.error('csrc fetch error:', e.message); }
      return [];
    })(),
    // Source 17: GitHub Trending (HTML scrape) — ai/tech_finance, open source trends
    (async () => {
      try {
        const resp = await fetch('https://github.com/trending?since=daily', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const html = await resp.text();
          const items = [];
          const repoRegex = /<h2[^>]*>\s*<a href="\/([^"]+)"[^>]*>/g;
          let match;
          while ((match = repoRegex.exec(html)) && items.length < 15) {
            const repo = match[1];
            items.push({
              title: repo,
              url: `https://github.com/${repo}`,
              source: 'GitHub',
              points: 0,
              domains: ['ai', 'tech_finance', 'general'],
            });
          }
          return items;
        }
      } catch (e) { console.error('github trending fetch error:', e.message); }
      return [];
    })(),
    // Source 18: InfoQ 中文 (RSS) — ai/tech_finance, 架构/技术落地
    (async () => {
      if (!userDomains.includes('ai') && !userDomains.includes('tech_finance')) return [];
      try {
        const resp = await fetch('https://rsshub.rssforever.com/infoq/recommend', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const xml = await resp.text();
          return parseRssItems(xml, 'InfoQ', 8).map(s => ({ ...s, domains: ['ai', 'tech_finance'] }));
        }
      } catch (e) { console.error('infoq fetch error:', e.message); }
      return [];
    })(),
    // Source 19: 雪球热帖 (via RSSHub) — investment, A股投资社区
    (async () => {
      if (!userDomains.includes('investment')) return [];
      try {
        const resp = await fetch('https://rsshub.rssforever.com/xueqiu/trending', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const xml = await resp.text();
          return parseRssItems(xml, '雪球', 8).map(s => ({ ...s, domains: ['investment'] }));
        }
      } catch (e) { console.error('xueqiu fetch error:', e.message); }
      return [];
    })(),
    // Source 20: 第一财经 (RSS) — investment/tech_finance, 财经+科技交叉
    (async () => {
      if (!userDomains.includes('investment') && !userDomains.includes('tech_finance')) return [];
      try {
        const resp = await fetch('https://rsshub.rssforever.com/yicai/news', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const xml = await resp.text();
          return parseRssItems(xml, '第一财经', 8).map(s => ({ ...s, domains: ['investment', 'tech_finance'] }));
        }
      } catch (e) { console.error('yicai fetch error:', e.message); }
      return [];
    })(),
    // Source 21: Reddit r/MachineLearning (JSON API) — ai, 学术圈讨论
    (async () => {
      if (!userDomains.includes('ai')) return [];
      try {
        const resp = await fetch('https://www.reddit.com/r/MachineLearning/hot.json?limit=10', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const data = await resp.json();
          return (data.data?.children || []).slice(0, 10).map(p => ({
            title: p.data?.title || '',
            url: `https://www.reddit.com${p.data?.permalink || ''}`,
            source: 'Reddit ML',
            points: p.data?.score || 0,
            domains: ['ai'],
          })).filter(s => s.title);
        }
      } catch (e) { console.error('reddit ML fetch error:', e.message); }
      return [];
    })(),
    // Source 22: Hugging Face Daily Papers (HTML scrape) — ai, 精选AI论文
    (async () => {
      if (!userDomains.includes('ai')) return [];
      try {
        const resp = await fetch('https://huggingface.co/papers', { headers: { 'User-Agent': 'Welian/1.0' } });
        if (resp.ok) {
          const html = await resp.text();
          const items = [];
          const paperRegex = /<a href="\/papers\/([^"]+)"[^>]*>/g;
          const seen = new Set();
          let match;
          while ((match = paperRegex.exec(html)) && items.length < 10) {
            const paperId = match[1];
            if (seen.has(paperId)) continue;
            seen.add(paperId);
            items.push({
              title: paperId,
              url: `https://huggingface.co/papers/${paperId}`,
              source: 'HuggingFace',
              points: 0,
              domains: ['ai'],
            });
          }
          return items;
        }
      } catch (e) { console.error('huggingface papers fetch error:', e.message); }
      return [];
    })(),
  ]);

  // Merge and filter by user's domain preferences
  let allStories = [...hnStories, ...kr36Stories, ...huxiuStories, ...kr36FlashStories, ...jiqizhixinStories, ...wallstreetStories, ...bbtStories, ...toutiaoStories, ...weixinStories, ...producthuntStories, ...techcrunchStories, ...vergeStories, ...arxivStories, ...v2exStories, ...clsStories, ...sinaFinanceStories, ...csrcStories, ...githubStories, ...infoqStories, ...xueqiuStories, ...yicaiStories, ...redditMLStories, ...hfPapersStories];

  // Fetch custom user sources (if authenticated) — failures don't block main flow
  if (userId && env) {
    try {
      const customStories = await fetchCustomSignalSources(userId, env, userDomains);
      allStories = allStories.concat(customStories);
    } catch (e) {
      console.error('[custom_sources] merge error:', e.message);
    }
  }

  allStories = allStories.filter(s => {
    if (!s.domains || s.domains.length === 0) return true;
    return s.domains.some(d => userDomains.includes(d) || d === 'general');
  });

  return allStories;
}

async function handleHnSignals(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  // Cache: same-day cache (25h TTL), bypass with refresh=1
  const todayKey = new Date().toISOString().slice(0, 10);
  const cacheKey = `hn_signals:${userId}:${todayKey}`;
  if (!body.refresh) {
    const cached = await env.USER_DATA.get(cacheKey);
    if (cached) {
      return { status: 200, data: JSON.parse(cached) };
    }
  }

  // ── Load user signal domain preferences ──
  let userDomains = ['investment', 'ai', 'tech_finance']; // default: three core domains
  try {
    const domainsRaw = await env.USER_DATA.get(`signal_domains:${userId}`);
    if (domainsRaw) userDomains = JSON.parse(domainsRaw);
  } catch { /* domain prefs optional */ }

  // ── Fetch from all sources ──
  const allStories = await fetchAllSignalSources(userDomains, userId, env);

  if (allStories.length === 0) {
    return { status: 200, data: { ok: true, report: { greeting: '今天暂时无法获取新闻数据', signals: [], contact_signals: [], themes: [], closing: '稍后再试' }, raw_data: { stories: [] } } };
  }

  // ── Load user context for personalization ──
  const contacts = await loadDataset(env, userId, 'contacts');
  const timeline = await loadDataset(env, userId, 'timeline');
  const todos = await loadDataset(env, userId, 'todos');

  // Load user profile for industry personalization
  let userProfile = null;
  try {
    const profileRaw = await env.USER_DATA.get(`profile:${userId}`);
    if (profileRaw) userProfile = JSON.parse(profileRaw);
  } catch { /* profile optional */ }

  const industry = userProfile?.industry || userProfile?.occupation || '';
  const focusAreas = userProfile?.focus_areas || '';
  const careerGoal = userProfile?.career_goal || '';

  // Build user context summary — include enough detail for LLM to map signals to contacts
  const topContacts = contacts.slice(0, 30).map(c => {
    // Find last interaction with this contact for context
    const contactTimeline = timeline.filter(t => t.contact === c.id || t.contact_name === c.name);
    const lastInteraction = contactTimeline.length > 0
      ? contactTimeline[contactTimeline.length - 1]
      : null;
    return {
      name: c.name, relation: c.relation || '', sub_relation: c.sub_relation || '',
      company: c.company || '', title: c.title || '',
      tags: (c.tags || []).slice(0, 5),
      nature: c.nature || '',
      last_interaction: lastInteraction ? (lastInteraction.summary || lastInteraction.action || '').substring(0, 60) : null,
    };
  });
  const recentTimeline = timeline.slice(-10).map(t => ({
    contact: t.contact || '', summary: (t.summary || t.action || '').substring(0, 80),
  }));
  const pendingTodos = todos.filter(t => !isTodoDone(t)).slice(0, 5).map(t => ({
    task: (t.task || '').substring(0, 80), contact: t.contact || '',
  }));

  const userContext = JSON.stringify({
    profile: { industry, focus_areas: focusAreas, career_goal: careerGoal },
    contacts: topContacts,
    recent_interactions: recentTimeline,
    pending_todos: pendingTodos,
    contact_count: contacts.length,
  });

  // ── Source 4: Tavily search for top contacts' companies (last 7 days only) ──
  let contactSearchResults = [];
  try {
    // Get top 3 contacts with company names (prefer leverage/dual, fallback to any with company)
    const leverageContacts = contacts
      .filter(c => (c.nature === 'leverage' || c.nature === 'dual' || c.nature === '双重') && c.company && c.company.length >= 2)
      .slice(0, 3);
    // If not enough leverage contacts, fill with any contacts that have company
    const otherContactsWithCompany = contacts
      .filter(c => !leverageContacts.includes(c) && c.company && c.company.length >= 2)
      .slice(0, 3 - leverageContacts.length);
    const searchContacts = [...leverageContacts, ...otherContactsWithCompany];
    console.log(`[hn_signals] Contact search: ${searchContacts.length} contacts (leverage: ${leverageContacts.length})`);

    // Time filter: only keep results from last 7 days
    const nowMs = Date.now();
    const SEVEN_DAYS_MS = 7 * 86400000;

    if (searchContacts.length > 0) {
      const searchPromises = searchContacts.map(c =>
        // Search for company's own news only — exact company name + company event keywords
        // Tavily doesn't support OR syntax, so use natural query that targets company-specific events
        webSearch(`"${c.company}" 融资 OR 收购 OR 发布会 OR 财报 OR 人事变动 OR 战略合作 OR 新产品 OR 上线`, env, 8, 7).then(r => {
          const allResults = r?.results || [];
          // Strict 7-day filter: drop results without date or with old date
          const recentResults = allResults.filter(res => {
            if (!res.published_date) return false; // no date → drop (can't verify recency)
            const pubMs = new Date(res.published_date).getTime();
            if (isNaN(pubMs)) return false; // unparseable → drop
            return pubMs > nowMs - SEVEN_DAYS_MS;
          });
          // Take top 2 after filtering
          const topResults = recentResults.slice(0, 2);
          console.log(`[hn_signals] Search for ${c.name} (${c.company}): ${allResults.length} results → ${topResults.length} after strict 7-day filter via ${r?.provider || 'none'}`);
          return {
            contact_name: c.name,
            company: c.company,
            results: topResults,
          };
        }).catch((e) => {
          console.error(`[hn_signals] Search failed for ${c.company}:`, e.message);
          return { contact_name: c.name, company: c.company, results: [] };
        })
      );
      contactSearchResults = await Promise.all(searchPromises);
    }
  } catch (e) {
    console.error('Contact search error:', e.message);
  }

  // Format contact search results for LLM — only contacts with recent results
  const contactSearchText = contactSearchResults
    .filter(r => r.results.length > 0)
    .map(r => {
      const topResult = r.results[0];
      const dateHint = topResult.published_date ? ` (${topResult.published_date.slice(0, 10)})` : '';
      return `联系人: ${r.contact_name} (${r.company})\n  新闻: ${topResult.title}${dateHint}\n  摘要: ${(topResult.snippet || '').substring(0, 200)}\n  链接: ${topResult.url}`;
    }).join('\n');

  // Format all stories for LLM
  const storiesText = allStories.map((s, i) => {
    const pts = s.points ? ` [${s.points}pts]` : '';
    const hnUrl = s.hn_url ? `\n   HN: ${s.hn_url}` : '';
    return `${i + 1}. ${pts} [${s.source}] ${s.title}\n   URL: ${s.url || '(no url)'}${hnUrl}`;
  }).join('\n');

  const industryDesc = industry || focusAreas || '金融科技/银行/支付';

  const prompt = `Today's news from multiple sources (Hacker News, 36氪, 36氪快讯, 虎嗅, 头条, 微信, 机器之心, 华尔街见闻, 投资界, Product Hunt, TechCrunch, The Verge, ArXiv, V2EX, 财联社, 新浪财经, 证监会, GitHub, InfoQ, 雪球, 第一财经, Reddit ML, HuggingFace):
${storiesText}

${contactSearchText ? `\nUser's key contacts' company news (from web search):\n${contactSearchText}\n` : ''}
User context (profile, contacts, recent interactions, pending todos):
${userContext}

From all these sources, select the ones most relevant to this user. The user works in ${industryDesc}${careerGoal ? ` and their career goal is: ${careerGoal}` : ''}. They have ${contacts.length} contacts shown above.

CRITICAL: For each signal, you MUST check the user's contact list and identify which contacts are most relevant to this news. Put them in related_contacts with a specific reason based on the contact's company, industry, tags, or recent interaction topics. This is the key value of Welian — connecting external news to the user's specific relationship network.

Generate personalized signals that connect news to their professional network and relationship goals. For contact_signals, use the web search results about their contacts' companies.`;

  // Use enhanced tier (claude-sonnet) for signals — complex nested JSON needs stronger model
  const llmResp = await callLLM(prompt, await getPrompt(env, 'hn_signals', HN_SIGNALS_SYSTEM), env, { max_tokens: 4096, temperature: 0.7, model_tier: 'enhanced' });

  let report;
  if (llmResp && llmResp.text) {
    try {
      let cleaned = llmResp.text.trim();
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      report = JSON.parse(cleaned);
    } catch (e) {
      // Try to fix common JSON issues: trailing commas, truncated output
      try {
        let fixed = llmResp.text.trim();
        if (fixed.startsWith('```')) fixed = fixed.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        // Remove trailing commas before } or ]
        fixed = fixed.replace(/,\s*([}\]])/g, '$1');
        // If truncated, try to close open arrays/objects
        const openBraces = (fixed.match(/{/g) || []).length;
        const closeBraces = (fixed.match(/}/g) || []).length;
        const openBrackets = (fixed.match(/\[/g) || []).length;
        const closeBrackets = (fixed.match(/\]/g) || []).length;
        if (openBraces > closeBraces) fixed += '}'.repeat(openBraces - closeBraces);
        if (openBrackets > closeBrackets) fixed += ']'.repeat(openBrackets - closeBrackets);
        report = JSON.parse(fixed);
        console.log('[hn_signals] JSON parsed after fix');
      } catch (e2) {
        report = { greeting: '今日信号', signals: [], contact_signals: [], themes: [], closing: '解析失败，稍后再试', raw: llmResp.text.substring(0, 500) };
      }
    }
  } else {
    report = { greeting: '今日信号', signals: [], contact_signals: [], themes: [], closing: '生成失败，稍后再试' };
  }

  // Fallback: if LLM didn't generate contact_signals, build from raw search results
  if (!report.contact_signals || report.contact_signals.length === 0) {
    report.contact_signals = contactSearchResults
      .filter(r => r.results.length > 0)
      .map(r => ({
        contact_name: r.contact_name,
        company: r.company,
        title: r.results[0].title || '',
        snippet: (r.results[0].snippet || '').substring(0, 200),
        url: r.results[0].url || '',
        relevance: '',
      }));
    console.log(`[hn_signals] Built ${report.contact_signals.length} contact_signals from raw search (LLM fallback)`);
  }

  // Deduct billing (unified)
  if (llmResp && llmResp.usage) {
    await deductBilling(env, userId, llmResp.usage, 'hn_signals');
  }

  const resultData = { ok: true, report, raw_data: { stories: allStories, contact_search: contactSearchResults, generated_at: new Date().toISOString() } };
  await env.USER_DATA.put(cacheKey, JSON.stringify(resultData), { expirationTtl: 90000 });
  return { status: 200, data: resultData };
}

// ── Public signals preview (no auth, no personalization, 6h cache) ──

async function handleSignalsPreview(req, env) {
  // Cache: 6 hour TTL, shared across all users
  const cacheKey = `signals_preview:${new Date().toISOString().slice(0, 13)}`; // hour-level key
  const cached = await env.USER_DATA.get(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    // Don't serve cached empty results — regenerate
    if (parsed.report?.signals?.length > 0) {
      // Ensure daily snapshot exists even on cache hit
      const todayKey = new Date().toISOString().slice(0, 10);
      const existing = await env.USER_DATA.get(`signals_history:${todayKey}`);
      if (!existing) {
        await env.USER_DATA.put(`signals_history:${todayKey}`, JSON.stringify({
          date: todayKey,
          greeting: parsed.report.greeting || '',
          signals: parsed.report.signals,
          themes: parsed.report.themes || [],
          closing: parsed.report.closing || '',
        }), { expirationTtl: 2592000 });
      }
      return { status: 200, data: parsed };
    }
  }

  // Fetch from ALL sources (same as personalized mode, but no user context filtering)
  const allDomains = ['investment', 'ai', 'tech_finance'];
  const allStories = await fetchAllSignalSources(allDomains);

  if (allStories.length === 0) {
    // All news sources failed — try yesterday's snapshot as fallback
    const yesterdayKey = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const yesterdaySnapshot = await env.USER_DATA.get(`signals_history:${yesterdayKey}`);
    if (yesterdaySnapshot) {
      const parsed = JSON.parse(yesterdaySnapshot);
      return { status: 200, data: { ok: true, report: parsed, generated_at: new Date().toISOString(), fallback: true } };
    }
    return { status: 200, data: { ok: true, report: { greeting: '今天暂时无法获取新闻数据', signals: [], themes: [], closing: '稍后再试' } } };
  }

  const storiesText = allStories.map((s, i) => {
    const pts = s.points ? ` [${s.points}pts]` : '';
    return `${i + 1}. ${pts} [${s.source}] ${s.title}\n   URL: ${s.url || '(no url)'}`;
  }).join('\n');

  const previewSystem = `You are Welian (小维), generating a public high-signal briefing from multiple news sources. This is a PUBLIC daily briefing — focus ONLY on high-signal stories, NOT personalized to any user.

IMPORTANT: Return ONLY a valid JSON object. No markdown, no code fences.

Return JSON:
{
  "greeting": "一句话开场",
  "signals": [
    {
      "title": "标题（中文）",
      "url": "原始链接",
      "source": "来源（HN/36氪/36氪快讯/虎嗅/头条/微信/机器之心/华尔街见闻/投资界/Product Hunt/TechCrunch/The Verge/ArXiv/V2EX/财联社/新浪财经/证监会/GitHub/InfoQ/雪球/第一财经/Reddit ML/HuggingFace）",
      "points": 分数或0,
      "value_score": 1到10的整数,
      "why": "为什么值得关注（面向广泛读者，不关联特定行业或联系人）",
      "tags": ["标签1", "标签2"]
    }
  ],
  "themes": ["热点主题1", "热点主题2"],
  "closing": "一句话收尾，引导用户登录 welian.app 获取个性化信号"
}

Rules:
- 最多选 15 条高信号故事（从所有来源中筛选最具广泛影响力的）
- 高信号标准：重大融资/收购、政策监管变化、技术突破、行业趋势转折点、重大产品发布
- **按价值高低排序**：signals 数组第 1 条最重要，第 15 条最不重要
- value_score 评分维度（1-10）：
  · 影响范围（40%）：全球/全行业=高分，单一公司=低分
  · 不可逆性（30%）：政策定调/并购完成=高分，产品发布/融资=中分
  · 时效性（20%）：当天首发/突发=高分，持续讨论=低分
  · 独家性（10%）：多源印证=高分，单源=低分
- 不关联特定用户行业或联系人——这是面向公众的通用高信号简报
- 如果同一条新闻在多个来源出现，合并为一条，source 列出所有来源
- 中文输出，简洁有力
- closing 要引导用户登录获取个性化信号（如"登录 welian.app 查看结合你关系网络的个性化信号"）`;

  const prompt = `Today's news from multiple sources (Hacker News, 36氪, 36氪快讯, 虎嗅, 头条, 微信, 机器之心, 华尔街见闻, 投资界, Product Hunt, TechCrunch, The Verge, ArXiv, V2EX, 财联社, 新浪财经, 证监会, GitHub, InfoQ, 雪球, 第一财经, Reddit ML, HuggingFace):
${storiesText}

Select the 15 most important and high-signal stories. Focus on: major funding/acquisitions, policy/regulatory changes, tech breakthroughs, industry trend shifts, major product launches. Generate a public high-signal briefing.`;

  const llmResp = await callLLM(prompt, previewSystem, env, { max_tokens: 8000, temperature: 0.7 });

  let report;
  if (llmResp && llmResp.text) {
    try {
      let cleaned = llmResp.text.trim();
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      report = JSON.parse(cleaned);
    } catch (e) {
      report = null; // will use fallback below
    }
  }

  // Fallback: if LLM failed or returned empty signals, build report from raw stories
  if (!report || !report.signals || report.signals.length === 0) {
    console.log('[signals_preview] LLM failed, using fallback. llmResp:', llmResp ? 'has text' : 'null');
    // Source priority weights — ensure Chinese sources aren't drowned out by HN points
    const sourcePriority = {
      '财联社': 100, '华尔街见闻': 95, '36氪快讯': 90, '新浪财经': 85, '第一财经': 85,
      '证监会': 80, '雪球': 75, '投资界': 70, '36氪': 65, '虎嗅': 60, 'InfoQ': 60,
      '机器之心': 55, '头条': 50, '微信': 50,
      'TechCrunch': 45, 'The Verge': 40, 'Product Hunt': 35,
      'GitHub': 30, 'HuggingFace': 30, 'ArXiv': 25, 'Reddit ML': 25,
      'HN': 20, 'V2EX': 15,
    };
    const fallbackSignals = allStories
      .map(s => ({
        ...s,
        // Composite score: source priority + points (normalized)
        _score: (sourcePriority[s.source] || 10) + Math.min(s.points || 0, 50),
      }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 15)
      .map(s => ({
        title: s.title,
        url: s.url || '',
        source: s.source,
        points: s.points || 0,
        why: s.source === 'HN' ? `HN ${s.points}分热帖` : `${s.source}头条`,
        tags: [],
      }));
    report = {
      greeting: '今日信号',
      signals: fallbackSignals,
      themes: [],
      closing: '登录 welian.app 获取个性化信号',
    };
  }

  const resultData = { ok: true, report, generated_at: new Date().toISOString() };
  await env.USER_DATA.put(cacheKey, JSON.stringify(resultData), { expirationTtl: 21600 }); // 6 hours

  // Also save daily snapshot for history (30-day TTL) — only if not already saved today
  const todayKey = new Date().toISOString().slice(0, 10);
  const existingSnapshot = await env.USER_DATA.get(`signals_history:${todayKey}`);
  if (!existingSnapshot && report.signals && report.signals.length > 0) {
    await env.USER_DATA.put(`signals_history:${todayKey}`, JSON.stringify({
      date: todayKey,
      greeting: report.greeting || '',
      signals: report.signals,
      themes: report.themes || [],
      closing: report.closing || '',
    }), { expirationTtl: 2592000 }); // 30 days
  }

  return { status: 200, data: resultData };
}

// ── Public signals history (no auth, last 7 days) ──

async function handleSignalsHistory(req, env) {
  const days = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const dateKey = d.toISOString().slice(0, 10);
    const raw = await env.USER_DATA.get(`signals_history:${dateKey}`);
    if (raw) {
      days.push(JSON.parse(raw));
    }
  }
  // Build weekly theme aggregation
  const themeCount = {};
  days.forEach(d => {
    (d.themes || []).forEach(t => {
      themeCount[t] = (themeCount[t] || 0) + 1;
    });
  });
  const weeklyThemes = Object.entries(themeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([theme, count]) => ({ theme, count }));

  return { status: 200, data: { ok: true, days, weekly_themes: weeklyThemes } };
}

// ── Contact web search: search a contact's recent public activity ──

async function handleContactWebSearch(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  const { contact_name, company } = body;
  if (!contact_name) return { status: 400, data: { error: 'contact_name required' } };

  // Build search query: name + company for better precision
  const query = company
    ? `"${contact_name}" ${company}`
    : `"${contact_name}"`;

  // Cache: 24h per user+contact (avoids re-searching same person repeatedly)
  const cacheKey = `contact_search:${userId}:${contact_name}`;
  const cached = await env.USER_DATA.get(cacheKey);
  if (cached) {
    return { status: 200, data: JSON.parse(cached) };
  }

  // Use Tavily for AI-optimized results
  const results = await webSearch(query, env, 5);

  if (!results || !results.results || results.results.length === 0) {
    const emptyData = { ok: true, results: [], query, message: 'No public results found' };
    await env.USER_DATA.put(cacheKey, JSON.stringify(emptyData), { expirationTtl: 86400 });
    return { status: 200, data: emptyData };
  }

  // Format results
  const formatted = results.results.map(r => ({
    title: r.title || '',
    snippet: (r.snippet || '').substring(0, 300),
    url: r.url || '',
  }));

  const resultData = { ok: true, results: formatted, query, provider: results.provider };
  await env.USER_DATA.put(cacheKey, JSON.stringify(resultData), { expirationTtl: 86400 });

  // Deduct a small billing for the search (1 point)
  await deductBilling(env, userId, { input_tokens: 0, output_tokens: 0 }, 'contact_search', `web search ${contact_name}`);

  return { status: 200, data: resultData };
}

// ── Onboarding: batch create contacts with nature ──

async function handleOnboardingCreateContacts(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  const people = body.people; // [{name, nature: 'leverage'|'nurture'|'dual', relationship: '朋友/家人/合作者'}]
  if (!Array.isArray(people) || people.length === 0) {
    return { status: 400, data: { error: 'people array required' } };
  }
  if (people.length > 10) {
    return { status: 400, data: { error: 'Max 10 contacts per onboarding' } };
  }

  const contacts = await loadDataset(env, userId, 'contacts');

  const created = [];
  for (const p of people) {
    if (!p.name || typeof p.name !== 'string') continue;
    const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const contact = {
      id,
      name: p.name,
      nature: p.nature || '',
      relationship: p.relationship || '',
      strength: p.nature === 'nurture' ? 5 : (p.nature === 'leverage' ? 4 : 3),
      important_dates: [],
      memories: [],
      tags: [p.relationship].filter(Boolean),
      created_at: new Date().toISOString(),
      created_by: 'onboarding',
    };
    contacts.push(contact);
    created.push(contact);
  }

  await saveDataset(env, userId, 'contacts', contacts);

  // Send welcome email on first onboarding (async, don't block)
  if (contacts.length === created.length) {
    getUserEmailFromClerk(env, userId).then(email => {
      if (email) sendWelcomeEmail(env, email);
    }).catch(e => console.log('[email] welcome send failed:', e.message));
  }

  // P0-3: Immediate value delivery — generate first advise right after onboarding
  let firstAdvise = null;
  try {
    // Build a minimal advise from the just-created contacts (no timeline/todos yet)
    const today = localDate(req);
    const leverageCandidates = created.filter(c => c.nature === 'leverage' || c.nature === 'dual' || c.nature === '双重');
    const nurtureContacts = created.filter(c => c.nature === 'nurture' || c.nature === 'dual' || c.nature === '双重');

    const parts = [];
    if (leverageCandidates.length > 0) {
      parts.push(`💡 这周值得联系的人（${leverageCandidates.length}位）\n`);
      for (const c of leverageCandidates.slice(0, 5)) {
        parts.push(`⚪ ${c.name} — 刚加入你的关系网络${c.relationship ? `（${c.relationship}）` : ''}\n   建议主动打个招呼，聊聊近况`);
      }
    }
    if (nurtureContacts.length > 0) {
      parts.push('\n💛 值得记得的人\n');
      for (const c of nurtureContacts.slice(0, 5)) {
        parts.push(`  · ${c.name}${c.relationship ? `（${c.relationship}）` : ''} — 记得用心保持联系`);
      }
    }
    if (parts.length > 0) {
      const llmResp = await callLLM(parts.join('\n'), await getPrompt(env, 'advise', ADVISE_SYSTEM), env);
      firstAdvise = llmResp ? llmResp.text : parts.join('\n');
      // Register advise for adoption tracking
      await registerAdvise(env, userId);
    }
  } catch (e) {
    console.log('[onboarding] first advise generation failed:', e.message);
  }

  return { status: 200, data: { ok: true, created: created.map(c => ({ id: c.id, name: c.name, nature: c.nature })), first_advise: firstAdvise } };
}

// ── Relationship health: AI-powered cooling/warming/dormant classification ──

async function handleRelationshipHealth(req, env) {
  const userId = await getVerifiedUserId(req, env, {});
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  const contacts = await loadDataset(env, userId, 'contacts');
  const timeline = await loadDataset(env, userId, 'timeline');

  const now = Date.now();
  const DAY = 86400000;

  // Classify each leverage/dual contact
  const classifications = [];
  for (const c of contacts) {
    const nature = (c.nature || '').toLowerCase();
    if (nature === 'nurture') continue; // skip nurture — ethical boundary

    // Find last interaction with this contact
    const contactTimeline = timeline.filter(t => t.contact === c.id || t.contact_name === c.name);
    const lastTs = contactTimeline.length > 0
      ? Math.max(...contactTimeline.map(t => new Date(t.date || t.created || 0).getTime() || 0))
      : 0;
    const daysSince = lastTs > 0 ? Math.floor((now - lastTs) / DAY) : -1; // -1 = never

    // Interaction frequency: interactions in last 90 days
    const recent90 = contactTimeline.filter(t => {
      const ts = new Date(t.date || t.created || 0).getTime() || 0;
      return ts > now - 90 * DAY;
    }).length;

    // Classify: cooling / warming / dormant / active / new
    let status = 'active';
    let urgency = 0;
    let recommendation = '';

    if (daysSince < 0) {
      status = 'new';
      recommendation = '尚未互动，建议尽快建立首次联系';
    } else if (daysSince <= 14) {
      status = 'active';
      recommendation = recent90 >= 3 ? '关系热络，保持节奏' : '近期有互动，建议加深交流';
    } else if (daysSince <= 45) {
      status = 'cooling';
      urgency = 2;
      recommendation = `已 ${daysSince} 天未联系，建议找个自然切入点重新互动`;
    } else if (daysSince <= 90) {
      status = 'cooling';
      urgency = 3;
      recommendation = `已 ${daysSince} 天未联系，需要主动破冰`;
    } else if (daysSince <= 180) {
      status = 'dormant';
      urgency = 4;
      recommendation = `已 ${daysSince} 天未联系，关系可能休眠，需要重新激活`;
    } else {
      status = 'dormant';
      urgency = 5;
      recommendation = `已 ${daysSince} 天未联系，关系大概率已冷，需要重大契机重新连接`;
    }

    // Warming: was dormant/cooling but had recent interaction
    if (daysSince <= 14 && recent90 >= 2) {
      const prev90 = contactTimeline.filter(t => {
        const ts = new Date(t.date || t.created || 0).getTime() || 0;
        return ts > now - 180 * DAY && ts <= now - 90 * DAY;
      }).length;
      if (prev90 === 0) {
        status = 'warming';
        urgency = 0;
        recommendation = '关系正在升温，趁热打铁加深连接';
      }
    }

    classifications.push({
      contact_id: c.id,
      name: c.name,
      company: c.company || '',
      nature: c.nature || 'leverage',
      status,
      urgency,
      days_since: daysSince,
      recent_interactions_90d: recent90,
      recommendation,
    });
  }

  // Sort by urgency (highest first)
  classifications.sort((a, b) => b.urgency - a.urgency);

  // Summary stats
  const summary = {
    total: classifications.length,
    active: classifications.filter(c => c.status === 'active').length,
    warming: classifications.filter(c => c.status === 'warming').length,
    cooling: classifications.filter(c => c.status === 'cooling').length,
    dormant: classifications.filter(c => c.status === 'dormant').length,
    new: classifications.filter(c => c.status === 'new').length,
  };

  // Top priorities (urgency >= 3)
  const priorities = classifications.filter(c => c.urgency >= 3).slice(0, 10);

  return {
    status: 200,
    data: {
      ok: true,
      summary,
      classifications,
      priorities,
    },
  };
}

// ── Push poll: bot picks up queued messages ──

async function handlePushPoll(req, env) {
  const body = await req.json().catch(() => ({}));
  // Auth: bot uses sync secret
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  if (!token || !token.includes(':') || !token.startsWith('wechat_')) {
    return { status: 401, data: { error: 'Bot auth required' } };
  }
  const wechatId = token.split(':')[0];
  const clerkUserId = await env.USER_DATA.get(`wechat_bind:${wechatId}`);
  if (!clerkUserId) {
    return { status: 200, data: { messages: [] } };
  }

  // Check push queue
  const queueRaw = await env.USER_DATA.get(`push_queue:${clerkUserId}`);
  if (!queueRaw) {
    return { status: 200, data: { messages: [] } };
  }

  const queue = JSON.parse(queueRaw);
  // Clear queue after pickup
  await env.USER_DATA.delete(`push_queue:${clerkUserId}`);

  return { status: 200, data: { messages: queue } };
}

// ── Push a message to all IM channels bound by a user ──

async function pushToIMChannels(env, clerkUserId, text) {
  // Find all IM platforms this user has bound
  const imPrefix = `im_user:${clerkUserId}:`;
  const listResult = await env.USER_DATA.list({ prefix: imPrefix });
  if (listResult.keys.length === 0) return;

  for (const key of listResult.keys) {
    // key.name = "im_user:<clerkUserId>:<platform>"
    const platform = key.name.replace(imPrefix, '');
    const raw = await env.USER_DATA.get(key.name);
    if (!raw) continue;

    // Parse binding info (new format: JSON, old format: plain string)
    let chatId = '';
    try {
      const parsed = JSON.parse(raw);
      chatId = parsed.chat_id || '';
    } catch {
      chatId = raw; // old format: scoped_id (no chat_id — can't push)
    }
    if (!chatId) continue;

    try {
      const adapter = platform === 'telegram' ? telegramAdapter
        : platform === 'feishu' ? feishuAdapter
        : platform === 'dingtalk' ? dingtalkAdapter
        : null;
      if (!adapter) continue;

      await adapter.sendReply(env, { chatId, text, platform });
      console.log(`[im_push] ${platform} push sent to ${clerkUserId}`);
    } catch (e) {
      console.error(`[im_push] ${platform} failed for ${clerkUserId}:`, e.message);
    }
  }
}

// ── Biweekly health warning push: check relationship health for all bound users ──

async function handleHealthWarningPush(env) {
  console.log('[health_warning] Starting biweekly health warning push');

  // Find all bound users (WeChat + IM)
  const wechatList = await env.USER_DATA.list({ prefix: 'wechat_bind:' });
  const imList = await env.USER_DATA.list({ prefix: 'im_user:' });

  // Collect unique clerk user IDs
  const userIds = new Set();
  for (const key of wechatList.keys) {
    const clerkUserId = await env.USER_DATA.get(key.name);
    if (clerkUserId) userIds.add(clerkUserId);
  }
  for (const key of imList.keys) {
    // key.name = "im_user:<clerkUserId>:<platform>"
    const clerkUserId = key.name.split(':')[1];
    if (clerkUserId) userIds.add(clerkUserId);
  }

  for (const clerkUserId of userIds) {
    try {
      const contacts = await loadDataset(env, clerkUserId, 'contacts');
      const timeline = await loadDataset(env, clerkUserId, 'timeline');

      if (contacts.length === 0) continue;

      // Reuse health classification logic (inline to avoid auth overhead)
      const now = Date.now();
      const DAY = 86400000;
      const classifications = [];

      for (const c of contacts) {
        const nature = (c.nature || '').toLowerCase();
        if (nature === 'nurture') continue; // ethical boundary

        const contactTimeline = timeline.filter(t => t.contact === c.id || t.contact_name === c.name);
        const lastTs = contactTimeline.length > 0
          ? Math.max(...contactTimeline.map(t => new Date(t.date || t.created || 0).getTime() || 0))
          : 0;
        const daysSince = lastTs > 0 ? Math.floor((now - lastTs) / DAY) : -1;

        let status = 'active';
        let urgency = 0;

        if (daysSince < 0) {
          status = 'new';
        } else if (daysSince <= 14) {
          status = 'active';
        } else if (daysSince <= 45) {
          status = 'cooling'; urgency = 2;
        } else if (daysSince <= 90) {
          status = 'cooling'; urgency = 3;
        } else if (daysSince <= 180) {
          status = 'dormant'; urgency = 4;
        } else {
          status = 'dormant'; urgency = 5;
        }

        // Warming detection
        if (daysSince <= 14) {
          const recent90 = contactTimeline.filter(t => {
            const ts = new Date(t.date || t.created || 0).getTime() || 0;
            return ts > now - 90 * DAY;
          }).length;
          if (recent90 >= 2) {
            const prev90 = contactTimeline.filter(t => {
              const ts = new Date(t.date || t.created || 0).getTime() || 0;
              return ts > now - 180 * DAY && ts <= now - 90 * DAY;
            }).length;
            if (prev90 === 0) {
              status = 'warming'; urgency = 0;
            }
          }
        }

        if (urgency >= 3) {
          classifications.push({ name: c.name, company: c.company || '', status, urgency, days_since: daysSince });
        }
      }

      // Only push if there are relationships needing attention
      if (classifications.length === 0) {
        console.log(`[health_warning] ${clerkUserId}: no warnings, skipping`);
        continue;
      }

      // Build warning message
      const cooling = classifications.filter(c => c.status === 'cooling');
      const dormant = classifications.filter(c => c.status === 'dormant');

      let msg = '💚 关系健康预警\n\n';
      if (cooling.length > 0) {
        msg += `⚠️ 正在冷却（${cooling.length}人）：\n`;
        cooling.slice(0, 5).forEach(c => {
          msg += `· ${c.name}${c.company ? `（${c.company}）` : ''} — ${c.days_since}天未联系\n`;
        });
        if (cooling.length > 5) msg += `...等${cooling.length}人\n`;
        msg += '\n';
      }
      if (dormant.length > 0) {
        msg += `🔴 关系休眠（${dormant.length}人）：\n`;
        dormant.slice(0, 3).forEach(c => {
          msg += `· ${c.name}${c.company ? `（${c.company}）` : ''} — ${c.days_since}天未联系\n`;
        });
        if (dormant.length > 3) msg += `...等${dormant.length}人\n`;
        msg += '\n';
      }
      msg += '建议尽快找个自然切入点重新互动。\n';
      msg += '登录 welian.app 查看完整健康分析 →';

      // Push to WeChat queue (if WeChat-bound)
      const queueRaw = await env.USER_DATA.get(`push_queue:${clerkUserId}`);
      const queue = queueRaw ? JSON.parse(queueRaw) : [];
      queue.push({ type: 'health_warning', content: msg, timestamp: new Date().toISOString() });
      await env.USER_DATA.put(`push_queue:${clerkUserId}`, JSON.stringify(queue), { expirationTtl: 86400 });

      // Push to IM channels (TG/飞书/钉钉)
      pushToIMChannels(env, clerkUserId, msg).catch(e =>
        console.error(`[health_warning] IM push failed for ${clerkUserId}:`, e.message)
      );

      console.log(`[health_warning] Pushed to ${clerkUserId}: ${classifications.length} warnings`);
    } catch (e) {
      console.error(`[health_warning] Failed for ${clerkUserId}:`, e.message);
    }
  }
}

// ── Festival & important date reminder push (daily check, 3 days ahead) ──

// Lunar/solar festival dates (fixed MM-DD for solar, approximate lunar dates by year)
const SOLAR_FESTIVALS = [
  { date: '01-01', name: '元旦', greeting: '新年快乐！新的一年，记得给重要的人发个消息' },
  { date: '02-14', name: '情人节', greeting: '情人节到了，别忘了对重要的人说声心意' },
  { date: '03-08', name: '妇女节', greeting: '妇女节，记得给身边的女性长辈/朋友送上祝福' },
  { date: '05-01', name: '劳动节', greeting: '劳动节快乐，假期是联系老朋友的好时机' },
  { date: '06-01', name: '儿童节', greeting: '儿童节，如果有孩子的话，陪他们好好玩一天' },
  { date: '10-01', name: '国庆节', greeting: '国庆快乐！长假别忘了给家人打个电话' },
  { date: '12-25', name: '圣诞节', greeting: '圣诞快乐，给重要的人送句温暖的话' },
  { date: '12-31', name: '跨年夜', greeting: '跨年夜，回顾这一年，谁值得你说声谢谢？' },
];

// Approximate lunar festival dates (varies by year, ±1 day)
const LUNAR_FESTIVALS_2026 = [
  { date: '2026-02-17', name: '春节', greeting: '春节快乐！记得给爸妈拜年，给重要的人发祝福' },
  { date: '2026-02-16', name: '除夕', greeting: '除夕夜，和家人吃顿团圆饭，给远方的朋友发句想念' },
  { date: '2026-02-11', name: '小年', greeting: '小年到了，开始准备过年了吧？给家人问问缺什么' },
  { date: '2026-03-04', name: '元宵节', greeting: '元宵节快乐，吃碗汤圆，给重要的人送句团圆的祝福' },
  { date: '2026-04-05', name: '清明节', greeting: '清明节，记得给家人问问扫墓的事' },
  { date: '2026-05-31', name: '端午节', greeting: '端午节快乐，吃个粽子，给家人打个电话' },
  { date: '2026-08-10', name: '七夕', greeting: '七夕到了，对重要的人说句心意' },
  { date: '2026-09-25', name: '中秋节', greeting: '中秋快乐！月圆人团圆，记得给家人打电话，给朋友送祝福' },
  { date: '2026-10-11', name: '重阳节', greeting: '重阳节，记得给长辈问安，陪老人聊聊天' },
  { date: '2027-02-06', name: '春节', greeting: '春节快乐！记得给爸妈拜年，给重要的人发祝福' },
  { date: '2027-02-05', name: '除夕', greeting: '除夕夜，和家人吃顿团圆饭，给远方的朋友发句想念' },
];

async function handleFestivalReminderPush(env) {
  console.log('[festival_reminder] Starting festival & important date reminder push');

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const todayMd = today.toISOString().slice(5, 10);
  const threeDaysLater = new Date(today.getTime() + 3 * 86400000);
  const threeDaysLaterStr = threeDaysLater.toISOString().slice(0, 10);
  const threeDaysLaterMd = threeDaysLater.toISOString().slice(5, 10);

  // Find upcoming festivals within 3 days
  const upcomingFestivals = [];

  for (const f of SOLAR_FESTIVALS) {
    if (f.date >= todayMd && f.date <= threeDaysLaterMd) {
      upcomingFestivals.push(f);
    }
  }

  for (const f of LUNAR_FESTIVALS_2026) {
    if (f.date >= todayStr && f.date <= threeDaysLaterStr) {
      upcomingFestivals.push(f);
    }
  }

  // Find all bound users (WeChat + IM)
  const wechatList = await env.USER_DATA.list({ prefix: 'wechat_bind:' });
  const imList = await env.USER_DATA.list({ prefix: 'im_user:' });
  const userIds = new Set();
  for (const key of wechatList.keys) {
    const clerkUserId = await env.USER_DATA.get(key.name);
    if (clerkUserId) userIds.add(clerkUserId);
  }
  for (const key of imList.keys) {
    const clerkUserId = await env.USER_DATA.get(key.name);
    if (clerkUserId) userIds.add(clerkUserId);
  }

  for (const clerkUserId of userIds) {
    try {
      const contacts = await loadDataset(env, clerkUserId, 'contacts');
      if (contacts.length === 0) continue;

      const reminders = [];

      // 1. Festival reminders (for all users)
      for (const f of upcomingFestivals) {
        const daysTo = Math.ceil((new Date(f.date.length === 5 ? `${today.getFullYear()}-${f.date}` : f.date) - today) / 86400000);
        reminders.push({
          type: 'festival',
          name: f.name,
          days: daysTo,
          greeting: f.greeting,
        });
      }

      // 2. Contact important dates within 3 days (all contacts, both nurture & leverage)
      for (const c of contacts) {
        if (!c.important_dates) continue;
        for (const d of c.important_dates) {
          if (!d.date) continue;
          const mmdd = d.date.length === 5 ? d.date : d.date.slice(5, 10);
          if (mmdd >= todayMd && mmdd <= threeDaysLaterMd) {
            const daysTo = Math.ceil((new Date(`${today.getFullYear()}-${mmdd}`) - today) / 86400000);
            reminders.push({
              type: 'important_date',
              contactName: c.name,
              label: d.label || '重要日期',
              days: daysTo,
              isNurture: c.nature === 'nurture' || c.nature === '双重' || c.nature === 'dual',
            });
          }
        }
      }

      if (reminders.length === 0) continue;

      // Sort by days ascending
      reminders.sort((a, b) => a.days - b.days);

      // Build message
      let msg = '📅 近期提醒\n\n';
      for (const r of reminders.slice(0, 5)) {
        if (r.type === 'festival') {
          const dayLabel = r.days === 0 ? '今天' : r.days === 1 ? '明天' : `${r.days}天后`;
          msg += `🎉 ${r.name}（${dayLabel}）\n   ${r.greeting}\n\n`;
        } else {
          const dayLabel = r.days === 0 ? '今天' : r.days === 1 ? '明天' : `${r.days}天后`;
          const icon = r.isNurture ? '💛' : '📌';
          msg += `${icon} ${r.contactName}的${r.label}（${dayLabel}）\n`;
          if (r.isNurture) {
            msg += `   记得送上心意，不用理由\n`;
          } else {
            msg += `   别忘了，这是维系关系的好契机\n`;
          }
          msg += '\n';
        }
      }
      msg += '— Welian 小维 · welian.app';

      // Queue for WeChat bot pickup
      const queueRaw = await env.USER_DATA.get(`push_queue:${clerkUserId}`);
      const queue = queueRaw ? JSON.parse(queueRaw) : [];
      queue.push({ type: 'festival_reminder', content: msg, timestamp: today.toISOString() });
      await env.USER_DATA.put(`push_queue:${clerkUserId}`, JSON.stringify(queue), { expirationTtl: 86400 });

      // Push to IM channels
      pushToIMChannels(env, clerkUserId, msg).catch(e =>
        console.error(`[festival_reminder] IM push failed for ${clerkUserId}:`, e.message)
      );

      console.log(`[festival_reminder] Pushed to ${clerkUserId}: ${reminders.length} reminders`);
    } catch (e) {
      console.error(`[festival_reminder] Failed for ${clerkUserId}:`, e.message);
    }
  }
}

// ── Scheduled push: generate weekly reports for WeChat-bound users ──

async function handleScheduledPush(env) {
  // List all wechat_bind keys to find bound users
  const listResult = await env.USER_DATA.list({ prefix: 'wechat_bind:' });
  const boundUsers = [];
  for (const key of listResult.keys) {
    const wechatId = key.name.replace('wechat_bind:', '');
    const clerkUserId = await env.USER_DATA.get(key.name);
    if (clerkUserId) {
      boundUsers.push({ wechatId, clerkUserId });
    }
  }

  for (const { wechatId, clerkUserId } of boundUsers) {
    try {
      // Generate weekly report
      const contacts = await loadDataset(env, clerkUserId, 'contacts');
      const timeline = await loadDataset(env, clerkUserId, 'timeline');
      const todos = await loadDataset(env, clerkUserId, 'todos');

      if (contacts.length === 0) continue; // skip users with no data

      // Build report context
      const now = new Date();
      const weekAgoStr = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
      const weekTimeline = timeline.filter(t => (t.date || '') >= weekAgoStr);
      const pendingTodos = todos.filter(t => !isTodoDone(t));

      // Upcoming dates
      const todayStr = now.toISOString().slice(5, 10);
      const nextWeekStr = new Date(now + 7 * 86400000).toISOString().slice(5, 10);
      const upcomingDates = [];
      for (const c of contacts) {
        if (!c.important_dates) continue;
        for (const d of c.important_dates) {
          const mmdd = (d.date || '').slice(5, 10);
          if (mmdd >= todayStr && mmdd <= nextWeekStr) {
            upcomingDates.push({ name: c.name, date: d.date, label: d.label || '重要日期' });
          }
        }
      }

      const contextData = {
        weekSummary: { interactions: weekTimeline.length, new_todos: pendingTodos.length, completed_todos: 0 },
        recentInteractions: weekTimeline.slice(-10),
        pendingTodos: pendingTodos.slice(0, 10),
        upcomingDates: upcomingDates.slice(0, 5),
        topContacts: contacts.filter(c => c.strength >= 4).slice(0, 20).map(c => ({ name: c.name, nature: c.nature, last_interaction: c.last_interaction || '' })),
      };

      const llmResp = await callLLM(
        JSON.stringify(contextData),
        await getPrompt(env, 'weekly', WEEKLY_SYSTEM),
        env,
        { max_tokens: 2048, temperature: 0.7, model_tier: 'standard' }
      );

      let report;
      if (llmResp) {
        try {
          const text = llmResp.text.trim();
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            report = JSON.parse(jsonMatch[0]);
          } else {
            const cleaned = text.replace(/[{}[\]"]/g, '').replace(/\\n/g, '\n').replace(/^\s*[a-z_]+:\s*/gim, '').trim();
            report = { greeting: cleaned || '周报生成完成' };
          }
        } catch {
          const cleaned = llmResp.text.replace(/[{}[\]"]/g, '').replace(/\\n/g, '\n').replace(/^\s*[a-z_]+:\s*/gim, '').trim();
          report = { greeting: cleaned || '周报生成完成' };
        }
      } else {
        report = { greeting: '本周回顾', review: contextData.weekSummary, upcoming_dates: upcomingDates, todo_reminders: pendingTodos.slice(0, 5) };
      }

      // Format push message
      const msg = formatWeeklyPushMessage(report);

      // Queue for bot pickup
      const queueRaw = await env.USER_DATA.get(`push_queue:${clerkUserId}`);
      const queue = queueRaw ? JSON.parse(queueRaw) : [];
      queue.push({ type: 'weekly_report', content: msg, timestamp: now.toISOString() });
      await env.USER_DATA.put(`push_queue:${clerkUserId}`, JSON.stringify(queue), { expirationTtl: 86400 });

      // Also push to IM channels (Telegram/飞书/钉钉)
      pushToIMChannels(env, clerkUserId, msg).catch(e =>
        console.error(`[im_push] weekly report failed for ${clerkUserId}:`, e.message)
      );

      // Also send weekly report via email (async, don't block)
      getUserEmailFromClerk(env, clerkUserId).then(email => {
        if (email) {
          const summary = {
            greeting: report.greeting || '',
            interactions: contextData.weekSummary?.interactions || 0,
            new_todos: contextData.weekSummary?.new_todos || 0,
            completed_todos: contextData.weekSummary?.completed_todos || 0,
            suggestions: (contextData.weekSummary?.suggestions || []).slice(0, 5),
          };
          sendWeeklyReportEmail(env, email, summary);
        }
      }).catch(e => console.log('[email] weekly report send failed:', e.message));

      console.log(`Weekly report queued for ${clerkUserId}`);
    } catch (e) {
      console.error(`Push failed for ${clerkUserId}:`, e.message);
    }
  }
}

// ── Daily advise push: top 3 people to contact today ──

async function handleDailyAdvisePush(env) {
  console.log('[daily_advise] Starting daily advise push');

  // Find all wechat-bound users
  const listResult = await env.USER_DATA.list({ prefix: 'wechat_bind:' });
  const boundUsers = [];
  for (const key of listResult.keys) {
    const wechatId = key.name.replace('wechat_bind:', '');
    const clerkUserId = await env.USER_DATA.get(key.name);
    if (clerkUserId) boundUsers.push({ wechatId, clerkUserId });
  }

  for (const { wechatId, clerkUserId } of boundUsers) {
    try {
      const contacts = await loadDataset(env, clerkUserId, 'contacts');
      const timeline = await loadDataset(env, clerkUserId, 'timeline');
      const todos = await loadDataset(env, clerkUserId, 'todos');
      if (contacts.length === 0) continue;

      // Reuse advise scoring logic
      const today = new Date();
      const candidates = [];
      for (const c of contacts) {
        if (c.nature !== 'leverage' && c.nature !== '双重' && c.nature !== 'dual') continue;
        const contactTimeline = timeline
          .filter(t => t.contact === c.id)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const lastDate = contactTimeline[0]?.date || '';
        let daysSince = 9999;
        if (lastDate) {
          const diff = Math.floor((today - new Date(lastDate)) / 86400000);
          daysSince = isNaN(diff) ? 9999 : diff;
        }
        let score = 0;
        if (daysSince >= 21) score += 30;
        else if (daysSince >= 14) score += 20;
        else if (daysSince === 9999) score += 25;
        if (c.leverage?.confirmed) score += 15;
        const pendingTodos = todos.filter(t => t.contact === c.id && t.status === 'pending');
        score += pendingTodos.length * 25;
        score += (c.strength || 3) * 2;
        if (daysSince >= 14 || daysSince === 9999 || pendingTodos.length > 0) {
          candidates.push({
            name: c.name,
            daysSince,
            score,
            lastInteraction: contactTimeline[0]?.summary || '',
            pendingTodos: pendingTodos.map(t => t.task),
            leverageGoals: c.leverage?.goals || [],
          });
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      const top3 = candidates.slice(0, 3);
      if (top3.length === 0) continue;

      // Also check nurture important dates within 7 days
      const nurtureReminders = [];
      const todayStr = today.toISOString().slice(5, 10);
      const weekStr = new Date(today.getTime() + 7 * 86400000).toISOString().slice(5, 10);
      for (const c of contacts) {
        if (c.nature !== 'nurture' && c.nature !== '双重' && c.nature !== 'dual') continue;
        for (const d of (c.important_dates || [])) {
          if (!d.date) continue;
          const mmdd = d.date.length === 5 ? d.date : d.date.slice(5, 10);
          if (mmdd >= todayStr && mmdd <= weekStr) {
            nurtureReminders.push({ name: c.name, label: d.label || '重要日期', date: d.date });
          }
        }
      }

      // Build push message
      const dateStr = today.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
      let msg = `☀️ 早安 · ${dateStr}\n\n`;
      msg += `今天最值得联系的 ${top3.length} 个人：\n\n`;
      for (const c of top3) {
        const icon = c.daysSince >= 21 ? '🔴' : c.daysSince === 9999 ? '⚪' : '🟡';
        msg += `${icon} ${c.name}`;
        msg += c.daysSince === 9999 ? '（从未联系）' : `（${c.daysSince}天没联系）`;
        if (c.leverageGoals && c.leverageGoals.length > 0) {
          msg += `\n   🎯 ${Array.isArray(c.leverageGoals) ? c.leverageGoals.join(', ') : String(c.leverageGoals)}`;
        }
        if (c.lastInteraction) {
          msg += `\n   💬 上次：${c.lastInteraction.slice(0, 50)}`;
        }
        if (c.pendingTodos.length > 0) {
          msg += `\n   📌 待办：${c.pendingTodos[0]}`;
        }
        msg += '\n\n';
      }
      if (nurtureReminders.length > 0) {
        msg += `💛 别忘记：\n`;
        for (const r of nurtureReminders.slice(0, 3)) {
          msg += `  · ${r.name}的${r.label}快到了\n`;
        }
        msg += '\n';
      }
      msg += `— Welian 小维 · welian.app`;

      // Queue for bot pickup
      const queueRaw = await env.USER_DATA.get(`push_queue:${clerkUserId}`);
      const queue = queueRaw ? JSON.parse(queueRaw) : [];
      queue.push({ type: 'daily_advise', content: msg, timestamp: today.toISOString() });
      await env.USER_DATA.put(`push_queue:${clerkUserId}`, JSON.stringify(queue), { expirationTtl: 86400 });

      // Push to IM channels
      pushToIMChannels(env, clerkUserId, msg).catch(e =>
        console.error(`[im_push] daily advise failed for ${clerkUserId}:`, e.message)
      );

      // Save to advise push history (30-day TTL)
      const todayKey = today.toISOString().slice(0, 10);
      await env.USER_DATA.put(`advise_history:${clerkUserId}:${todayKey}`, JSON.stringify({
        date: todayKey,
        topContacts: top3.map(c => ({ name: c.name, daysSince: c.daysSince, score: c.score })),
        nurtureReminders,
      }), { expirationTtl: 2592000 });

      console.log(`[daily_advise] Pushed to ${clerkUserId}: ${top3.length} contacts`);
    } catch (e) {
      console.error(`[daily_advise] Failed for ${clerkUserId}:`, e.message);
    }
  }
}

// ── Funnel metrics: aggregate acquisition/activation/retention/paid/viral ──

async function handleFunnelMetrics(env) {
  // Cache for 1 hour to avoid expensive KV scans
  const cacheKey = 'funnel_metrics_cache';
  const cached = await env.USER_DATA.get(cacheKey);
  if (cached) {
    try { return { status: 200, data: JSON.parse(cached) }; } catch { /* cache parse error */ }
  }

  // 1. List all users via billing: prefix (paginated)
  const userIds = new Set();
  let cursor;
  do {
    const listOpts = { prefix: 'billing:', limit: 1000 };
    if (cursor) listOpts.cursor = cursor;
    const result = await env.USER_DATA.list(listOpts);
    for (const k of result.keys) {
      userIds.add(k.name.replace('billing:', ''));
    }
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);

  const totalUsers = userIds.size;

  // 2. For each user, fetch billing + contacts + metrics in parallel batches
  const userIdArr = [...userIds];
  let activated = 0;      // ≥3 contacts AND ≥1 action in first 7 days
  let active7d = 0;       // any metrics activity in last 7 days
  let paid = 0;           // plan !== 'free' or has subscription
  let totalContacts = 0;
  let totalActions = 0;

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86400000;
  const thirtyDaysAgo = now - 30 * 86400000;

  // Process in batches of 20 to avoid overwhelming KV
  for (let i = 0; i < userIdArr.length; i += 20) {
    const batch = userIdArr.slice(i, i + 20);
    const results = await Promise.all(batch.map(async (uid) => {
      const [billingRaw, contactsRaw, metricsRaw] = await Promise.all([
        env.USER_DATA.get(`billing:${uid}`),
        env.USER_DATA.get(`contacts:${uid}`),
        env.USER_DATA.get(`metrics:${uid}`),
      ]);
      return { uid, billingRaw, contactsRaw, metricsRaw };
    }));

    for (const { billingRaw, contactsRaw, metricsRaw } of results) {
      // Paid check
      if (billingRaw) {
        try {
          const billing = JSON.parse(billingRaw);
          if (billing.plan && billing.plan !== 'free') paid++;
          if (billing.subscription) paid++;
        } catch { /* billing parse error */ }
      }

      // Activation check: ≥3 contacts
      let contactCount = 0;
      let firstContactTs = null;
      if (contactsRaw) {
        try {
          const contacts = JSON.parse(contactsRaw);
          contactCount = contacts.length;
          totalContacts += contactCount;
          if (contacts.length > 0) {
            const created = contacts.map(c => c.created).filter(Boolean).sort();
            if (created[0]) firstContactTs = new Date(created[0]).getTime();
          }
        } catch { /* contacts parse error */ }
      }

      // Metrics check: any action in last 7 days
      let hasRecentAction = false;
      let userActionCount = 0;
      if (metricsRaw) {
        try {
          const metrics = JSON.parse(metricsRaw);
          const weekly = metrics.weekly || {};
          for (const [wk, data] of Object.entries(weekly)) {
            const weekActions = (data.advise_generated || 0) + (data.todo_completed || 0) +
              (data.interaction_recorded || 0) + (data.draft_generated || 0) + (data.signal_action || 0);
            userActionCount += weekActions;
            // Check if this week is within last 7 days (approximate: check week key year/week)
            // Simple heuristic: if any weekly key exists for recent weeks
            const wkDate = new Date(`${wk.split('-')[0]}-01-01`);
            const wkMs = wkDate.getTime() + (parseInt(wk.split('-')[1]) - 1) * 7 * 86400000;
            if (wkMs > sevenDaysAgo - 7 * 86400000) hasRecentAction = true;
          }
          totalActions += userActionCount;
        } catch { /* metrics parse error */ }
      }

      // Activation: ≥3 contacts AND (firstContactTs exists) AND has at least 1 action
      if (contactCount >= 3 && userActionCount > 0) activated++;

      // Retention: any activity in last ~7 days
      if (hasRecentAction) active7d++;
    }
  }

  // 3. Viral: count invite codes and redemptions
  let inviteCodes = 0;
  let inviteRedemptions = 0;
  cursor = undefined;
  do {
    const listOpts = { prefix: 'invite_code_reverse:', limit: 1000 };
    if (cursor) listOpts.cursor = cursor;
    const result = await env.USER_DATA.list(listOpts);
    for (const k of result.keys) inviteCodes++;
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);

  cursor = undefined;
  do {
    const listOpts = { prefix: 'invited_by:', limit: 1000 };
    if (cursor) listOpts.cursor = cursor;
    const result = await env.USER_DATA.list(listOpts);
    for (const k of result.keys) inviteRedemptions++;
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);

  // 4. Acquisition funnel: signals page views → CTA clicks (today)
  const todayKey = new Date().toISOString().slice(0, 10);
  const signalsPvRaw = await env.USER_DATA.get(`pageviews:signals:${todayKey}`);
  const signalsPv = signalsPvRaw ? parseInt(signalsPvRaw) : 0;
  const ctaClickRaw = await env.USER_DATA.get(`events:cta_click:signals:${todayKey}`);
  const ctaClicks = ctaClickRaw ? parseInt(ctaClickRaw) : 0;

  const data = {
    ok: true,
    generated_at: new Date().toISOString(),
    funnel: {
      acquisition: { total: totalUsers, label: '注册用户' },
      activation: { count: activated, total: totalUsers, rate: totalUsers > 0 ? (activated / totalUsers * 100).toFixed(1) : '0', label: '激活（≥3联系人+1动作）' },
      retention: { count: active7d, total: totalUsers, rate: totalUsers > 0 ? (active7d / totalUsers * 100).toFixed(1) : '0', label: '7天活跃' },
      paid: { count: paid, total: totalUsers, rate: totalUsers > 0 ? (paid / totalUsers * 100).toFixed(1) : '0', label: '付费用户' },
      viral: { codes: inviteCodes, redemptions: inviteRedemptions, rate: inviteCodes > 0 ? (inviteRedemptions / inviteCodes * 100).toFixed(1) : '0', label: '邀请转化' },
      acquisition_funnel: {
        signals_pageviews: signalsPv,
        cta_clicks: ctaClicks,
        cta_ctr: signalsPv > 0 ? (ctaClicks / signalsPv * 100).toFixed(1) : '0',
        label: '信号页→CTA点击',
      },
    },
    aggregates: {
      total_contacts: totalContacts,
      total_actions: totalActions,
      avg_contacts_per_user: totalUsers > 0 ? (totalContacts / totalUsers).toFixed(1) : '0',
      avg_actions_per_user: totalUsers > 0 ? (totalActions / totalUsers).toFixed(1) : '0',
    },
  };

  // Cache for 1 hour
  await env.USER_DATA.put(cacheKey, JSON.stringify(data), { expirationTtl: 3600 });
  return { status: 200, data };
}

// ── Daily signals → WeChat official account article publish ──

async function handleDailySignalsPush(env) {
  console.log('[daily_signals] Starting daily signals article publish');

  // Generate the signals preview (reuse the public preview logic)
  const previewResult = await handleSignalsPreview(new Request('https://internal/signals_preview'), env);
  if (!previewResult.data?.ok || !previewResult.data?.report?.signals?.length) {
    console.log('[daily_signals] No signals generated, skipping');
    return;
  }

  const report = previewResult.data.report;
  const signals = report.signals || [];
  const themes = report.themes || [];
  const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  // Save daily snapshot to KV for history (30-day TTL)
  const todayKey = new Date().toISOString().slice(0, 10);
  await env.USER_DATA.put(`signals_history:${todayKey}`, JSON.stringify({
    date: todayKey,
    greeting: report.greeting || '',
    signals,
    themes,
    closing: report.closing || '',
  }), { expirationTtl: 2592000 }); // 30 days

  // Build article title (max 32 chars)
  const title = `📡 今日信号 · ${today}`;

  // Build article digest (max 120 chars)
  const topTitles = signals.slice(0, 3).map(s => s.title).join('、');
  const digest = `${themes.join('、')}${themes.length > 0 ? '；' : ''}${topTitles}`.substring(0, 120);

  // Build HTML content for the article
  let html = '<section style="padding:16px;font-size:16px;line-height:1.8;color:#333;">';

  if (report.greeting) {
    html += `<p style="color:#666;font-size:15px;margin-bottom:20px;">${escWechat(report.greeting)}</p>`;
  }

  if (themes.length > 0) {
    html += '<section style="margin-bottom:24px;">';
    html += '<h2 style="font-size:18px;color:#4A6741;border-left:4px solid #4A6741;padding-left:12px;margin-bottom:12px;">🔥 热点主题</h2>';
    themes.forEach(t => {
      html += `<span style="display:inline-block;background:#4A6741;color:#fff;padding:4px 14px;border-radius:14px;font-size:14px;margin:3px;">${escWechat(t)}</span>`;
    });
    html += '</section>';
  }

  html += '<section style="margin-bottom:24px;">';
  html += '<h2 style="font-size:18px;color:#4A6741;border-left:4px solid #4A6741;padding-left:12px;margin-bottom:16px;">📊 关键信号</h2>';

  signals.forEach((s, i) => {
    const sourceTag = s.source ? `<span style="font-size:12px;color:#999;background:#f5f5f5;padding:2px 6px;border-radius:4px;margin-left:6px;">${escWechat(s.source)}</span>` : '';
    const score = s.value_score || 0;
    const scoreTag = score > 0 ? `<span style="font-size:12px;color:${score >= 8 ? '#c0392b' : score >= 6 ? '#e67e22' : '#999'};font-weight:600;margin-left:6px;">★${score}</span>` : '';
    const pts = s.points ? ` · ${s.points}pts` : '';
    html += `<section style="background:#FAFAF7;border:1px solid #E8E0D6;border-radius:12px;padding:16px;margin-bottom:14px;">`;
    html += `<h3 style="font-size:16px;font-weight:600;margin-bottom:8px;">${i + 1}. ${escWechat(s.title || '')}${sourceTag}${scoreTag}</h3>`;
    html += `<p style="font-size:13px;color:#999;margin-bottom:10px;">${pts}${s.source ? ` · 来源：${escWechat(s.source)}` : ''}</p>`;
    html += `<p style="font-size:15px;color:#555;line-height:1.7;"><strong style="color:#4A6741;">为什么重要：</strong>${escWechat(s.why || '')}</p>`;
    if (s.tags && s.tags.length > 0) {
      html += '<p style="margin-top:10px;">';
      s.tags.forEach(t => {
        html += `<span style="display:inline-block;background:#fff;border:1px solid #ddd;padding:2px 8px;border-radius:8px;font-size:12px;color:#888;margin:2px;">${escWechat(t)}</span>`;
      });
      html += '</p>';
    }
    html += '</section>';
  });

  html += '</section>';

  // CTA section — no <a> tag (WeChat strips links in article body), use text + 阅读原文
  html += `<section style="background:linear-gradient(135deg,#4A6741 0%,#5a7a51 100%);border-radius:16px;padding:24px;text-align:center;margin-top:20px;">
    <h2 style="color:#fff;font-size:18px;margin-bottom:8px;">获取个性化信号</h2>
    <p style="color:#fff;font-size:14px;opacity:0.9;margin-bottom:12px;">登录 Welian，信号会结合你的行业、联系人网络和关系目标</p>
    <p style="color:#fff;font-size:15px;font-weight:600;">点击底部「阅读原文」体验 →</p>
  </section>`;

  if (report.closing) {
    html += `<p style="text-align:center;color:#999;font-size:14px;margin-top:20px;">${escWechat(report.closing)}</p>`;
  }

  // Disclaimer
  html += `<section style="margin-top:24px;padding:14px 16px;background:#f9f9f9;border-radius:8px;border-left:3px solid #ddd;">
    <p style="font-size:12px;color:#999;line-height:1.7;margin:0;">
      <strong style="color:#888;">免责声明</strong>：本内容由 AI 自动聚合公开信息生成，仅供信息参考，不构成任何投资、交易或商业决策建议。市场有风险，决策需谨慎。请以官方来源和专业人士意见为准。
    </p>
  </section>`;

  html += `<p style="text-align:center;color:#ccc;font-size:12px;margin-top:16px;">— 用 Welian 管理你的关系 · welian.app —</p>`;
  html += '</section>';

  // Get WeChat access token
  const accessToken = await getWechatAccessToken(env);
  if (!accessToken) {
    console.log('[daily_signals] No WeChat access token, skipping article publish');
    return;
  }

  // Step 1: Upload cover image as permanent material
  const thumbMediaId = await uploadWechatCoverImage(env, accessToken, themes, signals);
  if (!thumbMediaId) {
    console.error('[daily_signals] Failed to upload cover image, skipping publish');
    return;
  }

  // Step 2: Create draft
  const draftResp = await fetch(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      articles: [{
        title: title.substring(0, 32),
        author: 'Welian 小维',
        digest: digest.substring(0, 120),
        content: html,
        content_source_url: 'https://welian.app/signals.html',
        thumb_media_id: thumbMediaId,
        need_open_comment: 1,
        only_fans_can_comment: 0,
      }],
    }),
  });
  const draftData = await draftResp.json();

  if (draftData.errcode || !draftData.media_id) {
    console.error('[daily_signals] Draft add failed:', JSON.stringify(draftData));
    return;
  }

  console.log('[daily_signals] Draft created:', draftData.media_id);

  // Step 3: Submit for publish
  const publishResp = await fetch(`https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_id: draftData.media_id }),
  });
  const publishData = await publishResp.json();

  if (publishData.errcode) {
    console.error('[daily_signals] Publish submit failed:', JSON.stringify(publishData));
    return;
  }

  console.log('[daily_signals] Article published! publish_id:', publishData.publish_id);

  // Also push text summary to queues (for bot pickup / Telegram)
  let msg = `📡 今日信号 · ${today}\n\n`;
  if (report.greeting) msg += `${report.greeting}\n\n`;
  if (themes.length > 0) msg += `🔥 ${themes.join('、')}\n\n`;
  signals.slice(0, 5).forEach(s => {
    msg += `· ${s.title} [${s.source || ''}]\n  ${s.why || ''}\n`;
  });
  msg += `\n完整文章已发布到公众号\n${report.closing || ''}\n\n— 用 Welian 管理你的关系：welian.app`;
  await pushSignalsToQueues(env, msg);

  // Also send email digest to subscribers
  await handleDailyEmailDigest(env, report).catch(e => console.error('[daily_email_digest] error:', e.message));
}

// Send daily signals digest to all email subscribers
async function handleDailyEmailDigest(env, report) {
  const listKey = 'subscribers:daily_signals';
  const list = await env.USER_DATA.get(listKey);
  if (!list) {
    console.log('[daily_email_digest] No subscribers');
    return;
  }
  const emails = JSON.parse(list);
  if (emails.length === 0) return;

  console.log(`[daily_email_digest] Sending to ${emails.length} subscribers`);

  const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
  const signals = report.signals || [];
  const themes = report.themes || [];

  // Build email HTML
  let html = `<!DOCTYPE html><html><body style="font-family:-apple-system,'PingFang SC',sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#2C2C2C;background:#F5F4EE">`;
  html += `<div style="background:#FAFAF7;border-radius:12px;padding:24px;margin-bottom:16px">`;
  html += `<h1 style="color:#4A6741;font-size:22px;margin:0 0 8px">📡 今日信号 · ${today}</h1>`;
  if (report.greeting) {
    html += `<p style="color:#666;font-size:14px;line-height:1.7;margin:0">${report.greeting}</p>`;
  }
  html += `</div>`;

  if (themes.length > 0) {
    html += `<div style="margin-bottom:16px"><p style="font-size:13px;color:#888;margin:0 0 8px">🔥 热点主题</p>`;
    themes.forEach(t => {
      html += `<span style="display:inline-block;background:#4A6741;color:#fff;padding:3px 12px;border-radius:12px;font-size:13px;margin:2px">${t}</span>`;
    });
    html += `</div>`;
  }

  html += `<div style="background:#FAFAF7;border-radius:12px;padding:20px;margin-bottom:16px">`;
  html += `<p style="font-size:13px;color:#888;margin:0 0 12px">📊 关键信号（按价值排序）</p>`;
  signals.slice(0, 10).forEach((s, i) => {
    const score = s.value_score || 0;
    const scoreTag = score > 0 ? ` <span style="color:${score >= 8 ? '#c0392b' : '#e67e22'};font-weight:600">★${score}</span>` : '';
    html += `<div style="border-bottom:1px solid #eee;padding:12px 0">`;
    html += `<p style="font-size:15px;font-weight:600;margin:0 0 4px">${i + 1}. ${s.title || ''}${scoreTag}</p>`;
    html += `<p style="font-size:12px;color:#999;margin:0 0 6px">来源：${s.source || ''}</p>`;
    if (s.why) {
      html += `<p style="font-size:14px;color:#555;line-height:1.6;margin:0"><strong style="color:#4A6741">为什么重要：</strong>${s.why}</p>`;
    }
    html += `</div>`;
  });
  html += `</div>`;

  html += `<div style="text-align:center;padding:20px;background:linear-gradient(135deg,#4A6741 0%,#5a7a51 100%);border-radius:12px;margin-bottom:16px">`;
  html += `<p style="color:#fff;font-size:16px;margin:0 0 8px">登录获取个性化信号</p>`;
  html += `<p style="color:#fff;font-size:13px;opacity:0.9;margin:0 0 12px">结合你的行业、联系人网络和关系目标</p>`;
  html += `<a href="https://welian.app/signals.html" style="display:inline-block;padding:10px 28px;background:#fff;color:#4A6741;border-radius:8px;text-decoration:none;font-weight:600">查看完整信号 →</a>`;
  html += `</div>`;

  html += `<p style="font-size:12px;color:#999;text-align:center;margin:16px 0">`;
  html += `不想再收到？<a href="https://api.welian.app/ai/unsubscribe?email=EMAIL_PLACEHOLDER" style="color:#4A6741">取消订阅</a>`;
  html += `</p>`;
  html += `<p style="font-size:11px;color:#ccc;text-align:center">Welian 小维 · welian.app</p>`;
  html += `</body></html>`;

  const subject = `📡 今日信号 · ${today} | ${themes[0] || '科技商业快讯'}`;

  let sent = 0, failed = 0;
  for (const email of emails) {
    // Replace placeholder with real unsubscribe link
    const personalizedHtml = html.replace('EMAIL_PLACEHOLDER', encodeURIComponent(email));
    const ok = await sendEmail(env, email, subject, personalizedHtml);
    if (ok) sent++; else failed++;
  }
  console.log(`[daily_email_digest] Sent: ${sent}, Failed: ${failed}`);
}

// ── Evening recap push (22:00 CST) — summary + review of the day ──

async function handleEveningSignalsPush(env) {
  console.log('[evening_recap] Starting evening recap article publish');

  // Load today's morning signals snapshot as the base
  const todayKey = new Date().toISOString().slice(0, 10);
  const morningSnapshot = await env.USER_DATA.get(`signals_history:${todayKey}`);
  let morningSignals = [];
  let morningThemes = [];
  if (morningSnapshot) {
    const parsed = JSON.parse(morningSnapshot);
    morningSignals = parsed.signals || [];
    morningThemes = parsed.themes || [];
  }

  // Fetch fresh evening sources to catch afternoon updates
  const allDomains = ['investment', 'ai', 'tech_finance'];
  const eveningStories = await fetchAllSignalSources(allDomains);

  if (eveningStories.length === 0 && morningSignals.length === 0) {
    console.log('[evening_recap] No data available, skipping');
    return;
  }

  // Build combined context: morning signals + fresh evening stories
  const morningText = morningSignals.map((s, i) =>
    `${i + 1}. [${s.source || '?'}] ${s.title || ''}${s.why ? `\n   早上解读: ${s.why}` : ''}`
  ).join('\n');

  const eveningText = eveningStories.map((s, i) => {
    const pts = s.points ? ` [${s.points}pts]` : '';
    return `${i + 1}. ${pts} [${s.source}] ${s.title}\n   URL: ${s.url || '(no url)'}`;
  }).join('\n');

  const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  const recapSystem = `You are Welian (小维), generating an evening recap briefing. This is a PUBLIC daily review published at 22:00 CST — a reflective summary of the day, NOT a morning news dump.

IMPORTANT: Return ONLY a valid JSON object. No markdown, no code fences.

Return JSON:
{
  "greeting": "晚上开场，回顾今天的整体基调（1-2句）",
  "top5": [
    {
      "title": "今日最值得记住的5件事之一",
      "source": "来源",
      "why": "为什么这件事今天最重要（回顾视角，确认趋势或标记转折）",
      "morning_update": "早上提到过吗？如果有，今天有什么新进展或验证；如果没有，为什么下午才浮出"
    }
  ],
  "trend_confirmation": "今天确认了什么趋势？（早上的判断被验证了还是反转了）",
  "missed": "今天最容易忽略但可能重要的一条（不在头条但值得留意）",
  "tomorrow_watch": "明天值得关注的1-2个方向",
  "closing": "晚安式收尾，引导用户登录 welian.app"
}

Rules:
- top5 是从全天（早上+下午）信号中选出最值得记住的5件，不是简单重复早上
- trend_confirmation 是回顾视角：早上的热点主题今天走势如何
- missed 是"隐藏信号"——不在头条但可能影响未来
- tomorrow_watch 是前瞻：基于今天的走势，明天该盯什么
- 中文输出，回顾语气，像朋友晚上聊天复盘今天
- closing 要温暖，如"今天辛苦了，早点休息。登录 welian.app 查看个性化回顾"`;

  const prompt = `Today is ${today}.

Morning signals (published at 07:00 CST, ${morningSignals.length} items):
${morningText}

Morning themes: ${morningThemes.join('、')}

Fresh evening stories (fetched at 22:00 CST, ${eveningStories.length} items):
${eveningText}

Generate an evening recap that reviews the day, confirms or updates the morning's trends, and previews tomorrow.`;

  const llmResp = await callLLM(prompt, recapSystem, env, { max_tokens: 4000, temperature: 0.7 });

  let report;
  if (llmResp && llmResp.text) {
    try {
      let cleaned = llmResp.text.trim();
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      report = JSON.parse(cleaned);
    } catch (e) {
      console.error('[evening_recap] JSON parse failed:', e.message);
      report = null;
    }
  }

  // Fallback: if LLM failed, build a simple recap from morning signals
  if (!report || !report.top5 || report.top5.length === 0) {
    const fallbackTop5 = morningSignals.slice(0, 5).map(s => ({
      title: s.title || '',
      source: s.source || '',
      why: s.why || '',
      morning_update: '早上已发布',
    }));
    report = {
      greeting: '今日回顾',
      top5: fallbackTop5,
      trend_confirmation: morningThemes.join('、'),
      missed: '',
      tomorrow_watch: '',
      closing: '今天辛苦了，早点休息。登录 welian.app 查看个性化回顾',
    };
    console.log('[evening_recap] Using fallback (LLM failed)');
  }

  // Save evening snapshot to KV (30-day TTL)
  await env.USER_DATA.put(`evening_recap:${todayKey}`, JSON.stringify({
    date: todayKey,
    ...report,
  }), { expirationTtl: 2592000 });

  // Build article title
  const title = `🌙 今日回顾 · ${today}`;

  // Build article digest
  const top5Titles = (report.top5 || []).slice(0, 3).map(s => s.title).join('、');
  const digest = `${report.trend_confirmation || ''}${top5Titles}`.substring(0, 120);

  // Build HTML content
  let html = '<section style="padding:16px;font-size:16px;line-height:1.8;color:#333;">';

  if (report.greeting) {
    html += `<p style="color:#666;font-size:15px;margin-bottom:20px;">${escWechat(report.greeting)}</p>`;
  }

  // Top 5 section
  html += '<section style="margin-bottom:24px;">';
  html += '<h2 style="font-size:18px;color:#4A6741;border-left:4px solid #4A6741;padding-left:12px;margin-bottom:16px;">⭐ 今日最值得记住的5件事</h2>';

  (report.top5 || []).forEach((s, i) => {
    const sourceTag = s.source ? `<span style="font-size:12px;color:#999;background:#f5f5f5;padding:2px 6px;border-radius:4px;margin-left:6px;">${escWechat(s.source)}</span>` : '';
    html += `<section style="background:#FAFAF7;border:1px solid #E8E0D6;border-radius:12px;padding:16px;margin-bottom:14px;">`;
    html += `<h3 style="font-size:16px;font-weight:600;margin-bottom:8px;">${i + 1}. ${escWechat(s.title || '')}${sourceTag}</h3>`;
    if (s.why) {
      html += `<p style="font-size:15px;color:#555;line-height:1.7;"><strong style="color:#4A6741;">为什么重要：</strong>${escWechat(s.why)}</p>`;
    }
    if (s.morning_update) {
      html += `<p style="font-size:13px;color:#888;margin-top:8px;font-style:italic;">${escWechat(s.morning_update)}</p>`;
    }
    html += '</section>';
  });

  html += '</section>';

  // Trend confirmation
  if (report.trend_confirmation) {
    html += `<section style="background:#f0f4ed;border-radius:12px;padding:16px;margin-bottom:20px;">
      <h2 style="font-size:16px;color:#4A6741;margin-bottom:8px;">📊 趋势确认</h2>
      <p style="font-size:15px;color:#555;line-height:1.7;">${escWechat(report.trend_confirmation)}</p>
    </section>`;
  }

  // Missed
  if (report.missed) {
    html += `<section style="background:#fff8e1;border-radius:12px;padding:16px;margin-bottom:20px;border-left:4px solid #ffa000;">
      <h2 style="font-size:16px;color:#e65100;margin-bottom:8px;">👀 今天容易忽略的</h2>
      <p style="font-size:15px;color:#555;line-height:1.7;">${escWechat(report.missed)}</p>
    </section>`;
  }

  // Tomorrow watch
  if (report.tomorrow_watch) {
    html += `<section style="background:linear-gradient(135deg,#4A6741 0%,#5a7a51 100%);border-radius:12px;padding:16px;margin-bottom:20px;">
      <h2 style="color:#fff;font-size:16px;margin-bottom:8px;">🔭 明天值得关注</h2>
      <p style="color:#fff;font-size:15px;line-height:1.7;opacity:0.95;">${escWechat(report.tomorrow_watch)}</p>
    </section>`;
  }

  // CTA
  html += `<section style="background:linear-gradient(135deg,#4A6741 0%,#5a7a51 100%);border-radius:16px;padding:24px;text-align:center;margin-top:20px;">
    <h2 style="color:#fff;font-size:18px;margin-bottom:8px;">个性化回顾</h2>
    <p style="color:#fff;font-size:14px;opacity:0.9;margin-bottom:12px;">登录 Welian，查看结合你关系网络的全天回顾</p>
    <p style="color:#fff;font-size:15px;font-weight:600;">点击底部「阅读原文」体验 →</p>
  </section>`;

  if (report.closing) {
    html += `<p style="text-align:center;color:#999;font-size:14px;margin-top:20px;">${escWechat(report.closing)}</p>`;
  }

  // Disclaimer
  html += `<section style="margin-top:24px;padding:14px 16px;background:#f9f9f9;border-radius:8px;border-left:3px solid #ddd;">
    <p style="font-size:12px;color:#999;line-height:1.7;margin:0;">
      <strong style="color:#888;">免责声明</strong>：本内容由 AI 自动聚合公开信息生成，仅供信息参考，不构成任何投资、交易或商业决策建议。市场有风险，决策需谨慎。请以官方来源和专业人士意见为准。
    </p>
  </section>`;

  html += `<p style="text-align:center;color:#ccc;font-size:12px;margin-top:16px;">— 用 Welian 管理你的关系 · welian.app —</p>`;
  html += '</section>';

  // Get WeChat access token
  const accessToken = await getWechatAccessToken(env);
  if (!accessToken) {
    console.log('[evening_recap] No WeChat access token, skipping');
    return;
  }

  // Upload cover (reuse same cover variant as morning — same day)
  const thumbMediaId = await uploadWechatCoverImage(env, accessToken, [], []);
  if (!thumbMediaId) {
    console.error('[evening_recap] Failed to upload cover, skipping');
    return;
  }

  // Create draft
  const draftResp = await fetch(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      articles: [{
        title: title.substring(0, 32),
        author: 'Welian 小维',
        digest: digest.substring(0, 120),
        content: html,
        content_source_url: 'https://welian.app/signals.html',
        thumb_media_id: thumbMediaId,
        need_open_comment: 1,
        only_fans_can_comment: 0,
      }],
    }),
  });
  const draftData = await draftResp.json();

  if (draftData.errcode || !draftData.media_id) {
    console.error('[evening_recap] Draft add failed:', JSON.stringify(draftData));
    return;
  }

  console.log('[evening_recap] Draft created:', draftData.media_id);

  // Submit for publish
  const publishResp = await fetch(`https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_id: draftData.media_id }),
  });
  const publishData = await publishResp.json();

  if (publishData.errcode) {
    console.error('[evening_recap] Publish submit failed:', JSON.stringify(publishData));
    return;
  }

  console.log('[evening_recap] Article published! publish_id:', publishData.publish_id);

  // Push text summary to queues
  let msg = `🌙 今日回顾 · ${today}\n\n`;
  if (report.greeting) msg += `${report.greeting}\n\n`;
  msg += `⭐ 今日5件事：\n`;
  (report.top5 || []).slice(0, 5).forEach((s, i) => {
    msg += `${i + 1}. ${s.title} [${s.source || ''}]\n`;
  });
  if (report.trend_confirmation) msg += `\n📊 趋势确认：${report.trend_confirmation}\n`;
  if (report.missed) msg += `\n👀 容易忽略：${report.missed}\n`;
  if (report.tomorrow_watch) msg += `\n🔭 明天关注：${report.tomorrow_watch}\n`;
  msg += `\n${report.closing || ''}\n\n— 用 Welian 管理你的关系：welian.app`;
  await pushSignalsToQueues(env, msg);
}

// Escape HTML for WeChat article content
function escWechat(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Upload a cover image to WeChat as permanent material
// Uses 7 pre-generated cover variants (one per weekday) with Welian brand elements + random variation
async function uploadWechatCoverImage(env, accessToken, themes, signals) {
  // Select cover variant by day of week (0=Mon … 6=Sun)
  const dayIdx = new Date().getDay(); // 0=Sun, 1=Mon, ...
  const coverIdx = (dayIdx + 6) % 7;  // convert to Mon=0 … Sun=6
  const kvKey = `wechat_thumb_media_id_${coverIdx}`;

  // Check if this day's cover is already uploaded (permanent material, reusable)
  const cachedThumb = await env.USER_DATA.get(kvKey);
  if (cachedThumb) {
    console.log(`[daily_signals] Using cached cover #${coverIdx} thumb_media_id:`, cachedThumb);
    return cachedThumb;
  }

  // Upload the cover variant for today's weekday
  try {
    const coverUrl = `https://welian.app/covers/cover-${coverIdx}.png`;
    const imgResp = await fetch(coverUrl);
    if (!imgResp.ok) {
      console.error(`[daily_signals] Cover image fetch failed for #${coverIdx}:`, imgResp.status);
      // Fallback to default cover
      const fallbackResp = await fetch('https://welian.app/wechat-cover.png');
      if (!fallbackResp.ok) return null;
      const imgBlob = await fallbackResp.blob();
      return await _uploadCoverBlob(env, accessToken, imgBlob, kvKey, coverIdx);
    }
    const imgBlob = await imgResp.blob();
    return await _uploadCoverBlob(env, accessToken, imgBlob, kvKey, coverIdx);
  } catch (e) {
    console.error('[daily_signals] Cover upload error:', e.message);
    return null;
  }
}

async function _uploadCoverBlob(env, accessToken, imgBlob, kvKey, coverIdx) {
  const formData = new FormData();
  formData.append('type', 'image');
  formData.append('media', imgBlob, `cover-${coverIdx}.png`);

  const uploadResp = await fetch(`https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${accessToken}`, {
    method: 'POST',
    body: formData,
  });
  const uploadData = await uploadResp.json();

  if (uploadData.errcode || !uploadData.media_id) {
    console.error(`[daily_signals] Cover #${coverIdx} upload failed:`, JSON.stringify(uploadData));
    return null;
  }

  // Cache the media_id permanently (permanent material won't expire)
  await env.USER_DATA.put(kvKey, uploadData.media_id);
  console.log(`[daily_signals] Cover #${coverIdx} uploaded, media_id:`, uploadData.media_id);
  return uploadData.media_id;
}

async function getWechatAccessToken(env) {
  if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET) return null;

  // Check cache first (token valid for 2h, cache 1.5h)
  const cached = await env.USER_DATA.get('wechat_access_token');
  if (cached) return cached;

  try {
    // Use stable_token API (POST) — more reliable than GET /cgi-bin/token
    const resp = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credential',
        appid: env.WECHAT_APP_ID,
        secret: env.WECHAT_APP_SECRET,
        force_refresh: false,
      }),
    });
    const data = await resp.json();
    if (data.access_token) {
      await env.USER_DATA.put('wechat_access_token', data.access_token, { expirationTtl: 5400 }); // 1.5h
      return data.access_token;
    }
    console.error('[wechat] Token error:', data.errmsg);
  } catch (e) {
    console.error('[wechat] Token fetch error:', e.message);
  }
  return null;
}

async function pushSignalsToQueues(env, msg) {
  // Push to all WeChat-bound users' queues (for bot pickup)
  const listResult = await env.USER_DATA.list({ prefix: 'wechat_bind:' });
  const pushedUsers = new Set();
  for (const key of listResult.keys) {
    const clerkUserId = await env.USER_DATA.get(key.name);
    if (clerkUserId) {
      pushedUsers.add(clerkUserId);
      const queueRaw = await env.USER_DATA.get(`push_queue:${clerkUserId}`);
      const queue = queueRaw ? JSON.parse(queueRaw) : [];
      queue.push({ type: 'daily_signals', content: msg, timestamp: new Date().toISOString() });
      await env.USER_DATA.put(`push_queue:${clerkUserId}`, JSON.stringify(queue), { expirationTtl: 86400 });
    }
  }

  // Also push to IM channels (Telegram/飞书/钉钉) for IM-bound users
  // Find all im_user: bindings
  const imList = await env.USER_DATA.list({ prefix: 'im_user:' });
  const imUsers = new Set();
  for (const key of imList.keys) {
    // key.name = "im_user:<clerkUserId>:<platform>"
    const clerkUserId = key.name.split(':')[1];
    if (clerkUserId && !pushedUsers.has(clerkUserId) && !imUsers.has(clerkUserId)) {
      imUsers.add(clerkUserId);
      pushToIMChannels(env, clerkUserId, msg).catch(e =>
        console.error(`[im_push] signals push failed for ${clerkUserId}:`, e.message)
      );
    }
  }
}

function formatWeeklyPushMessage(report) {
  const lines = [];
  lines.push('📋 小维周报');
  lines.push('');
  if (report.greeting) lines.push(report.greeting);
  lines.push('');

  if (report.review) {
    const r = report.review;
    lines.push(`📊 本周：${r.interactions || 0} 次互动 · ${r.completed_todos || 0} 个完成 · ${r.new_todos || 0} 个待办`);
    if (r.summary) lines.push(r.summary);
    lines.push('');
  }

  if (report.upcoming_dates && report.upcoming_dates.length > 0) {
    lines.push('📅 近期重要日期：');
    for (const d of report.upcoming_dates) {
      lines.push(`  ${d.name} - ${d.date.slice(5)} ${d.label}`);
    }
    lines.push('');
  }

  if (report.suggest_contact && report.suggest_contact.length > 0) {
    lines.push('💡 这周值得联系：');
    for (const s of report.suggest_contact.slice(0, 5)) {
      lines.push(`  ${s.name}：${s.reason}`);
      if (s.topic) lines.push(`    → ${s.topic}`);
    }
    lines.push('');
  }

  if (report.todo_reminders && report.todo_reminders.length > 0) {
    lines.push('✅ 待办提醒：');
    for (const t of report.todo_reminders.slice(0, 5)) {
      lines.push(`  ${t.contact || ''} - ${t.task}`);
    }
    lines.push('');
  }

  if (report.closing) lines.push(report.closing);
  lines.push('');
  lines.push('— Welian · welian.app');

  return lines.join('\n');
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

// ── Web search (Tavily > Brave > DuckDuckGo, with retry/backoff) ──

// Retry wrapper with linear backoff
async function withRetry(fn, maxAttempts = 3) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (e) {
      console.log(`[withRetry] attempt ${attempt + 1} failed:`, e.message);
    }
    if (attempt < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, attempt * 500));
    }
  }
  return null;
}

// DuckDuckGo Instant Answer API — free, no key needed
async function searchDuckDuckGo(query, limit = 5) {
  return withRetry(async () => {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'Welian/1.0' } });
    if (!resp.ok) return null;
    const data = await resp.json();
    const results = [];
    if (data.AbstractText) {
      results.push({ title: data.Heading || query, snippet: data.AbstractText, url: data.AbstractURL || '' });
    }
    if (data.RelatedTopics) {
      for (const t of data.RelatedTopics) {
        if (results.length >= limit) break;
        if (t.Text) {
          results.push({ title: (t.Text || '').split(' - ')[0] || '', snippet: t.Text, url: t.FirstURL || '' });
        } else if (t.Topics && Array.isArray(t.Topics)) {
          for (const sub of t.Topics) {
            if (results.length >= limit) break;
            if (sub.Text) {
              results.push({ title: (sub.Text || '').split(' - ')[0] || '', snippet: sub.Text, url: sub.FirstURL || '' });
            }
          }
        }
      }
    }
    return results.slice(0, limit);
  });
}

// Brave Search API — free 2000/month, needs BRAVE_API_KEY
async function searchBrave(query, env, limit = 5) {
  const apiKey = env.BRAVE_API_KEY;
  if (!apiKey) return null; // not configured
  return withRetry(async () => {
    const resp = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`, {
      headers: { 'X-Subscription-Token': apiKey, 'Accept': 'application/json' },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.web || !data.web.results) return [];
    return data.web.results.map(r => ({ title: r.title || '', snippet: r.description || '', url: r.url || '' }));
  });
}

// Tavily Search API — AI-optimized, free 1000/month, needs TAVILY_API_KEY
async function searchTavily(query, env, limit = 5, days = null) {
  const apiKey = env.TAVILY_API_KEY;
  if (!apiKey) return null; // not configured
  return withRetry(async () => {
    const body = {
      api_key: apiKey,
      query,
      max_results: limit,
      search_depth: 'basic',
    };
    if (days) body.days = days;
    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.results || !Array.isArray(data.results)) return [];
    return data.results.map(r => ({
      title: r.title || '',
      snippet: r.content || '',
      url: r.url || '',
      published_date: r.published_date || '',
    }));
  });
}

// Unified search: Tavily > Brave > DuckDuckGo API > DuckDuckGo HTML > Google > Mojeek > Sogou > cn.bing > Wikipedia
// Free no-key sources: DuckDuckGo, Google, Mojeek, Sogou, cn.bing, Wikipedia
async function webSearch(query, env, limit = 5, days = null) {
  // 1. Tavily (best for AI, 1000/month free, needs key)
  const tavilyResults = await searchTavily(query, env, limit, days);
  if (tavilyResults && tavilyResults.length > 0) {
    return { provider: 'tavily', results: tavilyResults };
  }
  // 2. Brave (2000/month free, needs key)
  const braveResults = await searchBrave(query, env, limit);
  if (braveResults && braveResults.length > 0) {
    return { provider: 'brave', results: braveResults };
  }
  // 3. DuckDuckGo API (unlimited free, no key, but often empty results)
  const ddgResults = await searchDuckDuckGo(query, limit);
  if (ddgResults && ddgResults.length > 0) {
    return { provider: 'duckduckgo', results: ddgResults };
  }
  // 4. DuckDuckGo HTML (free, no key — more results than API version)
  const ddgHtmlResults = await searchDuckDuckGoHtml(query, limit);
  if (ddgHtmlResults && ddgHtmlResults.length > 0) {
    return { provider: 'duckduckgo_html', results: ddgHtmlResults };
  }
  // 5. Google HTML (free, no key — may be rate-limited from cloud IPs)
  const googleResults = await searchGoogleHtml(query, limit);
  if (googleResults && googleResults.length > 0) {
    return { provider: 'google', results: googleResults };
  }
  // 6. Mojeek (free, no key — independent search engine, no tracking)
  const mojeekResults = await searchMojeek(query, limit);
  if (mojeekResults && mojeekResults.length > 0) {
    return { provider: 'mojeek', results: mojeekResults };
  }
  // 7. Sogou (CN free, no key — best CN query quality)
  const sogouResults = await searchSogou(query, limit);
  if (sogouResults && sogouResults.length > 0) {
    return { provider: 'sogou', results: sogouResults };
  }
  // 8. cn.bing (CN free, no key — broader coverage)
  const bingCnResults = await searchBingCN(query, limit);
  if (bingCnResults && bingCnResults.length > 0) {
    return { provider: 'bing_cn', results: bingCnResults };
  }
  // 9. Wikipedia API (free, no key — knowledge/encyclopedia fallback)
  const wikiResults = await searchWikipedia(query, limit);
  return { provider: 'wikipedia', results: wikiResults || [] };
}

// DuckDuckGo HTML search — free, no key, more results than API version
// Uses html.duckduckgo.com which returns full organic results
async function searchDuckDuckGoHtml(query, limit = 5) {
  return withRetry(async () => {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const results = [];
    // DDG HTML results are in <a class="result__a" href="...">title</a>
    // Snippets in <a class="result__snippet">
    const blockRegex = /<div class="result[^"]*"[^>]*>(.*?)<\/div>\s*<\/div>/gs;
    const blocks = html.match(blockRegex) || [];
    for (const block of blocks) {
      if (results.length >= limit) break;
      const aMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/s);
      const snipMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/s);
      if (!aMatch) continue;
      const title = aMatch[2].replace(/<[^>]+>/g, '').trim();
      // DDG wraps URLs in a redirect — extract actual URL from uddg parameter
      let href = aMatch[1];
      const uddgMatch = href.match(/uddg=([^&]+)/);
      if (uddgMatch) href = decodeURIComponent(uddgMatch[1]);
      const snippet = snipMatch ? snipMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      if (title && href.startsWith('http')) {
        results.push({ title, snippet, url: href });
      }
    }
    return results;
  });
}

// Google HTML search — free, no key
// Note: Google may return CAPTCHA from cloud IPs, but works from residential
async function searchGoogleHtml(query, limit = 5) {
  return withRetry(async () => {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${limit}&hl=zh-CN`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const results = [];
    // Google organic results: <div class="g"> containing <a href="/url?q=..."> or direct href
    // Also <div data-sokoban-container> in newer layouts
    const blockRegex = /<div class="g"[^>]*>(.*?)<\/div>\s*<\/div>/gs;
    const blocks = html.match(blockRegex) || [];
    for (const block of blocks) {
      if (results.length >= limit) break;
      // Extract first <a> with href starting with /url?q= or http
      const aMatch = block.match(/<a[^>]*href="(?:\/url\?q=)?(https?:\/\/[^"&]+)"/);
      const titleMatch = block.match(/<h3[^>]*>(.*?)<\/h3>/s);
      if (!aMatch || !titleMatch) continue;
      const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      const href = aMatch[1];
      // Extract snippet from <span> or <div> after the link
      const snipMatch = block.match(/<span[^>]*>(.*?)<\/span>/s);
      const snippet = snipMatch ? snipMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 180) : '';
      if (title && href.startsWith('http') && !href.includes('google.com')) {
        results.push({ title, snippet, url: href });
      }
    }
    return results;
  });
}

// Mojeek search — free, no key, independent search engine (no tracking, no bubble)
// Good fallback when Google/DDG are blocked or rate-limited
async function searchMojeek(query, limit = 5) {
  return withRetry(async () => {
    const url = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const results = [];
    // Mojeek results in <ul class="results-standard"> > <li> > <a class="ob" href="...">
    const blockRegex = /<li[^>]*>(.*?)<\/li>/gs;
    const blocks = html.match(blockRegex) || [];
    for (const block of blocks) {
      if (results.length >= limit) break;
      const aMatch = block.match(/<a[^>]*class="[^"]*ob[^"]*"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/s);
      if (!aMatch) continue;
      const title = aMatch[2].replace(/<[^>]+>/g, '').trim();
      const href = aMatch[1];
      // Mojeek snippet in <p class="s">
      const snipMatch = block.match(/<p[^>]*class="[^"]*s[^"]*"[^>]*>(.*?)<\/p>/s);
      const snippet = snipMatch ? snipMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      if (title && href.startsWith('http')) {
        results.push({ title, snippet, url: href });
      }
    }
    return results;
  });
}

// Wikipedia API — free, no key, knowledge/encyclopedia fallback
// Searches both Chinese and English Wikipedia, returns article summaries
async function searchWikipedia(query, limit = 5) {
  return withRetry(async () => {
    const results = [];
    // Try Chinese Wikipedia first, then English
    for (const lang of ['zh', 'en']) {
      if (results.length >= limit) break;
      const apiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${Math.min(limit - results.length, 3)}&format=json&origin=*`;
      const resp = await fetch(apiUrl, {
        headers: { 'User-Agent': 'Welian/1.0 (https://welian.app)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const searchResults = data?.query?.search;
      if (!searchResults) continue;
      for (const item of searchResults) {
        const title = item.title || '';
        const snippet = (item.snippet || '').replace(/<[^>]+>/g, '').trim();
        const url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
        results.push({ title: `${title} (${lang === 'zh' ? '中文维基' : 'Wikipedia'})`, snippet, url });
      }
    }
    return results;
  });
}

// Sogou search — free, no key, best CN query quality (e.g. financial/person names)
// Pure HTML scrape, works where DuckDuckGo/Tavily/Brave are blocked
async function searchSogou(query, limit = 5) {
  return withRetry(async () => {
    const url = `https://www.sogou.com/web?query=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const results = [];
    // Sogou organic results are in <div class="vrwrap"> blocks
    const blocks = html.split('<div class="vrwrap"').slice(1);
    for (const block of blocks) {
      if (results.length >= limit) break;
      // Extract title from first <a target="_blank">
      const titleMatch = block.match(/<a[^>]*target="_blank"[^>]*>(.*?)<\/a>/s);
      const hrefMatch = block.match(/<a[^>]*href="([^"]*)"/);
      if (!titleMatch || !hrefMatch) continue;
      const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      let href = hrefMatch[1];
      if (href.startsWith('/')) href = 'https://www.sogou.com' + href;
      if (title && href) {
        results.push({ title, snippet: '', url: href });
      }
    }
    return results;
  });
}

// cn.bing.com search — free, no key, works in CN where other engines are blocked
// Pure HTML scrape, returns real URLs (not jump links)
async function searchBingCN(query, limit = 5) {
  return withRetry(async () => {
    const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const results = [];
    // Bing organic results are in <li class="b_algo"> blocks
    const blockRegex = /<li class="b_algo"[^>]*>(.*?)<\/li>/gs;
    const blocks = html.match(blockRegex) || [];
    for (const block of blocks) {
      if (results.length >= limit) break;
      // Extract <h2><a href="...">title</a></h2>
      const h2Match = block.match(/<h2[^>]*>(.*?)<\/h2>/s);
      if (!h2Match) continue;
      const aMatch = h2Match[1].match(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/s);
      if (!aMatch) continue;
      const title = aMatch[2].replace(/<[^>]+>/g, '').trim();
      const href = aMatch[1];
      // Extract snippet from first <p>
      const pMatch = block.match(/<p[^>]*>(.*?)<\/p>/s);
      const snippet = pMatch ? pMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 180) : '';
      if (title && href.startsWith('http')) {
        results.push({ title, snippet, url: href });
      }
    }
    return results;
  });
}

// Format search results for LLM context injection
function formatSearchResults(searchResult) {
  if (!searchResult || !searchResult.results || searchResult.results.length === 0) {
    return '';
  }
  let text = `\n--- 互联网搜索结果（来源：${searchResult.provider}）---\n`;
  searchResult.results.forEach((r, i) => {
    text += `[${i + 1}] ${r.title}\n${r.snippet}\n${r.url ? `URL: ${r.url}\n` : ''}\n`;
  });
  text += '--- 搜索结果结束 ---\n';
  return text;
}

// ── Web page reader (G4) ──
// Uses Jina Reader API (free, no key) to fetch web pages as Markdown
// SSRF protection: blocks localhost, private IPs, non-http(s)

function isUrlAllowed(url) {
  try {
    const parsed = new URL(url.trim());
    if (!['http:', 'https:'].includes(parsed.protocol.toLowerCase())) return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
    // Block obvious private IP ranges
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|169\.254\.)/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

async function readUrl(url, env) {
  if (!isUrlAllowed(url)) {
    return { status: 'error', error: 'URL not allowed (blocked by SSRF protection)' };
  }
  const JINA_PREFIX = 'https://r.jina.ai/';
  const MAX_LENGTH = 8000;
  try {
    const resp = await fetch(`${JINA_PREFIX}${url.trim()}`, {
      headers: { 'Accept': 'text/markdown' },
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) {
      return { status: 'error', error: `Reader returned HTTP ${resp.status}` };
    }
    let text = await resp.text();
    let title = '';
    for (const line of text.split('\n')) {
      if (line.startsWith('Title:')) {
        title = line.slice(6).trim();
        break;
      }
    }
    const isCached = text.includes('Warning: This is a cached snapshot');
    if (text.length > MAX_LENGTH) {
      text = text.slice(0, MAX_LENGTH) + `\n\n... (截断，共 ${text.length} 字)`;
    }
    return {
      status: 'ok',
      title,
      url: url.trim(),
      content: text,
      length: text.length,
      cached: isCached || false,
    };
  } catch (e) {
    return { status: 'error', error: `Reader request failed: ${e.message}` };
  }
}

// POST /ai/read_url — {url: "https://..."}
async function handleReadUrl(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };
  const url = body.url;
  if (!url || typeof url !== 'string') {
    return { status: 400, data: { error: 'url required' } };
  }
  const result = await readUrl(url, env);
  return { status: 200, data: result };
}
