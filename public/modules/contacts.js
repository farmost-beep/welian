// Auto-generated from app.js — do not edit manually

import { AGENT_TUNNEL_URL, CLOUD_URL, I18N, body, bridgeReady, chatDataCache, contactsCollapsedGroups, contactsGroupBy, currentContactsFilter, currentLang, input, mineCache, mineCurrentTab, setBridgeReady, setContactsCollapsedGroups, setContactsGroupBy, setCurrentContactsFilter, simulationData, simulationMode } from './state.js';
import { addMsg, showInteractionDetail } from './chat.js';
import { confirmPop, escapeHtml, localDateStr, mineApi } from './misc.js';
import { getClerkToken } from './auth.js';

export async function loadContactsTab(keyword) {
  const d = I18N[currentLang];
  const content = document.getElementById('mineContent');
  try {
    const [res, tlRes] = await Promise.all([
      mineApi('/data/contacts'),
      mineApi('/data/timeline').catch(() => ({ timeline: [] })),
    ]);
    let contacts = res.contacts || [];
    mineCache.contacts = contacts;
    mineCache.timeline = tlRes.timeline || [];

    // Search input (never rebuilt during search) + results container
    let html = `<input class="mine-search" placeholder="${d.mine_search_ph}" id="mineSearchInput" autocomplete="off">`;
    html += `<div id="contactsResults"></div>`;
    content.innerHTML = html;

    // Wire up search with IME composition guard
    const searchInput = document.getElementById('mineSearchInput');
    let isComposing = false;
    searchInput.addEventListener('compositionstart', () => { isComposing = true; });
    searchInput.addEventListener('compositionend', () => {
      isComposing = false;
      onContactsSearch(searchInput.value);
    });
    searchInput.addEventListener('input', () => {
      if (!isComposing) onContactsSearch(searchInput.value);
    });

    // Render initial content into results container
    if (keyword) {
      onContactsSearch(keyword);
    } else {
      renderContactsResults('', d);
    }
  } catch (e) {
    content.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

export function renderContactsResults(keyword, d) {
  const resultsEl = document.getElementById('contactsResults');
  if (!resultsEl) return;
  const contacts = mineCache.contacts || [];
  const kw = (keyword || '').trim().toLowerCase();

  if (kw) {
    const filtered = contacts.filter(c =>
      (c.name || '').toLowerCase().includes(kw) ||
      (c.relation || '').toLowerCase().includes(kw) ||
      (c.role || '').toLowerCase().includes(kw) ||
      (c.company || '').toLowerCase().includes(kw) ||
      (c.aliases || []).some(a => (a || '').toLowerCase().includes(kw))
    );
    let html = `<div class="mine-section-title">${filtered.length} ${d.mine_contacts_total}</div>`;
    if (filtered.length === 0) {
      html += `<div class="mine-empty">${d.mine_empty}</div>`;
    } else {
      html += `<div class="mine-card">`;
      filtered.forEach(c => html += renderContactItem(c, d));
      html += `</div>`;
    }
    resultsEl.innerHTML = html;
  } else {
    // No keyword → show subtabs + group list
    let html = `<div class="mine-subtab" id="contactsSubtab">
      <button class="mine-subtab-item active" onclick="switchContactsSubtab('all')">${d.mine_all}</button>
      <button class="mine-subtab-item" onclick="switchContactsSubtab('leverage')">🌳 ${d.mine_leverage}</button>
      <button class="mine-subtab-item" onclick="switchContactsSubtab('nurture')">🌸 ${d.mine_nurture}</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button onclick="document.getElementById('importFileInput').click()" style="flex:1;padding:10px;background:var(--surface);border:1px dashed var(--accent);border-radius:10px;cursor:pointer;font-family:inherit;font-size:.85em;color:var(--accent)">📥 ${currentLang==='zh'?'导入联系人（名片/文件）':'Import contacts (card/file)'}</button>
    </div>
    <input type="file" id="importFileInput" style="display:none" accept=".vcf,.vcard,.csv,.txt,.xlsx,.xls,.docx,.doc,.pdf,.png,.jpg,.jpeg,.gif,.bmp,.webp" onchange="handleImportFile(this.files[0])">
    <div id="importStatus" style="display:${window._lastImportResult?'block':'none'};padding:12px 16px;font-size:.85em">${window._lastImportResult||''}</div>`;
    html += `<div class="mine-group-bar">
      <span style="font-size:.75em;color:var(--dimmer)">${d.group_by}:</span>
      <select class="mine-group-select" onchange="changeGroupBy(this.value)">
        <option value="relation" ${contactsGroupBy==='relation'?'selected':''}>${d.group_relation}</option>
        <option value="company" ${contactsGroupBy==='company'?'selected':''}>${d.group_company}</option>
        <option value="tag" ${contactsGroupBy==='tag'?'selected':''}>${d.group_tag}</option>
        <option value="strength" ${contactsGroupBy==='strength'?'selected':''}>${d.group_strength}</option>
        <option value="cooldown" ${contactsGroupBy==='cooldown'?'selected':''}>${d.group_cooldown}</option>
      </select>
    </div>`;
    html += `<div id="contactsList"></div>`;
    resultsEl.innerHTML = html;
    renderContactsList('all', d);
  }
}

export async function handleImportFile(file) {
  if (!file) return;
  const statusEl = document.getElementById('importStatus');
  if (!statusEl) return;
  statusEl.style.display = 'block';
  statusEl.innerHTML = `📄 ${currentLang==='zh'?'正在上传':'Uploading'} <b>${escapeHtml(file.name)}</b>…`;

  const token = await getClerkToken();
  if (!token) { statusEl.innerHTML = '❌ 请先登录'; return; }

  try {
    const lowerName = file.name.toLowerCase();
    console.log('[import] handleImportFile called, bridgeReady:', bridgeReady, 'tunnel:', AGENT_TUNNEL_URL);

    // Read file as base64 (all file types)
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    console.log('[import] base64 ready, size:', base64.length);

    // Route 1: Local agent connected → send to agent (Devin CLI / GLM)
    if (bridgeReady && AGENT_TUNNEL_URL) {
      console.log('[import] Route 1: sending to agent');
      statusEl.innerHTML = `🤖 ${currentLang==='zh'?'AI (GLM) 正在解析文件…':'AI (GLM) parsing file…'}`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min for large files
        const resp = await fetch(`${AGENT_TUNNEL_URL}/ai/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, filename: file.name }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        console.log('[import] agent response:', resp.status);
        const data = await resp.json();
        console.log('[import] agent data:', JSON.stringify(data).slice(0, 200));
        if (resp.ok && data.imported !== undefined) {
          const skipped = data.skipped || 0;
          const names = data.extracted_names || [];
          const resultHtml = `✅ ${currentLang==='zh'?'导入完成':'Import done'}: <b>${data.imported}</b> ${currentLang==='zh'?'位联系人':'contacts'}${skipped > 0 ? ` (${skipped} ${currentLang==='zh'?'已存在':'duplicates'})` : ''}${names.length ? ` — ${currentLang==='zh'?'前几名':'first names'}: ${names.join(', ')}` : ''}`;
          statusEl.innerHTML = resultHtml;
          window._lastImportResult = resultHtml;
          loadContactsTab();
          return;
        } else {
          statusEl.innerHTML = `❌ ${data.error || 'Import failed'}`;
          window._lastImportResult = null;
          return;
        }
      } catch(e) {
        console.log('[import] Agent failed:', e.message, '→ falling back to cloud');
        statusEl.innerHTML = `📄 ${currentLang==='zh'?'Agent 不可用，切换到云端…':'Agent unavailable, using cloud…'}`;
      }
    } else {
      console.log('[import] Route 1 skipped: setBridgeReady(', bridgeReady, 'tunnel=', AGENT_TUNNEL_URL);
    }

    // Route 2: Fallback to cloud Worker (MiniMax-M3)
    statusEl.innerHTML = `🤖 ${currentLang==='zh'?'AI 正在识别并提取联系人…':'AI extracting contacts…'}`;
    const resp = await fetch(`${CLOUD_URL}/ai/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ session_token: token, base64, filename: file.name, mime_type: file.type }),
    });
    const data = await resp.json();
    if (resp.ok && data.imported !== undefined) {
        const skipped = data.skipped || 0;
        const msg = data.message || '';
        const resultHtml = `✅ ${currentLang==='zh'?'导入完成':'Import done'}: <b>${data.imported}</b> ${currentLang==='zh'?'位联系人':'contacts'}${skipped > 0 ? ` (${skipped} ${currentLang==='zh'?'已存在':'duplicates'})` : ''}${msg ? ` — ${msg}` : ''}`;
        statusEl.innerHTML = resultHtml;
        window._lastImportResult = resultHtml;
        loadContactsTab();
      } else {
        statusEl.innerHTML = `❌ ${data.error || 'Import failed'}`;
        window._lastImportResult = null;
      }
  } catch (e) {
    statusEl.innerHTML = `❌ ${e.message}`;
  }
}

export function changeGroupBy(mode) {
  setContactsGroupBy(mode);
  setContactsCollapsedGroups(new Set());
  renderContactsList(currentContactsFilter || 'all', I18N[currentLang]);
}

export function toggleGroup(groupKey) {
  if (contactsCollapsedGroups.has(groupKey)) {
    contactsCollapsedGroups.delete(groupKey);
  } else {
    contactsCollapsedGroups.add(groupKey);
  }
  const header = document.querySelector(`[data-group-key="${CSS.escape(groupKey)}"]`);
  const body = document.querySelector(`[data-group-body="${CSS.escape(groupKey)}"]`);
  if (header) header.classList.toggle('collapsed');
  if (body) body.classList.toggle('collapsed');
}

export function renderContactItem(c, d) {
  const nature = c.nature === 'nurture' ? 'nurture' : (c.nature === 'dual' ? 'dual' : 'leverage');
  const natureLabel = nature === 'leverage' ? d.mine_leverage : (nature === 'nurture' ? d.mine_nurture : d.mine_dual);
  const sub = [c.relation || c.role || '', c.company || ''].filter(Boolean).join(' · ');
  // Cooldown warning for leverage/dual contacts
  let cooldownHtml = '';
  if (nature !== 'nurture' && mineCache.timeline) {
    const cd = getCooldownInfo(c, mineCache.timeline);
    if (cd && cd.urgent) {
      const daysLabel = cd.days >= 999 ? '从未' : `${cd.days}${d.cooldown_warning}`;
      cooldownHtml = `<div style="font-size:.7em;color:var(--accent);margin-top:2px">⚠️ ${daysLabel} · ${d.cooldown_urgent}</div>`;
    }
  }
  return `<div class="mine-contact" style="cursor:pointer" onclick="openContactDetail('${escapeHtml(c.id)}')"><div><div class="mine-contact-name">${escapeHtml(c.name || '')}</div><div class="mine-contact-sub">${escapeHtml(sub)}</div>${cooldownHtml}</div><span class="mine-tag ${nature}">${natureLabel}</span></div>`;
}

export function switchContactsSubtab(subtab) {
  setCurrentContactsFilter(subtab);
  document.querySelectorAll('#contactsSubtab .mine-subtab-item').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.includes(subtab === 'leverage' ? '🌳' : subtab === 'nurture' ? '🌸' : I18N[currentLang].mine_all));
  });
  renderContactsList(subtab, I18N[currentLang]);
}

export function getContactGroups(contacts, groupBy, d) {
  const groups = new Map(); // key -> { label, contacts[] }

  for (const c of contacts) {
    let keys = [];
    if (groupBy === 'relation') {
      const rel = (c.relation || c.role || '').trim();
      keys = [rel || d.group_unGrouped];
    } else if (groupBy === 'company') {
      const comp = (c.company || '').trim();
      keys = [comp || d.group_unGrouped];
    } else if (groupBy === 'tag') {
      const tags = c.tags || [];
      keys = tags.length > 0 ? tags : [d.group_unGrouped];
    } else if (groupBy === 'strength') {
      const s = c.strength || 0;
      if (s >= 4) keys = [d.group_core];
      else if (s === 3) keys = [d.group_important];
      else keys = [d.group_casual];
    } else if (groupBy === 'cooldown') {
      if (c.nature === 'nurture') {
        keys = ['🌸 ' + d.mine_nurture];
      } else {
        const cd = getCooldownInfo(c, mineCache.timeline || []);
        if (!cd || cd.days >= 999) keys = [d.group_never];
        else if (cd.urgent) keys = [d.group_urgent];
        else if (cd.days <= 7) keys = [d.group_recent];
        else keys = [d.group_normal];
      }
    }
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, { label: key, contacts: [] });
      groups.get(key).contacts.push(c);
    }
  }

  // Sort groups
  const entries = [...groups.entries()];
  if (groupBy === 'strength') {
    const order = [d.group_core, d.group_important, d.group_casual];
    entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  } else if (groupBy === 'cooldown') {
    const order = [d.group_urgent, d.group_never, d.group_normal, d.group_recent, '🌸 ' + d.mine_nurture];
    entries.sort((a, b) => {
      const ia = order.indexOf(a[0]); const ib = order.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  } else {
    // Sort by group size desc, ungrouped last
    entries.sort((a, b) => {
      if (a[0] === d.group_unGrouped) return 1;
      if (b[0] === d.group_unGrouped) return -1;
      return b[1].contacts.length - a[1].contacts.length;
    });
  }
  return entries;
}

export function renderContactsList(filter, d) {
  const contacts = mineCache.contacts || [];
  let filtered = contacts;
  if (filter === 'leverage') filtered = contacts.filter(c => c.nature === 'leverage' || c.nature === 'dual');
  else if (filter === 'nurture') filtered = contacts.filter(c => c.nature === 'nurture' || c.nature === 'dual');
  const el = document.getElementById('contactsList');
  if (!el) return;
  if (filtered.length === 0) {
    el.innerHTML = `<div class="mine-empty">${d.mine_empty_contacts}</div>`;
    return;
  }

  const groups = getContactGroups(filtered, contactsGroupBy, d);

  let html = '';
  for (const [groupKey, group] of groups) {
    const collapsed = contactsCollapsedGroups.has(groupKey);
    const groupIcon = contactsGroupBy === 'cooldown' && groupKey === d.group_urgent ? '⚠️'
      : contactsGroupBy === 'cooldown' && groupKey === d.group_never ? '🔴'
      : contactsGroupBy === 'cooldown' && groupKey === d.group_recent ? '✅'
      : contactsGroupBy === 'strength' && groupKey === d.group_core ? '⭐'
      : '📁';
    html += `<div class="mine-group-header${collapsed ? ' collapsed' : ''}" data-group-key="${escapeHtml(groupKey)}" onclick="toggleGroup('${escapeHtml(groupKey).replace(/'/g,"\\'")}')">`;
    html += `<span>${groupIcon}</span>`;
    html += `<span>${escapeHtml(group.label)}</span>`;
    html += `<span class="mine-group-count">${group.contacts.length}</span>`;
    html += `<span class="mine-group-toggle">▾</span>`;
    html += `</div>`;
    html += `<div class="mine-group-body${collapsed ? ' collapsed' : ''}" data-group-body="${escapeHtml(groupKey)}">`;
    html += `<div class="mine-card">`;
    group.contacts.forEach(c => html += renderContactItem(c, d));
    html += `</div></div>`;
  }
  el.innerHTML = html;
}

export function onContactsSearch(val) {
  const d = I18N[currentLang];
  const keyword = (val || '').trim();
  if (!keyword) {
    // Clear search → restore full list
    renderContactsResults('', d);
    return;
  }
  renderContactsResults(keyword, d);
}

export async function openContactDetail(contactId) {
  const d = I18N[currentLang];
  const zh = currentLang === 'zh';
  let contact = (mineCache.contacts || []).find(c => c.id === contactId);
  // Fallback to chatDataCache (loaded on main chat page)
  if (!contact) contact = (chatDataCache.contacts || []).find(c => c.id === contactId);
  // Fallback: try matching by name (old timeline data may store name instead of id)
  if (!contact) {
    contact = (mineCache.contacts || []).find(c => c.name === contactId) ||
              (chatDataCache.contacts || []).find(c => c.name === contactId);
  }
  if (!contact) return;

  // Show drawer immediately with basic info
  document.getElementById('detailName').textContent = contact.name || '';
  const subParts = [contact.relation || contact.role || '', contact.company || '', contact.title || ''].filter(Boolean);
  document.getElementById('detailSub').textContent = subParts.join(' · ');
  document.getElementById('detailBody').innerHTML = `<div class="mine-empty">${d.detail_loading}</div>`;
  document.getElementById('contactDetailOverlay').classList.add('show');
  document.getElementById('contactDetail').classList.add('show');

  // Add edit/delete/meeting-prep buttons to header (recreate each time to update contactId)
  const headerEl = document.querySelector('#contactDetail .mine-detail-header');
  if (headerEl) {
    const existing = headerEl.querySelector('.detail-btns');
    if (existing) existing.remove();
    const btnContainer = document.createElement('div');
    btnContainer.className = 'detail-btns';
    btnContainer.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    btnContainer.innerHTML = `
      <button class="detail-prep-btn" onclick="meetingPrepDetail('${contactId}')" class="btn-outline-md">${d.meeting_prep}</button>
      <button class="detail-edit-btn" onclick="editContactForm('${contactId}')" class="btn-outline-md">${d.edit_contact}</button>
      <button class="detail-del-btn" onclick="deleteContact('${contactId}')" class="btn-outline-md">${d.delete_contact}</button>
    `;
    headerEl.appendChild(btnContainer);
  }

  try {
    // Fetch timeline for this contact
    let timeline = [];
    try {
      const tlRes = await mineApi(`/data/timeline?contact_id=${encodeURIComponent(contactId)}`);
      timeline = tlRes.timeline || [];
    } catch (e) {}

    let html = '';

    // Aliases / nicknames
    const aliases = contact.aliases || contact.alias || [];
    if (aliases.length > 0) {
      html += `<div class="mine-detail-section">`;
      html += `<div class="mine-detail-section-title">${zh ? '昵称' : 'Nicknames'}</div>`;
      html += `<div class="mine-detail-tags">`;
      aliases.forEach(a => html += `<span class="mine-detail-tag">${escapeHtml(a)}</span>`);
      html += `</div></div>`;
    }

    // Tags
    if (contact.tags && contact.tags.length > 0) {
      html += `<div class="mine-detail-section">`;
      html += `<div class="mine-detail-section-title">${d.detail_tags}</div>`;
      html += `<div class="mine-detail-tags">`;
      contact.tags.forEach(t => html += `<span class="mine-detail-tag">${escapeHtml(t)}</span>`);
      html += `</div></div>`;
    }

    // Contact info (phone / email)
    if (contact.phone || contact.email) {
      html += `<div class="mine-detail-section">`;
      html += `<div class="mine-detail-section-title">${zh ? '联系方式' : 'Contact'}</div>`;
      if (contact.phone) html += `<div class="mine-detail-item"><span style="color:var(--dim)">📱 </span>${escapeHtml(contact.phone)}</div>`;
      if (contact.email) html += `<div class="mine-detail-item"><span style="color:var(--dim)">✉️ </span>${escapeHtml(contact.email)}</div>`;
      html += `</div>`;
    }

    // Leverage info
    const hasLeverage = contact.nature === 'leverage' || contact.nature === 'dual' || contact.leverage;
    if (hasLeverage) {
      html += `<div class="mine-detail-section">`;
      html += `<div class="mine-detail-section-title">${d.detail_leverage}</div>`;
      if (contact.leverage) {
        html += `<div class="mine-detail-leverage">`;
        if (contact.leverage.goals) html += `<div><span class="label">${d.detail_goals}: </span><span class="value">${escapeHtml(contact.leverage.goals.join(', '))}</span></div>`;
        if (contact.leverage.how) html += `<div><span class="label">${d.detail_how}: </span><span class="value">${escapeHtml(contact.leverage.how)}</span></div>`;
        if (contact.leverage.direction) html += `<div><span class="label">${d.detail_direction}: </span><span class="value">${escapeHtml(contact.leverage.direction)}</span></div>`;
        if (contact.leverage.confirmed) html += `<div class="label" style="margin-top:4px">✓ ${escapeHtml(contact.leverage.confirmed)}</div>`;
        html += `</div>`;
      } else {
        html += `<div class="mine-detail-item">${d.detail_no_leverage}</div>`;
      }
      html += `</div>`;
    }

    // Nurture info
    const hasNurture = contact.nature === 'nurture' || contact.nature === 'dual' || contact.nurture;
    if (hasNurture) {
      html += `<div class="mine-detail-section">`;
      html += `<div class="mine-detail-section-title">${d.detail_nurture}</div>`;
      const n = contact.nurture || {};
      if (n.bond || contact.important_dates?.length || contact.memories?.length || contact.presence_events?.length) {
        html += `<div class="mine-detail-nurture">`;
        if (n.bond) html += `<div><span class="label">${d.detail_bond}: </span><span class="value">${escapeHtml(n.bond)}</span></div>`;
        html += `</div>`;
      } else {
        html += `<div class="mine-detail-item">${d.detail_no_nurture}</div>`;
      }
      html += `</div>`;
    }

    // Important dates
    if (contact.important_dates && contact.important_dates.length > 0) {
      html += `<div class="mine-detail-section">`;
      html += `<div class="mine-detail-section-title">${d.detail_dates}</div>`;
      contact.important_dates.forEach(dt => {
        html += `<div class="mine-detail-date"><span class="icon">📅</span><span>${escapeHtml(dt.date || '')} — ${escapeHtml(dt.label || '')}</span></div>`;
      });
      html += `</div>`;
    }

    // Memories
    if (contact.memories && contact.memories.length > 0) {
      html += `<div class="mine-detail-section">`;
      html += `<div class="mine-detail-section-title">${d.detail_memories}</div>`;
      contact.memories.forEach(m => {
        html += `<div class="mine-detail-item">${escapeHtml(typeof m === 'string' ? m : (m.content || m.text || JSON.stringify(m)))}</div>`;
      });
      html += `</div>`;
    }

    // Presence events
    if (contact.presence_events && contact.presence_events.length > 0) {
      html += `<div class="mine-detail-section">`;
      html += `<div class="mine-detail-section-title">${d.detail_presence}</div>`;
      contact.presence_events.forEach(p => {
        html += `<div class="mine-detail-item">${escapeHtml(typeof p === 'string' ? p : (p.event || p.summary || JSON.stringify(p)))}</div>`;
      });
      html += `</div>`;
    }

    // Timeline
    html += `<div class="mine-detail-section">`;
    html += `<div class="mine-detail-section-title" style="display:flex;justify-content:space-between;align-items:center">${d.detail_timeline}
      <button onclick="showTimelineForm('${escapeHtml(contactId)}')" style="font-size:.75em;padding:3px 10px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:inherit">+ ${d.tl_add}</button>
    </div>`;
    html += `<div id="timelineForm" style="display:none;margin-bottom:8px"></div>`;
    if (timeline.length > 0) {
      timeline.forEach(t => {
        const dt = (t.date || '').substring(5) || '';
        const summary = t.summary || t.action || '';
        const tId = escapeHtml(t.id);
        html += `<div class="mine-detail-item" id="tl-${tId}" style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="flex:1;cursor:pointer" onclick="showInteractionDetail('${tId}','${escapeHtml(contactId)}')"><span style="color:var(--dim)">${dt}</span> ${escapeHtml(summary)}</div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button onclick="showInteractionDetail('${tId}','${escapeHtml(contactId)}')" class="btn-outline-xs">${zh?'详情':'Detail'}</button>
            <button onclick="showTimelineForm('${escapeHtml(contactId)}','${tId}')" class="btn-outline-xs">${d.tl_edit}</button>
            <button onclick="deleteTimelineEntry('${tId}','${escapeHtml(contactId)}',event)" class="btn-outline-xs">${d.tl_delete}</button>
          </div>
        </div>`;
      });
    } else {
      html += `<div class="mine-detail-item" style="color:var(--dimmer)">${d.detail_no_timeline}</div>`;
    }
    html += `</div>`;

    document.getElementById('detailBody').innerHTML = html;
    // Store current contactId + timeline for form use
    window._currentDetailContactId = contactId;
    window._currentDetailTimeline = timeline;
  } catch (e) {
    document.getElementById('detailBody').innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

export function showTimelineForm(contactId, tlId) {
  const d = I18N[currentLang];
  const form = document.getElementById('timelineForm');
  if (!form) return;
  const editing = tlId ? (window._currentDetailTimeline || []).find(t => t.id === tlId) : null;
  const today = localDateStr();

  form.style.display = 'block';
  form.innerHTML = `
    <div class="mine-card" style="display:flex;flex-direction:column;gap:8px;padding:10px">
      <input id="tl_summary_input" type="text" value="${escapeHtml(editing?.summary || '')}" placeholder="${d.tl_summary_ph}" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.9em">
      <input id="tl_date_input" type="date" value="${escapeHtml((editing?.date || today).substring(0,10))}" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.9em">
      <div style="display:flex;gap:8px">
        <button onclick="saveTimelineEntry('${escapeHtml(contactId)}','${escapeHtml(tlId || '')}')" style="flex:1;padding:6px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:inherit;font-size:.85em">${d.tl_save}</button>
        <button onclick="hideTimelineForm()" style="flex:1;padding:6px;background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-family:inherit;font-size:.85em;color:var(--dim)">${d.tl_cancel}</button>
      </div>
    </div>
  `;
  document.getElementById('tl_summary_input')?.focus();
}

export function hideTimelineForm() {
  const form = document.getElementById('timelineForm');
  if (form) { form.style.display = 'none'; form.innerHTML = ''; }
}

export async function saveTimelineEntry(contactId, tlId) {
  const summary = document.getElementById('tl_summary_input')?.value?.trim();
  if (!summary) return;
  const date = document.getElementById('tl_date_input')?.value || localDateStr();
  try {
    if (tlId) {
      // Edit existing via PUT
      await mineApi('/data/timeline', 'PUT', { id: tlId, summary, date, contact_id: contactId });
    } else {
      // Add new via POST
      await mineApi('/data/timeline', 'POST', { summary, date, contact_id: contactId });
    }
    hideTimelineForm();
    // Reload contact detail to refresh timeline
    await openContactDetail(contactId);
  } catch (e) {
    alert(e.message);
  }
}

export async function deleteTimelineEntry(tlId, contactId, ev) {
  const d = I18N[currentLang];
  const ok = await confirmPop(ev, currentLang === 'zh' ? '确认删除这条互动记录？' : 'Delete this interaction?');
  if (!ok) return;
  try {
    await mineApi(`/data/timeline?id=${encodeURIComponent(tlId)}`, 'DELETE');
    await openContactDetail(contactId);
  } catch (e) {
    alert(e.message);
  }
}

export function closeContactDetail() {
  document.getElementById('contactDetailOverlay').classList.remove('show');
  document.getElementById('contactDetail').classList.remove('show');
}

export function editContactForm(contactId) {
  const d = I18N[currentLang];
  const zh = currentLang === 'zh';
  const contact = (mineCache.contacts || []).find(c => c.id === contactId);
  if (!contact) return;
  const lev = contact.leverage || {};
  const nur = contact.nurture || {};
  const datesStr = (contact.important_dates || []).map(dt => `${dt.date}|${dt.label}`).join('\n');
  const memStr = (contact.memories || []).map(m => typeof m === 'string' ? m : (m.content || m.text || '')).join('\n');

  document.getElementById('detailBody').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      <label style="font-size:.8em;color:var(--dim)">${d.edit_name}<input id="edt_name" value="${escapeHtml(contact.name||'')}" class="input-field"></label>
      <label style="font-size:.8em;color:var(--dim)">${zh ? '昵称（逗号分隔）' : 'Nicknames (comma separated)'}<input id="edt_aliases" value="${escapeHtml((contact.aliases||contact.alias||[]).join(', '))}" class="input-field" placeholder="${zh ? '老肖, 肖哥' : 'nick1, nick2'}"></label>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_relation}<input id="edt_relation" value="${escapeHtml(contact.relation||contact.role||'')}" class="input-field"></label>
      <div style="display:flex;gap:8px">
        <label style="flex:1;font-size:.8em;color:var(--dim)">${d.edit_company}<input id="edt_company" value="${escapeHtml(contact.company||'')}" class="input-field"></label>
        <label style="flex:1;font-size:.8em;color:var(--dim)">${d.edit_title}<input id="edt_title" value="${escapeHtml(contact.title||'')}" class="input-field"></label>
      </div>
      <div style="display:flex;gap:8px">
        <label style="flex:1;font-size:.8em;color:var(--dim)">${d.edit_phone}<input id="edt_phone" value="${escapeHtml(contact.phone||'')}" class="input-field" placeholder="13800138000"></label>
        <label style="flex:1;font-size:.8em;color:var(--dim)">${d.edit_email}<input id="edt_email" value="${escapeHtml(contact.email||'')}" class="input-field" placeholder="name@example.com"></label>
      </div>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_nature}
        <select id="edt_nature" class="input-field">
          <option value="leverage" ${contact.nature==='leverage'?'selected':''}>${d.edit_nature_leverage}</option>
          <option value="nurture" ${contact.nature==='nurture'?'selected':''}>${d.edit_nature_nurture}</option>
          <option value="dual" ${contact.nature==='dual'?'selected':''}>${d.edit_nature_dual}</option>
        </select>
      </label>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_tags}<input id="edt_tags" value="${escapeHtml((contact.tags||[]).join(', '))}" class="input-field" placeholder="tag1, tag2"></label>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_goals}<input id="edt_goals" value="${escapeHtml((lev.goals||[]).join(', '))}" class="input-field" placeholder="事业, 资源"></label>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_how}<input id="edt_how" value="${escapeHtml(lev.how||'')}" class="input-field"></label>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_bond}<input id="edt_bond" value="${escapeHtml(nur.bond||'')}" class="input-field"></label>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_dates}<textarea id="edt_dates" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.85em;margin-top:4px;min-height:50px" placeholder="11-29|生日&#10;03-15|纪念日">${escapeHtml(datesStr)}</textarea></label>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_memories}<textarea id="edt_memories" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.85em;margin-top:4px;min-height:60px" placeholder="不喝白酒只喝红酒&#10;儿子今年中考">${escapeHtml(memStr)}</textarea></label>
      <label style="font-size:.8em;color:var(--dim)">${d.edit_notes}<textarea id="edt_notes" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.85em;margin-top:4px;min-height:40px">${escapeHtml(contact.notes||'')}</textarea></label>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button onclick="saveContactEdit('${contactId}')" style="flex:1;padding:8px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.85em">${d.save_contact}</button>
        <button onclick="openContactDetail('${contactId}')" class="btn-flex-item">${d.cancel_edit}</button>
      </div>
    </div>
  `;
}

export async function saveContactEdit(contactId) {
  const d = I18N[currentLang];
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const tags = val('edt_tags').split(',').map(t => t.trim()).filter(Boolean);
  const aliases = val('edt_aliases').split(',').map(a => a.trim()).filter(Boolean);
  const goals = val('edt_goals').split(',').map(t => t.trim()).filter(Boolean);
  const dates = val('edt_dates').split('\n').map(line => { const [date, ...labelParts] = line.split('|'); return { date: (date||'').trim(), label: labelParts.join('|').trim() }; }).filter(dt => dt.date);
  const memories = val('edt_memories').split('\n').map(m => m.trim()).filter(Boolean);

  const body = {
    id: contactId,
    name: val('edt_name'),
    aliases,
    relation: val('edt_relation'),
    role: val('edt_relation'),
    company: val('edt_company'),
    title: val('edt_title'),
    phone: val('edt_phone'),
    email: val('edt_email'),
    nature: val('edt_nature'),
    tags, notes: val('edt_notes'),
    leverage: { goals, how: val('edt_how') },
    nurture: { bond: val('edt_bond') },
    important_dates: dates,
    memories,
  };
  try {
    await mineApi('/data/contacts', 'POST', body);
    // Refresh cache
    await refreshContactsCache();
    openContactDetail(contactId);
  } catch (e) {
    alert(d.billing_error + e.message);
  }
}

export async function deleteContact(contactId) {
  const d = I18N[currentLang];
  if (!confirm(d.confirm_delete)) return;
  try {
    const token = simulationMode ? `demo_${simulationData.id}:demo_secret` : await getClerkToken();
    const resp = await fetch(`${CLOUD_URL}/data/contacts?id=${encodeURIComponent(contactId)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    closeContactDetail();
    await refreshContactsCache();
    if (mineCurrentTab === 'contacts') loadContactsTab();
  } catch (e) {
    alert(d.billing_error + e.message);
  }
}

export async function refreshContactsCache() {
  try {
    const data = await mineApi('/data/contacts');
    mineCache.contacts = data.contacts || [];
  } catch (e) {}
}

export function getCooldownInfo(contact, timeline) {
  if (contact.nature === 'nurture') return null; // No cooldown for nurture
  const contactTimeline = timeline.filter(t => t.contact === contact.id);
  if (contactTimeline.length === 0) return { days: 999, urgent: true };
  const latest = contactTimeline.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0];
  const days = Math.floor((Date.now() - new Date(latest.date || 0)) / 86400000);
  const threshold = contact.nature === 'dual' ? 21 : 14;
  return { days, urgent: days >= threshold, latest };
}

export async function meetingPrepDetail(contactId) {
  const d = I18N[currentLang];
  const contact = (mineCache.contacts || []).find(c => c.id === contactId);
  if (!contact) return;
  const body = document.getElementById('detailBody');
  body.innerHTML = `<div class="mine-empty">${d.meeting_prep_loading}</div>`;
  try {
    const result = await mineApi('/ai/meeting_prep', 'POST', { contact_id: contactId });
    const data = result;
    let html = '';
    if (data.timeline && data.timeline.length > 0) {
      html += `<div class="mine-detail-section"><div class="mine-detail-section-title">${d.meeting_last}</div>`;
      data.timeline.forEach(t => {
        const dt = (t.date || '').substring(0, 10);
        html += `<div class="mine-detail-item">${dt} — ${escapeHtml(t.summary || t.action || '')}</div>`;
      });
      html += `</div>`;
    }
    if (data.todos && data.todos.length > 0) {
      html += `<div class="mine-detail-section"><div class="mine-detail-section-title">${d.meeting_todos}</div>`;
      data.todos.forEach(t => {
        html += `<div class="mine-detail-item">⬜ ${escapeHtml(t.task || '')}</div>`;
      });
      html += `</div>`;
    }
    if (data.prep) {
      html += `<div class="mine-detail-section"><div class="mine-detail-section-title">${d.meeting_tips}</div>`;
      html += `<div style="font-size:.88em;line-height:1.7;white-space:pre-wrap">${escapeHtml(data.prep)}</div>`;
      html += `</div>`;
    }
    if (data.usage) {
      html += `<div style="font-size:.7em;color:var(--dimmer);margin-top:8px">${d.cost_preview}: ${Math.round(data.usage.points * 10) / 10} ${d.cost_points} · ${d.billing_remaining}: ${Math.round(data.usage.remaining * 10) / 10}</div>`;
    }
    html += `<button onclick="openContactDetail('${contactId}')" style="margin-top:12px;width:100%;padding:8px;background:none;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:inherit;font-size:.85em;color:var(--dim)">${d.cancel_edit}</button>`;
    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

export async function meetingPrep(contactName) {
  const d = I18N[currentLang];
  const contact = (mineCache.contacts || []).find(c =>
    c.name === contactName || (c.aliases || []).includes(contactName) || (c.alias || []).includes(contactName)
  );
  if (!contact) {
    addMsg('ai', `我没有找到「${contactName}」的记录。你可以先聊聊再问我。`);
    return;
  }
  addMsg('ai', `⏳ ${d.meeting_prep_loading}`);
  try {
    const tlRes = await mineApi(`/data/timeline?contact_id=${encodeURIComponent(contact.id)}`);
    const todosRes = await mineApi('/data/todos');
    const contactTodos = (todosRes.todos || []).filter(t => t.contact === contact.id && !t.done);
    const timeline = (tlRes.timeline || []).slice(-5);

    let prep = `📋 **${d.meeting_prep_title}：${contact.name}**\n\n`;
    if (timeline.length > 0) {
      prep += `**${d.meeting_last}：**\n`;
      timeline.forEach(t => {
        const dt = (t.date || '').substring(0, 10);
        prep += `  · ${dt} ${t.summary || t.action || ''}\n`;
      });
    } else {
      prep += `**${d.meeting_last}：** 暂无记录\n`;
    }
    if (contactTodos.length > 0) {
      prep += `\n**${d.meeting_todos}：**\n`;
      contactTodos.forEach(t => prep += `  · ⬜ ${t.task || ''}\n`);
    }
    if (contact.nurture?.bond) prep += `\n**关系：** ${contact.nurture.bond}\n`;
    if (contact.memories?.length > 0) {
      prep += `\n**记得：**\n`;
      contact.memories.slice(0, 3).forEach(m => prep += `  · ${typeof m === 'string' ? m : (m.content || '')}\n`);
    }
    addMsg('ai', prep);
  } catch (e) {
    addMsg('ai', `${d.meeting_prep}失败：${e.message}`);
  }
}