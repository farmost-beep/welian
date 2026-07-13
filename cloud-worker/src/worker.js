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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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
  const clerkDomain = env.CLERK_FRONTEND_DOMAIN || 'fancy-kingfish-81.clerk.accounts.dev';

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

  const result = await verifyClerkToken(token, env);
  if (!result.valid) {
    return null;
  }
  return result.user_id;
}

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

async function callLLM(prompt, system, env, options = {}) {
  const apiKey = env.LLM_API_KEY;
  if (!apiKey) {
    console.error('LLM_API_KEY not set');
    return null;
  }

  const model = env.LLM_MODEL || 'claude-sonnet-4-6';
  const baseUrl = env.LLM_BASE_URL || 'https://api.anthropic.com';

  const body = {
    model: model,
    max_tokens: options.max_tokens || 1024,
    messages: options.messages || [{ role: 'user', content: prompt }],
  };
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
          'x-api-key': apiKey,
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
        return { text, usage };
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
  const llmResp = await callLLM(prompt, DRAFT_SYSTEM, env);
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

  return { result };
}

async function handleExtract(req, env) {
  const body = await req.json();

  const interactionText = body.interaction_text || '';
  const contactName = body.contact_name || '';

  const prompt = `Interaction: ${interactionText}\nContact: ${contactName || 'unknown'}`;
  const llmResp = await callLLM(prompt, EXTRACT_SYSTEM, env);
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
  const llmResp = await callLLM(parts.join('\n'), ADVISE_SYSTEM, env);
  const llmResult = llmResp ? llmResp.text : null;
  return { result: llmResult || parts.join('\n') };
}

// ── 方案C：计费网关 ──

async function handleChat(req, env) {
  const body = await req.json();

  const messages = body.messages;
  const system = body.system || '';
  const maxTokens = body.max_tokens || 1024;
  const temperature = body.temperature !== undefined ? body.temperature : 0.7;

  // Verify Clerk session and get user_id
  const userId = await getVerifiedUserId(req, env, body);
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return { status: 400, data: { error: 'messages must be a non-empty array' } };
  }

  // Forward to LLM with Welian's wholesale API key
  const llmResp = await callLLM(null, system, env, {
    messages,
    max_tokens: maxTokens,
    temperature,
  });

  if (!llmResp) {
    return { status: 502, data: { error: 'LLM call failed' } };
  }

  // Return reply + actual token usage (for edge-side billing in tokens.py)
  return {
    status: 200,
    data: {
      reply: llmResp.text,
      usage: {
        input_tokens: llmResp.usage.input_tokens || 0,
        output_tokens: llmResp.usage.output_tokens || 0,
      },
    },
  };
}

async function handleBilling(req, env) {
  const body = await req.json();
  const userToken = body.user_token;

  if (!userToken) {
    return { status: 400, data: { error: 'user_token required' } };
  }

  // Billing data lives on edge (tokens.py). Cloud only forwards LLM calls.
  // This endpoint returns mock; real balance tracking is done edge-side.
  return {
    status: 200,
    data: {
      plan: 'free',
      remaining: 100,
      used_this_month: 0,
      note: 'mock — real billing is edge-side in tokens.py',
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

  const system = `你是一个关系管理助手。分析用户消息，提取意图和数据操作。只返回JSON，不要其他内容。

JSON格式：
{
  "intent": "query_contact|query_todo|record|draft|chat|help",
  "contact_name": "用户提到的人名或昵称，没有则为空字符串",
  "keywords": ["搜索关键词，用于模糊匹配联系人"],
  "actions": []
}

actions 是需要执行的数据操作数组。【关键】只有用户明确表达记录/提醒/添加意图时才生成 actions，否则 actions 必须为空数组 []。

actions 元素格式：
- {"type":"add_timeline","contact_name":"人名","summary":"互动摘要","date":"YYYY-MM-DD"}
- {"type":"add_contact","name":"人名","relation":"关系","notes":"备注"}
- {"type":"add_todo","task":"待办内容","contact_name":"关联人名","due":"YYYY-MM-DD","priority":"P0|P1|P2"}

【严格规则 — 必须遵守】：
1. 生成 actions 的前提是用户消息中包含明确的记录/操作指令词：
   - 记录类："记一下"、"记录"、"备注"、"补充"
   - 提醒类："提醒我"、"待办"、"todo"、"别忘了"
   - 添加类："认识了一个"、"新认识"、"加个联系人"、"存一下"
2. 如果用户只是在查询、闲聊、或提到某个人但没说要记录 → actions=[]
   - "老许啥情况" → actions=[]（查询，不是记录）
   - "昨天和老许吃了饭" → actions=[]（陈述，没说"记一下"）
   - "老许是做什么的" → actions=[]（查询）
3. summary 和 task 必须直接来自用户消息的原话，不能改写、扩展或编造
4. 如果用户没有提供日期，date 用今天日期
5. 不能凭空创造人名——contact_name 必须在用户消息中明确出现

示例：
- "老许啥情况" → intent=query_contact, actions=[]
- "有啥待办" → intent=query_todo, actions=[]
- "记一下今天和老许聊了Q3预算" → intent=record, actions=[{"type":"add_timeline","contact_name":"老许","summary":"聊了Q3预算","date":"今天日期"}]
- "提醒我下周拜访张三" → intent=record, actions=[{"type":"add_todo","task":"拜访张三","contact_name":"张三","due":"下周五日期","priority":"P1"}]
- "认识了一个新朋友李四，在腾讯做产品" → intent=record, actions=[{"type":"add_contact","name":"李四","relation":"朋友","notes":"腾讯产品"}]
- "昨天和老许吃了饭" → intent=chat, actions=[]（用户没说"记一下"，不自动记录）
- "帮我给老许写个消息" → intent=draft, actions=[]
- "你好" → intent=chat, actions=[]`;

  try {
    const llmResp = await callLLM(text, system, env, {
      max_tokens: 400,
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

    // Execute data actions (data flywheel — write during conversation)
    const actionResults = [];
    for (const action of parsed.actions) {
      try {
        if (action.type === 'add_contact' && action.name) {
          const contacts = await loadDataset(env, userId, 'contacts');
          // Check if contact already exists (by name)
          let contact = contacts.find(c => c.name === action.name);
          if (!contact) {
            contact = {
              id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: action.name,
              relation: action.relation || '',
              role: action.relation || '',
              nature: 'leverage',
              strength: 3,
              tags: [], platforms: {},
              notes: action.notes || '',
              memories: [], important_dates: [],
              leverage: {}, nurture: {},
              aliases: [], alias: [],
              created: new Date().toISOString(),
              updated: new Date().toISOString(),
            };
            contacts.push(contact);
            await saveDataset(env, userId, 'contacts', contacts);
            actionResults.push({ type: 'add_contact', ok: true, name: action.name });
          } else {
            actionResults.push({ type: 'add_contact', ok: false, reason: 'already exists' });
          }
        }

        if (action.type === 'add_timeline' && action.summary) {
          const timeline = await loadDataset(env, userId, 'timeline');
          // Find contact by name
          const contacts = await loadDataset(env, userId, 'contacts');
          let contactId = '';
          if (action.contact_name) {
            const c = contacts.find(c => c.name === action.contact_name ||
              c.name.includes(action.contact_name) ||
              (c.aliases && c.aliases.some(a => a.includes(action.contact_name))));
            if (c) contactId = c.id;
            // If contact doesn't exist, create it
            if (!c && action.contact_name) {
              const newContact = {
                id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: action.contact_name,
                relation: '', role: '', nature: 'leverage', strength: 3,
                tags: [], platforms: {}, notes: '', memories: [], important_dates: [],
                leverage: {}, nurture: {}, aliases: [], alias: [],
                created: new Date().toISOString(), updated: new Date().toISOString(),
              };
              contacts.push(newContact);
              await saveDataset(env, userId, 'contacts', contacts);
              contactId = newContact.id;
            }
          }
          const entry = {
            id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            contact: contactId,
            date: action.date || new Date().toISOString().slice(0, 10),
            summary: action.summary,
            sentiment: '',
            created: new Date().toISOString(),
          };
          timeline.push(entry);
          await saveDataset(env, userId, 'timeline', timeline);
          actionResults.push({ type: 'add_timeline', ok: true, summary: action.summary, contact_name: action.contact_name || '' });
        }

        if (action.type === 'add_todo' && action.task) {
          const todos = await loadDataset(env, userId, 'todos');
          // Find contact by name
          let contactId = '';
          if (action.contact_name) {
            const contacts = await loadDataset(env, userId, 'contacts');
            const c = contacts.find(c => c.name === action.contact_name ||
              c.name.includes(action.contact_name));
            if (c) contactId = c.id;
          }
          const todo = {
            id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            contact: contactId,
            task: action.task,
            priority: action.priority || 'P1',
            due: action.due || '',
            status: 'pending',
            created: new Date().toISOString(),
          };
          todos.push(todo);
          await saveDataset(env, userId, 'todos', todos);
          actionResults.push({ type: 'add_todo', ok: true, task: action.task, contact_name: action.contact_name || '' });
        }
      } catch (e) {
        actionResults.push({ type: action.type, ok: false, error: e.message });
      }
    }

    parsed.action_results = actionResults;
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

  // Save merged data back to cloud
  await saveDataset(env, userId, 'contacts', mergedContacts);
  await saveDataset(env, userId, 'todos', mergedTodos);
  await saveDataset(env, userId, 'timeline', mergedTimeline);

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
    if (leverage && leverage.goals) detailLines.push(`  撬动目标：${String(leverage.goals).substring(0, 100)}`);
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
    const today = new Date().toISOString().substring(0, 10);
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
  await env.USER_DATA.put(`${name}:${userId}`, JSON.stringify(data), { expirationTtl: 604800 });
}

// POST /data/contacts — add or update a contact
// GET  /data/contacts — list all contacts (minimal)
// DELETE /data/contacts?id=xxx — delete a contact
async function handleContactsCRUD(req, env, method) {
  const userId = await getVerifiedUserId(req, env, method === 'GET' ? null : await req.json().catch(() => ({})));
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  if (method === 'GET') {
    const contacts = await loadDataset(env, userId, 'contacts');
    // Return minimal list (id, name, relation, nature)
    const minimal = contacts.map(c => ({
      id: c.id, name: c.name, relation: c.relation || '',
      nature: c.nature || 'leverage', role: c.role || c.relation || '',
    }));
    return { status: 200, data: { contacts: minimal, total: contacts.length } };
  }

  if (method === 'POST') {
    const body = await req.json();
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
      role: body.relation || '',
      nature: body.nature || 'leverage',
      strength: body.strength || 3,
      tags: body.tags || [],
      platforms: body.platforms || {},
      notes: body.notes || '',
      memories: [],
      important_dates: body.important_dates || [],
      leverage: body.leverage || {},
      nurture: body.nurture || {},
      aliases: body.aliases || [],
      alias: body.alias || [],
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
    return { status: 200, data: { ok: true } };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

// POST /data/timeline — add a timeline entry
// GET  /data/timeline?contact_id=xxx — list timeline (optionally filtered)
async function handleTimelineCRUD(req, env, method) {
  const userId = await getVerifiedUserId(req, env, method === 'GET' ? null : await req.json().catch(() => ({})));
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
    timeline.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return { status: 200, data: { timeline: timeline.slice(0, 50) } };
  }

  if (method === 'POST') {
    const body = await req.json();
    const summary = (body.summary || '').trim();
    const contactId = body.contact_id || body.contact || '';
    if (!summary) {
      return { status: 400, data: { error: 'summary required' } };
    }

    const timeline = await loadDataset(env, userId, 'timeline');
    const entry = {
      id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      contact: contactId,
      date: body.date || new Date().toISOString().slice(0, 10),
      summary,
      sentiment: body.sentiment || '',
      created: new Date().toISOString(),
    };
    timeline.push(entry);
    await saveDataset(env, userId, 'timeline', timeline);
    return { status: 200, data: { ok: true, entry } };
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

// POST /data/todos — add a todo
// GET  /data/todos — list pending todos
// POST /data/todos/done — mark todo as done
async function handleTodosCRUD(req, env, method, path) {
  const userId = await getVerifiedUserId(req, env, method === 'GET' ? null : await req.json().catch(() => ({})));
  if (!userId) {
    return { status: 401, data: { error: 'Authentication required' } };
  }

  if (method === 'GET') {
    const todos = await loadDataset(env, userId, 'todos');
    const pending = todos.filter(t => t.status === 'pending' || !t.status);
    pending.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    return { status: 200, data: { todos: pending } };
  }

  if (method === 'POST' && path === '/data/todos/done') {
    const body = await req.json();
    const todoId = body.id;
    const todos = await loadDataset(env, userId, 'todos');
    const idx = todos.findIndex(t => t.id === todoId);
    if (idx < 0) {
      return { status: 404, data: { error: 'todo not found' } };
    }
    todos[idx].status = 'done';
    todos[idx].completed_at = new Date().toISOString();
    await saveDataset(env, userId, 'todos', todos);
    return { status: 200, data: { ok: true } };
  }

  if (method === 'POST') {
    const body = await req.json();
    const task = (body.task || '').trim();
    if (!task) {
      return { status: 400, data: { error: 'task required' } };
    }

    const todos = await loadDataset(env, userId, 'todos');
    const todo = {
      id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      contact: body.contact_id || body.contact || '',
      task,
      priority: body.priority || 'P1',
      due: body.due || '',
      status: 'pending',
      created: new Date().toISOString(),
    };
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

      // ── 方案C：计费网关 ──

      if (path === '/ai/chat' && method === 'POST') {
        const r = await handleChat(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/billing' && method === 'POST') {
        const r = await handleBilling(request, env);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/ai/pricing' && method === 'GET') {
        return jsonResponse({
          points_per_1k_input: 1,
          points_per_1k_output: 2,
          free_monthly: 100,
          pro_monthly: 500,
        });
      }

      // ── Data sync (full cloud mode) ──

      if (path === '/ai/extract_intent' && method === 'POST') {
        const r = await handleExtractIntent(request, env);
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

      // ── Cloud-native CRUD ──

      if (path === '/data/contacts' && (method === 'GET' || method === 'POST' || method === 'DELETE')) {
        const r = await handleContactsCRUD(request, env, method);
        return jsonResponse(r.data, r.status);
      }

      if (path === '/data/timeline' && (method === 'GET' || method === 'POST' || method === 'DELETE')) {
        const r = await handleTimelineCRUD(request, env, method);
        return jsonResponse(r.data, r.status);
      }

      if ((path === '/data/todos' || path === '/data/todos/done') && (method === 'GET' || method === 'POST' || method === 'DELETE')) {
        const r = await handleTodosCRUD(request, env, method, path);
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
