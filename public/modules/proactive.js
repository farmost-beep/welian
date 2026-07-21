// Auto-generated from app.js — do not edit manually

import { CLOUD_URL, I18N, PDF_SANDBOX_URL, body, bridgeFrame, bridgeReady, currentLang, input, mineCache, onboardingExtractedContacts, setMineCache, setOnboardingExtractedContacts, simulationMode } from './state.js';
import { addMsg } from './chat.js';
import { escapeHtml, mineApi } from './misc.js';

// Normalize LLM report fields that might be string or object into display text
function formatReportField(val, zh) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    // Array → join items
    if (Array.isArray(val)) return val.map(v => typeof v === 'string' ? v : formatReportField(v, zh)).filter(Boolean).join('；');
    // Object → format key-value pairs
    const entries = Object.entries(val).filter(([, v]) => v != null && v !== '');
    if (entries.length === 0) return '';
    return entries.map(([k, v]) => {
      // Translate known keys
      const labelMap = {
        busiest_month: zh ? '最忙月份' : 'Busiest month',
        quietest_month: zh ? '最闲月份' : 'Quietest month',
        month: zh ? '月份' : 'Month',
        contact: zh ? '联系人' : 'Contact',
        count: zh ? '次数' : 'Count',
        description: zh ? '描述' : 'Description',
      };
      const label = labelMap[k] || k;
      return `${label}: ${v}`;
    }).join('；');
  }
  return String(val);
}
import { getClerkToken } from './auth.js';

export async function loadWeeklyTab() {
  const d = I18N[currentLang];
  const content = document.getElementById('mineContent');
  content.innerHTML = `<div class="mine-empty">${d.mine_weekly_loading_ai}</div>`;
  try {
    // Use structured weekly_report endpoint
    const reportRes = await mineApi('/ai/weekly_report', 'POST', {});
    const report = reportRes.report || {};
    const raw = reportRes.raw_data || {};

    // Week range
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const fmtDate = (dt) => `${dt.getMonth() + 1}月${dt.getDate()}日`;
    const weekRange = `${fmtDate(weekAgo)} - ${fmtDate(now)}`;

    let html = `<div class="mine-card"><div class="mine-card-title">📋 ${d.mine_weekly_title}</div><div class="mine-contact-sub">${weekRange}</div><div style="display:flex;gap:8px;margin-top:8px"><button onclick="shareWeeklyReport()" style="font-size:.75em;padding:4px 12px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit">${currentLang==='zh'?'📤 分享':'📤 Share'}</button><button onclick="exportReportPDF('weekly', window._weeklyReportData?.report || {})" style="font-size:.75em;padding:4px 12px;background:var(--surface);color:var(--accent);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:inherit">${currentLang==='zh'?'📄 PDF':'📄 PDF'}</button></div></div>`;

    // Greeting
    if (report.greeting) {
      html += `<div class="mine-card" style="font-size:.9em;line-height:1.7">${escapeHtml(report.greeting)}</div>`;
    }

    // Section 1: This week review
    html += `<div class="mine-section-title">${d.mine_weekly_review}</div>`;
    html += `<div class="mine-card">`;
    const review = report.review || raw.weekSummary || {};
    if (review.interactions !== undefined) {
      html += `<div style="display:flex;gap:16px;padding:4px 0;font-size:.85em">`;
      html += `<span style="color:var(--dim)">${review.interactions || 0} 次互动</span>`;
      html += `<span style="color:var(--dim)">${review.completed_todos || 0} 个完成</span>`;
      html += `<span style="color:var(--dim)">${review.new_todos || 0} 个待办</span>`;
      html += `</div>`;
      if (review.summary) html += `<div style="font-size:.88em;line-height:1.6;margin-top:4px">${escapeHtml(review.summary)}</div>`;
    } else {
      html += `<div class="mine-empty">${d.mine_empty_timeline}</div>`;
    }
    html += `</div>`;

    // Section 2: Upcoming dates
    const upcoming = report.upcoming_dates || raw.upcomingDates || [];
    if (upcoming.length > 0) {
      html += `<div class="mine-section-title">📅 ${currentLang==='zh'?'近期重要日期':'Upcoming dates'}</div>`;
      html += `<div class="mine-card">`;
      upcoming.forEach(dt => {
        const dateStr = (dt.date || '').slice(5) || dt.date;
        html += `<div class="mine-todo"><span class="mine-todo-dot">·</span><div><strong>${escapeHtml(dt.name)}</strong> — ${escapeHtml(dateStr)} ${escapeHtml(dt.label || '')}</div></div>`;
      });
      html += `</div>`;
    }

    // Section 3: Who to reach out
    html += `<div class="mine-section-title">${d.mine_weekly_suggest}</div>`;
    html += `<div class="mine-card">`;
    const suggestions = report.suggest_contact || [];
    if (suggestions.length > 0) {
      suggestions.forEach(s => {
        html += `<div class="mine-todo"><span class="mine-todo-dot">·</span><div><strong>${escapeHtml(s.name || '')}</strong> — ${escapeHtml(s.reason || '')}</div>`;
        if (s.topic) html += `<div style="font-size:.78em;color:var(--dimmer);padding-left:12px">→ ${escapeHtml(s.topic)}</div>`;
        html += `</div>`;
      });
    } else {
      html += `<div class="mine-empty">${d.mine_no_suggestions}</div>`;
    }
    html += `</div>`;

    // Section 4: Todo reminders
    const todoReminders = report.todo_reminders || raw.pendingTodos || [];
    if (todoReminders.length > 0) {
      html += `<div class="mine-section-title">${d.mine_weekly_todos}</div>`;
      html += `<div class="mine-card">`;
      todoReminders.slice(0, 10).forEach(t => {
        html += `<div class="mine-todo"><span class="mine-todo-dot">·</span><div>${escapeHtml(t.task || t.content || '')}${t.contact ? ` <span class="mine-contact-sub">— ${escapeHtml(t.contact)}</span>` : ''}</div></div>`;
      });
      html += `</div>`;
    }

    // Closing
    if (report.closing) {
      html += `<div class="mine-card" style="font-size:.85em;color:var(--dim);text-align:center">${escapeHtml(report.closing)}</div>`;
    }

    content.innerHTML = html;
    // Store report data for sharing
    window._weeklyReportData = { report, raw, weekRange };
  } catch (e) {
    content.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

export async function doShareText(text) {
  const zh = currentLang === 'zh';
  showShareModal(text, zh);
}

export function buildShareCard(title, subtitle, sections, zh) {
  const card = document.createElement('div');
  card.id = 'shareCardTemp';
  card.style.cssText = 'position:fixed;left:-9999px;top:0;width:375px;background:linear-gradient(180deg,#f8f6f1 0%,#fff 30%);padding:24px 20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB",sans-serif;color:#333;box-sizing:border-box';

  let sectionsHtml = '';
  for (const s of sections) {
    if (!s.items || s.items.length === 0) continue;
    sectionsHtml += `<div style="margin-top:18px">
      <div style="font-size:13px;font-weight:600;color:#c96442;margin-bottom:8px">${s.icon} ${s.title}</div>
      ${s.items.map(item => `<div style="font-size:12px;line-height:1.7;color:#555;padding:3px 0;padding-left:10px;border-left:2px solid #e8e0d6">${item}</div>`).join('')}
    </div>`;
  }

  card.innerHTML = `
    <div style="text-align:center;padding-bottom:16px;border-bottom:1px solid #e8e0d6">
      <div style="font-size:18px;font-weight:700;color:#333">${title}</div>
      <div style="font-size:12px;color:#999;margin-top:6px">${subtitle}</div>
    </div>
    ${sectionsHtml}
    <div style="margin-top:24px;text-align:center;padding-top:16px;border-top:1px solid #e8e0d6">
      <div style="display:inline-flex;align-items:center;gap:6px;background:#4A6741;color:#fff;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:600">Welian 小维</div>
      <div style="font-size:11px;color:#999;margin-top:8px">用 Welian 管理你的关系 · <span style="color:#4A6741;font-weight:600">welian.app</span></div>
    </div>
  `;
  return card;
}

export async function generateShareImage(cardEl) {
  document.body.appendChild(cardEl);
  try {
    const canvas = await html2canvas(cardEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#f8f6f1',
      width: 375,
      windowWidth: 375,
    });
    return canvas;
  } finally {
    cardEl.remove();
  }
}

export function canvasToBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

export async function exportReportPDF(type, report) {
  // Try local agent bridge first (if connected), then fallback to pdf-sandbox URL
  if (bridgeFrame && bridgeReady) {
    try {
      const result = await agentPDF(type, report);
      if (result && result.pdf) {
        // Decode base64 PDF and download
        const binary = atob(result.pdf);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename || `welian_${type}_${new Date().toISOString().slice(0,10)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
    } catch (e) {
      console.log('[PDF] Bridge route failed, trying pdf-sandbox URL:', e.message);
    }
  }

  // Fallback: direct fetch to pdf-sandbox URL (cloud mode)
  try {
    const resp = await fetch(`${PDF_SANDBOX_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, report }),
    });
    if (!resp.ok) throw new Error(`PDF service error: ${resp.status}`);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `welian_${type}_${new Date().toISOString().slice(0,10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    alert(currentLang === 'zh' ? `PDF 导出失败：${e.message}\n\n请确认本地 agent 已连接，或 pdf-sandbox 服务可用。` : `PDF export failed: ${e.message}`);
  }
}

export async function agentPDF(type, report) {
  if (!bridgeFrame || !bridgeReady) return null;
  return new Promise((resolve) => {
    const reqId = 'pdf_' + Date.now();
    let resolved = false;

    const handler = (e) => {
      const msg = e.data;
      if (!msg || msg.source !== 'welian-bridge') return;
      if (msg.type === 'ws-message' && msg.data && msg.data.id === reqId && !resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        if (msg.data.type === 'response' && msg.data.pdf) {
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
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        resolve(null);
      }
    }, 30000);

    bridgeFrame.contentWindow.postMessage({
      source: 'welian-parent',
      type: 'send',
      payload: { cmd: 'pdf', id: reqId, type, report }
    }, '*');
  });
}

export function showShareModal(text, zh, cardEl) {
  // Remove existing
  const existing = document.getElementById('shareModal');
  if (existing) existing.remove();

  const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
  const canShareFiles = navigator.share && navigator.canShare && typeof navigator.canShare === 'function';

  const modal = document.createElement('div');
  modal.id = 'shareModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:20px';

  const panel = document.createElement('div');
  panel.style.cssText = 'background:#fff;border-radius:16px;padding:24px 20px;max-width:340px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.2)';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:1em;font-weight:600;margin-bottom:16px;color:#333';
  title.textContent = zh ? '分享报告' : 'Share Report';
  panel.appendChild(title);

  // Image preview placeholder
  const previewWrap = document.createElement('div');
  previewWrap.style.cssText = 'margin-bottom:16px;max-height:200px;overflow:hidden;border-radius:8px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:80px';
  previewWrap.innerHTML = `<div style="color:#999;font-size:.8em">${zh ? '正在生成长图…' : 'Generating image…'}</div>`;
  panel.appendChild(previewWrap);

  // Buttons container
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center';
  panel.appendChild(btns);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = zh ? '关闭' : 'Close';
  closeBtn.style.cssText = 'width:100%;padding:10px;margin-top:12px;background:none;border:1px solid #ddd;border-radius:8px;cursor:pointer;font-size:.85em;color:#666;font-family:inherit';
  closeBtn.onclick = () => modal.remove();
  panel.appendChild(closeBtn);

  modal.appendChild(panel);
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  document.body.appendChild(modal);

  // Generate image
  let imageBlob = null;
  let imageCanvas = null;

  if (cardEl && typeof html2canvas !== 'undefined') {
    generateShareImage(cardEl).then(canvas => {
      imageCanvas = canvas;
      canvasToBlob(canvas).then(blob => {
        imageBlob = blob;
        const url = URL.createObjectURL(blob);
        previewWrap.innerHTML = `<img src="${url}" style="width:100%;display:block;border-radius:8px" />`;
        // Enable image-dependent buttons
        updateShareButtons();
      });
    }).catch(err => {
      previewWrap.innerHTML = `<div style="color:#e74c3c;font-size:.8em">${zh ? '图片生成失败' : 'Image generation failed'}</div>`;
      updateShareButtons();
    });
  } else {
    previewWrap.style.display = 'none';
    updateShareButtons();
  }

  function updateShareButtons() {
    btns.innerHTML = '';

    function addBtn(label, icon, color, onClick) {
      const btn = document.createElement('button');
      btn.innerHTML = `<span style="font-size:1.2em">${icon}</span><div style="font-size:.7em;margin-top:4px">${label}</div>`;
      btn.style.cssText = `width:72px;padding:12px 4px;background:#f8f6f1;border:none;border-radius:12px;cursor:pointer;font-family:inherit;color:${color};display:flex;flex-direction:column;align-items:center`;
      btn.onclick = onClick;
      btns.appendChild(btn);
    }

    // WeChat
    addBtn(zh ? '微信' : 'WeChat', '💬', '#07c160', async () => {
      if (isWeChat) {
        // In WeChat browser: copy image + guide to use top-right menu
        if (imageBlob) {
          try {
            const item = new ClipboardItem({ 'image/png': imageBlob });
            await navigator.clipboard.write([item]);
          } catch (e) {
            // Fallback: copy text
            try { await navigator.clipboard.writeText(text); } catch (e2) {}
          }
        } else {
          try { await navigator.clipboard.writeText(text); } catch (e) {}
        }
        showWeChatShareGuide(zh);
      } else if (canShareFiles && imageBlob) {
        // Non-WeChat with file share support: system share (WeChat appears as target)
        const file = new File([imageBlob], 'welian-report.png', { type: 'image/png' });
        try {
          await navigator.share({ files: [file], text });
        } catch (e) {
          // Fallback: download image
          downloadImage();
        }
      } else {
        // Desktop: download image, user can manually send to WeChat
        downloadImage();
      }
    });

    // Save image
    if (imageBlob) {
      addBtn(zh ? '保存图片' : 'Save', '📥', '#333', downloadImage);
    }

    // Copy text
    addBtn(zh ? '复制文字' : 'Copy Text', '📋', '#666', async () => {
      try {
        await navigator.clipboard.writeText(text);
        alert(zh ? '✓ 已复制' : '✓ Copied');
      } catch (e) {
        prompt(zh ? '复制以下文本：' : 'Copy:', text);
      }
    });

    // More (system share)
    if (navigator.share && !isWeChat) {
      addBtn(zh ? '更多' : 'More', '⋯', '#999', async () => {
        try {
          if (canShareFiles && imageBlob) {
            const file = new File([imageBlob], 'welian-report.png', { type: 'image/png' });
            await navigator.share({ files: [file], text });
          } else {
            await navigator.share({ title: zh ? '小维报告' : 'Welian Report', text });
          }
        } catch (e) {}
      });
    }
  }

  function downloadImage() {
    if (!imageBlob) return;
    const url = URL.createObjectURL(imageBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'welian-report.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function showWeChatShareGuide(zh) {
  const existing = document.getElementById('wechatShareGuide');
  if (existing) existing.remove();

  const guide = document.createElement('div');
  guide.id = 'wechatShareGuide';
  guide.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.85);display:flex;align-items:flex-start;justify-content:flex-end;padding:20px;cursor:pointer';
  guide.innerHTML = `
    <div style="color:#fff;text-align:right;padding-top:10px;max-width:280px">
      <div style="font-size:1.4em;margin-bottom:12px">👆</div>
      <div style="font-size:1em;font-weight:600;margin-bottom:8px">${zh ? '点击右上角 ··· 分享' : 'Tap ··· at top-right to share'}</div>
      <div style="font-size:.82em;opacity:.8;line-height:1.5">${zh ? '长图已复制，可选择「发送给朋友」「分享到朋友圈」或「发送到微信群」' : 'Image copied. Choose "Send to friend", "Share to Moments" or "Send to WeChat group"'}</div>
      <div style="font-size:.75em;opacity:.6;margin-top:10px">${zh ? '朋友看到后可通过 welian.app 体验' : 'Friends can try Welian at welian.app'}</div>
    </div>
  `;
  guide.onclick = () => guide.remove();
  document.body.appendChild(guide);
}

export function shareWeeklyReport() {
  const data = window._weeklyReportData;
  if (!data) return;
  const { report, raw, weekRange } = data;
  const zh = currentLang === 'zh';
  let text = `📋 ${zh ? '社交周报' : 'Weekly Report'}\n${weekRange}\n\n`;
  if (report.greeting) text += `${report.greeting}\n\n`;
  const review = report.review || raw.weekSummary || {};
  if (review.interactions !== undefined) {
    text += zh ? `【本周回顾】\n${review.interactions||0} 次互动 · ${review.completed_todos||0} 个完成 · ${review.new_todos||0} 个待办\n` : `【Review】\n${review.interactions||0} interactions · ${review.completed_todos||0} done · ${review.new_todos||0} pending\n`;
    if (review.summary) text += `${review.summary}\n`;
    text += '\n';
  }
  const suggestions = report.suggest_contact || [];
  if (suggestions.length > 0) {
    text += zh ? `【该联系谁】\n` : `【Reach out】\n`;
    suggestions.forEach(s => {
      text += `· ${s.name||''} — ${s.reason||''}`;
      if (s.topic) text += ` → ${s.topic}`;
      text += '\n';
    });
    text += '\n';
  }
  const upcoming = report.upcoming_dates || raw.upcomingDates || [];
  if (upcoming.length > 0) {
    text += zh ? `【近期重要日期】\n` : `【Upcoming dates】\n`;
    upcoming.forEach(dt => { text += `· ${dt.name} — ${(dt.date||'').slice(5)} ${dt.label||''}\n`; });
    text += '\n';
  }
  const todoReminders = report.todo_reminders || raw.pendingTodos || [];
  if (todoReminders.length > 0) {
    text += zh ? `【待办提醒】\n` : `【Todo reminders】\n`;
    todoReminders.slice(0,5).forEach(t => { text += `· ${t.task||t.content||''}${t.contact ? ' — '+t.contact : ''}\n`; });
    text += '\n';
  }
  if (report.closing) text += `${report.closing}\n`;
  text += `\n— Welian 小维`;

  // Build share card
  const sections = [];
  if (report.greeting) sections.push({ icon: '💬', title: '', items: [escapeHtml(report.greeting)] });
  if (review.interactions !== undefined) {
    sections.push({
      icon: '📊', title: zh ? '本周回顾' : 'Review',
      items: [`${review.interactions||0} ${zh?'次互动':'interactions'} · ${review.completed_todos||0} ${zh?'个完成':'done'} · ${review.new_todos||0} ${zh?'个待办':'pending'}`, ...(review.summary ? [escapeHtml(review.summary)] : [])]
    });
  }
  if (suggestions.length > 0) {
    sections.push({ icon: '🤝', title: zh ? '该联系谁' : 'Reach out', items: suggestions.map(s => `${escapeHtml(s.name||'')} — ${escapeHtml(s.reason||'')}${s.topic ? ' → '+escapeHtml(s.topic) : ''}`) });
  }
  if (upcoming.length > 0) {
    sections.push({ icon: '📅', title: zh ? '近期重要日期' : 'Upcoming dates', items: upcoming.map(dt => `${escapeHtml(dt.name)} — ${(dt.date||'').slice(5)} ${escapeHtml(dt.label||'')}`) });
  }
  if (todoReminders.length > 0) {
    sections.push({ icon: '✅', title: zh ? '待办提醒' : 'Todo reminders', items: todoReminders.slice(0,5).map(t => `${escapeHtml(t.task||t.content||'')}${t.contact ? ' — '+escapeHtml(t.contact) : ''}`) });
  }
  const card = buildShareCard(zh ? '📋 社交周报' : '📋 Weekly Report', weekRange, sections, zh);
  showShareModal(text, zh, card);
}

export async function loadSignalsTab() {
  const d = I18N[currentLang];
  const zh = currentLang === 'zh';
  const content = document.getElementById('mineContent');
  content.innerHTML = `<div class="mine-empty">${d.mine_loading}</div>`;

  // Load user domain preferences
  let userDomains = ['investment', 'ai', 'tech_finance'];
  try {
    const token = simulationMode ? `demo_sim:demo_secret` : await getClerkToken();
    if (token) {
      const dresp = await fetch(`${CLOUD_URL}/ai/signal_domains`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (dresp.ok) {
        const ddata = await dresp.json();
        if (ddata.domains) userDomains = ddata.domains;
      }
    }
  } catch (e) {}

  try {
    const resp = await mineApi('/ai/hn_signals', 'POST', {});
    const report = resp.report || {};
    const raw = resp.raw_data || {};
    const signals = report.signals || [];
    const contactSignals = report.contact_signals || [];
    const themes = report.themes || [];

    // Source badges
    const sourceCount = {};
    signals.forEach(s => { sourceCount[s.source || '网络'] = (sourceCount[s.source || '网络'] || 0) + 1; });
    const sourceBadges = Object.entries(sourceCount).map(([src, cnt]) =>
      `<span style="display:inline-block;background:var(--surface);border:1px solid var(--border);padding:1px 8px;border-radius:10px;font-size:.72em;margin:2px">${escapeHtml(src)} ${cnt}</span>`
    ).join('');

    // Domain selector
    const domainOptions = [
      { key: 'investment', label: zh ? '投资' : 'Investment', icon: '📈' },
      { key: 'ai', label: 'AI', icon: '🤖' },
      { key: 'tech_finance', label: zh ? '科技金融' : 'Tech Finance', icon: '💳' },
    ];
    const domainSelector = domainOptions.map(opt => {
      const checked = userDomains.includes(opt.key) ? 'checked' : '';
      return `<label style="display:inline-flex;align-items:center;gap:4px;margin:2px 8px;cursor:pointer;font-size:.85em">
        <input type="checkbox" ${checked} onchange="toggleSignalDomain('${opt.key}', this.checked)" style="cursor:pointer">
        ${opt.icon} ${opt.label}
      </label>`;
    }).join('');

    let html = `<div class="mine-card" style="text-align:center;margin-bottom:12px">
      <div style="font-size:1.2em;font-weight:500">📡 ${zh ? '今日信号' : "Today's Signals"}</div>
      <div style="font-size:.78em;color:var(--dim);margin-top:4px">${zh ? '结合你的关系网络，从多源信号筛选关键信息' : 'Personalized from multiple sources + contact company news'}</div>
      ${sourceBadges ? `<div style="margin-top:6px">${sourceBadges}</div>` : ''}
      <div style="margin-top:8px;display:flex;gap:8px;justify-content:center"><button onclick="shareSignalsReport()" style="font-size:.75em;padding:4px 12px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit">${zh ? '📤 分享' : '📤 Share'}</button><button onclick="exportReportPDF('signals', window._signalsReportData?.report || {})" style="font-size:.75em;padding:4px 12px;background:var(--surface);color:var(--accent);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:inherit">📄 PDF</button><button onclick="refreshSignals()" style="font-size:.75em;padding:4px 12px;background:var(--surface);color:var(--dim);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:inherit">🔄 ${zh ? '刷新' : 'Refresh'}</button></div>
    </div>`;

    // Domain selector
    html += `<div class="mine-card" style="margin-bottom:12px">
      <div style="font-size:.8em;color:var(--dim);margin-bottom:6px">${zh ? '关注领域（切换后刷新生效）' : 'Focus domains (refresh after toggle)'}</div>
      <div>${domainSelector}</div>
    </div>`;

    if (report.greeting) {
      html += `<div class="mine-card" style="font-size:.9em;line-height:1.7">${escapeHtml(report.greeting)}</div>`;
    }

    if (themes.length > 0) {
      html += `<div class="mine-section-title">${zh ? '🔥 热点主题' : '🔥 Hot Themes'}</div><div class="mine-card">`;
      themes.forEach(t => { html += `<span style="display:inline-block;background:var(--accent);color:#fff;padding:2px 10px;border-radius:12px;font-size:.78em;margin:2px">${escapeHtml(t)}</span>`; });
      html += `</div>`;
    }

    // Contact company signals
    if (contactSignals.length > 0) {
      html += `<div class="mine-section-title">👥 ${zh ? '联系人公司动态' : 'Contact Company News'}</div>`;
      contactSignals.forEach(cs => {
        html += `<div class="mine-card">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <span style="font-weight:500;font-size:.9em">${escapeHtml(cs.contact_name || '')}</span>
            <span style="font-size:.72em;color:var(--dim);background:var(--surface);padding:1px 6px;border-radius:8px">${escapeHtml(cs.company || '')}</span>
          </div>
          <div style="font-weight:500;font-size:.88em">${escapeHtml(cs.title || '')}</div>
          ${cs.snippet ? `<div style="font-size:.78em;color:var(--dim);margin-top:4px;line-height:1.5">${escapeHtml(cs.snippet)}</div>` : ''}
          ${cs.relevance ? `<div style="font-size:.78em;color:var(--accent);margin-top:4px">→ ${escapeHtml(cs.relevance)}</div>` : ''}
          ${cs.url ? `<a href="${escapeHtml(cs.url)}" target="_blank" style="font-size:.72em;color:var(--accent);margin-top:2px;display:inline-block">${zh ? '查看原文' : 'Source'}</a>` : ''}
        </div>`;
      });
    }

    if (signals.length > 0) {
      html += `<div class="mine-section-title">📊 ${zh ? '关键信号' : 'Key Signals'}</div>`;
      signals.forEach((s, i) => {
        const sourceTag = s.source ? `<span style="font-size:.65em;color:var(--dimmer);background:var(--surface);padding:1px 5px;border-radius:4px;margin-left:4px">${escapeHtml(s.source)}</span>` : '';
        // Related contacts — only show if LLM returned contacts with actual names
        const relatedContacts = (s.related_contacts || []).filter(rc => rc.name && rc.name.trim());
        const contactsHtml = relatedContacts.length > 0
          ? `<div style="margin-top:8px;padding:8px 10px;background:var(--surface);border-radius:8px;border-left:3px solid var(--accent)">
              <div style="font-size:.72em;color:var(--accent);font-weight:500;margin-bottom:4px">👥 ${zh ? '相关联系人' : 'Related Contacts'}</div>
              ${relatedContacts.map(rc => `<div style="font-size:.78em;margin-bottom:3px"><b style="color:var(--text)">${escapeHtml(rc.name)}</b> <span style="color:var(--dim)">— ${escapeHtml(rc.reason)}</span></div>`).join('')}
            </div>`
          : '';
        html += `<div class="mine-card">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div style="flex:1">
              <div style="font-weight:500;font-size:.92em">${escapeHtml(s.title || '')}${sourceTag}</div>
              <div style="font-size:.72em;color:var(--dimmer);margin-top:2px">${s.points || 0} ${zh?'分':'pts'}${s.url ? ` · <a href="${escapeHtml(s.url)}" target="_blank" style="color:var(--accent)">${zh?'原文':'Source'}</a>` : ''}</div>
            </div>
          </div>
          <div style="font-size:.82em;line-height:1.6;margin-top:8px;color:var(--dim)"><strong>${zh?'为什么重要':'Why'}：</strong>${escapeHtml(s.why || '')}</div>
          <div style="font-size:.82em;line-height:1.6;margin-top:4px;color:var(--accent)"><strong>→ ${zh?'建议行动':'Action'}：</strong>${escapeHtml(s.action || '')}</div>
          ${contactsHtml}
          ${(s.tags || []).length > 0 ? `<div style="margin-top:6px">${s.tags.map(t => `<span style="display:inline-block;background:var(--surface);border:1px solid var(--border);padding:1px 6px;border-radius:8px;font-size:.7em;margin:1px">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </div>`;
      });
    } else if (contactSignals.length === 0) {
      html += `<div class="mine-empty">${zh ? '今天没有强相关信号' : 'No strong signals today'}</div>`;
    }

    if (report.closing) {
      html += `<div class="mine-card" style="font-size:.85em;color:var(--dim);text-align:center">${escapeHtml(report.closing)}</div>`;
    }

    content.innerHTML = html;
    window._signalsReportData = { report, raw };
  } catch (e) {
    content.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

export async function refreshSignals() {
  const zh = currentLang === 'zh';
  const content = document.getElementById('mineContent');
  if (content) content.innerHTML = `<div class="mine-empty">${zh ? '🔄 正在重新生成信号…' : '🔄 Regenerating signals…'}</div>`;
  try {
    const resp = await mineApi('/ai/hn_signals', 'POST', { refresh: true });
    const report = resp.report || {};
    const raw = resp.raw_data || {};
    const signals = report.signals || [];
    const contactSignals = report.contact_signals || [];
    const themes = report.themes || [];
    const contactSearch = raw.contact_search || [];

    // Debug: show what we got
    console.log('[signals] refresh result:', { signals: signals.length, contactSignals: contactSignals.length, contactSearch: contactSearch.length, raw: JSON.stringify(raw).substring(0, 200) });

    const sourceCount = {};
    signals.forEach(s => { sourceCount[s.source || '网络'] = (sourceCount[s.source || '网络'] || 0) + 1; });
    const sourceBadges = Object.entries(sourceCount).map(([src, cnt]) =>
      `<span style="display:inline-block;background:var(--surface);border:1px solid var(--border);padding:1px 8px;border-radius:10px;font-size:.72em;margin:2px">${escapeHtml(src)} ${cnt}</span>`
    ).join('');

    let html = `<div class="mine-card" style="text-align:center;margin-bottom:12px">
      <div style="font-size:1.2em;font-weight:500">📡 ${zh ? '今日信号' : "Today's Signals"}</div>
      <div style="font-size:.78em;color:var(--dim);margin-top:4px">${zh ? '结合你的关系网络，从 13 源信号筛选：HN + 36氪 + 虎嗅 + 头条 + 微信 + 机器之心 + 华尔街见闻 + 投资界 + Product Hunt + TechCrunch + The Verge + ArXiv + V2EX + 联系人公司动态' : 'Personalized from 13 sources: HN + 36Kr + Huxiu + Toutiao + WeChat + JQZX + WallStreet + PE Daily + Product Hunt + TechCrunch + The Verge + ArXiv + V2EX + contact company news'}</div>
      ${sourceBadges ? `<div style="margin-top:6px">${sourceBadges}</div>` : ''}
      <div style="margin-top:8px;display:flex;gap:8px;justify-content:center"><button onclick="shareSignalsReport()" style="font-size:.75em;padding:4px 12px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit">${zh ? '📤 分享' : '📤 Share'}</button><button onclick="exportReportPDF('signals', window._signalsReportData?.report || {})" style="font-size:.75em;padding:4px 12px;background:var(--surface);color:var(--accent);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:inherit">📄 PDF</button><button onclick="refreshSignals()" style="font-size:.75em;padding:4px 12px;background:var(--surface);color:var(--dim);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:inherit">🔄 ${zh ? '刷新' : 'Refresh'}</button></div>
    </div>`;

    if (report.greeting) {
      html += `<div class="mine-card" style="font-size:.9em;line-height:1.7">${escapeHtml(report.greeting)}</div>`;
    }

    if (themes.length > 0) {
      html += `<div class="mine-section-title">${zh ? '🔥 热点主题' : '🔥 Hot Themes'}</div><div class="mine-card">`;
      themes.forEach(t => { html += `<span style="display:inline-block;background:var(--accent);color:#fff;padding:2px 10px;border-radius:12px;font-size:.78em;margin:2px">${escapeHtml(t)}</span>`; });
      html += `</div>`;
    }

    // Contact company signals
    if (contactSignals.length > 0) {
      html += `<div class="mine-section-title">👥 ${zh ? '联系人公司动态' : 'Contact Company News'}</div>`;
      contactSignals.forEach(cs => {
        html += `<div class="mine-card">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <span style="font-weight:500;font-size:.9em">${escapeHtml(cs.contact_name || '')}</span>
            <span style="font-size:.72em;color:var(--dim);background:var(--surface);padding:1px 6px;border-radius:8px">${escapeHtml(cs.company || '')}</span>
          </div>
          <div style="font-weight:500;font-size:.88em">${escapeHtml(cs.title || '')}</div>
          ${cs.snippet ? `<div style="font-size:.78em;color:var(--dim);margin-top:4px;line-height:1.5">${escapeHtml(cs.snippet)}</div>` : ''}
          ${cs.relevance ? `<div style="font-size:.78em;color:var(--accent);margin-top:4px">→ ${escapeHtml(cs.relevance)}</div>` : ''}
          ${cs.url ? `<a href="${escapeHtml(cs.url)}" target="_blank" style="font-size:.72em;color:var(--accent);margin-top:2px;display:inline-block">${zh ? '查看原文' : 'Source'}</a>` : ''}
        </div>`;
      });
    } else if (contactSearch.length === 0) {
      html += `<div class="mine-card" style="font-size:.78em;color:var(--dimmer);text-align:center">${zh ? '💡 暂无联系人公司动态——给联系人添加公司信息后会有更多动态' : '💡 No contact company news — add company info to contacts for more signals'}</div>`;
    }

    if (signals.length > 0) {
      html += `<div class="mine-section-title">📊 ${zh ? '关键信号' : 'Key Signals'}</div>`;
      signals.forEach((s, i) => {
        const sourceTag = s.source ? `<span style="font-size:.65em;color:var(--dimmer);background:var(--surface);padding:1px 5px;border-radius:4px;margin-left:4px">${escapeHtml(s.source)}</span>` : '';
        // Related contacts — only show if LLM returned contacts with actual names
        const relatedContacts = (s.related_contacts || []).filter(rc => rc.name && rc.name.trim());
        const contactsHtml = relatedContacts.length > 0
          ? `<div style="margin-top:8px;padding:8px 10px;background:var(--surface);border-radius:8px;border-left:3px solid var(--accent)">
              <div style="font-size:.72em;color:var(--accent);font-weight:500;margin-bottom:4px">👥 ${zh ? '相关联系人' : 'Related Contacts'}</div>
              ${relatedContacts.map(rc => `<div style="font-size:.78em;margin-bottom:3px"><b style="color:var(--text)">${escapeHtml(rc.name)}</b> <span style="color:var(--dim)">— ${escapeHtml(rc.reason)}</span></div>`).join('')}
            </div>`
          : '';
        html += `<div class="mine-card">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div style="flex:1">
              <div style="font-weight:500;font-size:.92em">${escapeHtml(s.title || '')}${sourceTag}</div>
              <div style="font-size:.72em;color:var(--dimmer);margin-top:2px">${s.points || 0} ${zh?'分':'pts'}${s.url ? ` · <a href="${escapeHtml(s.url)}" target="_blank" style="color:var(--accent)">${zh?'原文':'Source'}</a>` : ''}</div>
            </div>
          </div>
          <div style="font-size:.82em;line-height:1.6;margin-top:8px;color:var(--dim)"><strong>${zh?'为什么重要':'Why'}：</strong>${escapeHtml(s.why || '')}</div>
          <div style="font-size:.82em;line-height:1.6;margin-top:4px;color:var(--accent)"><strong>→ ${zh?'建议行动':'Action'}：</strong>${escapeHtml(s.action || '')}</div>
          ${contactsHtml}
          ${(s.tags || []).length > 0 ? `<div style="margin-top:6px">${s.tags.map(t => `<span style="display:inline-block;background:var(--surface);border:1px solid var(--border);padding:1px 6px;border-radius:8px;font-size:.7em;margin:1px">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </div>`;
      });
    } else if (contactSignals.length === 0) {
      html += `<div class="mine-empty">${zh ? '今天没有强相关信号' : 'No strong signals today'}</div>`;
    }

    if (report.closing) {
      html += `<div class="mine-card" style="font-size:.85em;color:var(--dim);text-align:center">${escapeHtml(report.closing)}</div>`;
    }

    content.innerHTML = html;
    window._signalsReportData = { report, raw };
  } catch (e) {
    content.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

export function shareSignalsReport() {
  const data = window._signalsReportData;
  if (!data) return;
  const { report } = data;
  const zh = currentLang === 'zh';
  // Track signal action (share/forward)
  trackSignalAction('share', (report.signals || []).map(s => s.title).join(', '));
  let text = `📡 ${zh ? '今日信号' : "Today's Signals"}\n\n`;
  if (report.greeting) text += `${report.greeting}\n\n`;
  if ((report.themes || []).length > 0) {
    text += zh ? `🔥 热点主题\n${report.themes.map(t => `· ${t}`).join('\n')}\n\n` : `🔥 Themes\n${report.themes.map(t => `· ${t}`).join('\n')}\n\n`;
  }
  const contactSignals = report.contact_signals || [];
  if (contactSignals.length > 0) {
    text += zh ? `👥 联系人公司动态\n` : `👥 Contact Company News\n`;
    contactSignals.forEach(cs => {
      text += `· ${cs.contact_name} (${cs.company}): ${cs.title}\n`;
      if (cs.relevance) text += `  → ${cs.relevance}\n`;
    });
    text += `\n`;
  }
  const signals = report.signals || [];
  if (signals.length > 0) {
    signals.forEach(s => {
      text += `📊 ${s.title || ''} (${s.points || 0}pts) [${s.source || ''}]\n`;
      text += `${zh ? '为什么重要' : 'Why'}：${s.why || ''}\n`;
      text += `→ ${zh ? '建议' : 'Action'}：${s.action || ''}\n`;
      if (s.url) text += `${s.url}\n`;
      text += `\n`;
    });
  }
  if (report.closing) text += `${report.closing}\n`;
  text += `\n— 用 Welian 管理你的关系：welian.app`;

  const sections = [];
  if (report.greeting) sections.push({ icon: '💬', title: '', items: [escapeHtml(report.greeting)] });
  if ((report.themes || []).length > 0) {
    sections.push({ icon: '🔥', title: zh ? '热点主题' : 'Themes', items: report.themes.map(t => escapeHtml(t)) });
  }
  if (contactSignals.length > 0) {
    sections.push({ icon: '👥', title: zh ? '联系人公司动态' : 'Contact Company News', items: contactSignals.map(cs => `${escapeHtml(cs.contact_name||'')} (${escapeHtml(cs.company||'')})\n${escapeHtml(cs.title||'')}\n→ ${escapeHtml(cs.relevance||'')}`) });
  }
  if (signals.length > 0) {
    sections.push({ icon: '📊', title: zh ? '关键信号' : 'Key Signals', items: signals.map(s => `${escapeHtml(s.title||'')} (${s.points||0}pts) [${escapeHtml(s.source||'')}]\n${escapeHtml(s.why||'')}\n→ ${escapeHtml(s.action||'')}`) });
  }
  const card = buildShareCard(zh ? '📡 今日信号' : '📡 Today\'s Signals', zh ? 'HN + 36氪 + 虎嗅 + 联系人动态' : 'HN + 36Kr + Huxiu + Contacts', sections, zh);
  showShareModal(text, zh, card);
}

export async function loadMonthlyTab() {
  const d = I18N[currentLang];
  const content = document.getElementById('mineContent');
  content.innerHTML = `<div class="mine-empty">${d.mine_loading}</div>`;
  try {
    // Use structured monthly_report endpoint + local data for dashboard
    const [reportRes, contactsRes, todosRes, timelineRes] = await Promise.all([
      mineApi('/ai/monthly_report', 'POST', {}).catch(() => null),
      mineApi('/data/contacts'),
      mineApi('/data/todos'),
      mineApi('/data/timeline'),
    ]);
    const report = (reportRes && reportRes.report) || {};
    const contacts = contactsRes.contacts || [];
    const todos = todosRes.todos || [];
    const timeline = timelineRes.timeline || [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Categorize contacts by nature (infer from relation if nature missing)
    const inferNature = (c) => {
      if (c.nature) return c.nature;
      const rel = (c.relation || '') + (c.sub_relation || '');
      if (/家|父|母|爸|妈|妻|夫|子|女|爷|奶|兄|弟|姐|妹|family|parent|spouse|child/i.test(rel)) return 'nurture';
      if (/同行|校友|客户|合作|同事|同学|partner|colleague|client/i.test(rel)) return 'leverage';
      return 'nurture'; // default to nurture (conservative)
    };
    const contactNature = c => inferNature(c);
    const nurtureContacts = contacts.filter(c => { const n = contactNature(c); return n === 'nurture' || n === 'dual'; });
    const leverageContacts = contacts.filter(c => { const n = contactNature(c); return n === 'leverage' || n === 'dual'; });

    // This month's timeline
    const monthTimeline = timeline.filter(t => new Date(t.date || 0) >= monthStart);
    const lastMonthTimeline = timeline.filter(t => { const d = new Date(t.date || 0); return d >= lastMonthStart && d < monthStart; });
    const monthTodosDone = todos.filter(t => t.done && t.done_at && new Date(t.done_at) >= monthStart);

    // 做到率（合作者维度）
    const monthTodos = todos.filter(t => {
      const d = t.created_at || t.date || 0;
      return new Date(d) >= lastMonthStart; // 本月+上月创建的待办
    });
    const doneRate = monthTodos.length > 0 ? Math.round(monthTodos.filter(t => t.done).length / monthTodos.length * 100) : 0;

    // 重新联系（隔 >90 天再次互动）
    const reconnects = [];
    monthTimeline.forEach(t => {
      const cid = t.contact;
      if (!cid) return;
      const allForContact = timeline.filter(x => x.contact === cid).sort((a,b) => new Date(a.date||0) - new Date(b.date||0));
      const idx = allForContact.findIndex(x => x === t || x.id === t.id);
      if (idx > 0) {
        const prev = allForContact[idx - 1];
        const gap = (new Date(t.date || 0) - new Date(prev.date || 0)) / 86400000;
        if (gap > 90) {
          const c = contacts.find(c => c.id === cid || c.name === cid);
          if (c && !reconnects.find(r => r.name === c.name)) {
            reconnects.push({ name: c.name, gap: Math.round(gap), nature: c.nature });
          }
        }
      }
    });

    // 趋势对比
    const trendArrow = monthTimeline.length > lastMonthTimeline.length ? '↑' : (monthTimeline.length < lastMonthTimeline.length ? '↓' : '→');
    const trendDiff = monthTimeline.length - lastMonthTimeline.length;

    // Group by role (using inferred nature)
    const friendInteractions = monthTimeline.filter(t => {
      const c = contacts.find(c => c.id === t.contact);
      if (!c) return false;
      const n = contactNature(c);
      return n === 'nurture' || n === 'dual';
    });
    const familyInteractions = monthTimeline.filter(t => {
      const c = contacts.find(c => c.id === t.contact);
      if (!c) return false;
      const n = contactNature(c);
      return n === 'nurture' && /父|母|爸|妈|妻|夫|子|女|家|爷|奶|兄|弟|姐|妹|family|parent|spouse|child/i.test((c.relation || '') + (c.sub_relation || ''));
    });
    const collaboratorInteractions = monthTimeline.filter(t => {
      const c = contacts.find(c => c.id === t.contact);
      if (!c) return false;
      const n = contactNature(c);
      return n === 'leverage' || n === 'dual';
    });

    // Upcoming important dates this month
    const upcomingDates = [];
    contacts.forEach(c => {
      (c.important_dates || []).forEach(dt => {
        if (dt.date) {
          const m = dt.date.match(/(\d{2})-(\d{2})/);
          if (m && parseInt(m[1]) === now.getMonth() + 1) {
            const day = parseInt(m[2]);
            if (day >= now.getDate()) {
              upcomingDates.push({ name: c.name, date: dt.date, label: dt.label, days: day - now.getDate() });
            }
          }
        }
      });
    });
    upcomingDates.sort((a, b) => a.days - b.days);

    const monthName = now.toLocaleDateString(currentLang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long' });
    const hasData = monthTimeline.length > 0 || monthTodosDone.length > 0;

    // AI insights from structured report
    let aiInsightHtml = '';
    if (report.greeting) {
      aiInsightHtml += `<div class="mine-card" style="font-size:.9em;line-height:1.7;margin-bottom:12px">${escapeHtml(report.greeting)}</div>`;
    }
    if (report.achievements && report.achievements.length > 0) {
      aiInsightHtml += `<div class="mine-section-title">✨ ${currentLang==='zh'?'本月亮点':'Highlights'}</div><div class="mine-card">`;
      report.achievements.forEach(a => { aiInsightHtml += `<div class="mine-todo"><span class="mine-todo-dot">·</span><div>${escapeHtml(a)}</div></div>`; });
      aiInsightHtml += `</div>`;
    }
    if (report.suggestions && report.suggestions.length > 0) {
      aiInsightHtml += `<div class="mine-section-title">💡 ${currentLang==='zh'?'下月建议':'Suggestions'}</div><div class="mine-card">`;
      report.suggestions.forEach(s => { aiInsightHtml += `<div class="mine-todo"><span class="mine-todo-dot">·</span><div>${escapeHtml(s)}</div></div>`; });
      aiInsightHtml += `</div>`;
    }

    content.innerHTML = `
      <div class="mine-card" style="text-align:center;margin-bottom:12px">
        <div style="font-size:1.2em;font-weight:500">${currentLang==='zh'?'📊 '+monthName+'的你':'📊 '+monthName}</div>
        <div style="font-size:.78em;color:var(--dim);margin-top:4px">${monthTimeline.length} ${currentLang==='zh'?'次互动':'interactions'} ${trendArrow} ${trendDiff>0?'+':''}${trendDiff} ${currentLang==='zh'?'vs 上月':'vs last month'}</div>
        <div style="margin-top:8px;display:flex;gap:8px"><button onclick="shareMonthlyReport()" style="font-size:.75em;padding:4px 12px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit">${currentLang==='zh'?'📤 分享':'📤 Share'}</button><button onclick="exportMonthlyPDF()" style="font-size:.75em;padding:4px 12px;background:var(--surface);color:var(--accent);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:inherit">📄 PDF</button></div>
      </div>
      ${aiInsightHtml}
      ${hasData ? `
        <div class="mine-section-title">🌱 ${d.monthly_friend}</div>
        <div class="mine-card">
          <div class="mine-contact-sub">${friendInteractions.length} ${d.monthly_interactions}</div>
          ${friendInteractions.slice(0,3).map(t => {
            const c = contacts.find(c => c.id === t.contact);
            return `<div class="mine-todo"><span class="mine-todo-dot">·</span><div>${escapeHtml(c?.name||'')}：${escapeHtml((t.summary||t.action||'').substring(0,50))}</div></div>`;
          }).join('')}
          ${friendInteractions.length === 0 ? `<div class="mine-empty">${d.monthly_no_data}</div>` : ''}
        </div>
        <div class="mine-section-title">🏡 ${d.monthly_family}</div>
        <div class="mine-card">
          <div class="mine-contact-sub">${familyInteractions.length} ${d.monthly_interactions}</div>
          ${familyInteractions.slice(0,3).map(t => {
            const c = contacts.find(c => c.id === t.contact);
            return `<div class="mine-todo"><span class="mine-todo-dot">·</span><div>${escapeHtml(c?.name||'')}：${escapeHtml((t.summary||t.action||'').substring(0,50))}</div></div>`;
          }).join('')}
          ${familyInteractions.length === 0 ? `<div class="mine-empty">${d.monthly_no_data}</div>` : ''}
        </div>
        <div class="mine-section-title">🤝 ${d.monthly_collaborator}</div>
        <div class="mine-card">
          <div class="mine-contact-sub">${collaboratorInteractions.length} ${d.monthly_interactions} · ${d.monthly_todos_done} ${monthTodosDone.length} · ${currentLang==='zh'?'做到率':'done rate'} ${doneRate}%</div>
          ${collaboratorInteractions.slice(0,3).map(t => {
            const c = contacts.find(c => c.id === t.contact);
            return `<div class="mine-todo"><span class="mine-todo-dot">·</span><div>${escapeHtml(c?.name||'')}：${escapeHtml((t.summary||t.action||'').substring(0,50))}</div></div>`;
          }).join('')}
          ${collaboratorInteractions.length === 0 ? `<div class="mine-empty">${d.monthly_no_data}</div>` : ''}
        </div>
      ` : `<div class="mine-empty">${d.monthly_no_data}</div>`}
      ${reconnects.length > 0 ? `
        <div class="mine-section-title">🔄 ${currentLang==='zh'?'重新联系':'Reconnections'}</div>
        <div class="mine-card">
          ${reconnects.slice(0,5).map(r => `<div class="mine-todo"><span class="mine-todo-dot">·</span><div><strong>${escapeHtml(r.name)}</strong> — ${currentLang==='zh'?'隔了 '+r.gap+' 天再次联系':'reconnected after '+r.gap+' days'}</div></div>`).join('')}
        </div>
      ` : ''}
      ${upcomingDates.length > 0 ? `
        <div class="mine-section-title">📅 ${d.monthly_upcoming}</div>
        <div class="mine-card">
          ${upcomingDates.slice(0,5).map(u => `<div class="mine-todo"><span class="mine-todo-dot">·</span><div><strong>${escapeHtml(u.name)}</strong> — ${escapeHtml(u.label)} (${u.date})</div></div>`).join('')}
        </div>
      ` : ''}
      ${report.closing ? `<div class="mine-card" style="font-size:.85em;color:var(--dim);text-align:center">${escapeHtml(report.closing)}</div>` : ''}
    `;
    // Store report data for sharing
    window._monthlyReportData = { report, monthName, monthTimeline, friendInteractions, familyInteractions, collaboratorInteractions, contacts, doneRate, monthTodosDone, reconnects, upcomingDates, trendDiff, trendArrow };
  } catch (e) {
    content.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

export async function loadAnnualTab() {
  const d = I18N[currentLang];
  const zh = currentLang === 'zh';
  const content = document.getElementById('mineContent');
  content.innerHTML = `<div class="mine-empty">${d.mine_loading}</div>`;
  try {
    const resp = await mineApi('/ai/annual_report', 'POST', {});
    const report = resp.report || {};
    const year = report.year || new Date().getFullYear();

    let html = `<div class="mine-card" style="text-align:center;margin-bottom:12px">
      <div style="font-size:1.4em;font-weight:600">🏆 ${year}${zh ? '年度关系报告' : ' Annual Report'}</div>
      <div style="font-size:.78em;color:var(--dim);margin-top:4px">${zh ? '回顾这一年的关系经营' : 'A year in review'}</div>
      <div style="margin-top:8px;display:flex;gap:8px;justify-content:center">
        <button onclick="exportAnnualPDF()" style="font-size:.75em;padding:4px 12px;background:var(--surface);color:var(--accent);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:inherit">📄 PDF</button>
      </div>
    </div>`;

    if (report.greeting) {
      html += `<div class="mine-card" style="font-size:.95em;line-height:1.8">${escapeHtml(report.greeting)}</div>`;
    }

    if (report.review) {
      html += `<div class="mine-card"><div class="mine-card-title">📝 ${zh ? '年度回顾' : 'Review'}</div><div style="line-height:1.7">${escapeHtml(report.review)}</div></div>`;
    }

    // Key numbers
    const keyNumbers = report.key_numbers || [];
    const rawStats = report.raw_stats || {};
    if (keyNumbers.length > 0 || rawStats.total_contacts !== undefined) {
      html += `<div class="mine-card"><div class="mine-card-title">📊 ${zh ? '关键数字' : 'Key Numbers'}</div>`;
      if (keyNumbers.length > 0) {
        for (const kn of keyNumbers) {
          html += `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--dim)">${escapeHtml(kn.label)}</span><b>${escapeHtml(String(kn.value))}</b></div>`;
        }
      } else if (rawStats.total_contacts !== undefined) {
        html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">`;
        html += `<div style="text-align:center;padding:12px;background:var(--surface);border-radius:8px"><div style="font-size:1.5em;font-weight:600;color:var(--accent)">${rawStats.total_interactions || 0}</div><div style="font-size:.75em;color:var(--dim)">${zh ? '总互动' : 'Interactions'}</div></div>`;
        html += `<div style="text-align:center;padding:12px;background:var(--surface);border-radius:8px"><div style="font-size:1.5em;font-weight:600;color:var(--accent)">${rawStats.total_contacts || 0}</div><div style="font-size:.75em;color:var(--dim)">${zh ? '关系数' : 'Contacts'}</div></div>`;
        html += `<div style="text-align:center;padding:12px;background:var(--surface);border-radius:8px"><div style="font-size:1.5em;font-weight:600;color:var(--accent)">${rawStats.new_contacts_this_year || 0}</div><div style="font-size:.75em;color:var(--dim)">${zh ? '新增' : 'New'}</div></div>`;
        html += `<div style="text-align:center;padding:12px;background:var(--surface);border-radius:8px"><div style="font-size:1.5em;font-weight:600;color:var(--accent)">${rawStats.completion_rate || 0}%</div><div style="font-size:.75em;color:var(--dim)">${zh ? '完成率' : 'Done Rate'}</div></div>`;
        html += `</div>`;
      }
      html += `</div>`;
    }

    // Health
    const health = report.health || {};
    if (health.active !== undefined || report.raw_stats) {
      const h = health.active !== undefined ? health : { active: rawStats.active_relationships, cooling: rawStats.cooling_relationships, dormant: rawStats.dormant_relationships };
      html += `<div class="mine-card"><div class="mine-card-title">💚 ${zh ? '关系健康度' : 'Health'}</div>`;
      html += `<div style="display:flex;gap:8px;flex-wrap:wrap">`;
      html += `<span style="background:#4A674120;color:#4A6741;padding:4px 12px;border-radius:12px;font-size:.85em">${zh ? '活跃' : 'Active'} ${h.active || 0}</span>`;
      html += `<span style="background:#e74c3c20;color:#e74c3c;padding:4px 12px;border-radius:12px;font-size:.85em">${zh ? '冷却' : 'Cooling'} ${h.cooling || 0}</span>`;
      html += `<span style="background:#95a5a620;color:#95a5a6;padding:4px 12px;border-radius:12px;font-size:.85em">${zh ? '休眠' : 'Dormant'} ${h.dormant || 0}</span>`;
      html += `</div></div>`;
    }

    // Monthly distribution chart
    const monthly = report.monthly_distribution || [];
    if (monthly.length === 12) {
      const maxVal = Math.max(...monthly, 1);
      html += `<div class="mine-card"><div class="mine-card-title">📈 ${zh ? '月度互动分布' : 'Monthly Distribution'}</div>`;
      html += `<div style="display:flex;align-items:flex-end;gap:3px;height:80px;margin-top:8px">`;
      monthly.forEach((v, i) => {
        const h = Math.max(2, (v / maxVal) * 70);
        html += `<div style="flex:1;text-align:center"><div style="background:var(--accent);height:${h}px;border-radius:3px 3px 0 0;transition:height .3s"></div><div style="font-size:.6em;color:var(--dim);margin-top:2px">${i + 1}</div></div>`;
      });
      html += `</div></div>`;
    }

    // Top contacts
    const topContacts = report.top_contacts || [];
    if (topContacts.length > 0) {
      html += `<div class="mine-card"><div class="mine-card-title">🌟 ${zh ? '互动最多的联系人' : 'Top Contacts'}</div>`;
      topContacts.slice(0, 10).forEach((c, i) => {
        html += `<div style="display:flex;justify-content:space-between;padding:4px 0"><span><b style="color:var(--accent)">${i + 1}.</b> ${escapeHtml(c.name)}</span><span style="color:var(--dim)">${c.count} ${zh ? '次' : 'times'}</span></div>`;
      });
      html += `</div>`;
    }

    // Highlights — LLM may return string or object, normalize to string
    const highlightsText = formatReportField(report.highlights, zh);
    if (highlightsText) {
      html += `<div class="mine-card"><div class="mine-card-title">✨ ${zh ? '高光时刻' : 'Highlights'}</div><div style="line-height:1.7">${escapeHtml(highlightsText)}</div></div>`;
    }

    // Growth — same normalization
    const growthText = formatReportField(report.growth, zh);
    if (growthText) {
      html += `<div class="mine-card"><div class="mine-card-title">🧬 ${zh ? '成长轨迹' : 'Growth'}</div><div style="line-height:1.7">${escapeHtml(growthText)}</div></div>`;
    }

    // Suggestions
    const suggestions = report.suggestions || [];
    if (suggestions.length > 0) {
      html += `<div class="mine-card"><div class="mine-card-title">🎯 ${zh ? '明年建议' : 'Next Year Suggestions'}</div>`;
      suggestions.forEach(s => {
        html += `<div style="padding:6px 0;border-bottom:1px solid var(--border)">· ${escapeHtml(s)}</div>`;
      });
      html += `</div>`;
    }

    content.innerHTML = html;
    window._annualReportData = { report, year };
  } catch (e) {
    content.innerHTML = `<div class="mine-empty">${e.message}</div>`;
  }
}

export function exportAnnualPDF() {
  const data = window._annualReportData;
  if (!data) return;
  const { report, year } = data;
  const zh = currentLang === 'zh';
  const sections = [];
  if (report.greeting) sections.push({ icon: '🏆', title: `${year}${zh ? '年度报告' : ' Annual Report'}`, items: [escapeHtml(report.greeting)] });
  if (report.review) sections.push({ icon: '📝', title: zh ? '年度回顾' : 'Review', items: [escapeHtml(report.review)] });
  const kn = report.key_numbers || [];
  if (kn.length > 0) sections.push({ icon: '📊', title: zh ? '关键数字' : 'Key Numbers', items: kn.map(k => `${escapeHtml(k.label)}: ${escapeHtml(String(k.value))}`) });
  if (report.highlights) sections.push({ icon: '✨', title: zh ? '高光时刻' : 'Highlights', items: [escapeHtml(report.highlights)] });
  if (report.growth) sections.push({ icon: '🧬', title: zh ? '成长轨迹' : 'Growth', items: [escapeHtml(report.growth)] });
  const sugg = report.suggestions || [];
  if (sugg.length > 0) sections.push({ icon: '🎯', title: zh ? '明年建议' : 'Suggestions', items: sugg.map(s => escapeHtml(s)) });
  const card = buildShareCard(`🏆 ${year}${zh ? '年度关系报告' : ' Annual Report'}`, '', sections, zh);
  showShareModal('', zh, card);
}

export function exportMonthlyPDF() {
  const data = window._monthlyReportData;
  if (!data) return;
  const { report, monthName, monthTimeline, friendInteractions, familyInteractions, collaboratorInteractions, contacts, doneRate, reconnects } = data;
  // Build PDF-friendly structure
  const pdfReport = {
    greeting: report.greeting || `${monthName} 关系复盘`,
    overview: {
      total_interactions: monthTimeline.length,
      unique_contacts: new Set(monthTimeline.map(t => t.contact || t.name)).size,
      new_todos: (report.new_todos) || 0,
      summary: report.summary || '',
    },
    group_breakdown: [
      { label: '朋友', interactions: friendInteractions.length, contacts: new Set(friendInteractions.map(t => t.contact)).size },
      { label: '家人', interactions: familyInteractions.length, contacts: new Set(familyInteractions.map(t => t.contact)).size },
      { label: '合作者', interactions: collaboratorInteractions.length, contacts: new Set(collaboratorInteractions.map(t => t.contact)).size },
    ].filter(g => g.interactions > 0),
    key_contacts: (report.key_contacts || []).slice(0, 10),
    patterns: report.patterns || [],
    suggestions: report.suggestions || [],
    closing: report.closing || '',
  };
  exportReportPDF('monthly', pdfReport);
}

export function shareMonthlyReport() {
  const data = window._monthlyReportData;
  if (!data) return;
  const { report, monthName, monthTimeline, friendInteractions, familyInteractions, collaboratorInteractions, contacts, doneRate, monthTodosDone, reconnects, upcomingDates, trendDiff, trendArrow } = data;
  const zh = currentLang === 'zh';
  let text = `📊 ${zh ? monthName + '的你' : monthName}\n${monthTimeline.length} ${zh?'次互动':'interactions'} ${trendArrow} ${trendDiff>0?'+':''}${trendDiff} ${zh?'vs 上月':'vs last month'}\n\n`;
  if (report.greeting) text += `${report.greeting}\n\n`;
  if (report.achievements && report.achievements.length > 0) {
    text += zh ? `✨ 本月亮点\n` : `✨ Highlights\n`;
    report.achievements.forEach(a => { text += `· ${a}\n`; });
    text += '\n';
  }
  if (friendInteractions.length > 0) {
    text += zh ? `🌱 朋友 ${friendInteractions.length} 次互动\n` : `🌱 Friends ${friendInteractions.length} interactions\n`;
    friendInteractions.slice(0,3).forEach(t => {
      const c = contacts.find(c => c.id === t.contact);
      text += `· ${c?.name||''}：${(t.summary||t.action||'').substring(0,50)}\n`;
    });
    text += '\n';
  }
  if (collaboratorInteractions.length > 0) {
    text += zh ? `🤝 合作者 ${collaboratorInteractions.length} 次互动 · 完成 ${monthTodosDone.length} · 做到率 ${doneRate}%\n` : `🤝 Collaborators ${collaboratorInteractions.length} interactions · ${monthTodosDone.length} done · ${doneRate}%\n`;
    collaboratorInteractions.slice(0,3).forEach(t => {
      const c = contacts.find(c => c.id === t.contact);
      text += `· ${c?.name||''}：${(t.summary||t.action||'').substring(0,50)}\n`;
    });
    text += '\n';
  }
  if (reconnects.length > 0) {
    text += zh ? `🔄 重新联系\n` : `🔄 Reconnections\n`;
    reconnects.slice(0,5).forEach(r => { text += `· ${r.name} — ${zh?'隔了 '+r.gap+' 天':'after '+r.gap+' days'}\n`; });
    text += '\n';
  }
  if (upcomingDates.length > 0) {
    text += zh ? `📅 近期重要日期\n` : `📅 Upcoming dates\n`;
    upcomingDates.slice(0,5).forEach(u => { text += `· ${u.name} — ${u.label} (${u.date})\n`; });
    text += '\n';
  }
  if (report.suggestions && report.suggestions.length > 0) {
    text += zh ? `💡 下月建议\n` : `💡 Suggestions\n`;
    report.suggestions.forEach(s => { text += `· ${s}\n`; });
    text += '\n';
  }
  if (report.closing) text += `${report.closing}\n`;
  text += `\n— Welian 小维`;

  // Build share card
  const sections = [];
  if (report.greeting) sections.push({ icon: '💬', title: '', items: [escapeHtml(report.greeting)] });
  if (report.achievements && report.achievements.length > 0) {
    sections.push({ icon: '✨', title: zh ? '本月亮点' : 'Highlights', items: report.achievements.map(a => escapeHtml(a)) });
  }
  if (friendInteractions.length > 0) {
    sections.push({ icon: '🌱', title: zh ? `朋友 ${friendInteractions.length} 次互动` : `Friends ${friendInteractions.length} interactions`, items: friendInteractions.slice(0,3).map(t => { const c = contacts.find(c => c.id === t.contact); return `${escapeHtml(c?.name||'')}：${escapeHtml((t.summary||t.action||'').substring(0,50))}`; }) });
  }
  if (collaboratorInteractions.length > 0) {
    sections.push({ icon: '🤝', title: zh ? `合作者 ${collaboratorInteractions.length} 次 · 完成 ${monthTodosDone.length} · 做到率 ${doneRate}%` : `Collaborators ${collaboratorInteractions.length} · ${monthTodosDone.length} done · ${doneRate}%`, items: collaboratorInteractions.slice(0,3).map(t => { const c = contacts.find(c => c.id === t.contact); return `${escapeHtml(c?.name||'')}：${escapeHtml((t.summary||t.action||'').substring(0,50))}`; }) });
  }
  if (reconnects.length > 0) {
    sections.push({ icon: '🔄', title: zh ? '重新联系' : 'Reconnections', items: reconnects.slice(0,5).map(r => `${escapeHtml(r.name)} — ${zh?'隔了 '+r.gap+' 天':'after '+r.gap+' days'}`) });
  }
  if (upcomingDates.length > 0) {
    sections.push({ icon: '📅', title: zh ? '近期重要日期' : 'Upcoming dates', items: upcomingDates.slice(0,5).map(u => `${escapeHtml(u.name)} — ${escapeHtml(u.label)} (${u.date})`) });
  }
  if (report.suggestions && report.suggestions.length > 0) {
    sections.push({ icon: '💡', title: zh ? '下月建议' : 'Suggestions', items: report.suggestions.map(s => escapeHtml(s)) });
  }
  const subtitle = `${monthTimeline.length} ${zh?'次互动':'interactions'} ${trendArrow} ${trendDiff>0?'+':''}${trendDiff} ${zh?'vs 上月':'vs last month'}`;
  const card = buildShareCard(zh ? `📊 ${monthName}的你` : `📊 ${monthName}`, subtitle, sections, zh);
  showShareModal(text, zh, card);
}

export async function checkOnboardingNeeded() {
  if (localStorage.getItem('welian_onboarding_done') === '1') return;
  if (simulationMode) return;
  try {
    const token = await getClerkToken();
    if (!token) return;
    const resp = await fetch(`${CLOUD_URL}/data/contacts`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const contacts = data.contacts || [];
    if (contacts.length > 0) {
      localStorage.setItem('welian_onboarding_done', '1');
      return;
    }
    startOnboarding();
  } catch (e) {
    console.log('Onboarding check failed:', e.message);
  }
}

export function startOnboarding() {
  setOnboardingExtractedContacts([]);
  renderOnboardingChat();
  document.getElementById('onboardingOverlay').classList.add('show');
  document.getElementById('onboardingModal').classList.add('show');
}

export function closeOnboarding() {
  document.getElementById('onboardingOverlay').classList.remove('show');
  document.getElementById('onboardingModal').classList.remove('show');
}

export function renderOnboardingChat() {
  const body = document.getElementById('onboardingBody');
  const zh = currentLang === 'zh';
  body.innerHTML = `
    <div style="padding:8px 0">
      <div id="onboardingChatLog" style="min-height:120px;margin-bottom:16px">
        <div class="mine-card" style="padding:14px;font-size:.9em;line-height:1.7;background:var(--accent-bg);border:none">
          ${zh
            ? '你好！我是小维 🌱<br><br>最近和谁聊过？随便说一句就行——<br>比如"昨天和老王吃了饭，前天跟张总开了个会"'
            : 'Hi! I\'m Welian 🌱<br><br>Who have you talked to recently? Just say it naturally —<br>e.g. "Had lunch with John yesterday, met with Sarah about the project"'}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-end">
        <textarea id="onboardingInput" placeholder="${zh ? '说一句…' : 'Say something…'}"
          style="flex:1;padding:10px;border:1px solid var(--border);border-radius:10px;font-size:.9em;background:var(--surface);color:var(--text);box-sizing:border-box;resize:none;font-family:inherit;min-height:44px;max-height:120px"
          rows="1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submitOnboardingChat()}"></textarea>
        <button onclick="submitOnboardingChat()" style="padding:10px 16px;background:var(--accent);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:inherit;font-size:.9em;white-space:nowrap">${zh ? '发送' : 'Send'}</button>
      </div>
      <div id="onboardingResult" style="margin-top:16px"></div>
    </div>
  `;
  setTimeout(() => document.getElementById('onboardingInput')?.focus(), 100);
}

export async function submitOnboardingChat() {
  const input = document.getElementById('onboardingInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const zh = currentLang === 'zh';
  const log = document.getElementById('onboardingChatLog');
  // Show user message
  log.innerHTML += `<div class="mine-card" style="padding:10px 14px;font-size:.9em;margin-top:8px;text-align:right">${escapeHtml(text)}</div>`;
  input.value = '';
  input.disabled = true;

  const resultEl = document.getElementById('onboardingResult');
  resultEl.innerHTML = `<div style="color:var(--dim);padding:8px;font-size:.85em">${zh ? '小维正在提取联系人…' : 'Extracting contacts…'}</div>`;

  try {
    const token = await getClerkToken();
    // Use extract_intent to parse the user's natural text and auto-create contacts
    const resp = await fetch(`${CLOUD_URL}/ai/extract_intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ text, session_token: token, onboarding: true }),
    });
    const data = await resp.json();

    // Collect created contacts from action results
    const created = (data.action_results || []).filter(r => r.type === 'add_contact' && r.ok);
    const timelineCreated = (data.action_results || []).filter(r => r.type === 'add_timeline' && r.ok);
    setOnboardingExtractedContacts(created.map(r => r.name));

    // Fetch actual contacts to confirm
    const contactsResp = await fetch(`${CLOUD_URL}/data/contacts`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const contactsData = await contactsResp.json();
    const allContacts = contactsData.contacts || [];
    const names = allContacts.map(c => c.name);

    if (names.length > 0) {
      log.innerHTML += `<div class="mine-card" style="padding:14px;font-size:.9em;margin-top:8px;line-height:1.7;background:var(--accent-bg);border:none">
        ${zh ? `✅ 我从你说的里面找到了 <strong>${names.length}</strong> 个人：` : `✅ I found <strong>${names.length}</strong> people from what you said:`}<br>
        ${names.map(n => `<span style="display:inline-block;margin:2px 4px;padding:2px 10px;background:var(--surface);border-radius:12px;font-size:.85em">${escapeHtml(n)}</span>`).join('')}
      </div>`;
      resultEl.innerHTML = `
        <div style="padding:12px 0">
          <p style="font-size:.85em;color:var(--dim);margin-bottom:12px">${zh ? '想再加几个？继续说就行。不然就可以开始了 👇' : 'Want to add more? Just keep talking. Otherwise, let\'s get started 👇'}</p>
          <div style="display:flex;gap:8px">
            <button onclick="renderOnboardingChat()" style="flex:1;padding:10px;background:none;border:1px solid var(--border);border-radius:10px;color:var(--dim);cursor:pointer;font-family:inherit;font-size:.9em">${zh ? '继续说' : 'Say more'}</button>
            <button onclick="finishOnboarding()" style="flex:1;padding:10px;background:var(--accent);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:inherit;font-size:.9em">${zh ? '开始使用 →' : 'Get started →'}</button>
          </div>
        </div>
      `;
    } else {
      log.innerHTML += `<div class="mine-card" style="padding:14px;font-size:.9em;margin-top:8px;line-height:1.7;background:var(--accent-bg);border:none">
        ${zh ? '没提取到人名，再试试？比如"昨天和老王吃了饭"' : 'Couldn\'t find any names. Try again? e.g. "Had lunch with John yesterday"'}
      </div>`;
      resultEl.innerHTML = '';
      input.disabled = false;
      input.focus();
    }
  } catch (e) {
    resultEl.innerHTML = `<div style="color:var(--dim);padding:8px;font-size:.85em">${zh ? '出错了：' : 'Error: '}${e.message}</div>`;
    input.disabled = false;
  }
}

export async function finishOnboarding() {
  localStorage.setItem('welian_onboarding_done', '1');
  closeOnboarding();
  setMineCache({});
  const zh = currentLang === 'zh';
  if (onboardingExtractedContacts.length > 0) {
    addMsg('ai', zh
      ? `欢迎！我记下了 ${onboardingExtractedContacts.length} 个人：${onboardingExtractedContacts.map(escapeHtml).join('、')}。让我看看这周该联系谁… 🌱`
      : `Welcome! I saved ${onboardingExtractedContacts.length} people: ${onboardingExtractedContacts.map(escapeHtml).join(', ')}. Let me check who you should reach out to this week… 🌱`);
    // P0-3: Immediate value delivery — call advise engine right after onboarding
    try {
      const token = await getClerkToken();
      const resp = await fetch(`${CLOUD_URL}/ai/advise_cloud`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ session_token: token }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const advise = data.result || '';
        if (advise) {
          addMsg('ai', advise);
        }
      }
    } catch (e) {
      console.log('[onboarding] first advise failed:', e.message);
    }
  }
}

// Track signal actions (share/forward/record/todo) for evolution metrics
async function trackSignalAction(type, title) {
  try {
    const token = simulationMode ? `demo_sim:demo_secret` : await getClerkToken();
    if (!token) return;
    await fetch(`${CLOUD_URL}/ai/signal_action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ type, title }),
    });
  } catch (e) { /* fire-and-forget */ }
}

// Toggle signal domain preference and refresh
export async function toggleSignalDomain(domain, enabled) {
  try {
    const token = simulationMode ? `demo_sim:demo_secret` : await getClerkToken();
    if (!token) return;
    // Get current domains
    const resp = await fetch(`${CLOUD_URL}/ai/signal_domains`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    let domains = ['investment', 'ai', 'tech_finance'];
    if (resp.ok) {
      const data = await resp.json();
      domains = data.domains || domains;
    }
    // Toggle
    if (enabled && !domains.includes(domain)) domains.push(domain);
    if (!enabled) domains = domains.filter(d => d !== domain);
    // Save (ensure at least one domain)
    if (domains.length === 0) {
      alert(currentLang === 'zh' ? '至少需要选择一个领域' : 'At least one domain required');
      return;
    }
    await fetch(`${CLOUD_URL}/ai/signal_domains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ domains }),
    });
    // Auto-refresh signals after domain change
    setTimeout(() => refreshSignals(), 300);
  } catch (e) {
    console.error('[signal_domains] toggle failed:', e.message);
  }
}
