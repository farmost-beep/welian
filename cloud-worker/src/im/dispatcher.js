/**
 * IM dispatcher — the core pipeline that turns an incoming IM message into a reply.
 *
 * Pipeline:
 *   1. (adapter already verified webhook + parsed IncomingMessage)
 *   2. Slash commands (/bind /help /status /reset /unbind) — handled here, no LLM call
 *   3. Lookup binding → clerk_user_id. If not bound, prompt user to /bind.
 *   4. Build context:
 *      a. Cloud KV data (contacts/todos/timeline) — always available
 *      b. If local agent online → queryLocalData supplements/overrides cloud data
 *   5. Build system prompt (Welian persona + data context + AGENTS.md rules)
 *   6. callLLM with conversation history (per-user, per-platform session)
 *   7. deductBilling
 *   8. Return OutgoingMessage — adapter sends it back to the IM
 *
 * Sessions: in-memory Map keyed by `<platform>:<platformUserId>`.
 * Cloudflare Workers are stateless across requests, but within a single
 * isolate session history persists. For production multi-instance, sessions
 * should move to KV (TODO). For now, in-memory is acceptable because:
 *   - Each user typically talks to one isolate (sticky by KV routing)
 *   - Even if history resets, the data context carries the conversation
 */

import { makeOutgoing } from './types.js';
import { lookupBinding, handleBindStart } from './bind.js';
import { queryLocalData, isAgentOnline } from './agent_callback.js';

const MAX_HISTORY = 20;            // keep last 20 turns per user
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min idle → reset session
const MAX_CONTEXT_CONTACTS = 30;
const MAX_CONTEXT_TODOS = 20;
const MAX_CONTEXT_TIMELINE = 15;

// In-memory session store: key → { history: [...], lastSeen: ms }
const _sessions = new Map();

function sessionKey(platform, platformUserId) {
  return `${platform}:${platformUserId}`;
}

function getSession(platform, platformUserId) {
  const k = sessionKey(platform, platformUserId);
  const s = _sessions.get(k);
  if (!s) return null;
  if (Date.now() - s.lastSeen > SESSION_TTL_MS) {
    _sessions.delete(k);
    return null;
  }
  return s;
}

function appendTurn(platform, platformUserId, role, text) {
  const k = sessionKey(platform, platformUserId);
  let s = _sessions.get(k);
  if (!s || Date.now() - s.lastSeen > SESSION_TTL_MS) {
    s = { history: [], lastSeen: Date.now() };
    _sessions.set(k, s);
  }
  s.history.push({ role, content: text });
  if (s.history.length > MAX_HISTORY * 2) {
    s.history = s.history.slice(-MAX_HISTORY * 2);
  }
  s.lastSeen = Date.now();
}

function resetSession(platform, platformUserId) {
  _sessions.delete(sessionKey(platform, platformUserId));
}

// ── Slash commands ──

const COMMANDS = {
  help: {
    desc: '查看可用命令',
    text: `🤖 小维命令：
/bind — 绑定你的 Welian 账号
/unbind — 解绑当前 IM
/status — 查看绑定和本地 agent 状态
/reset — 清空对话历史
/help — 显示这条帮助

直接发消息就是聊天，比如：
• 记一下今天和老许聊了合作
• 老许最近有什么待办
• 帮我拟一条给老许的问候`,
  },
  status: async (env, platform, platformUserId) => {
    const clerkId = await lookupBinding(env, platform, platformUserId);
    if (!clerkId) return '⚠️ 还没绑定。发 /bind 开始绑定 Welian 账号。';
    const online = await isAgentOnline(env, clerkId);
    return `✅ 已绑定（Clerk: ${clerkId.slice(0, 12)}…）
${online ? '🟢 本地 agent 在线（工具能力可用）' : '⚪ 本地 agent 离线（仅基础对话）'}`;
  },
  reset: (_env, platform, platformUserId) => {
    resetSession(platform, platformUserId);
    return '🔄 对话历史已清空。';
  },
};

/**
 * Main entry: dispatch an incoming IM message.
 *
 * @param {Object} env
 * @param {IncomingMessage} msg — parsed by adapter
 * @param {Object} deps — injected dependencies (callLLM, deductBilling, loadDataset, getPrompt)
 *   Allows worker.js to pass its existing functions without re-exporting them.
 * @returns {Promise<OutgoingMessage>}
 */
export async function dispatch(env, msg, deps) {
  const { callLLM, deductBilling, loadDataset, getPrompt, trackAction } = deps;
  const { platform, platformUserId, chatId, text, command } = msg;

  // ── 1. Slash commands ──
  if (command) {
    const cmd = command.toLowerCase();
    if (cmd === 'bind') {
      return await handleBindCommand(env, msg);
    }
    if (cmd === 'unbind') {
      return await handleUnbindCommand(env, msg);
    }
    if (COMMANDS[cmd]) {
      const handler = COMMANDS[cmd];
      const replyText = typeof handler === 'function'
        ? (handler.length >= 3 ? await handler(env, platform, platformUserId) : handler())
        : handler.text;
      return makeOutgoing({ platform, chatId, text: replyText });
    }
    return makeOutgoing({
      platform, chatId,
      text: `❓ 未知命令 /${command}。发 /help 查看可用命令。`,
    });
  }

  // ── 2. Binding check ──
  const clerkUserId = await lookupBinding(env, platform, platformUserId);
  if (!clerkUserId) {
    return makeOutgoing({
      platform, chatId,
      text: '👋 你好，我是小维。先绑定 Welian 账号才能开始用——发 /bind 拿到配对码，再到 welian.app 完成绑定。',
    });
  }

  // ── 3. Build context (cloud KV first, local agent supplements if online) ──
  const [cloudContacts, cloudTodos, cloudTimeline, localData] = await Promise.all([
    loadDataset(env, clerkUserId, 'contacts').catch(() => []),
    loadDataset(env, clerkUserId, 'todos').catch(() => []),
    loadDataset(env, clerkUserId, 'timeline').catch(() => []),
    queryLocalData(env, clerkUserId),
  ]);

  // Local data supplements cloud (per user's stated preference: cloud first, local fallback).
  // If local returned data, prefer local (it's fresher — agent is the source of truth when online).
  const contacts = (localData && localData.contacts.length) ? localData.contacts : cloudContacts;
  const todos = (localData && localData.todos.length) ? localData.todos : cloudTodos;
  const timeline = (localData && localData.timeline.length) ? localData.timeline : cloudTimeline;
  const agentOnline = localData !== null;

  // ── 4. Build system prompt ──
  const baseSystem = await getPrompt(env, 'chat', DEFAULT_SYSTEM);
  const dataContext = buildDataContext(contacts, todos, timeline, agentOnline);
  const system = `${baseSystem}\n\n${dataContext}`;

  // ── 5. Append user turn + call LLM ──
  appendTurn(platform, platformUserId, 'user', text);
  const session = getSession(platform, platformUserId);
  const messages = session ? session.history.slice() : [{ role: 'user', content: text }];

  const llmResp = await callLLM(null, system, env, {
    messages,
    max_tokens: 1024,
    temperature: 0.7,
    model_tier: 'standard',
  });

  let replyText;
  if (llmResp && llmResp.text) {
    replyText = llmResp.text;
    appendTurn(platform, platformUserId, 'assistant', replyText);

    // Billing (best-effort — don't block reply on billing failure)
    try {
      await deductBilling(env, clerkUserId, llmResp.usage, 'im_chat',
        `${platform}:${platformUserId}`, 'standard');
    } catch (e) {
      console.error('[dispatcher] deductBilling error:', e.message);
    }
  } else {
    replyText = '抱歉，回复生成失败了，请稍后再试。';
  }

  // Track action (best-effort)
  if (trackAction) {
    try { await trackAction(env, clerkUserId, 'im_chat', { platform }); } catch { /* best-effort */ }
  }

  return makeOutgoing({ platform, chatId, text: replyText });
}

// ── /bind command ──
async function handleBindCommand(env, msg) {
  const { platform, platformUserId, chatId, userName } = msg;
  const result = await handleBindStart(env, {
    platform,
    platform_user_id: platformUserId,
    chat_id: chatId,
    user_name: userName,
  });
  if (result.status !== 200) {
    return makeOutgoing({ platform, chatId, text: `❌ ${result.data.error}` });
  }
  if (result.data.already_bound) {
    return makeOutgoing({ platform, chatId, text: '✅ 已经绑定过了，直接发消息就行。' });
  }
  const { code, bind_url, expires_in } = result.data;
  const mins = Math.floor(expires_in / 60);
  return makeOutgoing({
    platform, chatId,
    text: `🔗 绑定小维\n\n配对码：${code}\n\n点击链接登录 Welian 完成绑定：\n${bind_url}\n\n⏰ ${mins} 分钟内有效。`,
    isCard: true,
    buttons: [{ text: '前往绑定', url: bind_url }],
  });
}

// ── /unbind command ──
async function handleUnbindCommand(env, msg) {
  const { platform, platformUserId, chatId } = msg;
  const clerkUserId = await lookupBinding(env, platform, platformUserId);
  if (!clerkUserId) {
    return makeOutgoing({ platform, chatId, text: '⚠️ 当前未绑定，无需解绑。' });
  }
  // Reuse handleUnbind from bind.js
  const { handleUnbind } = await import('./bind.js');
  const result = await handleUnbind(env, clerkUserId, { platform });
  if (result.status !== 200) {
    return makeOutgoing({ platform, chatId, text: `❌ ${result.data.error}` });
  }
  resetSession(platform, platformUserId);
  return makeOutgoing({ platform, chatId, text: '✅ 已解绑。发 /bind 重新绑定。' });
}

// ── Data context builder ──
function buildDataContext(contacts, todos, timeline, agentOnline) {
  const parts = [];
  parts.push(agentOnline
    ? '[数据源] 本地 agent 在线，使用本地最新数据。'
    : '[数据源] 本地 agent 离线，使用云端同步数据（可能不是最新）。');

  if (contacts.length > 0) {
    const list = contacts.slice(0, MAX_CONTEXT_CONTACTS)
      .map(c => `- ${c.name || '未命名'}${c.company ? `（${c.company}）` : ''}${c.nature ? `[${c.nature}]` : ''}`)
      .join('\n');
    parts.push(`【联系人】(${contacts.length} 条，展示前 ${Math.min(contacts.length, MAX_CONTEXT_CONTACTS)})\n${list}`);
  }

  const pendingTodos = (todos || []).filter(t => !t.done && t.status !== 'done' && t.status !== 'completed' && t.status !== 'canceled');
  if (pendingTodos.length > 0) {
    const list = pendingTodos.slice(0, MAX_CONTEXT_TODOS)
      .map(t => `- ${t.task || t.title || '未命名待办'}${t.due ? ` (due: ${t.due})` : ''}${t.contact_name ? ` [${t.contact_name}]` : ''}`)
      .join('\n');
    parts.push(`【待办】(${pendingTodos.length} 条未完成)\n${list}`);
  }

  if (timeline && timeline.length > 0) {
    const sorted = [...timeline].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const list = sorted.slice(0, MAX_CONTEXT_TIMELINE)
      .map(t => `- ${t.date || ''} ${t.summary || ''}${t.contact_name ? ` [${t.contact_name}]` : ''}`)
      .join('\n');
    parts.push(`【近期互动】\n${list}`);
  }

  return parts.join('\n\n');
}

// ── Default system prompt (used if KV has no chat.md) ──
const DEFAULT_SYSTEM = `你是 Welian（小维），一个关系网络智能体。你帮用户成为更好的朋友、更好的家人、更好的合作者。

你的风格：
- 简洁友好，像朋友在聊天
- 中文回复，适当用 emoji
- 回复不要太长，重点突出
- 记录时：确认记下了并简要复述
- 查待办时：只列出数据中有的，按紧急程度分组
- 拟写消息时：给出完整可发送的草稿

诚实原则（最高优先级）：
- 只能引用"相关数据"中的信息，数据中没有的不能编造
- 用户问的人/事在数据中找不到 → 直接说"我没有找到关于XX的记录"
- 不确定时说"不确定"，不要猜

双关系模型：
- 经营型（leverage）：因共同目标联结，可建议联系谁+为什么+聊什么
- 陪伴型（nurture）：关系本身就是意义，绝不做 ROI/排序/冷却
- 同一人可双重关系，合作事项用经营语言，私人情谊用陪伴语言`;
