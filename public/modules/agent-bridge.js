// Auto-generated from app.js — do not edit manually

import { AGENT_TUNNEL_URL, CLOUD_URL, DISCOVERY_URL, I18N, SCENARIO_IDS, body, bridgeFrame, bridgeReady, cachedUserProfile, cachedUserProfileObj, chatAbortController, clerkInstance, clerkUserId, conversationHistory, currentLang, currentModelTier, currentSessionId, dataPriority, input, isAuthed } from './state.js';
import { isCloud, isLive, modeBadge, routingConfig, setBridgeFrame, setBridgeReady, setCachedUserProfile, setCachedUserProfileObj, setChatAbortController, setConversationHistory, setCurrentSessionId, setDataPriority, setIsAuthed, setIsCloud, setIsLive, setRoutingConfig, setSimulationData, setSimulationGoals, setSimulationMode, setSimulationPersona } from './state.js';
import { simulationData, simulationGoals, simulationMode, simulationPersona, statusDot, statusText } from './state.js';
import { addMsg, addSystemMsg, clearChat, getSystemPrompt, hideWelcome, loadChatEnhancements, loadSession, saveSessionTurn, send, showWelcome } from './chat.js';
import { getClerkToken, onSignedOut, toggleAuth } from './auth.js';
import { localDateStr } from './misc.js';

export function removeBridge() {
  if (bridgeFrame) {
    bridgeFrame.remove();
    setBridgeFrame(null);
    setBridgeReady(false);
  }
}

export async function enableCloudMode() {
  setIsCloud(true);
  setIsLive(false);
  statusDot.className = 'status-dot online';
  statusText.textContent = I18N[currentLang].cloud_status;
  if (modeBadge) { modeBadge.textContent = 'Cloud'; modeBadge.className = 'mode-badge live'; }

  clearChat();
  // Retry token a few times — Clerk session may still be initializing
  let token = null;
  for (let i = 0; i < 3 && !token; i++) {
    token = await getClerkToken();
    if (!token) await new Promise(r => setTimeout(r, 500));
  }
  if (token) {
    try {
      const resp = await fetch(`${CLOUD_URL}/data/sessions`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        const sessions = data.sessions || [];
        if (sessions.length > 0) {
          const lastSession = sessions[0]; // most recent (already reversed)
          const lastDate = lastSession.updated_at ? new Date(lastSession.updated_at) : null;
          const today = new Date();
          const isSameDay = lastDate && lastDate.getFullYear() === today.getFullYear()
            && lastDate.getMonth() === today.getMonth()
            && lastDate.getDate() === today.getDate();
          if (isSameDay) {
            // Continue today's session
            await loadSession(lastSession.id);
          } else {
            // New day — start fresh, show summary of last session as welcome
            setCurrentSessionId(null);
            setConversationHistory([]);
            const summary = await generateSessionSummary(lastSession.id, token);
            const zh = currentLang === 'zh';
            const welcome = zh
              ? `早上好 ☀️\n\n上次我们聊了：${summary}\n\n今天想聊什么？`
              : `Good morning ☀️\n\nLast time we talked about: ${summary}\n\nWhat's on your mind today?`;
            addMsg('ai', welcome);
          }
          return;
        }
      }
    } catch (e) { /* fall through to welcome */ }
  }
  // No previous sessions or token unavailable — show welcome
  addMsg('ai', I18N[currentLang].cloud_welcome);
}

export async function generateSessionSummary(sessionId, token) {
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/session_summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ session_token: token, session_id: sessionId }),
    });
    if (!resp.ok) return '';
    const data = await resp.json();
    return data.summary || '';
  } catch { return ''; }
}

export async function agentConfig(action, config) {
  if (!bridgeFrame || !bridgeReady) return null;
  return new Promise((resolve) => {
    const reqId = 'agcfg_' + Date.now();
    let resolved = false;

    const handler = (e) => {
      const msg = e.data;
      if (!msg || msg.source !== 'welian-bridge') return;
      if (msg.type === 'ws-message' && msg.data && msg.data.id === reqId && !resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        if (msg.data.type === 'response') {
          resolve(msg.data);
        } else if (msg.data.type === 'error') {
          resolve({ error: true, message: msg.data.message || 'Unknown error' });
        } else {
          resolve(null);
        }
      }
    };
    window.addEventListener('message', handler);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        resolve(null);
      }
    }, 5000);

    const payload = { cmd: 'agent_config', id: reqId, action };
    if (config) payload.config = config;
    bridgeFrame.contentWindow.postMessage({
      source: 'welian-parent',
      type: 'send',
      payload
    }, '*');
  });
}

export async function devinDirect(text) {
  if (!bridgeFrame || !bridgeReady) return null;
  console.log('[devinDirect] Sending to Devin CLI:', text.substring(0, 80));
  return new Promise((resolve) => {
    const reqId = 'devin_' + Date.now();
    let resolved = false;

    const handler = (e) => {
      const msg = e.data;
      if (!msg || msg.source !== 'welian-bridge') return;
      if (msg.type === 'ws-message' && msg.data && msg.data.id === reqId && !resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        if (msg.data.type === 'response' && msg.data.reply) {
          resolve(msg.data.reply);
        } else {
          resolve(null);
        }
      }
    };
    window.addEventListener('message', handler);

    // Timeout: Devin CLI can take a while, use 10 min
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        console.log('[devinDirect] TIMEOUT');
        resolve(null);
      }
    }, 600000);

    bridgeFrame.contentWindow.postMessage({
      source: 'welian-parent',
      type: 'send',
      payload: { cmd: 'devin_direct', id: reqId, text: text }
    }, '*');
  });
}

export async function agentChat(text, timeoutMs, attachedFile) {
  if (!bridgeFrame || !bridgeReady) return null;
  console.log('[agentChat] Sending via bridge:', text.substring(0, 50), attachedFile ? 'with file' : '');
  return new Promise((resolve) => {
    const reqId = 'chat_' + Date.now();
    let resolved = false;
    let streamBuffer = '';

    const handler = (e) => {
      const msg = e.data;
      if (!msg || msg.source !== 'welian-bridge') return;
      if (msg.type === 'ws-message' && msg.data && msg.data.id === reqId && !resolved) {
        // Stream chunk — append to buffer and update typing indicator
        if (msg.data.type === 'stream' && msg.data.chunk) {
          streamBuffer += msg.data.chunk;
          // Update typing indicator with streaming content
          const typingEl = document.getElementById('typing');
          if (typingEl) {
            const bubble = typingEl.querySelector('.bubble');
            if (bubble) {
              bubble.style.whiteSpace = 'pre-wrap';
              bubble.textContent = streamBuffer;
              // Auto-scroll
              const chatBody = document.getElementById('chatMessages') || typingEl.parentElement;
              if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
            }
          }
          return;  // don't resolve, wait for final response
        }
        // Final response
        if (msg.data.type === 'response' && msg.data.reply) {
          resolved = true;
          window.removeEventListener('message', handler);
          resolve(msg.data.reply);
        } else if (msg.data.type === 'error') {
          resolved = true;
          window.removeEventListener('message', handler);
          resolve(null);
        }
      }
    };
    window.addEventListener('message', handler);

    // Timeout: configurable via routingConfig.live_timeout_ms (default 30s)
    const timeout = timeoutMs || routingConfig.live_timeout_ms || 30000;
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        console.log(`[agentChat] TIMEOUT — agent did not respond in ${timeout}ms`);
        resolve(null);
      }
    }, timeout);

    const payload = { cmd: 'chat', id: reqId, text: text };
    if (attachedFile && attachedFile.base64) {
      payload.file = {
        base64: attachedFile.base64,
        filename: attachedFile.filename,
        media_type: attachedFile.mediaType,
        is_image: attachedFile.isImage,
      };
    }
    bridgeFrame.contentWindow.postMessage({
      source: 'welian-parent',
      type: 'send',
      payload: payload
    }, '*');
  });
}

export async function getAgentContext(text) {
  // Ask local agent for edge data context (contacts, todos, activities)
  // Returns {data_context, conversation} or null if agent unavailable
  if (!bridgeFrame || !bridgeReady) {
    console.log('[getAgentContext] No bridge available');
    return null;
  }
  console.log('[getAgentContext] Requesting context for:', text.substring(0, 50));
  return new Promise((resolve) => {
    const reqId = 'ctx_' + Date.now();
    let resolved = false;

    const handler = (e) => {
      const msg = e.data;
      if (!msg || msg.source !== 'welian-bridge') return;
      if (msg.type === 'ws-message' && msg.data && msg.data.id === reqId && !resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        console.log('[getAgentContext] Got response:', msg.data.type, 'has data:', !!msg.data.data);
        if (msg.data.type === 'response' && msg.data.data) {
          console.log('[getAgentContext] data_context length:', (msg.data.data.data_context || '').length);
          resolve(msg.data.data);
        } else {
          console.log('[getAgentContext] No data in response');
          resolve(null);
        }
      }
    };
    window.addEventListener('message', handler);

    // Timeout: configurable via routingConfig.agent_context_timeout_ms (default 5s)
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        console.log(`[getAgentContext] TIMEOUT — agent did not respond in ${routingConfig.agent_context_timeout_ms}ms`);
        resolve(null);
      }
    }, routingConfig.agent_context_timeout_ms || 5000);

    bridgeFrame.contentWindow.postMessage({
      source: 'welian-parent',
      type: 'send',
      payload: { cmd: 'context', id: reqId, text: text }
    }, '*');
  });
}

export function saveAgentTurn(text, reply) {
  // Tell agent to save conversation turn (for multi-turn context)
  if (!bridgeFrame || !bridgeReady) return;
  const reqId = 'save_' + Date.now();
  bridgeFrame.contentWindow.postMessage({
    source: 'welian-parent',
    type: 'send',
    payload: { cmd: 'save_turn', id: reqId, text: text, reply: reply }
  }, '*');
}

export async function getCloudDataContext() {
  // Fetch data context from cloud KV (synced by agent)
  const token = simulationMode
    ? `demo_${simulationData.id}:demo_secret`
    : await getClerkToken();
  if (!token) return '';
  try {
    const resp = await fetch(`${CLOUD_URL}/data/context`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) return '';
    const data = await resp.json();
    return data.data_context || '';
  } catch (e) {
    console.log('[getCloudDataContext] failed:', e.message);
    return '';
  }
}

export async function cloudSearch(keywords, contactName) {
  // Search contacts in cloud KV (full cloud mode, no agent needed)
  const token = simulationMode
    ? `demo_${simulationData.id}:demo_secret`
    : await getClerkToken();
  if (!token) return null;
  try {
    const resp = await fetch(`${CLOUD_URL}/data/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        session_token: token,
        keywords: keywords,
        contact_name: contactName,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    console.log('[cloudSearch] matched:', data.matched_count, 'data_context len:', (data.data_context||'').length);
    return data;
  } catch (e) {
    console.log('[cloudSearch] failed:', e.message);
    return null;
  }
}

export async function cloudListTodos() {
  const token = simulationMode
    ? `demo_${simulationData.id}:demo_secret`
    : await getClerkToken();
  if (!token) return '';
  try {
    const resp = await fetch(`${CLOUD_URL}/data/todos`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) return '';
    const data = await resp.json();
    const todos = data.todos || [];
    if (todos.length === 0) return '待办：暂无记录';
    const today = localDateStr();
    const lines = [`【待办】共 ${todos.length} 条`];
    for (const t of todos) {
      const due = (t.due || '').substring(0, 10);
      const task = (t.task || '').substring(0, 80);
      const contact = t.contact || '';
      if (due) {
        const delta = Math.floor((new Date(due) - new Date(today)) / 86400000);
        if (delta < 0) lines.push(`  · [${contact}] ${task}（超期${-delta}天）`);
        else if (delta === 0) lines.push(`  · [${contact}] ${task}（今天）`);
        else lines.push(`  · [${contact}] ${task}（${delta}天后）`);
      } else {
        lines.push(`  · [${contact}] ${task}`);
      }
    }
    return lines.join('\n');
  } catch (e) {
    console.log('[cloudListTodos] failed:', e.message);
    return '';
  }
}

export async function cloudListContacts() {
  const token = simulationMode
    ? `demo_${simulationData.id}:demo_secret`
    : await getClerkToken();
  if (!token) return '';
  try {
    const resp = await fetch(`${CLOUD_URL}/data/contacts`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) return '';
    const data = await resp.json();
    const contacts = data.contacts || [];
    if (contacts.length === 0) return '联系人：暂无记录';
    const lines = [`【联系人】共 ${data.total || contacts.length} 位`];
    for (const c of contacts) {
      const nature = c.nature === 'nurture' ? '陪伴' : (c.nature === 'dual' ? '双重' : '经营');
      lines.push(`  · ${c.name} | ${c.relation || c.role || ''} | ${nature}`);
    }
    return lines.join('\n');
  } catch (e) {
    console.log('[cloudListContacts] failed:', e.message);
    return '';
  }
}

export async function agentSearch(keywords, contactName, intent) {
  // Ask agent to search contacts by keywords (two-step flow step 2)
  // Returns {data_context, matched_count, conversation} or null
  if (!bridgeFrame || !bridgeReady) return null;
  return new Promise((resolve) => {
    const reqId = 'sch_' + Date.now();
    let resolved = false;

    const handler = (e) => {
      const msg = e.data;
      if (!msg || msg.source !== 'welian-bridge') return;
      if (msg.type === 'ws-message' && msg.data && msg.data.id === reqId && !resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        if (msg.data.type === 'response' && msg.data.data) {
          resolve(msg.data.data);
        } else {
          resolve(null);
        }
      }
    };
    window.addEventListener('message', handler);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        resolve(null);
      }
    }, 5000);

    bridgeFrame.contentWindow.postMessage({
      source: 'welian-parent',
      type: 'send',
      payload: { cmd: 'search', id: reqId, keywords: keywords, contact_name: contactName, intent: intent }
    }, '*');
  });
}

export async function fetchRoutingConfig() {
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/config`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.routing) setRoutingConfig(data.routing);
      if (data.data_priority && Array.isArray(data.data_priority)) setDataPriority(data.data_priority);
      console.log('[routing] Config loaded:', routingConfig, 'data_priority:', dataPriority);
    }
  } catch (e) {
    console.log('[routing] Config fetch failed, using defaults:', e.message);
  }
}

export function shouldUseLive() {
  const mode = routingConfig.mode || 'auto';
  if (mode === 'cloud_only') return false;
  if (mode === 'live_first' || mode === 'cloud_first') return bridgeReady;
  // auto: Live if bridge ready
  return isLive && bridgeReady;
}

export function shouldFallbackToCloud() {
  return routingConfig.mode !== 'cloud_only' || !shouldUseLive();
}

export async function extractIntent(text) {
  // Step 1: Cloud LLM extracts intent + keywords from user message
  const token = simulationMode
    ? `demo_${simulationData.id}:demo_secret`
    : await getClerkToken();
  if (!token) return null;
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/extract_intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ session_token: token, text: text }),
    });
    if (!resp.ok) {
      console.error('[extractIntent] API returned', resp.status, await resp.text().catch(()=>''));
      return null;
    }
    const data = await resp.json();
    console.log('[extractIntent]', JSON.stringify(data));
    return data;
  } catch (e) {
    console.log('[extractIntent] failed:', e.message);
    return null;
  }
}

export async function cloudChat(text, attachedFile) {
  // Two-step LLM flow with Clerk JWT auth:
  // 1. Cloud LLM extracts intent + keywords
  // 2. Agent searches contacts by keywords (or cloud KV fallback)
  // 3. Cloud LLM generates reply with precise data context
  console.log('[cloudChat] Start, bridgeReady:', bridgeReady, 'isLive:', isLive, 'mode:', routingConfig.mode);

  // /model <name> — switch Devin CLI model (via --model CLI flag, not slash command)
  // Must intercept BEFORE devin passthrough: devin -p mode doesn't handle /model slash command
  if (text.startsWith('/model ') && bridgeReady) {
    const modelName = text.slice(7).trim();
    if (modelName) {
      const result = await agentConfig('set', { engine: 'devin', devin: { model: modelName } });
      if (result && result.ok) {
        window._agentEngine = 'devin';
        return `✅ Devin CLI 模型已切换为 ${modelName}（下条消息生效）`;
      }
      return '⚠️ 模型切换失败，请确认本地 agent 已连接';
    }
  }

  // /engine <edge|devin> — switch agent engine
  if (text.startsWith('/engine ') && bridgeReady) {
    const engineName = text.slice(8).trim().toLowerCase();
    if (engineName === 'edge' || engineName === 'devin') {
      const result = await agentConfig('set', { engine: engineName });
      if (result && result.ok) {
        window._agentEngine = engineName;
        return `✅ Agent 引擎已切换为 ${engineName === 'devin' ? 'Devin CLI' : 'Edge (本地 LLM)'}`;
      }
      return '⚠️ 引擎切换失败，请确认本地 agent 已连接';
    }
    return '⚠️ 未知引擎，支持：edge | devin';
  }

  // In Devin CLI passthrough mode, all other messages go straight to Devin
  // Skip for file attachments — base64 exceeds WebSocket message limit
  if (window._agentEngine === 'devin' && shouldUseLive() && !attachedFile) {
    console.log('[cloudChat] Devin CLI passthrough — forwarding all text to Devin');
    // Data flywheel: still run extract_intent async to capture contacts/todos/timeline
    extractIntent(text).then(intent => {
      if (intent && intent.action_results && intent.action_results.length > 0) {
        const actions = intent.action_results.filter(a => a.ok);
        if (actions.length > 0) {
          const parts = actions.map(a => {
            if (a.type === 'add_contact') return `已添加联系人「${a.name}」`;
            if (a.type === 'add_timeline') return `已记录互动「${a.summary}」`;
            if (a.type === 'add_todo') return `已添加待办「${a.task}」`;
            if (a.type === 'complete_todo') return `已完成待办「${a.task}」`;
            if (a.type === 'delete_todo') return `已删除待办「${a.task}」`;
            if (a.type === 'update_contact') return `已更新联系人「${a.contact_name}」`;
            if (a.type === 'merge_contact') return `已合并联系人「${a.source_name}」→「${a.target_name}」`;
            return '';
          }).filter(Boolean);
          if (parts.length > 0) {
            console.log('[cloudChat] Data flywheel (devin mode):', parts.join('，'));
            loadChatEnhancements();
          }
        }
      }
    }).catch(e => console.warn('[cloudChat] extractIntent (devin mode) failed:', e.message));
    const typingEl = document.getElementById('typing');
    if (typingEl) {
      const bubble = typingEl.querySelector('.bubble');
      if (bubble) bubble.innerHTML = '<span style="font-size:.85em;color:var(--dim)">⚡ Devin CLI 执行中…</span>';
    }
    const reply = await agentChat(text, 3600000, attachedFile);
    if (reply) {
      saveSessionTurn(text, reply).catch(e => console.warn('[session] save failed:', e.message));
      return reply;
    }
    return '⚠️ Devin CLI 未响应，请检查 devin 命令是否可用';
  }

  // /devin prefix: direct Devin CLI passthrough (edge/cloud mode only)
  if (text.startsWith('/devin ') && bridgeReady) {
    const devinText = text.slice(7).trim();
    if (devinText) {
      console.log('[cloudChat] Direct Devin CLI passthrough');
      const reply = await devinDirect(devinText);
      if (reply) {
        saveSessionTurn(text, reply).catch(e => console.warn('[session] save failed:', e.message));
        return reply;
      }
      return '⚠️ Devin CLI 未响应，请确认 devin 命令已安装';
    }
  }

  // Live mode: route through local agent (edge LLM only — devin handled above)
  // Skip agent for file attachments — base64 payload exceeds Cloudflare WebSocket
  // 1MB message limit, causing ws-close. Cloud LLM handles multimodal via fetch.
  if (shouldUseLive() && !attachedFile) {
    console.log('[cloudChat] Routing via local agent (edge LLM)');
    // Data flywheel: still run extract_intent async to capture contacts/todos/timeline
    extractIntent(text).then(intent => {
      if (intent && intent.action_results && intent.action_results.length > 0) {
        const actions = intent.action_results.filter(a => a.ok);
        if (actions.length > 0) {
          const hasContact = actions.some(a => a.type === 'add_contact' || a.type === 'update_contact' || a.type === 'merge_contact');
          const hasTodo = actions.some(a => a.type === 'add_todo' || a.type === 'complete_todo' || a.type === 'delete_todo');
          const hasTimeline = actions.some(a => a.type === 'add_timeline');
          if (hasContact || hasTodo || hasTimeline) {
            console.log('[cloudChat] Data flywheel (edge mode):', intent.action_results.length, 'actions');
            loadChatEnhancements();
          }
        }
      }
    }).catch(e => console.warn('[cloudChat] extractIntent (edge mode) failed:', e.message));
    const reply = await agentChat(text, undefined, attachedFile);
    if (reply) {
      // Save to cloud session for history
      saveSessionTurn(text, reply).catch(e => console.warn('[session] save failed:', e.message));
      return reply;
    }
    // Fallback to cloud if agent fails
    console.log('[cloudChat] Local agent failed, falling back to cloud');
  }

  // Get auth token (Clerk JWT or simulation demo token)
  const token = simulationMode
    ? `demo_${simulationData.id}:demo_secret`
    : await getClerkToken();
  if (!token) {
    throw new Error('请先登录');
  }

  // Step 1: Extract intent + keywords + execute data actions (data flywheel)
  const intent = await extractIntent(text);
  let dataContext = '';
  let conversationHistoryFromAgent = [];
  let flywheelInfo = '';

  // Show data flywheel results
  if (intent && intent.action_results && intent.action_results.length > 0) {
    const actions = intent.action_results.filter(a => a.ok);
    if (actions.length > 0) {
      const parts = actions.map(a => {
        if (a.type === 'add_contact') return `已添加联系人「${a.name}」`;
        if (a.type === 'add_timeline') return `已记录互动「${a.summary}」`;
        if (a.type === 'add_todo') return `已添加待办「${a.task}」`;
        if (a.type === 'complete_todo') return `已完成待办「${a.task}」`;
        if (a.type === 'delete_todo') return `已删除待办「${a.task}」`;
        if (a.type === 'update_contact') return `已更新联系人「${a.contact_name}」`;
        if (a.type === 'merge_contact') return `已合并联系人「${a.source_name}」→「${a.target_name}」`;
        return '';
      }).filter(Boolean);
      flywheelInfo = parts.join('，');
      console.log('[cloudChat] Data flywheel:', flywheelInfo);
      // Refresh caches so new data shows up in sidebar/tabs
      const hasTimeline = actions.some(a => a.type === 'add_timeline');
      const hasContact = actions.some(a => a.type === 'add_contact' || a.type === 'update_contact' || a.type === 'merge_contact');
      const hasTodo = actions.some(a => a.type === 'add_todo' || a.type === 'complete_todo' || a.type === 'delete_todo');
      if (hasTimeline || hasContact || hasTodo) {
        // Async refresh — don't block the reply
        loadChatEnhancements();
      }
    }
  }

  // Auto-learned profile updates
  if (intent && intent.profile_updated) {
    setCachedUserProfile(''); setCachedUserProfileObj(null); // invalidate cache so next chat reloads profile
    console.log('[cloudChat] Profile auto-updated from conversation');
  }

  // Memory saved — notify user (F1)
  if (intent && intent.memory_saved) {
    console.log('[cloudChat] Memory auto-saved from conversation:', intent.memory_saved_id);
    // Show visible feedback after reply
    setTimeout(() => {
      const memHint = document.createElement('div');
      memHint.style.cssText = 'font-size:12px;color:#888;padding:4px 12px;margin-top:4px;';
      memHint.textContent = '🧠 已记住这条信息，下次对话会自动参考';
      const lastMsg = document.querySelector('#chatMessages .message:last-child');
      if (lastMsg) lastMsg.appendChild(memHint);
    }, 500);
  }

  // Goal evidence linked — notify user (G1)
  if (intent && intent.goal_evidence_linked) {
    console.log('[cloudChat] Goal evidence linked:', intent.goal_evidence_goal_title);
    setTimeout(() => {
      const goalHint = document.createElement('div');
      goalHint.style.cssText = 'font-size:12px;color:#22c55e;padding:4px 12px;margin-top:4px;';
      goalHint.textContent = `🎯 已关联到目标「${intent.goal_evidence_goal_title}」`;
      const lastMsg = document.querySelector('#chatMessages .message:last-child');
      if (lastMsg) lastMsg.appendChild(goalHint);
    }, 600);
  }

  // Step 2: Get data context based on intent
  // Data source priority is configurable via dataPriority (from /ai/config)
  // Default: ['cloud_kv', 'agent'] — cloud first, agent fallback
  // Can be set to ['agent', 'cloud_kv'] — agent first, cloud fallback
  const hasKeywords = intent && (intent.contact_name || (intent.keywords && intent.keywords.length > 0));
  const intentType = intent ? intent.intent : '';

  for (const source of dataPriority) {
    if (dataContext) break;  // already got data, stop

    if (source === 'cloud_kv') {
      if (hasKeywords) {
        console.log('[cloudChat] Trying cloud_kv search for:', intent.contact_name, intent.keywords);
        const cloudResult = await cloudSearch(intent.keywords || [], intent.contact_name || '');
        if (cloudResult) {
          dataContext = cloudResult.data_context || '';
          console.log('[cloudChat] cloud search, data_context len:', dataContext.length, 'matched:', cloudResult.matched_count);
        }
      } else if (intentType === 'query_todo') {
        dataContext = await cloudListTodos();
        if (dataContext) console.log('[cloudChat] cloud todos list, len:', dataContext.length);
      } else if (intentType === 'query_contact') {
        dataContext = await cloudListContacts();
        if (dataContext) console.log('[cloudChat] cloud contacts list, len:', dataContext.length);
      } else {
        dataContext = await getCloudDataContext();
        if (dataContext) console.log('[cloudChat] cloud KV context, data_context len:', dataContext.length);
      }
    } else if (source === 'agent') {
      if (!bridgeFrame || !bridgeReady) continue;  // agent not available
      if (hasKeywords) {
        console.log('[cloudChat] Trying agent search for:', intent.contact_name, intent.keywords);
        const searchResult = await agentSearch(intent.keywords || [], intent.contact_name || '', intentType || '');
        if (searchResult) {
          dataContext = searchResult.data_context || '';
          conversationHistoryFromAgent = searchResult.conversation || [];
          console.log('[cloudChat] agent search, data_context len:', dataContext.length, 'matched:', searchResult.matched_count);
        }
      } else {
        const agentContext = await getAgentContext(text);
        if (agentContext) {
          dataContext = agentContext.data_context || '';
          conversationHistoryFromAgent = agentContext.conversation || [];
          console.log('[cloudChat] agent context, data_context len:', dataContext.length);
        }
      }
    }
  }

  // Step 3: Build messages for cloud LLM
  const systemPrompt = await getSystemPrompt(text, intentType);

  // Web search — if AI determined search is needed
  let searchContext = '';
  if (intent && intent.needs_search && intent.search_query) {
    console.log('[cloudChat] Web search needed:', intent.search_query);
    try {
      const searchToken = simulationMode
        ? `demo_${simulationData.id}:demo_secret`
        : await getClerkToken();
      if (searchToken) {
        const searchResp = await fetch(`${CLOUD_URL}/ai/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${searchToken}` },
          body: JSON.stringify({ session_token: searchToken, query: intent.search_query }),
        });
        if (searchResp.ok) {
          const searchData = await searchResp.json();
          if (searchData.search_context) {
            searchContext = searchData.search_context;
            console.log('[cloudChat] Web search results, len:', searchContext.length, 'provider:', searchData.provider);

            // G4: Auto-read top search result for deeper context
            if (searchData.results && searchData.results.length > 0 && searchData.results[0].url) {
              const topUrl = searchData.results[0].url;
              console.log('[cloudChat] Reading top result:', topUrl);
              try {
                const readResp = await fetch(`${CLOUD_URL}/ai/read_url`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${searchToken}` },
                  body: JSON.stringify({ session_token: searchToken, url: topUrl }),
                });
              if (readResp.ok) {
                const readData = await readResp.json();
                if (readData.status === 'ok' && readData.content) {
                  // Append full page content to search context
                  const pageContent = readData.content.slice(0, 4000); // cap at 4000 chars
                  searchContext += `\n\n--- 网页全文（${readData.title || topUrl}）---\n${pageContent}\n--- 网页全文结束 ---\n`;
                  console.log('[cloudChat] Read full page, +chars:', pageContent.length);
                }
              }
            } catch (e) {
              console.log('[cloudChat] Read URL failed:', e.message);
            }
          }
        }
      }
      }
    } catch (e) {
      console.log('[cloudChat] Web search failed:', e.message);
    }
  }

  // Build user message: combine text + data context + search results + flywheel info
  let userContent = text;
  const contextParts = [];
  if (dataContext) contextParts.push(`相关数据：\n${dataContext}`);
  if (searchContext) contextParts.push(searchContext);
  if (flywheelInfo) contextParts.push(`系统已自动执行：${flywheelInfo}。请在回复中确认已记录。`);
  if (contextParts.length > 0) {
    userContent = `用户消息：${text}\n\n${contextParts.join('\n\n')}\n\n请根据用户的消息和上面的数据，生成回复。直接回复内容，不要加"回复："之类的前缀。`;
  }

  // Build messages array: conversation history + current message
  const messages = [];
  if (conversationHistoryFromAgent.length > 0) {
    messages.push(...conversationHistoryFromAgent.slice(-4));
  } else if (conversationHistory.length > 0) {
    messages.push(...conversationHistory.slice(-4));
  }

  // If file attached, build multimodal content (text + file block)
  if (attachedFile && attachedFile.base64) {
    const fileBlock = attachedFile.isImage
      ? { type: 'image', source: { type: 'base64', media_type: attachedFile.mediaType, data: attachedFile.base64 } }
      : { type: 'document', source: { type: 'base64', media_type: attachedFile.mediaType, data: attachedFile.base64 } };
    const textBlock = { type: 'text', text: userContent || '请分析这个文件的内容。' };
    messages.push({ role: 'user', content: [fileBlock, textBlock] });
  } else {
    messages.push({ role: 'user', content: userContent });
  }

  // Step 4: Call cloud LLM
  console.log('[cloudChat] Calling cloud LLM, messages:', messages.length, 'total content len:', messages.reduce((a,m)=>a+(m.content||'').length,0));
  // Refresh token before LLM call — earlier steps may have taken time, token could expire
  const chatToken = simulationMode
    ? `demo_${simulationData.id}:demo_secret`
    : await getClerkToken();
  if (!chatToken) throw new Error('请先登录');
  setChatAbortController(new AbortController()); // H5: create abort controller
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${chatToken}` },
      body: JSON.stringify({
        session_token: chatToken,
        messages: messages,
        system: systemPrompt,
        max_tokens: 1024,
        model_tier: attachedFile ? 'enhanced' : currentModelTier,
      }),
      signal: chatAbortController.signal, // H5: attach abort signal
    });

    console.log('[cloudChat] Cloud response status:', resp.status);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    console.log('[cloudChat] Cloud reply length:', (data.reply||'').length);

    // Update conversation history
    conversationHistory.push({ role: 'user', content: text });
    conversationHistory.push({ role: 'assistant', content: data.reply });
    if (conversationHistory.length > 20) {
      setConversationHistory(conversationHistory.slice(-20));
    }
    if (bridgeFrame && bridgeReady) {
      saveAgentTurn(text, data.reply);
    }

    // H4: Persist to cloud session (fire-and-forget, don't block reply)
    saveSessionTurn(text, data.reply).catch(e => console.warn('[session] save failed:', e.message));

    // Check simulation goals after reply
    if (simulationMode) {
      checkSimulationGoals(intent, data.reply);
    }

    return data.reply;
  } catch (e) {
    throw e;
  }
}

export async function autoConnectAgent() {
  console.log('autoConnectAgent called, clerkUserId:', clerkUserId);

  // Cloud-first: immediately enter cloud mode so user can chat right away
  enableCloudMode();

  // Fetch routing config (mode, timeouts) from cloud
  fetchRoutingConfig();

  // Background: try to find local agent and upgrade to Live mode
  tryUpgradeToLive();
}

export async function tryUpgradeToLive() {
  // Phase 1: try direct tunnel URL
  console.log('[tryUpgradeToLive] trying direct tunnel:', AGENT_TUNNEL_URL);
  try {
    const result = await tryBridgeConnect(AGENT_TUNNEL_URL, 'tunnel');
    console.log('[tryUpgradeToLive] tunnel result:', result);
    if (result === 'auth_ok') {
      upgradeToLive('tunnel');
      return;
    }
  } catch(e) {
    console.log('[tryUpgradeToLive] tunnel failed:', e.message);
  }

  // Phase 2: try discovery service
  if (clerkUserId) {
    console.log('[tryUpgradeToLive] looking up tunnel via discovery…');
    try {
      const resp = await fetch(`${DISCOVERY_URL}/discover/lookup?user_id=${clerkUserId}`);
      const data = await resp.json();
      if (data.found && data.tunnel_url && data.tunnel_url !== AGENT_TUNNEL_URL) {
        console.log('[tryUpgradeToLive] found tunnel:', data.tunnel_url);
        const result = await tryBridgeConnect(data.tunnel_url, 'discovery');
        console.log('[tryUpgradeToLive] discovery result:', result);
        if (result === 'auth_ok') {
          upgradeToLive('discovery');
          return;
        }
      }
    } catch(e) {
      console.log('[tryUpgradeToLive] discovery failed:', e.message);
    }
  }

  // No local agent found — stay in cloud mode (already enabled)
  // Keep bridgeFrame alive — bridge WebSocket might connect later
  console.log('[tryUpgradeToLive] no agent found yet, staying in cloud mode');
}

export function upgradeToLive(source) {
  // Agent bridge is connected. Keep bridge alive for data-aware chat.
  // Switch routing: subsequent send() will use bridge (agent has data context).
  setIsCloud(false);
  setIsLive(true);
  // Register bridge message listener to receive agent replies
  window.addEventListener('message', onBridgeMessage);
  // Update status badge
  statusDot.className = 'status-dot online';
  statusText.textContent = 'Live';
  if (modeBadge) { modeBadge.textContent = 'Live'; modeBadge.className = 'mode-badge live'; }

  const chatMessages = body.querySelectorAll('.msg:not(.system)');
  if (chatMessages.length > 0) {
    // User already has conversation — don't disrupt
    console.log('Agent online — switching to data-aware mode (bridge kept)');
  } else {
    // No conversation yet — replace cloud welcome with Live welcome (no clearChat flash)
    console.log('Agent online — replacing cloud welcome with Live welcome');
    // Remove cloud welcome system message, add Live welcome
    const systemMsgs = body.querySelectorAll('.msg');
    systemMsgs.forEach(m => m.remove());
    addMsg('ai', I18N[currentLang].live_welcome);
  }

  // Show agent config panel in sidebar (Live mode only)
  const panel = document.getElementById('agentConfigPanel');
  if (panel) {
    panel.style.display = 'block';
    loadAgentConfigToUI();
  }

  // Auto-restore engine from agent config (in case we fell back to cloud earlier)
  // This ensures that after a bridge reconnect, we use the configured engine again
  // instead of staying on cloud LLM permanently.
  if (!window._agentEngine) {
    console.log('[upgradeToLive] No engine set, loading from agent config');
    loadAgentConfigToUI();
  } else {
    console.log('[upgradeToLive] Engine already set:', window._agentEngine);
  }
}

export async function loadAgentConfigToUI() {
  const cfg = await agentConfig('get');
  if (!cfg || cfg.error) {
    console.log('[agentConfig] load failed:', cfg?.message || 'no response');
    return;
  }
  const data = cfg.data || {};
  window._agentEngine = data.engine || 'edge';
  const engineSelect = document.getElementById('agentEngineSelect');
  if (engineSelect) engineSelect.value = data.engine || 'edge';
  onAgentEngineChange(data.engine || 'edge');
  const devin = data.devin || {};
  const modelInput = document.getElementById('devinModelInput');
  if (modelInput) modelInput.value = devin.model || '';
  const permSelect = document.getElementById('devinPermissionSelect');
  if (permSelect) permSelect.value = devin.permission_mode || 'dangerous';
  const maxTurnsInput = document.getElementById('devinMaxTurnsInput');
  if (maxTurnsInput) maxTurnsInput.value = devin.max_turns || 50;
  const timeoutInput = document.getElementById('devinTimeoutInput');
  if (timeoutInput) timeoutInput.value = devin.timeout || 600;
}

export function toggleAgentConfig() {
  const body = document.getElementById('agentConfigBody');
  const toggle = document.getElementById('agentConfigToggle');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (toggle) toggle.textContent = isOpen ? '▸' : '▾';
}

export function onAgentEngineChange(engine) {
  const devinFields = document.getElementById('devinConfigFields');
  if (devinFields) devinFields.style.display = engine === 'devin' ? 'block' : 'none';
}

export async function saveAgentConfig() {
  const engine = document.getElementById('agentEngineSelect')?.value || 'edge';
  const config = { engine };
  if (engine === 'devin') {
    config.devin = {
      model: document.getElementById('devinModelInput')?.value || '',
      permission_mode: document.getElementById('devinPermissionSelect')?.value || 'dangerous',
      max_turns: parseInt(document.getElementById('devinMaxTurnsInput')?.value || '50', 10),
      timeout: parseInt(document.getElementById('devinTimeoutInput')?.value || '600', 10),
    };
  }
  const result = await agentConfig('set', config);
  if (result && result.ok) {
    window._agentEngine = engine;
    addMsg('ai', `✅ Agent 引擎已切换为 ${engine === 'devin' ? 'Devin CLI' : 'Edge (本地 LLM)'}${engine === 'devin' && config.devin.model ? ' (模型: ' + config.devin.model + ')' : ''}`);
  } else if (result && result.error) {
    addMsg('ai', `⚠️ 配置保存失败：${result.message}\n请重启本地 agent（welian agent）后重试`);
  } else {
    addMsg('ai', '⚠️ 配置保存失败，请确认本地 agent 已连接');
  }
}

export function tryBridgeConnect(url, label) {
  return new Promise((resolve) => {
    let resolved = false;
    let iframeLoaded = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(`${label}: TIMEOUT after 8s. iframeLoaded=${iframeLoaded}`);
        // Don't remove iframe — it might connect later
        // Register late-auth listener for delayed bridge connection
        if (!bridgeReady) {
          const lateHandler = (e) => {
            const msg = e.data;
            if (!msg || msg.source !== 'welian-bridge') return;
            if (msg.type === 'ws-message' && msg.data && msg.data.type === 'auth_ok') {
              console.log(`${label}: LATE auth_ok received!`);
              setBridgeReady(true);
              window.removeEventListener('message', lateHandler);
              upgradeToLive('late-' + label);
            }
          };
          window.addEventListener('message', lateHandler);
        }
        resolve('no_bridge');
      }
    }, 8000);

    // Create hidden iframe — agent injects token into the page
    setBridgeFrame(document.createElement('iframe'));
    bridgeFrame.style.display = 'none';
    bridgeFrame.src = url + (clerkUserId ? '?clerk_uid=' + encodeURIComponent(clerkUserId) : '');

    // Detect iframe load
    bridgeFrame.onload = () => { iframeLoaded = true; console.log(`${label}: iframe loaded`); };

    const handler = (e) => {
      const msg = e.data;
      if (!msg || msg.source !== 'welian-bridge') return;

      if (msg.type === 'ready') {
        console.log(`${label}: bridge ready`);
      } else if (msg.type === 'device-id') {
        console.log(`${label}: device_id=${msg.device_id}`);
        if (clerkUserId && msg.device_id) {
          fetch(`${DISCOVERY_URL}/discover/link`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({user_id: clerkUserId, device_id: msg.device_id}),
          }).then(r=>r.json()).then(d=>{
            console.log('Linked device to user:', d);
          }).catch(e=>console.log('Link failed:', e));
        }
      } else if (msg.type === 'ws-message' && !resolved) {
        const data = msg.data;
        console.log(`${label}: ws-message`, data.type);
        if (data.type === 'auth_ok') {
          resolved = true;
          clearTimeout(timeout);
          setBridgeReady(true);
          window.removeEventListener('message', handler);
          resolve('auth_ok');
        } else if (data.type === 'error') {
          resolved = true;
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          resolve('no_bridge');
        }
      } else if (msg.type === 'ws-error' && !resolved) {
        console.log(`${label}: ws-error`);
        resolved = true;
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve('no_bridge');
      } else if (msg.type === 'log' && !resolved) {
        console.log(`${label}: [bridge]`, msg.message);
      }
    };
    window.addEventListener('message', handler);

    bridgeFrame.onerror = () => {
      if (!resolved) { resolved = true; clearTimeout(timeout); resolve('no_bridge'); }
    };

    document.body.appendChild(bridgeFrame);
  });
}

export function onAgentConnected(port) {
  setIsLive(true);
  if (modeBadge) { modeBadge.textContent = 'Live'; modeBadge.className = 'mode-badge live'; }
  statusDot.className = 'status-dot online';
  statusText.textContent = 'Connected';

  // Listen for messages from bridge (use named function so we can debug)
  window.addEventListener('message', onBridgeMessage);

  clearChat();
  addMsg('ai', I18N[currentLang].connected);
}

export function onBridgeMessage(e) {
  const msg = e.data;
  if (!msg || msg.source !== 'welian-bridge') return;

  if (msg.type === 'ws-message') {
    const data = msg.data;
    // Ignore context/save_turn/search responses (handled by their own listeners)
    if (data.id && (data.id.startsWith('ctx_') || data.id.startsWith('save_') || data.id.startsWith('sch_'))) return;
    // Ignore auth_ok (handled in tryBridgeConnect)
    if (data.type === 'auth_ok') return;
    // No other ws-message types expected in cloud-first mode
    console.log('Bridge ws-message (unhandled):', data.type, data.id);
  } else if (msg.type === 'ws-close') {
    console.log('Bridge ws-close — falling back to cloud-only mode (silent)');
    setIsLive(false);
    setBridgeReady(false);
    removeBridge();
    // Restore cloud mode so user can still chat
    if (!isCloud && isAuthed) {
      setIsCloud(true);
      statusDot.className = 'status-dot online';
      statusText.textContent = I18N[currentLang].cloud_status;
      if (modeBadge) { modeBadge.textContent = 'Cloud'; modeBadge.className = 'mode-badge live'; }
    }
    // Silent fallback: do NOT show "agent offline" system message to user.
    // The ws-close can be triggered by cloudflared tunnel idle timeout or
    // network fluctuation during normal chat. Showing a system message
    // interrupts the user's conversation. Cloud mode auto-takes over,
    // auto-reconnect runs in background. User doesn't need to know.
    // Auto-retry: attempt to reconnect bridge every 15s, restore engine on success
    // Uses setTimeout recursion (not setInterval) to avoid overlapping attempts
    if (!window._bridgeReconnectTimer) {
      console.log('[bridge] Starting auto-reconnect (every 15s)');
      const attemptReconnect = async () => {
        if (bridgeReady) {
          window._bridgeReconnectTimer = null;
          console.log('[bridge] Already connected — stopping retry');
          return;
        }
        // Clean up any orphaned iframe from previous failed attempt
        removeBridge();
        console.log('[bridge] Auto-reconnect attempt...');
        try {
          const result = await tryBridgeConnect(AGENT_TUNNEL_URL, 'reconnect');
          if (result === 'auth_ok') {
            window._bridgeReconnectTimer = null;
            // Must call upgradeToLive — tryBridgeConnect does NOT call it
            upgradeToLive('reconnect');
            console.log('[bridge] Reconnected — upgradeToLive called, engine restored from config');
            return;
          }
          // Clean up orphaned iframe on failed attempt
          removeBridge();
        } catch (e) {
          console.log('[bridge] Reconnect failed:', e.message);
          removeBridge();
        }
        // Schedule next attempt
        window._bridgeReconnectTimer = setTimeout(attemptReconnect, 15000);
      };
      window._bridgeReconnectTimer = setTimeout(attemptReconnect, 15000);
    }
  }
}

export async function showScenarioPicker() {
  const d = I18N[currentLang];
  const picker = document.getElementById('scenarioPicker');
  const cards = document.getElementById('scenarioCards');
  cards.innerHTML = `<p style="color:var(--dim);font-size:.8em">${d.roleplay_loading}</p>`;
  picker.style.display = 'flex';

  // Load all scenarios
  try {
    const scenarios = await Promise.all(
      SCENARIO_IDS.map(id => fetch(`/scenarios/${id}.json`).then(r => r.json()))
    );
    // Randomly pick 5
    const shuffled = [...scenarios].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, 5);
    cards.innerHTML = picked.map(s => `
      <div class="scenario-card" onclick="startSimulation('${s.id}')">
        <div class="scenario-card-avatar">${s.avatar}</div>
        <div class="scenario-card-name">${s.name}</div>
        <div class="scenario-card-title">${s.title}</div>
        <div class="scenario-card-tagline">${s.tagline}</div>
        <div class="scenario-card-goals">🎯 ${s.goals.length} ${d.roleplay_goals_count}</div>
      </div>
    `).join('');
    // Add refresh button
    const refreshDiv = document.createElement('div');
    refreshDiv.style.cssText = 'text-align:center;margin-top:16px;';
    refreshDiv.innerHTML = `<button onclick="showScenarioPicker()" style="padding:8px 20px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--dim);font-size:.85em;cursor:pointer;">${d.roleplay_refresh}</button>`;
    cards.appendChild(refreshDiv);
  } catch (e) {
    cards.innerHTML = `<p style="color:#C65D5D;font-size:.8em">${d.roleplay_load_fail}${e.message}</p>`;
  }
}

export function closeScenarioPicker() {
  document.getElementById('scenarioPicker').style.display = 'none';
}

export async function startSimulation(scenarioId) {
  closeScenarioPicker();

  // Load scenario data
  const resp = await fetch(`/scenarios/${scenarioId}.json`);
  setSimulationData(await resp.json());
  setSimulationPersona(simulationData.name);
  setSimulationGoals(simulationData.goals.map(g => ({ ...g, done: false })));
  setSimulationMode(true);

  // Load data into cloud KV under demo namespace
  await loadSimulationToCloud(simulationData);

  // Show goal tracker
  document.getElementById('goalTrackerTitle').textContent = `🎯 ${simulationPersona}`;
  updateGoalTracker();
  document.getElementById('goalTracker').style.display = 'block';
  document.getElementById('goalTracker').classList.add('expanded');

  // Enter cloud mode with simulation
  setIsCloud(true);
  setIsAuthed(false); // simulation doesn't need real auth
  hideWelcome();
  clearChat();

  // Show intro message with quick-start buttons
  const isSequential = simulationData.sequential_goals;
  const goalHint = isSequential
    ? `🎯 按时间线推进，完成一个目标后解锁下一个。当前目标：\n\n**${simulationGoals[0].title}**\n${simulationGoals[0].description}\n\n试试这些：`
    : `🎯 右上角有 ${simulationGoals.length} 个目标等你完成。试试这些：`;
  addMsg('ai', `${simulationData.avatar} 你现在是 **${simulationData.name}** — ${simulationData.title}\n\n${simulationData.intro}\n\n${goalHint}`);
  // Add quick-start suggestion chips based on the first goal
  setTimeout(() => {
    const g1 = simulationGoals[0] || {};
    const contact = g1.contact_names?.[0] || '';
    const keyword = g1.keywords?.[0] || '';
    let suggestions;
    if (g1.type === 'record_interaction' && contact) {
      suggestions = [
        '有什么待办？',
        `记一下今天和 ${contact} 聊了关于${keyword}的事`,
        `帮我给 ${contact} 写条消息`,
      ];
    } else if (g1.type === 'draft_message' && contact) {
      suggestions = [
        '有什么待办？',
        `帮我给 ${contact} 写一条消息`,
        '该联系谁？',
      ];
    } else if (contact) {
      suggestions = [
        '有什么待办？',
        `记一下今天和 ${contact} 的互动`,
        `帮我给 ${contact} 写条消息`,
      ];
    } else {
      suggestions = ['有什么待办？', '该联系谁？', '帮我拟一条消息'];
    }
    const chipsDiv = document.createElement('div');
    chipsDiv.className = 'suggestion-chips';
    chipsDiv.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 16px;';
    suggestions.forEach(s => {
      const chip = document.createElement('button');
      chip.className = 'suggestion-chip';
      chip.textContent = s;
      chip.style.cssText = 'padding:6px 14px;border:1px solid var(--border);border-radius:16px;background:transparent;color:var(--text);font-size:.82em;cursor:pointer;';
      chip.onclick = () => { input.value = s; send(); };
      chipsDiv.appendChild(chip);
    });
    const chatBody = document.getElementById('chatBody');
    chatBody.appendChild(chipsDiv);
    const scrollEl = document.querySelector('#chatMain main') || chatBody;
    scrollEl.scrollTop = scrollEl.scrollHeight;
  }, 500);
}

export async function loadSimulationToCloud(data) {
  // Use a demo sync_token to load data into cloud KV
  const demoUserId = `demo_${data.id}`;
  const demoToken = `${demoUserId}:demo_secret`;
  try {
    await fetch(`${CLOUD_URL}/data/sync_full`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sync_token: demoToken,
        contacts: data.contacts || [],
        todos: data.todos || [],
        timeline: data.timeline || [],
      }),
    });
    console.log('[simulation] Data loaded to cloud for', demoUserId);
  } catch (e) {
    console.error('[simulation] Failed to load data:', e);
  }
}

export function updateGoalTracker() {
  const done = simulationGoals.filter(g => g.done).length;
  const total = simulationGoals.length;
  document.getElementById('goalProgress').textContent = `${done}/${total}`;
  const list = document.getElementById('goalTrackerList');
  const isSequential = simulationData && simulationData.sequential_goals;
  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  if (isSequential) {
    const firstUndoneIdx = simulationGoals.findIndex(g => !g.done);

    if (isMobile) {
      // Mobile: only show current goal + next goal
      const items = [];
      if (firstUndoneIdx >= 0) {
        const current = simulationGoals[firstUndoneIdx];
        items.push(`<div class="goal-item pending"><div class="goal-item-title">${current.title}</div><div class="goal-item-desc">${current.description}</div></div>`);
        // Next goal preview (locked)
        if (firstUndoneIdx + 1 < simulationGoals.length) {
          items.push(`<div class="goal-item" style="opacity:.4"><div class="goal-item-title">🔒 下一个</div></div>`);
        }
      } else {
        items.push(`<div class="goal-item done"><div class="goal-item-title">🎉 全部完成！</div></div>`);
      }
      list.innerHTML = items.join('');
    } else {
      // Desktop: show all goals
      const items = simulationGoals.map((g, i) => {
        if (g.done) {
          return `<div class="goal-item done"><div class="goal-item-title">${g.title}</div></div>`;
        }
        if (i === firstUndoneIdx) {
          return `<div class="goal-item pending"><div class="goal-item-title">${g.title}</div><div class="goal-item-desc">${g.description}</div></div>`;
        }
        return `<div class="goal-item" style="opacity:.4"><div class="goal-item-title">🔒 ???</div></div>`;
      }).join('');
      list.innerHTML = items;
    }
  } else {
    list.innerHTML = simulationGoals.map(g => `
      <div class="goal-item ${g.done ? 'done' : 'pending'}">
        <div class="goal-item-title">${g.title}</div>
        <div class="goal-item-desc">${g.description}</div>
      </div>
    `).join('');
  }
}

export function toggleGoalTracker() {
  document.getElementById('goalTracker').classList.toggle('expanded');
}

export async function checkSimulationGoals(intent, reply) {
  if (!simulationMode) return;
  const replyLower = (reply || '').toLowerCase();
  const userText = (intent && intent.contact_name) || '';
  const isSequential = simulationData && simulationData.sequential_goals;

  // In sequential mode, only check the first uncompleted goal
  const goalsToCheck = isSequential
    ? [simulationGoals.find(g => !g.done)].filter(Boolean)
    : simulationGoals;

  for (const goal of goalsToCheck) {
    if (goal.done) continue;

    if (goal.type === 'record_interaction') {
      // Goal: record interactions with specific contacts
      // Check action_results for add_timeline matching contact_names
      if (intent && intent.action_results) {
        for (const ar of intent.action_results) {
          if (!ar.ok || ar.type !== 'add_timeline') continue;
          // Check if this action's contact matches goal's contact_names
          const arContact = (ar.contact_name || ar.summary || '').toLowerCase();
          const matched = (goal.contact_names || []).some(name =>
            arContact.includes(name.toLowerCase())
          );
          // If goal has keywords, also check summary
          let keywordMatch = true;
          if (goal.keywords && goal.keywords.length > 0) {
            const summaryLower = (ar.summary || '').toLowerCase();
            keywordMatch = goal.keywords.some(k => summaryLower.includes(k.toLowerCase()));
            if (goal.need_all_keywords) {
              keywordMatch = goal.keywords.every(k => summaryLower.includes(k.toLowerCase()));
            }
          }
          if (matched && keywordMatch) {
            goal._count = (goal._count || 0) + 1;
            if (goal._count >= (goal.count || 1)) {
              goal.done = true;
            }
          }
        }
      }
    }

    else if (goal.type === 'draft_message') {
      // Goal: draft a message to specific contact or about specific topic
      if (intent && intent.intent === 'draft') {
        // Check contact match
        let contactMatch = true;
        if (goal.contact_names && goal.contact_names.length > 0) {
          const intentContact = (intent.contact_name || '').toLowerCase();
          const replyText = replyLower;
          contactMatch = goal.contact_names.some(name =>
            intentContact.includes(name.toLowerCase()) || replyText.includes(name.toLowerCase())
          );
        }
        // Check keyword match
        let keywordMatch = true;
        if (goal.keywords && goal.keywords.length > 0) {
          keywordMatch = goal.keywords.some(k => replyLower.includes(k.toLowerCase()));
          if (goal.need_all_keywords) {
            keywordMatch = goal.keywords.every(k => replyLower.includes(k.toLowerCase()));
          }
        }
        if (contactMatch && keywordMatch) {
          goal.done = true;
        }
      }
    }

    else if (goal.type === 'any_action') {
      // Goal: any action (timeline/todo/draft) mentioning specific keywords
      let matched = false;
      // Check action_results
      if (intent && intent.action_results) {
        for (const ar of intent.action_results) {
          if (!ar.ok) continue;
          const text = ((ar.summary || '') + ' ' + (ar.task || '') + ' ' + (ar.name || '')).toLowerCase();
          if (goal.keywords && goal.keywords.some(k => text.includes(k.toLowerCase()))) {
            matched = true;
          }
        }
      }
      // Also check if user's message or reply contains keywords + draft intent
      if (!matched && intent && intent.intent === 'draft') {
        if (goal.keywords && goal.keywords.some(k => replyLower.includes(k.toLowerCase()))) {
          matched = true;
        }
      }
      if (matched) {
        goal._count = (goal._count || 0) + 1;
        if (goal._count >= (goal.count || 1)) {
          goal.done = true;
        }
      }
    }
  }

  updateGoalTracker();

  const d = I18N[currentLang];

  // Check if a new goal was just completed (in sequential mode)
  if (isSequential) {
    const justCompleted = goalsToCheck.find(g => g.done && !g._announced);
    if (justCompleted) {
      justCompleted._announced = true;
      const nextGoal = simulationGoals.find(g => !g.done);
      if (nextGoal) {
        addMsg('ai', d.roleplay_goal_done
          .replace('{title}', justCompleted.title)
          .replace('{next_title}', nextGoal.title)
          .replace('{next_desc}', nextGoal.description));
      } else {
        // All goals done — generate coupon
        await rewardCoupon(simulationData, d, false);
      }
    }
  } else {
    // Non-sequential: check if all goals done
    if (simulationGoals.every(g => g.done)) {
      await rewardCoupon(simulationData, d, true);
    }
  }
}

export async function rewardCoupon(simData, d, nonseq) {
  try {
    const resp = await fetch(`${CLOUD_URL}/ai/create_coupon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: 100, scenario: simData.id }),
    });
    const data = await resp.json();
    if (resp.ok && data.ok) {
      const msg = (nonseq ? d.roleplay_all_done_nonseq : d.roleplay_all_done)
        .replace('{avatar}', simData.avatar)
        .replace('{name}', simData.name)
        .replace('{code}', data.code)
        .replace('{points}', data.points);
      addMsg('ai', msg);
      // Also show a coupon card with copy button
      addMsg('ai', `${d.roleplay_coupon_title}\n\n**${d.roleplay_coupon_code}**: \`${data.code}\`\n${d.roleplay_coupon_points.replace('{points}', data.points)}\n${d.roleplay_coupon_hint}`);
      // Generate battle report card
      showBattleCard(simData, simulationGoals, data.code);
    } else {
      // Fallback: show completion without coupon
      addMsg('ai', `🎉 ${d.roleplay_all_done.replace('{avatar}', simData.avatar).replace('{name}', simData.name).replace('{code}', 'N/A').replace('{points}', 100)}`);
      showBattleCard(simData, simulationGoals, null);
    }
  } catch (e) {
    addMsg('ai', `🎉 ${d.roleplay_all_done.replace('{avatar}', simData.avatar).replace('{name}', simData.name).replace('{code}', 'N/A').replace('{points}', 100)}`);
    showBattleCard(simData, simulationGoals, null);
  }
}

export function showBattleCard(simData, goals, couponCode) {
  const completedGoals = goals.filter(g => g.done);
  const totalGoals = goals.length;
  const successRate = totalGoals > 0 ? Math.round(completedGoals.length / totalGoals * 100) : 100;

  // Extract a golden quote from conversation (last AI message)
  const chatBody = document.getElementById('chatBody');
  const aiMessages = chatBody.querySelectorAll('.msg.ai .msg-text');
  let goldenQuote = '';
  if (aiMessages.length > 0) {
    const lastFew = Array.from(aiMessages).slice(-5);
    for (const m of lastFew.reverse()) {
      const text = m.textContent || '';
      if (text.length > 15 && text.length < 120 && !text.includes('🎉') && !text.includes('奖券')) {
        goldenQuote = text.trim().slice(0, 100);
        break;
      }
    }
  }

  // Create canvas battle card
  const canvas = document.createElement('canvas');
  canvas.width = 750;
  canvas.height = 420;
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 750, 420);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(1, '#16213e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 750, 420);

  // Decorative border
  ctx.strokeStyle = '#e8c170';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 710, 380);

  // Avatar circle
  ctx.fillStyle = '#e8c170';
  ctx.beginPath();
  ctx.arc(80, 80, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a2e';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(simData.avatar || '🎭', 80, 80);

  // Character name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(simData.name || '角色扮演', 140, 70);

  // Subtitle
  ctx.fillStyle = '#a0a0b0';
  ctx.font = '14px sans-serif';
  ctx.fillText('Welian 角色扮演战报', 140, 95);

  // Stats
  ctx.fillStyle = '#e8c170';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${successRate}%`, 200, 180);
  ctx.fillStyle = '#a0a0b0';
  ctx.font = '12px sans-serif';
  ctx.fillText('目标完成率', 200, 210);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText(`${completedGoals.length}/${totalGoals}`, 400, 180);
  ctx.fillStyle = '#a0a0b0';
  ctx.font = '12px sans-serif';
  ctx.fillText('完成目标', 400, 210);

  ctx.fillStyle = '#4ecdc4';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('100', 600, 180);
  ctx.fillStyle = '#a0a0b0';
  ctx.font = '12px sans-serif';
  ctx.fillText('联点奖励', 600, 210);

  // Golden quote
  if (goldenQuote) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(40, 240, 670, 60);
    ctx.fillStyle = '#e8c170';
    ctx.font = 'italic 16px serif';
    ctx.textAlign = 'center';
    // Wrap text
    const words = goldenQuote.split('');
    let line = '';
    let y = 265;
    for (const w of words) {
      const test = line + w;
      if (ctx.measureText(test).width > 630) {
        ctx.fillText(line, 375, y);
        line = w;
        y += 22;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, 375, y);
  }

  // Footer
  ctx.fillStyle = '#a0a0b0';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('welian.app · 每段关系都值得用心', 375, 370);

  if (couponCode) {
    ctx.fillStyle = '#e8c170';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`奖券码: ${couponCode}`, 375, 390);
  }

  // Convert to image and show in chat
  const dataUrl = canvas.toDataURL('image/png');
  const cardHtml = `
    <div style="margin-top:12px;border-radius:12px;overflow:hidden">
      <img src="${dataUrl}" style="width:100%;max-width:375px;border-radius:12px;display:block" alt="战报卡片">
      <div style="display:flex;gap:8px;margin-top:8px;justify-content:center">
        <button onclick="downloadBattleCard('${dataUrl.replace(/'/g, "\\'")}','${(simData.name||'battle').replace(/'/g,"")}')" style="padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.85em">下载图片</button>
        <button onclick="shareBattleCard('${dataUrl.replace(/'/g, "\\'")}')" style="padding:8px 16px;background:none;border:1px solid var(--border);border-radius:8px;color:var(--dim);cursor:pointer;font-size:.85em">分享</button>
      </div>
    </div>
  `;
  addMsg('ai', cardHtml);
}

export function downloadBattleCard(dataUrl, name) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `welian-${name}-战报.png`;
  a.click();
}

export async function shareBattleCard(dataUrl) {
  if (navigator.share) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'welian-battle-card.png', { type: 'image/png' });
      await navigator.share({ files: [file], title: 'Welian 战报', text: '我用 Welian 完成了角色扮演挑战！welian.app' });
    } catch (e) {
      // Fallback: copy link
      navigator.clipboard.writeText('https://welian.app').then(() => alert('链接已复制，去微信粘贴分享吧'));
    }
  } else {
    navigator.clipboard.writeText('https://welian.app').then(() => alert('链接已复制，去微信粘贴分享吧'));
  }
}

export function exitSimulation() {
  setSimulationMode(false);
  setSimulationPersona(null);
  setSimulationData(null);
  setSimulationGoals([]);
  document.getElementById('goalTracker').style.display = 'none';
  clearChat();
  showWelcome();
  // Sign out any residual Clerk session before showing sign-up
  if (isAuthed && clerkInstance) {
    clerkInstance.signOut();
    onSignedOut();
  }
  // Show auth modal with sign-up (not sign-in) for new users
  setIsAuthed(false); // ensure toggleAuth doesn't treat this as sign-out
  toggleAuth('signup');
}
