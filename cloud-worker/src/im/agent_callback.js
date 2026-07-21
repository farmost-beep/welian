/**
 * Cloud → local agent callback client.
 *
 * When an IM user sends a message, the cloud dispatcher needs to:
 *   1. Query the user's local data (contacts/todos/timeline) — preferred over stale cloud KV
 *   2. Execute tool calls (shell/read/write — the "Devin CLI capability") on the user's local machine
 *
 * Both happen via the user's Cloudflare Tunnel URL, registered in DEVICES KV as `dev:<clerk_user_id>`.
 * The local agent (agent.py) exposes:
 *   - POST /cloud/query   — return local datasets for the dispatcher
 *   - POST /cloud/tool    — run a tool call via the local Devin CLI subprocess
 *   - GET  /cloud/health  — liveness check
 *
 * Auth: Bearer `<clerk_user_id>:<WELIAN_SYNC_SECRET>` (sync token, same as edge agent uses).
 *
 * Degradation: if the local agent is offline (no tunnel URL, or health check fails),
 * the dispatcher falls back to cloud KV data + pure LLM (no tools). The user is told.
 */

const SYNC_TOKEN_HEADER = 'Authorization';
const HEALTH_TIMEOUT_MS = 3000;
const QUERY_TIMEOUT_MS = 15000;
const TOOL_TIMEOUT_MS = 120000; // tools like shell can take a while

/**
 * Look up the user's tunnel URL from DEVICES KV.
 * @returns {Promise<string|null>} tunnel URL or null if not registered
 */
export async function getTunnelUrl(env, clerkUserId) {
  if (!clerkUserId) return null;
  try {
    const raw = await env.DEVICES.get(`dev:${clerkUserId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.tunnel_url || null;
  } catch (e) {
    console.error('[agent_callback] getTunnelUrl error:', e.message);
    return null;
  }
}

/**
 * Check if the local agent is reachable.
 * @returns {Promise<boolean>}
 */
export async function isAgentOnline(env, clerkUserId) {
  const tunnelUrl = await getTunnelUrl(env, clerkUserId);
  if (!tunnelUrl) return false;
  try {
    const resp = await fetch(`${tunnelUrl}/cloud/health`, {
      method: 'GET',
      headers: { [SYNC_TOKEN_HEADER]: syncToken(env, clerkUserId) },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Query local datasets from the user's agent.
 * @returns {Promise<{contacts: Array, todos: Array, timeline: Array} | null>}
 *   null if agent offline or query failed — caller should fall back to cloud KV.
 */
export async function queryLocalData(env, clerkUserId) {
  const tunnelUrl = await getTunnelUrl(env, clerkUserId);
  if (!tunnelUrl) return null;
  try {
    const resp = await fetch(`${tunnelUrl}/cloud/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SYNC_TOKEN_HEADER]: syncToken(env, clerkUserId),
      },
      body: JSON.stringify({ datasets: ['contacts', 'todos', 'timeline'] }),
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return {
      contacts: data.contacts || [],
      todos: data.todos || [],
      timeline: data.timeline || [],
    };
  } catch (e) {
    console.error('[agent_callback] queryLocalData error:', e.message);
    return null;
  }
}

/**
 * Execute a tool call on the user's local agent (Devin CLI subprocess).
 *
 * @param {Object} env
 * @param {string} clerkUserId
 * @param {Object} toolCall — { type: 'shell'|'read'|'write'|'grep'|'glob', ...args }
 * @returns {Promise<{ok: boolean, output?: string, error?: string}>}
 *   ok=false with error when agent offline or tool failed.
 */
export async function execLocalTool(env, clerkUserId, toolCall) {
  const tunnelUrl = await getTunnelUrl(env, clerkUserId);
  if (!tunnelUrl) {
    return { ok: false, error: '本地 agent 离线，工具能力不可用' };
  }
  try {
    const resp = await fetch(`${tunnelUrl}/cloud/tool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SYNC_TOKEN_HEADER]: syncToken(env, clerkUserId),
      },
      body: JSON.stringify({ tool: toolCall }),
      signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return { ok: false, error: data.error || `local tool HTTP ${resp.status}` };
    }
    return { ok: true, output: data.output || '' };
  } catch (e) {
    return { ok: false, error: `本地工具调用失败：${e.message}` };
  }
}

/**
 * Build a sync token for cloud→local auth.
 */
function syncToken(env, clerkUserId) {
  const secret = env.WELIAN_SYNC_SECRET;
  if (!secret) {
    throw new Error('WELIAN_SYNC_SECRET not set — cannot auth to local agent');
  }
  return `Bearer ${clerkUserId}:${secret}`;
}
