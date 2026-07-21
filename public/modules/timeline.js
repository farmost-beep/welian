// Auto-generated from app.js — do not edit manually

import { CLOUD_URL, I18N, currentLang, input, mineCache, setTimelineCache, setTimelineSearchQuery, simulationData, simulationMode, timelineCache, timelineSearchQuery } from './state.js';
import { confirmPop, escapeHtml, localDateStr, mineApi, getTabSignal, isStaleTab, currentTabRequestId } from './misc.js';
import { getClerkToken } from './auth.js';
import { openContactDetail, showTimelineForm } from './contacts.js';

export async function loadTimelineTab() {
  const d = I18N[currentLang];
  const content = document.getElementById('mineContent');
  const myRequestId = currentTabRequestId();
  const sig = getTabSignal();
  content.innerHTML = `<div class="mine-empty">${d.mine_loading}</div>`;
  try {
    const [timelineRes, contactsRes] = await Promise.all([
      mineApi('/data/timeline', 'GET', null, sig),
      mineApi('/data/contacts', 'GET', null, sig).catch(() => ({ contacts: [] })),
    ]);
    if (isStaleTab(myRequestId)) return;
    setTimelineCache(timelineRes.timeline || []);
    mineCache.contacts = contactsRes.contacts || [];
    if (isStaleTab(myRequestId)) return;
    renderTimelineTab();
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (isStaleTab(myRequestId)) return;
    content.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

export function renderTimelineTab() {
  const d = I18N[currentLang];
  const zh = currentLang === 'zh';
  const content = document.getElementById('mineContent');
  const contacts = mineCache.contacts || [];
  const contactMap = {};
  contacts.forEach(c => contactMap[c.id] = c);

  let html = '';

  // Search bar
  html += `<div style="margin-bottom:12px;display:flex;gap:8px">
    <input id="timelineSearch" type="text" value="${escapeHtml(timelineSearchQuery)}" placeholder="${zh?'搜索互动记录…':'Search interactions…'}" oninput="filterTimelineSearch(this.value)" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:.85em">
  </div>`;

  // Filter and sort
  let items = [...timelineCache];
  if (timelineSearchQuery) {
    const q = timelineSearchQuery.toLowerCase();
    items = items.filter(t => {
      const name = contactMap[t.contact]?.name || '';
      return (t.summary || '').toLowerCase().includes(q) ||
             (t.action || '').toLowerCase().includes(q) ||
             name.toLowerCase().includes(q);
    });
  }
  items.sort((a, b) => new Date((b.date || '1970-01-01').substring(0, 10)) - new Date((a.date || '1970-01-01').substring(0, 10)));

  if (items.length === 0) {
    html += `<div class="mine-empty">${zh?'暂无互动记录':'No interactions yet'}</div>`;
  } else {
    // Group by month
    const groups = {};
    items.forEach(t => {
      const dateStr = (t.date || '').substring(0, 7);
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(t);
    });
    const sortedMonths = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    const todayStr = localDateStr();
    sortedMonths.forEach(month => {
      const monthDate = new Date(month + '-01');
      const monthLabel = zh
        ? `${monthDate.getFullYear()}年${monthDate.getMonth() + 1}月`
        : monthDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      html += `<div class="mine-section-title" style="color:var(--dim)">${monthLabel} <span style="font-size:.75em;opacity:.6">(${groups[month].length})</span></div>`;
      html += `<div class="mine-card">`;
      groups[month].forEach(t => {
        const contactName = contactMap[t.contact]?.name || '';
        const date = (t.date || '').substring(0, 10);
        const dayStr = date.substring(5);
        const summary = t.summary || t.action || '';
        const isToday = date === todayStr;
        const tId = escapeHtml(t.id || '');
        html += `<div class="mine-todo" id="tl-item-${tId}">
          <span class="mine-todo-dot">${isToday ? '📌' : '📝'}</span>
          <div style="flex:1">
            <div>${escapeHtml(summary)}</div>
            <div class="mine-contact-sub" class="flex-wrap-gap">
              <span style="color:var(--dim)">${escapeHtml(dayStr)}</span>
              ${contactName ? `<span>👤 ${escapeHtml(contactName)}</span>` : ''}
              ${isToday ? `<span style="color:var(--accent)">${zh?'今天':'Today'}</span>` : ''}
            </div>
            <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
              <button onclick="showInteractionDetail('${tId}','${escapeHtml(t.contact||'')}')" class="btn-outline-sm">📋 ${zh?'详情':'Detail'}</button>
              <button onclick="editTimelineEntryFromList('${tId}','${escapeHtml(t.contact||'')}')" class="btn-outline-sm">${d.tl_edit}</button>
              <button onclick="deleteTimelineEntryFromList('${tId}',event)" class="btn-outline-sm">${d.tl_delete}</button>
            </div>
          </div>
        </div>`;
      });
      html += `</div>`;
    });
  }
  content.innerHTML = html;
}

export function filterTimelineSearch(q) {
  setTimelineSearchQuery(q);
  renderTimelineTab();
}

export function editTimelineEntryFromList(tlId, contactId) {
  // Open contact detail then show timeline form
  openContactDetail(contactId).then(() => {
    setTimeout(() => showTimelineForm(contactId, tlId), 500);
  });
}

export async function deleteTimelineEntryFromList(tlId, ev) {
  const zh = currentLang === 'zh';
  const ok = await confirmPop(ev, zh ? '确认删除这条互动记录？' : 'Delete this interaction?');
  if (!ok) return;
  try {
    const token = simulationMode ? `demo_${simulationData.id}:demo_secret` : await getClerkToken();
    await fetch(`${CLOUD_URL}/data/timeline?id=${encodeURIComponent(tlId)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    // Remove from cache and re-render
    setTimelineCache(timelineCache.filter(t => t.id !== tlId));
    renderTimelineTab();
  } catch (e) {
    alert(e.message);
  }
}
