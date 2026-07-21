// Auto-generated from app.js — do not edit manually

import { CLOUD_URL, I18N, body, currentLang, input, mineCache, setTodosCache, setTodosDoneCache, setTodosFilter, simulationData, simulationMode, todosCache, todosDoneCache, todosFilter } from './state.js';
import { addMsg } from './chat.js';
import { escapeHtml, localDateStr, mineApi, getTabSignal, isStaleTab, currentTabRequestId } from './misc.js';
import { getClerkToken } from './auth.js';

export async function loadTodosTab() {
  const d = I18N[currentLang];
  const content = document.getElementById('mineContent');
  const myRequestId = currentTabRequestId();
  const sig = getTabSignal();
  content.innerHTML = `<div class="mine-empty">${d.mine_loading}</div>`;
  try {
    const [todosRes, contactsRes] = await Promise.all([
      mineApi('/data/todos', 'GET', null, sig),
      mineApi('/data/contacts', 'GET', null, sig).catch(() => ({ contacts: [] })),
    ]);
    if (isStaleTab(myRequestId)) return;
    setTodosCache(todosRes.todos || []);
    const doneCount = todosRes.done_count || 0;
    mineCache.contacts = contactsRes.contacts || [];
    // Load done todos only if switching to done tab or done_count > 0
    if (todosFilter === 'done' && doneCount > 0) {
      try {
        const doneRes = await mineApi('/data/todos?status=done', 'GET', null, sig);
        setTodosDoneCache(doneRes.todos || []);
      } catch { setTodosDoneCache([]); }
    }
    if (isStaleTab(myRequestId)) return;
    renderTodosTab(d, doneCount);
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (isStaleTab(myRequestId)) return;
    content.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

export function renderTodosTab(d, doneCount) {
  const content = document.getElementById('mineContent');
  const today = localDateStr();

  // Filter tabs: pending | done
  let html = `<div class="mine-subtab" id="todosSubtab">
    <button class="mine-subtab-item ${todosFilter==='pending'?'active':''}" onclick="switchTodosFilter('pending')">${d.todo_filter_pending}${todosCache.length > 0 ? ` (${todosCache.length})` : ''}</button>
    <button class="mine-subtab-item ${todosFilter==='done'?'active':''}" onclick="switchTodosFilter('done')">${d.todo_filter_done}${doneCount > 0 ? ` (${doneCount})` : ''}</button>
  </div>`;

  // Add button (only in pending view)
  if (todosFilter === 'pending') {
    html += `<button onclick="showTodoForm()" style="width:100%;padding:10px;margin-bottom:12px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.85em">+ ${d.todo_add}</button>`;
  }

  // Todo form (hidden by default)
  html += `<div id="todoForm" style="display:none;margin-bottom:12px"></div>`;

  // Contact map
  const contacts = mineCache.contacts || [];
  const contactMap = {};
  contacts.forEach(c => contactMap[c.id] = c.name);

  if (todosFilter === 'done') {
    // ── Done tab ──
    if (todosDoneCache.length === 0) {
      html += `<div class="mine-empty">${d.todo_empty}</div>`;
    } else {
      todosDoneCache.sort((a, b) => (b.completed_at || b.updated || b.created || '').localeCompare(a.completed_at || a.updated || a.created || ''));
      html += `<div class="mine-card">`;
      todosDoneCache.forEach(t => {
        const contactName = contactMap[t.contact] || '';
        const completedDate = t.completed_at ? new Date(t.completed_at).toLocaleDateString(currentLang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }) : '';
        const dueDate = (t.due || '').substring(0, 10);
        let dueDateDisplay = '';
        if (dueDate) {
          const d2 = new Date(dueDate);
          const weekdays = currentLang === 'zh' ? ['周日','周一','周二','周三','周四','周五','周六'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          dueDateDisplay = `${d2.getMonth() + 1}月${d2.getDate()}日 ${weekdays[d2.getDay()]}`;
        }
        html += `<div class="mine-todo" id="todo-${escapeHtml(t.id)}" style="opacity:.6">
          <span class="mine-todo-dot">✓</span>
          <div style="flex:1">
            <div style="text-decoration:line-through">${t.task ? escapeHtml(t.task) : '<span style="color:#e74c3c;font-style:italic">（空待办）</span>'}</div>
            <div class="mine-contact-sub" class="flex-wrap-gap">
              ${dueDateDisplay ? `<span>📅 ${dueDateDisplay}</span>` : ''}
              ${contactName ? `<span>👤 ${escapeHtml(contactName)}</span>` : ''}
              ${completedDate ? `<span style="color:var(--dimmer)">✓ ${completedDate} ${currentLang==='zh'?'完成':'done'}</span>` : ''}
            </div>
            <div style="display:flex;gap:8px;margin-top:4px">
              <button onclick="showTodoDetail('${escapeHtml(t.id)}')" class="btn-outline-sm">📋 ${d.todo_detail}</button>
              <button onclick="undoTodoDone('${escapeHtml(t.id)}')" class="btn-outline-sm">↩ ${d.todo_undone}</button>
              <button onclick="deleteTodo('${escapeHtml(t.id)}')" class="btn-outline-sm">${d.todo_delete}</button>
            </div>
          </div>
        </div>`;
      });
      html += `</div>`;
    }
  } else {
    // ── Pending tab: grouped by urgency ──
    if (todosCache.length === 0) {
      html += `<div class="mine-empty">${d.todo_empty}</div>`;
    } else {
      // Group todos: overdue / today / this_week / later / no_date
      const groups = { overdue: [], today: [], this_week: [], later: [], no_date: [] };
      todosCache.forEach(t => {
        const due = (t.due || '').substring(0, 10);
        if (!due) { groups.no_date.push(t); return; }
        const delta = Math.floor((new Date(due) - new Date(today)) / 86400000);
        if (delta < 0) groups.overdue.push(t);
        else if (delta === 0) groups.today.push(t);
        else if (delta <= 7) groups.this_week.push(t);
        else groups.later.push(t);
      });

      // Sort each group by due date
      ['overdue', 'today', 'this_week', 'later'].forEach(g => {
        groups[g].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
      });
      // No-date group: sort by priority then created
      groups.no_date.sort((a, b) => {
        const pri = (a.priority || 'P1').localeCompare(b.priority || 'P1');
        if (pri !== 0) return pri;
        return (a.created || '').localeCompare(b.created || '');
      });

      // Render groups
      const groupLabels = {
        overdue: { icon: '🔴', label: currentLang === 'zh' ? '已超期' : 'Overdue', cls: 'color:#e74c3c' },
        today: { icon: '⏰', label: currentLang === 'zh' ? '今天' : 'Today', cls: 'color:var(--accent)' },
        this_week: { icon: '📅', label: currentLang === 'zh' ? '本周内' : 'This week', cls: 'color:var(--dim)' },
        later: { icon: '🗓️', label: currentLang === 'zh' ? '之后' : 'Later', cls: 'color:var(--dim)' },
        no_date: { icon: '📝', label: currentLang === 'zh' ? '未设日期' : 'No date', cls: 'color:var(--dim)' },
      };

      ['overdue', 'today', 'this_week', 'later', 'no_date'].forEach(g => {
        if (groups[g].length === 0) return;
        const gl = groupLabels[g];
        html += `<div class="mine-section-title" style="${gl.cls}">${gl.icon} ${gl.label} <span style="font-size:.75em;opacity:.6">(${groups[g].length})</span></div>`;
        html += `<div class="mine-card">`;
        groups[g].forEach(t => {
          const due = (t.due || '').substring(0, 10);
          let dueLabel = '';
          if (due) {
            const delta = Math.floor((new Date(due) - new Date(today)) / 86400000);
            if (delta < 0) dueLabel = `${-delta}${d.todo_overdue}`;
            else if (delta === 0) dueLabel = d.todo_today;
            else dueLabel = `${delta}${d.todo_days_left}`;
          }
          const contactName = contactMap[t.contact] || '';
          const priorityBadge = t.priority === 'P1' ? '<span style="color:var(--accent);font-size:.7em">●</span>' : (t.priority === 'P0' ? '<span style="color:#e74c3c;font-size:.7em">●</span>' : '');
          const sourceBadge = t.source === 'ai_extract' ? '<span style="font-size:.65em;color:var(--dimmer);background:var(--surface);padding:1px 4px;border-radius:3px;margin-left:4px">AI</span>'
            : (t.source === 'visit' || t.source === 'visit_prep' || t.source === 'visit_followup') ? '<span style="font-size:.65em;color:#4A6741;background:#FAFAF7;padding:1px 4px;border-radius:3px;margin-left:4px">🚗拜访</span>'
            : (t.source === 'dinner' || t.source === 'dinner_prep' || t.source === 'dinner_followup') ? '<span style="font-size:.65em;color:#B85C00;background:#FFF8F0;padding:1px 4px;border-radius:3px;margin-left:4px">🍽️聚餐</span>'
            : (t.source && t.source.startsWith('meeting:')) ? '<span style="font-size:.65em;color:var(--dimmer);background:var(--surface);padding:1px 4px;border-radius:3px;margin-left:4px">🎯会议</span>'
            : '';
          const taskText = t.task || '';
          const taskDisplay = taskText ? escapeHtml(taskText) : `<span style="color:#e74c3c;font-style:italic">（空待办，建议删除）</span>`;
          // Format due date: show absolute date + relative label
          const dueDate = (t.due || '').substring(0, 10);
          let dueDateDisplay = '';
          if (dueDate) {
            const d2 = new Date(dueDate);
            const weekdays = currentLang === 'zh' ? ['周日','周一','周二','周三','周四','周五','周六'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            const mmdd = `${d2.getMonth() + 1}月${d2.getDate()}日 ${weekdays[d2.getDay()]}`;
            dueDateDisplay = `${mmdd}${dueLabel ? ` (${dueLabel})` : ''}`;
          }
          html += `<div class="mine-todo" id="todo-${escapeHtml(t.id)}">
            <span class="mine-todo-dot ${g === 'overdue' ? 'mine-todo-overdue' : ''}">${priorityBadge}</span>
            <div style="flex:1">
              <div>${taskDisplay}${sourceBadge}</div>
              <div class="mine-contact-sub" class="flex-wrap-gap">
                ${dueDateDisplay ? `<span>📅 ${dueDateDisplay}</span>` : '<span style="color:var(--dimmer)">📅 未设日期</span>'}
                ${contactName ? `<span>👤 ${escapeHtml(contactName)}</span>` : '<span style="color:var(--dimmer)">👤 未关联</span>'}
                ${t.location ? `<span>📍 ${escapeHtml(t.location)}</span>` : ''}
              </div>
              <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
                <button onclick="toggleTodoDone('${escapeHtml(t.id)}')" class="btn-outline-sm">✓ ${d.todo_done}</button>
                <button onclick="showTodoDetail('${escapeHtml(t.id)}')" class="btn-outline-sm">📋 ${d.todo_detail}</button>
                <button onclick="showTodoForm('${escapeHtml(t.id)}')" class="btn-outline-sm">${d.todo_edit}</button>
                <button onclick="postponeTodo('${escapeHtml(t.id)}', '${escapeHtml((t.due||'').slice(0,10))}')" class="btn-outline-sm">${currentLang==='zh'?'⏰ 推迟':'⏰ Postpone'}</button>
                <button onclick="cancelTodo('${escapeHtml(t.id)}')" class="btn-outline-sm">${currentLang==='zh'?'✕ 取消':'✕ Cancel'}</button>
                <button onclick="deleteTodo('${escapeHtml(t.id)}')" class="btn-outline-sm">${d.todo_delete}</button>
              </div>
            </div>
          </div>`;
        });
        html += `</div>`;
      });
    }
  }
  content.innerHTML = html;
}

export function switchTodosFilter(filter) {
  setTodosFilter(filter);
  loadTodosTab();
}

export function showTodoForm(todoId) {
  const d = I18N[currentLang];
  const form = document.getElementById('todoForm');
  if (!form) return;
  const editing = todoId ? todosCache.find(t => t.id === todoId) : null;
  const contacts = mineCache.contacts || [];
  const selectedContact = editing && editing.contact ? contacts.find(c => c.id === editing.contact) : null;
  const selectedContactName = selectedContact ? selectedContact.name : '';

  form.style.display = 'block';
  form.innerHTML = `
    <div class="mine-card" style="display:flex;flex-direction:column;gap:10px">
      <label style="font-size:.8em;color:var(--dim)">${d.todo_task}<input id="todo_task_input" value="${escapeHtml(editing?.task || '')}" class="input-field"></label>
      <div style="display:flex;gap:8px">
        <label style="flex:1;font-size:.8em;color:var(--dim)">${d.todo_due}<input id="todo_due_input" type="date" value="${escapeHtml((editing?.due || '').substring(0,10))}" class="input-field"></label>
        <label style="font-size:.8em;color:var(--dim)">${d.todo_priority}
          <select id="todo_priority_input" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.9em;margin-top:4px">
            <option value="P1" ${editing?.priority === 'P1' ? 'selected' : ''}>P1</option>
            <option value="P2" ${editing?.priority === 'P2' ? 'selected' : ''}>P2</option>
            <option value="P3" ${editing?.priority === 'P3' ? 'selected' : ''}>P3</option>
          </select>
        </label>
      </div>
      <div style="font-size:.8em;color:var(--dim);position:relative">${d.todo_contact}
        <input id="todo_contact_input" type="text" value="${escapeHtml(selectedContactName)}" placeholder="${currentLang==='zh'?'输入人名搜索…':'Search name…'}" autocomplete="off"
          class="input-field">
        <input id="todo_contact_id" type="hidden" value="${escapeHtml(editing?.contact || '')}">
        <div id="todoContactDropdown" style="display:none;position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-top:none;border-radius:0 0 6px 6px;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,.15)"></div>
      </div>
      <label style="font-size:.8em;color:var(--dim)">${currentLang==='zh'?'地址':'Location'}<input id="todo_location_input" value="${escapeHtml(editing?.location || '')}" placeholder="${currentLang==='zh'?'如：上海·陆家嘴 / 北京·国贸':'e.g. Shanghai·Lujiazui'}" class="input-field"></label>
      <div style="display:flex;gap:8px">
        <button onclick="saveTodo('${escapeHtml(todoId || '')}')" style="flex:1;padding:8px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:.85em">${d.todo_save}</button>
        <button onclick="hideTodoForm()" class="btn-flex-item">${d.todo_cancel}</button>
      </div>
    </div>
  `;
  // Wire up contact search with event delegation (no inline handlers)
  const contactInput = document.getElementById('todo_contact_input');
  const dropdown = document.getElementById('todoContactDropdown');
  const idInput = document.getElementById('todo_contact_id');

  contactInput.addEventListener('input', () => {
    // Clear id if user modified the name
    const selected = (mineCache.contacts || []).find(c => c.id === idInput.value);
    if (selected && selected.name !== contactInput.value) idInput.value = '';
    filterTodoContacts(contactInput.value, dropdown);
  });
  contactInput.addEventListener('focus', () => filterTodoContacts(contactInput.value, dropdown));
  contactInput.addEventListener('blur', () => {
    setTimeout(() => { dropdown.style.display = 'none'; }, 150);
  });
  // Event delegation: click on dropdown items
  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('[data-cid]');
    if (!item) return;
    contactInput.value = item.dataset.cname;
    idInput.value = item.dataset.cid;
    dropdown.style.display = 'none';
  });
  document.getElementById('todo_task_input')?.focus();
}

export function filterTodoContacts(query, dropdown) {
  if (!dropdown) dropdown = document.getElementById('todoContactDropdown');
  if (!dropdown) return;
  const contacts = mineCache.contacts || [];
  const q = (query || '').trim().toLowerCase();
  let filtered = contacts;
  if (q) {
    filtered = contacts.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.aliases || []).some(a => (a || '').toLowerCase().includes(q)) ||
      (c.relation || '').toLowerCase().includes(q) ||
      (c.role || '').toLowerCase().includes(q)
    );
  }
  if (filtered.length === 0) {
    dropdown.innerHTML = `<div style="padding:8px 12px;color:var(--dimmer);font-size:.85em">${currentLang==='zh'?'未找到匹配联系人':'No matching contact'}</div>`;
  } else {
    dropdown.innerHTML = filtered.slice(0, 30).map(c => {
      const subInfo = [c.relation, c.role].filter(Boolean).join(' · ');
      return `<div data-cid="${escapeHtml(c.id)}" data-cname="${escapeHtml(c.name)}" style="padding:8px 12px;cursor:pointer;font-size:.9em;border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background=''">
        ${escapeHtml(c.name)}${subInfo ? ` <span style="color:var(--dimmer);font-size:.8em">${escapeHtml(subInfo)}</span>` : ''}
      </div>`;
    }).join('');
  }
  dropdown.style.display = 'block';
}

export function hideTodoForm() {
  const form = document.getElementById('todoForm');
  if (form) { form.style.display = 'none'; form.innerHTML = ''; }
}

export async function saveTodo(todoId) {
  const d = I18N[currentLang];
  const task = document.getElementById('todo_task_input')?.value?.trim();
  if (!task) return;
  const due = document.getElementById('todo_due_input')?.value || '';
  const priority = document.getElementById('todo_priority_input')?.value || 'P1';
  // Use hidden id field (set by search selection), not the text input
  let contact = document.getElementById('todo_contact_id')?.value || '';
  // Fallback: if no id but user typed a name, try exact match by name
  if (!contact) {
    const typedName = document.getElementById('todo_contact_input')?.value?.trim() || '';
    if (typedName) {
      const matched = (mineCache.contacts || []).find(c => c.name === typedName);
      if (matched) contact = matched.id;
      else {
        // No exact match — pass contact name, backend will auto-create
        contact = typedName;
      }
    }
  }

  const body = { task, due, priority, contact_id: contact };
  const location = document.getElementById('todo_location_input')?.value?.trim() || '';
  if (location) body.location = location;
  if (todoId) body.id = todoId; // Update existing

  try {
    const result = await mineApi('/data/todos', 'POST', body);
    hideTodoForm();
    // Show dedup hint if backend detected duplicate
    if (result.dedup) {
      addMsg('ai', currentLang === 'zh' ? '这条待办已存在，已更新截止日期' : 'This todo already exists, due date updated');
    }
    await loadTodosTab();
  } catch (e) {
    alert(e.message);
  }
}

export async function toggleTodoDone(todoId) {
  const d = I18N[currentLang];
  try {
    await mineApi('/data/todos/done', 'POST', { id: todoId });
    // Reload from API to ensure consistent state (avoid stale cache)
    await loadTodosTab();
  } catch (e) {
    alert(e.message);
  }
}

export async function postponeTodo(todoId, currentDue) {
  const zh = currentLang === 'zh';
  // Default: 1 week from today (or 1 week from current due if due is in future)
  const today = new Date();
  const dueDate = currentDue ? new Date(currentDue) : today;
  const baseDate = dueDate > today ? dueDate : today;
  const defaultDate = new Date(baseDate.getTime() + 7 * 86400000);
  const defaultStr = defaultDate.toISOString().slice(0, 10);

  const newDue = prompt(zh ? `推迟到哪天？\n（格式：YYYY-MM-DD，默认推迟一周）` : `Postpone to which date?\n(Format: YYYY-MM-DD, default: +1 week)`, defaultStr);
  if (!newDue) return;
  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDue)) {
    alert(zh ? '日期格式不正确，请用 YYYY-MM-DD' : 'Invalid date format, use YYYY-MM-DD');
    return;
  }
  try {
    await mineApi('/data/todos/postpone', 'POST', { id: todoId, due: newDue });
    await loadTodosTab();
  } catch (e) {
    alert(e.message);
  }
}

export async function cancelTodo(todoId) {
  const zh = currentLang === 'zh';
  if (!confirm(zh ? '确定取消此待办？（取消后不再显示在待办列表，但不会删除记录）' : 'Cancel this todo? (Removed from pending list, record kept)')) return;
  try {
    await mineApi('/data/todos/cancel', 'POST', { id: todoId });
    await loadTodosTab();
  } catch (e) {
    alert(e.message);
  }
}

export async function undoTodoDone(todoId) {
  try {
    // Reopen: set status back to pending
    await mineApi('/data/todos/reopen', 'POST', { id: todoId });
    await loadTodosTab();
  } catch (e) {
    alert(e.message);
  }
}

export async function deleteTodo(todoId) {
  const d = I18N[currentLang];
  if (!confirm(d.todo_confirm_delete)) return;
  try {
    const token = simulationMode ? `demo_${simulationData.id}:demo_secret` : await getClerkToken();
    if (!token) { alert('No auth token'); return; }
    const resp = await fetch(`${CLOUD_URL}/data/todos?id=${encodeURIComponent(todoId)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${resp.status}`);
    }
    // Reload from API to ensure consistent state
    await loadTodosTab();
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}
