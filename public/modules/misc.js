// Auto-generated from app.js — do not edit manually

import { CLOUD_URL, I18N, authBtn, body, cachedUserProfile, cachedUserProfileObj, clerkInstance, currentLang, input, isAuthed, mineCache, mineCurrentTab, setCachedUserProfile, setCachedUserProfileObj, setCurrentLang, setMineCurrentTab, simulationData, simulationMode } from './state.js';
import { addMsg, healthRingSvg } from './chat.js';
import { getClerkToken, onSignedOut } from './auth.js';
import { loadBillingTab } from './billing.js';
import { loadContactsTab } from './contacts.js';
import { loadMonthlyTab, loadSignalsTab, loadWeeklyTab } from './proactive.js';
import { loadTimelineTab } from './timeline.js';
import { loadTodosTab } from './todos.js';

export function applyLang(lang) {
  setCurrentLang(lang);
  localStorage.setItem('welian_lang', lang);
  const dict = I18N[lang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.innerHTML = dict[key];
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.getAttribute('data-i18n-ph');
    if (dict[key]) el.placeholder = dict[key];
  });
  document.getElementById('langBtn').textContent = lang === 'en' ? '中文' : 'EN';
  document.getElementById('authBtn').textContent = isAuthed ? authBtn.textContent : dict.sign_in;
}

export function toggleLang() {
  applyLang(currentLang === 'en' ? 'zh' : 'en');
}

export function localDateStr(d) {
  d = d || new Date();
  const offset = d.getTimezoneOffset(); // minutes behind UTC
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

export function escapeHtml(s) {
  if (s === null || s === undefined || s === '') return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function openMine() {
  if (!isAuthed) {
    addMsg('ai', I18N[currentLang].billing_not_authed);
    return;
  }
  sessionStorage.setItem('welian_mine_open', '1');
  document.getElementById('mine-panel').classList.add('show');
  document.getElementById('mineTitle').textContent = I18N[currentLang].mine_title;
  const savedTab = localStorage.getItem('welian_mine_tab') || 'overview';
  switchMineTab(savedTab);
}

export function closeMine() {
  sessionStorage.removeItem('welian_mine_open');
  document.getElementById('mine-panel').classList.remove('show');
}

export function openSupport() {
  const zh = currentLang === 'zh';
  const panel = document.getElementById('support-panel');
  const content = document.getElementById('supportContent');
  document.getElementById('supportTitle').textContent = zh ? '联系支持' : 'Contact Support';
  content.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="mine-card" style="padding:16px">
        <div class="mine-card-title" style="color:var(--accent);margin-bottom:8px">${zh ? '📧 邮件支持' : '📧 Email Support'}</div>
        <div class="mine-contact-sub" style="margin-bottom:10px">${zh ? '遇到问题？发邮件给我们，通常 24 小时内回复。' : 'Having issues? Email us, typically replied within 24 hours.'}</div>
        <a href="mailto:contact@welian.app" style="display:inline-block;padding:8px 16px;background:var(--accent);color:#fff;border-radius:8px;text-decoration:none;font-size:.85em">contact@welian.app</a>
      </div>
      <div class="mine-card" style="padding:16px">
        <div class="mine-card-title" style="color:var(--accent);margin-bottom:8px">${zh ? '📖 常见问题' : '📖 FAQ'}</div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:.85em">
          <details><summary style="cursor:pointer;color:var(--text)">${zh ? '数据存储在哪里？' : 'Where is my data stored?'}</summary><div style="margin-top:6px;color:var(--dim)">${zh ? '数据存储在 Cloudflare 全球边缘网络，加密传输。' : 'Data is stored on Cloudflare\'s global edge network with encrypted transit.'}</div></details>
          <details><summary style="cursor:pointer;color:var(--text)">${zh ? '如何导出我的数据？' : 'How do I export my data?'}</summary><div style="margin-top:6px;color:var(--dim)">${zh ? '在「我的」→「概览」中点击「导出数据」，可导出全部联系人和互动记录。' : 'Go to "Me" → "Overview" and click "Export Data" to download all contacts and interactions.'}</div></details>
          <details><summary style="cursor:pointer;color:var(--text)">${zh ? 'Live 模式和 Cloud 模式有什么区别？' : 'What\'s the difference between Live and Cloud mode?'}</summary><div style="margin-top:6px;color:var(--dim)">${zh ? 'Live 模式支持 Agent 能力，目前支持 Devin，其它还在逐步接入当中。Cloud 模式数据在云端，无需安装。' : 'Live mode supports Agent capabilities, currently Devin with more being integrated. Cloud mode stores data in the cloud, no installation needed.'}</div></details>
          <details><summary style="cursor:pointer;color:var(--text)">${zh ? '如何注销账户？' : 'How do I delete my account?'}</summary><div style="margin-top:6px;color:var(--dim)">${zh ? '在「我的」→「设置」中点击「注销账户」，所有数据将被永久删除。' : 'Go to "Me" → "Settings" and click "Delete account". All data will be permanently deleted.'}</div></details>
          <details><summary style="cursor:pointer;color:var(--text)">${zh ? '待办事项如何同步到手机日历？' : 'How to sync todos to my phone calendar?'}</summary><div style="margin-top:6px;color:var(--dim)">${zh ? '在「我的」→「设置」→「日历同步」中复制订阅链接，粘贴到手机日历应用（iPhone 日历、华为日历、Outlook 等）的「添加订阅日历」中。待办和重要日期会自动同步，定期更新。' : 'Go to "Me" → "Settings" → "Calendar Sync", copy the subscription URL, and paste it into your phone calendar app (Apple Calendar, Huawei Calendar, Outlook, etc.) under "Add Subscription Calendar". Todos and important dates will sync automatically.'}</div></details>
        </div>
      </div>
      <div class="mine-card" style="padding:16px">
        <div class="mine-card-title" style="color:var(--accent);margin-bottom:8px">${zh ? '🔗 相关链接' : '🔗 Links'}</div>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:.85em">
          <a href="https://welian.app" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">welian.app →</a>
        </div>
      </div>
    </div>
  `;
  panel.style.display = 'flex';
  panel.classList.add('show');
}

export function closeSupport() {
  const panel = document.getElementById('support-panel');
  panel.classList.remove('show');
  panel.style.display = 'none';
}

export function switchMineTab(tab) {
  setMineCurrentTab(tab);
  sessionStorage.setItem('welian_mine_tab', tab);
  localStorage.setItem('welian_mine_tab', tab);
  // Update tab buttons
  document.querySelectorAll('.mine-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  // Update title
  const d = I18N[currentLang];
  const titles = { overview: d.mine_overview_title, contacts: d.tab_contacts, todos: d.todo_title, timeline: d.tab_timeline, weekly: d.mine_weekly_title, monthly: d.monthly_title, signals: currentLang==='zh'?'📡 HN 信号':'📡 Signals', billing: d.billing_title, settings: d.tab_settings };
  document.getElementById('mineTitle').textContent = titles[tab] || d.mine_title;
  // Load content
  const content = document.getElementById('mineContent');
  content.innerHTML = `<div class="mine-empty">${d.mine_loading}</div>`;
  if (tab === 'overview') loadOverview();
  else if (tab === 'contacts') loadContactsTab();
  else if (tab === 'todos') loadTodosTab();
  else if (tab === 'timeline') loadTimelineTab();
  else if (tab === 'weekly') loadWeeklyTab();
  else if (tab === 'monthly') loadMonthlyTab();
  else if (tab === 'signals') loadSignalsTab();
  else if (tab === 'billing') loadBillingTab();
  else if (tab === 'settings') loadSettingsTab();
}

export async function mineApi(path, method = 'GET', body = null) {
  const token = simulationMode ? `demo_${simulationData.id}:demo_secret` : await getClerkToken();
  if (!token) throw new Error('No token');
  const opts = { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } };
  if (body) {
    // Inject session_token for AI endpoints that need it
    body.session_token = token;
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(`${CLOUD_URL}${path}`, opts);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function loadOverview() {
  const d = I18N[currentLang];
  const content = document.getElementById('mineContent');
  try {
    const [contactsRes, todosRes, timelineRes] = await Promise.all([
      mineApi('/data/contacts'),
      mineApi('/data/todos'),
      mineApi('/data/timeline'),
    ]);
    const contacts = contactsRes.contacts || [];
    const todos = todosRes.todos || [];
    const allTimeline = timelineRes.timeline || [];

    // Cache contacts for detail view
    mineCache.contacts = contacts;

    // Stats
    const leverage = contacts.filter(c => c.nature === 'leverage').length;
    const nurture = contacts.filter(c => c.nature === 'nurture').length;
    const dual = contacts.filter(c => c.nature === 'dual').length;

    // This month interactions
    const now = new Date();
    const zh = currentLang === 'zh';
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthTimeline = allTimeline.filter(t => (t.date || '').startsWith(monthPrefix));
    const monthContacts = new Set(monthTimeline.map(t => t.contact).filter(Boolean));

    // ── Role classification ──
    // Friend: nurture/dual with non-family relations, or any contact with friend keywords
    // Family: nurture with family relations (父母/配偶/子女/家人/亲戚/兄弟/姐妹)
    // Collaborator: leverage/dual with work relations
    const familyKeywords = ['父', '母', '爸', '妈', '配偶', '妻', '夫', '子', '女', '家', '亲戚', '兄弟', '姐妹', '爷爷', '奶奶', '外公', '外婆'];
    const friendKeywords = ['朋友', '友', '同学', '室友', '邻居', 'friend', 'buddy', 'pal'];
    const isFamily = (c) => {
      const rel = (c.relation || '') + (c.role || '') + (c.sub_relation || '');
      if (familyKeywords.some(k => rel.includes(k))) return true;
      if (c.nature === 'nurture' || c.nature === 'dual') {
        return familyKeywords.some(k => rel.includes(k));
      }
      return false;
    };
    const isFriend = (c) => {
      if (isFamily(c)) return false;
      const rel = (c.relation || '') + (c.role || '') + (c.sub_relation || '');
      // nurture/dual non-family → friend
      if (c.nature === 'nurture' || c.nature === 'dual') return true;
      // Any contact with friend keywords in relation → friend
      if (friendKeywords.some(k => rel.toLowerCase().includes(k.toLowerCase()))) return true;
      return false;
    };
    const isCollaborator = (c) => c.nature === 'leverage' || c.nature === 'dual';

    // Build contact lookup
    const contactMap = {};
    contacts.forEach(c => contactMap[c.id] = c);

    // Classify timeline entries by role
    const friendTimeline = monthTimeline.filter(t => contactMap[t.contact] && isFriend(contactMap[t.contact]));
    const familyTimeline = monthTimeline.filter(t => contactMap[t.contact] && isFamily(contactMap[t.contact]));
    const collabTimeline = monthTimeline.filter(t => contactMap[t.contact] && isCollaborator(contactMap[t.contact]));

    // Presence events this month
    const friendPresence = contacts.filter(isFriend).reduce((sum, c) => sum + (c.presence_events?.length || 0), 0);
    const familyPresence = contacts.filter(isFamily).reduce((sum, c) => sum + (c.presence_events?.length || 0), 0);

    // Todos done (approximate: count todos with status done — but API only returns pending)
    // Use total todos as proxy for collaborator activity
    const collabTodos = todos.filter(t => contactMap[t.contact] && isCollaborator(contactMap[t.contact]));

    // Upcoming important dates (next 30 days)
    const today = new Date();
    const todayStr = today.toISOString().substring(0, 10);
    const upcomingDates = [];
    contacts.forEach(c => {
      (c.important_dates || []).forEach(dt => {
        const dateStr = dt.date || '';
        if (dateStr.length >= 5) {
          // Format MM-DD or MM-DD-YYYY
          const mmdd = dateStr.length === 5 ? dateStr : dateStr.substring(5);
          const thisYear = `${today.getFullYear()}-${mmdd}`;
          const dDate = new Date(thisYear);
          const delta = Math.floor((dDate - today) / 86400000);
          if (delta >= 0 && delta <= 30) {
            upcomingDates.push({ name: c.name, date: mmdd, label: dt.label || '', delta, contactId: c.id });
          }
        }
      });
    });
    upcomingDates.sort((a, b) => a.delta - b.delta);

    let html = `
      <!-- Stats card -->
      <div class="mine-card">
        <div class="mine-card-title">${d.mine_overview_title}</div>
        <div style="display:flex;gap:12px;margin-bottom:12px">
          <div style="flex:1;text-align:center;min-width:0">
            <div style="font-size:1.6em;font-weight:600;color:var(--accent)">${contacts.length}</div>
            <div style="font-size:.72em;color:var(--dim);white-space:nowrap">${d.mine_contacts_total}</div>
          </div>
          <div style="flex:1;text-align:center;min-width:0">
            <div style="font-size:1.6em;font-weight:600;color:var(--text)">${todos.length}</div>
            <div style="font-size:.72em;color:var(--dim);white-space:nowrap">${d.mine_todos_pending}</div>
          </div>
          <div style="flex:1;text-align:center;min-width:0">
            <div style="font-size:1.6em;font-weight:600;color:var(--green)">${monthTimeline.length}</div>
            <div style="font-size:.72em;color:var(--dim);white-space:nowrap">${d.mine_interactions}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="mine-tag leverage">${d.mine_leverage} ${leverage}</span>
          <span class="mine-tag nurture">${d.mine_nurture} ${nurture}</span>
          ${dual > 0 ? `<span class="mine-tag dual">${d.mine_dual} ${dual}</span>` : ''}
        </div>
      </div>
      <!-- F5: Health ring -->
      <div class="mine-card">
        <div class="mine-card-title">${zh ? '关系健康度' : 'Relationship Health'}</div>
        <div class="health-ring">
          ${healthRingSvg(monthContacts.size, contacts.length)}
          <div class="info">
            <b>${monthContacts.size}/${contacts.length}</b><br>
            ${zh ? `本月已联系 ${monthContacts.size} 人，覆盖率 ${contacts.length > 0 ? Math.round(monthContacts.size/contacts.length*100) : 0}%` : `${monthContacts.size} contacted this month, ${contacts.length > 0 ? Math.round(monthContacts.size/contacts.length*100) : 0}% coverage`}
          </div>
        </div>
      </div>
    `;

    // ── Three-role dashboard ──
    const roleCard = (icon, label, interactions, presence, extra) => `
      <div class="mine-card">
        <div class="role-header" style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <span style="font-size:1.1em">${icon}</span>
          <span class="mine-card-title" style="margin:0">${label}</span>
        </div>
        <div style="font-size:.78em;color:var(--dim);margin-bottom:6px">${interactions} ${d.role_interactions}${presence > 0 ? ` · ${presence} ${d.role_presence}` : ''}</div>
        ${extra || ''}
      </div>
    `;

    // Friend role
    let friendExtra = '';
    if (friendTimeline.length > 0) {
      friendTimeline.slice(0, 3).forEach(t => {
        const name = contactMap[t.contact]?.name || '';
        friendExtra += `<div class="mine-detail-item">· ${escapeHtml(name)}：${escapeHtml((t.summary || '').substring(0, 50))}</div>`;
      });
    }
    html += roleCard('🌱', d.role_friend, friendTimeline.length, friendPresence, friendExtra);

    // Family role
    let familyExtra = '';
    if (familyTimeline.length > 0) {
      familyTimeline.slice(0, 3).forEach(t => {
        const name = contactMap[t.contact]?.name || '';
        familyExtra += `<div class="mine-detail-item">· ${escapeHtml(name)}：${escapeHtml((t.summary || '').substring(0, 50))}</div>`;
      });
    }
    html += roleCard('🏡', d.role_family, familyTimeline.length, familyPresence, familyExtra);

    // Collaborator role
    let collabExtra = '';
    if (collabTodos.length > 0) {
      collabExtra += `<div style="font-size:.78em;color:var(--dim);margin-bottom:4px">${collabTodos.length} ${d.role_todos_done}</div>`;
      collabTodos.slice(0, 3).forEach(t => {
        const name = contactMap[t.contact]?.name || '';
        collabExtra += `<div class="mine-detail-item">· ${escapeHtml((t.task || '').substring(0, 50))}${name ? ` [${escapeHtml(name)}]` : ''}</div>`;
      });
    }
    if (collabTimeline.length > 0) {
      collabExtra += `<div style="font-size:.78em;color:var(--dim);margin:6px 0 4px">${collabTimeline.length} ${d.role_interactions}</div>`;
      collabTimeline.slice(0, 2).forEach(t => {
        const name = contactMap[t.contact]?.name || '';
        collabExtra += `<div class="mine-detail-item">· ${escapeHtml(name)}：${escapeHtml((t.summary || '').substring(0, 50))}</div>`;
      });
    }
    html += roleCard('🤝', d.role_collaborator, collabTimeline.length, 0, collabExtra);

    // ── Upcoming important dates ──
    if (upcomingDates.length > 0) {
      html += `<div class="mine-section-title">${d.detail_dates}</div>`;
      html += `<div class="mine-card">`;
      upcomingDates.slice(0, 5).forEach(dt => {
        const deltaLabel = dt.delta === 0 ? d.mine_today : `${dt.delta}${d.mine_days_left}`;
        html += `<div class="mine-detail-date" style="cursor:pointer" onclick="openContactDetail('${escapeHtml(dt.contactId)}')"><span class="icon">📅</span><span>${escapeHtml(dt.name)} — ${escapeHtml(dt.date)} ${escapeHtml(dt.label)} <span style="color:var(--accent)">(${deltaLabel})</span></span></div>`;
      });
      html += `</div>`;
    }

    // ── Recent interactions ──
    if (allTimeline.length > 0) {
      html += `<div class="mine-section-title">${d.mine_interactions}</div>`;
      html += `<div class="mine-card">`;
      allTimeline.slice(0, 5).forEach(t => {
        const dt = (t.date || '').substring(5) || '';
        const contactName = contactMap[t.contact]?.name || t.contact || '';
        const summary = (t.summary || t.action || '').substring(0, 60);
        html += `<div class="mine-contact" style="cursor:pointer" onclick="openContactDetail('${escapeHtml(t.contact || '')}')"><div><div class="mine-contact-name">${escapeHtml(contactName)}</div><div class="mine-contact-sub">${dt} · ${escapeHtml(summary)}</div></div></div>`;
      });
      html += `</div>`;
    }

    if (contacts.length === 0 && todos.length === 0 && allTimeline.length === 0) {
      html = `<div class="mine-empty">${d.mine_empty}</div>`;
    }

    content.innerHTML = html;
  } catch (e) {
    content.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

export async function loadSettingsTab() {
  const d = I18N[currentLang];
  const zh = currentLang === 'zh';
  const content = document.getElementById('mineContent');
  content.innerHTML = `
    <div class="mine-card">
      <div class="mine-card-title">🤖 ${zh ? '模型选择' : 'Model Tier'}</div>
      <div class="mine-contact-sub" style="margin-bottom:12px">${zh ? '选择 AI 模型等级，影响回复质量和消耗' : 'Choose AI model tier, affects quality and cost'}</div>
      <div id="modelTierBar" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div id="costPreview"></div>
        <div style="display:flex;gap:6px">
          <button type="button" class="tier-btn" data-tier="standard" onclick="setModelTier('standard')">${zh ? '标准' : 'Standard'} ×1</button>
          <button type="button" class="tier-btn" data-tier="enhanced" onclick="setModelTier('enhanced')">${zh ? '增强' : 'Enhanced'} ×3</button>
          <button type="button" class="tier-btn" data-tier="premium" onclick="setModelTier('premium')">${zh ? '最强' : 'Premium'} ×10</button>
        </div>
      </div>
    </div>
    <div class="mine-card">
      <div class="mine-card-title" class="flex-between" style="cursor:pointer" onclick="toggleSection('profileSection','profileToggle')">
        <span>👤 ${zh ? '个人画像' : 'My Profile'}</span>
        <span id="profileToggle" style="font-size:.7em;color:var(--dim)">▾</span>
      </div>
      <div id="profileSection" style="display:none">
      <div class="mine-contact-sub" style="margin-bottom:12px">${zh ? '填写后 AI 会据此调整拟消息语气、建议联系人的方向' : 'AI uses this to tailor message drafts and contact suggestions'}</div>
      <div id="profileForm" style="display:flex;flex-direction:column;gap:10px">
        <div class="mine-empty">${zh ? '加载中…' : 'Loading…'}</div>
      </div>
      </div>
    </div>
    <div class="mine-card">
      <div class="mine-card-title" class="flex-between" style="cursor:pointer" onclick="toggleSection('memorySection','memoryToggle')">
        <span>🧠 ${zh ? '我的记忆' : 'My Memories'}</span>
        <span id="memoryToggle" style="font-size:.7em;color:var(--dim)">▾</span>
      </div>
      <div id="memorySection" style="display:none">
      <div class="mine-contact-sub" style="margin-bottom:12px">${zh ? 'AI 自动从对话中提取值得长期记住的信息，下次对话会自动参考' : 'AI auto-extracts memorable info from conversations, recalls it in future chats'}</div>
      <div id="memoryList" style="display:flex;flex-direction:column;gap:8px">
        <div class="mine-empty">${zh ? '加载中…' : 'Loading…'}</div>
      </div>
      <div class="section-divider">
        <div class="label-muted">${zh ? '手动添加记忆' : 'Add memory manually'}</div>
        <input id="memTitle" placeholder="${zh ? '标题（如：老许的偏好）' : 'Title'}" class="input-field-lg">
        <textarea id="memContent" placeholder="${zh ? '内容（如：老许不喜欢周末被打扰）' : 'Content'}" rows="2" class="textarea-field"></textarea>
        <select id="memType" class="input-field-lg">
          <option value="preference">${zh ? '偏好' : 'Preference'}</option>
          <option value="context">${zh ? '背景' : 'Context'}</option>
          <option value="milestone">${zh ? '里程碑' : 'Milestone'}</option>
          <option value="contact_note">${zh ? '联系人备注' : 'Contact Note'}</option>
        </select>
        <button onclick="addMemoryManual()" class="btn-primary">${zh ? '添加' : 'Add'}</button>
      </div>
      </div>
    </div>
    <div class="mine-card">
      <div class="mine-card-title" class="flex-between" style="cursor:pointer" onclick="toggleSection('goalSection','goalToggle')">
        <span>🎯 ${zh ? '关系目标' : 'Relationship Goals'}</span>
        <span id="goalToggle" style="font-size:.7em;color:var(--dim)">▾</span>
      </div>
      <div id="goalSection" style="display:none">
      <div class="mine-contact-sub" style="margin-bottom:12px">${zh ? '设定关系经营目标，AI 自动从对话中匹配证据，全部标准满足后自动标记完成' : 'Set relationship goals. AI auto-links evidence from chats and completes goals when all criteria met.'}</div>
      <div id="goalList" style="display:flex;flex-direction:column;gap:8px">
        <div class="mine-empty">${zh ? '加载中…' : 'Loading…'}</div>
      </div>
      <div class="section-divider">
        <div class="label-muted">${zh ? '新建目标' : 'New goal'}</div>
        <input id="goalTitle" placeholder="${zh ? '目标标题（如：本月重新联系3个大学同学）' : 'Goal title'}" class="input-field-lg">
        <div class="label-muted-sm">${zh ? '验收标准（每行一个）' : 'Acceptance criteria (one per line)'}</div>
        <textarea id="goalCriteria" placeholder="${zh ? '联系老许\\n联系小王\\n联系老张' : 'Contact X\\nContact Y\\nContact Z'}" rows="3" class="textarea-field"></textarea>
        <button onclick="addGoalManual()" class="btn-primary">${zh ? '创建目标' : 'Create goal'}</button>
      </div>
      </div>
    </div>
    <div class="mine-card">
      <div class="mine-card-title" class="flex-between" style="cursor:pointer" onclick="toggleSection('skillSection','skillToggle')">
        <span>🧩 ${zh ? '我的技能' : 'Custom Skills'}</span>
        <span id="skillToggle" style="font-size:.7em;color:var(--dim)">▾</span>
      </div>
      <div id="skillSection" style="display:none">
      <div class="mine-contact-sub" style="margin-bottom:12px">${zh ? '创建自定义技能，AI 在匹配到对应意图时自动加载。多次低评分后自动标记"需复查"。' : 'Create custom skills that AI auto-loads on matching intents. Low-rated skills auto-flag for review.'}</div>
      <div id="skillList" style="display:flex;flex-direction:column;gap:8px">
        <div class="mine-empty">${zh ? '加载中…' : 'Loading…'}</div>
      </div>
      <div class="section-divider">
        <div class="label-muted">${zh ? '新建技能' : 'New skill'}</div>
        <input id="skillName" placeholder="${zh ? '技能名称（如：我的破冰方法论）' : 'Skill name'}" class="input-field-lg">
        <div class="label-muted-sm">${zh ? '触发意图（逗号分隔：greeting,congratulate,ask_for_help）' : 'Triggers (comma-separated)'}'}</div>

export async function loadCalendarFeedUrl() {
  const zh = currentLang === 'zh';
  const container = document.getElementById('calendarFeedUrl');
  if (!container) return;
  try {
    const token = await getClerkToken();
    if (!token) {
      container.innerHTML = `<span style="font-size:.8em;color:var(--dimmer)">${zh ? '请先登录' : 'Sign in first'}</span>`;
      return;
    }
    const resp = await fetch(`${CLOUD_URL}/data/calendar/token`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await resp.json();
    if (!resp.ok || !data.feed_url) throw new Error(data.error || 'Failed');
    const url = data.feed_url;
    container.innerHTML = `
      <input type="text" readonly value="${url}" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:.78em;background:var(--surface);color:var(--text);font-family:monospace;overflow:hidden;text-overflow:ellipsis" id="calendarFeedInput">
      <button onclick="copyCalendarFeedUrl()" style="padding:8px 14px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.82em;white-space:nowrap">${zh ? '复制' : 'Copy'}</button>
    `;
  } catch (e) {
    container.innerHTML = `<span style="font-size:.8em;color:var(--dimmer)">${zh ? '获取失败' : 'Failed'}: ${e.message}</span>`;
  }
}

export function copyCalendarFeedUrl() {
  const input = document.getElementById('calendarFeedInput');
  if (!input) return;
  const zh = currentLang === 'zh';
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    const result = document.getElementById('calendarSyncResult');
    if (result) result.innerHTML = `<span style="color:var(--accent)">✓ ${zh ? '已复制，去华为日历粘贴' : 'Copied! Paste in your calendar app'}</span>`;
  }).catch(() => {
    document.execCommand('copy');
    const result = document.getElementById('calendarSyncResult');
    if (result) result.innerHTML = `<span style="color:var(--accent)">✓ ${zh ? '已复制' : 'Copied'}</span>`;
  });
}

export function toggleSection(sectionId, toggleId) {
  const sec = document.getElementById(sectionId);
  const toggle = document.getElementById(toggleId);
  if (!sec) return;
  const expanded = sec.style.display !== 'none';
  sec.style.display = expanded ? 'none' : 'block';
  if (toggle) toggle.textContent = expanded ? '▸' : '▾';
  if (!expanded) {
    if (sectionId === 'memorySection') loadMemoryList();
    else if (sectionId === 'profileSection') loadProfileForm();
    else if (sectionId === 'goalSection') loadGoalList();
    else if (sectionId === 'skillSection') loadCustomSkillList();
  }
}

export async function loadMemoryList() {
  const zh = currentLang === 'zh';
  const el = document.getElementById('memoryList');
  if (!el) return;
  try {
    const resp = await mineApi('/data/memory?limit=20');
    const memories = resp.memories || [];
    if (memories.length === 0) {
      el.innerHTML = `<div class="mine-empty">${zh ? '还没有记忆。对话中说"我一般不在周末联系客户"之类的话，AI 会自动记住。' : 'No memories yet. AI auto-learns from conversations.'}</div>`;
      return;
    }
    el.innerHTML = memories.map(m => `
      <div class="card-item">
        <div class="flex-between-start">
          <div style="flex:1">
            <div style="font-weight:500;font-size:.9em">${escapeHtml(m.title)}</div>
            <div style="font-size:.8em;color:var(--muted);margin-top:4px">${escapeHtml(m.content)}</div>
            <div style="font-size:.7em;color:var(--muted);margin-top:4px">
              <span style="background:var(--border);padding:1px 6px;border-radius:4px">${m.type}</span>
              ${m.tags && m.tags.length > 0 ? ' · ' + m.tags.map(escapeHtml).join(', ') : ''}
              · ${m.timestamp ? m.timestamp.slice(0, 10) : ''}
            </div>
          </div>
          <button onclick="deleteMemoryManual('${m.id}')" class="btn-icon-danger">×</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    el.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

export async function addMemoryManual() {
  const zh = currentLang === 'zh';
  const title = document.getElementById('memTitle').value.trim();
  const content = document.getElementById('memContent').value.trim();
  const type = document.getElementById('memType').value;
  if (!title || !content) {
    alert(zh ? '请填写标题和内容' : 'Title and content required');
    return;
  }
  try {
    await mineApi('/data/memory', 'POST', { action: 'save', type, title, content });
    document.getElementById('memTitle').value = '';
    document.getElementById('memContent').value = '';
    loadMemoryList();
  } catch (e) {
    alert(e.message);
  }
}

export async function deleteMemoryManual(id) {
  try {
    await mineApi('/data/memory', 'POST', { action: 'delete', id });
    loadMemoryList();
  } catch (e) {
    alert(e.message);
  }
}

export async function loadGoalList() {
  const zh = currentLang === 'zh';
  const el = document.getElementById('goalList');
  if (!el) return;
  try {
    const resp = await mineApi('/data/goals');
    const goals = resp.goals || [];
    if (goals.length === 0) {
      el.innerHTML = `<div class="mine-empty">${zh ? '还没有目标。创建一个开始追踪进度吧！' : 'No goals yet. Create one to start tracking!'}</div>`;
      return;
    }
    el.innerHTML = goals.map(g => {
      const statusColors = { active: 'var(--accent)', completed: '#22c55e', abandoned: 'var(--muted)' };
      const statusLabels = { active: zh ? '进行中' : 'Active', completed: zh ? '已完成' : 'Done', abandoned: zh ? '已放弃' : 'Abandoned' };
      const sc = statusColors[g.status] || 'var(--muted)';
      const sl = statusLabels[g.status] || g.status;
      const criteriaHtml = (g.criteria || []).map(c => {
        const dot = c.status === 'satisfied' ? '✅' : '⬜';
        const evCount = (c.evidence || []).length;
        return `<div style="font-size:.8em;margin-top:4px;padding-left:8px">${dot} ${escapeHtml(c.text)}${evCount > 0 ? ` <span style="color:var(--muted)">(${evCount})</span>` : ''}</div>`;
      }).join('');
      return `
        <div class="card-item">
          <div class="flex-between-start">
            <div style="flex:1">
              <div style="font-weight:500;font-size:.9em">${escapeHtml(g.title)}</div>
              <div style="font-size:.7em;margin-top:2px"><span style="background:${sc};color:#fff;padding:1px 6px;border-radius:4px">${sl}</span> · ${g.created_at ? g.created_at.slice(0,10) : ''}</div>
              ${criteriaHtml}
            </div>
            <div style="display:flex;gap:4px">
              ${g.status === 'active' ? `<button onclick="completeGoal('${g.id}')" title="${zh?'标记完成':'Complete'}" style="background:none;border:none;cursor:pointer;font-size:1.1em;padding:0 4px">✓</button>` : ''}
              <button onclick="deleteGoal('${g.id}')" title="${zh?'删除':'Delete'}" class="btn-icon-danger">×</button>
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

export async function loadCustomSkillList() {
  const zh = currentLang === 'zh';
  const el = document.getElementById('skillList');
  if (!el) return;
  try {
    const resp = await mineApi('/data/skills');
    const skills = resp.skills || [];
    if (skills.length === 0) {
      el.innerHTML = `<div class="mine-empty">${zh ? '还没有自定义技能。' : 'No custom skills yet.'}</div>`;
      return;
    }
    el.innerHTML = skills.map(s => {
      const statusLabel = s.status === 'monitoring' ? `<span style="color:#e74c3c;font-size:.7em">⚠️ ${zh?'需复查':'Review'}</span>` : '';
      const scoreStr = s.avg_score != null ? `★ ${s.avg_score.toFixed(1)}` : '';
      const useStr = s.usage_count > 0 ? `${s.usage_count} ${zh?'次':'uses'}` : '';
      return `
        <div class="card-item">
          <div class="flex-between-start">
            <div style="flex:1">
              <div style="font-weight:500;font-size:.9em">${escapeHtml(s.name)} ${statusLabel}</div>
              <div style="font-size:.75em;color:var(--muted);margin-top:2px">${(s.triggers||[]).join(', ')}</div>
              <div style="font-size:.75em;color:var(--muted);margin-top:2px">${useStr} ${scoreStr}</div>
              <div style="font-size:.8em;margin-top:4px;color:var(--dim);max-height:60px;overflow:hidden">${escapeHtml((s.content||'').slice(0,120))}${(s.content||'').length>120?'…':''}</div>
            </div>
            <button onclick="deleteCustomSkill('${s.id}')" title="${zh?'删除':'Delete'}" class="btn-icon-danger">×</button>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

export async function addCustomSkill() {
  const zh = currentLang === 'zh';
  const name = document.getElementById('skillName').value.trim();
  const triggers = document.getElementById('skillTriggers').value.split(',').map(t => t.trim()).filter(Boolean);
  const content = document.getElementById('skillContent').value.trim();
  if (!name || !content) { alert(zh ? '请填写名称和内容' : 'Name and content required'); return; }
  try {
    await mineApi('/data/skills', { action: 'create', name, triggers, content });
    document.getElementById('skillName').value = '';
    document.getElementById('skillTriggers').value = '';
    document.getElementById('skillContent').value = '';
    loadCustomSkillList();
  } catch (e) { alert(e.message); }
}

export async function deleteCustomSkill(skillId) {
  try {
    await mineApi('/data/skills', { action: 'delete', skill_id: skillId });
    loadCustomSkillList();
  } catch (e) { alert(e.message); }
}

export async function addGoalManual() {
  const title = document.getElementById('goalTitle').value.trim();
  const criteriaText = document.getElementById('goalCriteria').value.trim();
  if (!title) { alert(currentLang === 'zh' ? '请输入目标标题' : 'Title required'); return; }
  const criteria = criteriaText.split('\n').map(s => s.trim()).filter(s => s);
  if (criteria.length === 0) { alert(currentLang === 'zh' ? '至少输入一个验收标准' : 'At least one criterion required'); return; }
  try {
    await mineApi('/data/goals', 'POST', { action: 'create', title, criteria });
    document.getElementById('goalTitle').value = '';
    document.getElementById('goalCriteria').value = '';
    loadGoalList();
  } catch (e) {
    alert(e.message);
  }
}

export async function completeGoal(id) {
  try {
    await mineApi('/data/goals', 'POST', { action: 'update_status', goal_id: id, status: 'completed' });
    loadGoalList();
  } catch (e) {
    alert(e.message);
  }
}

export async function deleteGoal(id) {
  try {
    await mineApi('/data/goals', 'POST', { action: 'delete', id });
    loadGoalList();
  } catch (e) {
    alert(e.message);
  }
}

export async function loadProfileForm() {
  const zh = currentLang === 'zh';
  const el = document.getElementById('profileForm');
  if (!el) return;
  let p = null;
  try {
    const resp = await mineApi('/data/profile');
    p = resp.profile || {};
  } catch (e) {
    el.innerHTML = `<div class="mine-empty">${e.message}</div>`;
    return;
  }
  const fields = [
    { key: 'name', label: zh ? '姓名' : 'Name', ph: '' },
    { key: 'occupation', label: zh ? '职业' : 'Occupation', ph: zh ? '如：产品经理' : 'e.g. Product Manager' },
    { key: 'company', label: zh ? '公司' : 'Company', ph: '' },
    { key: 'industry', label: zh ? '行业' : 'Industry', ph: zh ? '如：金融/科技' : 'e.g. Finance/Tech' },
    { key: 'location', label: zh ? '所在地' : 'Location', ph: zh ? '如：上海' : 'e.g. Shanghai' },
    { key: 'communication_style', label: zh ? '沟通风格' : 'Communication Style', ph: zh ? '如：正式/轻松/混合' : 'e.g. Formal/Casual' },
    { key: 'address_habit', label: zh ? '称呼习惯' : 'Address Habit', ph: zh ? '如：老X、X总、X哥' : 'e.g. Old X, Mr. X' },
    { key: 'focus_areas', label: zh ? '关注领域' : 'Focus Areas', ph: zh ? '如：量化投资、AI' : 'e.g. Quant, AI' },
    { key: 'message_tone', label: zh ? '拟消息语气' : 'Message Tone', ph: zh ? '如：简洁直接、不卑不亢' : 'e.g. Concise, confident' },
    { key: 'career_goal', label: zh ? '当前职业目标' : 'Career Goal', ph: '' },
    { key: 'current_projects', label: zh ? '正在推进的事' : 'Current Projects', ph: '' },
    { key: 'network_direction', label: zh ? '人脉方向' : 'Network Direction', ph: zh ? '如：拓展量化圈、对接银行科技' : 'e.g. Quant circle, bank tech' },
  ];
  let html = '';
  // Group: basics
  html += `<div style="font-size:.8em;color:var(--dim);margin-top:4px">${zh ? '基础信息' : 'Basics'}</div>`;
  fields.slice(0, 5).forEach(f => {
    html += profileFieldInput(f, p);
  });
  html += `<div style="font-size:.8em;color:var(--dim);margin-top:8px">${zh ? '关系偏好' : 'Preferences'}</div>`;
  fields.slice(5, 9).forEach(f => {
    html += profileFieldInput(f, p);
  });
  html += `<div style="font-size:.8em;color:var(--dim);margin-top:8px">${zh ? '目标方向' : 'Goals'}</div>`;
  fields.slice(9).forEach(f => {
    html += profileFieldInput(f, p);
  });
  // Notes — large textarea
  html += `<div style="font-size:.8em;color:var(--dim);margin-top:8px">${zh ? '附注' : 'Notes'}</div>`;
  html += `<textarea id="profile_notes" placeholder="${zh ? '可以贴一大段文字，比如个人简介、背景资料、备忘等' : 'Paste longer text here — bio, background, notes, etc.'}" style="width:100%;min-height:120px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.85em;resize:vertical;margin-top:2px">${escapeHtml(p.notes || '')}</textarea>`;
  html += `<button onclick="saveProfile()" id="profileSaveBtn" style="margin-top:8px;padding:10px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.85em">${zh ? '保存画像' : 'Save Profile'}</button>`;
  html += `<div id="profileSaveResult" style="text-align:center;font-size:.8em;margin-top:6px"></div>`;
  el.innerHTML = html;
}

export function profileFieldInput(f, p) {
  return `<div>
    <label style="font-size:.78em;color:var(--dim)">${f.label}</label>
    <input id="profile_${f.key}" type="text" value="${escapeHtml(p[f.key] || '')}" placeholder="${escapeHtml(f.ph)}" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.85em;margin-top:2px">
  </div>`;
}

export async function saveProfile() {
  const zh = currentLang === 'zh';
  const btn = document.getElementById('profileSaveBtn');
  const result = document.getElementById('profileSaveResult');
  if (btn) btn.disabled = true;
  if (result) result.innerHTML = zh ? '保存中…' : 'Saving…';
  const keys = ['name','occupation','company','industry','location','communication_style','address_habit','focus_areas','message_tone','career_goal','current_projects','network_direction'];
  const body = {};
  keys.forEach(k => {
    const el = document.getElementById('profile_' + k);
    if (el) body[k] = el.value.trim();
  });
  // Notes from textarea
  const notesEl = document.getElementById('profile_notes');
  if (notesEl) body.notes = notesEl.value.trim();
  try {
    await mineApi('/data/profile', 'POST', body);
    // Invalidate cache so next chat picks up new profile
setCachedUserProfile('');
    setCachedUserProfileObj(null);
    if (result) result.innerHTML = `<span style="color:var(--accent)">✓ ${zh ? '已保存' : 'Saved'}</span>`;
  } catch (e) {
    if (result) result.innerHTML = `<span style="color:#e74c3c">✗ ${e.message}</span>`;
  }
  if (btn) btn.disabled = false;
}

export async function syncContactsToCloud() {
  const zh = currentLang === 'zh';
  const btn = document.getElementById('syncContactsBtn');
  const resultEl = document.getElementById('syncContactsResult');
  if (btn) btn.disabled = true;
  if (resultEl) resultEl.innerHTML = zh ? '正在合并去重云端联系人…' : 'Deduplicating cloud contacts…';
  try {
    const token = await getClerkToken();
    const resp = await fetch(`${CLOUD_URL}/data/contacts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ session_token: token }),
    });
    const data = await resp.json();
    if (resp.ok && data.ok) {
      const msg = zh
        ? `✓ 完成：${data.total} 条联系人，移除 ${data.removed} 条重复`
        : `✓ Done: ${data.total} contacts, removed ${data.removed} duplicates`;
      if (resultEl) resultEl.innerHTML = `<span style="color:var(--accent)">${msg}</span>`;
    } else {
      if (resultEl) resultEl.innerHTML = `<span style="color:#e74c3c">✗ ${data.error || 'failed'}</span>`;
    }
  } catch (e) {
    if (resultEl) resultEl.innerHTML = `<span style="color:#e74c3c">✗ ${e.message}</span>`;
  }
  if (btn) btn.disabled = false;
}

export async function exportMyData() {
  const d = I18N[currentLang];
  try {
    const [contacts, todos, timeline] = await Promise.all([
      mineApi('/data/contacts'),
      mineApi('/data/todos'),
      mineApi('/data/timeline'),
    ]);
    const exportData = {
      exported_at: new Date().toISOString(),
      app: 'Welian',
      version: '1.0',
      contacts: contacts.contacts || [],
      todos: todos.todos || [],
      timeline: timeline.timeline || [],
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `welian-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    alert(d.export_done);
  } catch (e) {
    alert(d.billing_error + e.message);
  }
}

export async function deleteMyAccount() {
  const d = I18N[currentLang];
  const zh = currentLang === 'zh';
  // Step 1: confirm data exported
  if (!confirm(zh
    ? '⚠️ 注销前确认\n\n你的联系人、互动记录、待办等数据已导出备份了吗？\n\n注销后所有数据将被永久删除，无法恢复。'
    : '⚠️ Before deleting\n\nHave you exported your data (contacts, timeline, todos)?\n\nAll data will be permanently deleted and cannot be recovered.'
  )) return;
  // Step 2: final confirm
  if (!confirm(d.confirm_delete_account)) return;
  // Step 3: type to confirm
  const keyword = zh ? '删除' : 'DELETE';
  const input = prompt(zh
    ? `⚠️ 最后确认\n\n这是不可逆操作，所有数据将被永久删除。\n\n请输入 "${keyword}" 确认：`
    : `⚠️ Final warning\n\nThis is irreversible. All data will be permanently deleted.\n\nType "${keyword}" to confirm:`
  );
  if (input !== keyword) {
    if (input !== null) alert(zh ? '输入不匹配，已取消注销' : 'Input mismatch, cancellation aborted');
    return;
  }
  const token = await getClerkToken();
  if (!token) return;
  try {
    // Delete all cloud data + Clerk account (backend handles Clerk deletion via Secret Key)
    const resp = await fetch(`${CLOUD_URL}/data/delete_account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ session_token: token, confirm: true }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const result = await resp.json().catch(() => ({}));
    // Sign out locally (Clerk account already deleted on backend)
    if (clerkInstance) {
      try { clerkInstance.signOut(); } catch(e) {}
    }
    onSignedOut();
    if (result.clerk_deleted === false) {
      alert(zh ? '⚠️ 数据已删除，但 Clerk 账号删除失败，请手动退出登录。' : '⚠️ Data deleted, but Clerk account deletion failed. Please sign out manually.');
    } else {
      alert(d.delete_done);
    }
    location.reload();
  } catch (e) {
    alert(d.billing_error + e.message);
  }
}

export function confirmPop(ev, message) {
  return new Promise(resolve => {
    const zh = currentLang === 'zh';
    const x = ev?.clientX ?? window.innerWidth / 2;
    const y = ev?.clientY ?? window.innerHeight / 2;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:transparent';
    const box = document.createElement('div');
    box.style.cssText = `position:fixed;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,.12);z-index:10000;max-width:280px;font-size:.85em`;
    const left = Math.min(x + 8, window.innerWidth - 290);
    const top = Math.min(y + 8, window.innerHeight - 120);
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.innerHTML = `<div style="margin-bottom:12px;color:var(--text);line-height:1.5">${message}</div><div style="display:flex;gap:8px;justify-content:flex-end"><button id="cpCancel" style="padding:6px 16px;border:1px solid var(--border);background:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.9em;color:var(--dim)">${zh?'取消':'Cancel'}</button><button id="cpOk" style="padding:6px 16px;background:#e74c3c;color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.9em">${zh?'删除':'Delete'}</button></div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    const close = (result) => { document.body.removeChild(overlay); resolve(result); };
    box.querySelector('#cpOk').onclick = () => close(true);
    box.querySelector('#cpCancel').onclick = () => close(false);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
  });
}

export function initCookieBanner() {
  if (localStorage.getItem('welian_cookie_ok')) return;
  const banner = document.getElementById('cookie-banner');
  if (!banner) return;
  // i18n
  const zh = currentLang === 'zh';
  const text = document.getElementById('cookieText');
  if (!zh) text.innerHTML = 'This site uses cookies to provide service experience. By continuing, you agree. See <a href="/privacy.html" style="color:var(--accent)">Privacy Policy</a>.';
  banner.style.display = 'flex';
  // Buttons
  const btns = banner.querySelectorAll('button');
  btns[0].textContent = zh ? '接受' : 'Accept';
  btns[1].textContent = zh ? '仅必要' : 'Essential only';
}

export function acceptCookies() {
  localStorage.setItem('welian_cookie_ok', '1');
  const banner = document.getElementById('cookie-banner');
  if (banner) banner.style.display = 'none';
}
