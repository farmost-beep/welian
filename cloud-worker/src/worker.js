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
  points_per_1k_input: 1,
  points_per_1k_output: 2,
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
  await env.USER_DATA.put(`billing:${userId}`, JSON.stringify(data));
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
  const points = Math.round(basePoints * tierMultiplier * 10) / 10;
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

  // Return reply + usage + billing info
  return {
    status: 200,
    data: {
      reply: llmResp.text,
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
  <p>Welian 是你的 AI 关系管理助手，帮你：</p>
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

    // Create new meeting
    const id = body.id || `mtg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const meeting = {
      id,
      title,
      date: body.date || new Date().toISOString().slice(0, 10),
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
    const meetings = await loadDataset(env, userId, 'meetings');
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

  const validTypes = ['agenda', 'card', 'notes'];
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
只返回JSON，不要其他文字。`,

    card: `你是Welian小维的会议助手。请分析这张名片/合影照片，识别其中的人物信息，以JSON格式返回：
{
  "attendees": [{"name": "姓名", "title": "职位（如能识别，否则空字符串）", "company": "公司（如能识别，否则空字符串）", "relationship": "与用户的关系（如能推断，否则空字符串）"}]
}
核心目标：识别出人名。其他信息（职位、公司等）能识别就填，识别不到就留空，不要猜测。
如果是名片，提取名片上的姓名和可选信息。如果是合影，识别能看到的人名（如胸牌、字幕等），识别不到具体名字的可以描述角色（如"主讲人""主持人"）。
只返回JSON，不要其他文字。`,

    notes: `你是Welian小维的会议助手。请分析这张会议笔记/白板照片，提取关键信息，以JSON格式返回：
{
  "opportunities": [{"description": "机会描述", "type": "collaboration|referral|insight|resource", "potential": "high|medium|low"}],
  "follow_ups": [{"task": "跟进事项", "contact_name": "相关人名（如有）", "due": "建议时间（如有）"}],
  "contact_dynamics": "人际观察（谁和谁熟、谁支持什么观点等，一段话）",
  "key_points": ["关键要点1", "关键要点2"]
}
只返回JSON，不要其他文字。`,
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
  try {
    // Strip markdown code fences if present
    const jsonText = result.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    extracted = JSON.parse(jsonText);
  } catch (e) {
    console.error('[meeting_photo] JSON parse failed:', e.message, result.text.substring(0, 200));
    return { status: 200, data: { status: 'error', error: '识别结果格式异常', raw: result.text, fallback: true } };
  }

  // For card type: match against existing contacts
  if (photo_type === 'card' && extracted.attendees) {
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
  const todos = await loadDataset(env, userId, 'todos');

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

  const system = `你是Welian小维，社交关系管理助手。用户刚参加完一场会议，请基于会议信息生成会后复盘建议。

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
  "follow_up_todos": [{"task": "跟进事项", "contact_name": "相关人", "due": "建议日期YYYY-MM-DD", "priority": "high|medium|low"}],
  "opportunity_analysis": [{"description": "机会描述", "action": "建议行动", "contact_name": "相关人"}],
  "leverage_insights": "如何借这次会议撬动现有合作型联系人的建议（一段话）",
  "goal_suggestions": ["这次会议可能推进的目标方向"]
}
只返回JSON，不要其他文字。`;

  const result = await callLLM('请生成会后复盘建议。', system, env, {
    max_tokens: 1024,
    temperature: 0.5,
  });

  if (!result) {
    return { status: 200, data: { status: 'error', error: '复盘生成失败，请重试', fallback: true } };
  }

  let review;
  try {
    const jsonText = result.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    review = JSON.parse(jsonText);
  } catch (e) {
    return { status: 200, data: { status: 'error', error: '复盘格式异常', raw: result.text, fallback: true } };
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

  // Auto-create follow-up todos
  if (review.follow_up_todos && review.follow_up_todos.length > 0) {
    for (const ft of review.follow_up_todos) {
      if (!ft.task) continue;
      const contact = ft.contact_name ? contacts.find(c => c.name === ft.contact_name) : null;
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
    }
    await saveDataset(env, userId, 'todos', todos);
  }

  // Update meeting with review
  meeting.summary = review.summary || '';
  meeting.status = 'completed';
  meeting.updated = new Date().toISOString();
  const idx = meetings.findIndex(m => m.id === meeting_id);
  meetings[idx] = meeting;
  await saveDataset(env, userId, 'meetings', meetings);

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
  const points = Math.round((est.input / 1000 * pricing.points_per_1k_input + est.output / 1000 * pricing.points_per_1k_output) * tier * 10) / 10;
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
  const _intentFallback = `你是一个关系管理助手。分析用户消息，提取意图和数据操作。只返回JSON，不要其他内容。

今天是 ${todayDateStr}。所有日期计算以此为准。

JSON格式：
{
  "intent": "query_contact|query_todo|record|draft|advise|report|chat|help|update_profile",
  "contact_name": "用户提到的人名或昵称，没有则为空字符串",
  "keywords": ["搜索关键词，用于模糊匹配联系人"],
  "actions": [],
  "profile_updates": {},
  "memory_save": null,
  "goal_evidence": null,
  "needs_search": false,
  "search_query": ""
}

intent 说明：
- query_contact: 查询某人的信息（"老许啥情况"、"查下邵哥"）
- query_todo: 查看待办（"有啥待办"、"待办事项"）
- record: 记录互动/添加待办/添加联系人
- draft: 拟写消息（"给老许写个消息"、"帮我拟条消息"）
- advise: 建议联系谁（"该联系谁"、"这周联系谁"、"谁该联系了"）
- report: 回顾/报告（"月度回顾"、"这月怎么样"、"周报"、"总结一下"）
- chat: 闲聊/其他
- help: 帮助
- update_profile: 用户主动要求更新画像（"更新我的画像"、"修改我的信息"）

needs_search：用户问题需要互联网最新信息时设为 true，并在 search_query 填搜索关键词。
- 需要搜索的场景：问某人/某公司最近动态、行业新闻、热点事件、实时信息
- 不需要搜索的场景：记录互动、查待办、查联系人、拟消息、闲聊、关系建议
- 示例："XX公司最近怎么样" → needs_search=true, search_query="XX公司 最新动态"
- 示例："记一下今天和老许聊了项目" → needs_search=false

memory_save：用户消息中包含值得长期记住的信息时，提取为记忆对象。没有则为 null。
- 触发场景：用户偏好（"别在周末推消息"）、重要背景（"我女儿叫小美"）、关键决策（"决定每月联系一次老许"）、人际洞察（"老许最近在创业"）
- 不触发场景：普通记录互动、查待办、闲聊、一次性事务
- 格式：{"type": "preference|context|milestone|contact_note", "title": "简短标题", "content": "详细内容", "tags": ["可选标签"]}
- 示例："我一般不在周末联系客户" → {"type":"preference","title":"周末不联系客户","content":"用户偏好：周末不主动联系客户，工作日才联系","tags":["沟通偏好"]}
- 示例："老许最近在搞AI创业" → {"type":"contact_note","title":"老许在AI创业","content":"老许最近在做AI相关的创业项目","tags":["老许","创业"]}

goal_evidence：用户消息中提到完成了某个关系目标的步骤时，提取为证据。没有则为 null。
- 触发场景：用户提到联系了某人、完成了某事、达成了某里程碑，且与现有目标的验收标准相关
- 格式：{"goal_id": "目标ID（不确定时留空）", "criterion_text": "匹配的验收标准文本", "evidence_text": "证据描述"}
- 示例："今天和老许聊了项目" → {"goal_id":"", "criterion_text":"联系老许", "evidence_text":"今天和老许聊了项目"}
- 不触发场景：没有活跃目标、消息与目标无关

profile_updates 是从用户消息中自动提取的用户画像信息。用户在对话中自然提到自己的信息时，提取对应字段。只填能从消息中明确提取的字段，不确定的不填。

profile_updates 可选字段：
- name: 姓名
- occupation: 职业
- company: 公司
- industry: 行业
- location: 所在地
- communication_style: 沟通风格
- address_habit: 称呼习惯
- focus_areas: 关注领域
- message_tone: 拟消息语气偏好
- career_goal: 当前职业目标
- current_projects: 正在推进的事
- network_direction: 人脉方向
- notes: 附注（大段文字，如个人简介、背景资料）

profile_updates 提取示例：
- "我在邮储银行做科技金融" → {"occupation":"科技金融","company":"邮储银行"}
- "我一般叫他们老X" → {"address_habit":"老X"}
- "最近在推量化圈的人脉" → {"network_direction":"量化圈"}
- 用户没提到自己的信息 → profile_updates = {}（空对象）

actions 是需要执行的数据操作数组。【关键】只有用户明确表达记录/提醒/添加意图时才生成 actions，否则 actions 必须为空数组 []。

actions 元素格式：
- {"type":"add_timeline","contact_name":"人名","summary":"互动摘要","date":"YYYY-MM-DD"}
- {"type":"add_contact","name":"人名","relation":"关系","phone":"电话","email":"邮箱","notes":"备注"}
- {"type":"add_todo","task":"待办内容","contact_name":"关联人名","due":"YYYY-MM-DD","priority":"P0|P1|P2"}
- {"type":"complete_todo","task":"待办内容关键词","contact_name":"关联人名"}
- {"type":"delete_todo","task":"待办内容关键词","contact_name":"关联人名"}
- {"type":"update_contact","contact_name":"人名","fields":{"name":"新名","relation":"新关系","company":"新公司","title":"新职位","phone":"新电话","email":"新邮箱","notes":"新备注","nature":"leverage|nurture"}}
- {"type":"merge_contact","source_name":"被合并的联系人名","target_name":"合并到哪个联系人名"}

【add_todo 三要素规则 — 必须遵守】：
待办事项必须包含三个要素：时间、人物、事情。
- task（事情）：必须有，来自用户原话
- contact_name（人物）：尽量提取用户消息中提到的人名。如果待办明确关联某个人，必须填入 contact_name。如果待办是通用事项（如"买牛奶"）不关联具体人，才允许为空
- due（时间）：尽量从用户消息中提取。用户说"下周""明天""月底"等 → 推算为 YYYY-MM-DD。如果用户没说时间 → 填今天后 7 天的日期（给一个合理默认期限）

【严格规则 — 必须遵守】：
${isOnboarding ? `【引导模式特殊规则】这是新用户引导场景，用户正在描述最近和谁聊过。即使没有"记一下"等指令词，也要：
- 从用户消息中提取所有人名，为每个不重复的人名生成 add_contact action
- 如果用户提到了互动内容（吃了饭、开了会、聊了XX），同时生成 add_timeline action
- intent 固定为 "record"
- 不要等待用户说"记一下"，直接提取并创建` : ''}
1. 生成 actions 的前提是用户消息中包含明确的记录/操作指令词：
   - 记录类："记一下"、"记录"、"备注"、"补充"
   - 提醒类："提醒我"、"待办"、"todo"、"别忘了"
   - 添加类："认识了一个"、"新认识"、"加个联系人"、"存一下"、"记一下XX"（仅人名无互动内容时视为添加联系人）
   - 完成类："完成了"、"做完了"、"搞定了"、"标记完成"、"已经联系了"
   - 删除类："删除"、"删掉"、"去掉"、"取消这个待办"
   - 修改类："改一下"、"更新"、"修改"、"把XX改成YY"、"把XX的公司改成YY"
   - 合并类："合并到"、"合并到XX名下"、"把XX合并到YY"、"XX和YY是同一个人"
2. 如果用户只是在查询、闲聊、或提到某个人但没说要记录 → actions=[]
   - "老许啥情况" → actions=[]（查询，不是记录）
   - "昨天和老许吃了饭" → actions=[]（陈述，没说"记一下"）
   - "老许是做什么的" → actions=[]（查询）
3. summary 和 task 必须直接来自用户消息的原话，不能改写、扩展或编造
4. 如果用户没有提供日期，add_timeline 的 date 用今天日期；add_todo 的 due 用今天后 7 天
5. 不能凭空创造人名——contact_name 必须在用户消息中明确出现
6. complete_todo 和 delete_todo 的 task 字段是待办内容的关键词（用于匹配），不是完整内容
7. update_contact 的 fields 只包含用户明确要改的字段，不要包含未提及的字段
8. merge_contact 的 source_name 是被合并（被删除）的联系人，target_name 是保留的联系人

示例：
- "老许啥情况" → intent=query_contact, actions=[]
- "有啥待办" → intent=query_todo, actions=[]
- "该联系谁了" → intent=advise, actions=[]
- "月度回顾" → intent=report, actions=[]
- "这周总结" → intent=report, actions=[]
- "记一下今天和老许聊了Q3预算" → intent=record, actions=[{"type":"add_timeline","contact_name":"老许","summary":"聊了Q3预算","date":"今天日期"}]
- "记一下徐良建" → intent=record, actions=[{"type":"add_contact","name":"徐良建","relation":"","notes":""}]（仅人名无互动内容时，生成 add_contact 而非 add_timeline）
- "记一下老许" → intent=record, actions=[{"type":"add_contact","name":"老许","relation":"","notes":""}]（同上）
- "提醒我下周拜访张三" → intent=record, actions=[{"type":"add_todo","task":"拜访张三","contact_name":"张三","due":"下周五日期","priority":"P1"}]
- "认识了一个新朋友李四，在腾讯做产品" → intent=record, actions=[{"type":"add_contact","name":"李四","relation":"朋友","notes":"腾讯产品"}]
- "昨天和老许吃了饭" → intent=chat, actions=[]（用户没说"记一下"，不自动记录）
- "帮我给老许写个消息" → intent=draft, actions=[]
- "你好" → intent=chat, actions=[]
- "拜访张三的待办完成了" → intent=record, actions=[{"type":"complete_todo","task":"拜访张三","contact_name":"张三"}]
- "删掉买牛奶的待办" → intent=record, actions=[{"type":"delete_todo","task":"买牛奶"}]
- "把老许的公司改成腾讯" → intent=record, actions=[{"type":"update_contact","contact_name":"老许","fields":{"company":"腾讯"}}]
- "老许的电话是13800138000" → intent=record, actions=[{"type":"update_contact","contact_name":"老许","fields":{"phone":"13800138000"}}]
- "存一下小李的电话13912345678" → intent=record, actions=[{"type":"update_contact","contact_name":"小李","fields":{"phone":"13912345678"}}]
- "老许其实是陪伴型关系" → intent=record, actions=[{"type":"update_contact","contact_name":"老许","fields":{"nature":"nurture"}}]
- "把张总合并到张成吉名下" → intent=record, actions=[{"type":"merge_contact","source_name":"张总","target_name":"张成吉"}]
- "张总和张成吉是同一个人，合并到张成吉" → intent=record, actions=[{"type":"merge_contact","source_name":"张总","target_name":"张成吉"}]`;

  try {
    const system = await getPrompt(env, 'intent', _intentFallback);
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
              c.name.includes(action.contact_name));
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
              source: 'ai_extract',
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

  const system = await getPrompt(env, 'proactive', `你是小维，一个关系管理 AI 助手。根据用户当前的环境和数据，生成 1-2 条贴心建议。只引用数据中提供的信息，不能编造事件。输出 JSON 数组。`);

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
async function saveDataset(env, userId, name, data) {
  // No expirationTtl — todos/timeline/contacts should persist indefinitely.
  // (Previous 604800s/7day TTL caused data loss and stale reads.)
  await env.USER_DATA.put(`${name}:${userId}`, JSON.stringify(data));
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
  await env.USER_DATA.put(`metrics:${userId}`, JSON.stringify(metrics));
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

// Track a relationship action event (North Star metric)
async function trackAction(env, userId, actionType, meta = {}) {
  if (!userId) return;
  const metrics = await loadMetrics(env, userId);
  const wk = getWeekKey(new Date().toISOString());
  if (!metrics.weekly[wk]) {
    metrics.weekly[wk] = { advise_generated: 0, todo_completed: 0, interaction_recorded: 0, draft_generated: 0 };
  }
  if (metrics.weekly[wk][actionType] !== undefined) {
    metrics.weekly[wk][actionType]++;
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
    metrics.weekly[wk] = { advise_generated: 0, todo_completed: 0, interaction_recorded: 0, draft_generated: 0 };
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
    // Return list with key fields for display
    const list = contacts.map(c => ({
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
      updated: c.updated || '',
    }));
    return { status: 200, data: { contacts: list, total: contacts.length } };
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
    let timeline = await loadDataset(env, userId, 'timeline');
    if (contactId) {
      timeline = timeline.filter(t => t.contact === contactId);
    }
    timeline.sort((a, b) => new Date((b.date || '1970-01-01').substring(0, 10)) - new Date((a.date || '1970-01-01').substring(0, 10)));
    return { status: 200, data: { timeline: timeline.slice(0, 200) } };
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

  // Pending todos with due dates → VEVENT (all-day)
  todos.forEach(t => {
    if (t.status && t.status !== 'pending') return;
    if (!t.due) return;
    const due = t.due.length === 10 ? t.due : t.due.substring(0, 10);
    if (!due) return;
    const summary = escapeICal(t.task || '待办');
    const contactName = (contacts.find(c => c.id === t.contact) || {}).name;
    const desc = contactName ? escapeICal(`联系人: ${contactName}`) : '';
    const priorityMap = { P1: '1', P2: '5', P3: '9' };
    events.push(
      `BEGIN:VEVENT` +
      `\nUID:${t.id}@welian.app` +
      `\nDTSTAMP:${dtstamp}` +
      `\nDTSTART;VALUE=DATE:${due.replace(/-/g, '')}` +
      `\nSUMMARY:${summary}` +
      (desc ? `\nDESCRIPTION:${desc}` : '') +
      (t.priority ? `\nPRIORITY:${priorityMap[t.priority] || '5'}` : '') +
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
        `\nSUMMARY:${escapeICal(c.name)} - ${escapeICal(label)}` +
        `\nRRULE:FREQ=YEARLY` +
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
      'Cache-Control': 'no-cache, max-age=3600',
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

      if (path === '/ai/hn_signals' && method === 'POST') {
        const r = await handleHnSignals(request, env);
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
    ctx.waitUntil(handleScheduledPush(env).catch(e => captureException(env, e, {
      tags: { handler: 'scheduled' },
    })));
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

// ── HN Signals: Always-on Hacker News briefing, personalized with user context ──

const HN_SIGNALS_SYSTEM = `You are Welian (小维), generating a personalized tech signal briefing from Hacker News.

IMPORTANT: Return ONLY a valid JSON object. No markdown, no code fences, no text before or after the JSON.

Return JSON with this exact structure:
{
  "greeting": "一句话开场，结合用户行业背景",
  "signals": [
    {
      "title": "故事标题（中文）",
      "url": "原始链接",
      "hn_url": "HN 讨论链接",
      "points": 分数,
      "why": "为什么这对用户重要（结合用户行业/联系人上下文）",
      "action": "建议行动：可以跟谁聊/分享给谁/关注什么",
      "tags": ["标签1", "标签2"]
    }
  ],
  "themes": ["本轮热点主题1", "热点主题2"],
  "closing": "一句话收尾"
}

Rules:
- 最多选 8 条高信号故事
- "why" 必须结合用户的行业（金融科技/银行/支付）和联系人网络
- "action" 要具体：提到可以分享给的联系人类型或具体方向
- 中文输出，简洁有力
- 如果没有特别相关的，诚实说"今天没有强相关信号"`;

async function handleHnSignals(req, env) {
  const body = await req.json().catch(() => ({}));
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) return { status: 401, data: { error: 'Authentication required' } };

  // Cache: same-day cache (25h TTL)
  const todayKey = new Date().toISOString().slice(0, 10);
  const cacheKey = `hn_signals:${userId}:${todayKey}`;
  const cached = await env.USER_DATA.get(cacheKey);
  if (cached) {
    return { status: 200, data: JSON.parse(cached) };
  }

  // Fetch top HN stories
  let hnStories = [];
  try {
    // Use Algolia API for top stories (more reliable than Firebase for Workers)
    const searchResp = await fetch('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30', {
      headers: { 'User-Agent': 'Welian/1.0' },
    });
    if (searchResp.ok) {
      const searchData = await searchResp.json();
      hnStories = (searchData.hits || []).map(h => ({
        title: h.title || h.story_title || '',
        url: h.url || h.story_url || '',
        points: h.points || 0,
        comments: h.num_comments || 0,
        objectID: h.objectID,
        created_at: h.created_at || '',
      })).filter(s => s.title).slice(0, 25);
    }
  } catch (e) {
    console.error('HN fetch error:', e.message);
  }

  if (hnStories.length === 0) {
    return { status: 200, data: { ok: true, report: { greeting: '今天暂时无法获取 HN 数据', signals: [], themes: [], closing: '稍后再试' }, raw_data: { stories: [] } } };
  }

  // Load user context for personalization
  const contacts = await loadDataset(env, userId, 'contacts');
  const timeline = await loadDataset(env, userId, 'timeline');
  const todos = await loadDataset(env, userId, 'todos');

  // Build user context summary
  const topContacts = contacts.slice(0, 30).map(c => ({
    name: c.name, relation: c.relation || '', sub_relation: c.sub_relation || '',
    company: c.company || '', tags: (c.tags || []).slice(0, 5),
  }));
  const recentTimeline = timeline.slice(-10).map(t => ({
    contact: t.contact || '', summary: (t.summary || t.action || '').substring(0, 80),
  }));
  const pendingTodos = todos.filter(t => !isTodoDone(t)).slice(0, 5).map(t => ({
    task: (t.task || '').substring(0, 80), contact: t.contact || '',
  }));

  const userContext = JSON.stringify({
    contacts: topContacts,
    recent_interactions: recentTimeline,
    pending_todos: pendingTodos,
    contact_count: contacts.length,
  });

  const storiesText = hnStories.map((s, i) =>
    `${i + 1}. [${s.points}pts ${s.comments}comments] ${s.title}\n   URL: ${s.url || '(no url)'}\n   HN: https://news.ycombinator.com/item?id=${s.objectID}`
  ).join('\n');

  const prompt = `Today's top Hacker News stories:
${storiesText}

User context (their contacts, recent interactions, pending todos):
${userContext}

From these HN stories, select the ones most relevant to this user. The user works in fintech/banking/payments and has the contacts shown above. Generate personalized signals that connect HN stories to their professional network and relationship goals.`;

  const llmResp = await callLLM(prompt, await getPrompt(env, 'hn_signals', HN_SIGNALS_SYSTEM), env, { max_tokens: 2048, temperature: 0.7 });

  let report;
  if (llmResp && llmResp.text) {
    try {
      let cleaned = llmResp.text.trim();
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      report = JSON.parse(cleaned);
    } catch (e) {
      report = { greeting: '今日 HN 信号', signals: [], themes: [], closing: '解析失败，稍后再试', raw: llmResp.text.substring(0, 500) };
    }
  } else {
    report = { greeting: '今日 HN 信号', signals: [], themes: [], closing: '生成失败，稍后再试' };
  }

  // Deduct billing (unified)
  if (llmResp && llmResp.usage) {
    await deductBilling(env, userId, llmResp.usage, 'hn_signals');
  }

  const resultData = { ok: true, report, raw_data: { stories: hnStories, generated_at: new Date().toISOString() } };
  await env.USER_DATA.put(cacheKey, JSON.stringify(resultData), { expirationTtl: 90000 });
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
async function searchTavily(query, env, limit = 5) {
  const apiKey = env.TAVILY_API_KEY;
  if (!apiKey) return null; // not configured
  return withRetry(async () => {
    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: limit,
        search_depth: 'basic',
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.results || !Array.isArray(data.results)) return [];
    return data.results.map(r => ({ title: r.title || '', snippet: r.content || '', url: r.url || '' }));
  });
}

// Unified search: Tavily > Brave > DuckDuckGo API > DuckDuckGo HTML > Google > Mojeek > Sogou > cn.bing > Wikipedia
// Free no-key sources: DuckDuckGo, Google, Mojeek, Sogou, cn.bing, Wikipedia
async function webSearch(query, env, limit = 5) {
  // 1. Tavily (best for AI, 1000/month free, needs key)
  const tavilyResults = await searchTavily(query, env, limit);
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
