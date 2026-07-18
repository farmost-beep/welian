// Auto-generated from app.js — do not edit manually

import { CLOUD_URL, I18N, WARMTH_QUOTES_EN, WARMTH_QUOTES_ZH, body, bridgeFrame, bridgeReady, cachedSystemPrompt, cachedUserProfile, cachedUserProfileObj, chatAbortController, chatDataCache, conversationHistory, currentLang, currentSessionId, input, isAuthed, isCloud, isLive, isRecording } from './state.js';
import { mineCache, pendingChatFile, proactiveFetchId, proactiveSuggestions, sessionList, setCachedSystemPrompt, setCachedUserProfile, setCachedUserProfileObj, setChatAbortController, setChatDataCache, setConversationHistory, setCurrentSessionId, setIsCloud, setIsRecording, setPendingChatFile, setProactiveFetchId, setProactiveSuggestions, setSessionList, setVoiceRecognition, setWeatherCache, simulationData } from './state.js';
import { simulationGoals, simulationMode, statusDot, statusText, todosCache, todosDoneCache, voiceRecognition, weatherCache, welcomeState } from './state.js';
import { cloudChat } from './agent-bridge.js';
import { escapeHtml, localDateStr, mineApi } from './misc.js';
import { getClerkToken } from './auth.js';

export async function saveSessionTurn(userMsg, assistantMsg) {
  if (simulationMode) return; // skip in simulation
  const token = await getClerkToken();
  if (!token) return;
  await fetch(`${CLOUD_URL}/data/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      session_token: token,
      action: 'append',
      session_id: currentSessionId,
      user_message: userMsg,
      assistant_message: assistantMsg,
    }),
  }).then(r => r.json()).then(data => {
    if (data.session_id && !currentSessionId) setCurrentSessionId(data.session_id);
  });
}

export async function loadSessionList() {
  if (simulationMode) return;
  const token = await getClerkToken();
  if (!token) return;
  const resp = await fetch(`${CLOUD_URL}/data/sessions`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!resp.ok) return;
  const data = await resp.json();
  setSessionList(data.sessions || []);
  renderSessionList();
}

export async function loadSession(sessionId) {
  const token = await getClerkToken();
  if (!token) return;
  const resp = await fetch(`${CLOUD_URL}/data/sessions?id=${sessionId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!resp.ok) return;
  const data = await resp.json();
  const session = data.session;
  if (!session) return;
  setCurrentSessionId(session.id);
  // Clear chat and replay messages
  body.innerHTML = '';
  setConversationHistory([]);
  for (const msg of (session.messages || [])) {
    addMsg(msg.role === 'user' ? 'you' : 'ai', msg.content);
    if (msg.role === 'user' || msg.role === 'assistant') {
      conversationHistory.push({ role: msg.role, content: msg.content });
    }
  }
  // Add summary chip at the end
  if ((session.messages || []).length > 0) {
    const zh = currentLang === 'zh';
    const chipDiv = document.createElement('div');
    chipDiv.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;';
    const chip = document.createElement('button');
    chip.textContent = zh ? '📝 生成会话摘要' : '📝 Summarize session';
    chip.style.cssText = 'padding:5px 12px;border:1px solid var(--border);border-radius:12px;background:transparent;color:var(--dim);font-size:.78em;cursor:pointer;transition:all .15s;font-family:inherit;';
    chip.onmouseenter = () => { chip.style.borderColor = 'var(--accent)'; chip.style.color = 'var(--accent)'; };
    chip.onmouseleave = () => { chip.style.borderColor = 'var(--border)'; chip.style.color = 'var(--dim)'; };
    chip.onclick = async () => {
      chip.textContent = zh ? '⏳ 生成中…' : '⏳ Generating…';
      chip.disabled = true;
      try {
        const summaryResp = await fetch(`${CLOUD_URL}/ai/session_summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ session_token: token, session_id: session.id }),
        });
        const summaryData = await summaryResp.json();
        const summary = summaryData.summary || (zh ? '无法生成摘要' : 'Failed to generate summary');
        addMsg('ai', zh ? `📋 **会话摘要**\n\n${summary}` : `📋 **Session Summary**\n\n${summary}`);
      } catch (e) {
        addMsg('ai', zh ? `生成摘要失败: ${e.message}` : `Summary failed: ${e.message}`);
      }
      chipDiv.remove();
    };
    chipDiv.appendChild(chip);
    body.appendChild(chipDiv);
    scrollToBottom();
  }
  hideWelcome();
  closeSidebar();
}

export function startNewSession() {
  setCurrentSessionId(null);
  setConversationHistory([]);
  body.innerHTML = '';
  showWelcome();
  closeSidebar();
}

export async function deleteSession(sessionId) {
  const token = await getClerkToken();
  if (!token) return;
  await fetch(`${CLOUD_URL}/data/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ session_token: token, action: 'delete', session_id: sessionId }),
  });
  await loadSessionList();
}

export function renderSessionList() {
  const container = document.getElementById('sessionListItems');
  if (!container) return;
  const filter = (window._sessionFilter || '').toLowerCase();
  const filtered = filter ? sessionList.filter(s => (s.title || '').toLowerCase().includes(filter)) : sessionList;
  if (filtered.length === 0) {
    container.innerHTML = `<div class="sidebar-empty">${filter ? '没有匹配的会话' : '暂无历史会话<br>开始聊天后会自动保存'}</div>`;
    return;
  }
  container.innerHTML = filtered.map(s => {
    const time = new Date(s.updated_at).toLocaleDateString('zh-CN', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const isActive = s.id === currentSessionId;
    return `<div class="session-item ${isActive ? 'active' : ''}" onclick="loadSession('${s.id}')">
      <div style="flex:1;min-width:0">
        <div class="session-item-title">${escapeHtml(s.title)}</div>
        <div class="session-item-meta">${time} · ${s.message_count} 条</div>
      </div>
      <button class="session-item-delete" onclick="event.stopPropagation();deleteSession('${s.id}')" title="删除">✕</button>
    </div>`;
  }).join('');
}

export function filterSessions(query) {
  window._sessionFilter = query;
  renderSessionList();
}

export function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const openBtn = document.getElementById('sidebarOpenBtn');
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    const isOpen = sidebar.classList.contains('mobile-open');
    if (isOpen) {
      sidebar.classList.remove('mobile-open');
      document.getElementById('sidebarOverlay').classList.remove('show');
      if (openBtn) openBtn.style.display = 'inline-block';
    } else {
      sidebar.classList.add('mobile-open');
      document.getElementById('sidebarOverlay').classList.add('show');
      if (openBtn) openBtn.style.display = 'none';
      loadSessionList();
    }
  } else {
    // Desktop: toggle collapsed (hover will re-expand)
    sidebar.classList.toggle('collapsed');
  }
}

export function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const openBtn = document.getElementById('sidebarOpenBtn');
  sidebar.classList.remove('mobile-open');
  document.getElementById('sidebarOverlay').classList.remove('show');
  // On mobile, show hamburger button when sidebar closes
  if (window.innerWidth <= 768 && openBtn) openBtn.style.display = 'inline-block';
}

export function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const openBtn = document.getElementById('sidebarOpenBtn');
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    sidebar.classList.add('mobile-open');
    document.getElementById('sidebarOverlay').classList.add('show');
    if (openBtn) openBtn.style.display = 'none';
  }
  // Desktop: sidebar is hover-controlled, no need to force open
  loadSessionList();
}

export async function getSystemPrompt(userQuery, intent) {
  // Load user profile from authenticated API (per-user, stored in KV)
  if (cachedUserProfile === '' && isAuthed) {
    try {
      const profileResp = await mineApi('/data/profile');
      if (profileResp && profileResp.profile) {
        const p = profileResp.profile;
        setCachedUserProfileObj(p);
        const parts = [];
        if (p.name) parts.push(`姓名：${p.name}`);
        if (p.occupation) parts.push(`职业：${p.occupation}`);
        if (p.company) parts.push(`公司：${p.company}`);
        if (p.industry) parts.push(`行业：${p.industry}`);
        if (p.location) parts.push(`所在地：${p.location}`);
        if (p.communication_style) parts.push(`沟通风格：${p.communication_style}`);
        if (p.address_habit) parts.push(`称呼习惯：${p.address_habit}`);
        if (p.focus_areas) parts.push(`关注领域：${p.focus_areas}`);
        if (p.message_tone) parts.push(`拟消息语气：${p.message_tone}`);
        if (p.career_goal) parts.push(`当前职业目标：${p.career_goal}`);
        if (p.current_projects) parts.push(`正在推进的事：${p.current_projects}`);
        if (p.network_direction) parts.push(`人脉方向：${p.network_direction}`);
        if (p.notes) parts.push(`附注：${p.notes}`);
        if (parts.length > 0) {
          setCachedUserProfile('\n\n--- 用户画像 ---\n' + parts.join('\n'));
          console.log('[getSystemPrompt] Loaded user profile, fields:', parts.length);
        } else {
          setCachedUserProfile(' ');
        }
      } else {
        setCachedUserProfile(' ');
      }
    } catch (e) {
      console.log('[getSystemPrompt] Failed to load profile:', e.message);
      setCachedUserProfile(' ');
    }
  }

  // Auto-recall relevant memories based on user query (F1)
  let memoryContext = '';
  if (isAuthed && userQuery) {
    try {
      const memResp = await mineApi('/data/memory?q=' + encodeURIComponent(userQuery) + '&limit=3');
      if (memResp && memResp.memories && memResp.memories.length > 0) {
        const memLines = memResp.memories.map(m => `- ${m.title}: ${m.content}`);
        memoryContext = '\n\n--- 相关记忆 ---\n' + memLines.join('\n');
        console.log('[getSystemPrompt] Recalled memories:', memResp.memories.length);
      }
    } catch (e) {
      console.log('[getSystemPrompt] Memory recall failed:', e.message);
    }
  }

  // Load skills based on intent (F4)
  let skillsContext = '';
  if (intent) {
    try {
      const skillsData = await mineApi('/ai/skills?intent=' + encodeURIComponent(intent));
      if (skillsData && skillsData.skills && skillsData.skills.length > 0) {
        skillsContext = '\n\n--- 可用技能 ---\n' + skillsData.skills.map(s => s.content).join('\n');
        console.log('[getSystemPrompt] Loaded skills:', skillsData.skills.map(s => s.name).join(', '));
      }
    } catch (e) {
      console.log('[getSystemPrompt] Skills load failed:', e.message);
    }
  }

  if (cachedSystemPrompt) {
    return cachedSystemPrompt + cachedUserProfile + memoryContext + skillsContext + getCurrentDateTimeContext();
  }
  try {
    const resp = await fetch('/AGENTS.md');
    if (resp.ok) {
      setCachedSystemPrompt(await resp.text());
      console.log('[getSystemPrompt] Loaded AGENTS.md, len:', cachedSystemPrompt.length);
      return cachedSystemPrompt + cachedUserProfile + memoryContext + skillsContext + getCurrentDateTimeContext();
    }
  } catch (e) {
    console.log('[getSystemPrompt] Failed to load AGENTS.md:', e.message);
  }
  // Fallback to hardcoded prompt
  setCachedSystemPrompt(`你是 Welian，一个关系管理 AI 助手。你帮用户管理社交关系、记录互动、提醒待办、拟写消息。

基于诚实原则，不编造事实和数据。如果数据中没有相关信息，如实告知用户。

你的风格：
- 简洁友好，像朋友在聊天
- 中文回复，适当用 emoji
- 回复不要太长，重点突出
- 如果用户在记录事情，确认记下了并简要复述
- 如果用户在查待办，只列出数据中有的待办，按紧急程度分组
- 如果用户在闲聊，自然回应，可以引导到关系管理话题

你会收到用户的原始消息和相关数据上下文。请严格基于数据回答，不要编造。
对话是连续的，请结合上下文理解用户的意图。`);
  return cachedSystemPrompt + cachedUserProfile + getCurrentDateTimeContext();
}

export function getCurrentDateTimeContext() {
  const now = new Date();
  const zh = currentLang === 'zh';
  const weekdays = zh ? ['周日','周一','周二','周三','周四','周五','周六'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dateStr = localDateStr(now);
  const timeStr = now.toLocaleTimeString(zh ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const weekday = weekdays[now.getDay()];
  const parts = [];

  // 1. Date + time + city + weather
  const w = weatherCache;
  const city = w?.city || '';
  const wDesc = w ? (zh ? `${w.temp}°${weatherText(w.code, zh)}` : `${w.temp}°${weatherText(w.code, zh)}`) : '';
  const locPart = city ? (zh ? `，在${city}` : `, in ${city}`) : '';
  const wxPart = wDesc ? (zh ? `，天气${wDesc}` : `, ${wDesc}`) : '';
  parts.push(zh
    ? `今天是 ${dateStr} ${weekday}，现在 ${timeStr}${locPart}${wxPart}。`
    : `Today is ${dateStr} ${weekday}, ${timeStr}${locPart}${wxPart}.`);

  // 2. Time-of-day semantic
  const h = now.getHours();
  let timeSlot;
  if (zh) {
    if (h < 6) timeSlot = '深夜（用户可能准备休息，建议简短温和）';
    else if (h < 9) timeSlot = '清晨（适合规划今天要联系谁）';
    else if (h < 12) timeSlot = '上午（工作时段，适合记录和拟消息）';
    else if (h < 14) timeSlot = '午休（适合快速记录互动）';
    else if (h < 18) timeSlot = '下午（工作时段）';
    else if (h < 22) timeSlot = '晚间（适合反思、写长消息、整理关系）';
    else timeSlot = '深夜（建议温和不催促）';
  } else {
    if (h < 6) timeSlot = 'late night (keep it brief and gentle)';
    else if (h < 9) timeSlot = 'early morning (good for planning who to contact)';
    else if (h < 12) timeSlot = 'morning (work hours, good for recording and drafting)';
    else if (h < 14) timeSlot = 'lunch break (good for quick interaction logging)';
    else if (h < 18) timeSlot = 'afternoon (work hours)';
    else if (h < 22) timeSlot = 'evening (good for reflection, long messages, organizing)';
    else timeSlot = 'late night (be gentle, no urging)';
  }
  parts.push(zh ? `时段：${timeSlot}` : `Time slot: ${timeSlot}`);

  // 3. Device type
  const ua = navigator.userAgent;
  const isMobile = /Mobile|Android|iPhone|iPod/.test(ua);
  const isTablet = /iPad|Tablet/.test(ua);
  const device = isMobile ? (zh ? '手机' : 'mobile') : isTablet ? (zh ? '平板' : 'tablet') : (zh ? '桌面端' : 'desktop');
  parts.push(zh ? `设备：${device}${isMobile ? '（建议简短操作，避免长表单）' : ''}` : `Device: ${device}${isMobile ? ' (prefer brief interactions)' : ''}`);

  // 4. Upcoming holidays (within 14 days)
  const holidays = getUpcomingHolidays(now, zh);
  if (holidays.length > 0) {
    parts.push(zh ? `近期节日：${holidays.join('、')}` : `Upcoming holidays: ${holidays.join(', ')}`);
  }

  // 5. Today's activity count
  const todayStr = dateStr;
  const timeline = chatDataCache.timeline || mineCache.timeline || [];
  const todayCount = timeline.filter(t => (t.date || '').slice(0, 10) === todayStr).length;
  if (todayCount > 0) {
    parts.push(zh ? `今日已记录 ${todayCount} 条互动` : `${todayCount} interactions recorded today`);
  } else {
    parts.push(zh ? `今日尚未记录互动` : `No interactions recorded today`);
  }

  // 6. Calendar events (if available)
  if (window._calendarEvents && window._calendarEvents.length > 0) {
    const todayEvents = window._calendarEvents.filter(e => (e.date || '').slice(0, 10) === todayStr);
    if (todayEvents.length > 0) {
      const evList = todayEvents.slice(0, 5).map(e => `${e.time || ''} ${e.title || ''}`.trim()).join('; ');
      parts.push(zh ? `今日日程：${evList}` : `Today's schedule: ${evList}`);
    }
  }

  // 7. Location semantic (home/office/traveling) — inferred from cached location vs profile
  const profile = cachedUserProfileObj || {};
  const profileLoc = profile.location || '';
  if (city && profileLoc) {
    const sameCity = city.includes(profileLoc) || profileLoc.includes(city);
    if (!sameCity) {
      parts.push(zh ? `用户正在出差/外出（常驻地${profileLoc}，当前在${city}）` : `User is traveling (based in ${profileLoc}, currently in ${city})`);
    }
  }

  const header = zh ? '--- 当前环境 ---' : '--- Current Context ---';
  return `\n\n${header}\n${parts.join('\n')}`;
}

export function getUpcomingHolidays(now, zh) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const today = new Date(y, m - 1, d);
  const list = [];

  // Fixed-date holidays: [month, day, zhName, enName]
  const fixed = [
    [1, 1, '元旦', 'New Year'],
    [2, 14, '情人节', "Valentine's Day"],
    [3, 8, '妇女节', "Women's Day"],
    [5, 1, '劳动节', 'Labor Day'],
    [6, 1, '儿童节', "Children's Day"],
    [10, 1, '国庆节', 'National Day'],
    [12, 25, '圣诞节', 'Christmas'],
    [12, 31, '跨年', "New Year's Eve"],
  ];

  for (const [mo, dy, zhN, enN] of fixed) {
    let date = new Date(y, mo - 1, dy);
    if (date < today) date = new Date(y + 1, mo - 1, dy);
    const daysAway = Math.round((date - today) / 86400000);
    if (daysAway <= 14 && daysAway >= 0) {
      const label = zh ? zhN : enN;
      list.push(daysAway === 0 ? (zh ? `今天${label}` : `today is ${label}`) : (zh ? `${daysAway}天后${label}（${mo}/${dy}）` : `${label} in ${daysAway} days (${mo}/${dy})`));
    }
  }

  // Lunar holidays — approximate dates for current year (precomputed)
  // These are close enough for "within 14 days" reminders
  const lunar = getLunarHolidays(y, zh);
  for (const { date, name } of lunar) {
    const daysAway = Math.round((date - today) / 86400000);
    if (daysAway <= 14 && daysAway >= 0) {
      list.push(daysAway === 0 ? (zh ? `今天${name}` : `today is ${name}`) : (zh ? `${daysAway}天后${name}` : `${name} in ${daysAway} days`));
    }
  }

  return list;
}

export function getLunarHolidays(year, zh) {
  // Precomputed/approximate lunar dates for Chinese holidays
  // Good enough for "within 14 days" reminder purposes
  const table = {
    2025: { '春节': '2025-01-29', '元宵节': '2025-02-12', '端午节': '2025-05-31', '中秋节': '2025-10-06' },
    2026: { '春节': '2026-02-17', '元宵节': '2026-03-03', '端午节': '2026-06-19', '中秋节': '2026-09-25' },
    2027: { '春节': '2027-02-06', '元宵节': '2027-02-20', '端午节': '2027-06-15', '中秋节': '2027-09-15' },
  };
  const names = zh
    ? { '春节': '春节', '元宵节': '元宵节', '端午节': '端午节', '中秋节': '中秋节' }
    : { '春节': 'Spring Festival', '元宵节': 'Lantern Festival', '端午节': 'Dragon Boat Festival', '中秋节': 'Mid-Autumn Festival' };
  const yearTable = table[year] || table[year + 1] || {};
  return Object.entries(yearTable).map(([k, v]) => ({
    date: new Date(v),
    name: names[k] || k,
  }));
}

export function hideWelcome() {
  if (welcomeState) {
    welcomeState.classList.add('hidden');
  }
}

export function showWelcome() {
  if (welcomeState) {
    welcomeState.classList.remove('hidden');
  }
}

export function scrollToBottom() {
  // Scroll the main container (layout changed: main is scroll container, not chatBody)
  const scrollEl = document.querySelector('#chatMain main') || body;
  scrollEl.scrollTop = scrollEl.scrollHeight;
  requestAnimationFrame(() => { scrollEl.scrollTop = scrollEl.scrollHeight; });
}

export function addMsg(who, text) {
  hideWelcome();
  let displayText = text;
  let aiSuggestions = null;
  if (who === 'ai') {
    // Extract <<<SUGGESTIONS>>> block from AI reply
    const marker = '<<<SUGGESTIONS>>>';
    const idx = text.indexOf(marker);
    if (idx >= 0) {
      displayText = text.substring(0, idx).trim();
      const sugBlock = text.substring(idx + marker.length).trim();
      aiSuggestions = sugBlock.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('```'));
      if (aiSuggestions.length === 0) aiSuggestions = null;
    }
  }
  const d = document.createElement('div');
  d.className = 'msg';
  const label = who === 'ai' ? 'Welian' : 'You';
  d.innerHTML = '<div class="who ' + who + '">' + label + '</div><div class="bubble ' + who + '">' + escapeHtml(displayText) + '</div>';
  body.appendChild(d);
  // F9: Add quick actions to AI messages
  if (who === 'ai') {
    addMsgActions(d, displayText);
    // Store AI-generated suggestions for addSuggestions to use
    if (aiSuggestions) window._lastAiSuggestions = aiSuggestions;
  }
  scrollToBottom();
}

export function addSystemMsg(text) {
  hideWelcome();
  const d = document.createElement('div');
  d.className = 'msg';
  d.innerHTML = '<div class="bubble system">' + escapeHtml(text) + '</div>';
  body.appendChild(d);
  scrollToBottom();
}

export function addTyping() {
  hideWelcome();
  const d = document.createElement('div');
  d.className = 'msg';
  d.id = 'typing';
  d.innerHTML = '<div class="who ai">Welian</div><div class="bubble ai"><span class="typing"></span></div>';
  body.appendChild(d);
  scrollToBottom();
}

export function removeTyping() {
  document.getElementById('typing')?.remove();
  scrollToBottom();
}

export async function buildUserSuggestions() {
  const token = await getClerkToken();
  if (!token) return ['有什么待办？', '该联系谁？', '帮我拟一条消息', '月度回顾'];

  let topContact = '';
  let overdueTodoContact = '';

  try {
    // Fetch contacts + timeline — pick most recently interacted contact
    const [cResp, tlResp] = await Promise.all([
      fetch(`${CLOUD_URL}/data/contacts`, { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch(`${CLOUD_URL}/data/timeline`, { headers: { 'Authorization': `Bearer ${token}` } }).catch(() => null),
    ]);
    if (cResp.ok) {
      const cData = await cResp.json();
      const contacts = cData.contacts || [];
      // Try to find most recently interacted contact from timeline
      if (tlResp && tlResp.ok) {
        const tlData = await tlResp.json();
        const timeline = (tlData.timeline || []).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        for (const t of timeline) {
          const c = contacts.find(c => c.id === t.contact);
          if (c) { topContact = c.name; break; }
        }
      }
      // Fallback: first contact
      if (!topContact && contacts.length > 0) topContact = contacts[0].name || '';
    }
  } catch (e) { /* ignore */ }

  try {
    // Fetch todos — find overdue/urgent ones
    const tResp = await fetch(`${CLOUD_URL}/data/todos`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (tResp.ok) {
      const tData = await tResp.json();
      const todos = tData.todos || [];
      const today = localDateStr();
      const overdue = todos.find(t => {
        const due = (t.due || '').substring(0, 10);
        return due && new Date(due) <= new Date(today);
      });
      if (overdue) overdueTodoContact = overdue.contact || '';
    }
  } catch (e) { /* ignore */ }

  // Build suggestions from real data
  const suggestions = [];
  if (overdueTodoContact) {
    suggestions.push(`帮我给 ${overdueTodoContact} 写条消息`);
  } else if (topContact) {
    suggestions.push(`帮我给 ${topContact} 写条消息`);
  } else {
    suggestions.push('帮我拟一条消息');
  }

  suggestions.push('有什么待办？');

  if (topContact) {
    suggestions.push(`记一下今天和 ${topContact} 的互动`);
  } else {
    suggestions.push('该联系谁？');
  }

  suggestions.push('月度回顾');

  return suggestions.slice(0, 4);
}

export async function buildContextAwareSuggestions(aiReply) {
  const zh = currentLang === 'zh';
  const fallback = await buildUserSuggestions();

  if (!aiReply) return fallback;

  // Find contacts mentioned in the AI reply
  const contacts = chatDataCache.contacts || [];
  // For short names (≤2 chars), require word-boundary match to avoid false positives
  // e.g. "金" should not match inside "今天" or "金钱"
  const mentioned = contacts.filter(c => {
    if (!c.name) return false;
    if (c.name.length <= 2) {
      // Use regex word-boundary for CJK: match as standalone, not inside other words
      // For CJK, check that surrounding chars are not common word continuations
      const escaped = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|[^\\u4e00-\\u9fff])${escaped}([^\\u4e00-\\u9fff]|$)`, 'u');
      return re.test(aiReply);
    }
    return aiReply.includes(c.name);
  }).map(c => c.name);

  const suggestions = [];

  // Detect user's intent from LAST message only (not full history)
  // Using full history caused stale intent — e.g. once "draft" was mentioned,
  // all subsequent suggestions stayed in draft mode forever
  const allUserMsgs = [...document.querySelectorAll('.msg .who.you')].map(el => el.nextElementSibling?.textContent || '');
  const lastUserMsg = allUserMsgs[allUserMsgs.length - 1] || '';
  const askedWhoToContact = /该联系谁|谁.*联系|who.*contact|who.*reach/i.test(lastUserMsg);
  const askedTodos = /待办|todo|任务/i.test(lastUserMsg);
  const askedDraft = /拟.*消息|写.*消息|draft.*message/i.test(lastUserMsg);
  const askedContactInfo = /详细信息|互动记录|详情|details|last.*interaction/i.test(lastUserMsg);

  // If AI mentioned specific contacts, offer actions on them
  if (mentioned.length > 0) {
    const firstContact = mentioned[0];
    const secondContact = mentioned[1] || '';
    const thirdContact = mentioned[2] || '';

    if (askedWhoToContact) {
      // Conversation started from "who to contact" — ALL suggestions about mentioned contacts
      if (zh) {
        suggestions.push(`帮我给${firstContact}写条消息`);
        if (secondContact) suggestions.push(`帮我给${secondContact}写条消息`);
        else suggestions.push(`${firstContact}最近有什么互动记录？`);
        if (thirdContact) suggestions.push(`帮我给${thirdContact}写条消息`);
        else if (secondContact) suggestions.push(`${firstContact}最近有什么互动记录？`);
        else suggestions.push(`${firstContact}的详细信息`);
      } else {
        suggestions.push(`draft a message to ${firstContact}`);
        if (secondContact) suggestions.push(`draft a message to ${secondContact}`);
        else suggestions.push(`what's the last interaction with ${firstContact}?`);
        if (thirdContact) suggestions.push(`draft a message to ${thirdContact}`);
        else if (secondContact) suggestions.push(`what's the last interaction with ${firstContact}?`);
        else suggestions.push(`${firstContact}'s details`);
      }
    } else if (askedDraft) {
      // User asked to draft — offer to record or refine
      if (zh) {
        suggestions.push(`记一下今天和${firstContact}的互动`);
        suggestions.push(`再写一版更正式的`);
        if (secondContact) suggestions.push(`帮我给${secondContact}写条消息`);
        else suggestions.push(`${firstContact}的详细信息`);
        suggestions.push(`再写一版更轻松的`);
      } else {
        suggestions.push(`note: interacted with ${firstContact} today`);
        suggestions.push(`write a more formal version`);
        if (secondContact) suggestions.push(`draft a message to ${secondContact}`);
        else suggestions.push(`${firstContact}'s details`);
        suggestions.push(`write a more casual version`);
      }
    } else if (askedContactInfo) {
      // User asked about contact details — offer actions on this contact
      if (zh) {
        suggestions.push(`帮我给${firstContact}写条消息`);
        suggestions.push(`记一下今天和${firstContact}的互动`);
        if (secondContact) suggestions.push(`帮我给${secondContact}写条消息`);
        else suggestions.push(`这周该联系谁？`);
        suggestions.push(`${firstContact}有什么待办？`);
      } else {
        suggestions.push(`draft a message to ${firstContact}`);
        suggestions.push(`note: met with ${firstContact} today`);
        if (secondContact) suggestions.push(`draft a message to ${secondContact}`);
        else suggestions.push(`who should I contact this week?`);
        suggestions.push(`any todos for ${firstContact}?`);
      }
    } else if (askedTodos) {
      // User asked about todos — follow up on the todo-related contact
      if (zh) {
        suggestions.push(`帮我给${firstContact}写条消息`);
        suggestions.push(`${firstContact}最近有什么互动记录？`);
        if (secondContact) suggestions.push(`帮我给${secondContact}写条消息`);
        else suggestions.push(`${firstContact}的详细信息`);
        suggestions.push(`推迟这个待办`);
      } else {
        suggestions.push(`draft a message to ${firstContact}`);
        suggestions.push(`what's the last interaction with ${firstContact}?`);
        if (secondContact) suggestions.push(`draft a message to ${secondContact}`);
        else suggestions.push(`${firstContact}'s details`);
        suggestions.push(`postpone this todo`);
      }
    } else {
      // Default: all suggestions about mentioned contacts
      if (zh) {
        suggestions.push(`帮我给${firstContact}写条消息`);
        if (secondContact) suggestions.push(`帮我给${secondContact}写条消息`);
        else suggestions.push(`记一下今天和${firstContact}的互动`);
        if (thirdContact) suggestions.push(`帮我给${thirdContact}写条消息`);
        else if (secondContact) suggestions.push(`${firstContact}最近有什么互动记录？`);
        else suggestions.push(`${firstContact}的详细信息`);
      } else {
        suggestions.push(`draft a message to ${firstContact}`);
        if (secondContact) suggestions.push(`draft a message to ${secondContact}`);
        else suggestions.push(`note: met with ${firstContact} today`);
        if (thirdContact) suggestions.push(`draft a message to ${thirdContact}`);
        else if (secondContact) suggestions.push(`what's the last interaction with ${firstContact}?`);
        else suggestions.push(`${firstContact}'s details`);
      }
    }
  } else {
    // No contacts mentioned — use fallback
    return fallback;
  }

  return suggestions.slice(0, 4);
}

export async function addSuggestions(aiReply) {
  let suggestions = [];

  if (simulationMode && simulationData) {
    // Simulation: suggestions based on current scenario + current goal
    const currentGoal = simulationGoals.find(g => !g.done);

    if (currentGoal) {
      if (currentGoal.type === 'record_interaction') {
        const contact = currentGoal.contact_names?.[0] || '';
        suggestions = [
          '有什么待办？',
          `记一下今天和 ${contact} 聊了关于${currentGoal.keywords?.[0] || '工作'}的事`,
          `帮我给 ${contact} 写条消息`,
        ];
      } else if (currentGoal.type === 'draft_message') {
        const contact = currentGoal.contact_names?.[0] || '';
        suggestions = [
          '有什么待办？',
          `帮我给 ${contact || '团队'} 写一条消息`,
          '该联系谁？',
        ];
      } else {
        suggestions = ['有什么待办？', '该联系谁？', '帮我拟一条消息'];
      }
    } else {
      suggestions = ['有什么待办？', '该联系谁？', '月度回顾'];
    }
  } else {
    // Logged-in user: prefer AI-generated suggestions, fall back to data-based
    if (window._lastAiSuggestions && window._lastAiSuggestions.length > 0) {
      suggestions = window._lastAiSuggestions.slice(0, 4);
      window._lastAiSuggestions = null; // consume
    } else {
      suggestions = await buildUserSuggestions();
    }
  }

  // Append chips inside the last AI message bubble (natural extension of reply)
  const aiMsgs = body.querySelectorAll('.msg .who.ai');
  const lastAiMsg = aiMsgs.length ? aiMsgs[aiMsgs.length - 1].closest('.msg') : null;
  const chipsDiv = document.createElement('div');
  chipsDiv.className = 'suggestion-chips';
  chipsDiv.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;';
  suggestions.forEach(s => {
    const chip = document.createElement('button');
    chip.className = 'suggestion-chip';
    chip.textContent = s;
    chip.style.cssText = 'padding:4px 11px;border:1px solid var(--border);border-radius:12px;background:transparent;color:var(--dim);font-size:.76em;cursor:pointer;transition:all .15s;font-family:inherit;';
    chip.onmouseenter = () => { chip.style.borderColor = 'var(--accent)'; chip.style.color = 'var(--accent)'; };
    chip.onmouseleave = () => { chip.style.borderColor = 'var(--border)'; chip.style.color = 'var(--dim)'; };
    chip.onclick = () => { input.value = s; send(); };
    chipsDiv.appendChild(chip);
  });
  if (lastAiMsg) {
    lastAiMsg.appendChild(chipsDiv);
  } else {
    chipsDiv.style.margin = '0 0 16px';
    body.appendChild(chipsDiv);
  }
  scrollToBottom();
}

export function clearChat() {
  body.innerHTML = '';
}

export async function handleChatFile(file) {
  if (!file) return;
  // 10MB limit
  if (file.size > 10 * 1024 * 1024) {
    alert('文件不能超过 10MB');
    document.getElementById('chatFileInput').value = '';
    return;
  }
  const lowerName = file.name.toLowerCase();
  const isImage = lowerName.match(/\.(png|jpg|jpeg|gif|bmp|webp)$/);
  let mediaType = file.type || 'application/octet-stream';
  // Ensure correct media types for common formats
  if (lowerName.endsWith('.pdf')) mediaType = 'application/pdf';
  else if (lowerName.endsWith('.xlsx')) mediaType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  else if (lowerName.endsWith('.xls')) mediaType = 'application/vnd.ms-excel';
  else if (lowerName.endsWith('.docx')) mediaType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  else if (lowerName.endsWith('.doc')) mediaType = 'application/msword';
  else if (lowerName.endsWith('.png')) mediaType = 'image/png';
  else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) mediaType = 'image/jpeg';
  else if (lowerName.endsWith('.gif')) mediaType = 'image/gif';
  else if (lowerName.endsWith('.bmp')) mediaType = 'image/bmp';
  else if (lowerName.endsWith('.webp')) mediaType = 'image/webp';

  try {
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    setPendingChatFile({ base64, filename: file.name, mediaType, isImage: !!isImage });
    // Show preview
    const preview = document.getElementById('chatFilePreview');
    const nameEl = document.getElementById('chatFileName');
    if (preview && nameEl) {
      nameEl.textContent = `📎 ${file.name}`;
      preview.style.display = 'flex';
    }
  } catch (e) {
    alert('文件读取失败: ' + e.message);
  }
  document.getElementById('chatFileInput').value = '';
}

export function clearChatFile() {
  setPendingChatFile(null);
  const preview = document.getElementById('chatFilePreview');
  if (preview) preview.style.display = 'none';
}

export async function send() {
  const text = input.value.trim();
  const file = pendingChatFile;
  if (!text && !file) return;
  input.value = '';

  // Show user message with file indicator
  let displayText = text;
  if (file) displayText = (text ? text + ' ' : '') + `📎 ${file.filename}`;
  addMsg('you', displayText);
  addTyping();
  clearChatFile();

  // H5: Show stop button while generating
  const sendBtn = document.getElementById('sendBtn');
  const stopBtn = document.getElementById('stopBtn');
  if (sendBtn) sendBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = '';

  if (isCloud || isLive || simulationMode) {
    // Unified cloud-first flow: cloudChat handles both cases
    // - If agent bridge is available: gets edge data context, then calls cloud LLM
    // - If no agent: calls cloud LLM directly (no data context)
    try {
      const reply = await cloudChat(text, file);
      removeTyping();
      addMsg('ai', reply);
      addSuggestions(reply);
    } catch (e) {
      removeTyping();
      if (e.name === 'AbortError') {
        addMsg('ai', '已停止生成。');
      } else {
        addMsg('ai', I18N[currentLang].cloud_error + e.message);
      }
    }
  } else if (isAuthed) {
    // Fix: authed user whose isCloud/isLive were reset (e.g. agent disconnect) — auto-restore cloud mode
    setIsCloud(true);
    statusDot.className = 'status-dot online';
    statusText.textContent = I18N[currentLang].cloud_status;
    try {
      const reply = await cloudChat(text, file);
      removeTyping();
      addMsg('ai', reply);
      addSuggestions(reply);
    } catch (e) {
      removeTyping();
      if (e.name === 'AbortError') {
        addMsg('ai', '已停止生成。');
      } else {
        addMsg('ai', I18N[currentLang].cloud_error + e.message);
      }
    }
  } else {
    // Not connected — prompt to sign in
    removeTyping();
    addMsg('ai', I18N[currentLang].signin_prompt);
  }

  // H5: Restore send button
  if (sendBtn) sendBtn.style.display = '';
  if (stopBtn) stopBtn.style.display = 'none';
  setChatAbortController(null);
}

export function stopChat() {
  if (chatAbortController) {
    chatAbortController.abort();
    console.log('[stopChat] Aborted by user');
  }
}

export function quickSend(text) {
  input.value = text;
  send();
}

export function quickNote() {
  hideWelcome();
  input.value = 'note: ';
  input.focus();
  input.setSelectionRange(6, 6);
}

export function quickDraft() {
  hideWelcome();
  input.value = 'draft a message to ';
  input.focus();
  const len = input.value.length;
  input.setSelectionRange(len, len);
}

export function quickDraftTo(name) {
  const zh = currentLang === 'zh';
  hideWelcome();
  input.value = zh ? `帮我给${name}写条消息` : `draft a message to ${name}`;
  input.focus();
  send();
}

export async function loadChatEnhancements() {
  if (!isAuthed) return;
  try {
    const [contactsRes, todosRes, timelineRes] = await Promise.all([
      mineApi('/data/contacts'),
      mineApi('/data/todos'),
      mineApi('/data/timeline'),
    ]);
    setChatDataCache({
      contacts: contactsRes.contacts || [],
      todos: todosRes.todos || [],
      timeline: timelineRes.timeline || [],
    });
    // Also populate mineCache.contacts so openContactDetail works from chat view
    mineCache.contacts = chatDataCache.contacts;
    // F1: Daily dashboard
    renderDailyDashboard();
    // F4: Reminder card
    showReminderCard();
  } catch (e) {
    console.log('[loadChatEnhancements] data load failed:', e.message);
  }
  // Always render right sidebar (even with empty data, shows empty states)
  renderDesktopSidebar();
  // F2: Quick actions (show for logged-in users)
  document.getElementById('quickActions').style.display = 'none';
  // F3: Tab badges
  updateTabBadges();
  // F4b: Proactive AI suggestions
  fetchProactiveSuggestions();
  // F7: Empty state
  toggleEmptyState();
  // Warmth elements (only show on welcome screen)
  showWarmthQuote();
  showStreakBadge();
}

export function renderDailyDashboard() {
  const { contacts, todos, timeline } = chatDataCache;
  if (!contacts.length) return;
  const el = document.getElementById('dailyDashboard');
  const zh = currentLang === 'zh';
  const now = new Date();
  const todayStr = localDateStr(now);

  // Overdue todos (show max 3, most overdue first)
  const overdueTodos = todos.filter(t => !t.done && t.due && t.due.substring(0, 10) < todayStr)
    .sort((a, b) => (a.due || '').localeCompare(b.due || '')).slice(0, 3);
  const todayTodos = todos.filter(t => !t.done && t.due && t.due.substring(0, 10) === todayStr);

  // Contacts not contacted in 14+ days (leverage only, not nurture)
  const contactMap = {};
  contacts.forEach(c => contactMap[c.id] = c);
  const lastContact = {};
  timeline.forEach(t => { if (t.contact) lastContact[t.contact] = t.date; });
  const staleContacts = contacts
    .filter(c => c.nature === 'leverage' || c.nature === 'dual')
    .filter(c => {
      const snooze = c.snooze_until;
      if (snooze && snooze.substring(0, 10) > todayStr) return false;
      return true;
    })
    .map(c => {
      const last = lastContact[c.id];
      if (!last) return { c, days: 999 };
      const days = Math.floor((new Date(todayStr) - new Date((last || '').substring(0, 10))) / 86400000);
      return { c, days };
    })
    .filter(x => x.days >= 14)
    .sort((a, b) => b.days - a.days)
    .slice(0, 3);

  // Upcoming important dates (next 30 days)
  const upcomingDates = [];
  contacts.forEach(c => {
    (c.important_dates || []).forEach(dt => {
      const dateStr = dt.date || '';
      if (dateStr.length >= 5) {
        const mmdd = dateStr.length === 5 ? dateStr : dateStr.substring(5);
        const thisYear = `${now.getFullYear()}-${mmdd}`;
        const dDate = new Date(thisYear);
        const delta = Math.floor((dDate - now) / 86400000);
        if (delta >= 0 && delta <= 30) {
          upcomingDates.push({ name: c.name, date: mmdd, label: dt.label || '', delta, contactId: c.id });
        }
      }
    });
  });
  upcomingDates.sort((a, b) => a.delta - b.delta);

  let inner = '';
  const hasContent = overdueTodos.length || todayTodos.length || staleContacts.length || upcomingDates.length;
  const totalCount = overdueTodos.length + todayTodos.length + staleContacts.length + upcomingDates.length;

  if (!hasContent) {
    inner += `<div class="dashboard-card"><div class="dashboard-empty">${zh ? '✨ 今日无待办，关系都在路上' : '✨ All caught up today'}</div></div>`;
  } else {
    if (overdueTodos.length || todayTodos.length) {
      inner += `<div class="dashboard-card" onclick="openMine();setTimeout(()=>switchMineTab('todos'),100)">`;
      inner += `<div class="dashboard-card-title">✅ ${zh ? '今日待办' : 'Today\'s Todos'}</div>`;
      todayTodos.forEach(t => {
        const name = contactMap[t.contact]?.name || '';
        inner += `<div class="dashboard-item"><span class="icon">📌</span><span class="text">${escapeHtml((t.task||'').substring(0,40))}${name?' ['+escapeHtml(name)+']':''}</span><span class="badge">${zh?'今天':'Today'}</span></div>`;
      });
      overdueTodos.forEach(t => {
        const name = contactMap[t.contact]?.name || '';
        inner += `<div class="dashboard-item"><span class="icon">⚠️</span><span class="text">${escapeHtml((t.task||'').substring(0,40))}${name?' ['+escapeHtml(name)+']':''}</span><span class="badge urgent">${zh?'超期':'Overdue'}</span></div>`;
      });
      inner += `</div>`;
    }
    if (staleContacts.length) {
      inner += `<div class="dashboard-card">`;
      inner += `<div class="dashboard-card-title" onclick="event.stopPropagation();openMine();setTimeout(()=>switchMineTab('contacts'),100)" style="cursor:pointer">🌿 ${zh ? '该联系了' : 'Time to Reconnect'}</div>`;
      staleContacts.forEach(x => {
        const days = x.days === 999 ? (zh?'从未联系':'never') : `${x.days}${zh?'天':'d'}`;
        inner += `<div class="dashboard-item" style="cursor:pointer" onclick="event.stopPropagation();quickDraftTo('${escapeHtml(x.c.name).replace(/'/g,"\\'")}')"><span class="icon">🔄</span><span class="text">${escapeHtml(x.c.name)}</span><span class="badge">${days}</span><button onclick="event.stopPropagation();snoozeContact('${escapeHtml(x.c.id)}','${escapeHtml(x.c.name).replace(/'/g,"\\'")}')" style="font-size:.65em;padding:1px 6px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--dimmer);cursor:pointer;margin-left:4px;white-space:nowrap">${zh?'暂不':'snooze'}</button></div>`;
      });
      inner += `</div>`;
    }
    if (upcomingDates.length) {
      inner += `<div class="dashboard-card" onclick="openMine();setTimeout(()=>switchMineTab('overview'),100)">`;
      inner += `<div class="dashboard-card-title">📅 ${zh ? '近期重要日期' : 'Upcoming Dates'}</div>`;
      upcomingDates.slice(0, 3).forEach(dt => {
        const deltaLabel = dt.delta === 0 ? (zh?'今天':'today') : `${dt.delta}${zh?'天后':'d'}`;
        inner += `<div class="dashboard-item"><span class="icon">🎂</span><span class="text">${escapeHtml(dt.name)} — ${escapeHtml(dt.label||dt.date)}</span><span class="badge">${deltaLabel}</span></div>`;
      });
      inner += `</div>`;
    }
  }
  // Compact toggle bar + expandable inner
  const summaryParts = [];
  if (overdueTodos.length) summaryParts.push(`${overdueTodos.length}${zh?'超期':'overdue'}`);
  if (todayTodos.length) summaryParts.push(`${todayTodos.length}${zh?'今天':'today'}`);
  if (staleContacts.length) summaryParts.push(`${staleContacts.length}${zh?'该联系':'stale'}`);
  if (upcomingDates.length) summaryParts.push(`${upcomingDates.length}${zh?'日期':'dates'}`);
  const summary = summaryParts.join(' · ') || (zh ? '一切就绪' : 'All good');

  el.innerHTML = `
    <div class="dashboard-toggle" onclick="toggleDashboard()">
      <span>📋 ${zh ? '今日关系看板' : 'Today\'s Dashboard'}</span>
      <span class="count">${totalCount}</span>
      <span style="color:var(--dimmer);font-size:.9em">${summary}</span>
      <span class="arrow">▾</span>
    </div>
    <div class="dashboard-inner">${inner}</div>
  `;
  el.classList.add('daily-dashboard');
  el.style.display = 'block';
  // On desktop (≥1200px), auto-expand the left panel
  if (window.innerWidth >= 1200) el.classList.add('expanded');
}

export function toggleDashboard() {
  const el = document.getElementById('dailyDashboard');
  el.classList.toggle('expanded');
}

export async function snoozeContact(contactId, contactName) {
  const zh = currentLang === 'zh';
  const days = 30;
  const snoozeUntil = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  try {
    await mineApi('/data/contacts', 'POST', { id: contactId, name: contactName, snooze_until: snoozeUntil });
    // Update cache
    const c = (chatDataCache.contacts || []).find(c => c.id === contactId);
    if (c) c.snooze_until = snoozeUntil;
    const mc = (mineCache.contacts || []).find(c => c.id === contactId);
    if (mc) mc.snooze_until = snoozeUntil;
    // Re-render right sidebar
    renderDesktopSidebar();
  } catch (e) {
    alert((zh ? '操作失败：' : 'Failed: ') + e.message);
  }
}

export function quickAction(type) {
  const zh = currentLang === 'zh';
  const prompts = {
    record: zh ? '记一下今天和' : 'note: today I met with ',
    who: zh ? '该联系谁了？' : 'who should I contact?',
    draft: zh ? '帮我给' : 'draft a message to ',
    weekly: zh ? '这周总结' : 'weekly summary',
  };
  const prefix = prompts[type] || prompts.record;
  hideWelcome();
  input.value = prefix;
  input.focus();
  if (type === 'record' || type === 'draft') {
    input.setSelectionRange(prefix.length, prefix.length);
  } else {
    send();
  }
}

export function updateTabBadges() {
  const { todos, timeline } = chatDataCache;
  const now = new Date();
  const todayStr = now.toISOString().substring(0, 10);
  // Todos badge: count overdue
  const overdueCount = todos.filter(t => !t.done && t.due && t.due.substring(0, 10) < todayStr).length;
  const todosBadge = document.getElementById('tabBadgeTodos');
  if (todosBadge) todosBadge.innerHTML = overdueCount > 0 ? `<span class="tab-badge"></span>` : '';
  // Weekly badge: show on Monday or if no weekly report this week
  const day = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - day);
  const weekStartStr = weekStart.toISOString().substring(0, 10);
  const hasWeeklyThisWeek = timeline.some(t => (t.date || '').substring(0, 10) >= weekStartStr && (t.summary || '').includes('周报'));
  const weeklyBadge = document.getElementById('tabBadgeWeekly');
  if (weeklyBadge) weeklyBadge.innerHTML = (!hasWeeklyThisWeek && day <= 1) ? `<span class="tab-badge"></span>` : '';
}

export function showReminderCard() {
  const { timeline } = chatDataCache;
  const el = document.getElementById('reminderCard');
  if (!el) return;
  // Check if dismissed today
  const today = localDateStr();
  if (localStorage.getItem('welian_reminder_dismissed') === today) { el.style.display = 'none'; return; }
  // Check days since last interaction
  const zh = currentLang === 'zh';
  if (!timeline.length) {
    el.innerHTML = `<div class="reminder-card"><span class="icon">🌱</span><div class="text">${zh?'开始记录你的第一段互动吧':'Start recording your first interaction'}<div class="sub">${zh?'告诉小维你最近见了谁':'Tell Welian who you met recently'}</div></div><button class="close" onclick="dismissReminder()">✕</button></div>`;
    el.style.display = 'block';
    return;
  }
  const lastDate = (timeline[0]?.date || '').substring(0, 10);
  const todayStr = localDateStr();
  const days = lastDate ? Math.floor((new Date(todayStr) - new Date(lastDate)) / 86400000) : 9999;
  if (days >= 3) {
    el.innerHTML = `<div class="reminder-card"><span class="icon">💬</span><div class="text">${zh?`你已经有 ${days} 天没记录互动了`:`You haven't logged an interaction in ${days} days`}<div class="sub">${zh?'要不要记一下最近见了谁？':'Want to log who you met recently?'}</div></div><button class="close" onclick="dismissReminder()">✕</button></div>`;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

export function dismissReminder() {
  const today = localDateStr();
  localStorage.setItem('welian_reminder_dismissed', today);
  document.getElementById('reminderCard').style.display = 'none';
}

export async function fetchProactiveSuggestions() {
  if (!isAuthed) return;
  // Cancel any in-flight request
  setProactiveFetchId(proactiveFetchId + 1);
  const myId = proactiveFetchId;
  // Clear previous suggestions so each entry regenerates
  setProactiveSuggestions([]);
  const old = document.getElementById('proactiveCard');
  if (old) old.remove();

  // Ensure weather data is ready (fetchWeather caches, so this is instant if already loaded)
  await fetchWeather().catch(() => {});

  if (myId !== proactiveFetchId) return; // superseded by a newer call

  const zh = currentLang === 'zh';
  const w = weatherCache;
  const now = new Date();
  const h = now.getHours();
  const ua = navigator.userAgent;
  const isMobile = /Mobile|Android|iPhone|iPod/.test(ua);
  const profile = cachedUserProfileObj || {};
  const city = w?.city || '';
  const profileLoc = profile.location || '';
  const traveling = city && profileLoc && !city.includes(profileLoc) && !profileLoc.includes(city);

  const ctx = {
    city,
    weather: w ? `${w.temp}° ${weatherText(w.code, zh)}` : '',
    timeSlot: zh
      ? (h < 6 ? '深夜' : h < 9 ? '清晨' : h < 12 ? '上午' : h < 14 ? '午休' : h < 18 ? '下午' : h < 22 ? '晚间' : '深夜')
      : (h < 6 ? 'late night' : h < 9 ? 'early morning' : h < 12 ? 'morning' : h < 14 ? 'lunch' : h < 18 ? 'afternoon' : h < 22 ? 'evening' : 'late night'),
    device: isMobile ? (zh ? '手机' : 'mobile') : (zh ? '桌面端' : 'desktop'),
    holidays: getUpcomingHolidays(now, zh),
    traveling,
  };

  console.log('[proactive] fetching suggestions, context:', ctx);
  try {
    const token = await getClerkToken();
    if (!token) { console.log('[proactive] no token'); return; }
    if (myId !== proactiveFetchId) return; // superseded
    const resp = await fetch(`${CLOUD_URL}/ai/proactive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ session_token: token, context: ctx }),
    });
    const data = await resp.json();
    console.log('[proactive] response:', resp.status, data);
    if (resp.ok && data.suggestions?.length > 0) {
      setProactiveSuggestions(data.suggestions);
      renderProactiveSuggestions();
    }
  } catch (e) {
    console.log('[proactive] failed:', e.message);
  }
}

export function renderProactiveSuggestions() {
  if (!proactiveSuggestions.length) return;
  const zh = currentLang === 'zh';

  // Remove old card
  const existing = document.getElementById('proactiveCard');
  if (existing) existing.remove();

  // Lightweight hint bar above input dock — no card, no border, just text
  const card = document.createElement('div');
  card.id = 'proactiveCard';
  card.style.cssText = 'max-width:var(--chat-max);margin:0 auto;padding:4px 16px 6px;';
  card.innerHTML = proactiveSuggestions.map(s => `
    <div style="display:flex;align-items:center;gap:6px;padding:2px 0;">
      <span style="font-size:.85em;opacity:.5">💡</span>
      <span style="flex:1;font-size:.78em;color:var(--dim);line-height:1.5">${escapeHtml(s.text)}</span>
      ${s.action ? `<button onclick="proactiveClick('${escapeHtml(s.action).replace(/'/g,"\\'")}')" style="font-size:.72em;padding:2px 8px;background:none;border:1px solid var(--border);border-radius:8px;cursor:pointer;white-space:nowrap;font-family:inherit;color:var(--dim)">${zh?'去做':'Go'}</button>` : ''}
    </div>
  `).join('');

  // Insert right above the input dock
  const inputDock = document.querySelector('.input-dock');
  if (inputDock && inputDock.parentNode) {
    inputDock.parentNode.insertBefore(card, inputDock);
  }

  // Fade out when user starts typing
  const inputEl = document.getElementById('input');
  if (inputEl) {
    const fadeHandler = () => {
      if (inputEl.value.length > 0) {
        card.style.transition = 'opacity .3s ease';
        card.style.opacity = '0';
        setTimeout(() => card.remove(), 300);
        inputEl.removeEventListener('input', fadeHandler);
      }
    };
    inputEl.addEventListener('input', fadeHandler);
  }
}

export function proactiveClick(action) {
  const input = document.getElementById('input');
  if (input) {
    input.value = action;
    send();
  }
}

export function dismissProactive() {
  const card = document.getElementById('proactiveCard');
  if (card) card.remove();
}

export function healthRingSvg(covered, total) {
  const pct = total > 0 ? Math.round(covered / total * 100) : 0;
  const r = 28, c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color = pct >= 50 ? 'var(--green)' : pct >= 30 ? 'var(--accent)' : '#e8a040';
  return `<svg width="70" height="70" viewBox="0 0 70 70"><circle cx="35" cy="35" r="${r}" fill="none" stroke="var(--border)" stroke-width="5"/><circle cx="35" cy="35" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-dasharray="${c}" stroke-dashoffset="${offset}" transform="rotate(-90 35 35)" stroke-linecap="round"/><text x="35" y="40" text-anchor="middle" font-size="14" font-weight="600" fill="var(--text)">${pct}%</text></svg>`;
}

export function renderDesktopSidebar() {
  if (window.innerWidth < 900) return;
  const { contacts, todos, timeline } = chatDataCache;
  const zh = currentLang === 'zh';
  const el = document.getElementById('desktopSidebar');
  if (!el) return;
  const contactMap = {};
  contacts.forEach(c => contactMap[c.id] = c);
  const now = new Date();
  const todayStr = localDateStr(now);

  // ── Section 1: 待办 (todos) ──
  const overdueTodos = todos.filter(t => !t.done && t.due && t.due.substring(0, 10) < todayStr)
    .sort((a, b) => (a.due || '').localeCompare(b.due || '')).slice(0, 5);
  const todayTodos = todos.filter(t => !t.done && t.due && t.due.substring(0, 10) === todayStr);
  const pendingAll = todos.filter(t => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, 5);
  let todoHtml = '';
  const todoCount = overdueTodos.length + todayTodos.length;
  if (todoCount > 0) {
    todayTodos.forEach(t => {
      const name = contactMap[t.contact]?.name || '';
      const tId = escapeHtml(t.id || '');
      todoHtml += `<div class="rs-item" onclick="showTodoDetail('${tId}')"><span class="icon">📌</span><span class="text">${escapeHtml((t.task||'').substring(0,25))}</span><span class="badge">${zh?'今天':'Today'}</span></div>`;
    });
    overdueTodos.forEach(t => {
      const name = contactMap[t.contact]?.name || '';
      const tId = escapeHtml(t.id || '');
      todoHtml += `<div class="rs-item" onclick="showTodoDetail('${tId}')"><span class="icon">⚠️</span><span class="text">${escapeHtml((t.task||'').substring(0,25))}</span><span class="badge urgent">${zh?'超期':'Overdue'}</span></div>`;
    });
  } else if (pendingAll.length) {
    pendingAll.forEach(t => {
      const tId = escapeHtml(t.id || '');
      todoHtml += `<div class="rs-item" onclick="showTodoDetail('${tId}')"><span class="icon">✅</span><span class="text">${escapeHtml((t.task||'').substring(0,25))}</span></div>`;
    });
  } else {
    todoHtml = `<div class="rs-empty">${zh?'暂无待办':'No todos'}</div>`;
  }

  // ── Section 2: 关系看板 (dashboard) ──
  const lastContact = {};
  timeline.forEach(t => { if (t.contact) lastContact[t.contact] = t.date; });
  const staleContacts = contacts
    .filter(c => c.nature === 'leverage' || c.nature === 'dual')
    .filter(c => {
      const snooze = c.snooze_until;
      if (snooze && snooze.substring(0, 10) > todayStr) return false;
      return true;
    })
    .map(c => {
      const last = lastContact[c.id];
      if (!last) return { c, days: 999 };
      const days = Math.floor((new Date(todayStr) - new Date((last || '').substring(0, 10))) / 86400000);
      return { c, days };
    })
    .filter(x => x.days >= 14)
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);
  const upcomingDates = [];
  contacts.forEach(c => {
    (c.important_dates || []).forEach(dt => {
      const dateStr = dt.date || '';
      if (dateStr.length >= 5) {
        const mmdd = dateStr.length === 5 ? dateStr : dateStr.substring(5);
        const thisYear = `${now.getFullYear()}-${mmdd}`;
        const dDate = new Date(thisYear);
        const delta = Math.floor((dDate - now) / 86400000);
        if (delta >= 0 && delta <= 30) {
          upcomingDates.push({ name: c.name, date: mmdd, label: dt.label || '', delta, contactId: c.id });
        }
      }
    });
  });
  upcomingDates.sort((a, b) => a.delta - b.delta);
  let dashHtml = '';
  const dashCount = staleContacts.length + upcomingDates.length;
  if (staleContacts.length) {
    staleContacts.forEach(x => {
      const days = x.days === 999 ? (zh?'从未':'never') : `${x.days}${zh?'天':'d'}`;
      const cid = escapeHtml(x.c.id);
      const cname = escapeHtml(x.c.name).replace(/'/g,"\\'");
      dashHtml += `<div class="rs-item" onclick="quickDraftTo('${cname}')"><span class="icon">🔄</span><span class="text">${escapeHtml(x.c.name)}</span><span class="badge">${days}</span><button onclick="event.stopPropagation();snoozeContact('${cid}','${cname}')" style="font-size:.65em;padding:1px 6px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--dimmer);cursor:pointer;margin-left:4px;white-space:nowrap;flex-shrink:0">${zh?'暂不':'snooze'}</button></div>`;
    });
  }
  if (upcomingDates.length) {
    upcomingDates.slice(0, 3).forEach(dt => {
      const deltaLabel = dt.delta === 0 ? (zh?'今天':'today') : `${dt.delta}${zh?'天后':'d'}`;
      dashHtml += `<div class="rs-item"><span class="icon">🎂</span><span class="text">${escapeHtml(dt.name)} — ${escapeHtml(dt.label||dt.date)}</span><span class="badge">${deltaLabel}</span></div>`;
    });
  }
  if (!dashHtml) dashHtml = `<div class="rs-empty">${zh?'一切就绪':'All good'}</div>`;

  // ── Section 3: 最近互动 (recent interactions) ──
  let recentHtml = '';
  if (timeline.length) {
    const sorted = [...timeline].sort((a, b) => {
      const da = new Date((a.date || '1970-01-01').substring(0, 10));
      const db = new Date((b.date || '1970-01-01').substring(0, 10));
      return db - da;
    });
    sorted.slice(0, 5).forEach(t => {
      const name = contactMap[t.contact]?.name || '';
      const tId = escapeHtml(t.id || '');
      recentHtml += `<div class="rs-item" onclick="showInteractionDetail('${tId}','${escapeHtml(t.contact||'')}')"><span class="icon">·</span><span class="text">${escapeHtml(name)}：${escapeHtml((t.summary||'').substring(0,20))}</span></div>`;
    });
  } else {
    recentHtml = `<div class="rs-empty">${zh?'暂无互动':'No interactions'}</div>`;
  }

  // Restore collapse state from localStorage
  const collapsed = JSON.parse(localStorage.getItem('welian_rs_collapsed') || '{}');

  el.innerHTML = `
    <div class="rs-section ${collapsed.todos ? 'collapsed' : ''}" id="rsTodos">
      <div class="rs-header" onclick="toggleRsSection('rsTodos')">
        <span>✅ ${zh?'待办':'Todos'}</span>
        ${todoCount > 0 ? `<span class="badge">${todoCount}</span>` : ''}
        <span class="arrow">▾</span>
      </div>
      <div class="rs-body">${todoHtml}</div>
    </div>
    <div class="rs-section ${collapsed.dashboard ? 'collapsed' : ''}" id="rsDashboard">
      <div class="rs-header" onclick="toggleRsSection('rsDashboard')">
        <span>📋 ${zh?'关系看板':'Dashboard'}</span>
        ${dashCount > 0 ? `<span class="badge">${dashCount}</span>` : ''}
        <span class="arrow">▾</span>
      </div>
      <div class="rs-body">${dashHtml}</div>
    </div>
    <div class="rs-section ${collapsed.recent ? 'collapsed' : ''}" id="rsRecent">
      <div class="rs-header" onclick="toggleRsSection('rsRecent')">
        <span>💬 ${zh?'最近互动':'Recent'}</span>
        <span class="arrow">▾</span>
      </div>
      <div class="rs-body">${recentHtml}</div>
    </div>
  `;
  el.classList.remove('hidden');
}

export function toggleRsSection(sectionId) {
  const sec = document.getElementById(sectionId);
  if (!sec) return;
  sec.classList.toggle('collapsed');
  const collapsed = JSON.parse(localStorage.getItem('welian_rs_collapsed') || '{}');
  collapsed[sectionId] = sec.classList.contains('collapsed');
  localStorage.setItem('welian_rs_collapsed', JSON.stringify(collapsed));
}

export function showTodoDetail(todoId) {
  const { contacts, todos } = chatDataCache;
  const contactMap = {};
  contacts.forEach(c => contactMap[c.id] = c);
  // Search in all possible caches
  let entry = todos.find(t => t.id === todoId);
  if (!entry && typeof todosCache !== 'undefined') entry = todosCache.find(t => t.id === todoId);
  if (!entry && typeof todosDoneCache !== 'undefined') entry = todosDoneCache.find(t => t.id === todoId);
  if (!entry && mineCache.todos) entry = mineCache.todos.find(t => t.id === todoId);
  if (!entry) return;
  const zh = currentLang === 'zh';
  const contactName = contactMap[entry.contact]?.name || '';
  const task = entry.task || entry.content || '';
  const due = (entry.due || '').substring(0, 10);
  const status = entry.status || (entry.done ? 'done' : 'pending');
  const notes = entry.notes || entry.detail || '';
  const priority = entry.priority || '';
  const created = (entry.created_at || entry.date || '').substring(0, 10);

  // Compute days until due
  let dueLabel = due;
  if (due) {
    const todayStr = localDateStr();
    const delta = Math.floor((new Date(due) - new Date(todayStr)) / 86400000);
    if (delta < 0) dueLabel = `${due}（${zh?'超期'+(-delta)+'天':'overdue '+(-delta)+'d'}）`;
    else if (delta === 0) dueLabel = `${due}（${zh?'今天':'today'}）`;
    else dueLabel = `${due}（${zh?delta+'天后':'in '+delta+'d'}）`;
  }

  let html = `<div style="display:flex;flex-direction:column;gap:12px">`;
  // Header
  html += `<div style="text-align:center;padding-bottom:8px;border-bottom:1px solid var(--border)">`;
  html += `<div style="font-size:1.1em;font-weight:500">${escapeHtml(task)}</div>`;
  if (contactName) html += `<div style="font-size:.8em;color:var(--dim);margin-top:4px">👤 ${escapeHtml(contactName)}</div>`;
  html += `</div>`;
  // Due date
  if (dueLabel) {
    html += `<div><div class="label-sm">${zh?'截止日期':'Due date'}</div><div>${escapeHtml(dueLabel)}</div></div>`;
  }
  // Status
  if (status) {
    const statusLabel = status === 'done' || status === 'completed' ? (zh?'已完成':'Completed') : (zh?'待完成':'Pending');
    html += `<div><div class="label-sm">${zh?'状态':'Status'}</div><div>${escapeHtml(statusLabel)}</div></div>`;
  }
  // Priority
  if (priority) {
    html += `<div><div class="label-sm">${zh?'优先级':'Priority'}</div><div>${escapeHtml(priority)}</div></div>`;
  }
  // Notes
  if (notes) {
    html += `<div><div class="label-sm">${zh?'备注':'Notes'}</div><div style="white-space:pre-wrap">${escapeHtml(notes)}</div></div>`;
  }
  // Created date
  if (created) {
    html += `<div><div class="label-sm">${zh?'创建日期':'Created'}</div><div>${escapeHtml(created)}</div></div>`;
  }
  // Buttons
  html += `<div style="display:flex;gap:8px;margin-top:8px">`;
  if (contactName) {
    html += `<button onclick="openContactDetail('${escapeHtml(entry.contact||'')}')" class="btn-flex-item">${zh?'查看联系人':'View contact'}</button>`;
  }
  html += `<button onclick="closeContactDetail()" class="btn-flex-item">${zh?'关闭':'Close'}</button>`;
  html += `</div>`;
  html += `</div>`;

  document.getElementById('detailName').textContent = zh ? '待办详情' : 'Todo Detail';
  document.getElementById('detailSub').textContent = contactName || '';
  document.getElementById('detailBody').innerHTML = html;
  const existing = document.querySelector('#contactDetail .mine-detail-header .detail-btns');
  if (existing) existing.remove();
  document.getElementById('contactDetailOverlay').classList.add('show');
  document.getElementById('contactDetail').classList.add('show');
}

export function showInteractionDetail(tlId, contactId) {
  // Find the timeline entry from cache or contact detail timeline
  const { contacts, timeline } = chatDataCache;
  const contactMap = {};
  contacts.forEach(c => contactMap[c.id] = c);
  // Search in full timeline cache
  let entry = timeline.find(t => t.id === tlId);
  // Also check window._currentDetailTimeline (from open contact detail)
  if (!entry && window._currentDetailTimeline) {
    entry = window._currentDetailTimeline.find(t => t.id === tlId);
  }
  // Fallback: if no id match, try matching by contact + first entry (for old data without id)
  if (!entry && contactId) {
    entry = timeline.find(t => t.contact === contactId);
    if (!entry && window._currentDetailTimeline) {
      entry = window._currentDetailTimeline.find(t => t.contact === contactId);
    }
  }
  if (!entry) return;
  const zh = currentLang === 'zh';
  const contactName = contactMap[contactId]?.name || contactMap[entry.contact]?.name || '';
  const d = I18N[currentLang];
  const date = (entry.date || '').substring(0, 10);
  const summary = entry.summary || entry.action || '';
  const details = entry.details || entry.notes || entry.detail || '';
  const action = entry.action || '';
  const keywords = (entry.keywords || []).join(', ');
  const keyPoints = (entry.key_points || []).join('\n');

  let html = `<div style="display:flex;flex-direction:column;gap:12px">`;
  // Header
  html += `<div style="text-align:center;padding-bottom:8px;border-bottom:1px solid var(--border)">`;
  html += `<div style="font-size:1.1em;font-weight:500">${escapeHtml(contactName)}</div>`;
  html += `<div style="font-size:.8em;color:var(--dim);margin-top:4px">📅 ${escapeHtml(date)}</div>`;
  html += `</div>`;
  // Summary
  if (summary) {
    html += `<div><div class="label-sm">${zh?'摘要':'Summary'}</div><div>${escapeHtml(summary)}</div></div>`;
  }
  // Details
  if (details) {
    html += `<div><div class="label-sm">${zh?'详情':'Details'}</div><div style="white-space:pre-wrap">${escapeHtml(details)}</div></div>`;
  }
  // Key points
  if (keyPoints) {
    html += `<div><div class="label-sm">${zh?'要点':'Key points'}</div><div style="white-space:pre-wrap">${escapeHtml(keyPoints)}</div></div>`;
  }
  // Keywords
  if (keywords) {
    html += `<div><div class="label-sm">${zh?'关键词':'Keywords'}</div><div>${escapeHtml(keywords)}</div></div>`;
  }
  // Action type
  if (action) {
    html += `<div><div class="label-sm">${zh?'类型':'Type'}</div><div>${escapeHtml(action)}</div></div>`;
  }
  // Buttons
  html += `<div style="display:flex;gap:8px;margin-top:8px">`;
  html += `<button onclick="openContactDetail('${escapeHtml(contactId||entry.contact||'')}')" class="btn-flex-item">${zh?'查看联系人':'View contact'}</button>`;
  html += `<button onclick="closeContactDetail()" class="btn-flex-item">${zh?'关闭':'Close'}</button>`;
  html += `</div>`;
  html += `</div>`;

  document.getElementById('detailName').textContent = contactName || (zh ? '互动详情' : 'Interaction Detail');
  document.getElementById('detailSub').textContent = date;
  document.getElementById('detailBody').innerHTML = html;
  // Remove header buttons from contact detail
  const existing = document.querySelector('#contactDetail .mine-detail-header .detail-btns');
  if (existing) existing.remove();
  document.getElementById('contactDetailOverlay').classList.add('show');
  document.getElementById('contactDetail').classList.add('show');
}

export function toggleEmptyState() {
  const { contacts } = chatDataCache;
  const illus = document.getElementById('emptyStateIllus');
  if (!illus) return;
  // Show empty state only for logged-in users with no contacts and no chat messages
  const hasMessages = document.getElementById('chatBody').children.length > 0;
  if (isAuthed && !contacts.length && !hasMessages) {
    illus.style.display = 'block';
  } else {
    illus.style.display = 'none';
  }
}

export async function fetchWeather() {
  if (weatherCache) return weatherCache;
  // Try cached location
  const cachedLoc = localStorage.getItem('welian_location');
  if (cachedLoc) {
    try {
      const loc = JSON.parse(cachedLoc);
      setWeatherCache(await fetchWeatherFromAPI(loc.lat, loc.lon));
      return weatherCache;
    } catch(e) {}
  }
  // Try geolocation
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toFixed(2);
        const lon = pos.coords.longitude.toFixed(2);
        localStorage.setItem('welian_location', JSON.stringify({ lat, lon }));
        try {
          setWeatherCache(await fetchWeatherFromAPI(lat, lon));
          resolve(weatherCache);
        } catch(e) { resolve(null); }
      },
      () => resolve(null),
      { timeout: 5000, maximumAge: 600000 }
    );
  });
}

export async function fetchWeatherFromAPI(lat, lon) {
  // Open-Meteo: free, no API key needed
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('weather fetch failed');
  const data = await resp.json();
  const temp = Math.round(data.current?.temperature_2m ?? 0);
  const code = data.current?.weather_code ?? 0;
  const wind = Math.round(data.current?.wind_speed_10m ?? 0);
  // Reverse geocode for city name (free, no key)
  let city = '';
  try {
    const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=${currentLang === 'zh' ? 'zh' : 'en'}`;
    const geoResp = await fetch(geoUrl, { headers: { 'User-Agent': 'Welian/1.0' } });
    if (geoResp.ok) {
      const geoData = await geoResp.json();
      city = geoData.address?.city || geoData.address?.town || geoData.address?.county || geoData.address?.state || '';
    }
  } catch(e) {}
  return { temp, code, wind, city };
}

export function weatherEmoji(code) {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌤️';
}

export function weatherText(code, zh) {
  if (code === 0) return zh ? '晴' : 'Clear';
  if (code <= 3) return zh ? '多云' : 'Cloudy';
  if (code <= 48) return zh ? '雾' : 'Fog';
  if (code <= 67) return zh ? '雨' : 'Rain';
  if (code <= 77) return zh ? '雪' : 'Snow';
  if (code <= 82) return zh ? '阵雨' : 'Showers';
  if (code <= 86) return zh ? '阵雪' : 'Snow showers';
  if (code >= 95) return zh ? '雷雨' : 'Thunderstorm';
  return zh ? '多云' : 'Cloudy';
}

export function weatherGreeting(weather, zh) {
  if (!weather) return null;
  const h = new Date().getHours();
  const emoji = weatherEmoji(weather.code);
  const wText = weatherText(weather.code, zh);
  const temp = weather.temp;
  const city = weather.city || '';
  const cityPrefix = city ? `${city} · ` : '';

  // Temperature-based warmth suggestions
  let tempTip = '';
  if (zh) {
    if (temp <= 5) tempTip = '天冷，给远方的朋友发句问候吧';
    else if (temp <= 15) tempTip = '微凉，适合约人喝杯热的';
    else if (temp <= 25) tempTip = '天气宜人，适合约人走走';
    else if (temp <= 32) tempTip = '天热，一句关心胜过冰饮';
    else tempTip = '酷暑，记得关心身边的人';
  } else {
    if (temp <= 5) tempTip = 'Cold day — send a warm message to someone far away';
    else if (temp <= 15) tempTip = 'Chilly — perfect for inviting someone for a hot drink';
    else if (temp <= 25) tempTip = 'Lovely weather — great for a walk with someone';
    else if (temp <= 32) tempTip = 'Hot day — a caring word beats a cold drink';
    else tempTip = 'Scorching — remember to check on those around you';
  }

  // Weather-based suggestions
  let weatherTip = '';
  if (zh) {
    if (weather.code >= 51 && weather.code <= 67) weatherTip = '雨天适合给老朋友写条长消息';
    else if (weather.code >= 95) weatherTip = '雷雨天，宅家正好整理关系';
    else if (weather.code === 0 && h >= 9 && h <= 17) weatherTip = '晴天好心情，适合主动联系';
    else if (weather.code <= 48) weatherTip = '雾天慢一点，想想那些重要的人';
  } else {
    if (weather.code >= 51 && weather.code <= 67) weatherTip = 'Rainy day — perfect for a long message to an old friend';
    else if (weather.code >= 95) weatherTip = 'Stormy — great time to organize your relationships';
    else if (weather.code === 0 && h >= 9 && h <= 17) weatherTip = 'Sunny mood — a good day to reach out';
    else if (weather.code <= 48) weatherTip = 'Foggy — slow down, think about who matters';
  }

  const tip = weatherTip || tempTip;
  return { emoji, wText, temp, cityPrefix, tip };
}

export async function showDailyGreeting() {
  const zh = currentLang === 'zh';
  const h = new Date().getHours();
  let greeting = '';
  if (zh) {
    if (h < 6) greeting = '夜深了，还在惦记关系的人，一定很温暖 🌙';
    else if (h < 9) greeting = '早安，今天也要用心对待每段关系 ☀️';
    else if (h < 12) greeting = '上午好，记得给重要的人留点时间 🌿';
    else if (h < 14) greeting = '午安，趁休息想想最近见了谁 🍃';
    else if (h < 18) greeting = '下午好，有没有该联系的人了？ 🌤️';
    else if (h < 22) greeting = '晚上好，今天有什么值得记录的互动？ 🌙';
    else greeting = '夜安，静下来想想那些重要的人 🌙';
  } else {
    if (h < 6) greeting = 'Late night, still caring about relationships — that\'s warm 🌙';
    else if (h < 9) greeting = 'Good morning, care for every relationship today ☀️';
    else if (h < 12) greeting = 'Good morning, save time for those who matter 🌿';
    else if (h < 14) greeting = 'Good afternoon, who have you seen recently? 🍃';
    else if (h < 18) greeting = 'Good afternoon, anyone you should reach out to? 🌤️';
    else if (h < 22) greeting = 'Good evening, any interactions worth recording? 🌙';
    else greeting = 'Good night, reflect on those who matter 🌙';
  }
  // Try to add weather-based greeting
  const weather = await fetchWeather();
  const wg = weatherGreeting(weather, zh);
  if (wg) {
    greeting = `${wg.emoji} ${wg.cityPrefix}${wg.wText} ${wg.temp}°\n${wg.tip}`;
  }
  const el = document.getElementById('dailyGreeting');
  if (el) { el.textContent = greeting; el.style.display = 'block'; el.style.whiteSpace = 'pre-line'; }
}

export function showWarmthQuote() {
  const zh = currentLang === 'zh';
  const quotes = zh ? WARMTH_QUOTES_ZH : WARMTH_QUOTES_EN;
  // Rotate by day of year
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const quote = quotes[dayOfYear % quotes.length];
  const el = document.getElementById('warmthQuote');
  if (el) { el.textContent = quote; el.style.display = 'block'; }
}

export function showStreakBadge() {
  const { timeline } = chatDataCache;
  if (!timeline.length) return;
  // Count consecutive days with interactions
  const days = new Set();
  timeline.forEach(t => { if (t.date) days.add(t.date.substring(0, 10)); });
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = localDateStr(d);
    if (days.has(ds)) streak++;
    else if (i > 0) break; // allow today to be empty
  }
  if (streak < 2) return;
  const zh = currentLang === 'zh';
  const el = document.getElementById('streakBadge');
  if (el) {
    el.innerHTML = `<span class="flame">🔥</span> ${zh ? `连续 ${streak} 天记录互动` : `${streak}-day streak`}`;
    el.style.display = 'inline-flex';
  }
}

export function toggleVoiceInput() {
  const btn = document.getElementById('voiceBtn');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert(currentLang === 'zh' ? '浏览器不支持语音输入' : 'Voice input not supported'); return; }
  if (isRecording) {
    voiceRecognition?.stop();
    setIsRecording(false);
    btn.classList.remove('recording');
    btn.textContent = '🎤';
    return;
  }
  setVoiceRecognition(new SR());
  voiceRecognition.lang = currentLang === 'zh' ? 'zh-CN' : 'en-US';
  voiceRecognition.continuous = false;
  voiceRecognition.interimResults = true;
  voiceRecognition.onresult = (e) => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    input.value = text;
  };
  voiceRecognition.onend = () => {
    setIsRecording(false);
    btn.classList.remove('recording');
    btn.textContent = '🎤';
  };
  voiceRecognition.onerror = () => {
    setIsRecording(false);
    btn.classList.remove('recording');
    btn.textContent = '🎤';
  };
  voiceRecognition.start();
  setIsRecording(true);
  btn.classList.add('recording');
  btn.textContent = '⏹';
}

export function addMsgActions(msgEl, text) {
  const zh = currentLang === 'zh';
  const actions = [];
  // Detect contact names in reply
  const { contacts } = chatDataCache;
  const mentionedContacts = contacts.filter(c => text.includes(c.name));
  if (mentionedContacts.length) {
    const c = mentionedContacts[0];
    actions.push(`<button class="msg-action-btn" onclick="openContactDetail('${escapeHtml(c.id)}')">${zh?'查看详情':'Detail'}</button>`);
  }
  // Detect todo-like content
  if (/待办|todo|提醒|remind|跟进|follow.?up/i.test(text)) {
    actions.push(`<button class="msg-action-btn" onclick="openMine();setTimeout(()=>switchMineTab('todos'),100)">${zh?'加入待办':'Todos'}</button>`);
  }
  // Detect PDF file paths in reply (e.g. /tmp/report.pdf, ~/output.pdf)
  const pdfPaths = extractPdfPaths(text);
  for (const p of pdfPaths) {
    actions.push(`<button class="msg-action-btn pdf-dl-btn" onclick="downloadPdfViaAgent('${escapeHtml(p)}', this)">${zh?'⬇ 下载PDF':'⬇ PDF'}</button>`);
  }
  // Always: copy
  actions.push(`<button class="msg-action-btn" onclick="copyMsgText(this)">${zh?'复制':'Copy'}</button>`);
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'msg-actions';
  actionsDiv.innerHTML = actions.join('');
  msgEl.appendChild(actionsDiv);
}

export function extractPdfPaths(text) {
  // Strip ANSI escape codes (Devin CLI output may contain them)
  const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  const paths = new Set();
  // Match absolute paths ending in .pdf (allow spaces in path segments)
  const re1 = /(?:\/[^\s'"`<>|]+)+\.pdf/gi;
  let m;
  while ((m = re1.exec(clean)) !== null) {
    paths.add(m[0]);
  }
  // Match ~/path/file.pdf
  const re2 = /~\/[^\s'"`<>|]+\.pdf/gi;
  while ((m = re2.exec(clean)) !== null) {
    paths.add(m[0]);
  }
  // Match backtick-wrapped paths: `/tmp/report.pdf`
  const re3 = /`([^`]+\.pdf)`/gi;
  while ((m = re3.exec(clean)) !== null) {
    paths.add(m[1]);
  }
  // Match markdown link: [text](/path/to.pdf)
  const re4 = /\]\(([^)]+\.pdf)\)/gi;
  while ((m = re4.exec(clean)) !== null) {
    paths.add(m[1]);
  }
  const result = [...paths].slice(0, 3);
  if (result.length) console.log('[PDF] Detected paths:', result);
  return result;
}

export async function downloadPdfViaAgent(filePath, btn) {
  const zh = currentLang === 'zh';
  if (btn) btn.disabled = true;
  if (btn) btn.textContent = zh ? '⏳ 读取中…' : '⏳ Loading…';
  if (!bridgeFrame || !bridgeReady) {
    if (btn) { btn.disabled = false; btn.textContent = zh ? '⬇ 下载PDF' : '⬇ PDF'; }
    alert(zh ? '本地 agent 未连接，无法下载文件' : 'Local agent not connected');
    return;
  }
  try {
    const result = await agentReadFile(filePath);
    if (result && result.content) {
      // Decode base64 and download
      const binary = atob(result.content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (btn) btn.textContent = zh ? '✓ 已下载' : '✓ Done';
    } else if (result && result.error) {
      if (btn) { btn.disabled = false; btn.textContent = zh ? '⬇ 下载PDF' : '⬇ PDF'; }
      alert(zh ? `下载失败：${result.message}` : `Download failed: ${result.message}`);
    } else {
      if (btn) { btn.disabled = false; btn.textContent = zh ? '⬇ 下载PDF' : '⬇ PDF'; }
      alert(zh ? '下载失败：agent 无响应' : 'Download failed: no response');
    }
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = zh ? '⬇ 下载PDF' : '⬇ PDF'; }
    alert(zh ? `下载出错：${e.message}` : `Error: ${e.message}`);
  }
}

export function agentReadFile(filePath) {
  if (!bridgeFrame || !bridgeReady) return Promise.resolve(null);
  return new Promise((resolve) => {
    const reqId = 'readfile_' + Date.now();
    let resolved = false;
    const handler = (e) => {
      const msg = e.data;
      if (!msg || msg.source !== 'welian-bridge') return;
      if (msg.type === 'ws-message' && msg.data && msg.data.id === reqId && !resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        if (msg.data.type === 'response' && msg.data.content) {
          resolve(msg.data);
        } else if (msg.data.type === 'error') {
          resolve({ error: true, message: msg.data.message });
        } else {
          resolve(null);
        }
      }
    };
    window.addEventListener('message', handler);
    setTimeout(() => {
      if (!resolved) { resolved = true; window.removeEventListener('message', handler); resolve(null); }
    }, 15000);
    bridgeFrame.contentWindow.postMessage({
      source: 'welian-parent', type: 'send',
      payload: { cmd: 'read_file', id: reqId, path: filePath }
    }, '*');
  });
}

export function copyMsgText(btn) {
  const bubble = btn.closest('.msg')?.querySelector('.bubble.ai');
  if (bubble) {
    const text = bubble.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = currentLang === 'zh' ? '✓ 已复制' : '✓ Copied';
      setTimeout(() => { btn.textContent = currentLang === 'zh' ? '复制' : 'Copy'; }, 1500);
    });
  }
}
