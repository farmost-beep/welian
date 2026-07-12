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

      // ── Device discovery (tunnel registry) ──

      if (path === '/discover/register' && method === 'POST') {
        const body = await request.json();
        const deviceId = body.device_id;
        const tunnelUrl = body.tunnel_url;
        if (!deviceId || !tunnelUrl) {
          return jsonResponse({ error: 'device_id and tunnel_url required' }, 400);
        }
        // Store tunnel URL keyed by device_id, TTL 24h
        await env.DEVICES.put(`dev:${deviceId}`, JSON.stringify({
          tunnel_url: tunnelUrl,
          updated: Date.now(),
        }), { expirationTtl: 86400 });
        return jsonResponse({ ok: true });
      }

      if (path === '/discover/link' && method === 'POST') {
        // Link Clerk user_id to device_id (called from browser after local connect)
        const body = await request.json();
        const userId = body.user_id;
        const deviceId = body.device_id;
        if (!userId || !deviceId) {
          return jsonResponse({ error: 'user_id and device_id required' }, 400);
        }
        await env.DEVICES.put(`user:${userId}`, deviceId, { expirationTtl: 86400 * 30 });
        return jsonResponse({ ok: true });
      }

      if (path === '/discover/lookup' && method === 'GET') {
        // Lookup tunnel URL by Clerk user_id
        const userId = url.searchParams.get('user_id');
        if (!userId) {
          return jsonResponse({ error: 'user_id required' }, 400);
        }
        const deviceId = await env.DEVICES.get(`user:${userId}`);
        if (!deviceId) {
          return jsonResponse({ found: false });
        }
        const devData = await env.DEVICES.get(`dev:${deviceId}`);
        if (!devData) {
          return jsonResponse({ found: false });
        }
        const parsed = JSON.parse(devData);
        return jsonResponse({ found: true, tunnel_url: parsed.tunnel_url });
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
