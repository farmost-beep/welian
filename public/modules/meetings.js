// meetings.js — Meeting module: photo-driven meeting management
import { CLOUD_URL, I18N, currentLang, simulationMode, simulationData } from './state.js';
import { getClerkToken } from './auth.js';
import { mineApi, escapeHtml, closeMine } from './misc.js';

// Cache last review result for image export
let _lastReview = null;

// ── Load meetings tab ──

export async function loadMeetingsTab() {
  const zh = currentLang === 'zh';
  const content = document.getElementById('mineContent');
  if (!content) return;

  try {
    const data = await mineApi('/data/meetings');
    const meetings = data.meetings || [];

    let html = `
    <div style="padding:12px">
      <button onclick="createMeeting()" style="width:100%;padding:12px;background:var(--accent);color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:1em;font-family:inherit;margin-bottom:12px">
        ${zh ? '🎯 新建会议（拍议程照片）' : '🎯 New Meeting (snap agenda)'}
      </button>
    `;

    if (meetings.length === 0) {
      html += `<div class="mine-empty" style="padding:40px 20px;text-align:center;color:var(--dimmer)">
        ${zh ? '暂无会议记录<br><br>参加会前拍张议程照片，AI帮你记录一切' : 'No meetings yet<br><br>Snap an agenda photo before your next meeting'}
      </div>`;
    } else {
      html += `<div class="mine-card">`;
      meetings.forEach(m => {
        const statusLabel = m.status === 'completed' ? (zh ? '✅ 已完成' : '✅ Done')
          : m.status === 'ongoing' ? (zh ? '🔄 进行中' : '🔄 Ongoing')
          : (zh ? '📅 计划中' : '📅 Planned');
        const attendeeCount = (m.attendees || []).length;
        const oppCount = (m.opportunities || []).length;
        html += `
        <div class="mine-contact" style="cursor:pointer" onclick="openMeetingDetail('${escapeHtml(m.id)}')">
          <div>
            <div class="mine-contact-name">${escapeHtml(m.title)}</div>
            <div class="mine-contact-sub">${escapeHtml(m.date)} · ${statusLabel}</div>
            <div style="font-size:.7em;color:var(--dim);margin-top:2px">
              ${attendeeCount > 0 ? `👥 ${attendeeCount}${zh ? '人' : ' attendees'}` : ''}
              ${oppCount > 0 ? ` · 🔥 ${oppCount}${zh ? '个机会' : ' opportunities'}` : ''}
            </div>
          </div>
        </div>`;
      });
      html += `</div>`;
    }

    html += `</div>`;
    content.innerHTML = html;
  } catch (e) {
    content.innerHTML = `<div class="mine-empty">${zh ? '加载失败' : 'Load failed'}: ${escapeHtml(e.message)}</div>`;
  }
}

// ── Create meeting (starts with photo upload) ──

export async function createMeeting() {
  const zh = currentLang === 'zh';
  pickImage(async (file) => {
    const base64 = await fileToBase64(file);
    // Compress image for KV storage
    let compressedImage = null;
    try { compressedImage = await compressImage(file); } catch (e) { /* compression failed, proceed anyway */ }
    const content = document.getElementById('mineContent');
    content.innerHTML = `<div class="mine-empty" style="padding:40px;text-align:center">
      <div style="font-size:2em;margin-bottom:8px">🔍</div>
      ${zh ? 'AI正在识别议程…' : 'AI analyzing agenda…'}
    </div>`;
    try {
      const result = await mineApi('/ai/meeting_photo', 'POST', {
        photo_type: 'agenda',
        base64,
        media_type: file.type,
      });
      if (result.status === 'ok' && result.extracted) {
        const ex = result.extracted;
        const meeting = await mineApi('/data/meetings', 'POST', {
          title: ex.title || (zh ? '未命名会议' : 'Untitled Meeting'),
          date: ex.date || new Date().toISOString().slice(0, 10),
          location: ex.location || '',
          purpose: ex.purpose || '',
          agenda: ex.agenda || [],
          status: 'planned',
          photos: [{ type: 'agenda', extracted_data: ex, timestamp: new Date().toISOString(), image: compressedImage }],
        });
        if (meeting.ok && meeting.meeting) {
          openMeetingDetail(meeting.meeting.id);
        }
      } else {
        const meeting = await mineApi('/data/meetings', 'POST', {
          title: zh ? '新会议' : 'New Meeting',
          status: 'planned',
        });
        if (meeting.ok && meeting.meeting) {
          openMeetingDetail(meeting.meeting.id);
        }
      }
    } catch (err) {
      alert((zh ? '识别失败：' : 'Recognition failed: ') + err.message);
      loadMeetingsTab();
    }
  });
}

// ── Meeting detail view ──

export async function openMeetingDetail(meetingId) {
  const zh = currentLang === 'zh';
  let meetings = [];
  try {
    const data = await mineApi('/data/meetings');
    meetings = data.meetings || [];
  } catch (e) {
    alert('Load failed: ' + e.message);
    return;
  }
  const m = meetings.find(x => x.id === meetingId);
  if (!m) return;

  const statusLabel = m.status === 'completed' ? (zh ? '✅ 已完成' : '✅ Done')
    : m.status === 'ongoing' ? (zh ? '🔄 进行中' : '🔄 Ongoing')
    : (zh ? '📅 计划中' : '📅 Planned');

  // Build detail HTML
  let html = `
  <div style="padding:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0;font-size:1.1em">${escapeHtml(m.title)}</h3>
      <span style="font-size:.8em;color:var(--dim)">${statusLabel}</span>
    </div>
    <div style="font-size:.85em;color:var(--dim);margin-bottom:16px">
      ${escapeHtml(m.date)}${m.location ? ' · ' + escapeHtml(m.location) : ''}
      ${m.purpose ? `<br>${escapeHtml(m.purpose)}` : ''}
    </div>

    <!-- Photo upload buttons -->
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button onclick="uploadMeetingPhoto('${escapeHtml(m.id)}','agenda')" style="flex:1;min-width:100px;padding:10px;border:1px solid var(--border);border-radius:8px;background:transparent;cursor:pointer;font-family:inherit;font-size:.85em">
        📷 ${zh ? '议程' : 'Agenda'}
      </button>
      <button onclick="uploadMeetingPhoto('${escapeHtml(m.id)}','card')" style="flex:1;min-width:100px;padding:10px;border:1px solid var(--border);border-radius:8px;background:transparent;cursor:pointer;font-family:inherit;font-size:.85em">
        📷 ${zh ? '名片/合影' : 'Cards'}
      </button>
      <button onclick="uploadMeetingPhoto('${escapeHtml(m.id)}','roster')" style="flex:1;min-width:100px;padding:10px;border:1px solid var(--border);border-radius:8px;background:transparent;cursor:pointer;font-family:inherit;font-size:.85em">
        📷 ${zh ? '参会名单' : 'Roster'}
      </button>
      <button onclick="uploadMeetingPhoto('${escapeHtml(m.id)}','notes')" style="flex:1;min-width:100px;padding:10px;border:1px solid var(--border);border-radius:8px;background:transparent;cursor:pointer;font-family:inherit;font-size:.85em">
        📷 ${zh ? '笔记/白板' : 'Notes'}
      </button>
    </div>
  `;

  // Agenda section
  if (m.agenda && m.agenda.length > 0) {
    html += `<div class="mine-detail-section">
      <div class="mine-detail-section-title">${zh ? '📋 议程' : '📋 Agenda'}</div>`;
    m.agenda.forEach(a => {
      html += `<div class="mine-detail-item">
        <span style="color:var(--dim)">${escapeHtml(a.time || '')}</span>
        ${escapeHtml(a.topic || '')}
        ${a.presenter ? `<span style="color:var(--dim);font-size:.85em"> — ${escapeHtml(a.presenter)}</span>` : ''}
      </div>`;
    });
    html += `</div>`;
  }

  // Attendees section
  if (m.attendees && m.attendees.length > 0) {
    html += `<div class="mine-detail-section">
      <div class="mine-detail-section-title">${zh ? '👥 参会人' : '👥 Attendees'} (${m.attendees.length})</div>`;
    m.attendees.forEach(a => {
      const icon = a.is_existing ? '⭐' : (a.first_meeting ? '🆕' : '👤');
      const tag = a.is_existing ? (zh ? '已有联系人' : 'Existing') : '';
      html += `<div class="mine-detail-item">
        ${icon} <b>${escapeHtml(a.name || '')}</b>
        ${a.title || a.company ? ` — ${escapeHtml([a.title, a.company].filter(Boolean).join(', '))}` : ''}
        ${tag ? `<span style="font-size:.75em;color:var(--accent);margin-left:4px">${tag}</span>` : ''}
      </div>`;
    });
    html += `</div>`;
  }

  // Opportunities section
  if (m.opportunities && m.opportunities.length > 0) {
    html += `<div class="mine-detail-section">
      <div class="mine-detail-section-title">${zh ? '🔥 机会' : '🔥 Opportunities'} (${m.opportunities.length})</div>`;
    m.opportunities.forEach(o => {
      const potIcon = o.potential === 'high' ? '🔥' : o.potential === 'medium' ? '💡' : '📌';
      html += `<div class="mine-detail-item">
        ${potIcon} ${escapeHtml(o.description || '')}
        ${o.type ? `<span style="font-size:.75em;color:var(--dim);margin-left:4px">${escapeHtml(o.type)}</span>` : ''}
      </div>`;
    });
    html += `</div>`;
  }

  // Contact dynamics
  if (m.contact_dynamics) {
    html += `<div class="mine-detail-section">
      <div class="mine-detail-section-title">${zh ? '👁 人际观察' : '👁 Dynamics'}</div>
      <div class="mine-detail-item">${escapeHtml(m.contact_dynamics)}</div>
    </div>`;
  }

  // Notes / key points section
  if (m.notes && m.notes.length > 0) {
    html += `<div class="mine-detail-section">
      <div class="mine-detail-section-title">${zh ? '📝 笔记要点' : '📝 Notes'} (${m.notes.length})</div>`;
    m.notes.forEach(n => {
      html += `<div class="mine-detail-item">${escapeHtml(n)}</div>`;
    });
    html += `</div>`;
  }

  // Photos section — show uploaded photos as thumbnails
  if (m.photos && m.photos.length > 0) {
    const typeLabels = { agenda: zh ? '议程' : 'Agenda', card: zh ? '名片' : 'Card', roster: zh ? '名单' : 'Roster', notes: zh ? '笔记' : 'Notes' };
    html += `<div class="mine-detail-section">
      <div class="mine-detail-section-title">${zh ? '📷 照片' : '📷 Photos'} (${m.photos.length})</div>`;
    m.photos.forEach((p, i) => {
      const label = typeLabels[p.type] || p.type;
      const time = p.timestamp ? new Date(p.timestamp).toLocaleString(zh ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const imgSrc = p.image ? `data:image/jpeg;base64,${p.image}` : null;
      html += `<div class="mine-detail-item" style="display:flex;gap:8px;align-items:flex-start">
        ${imgSrc ? `<img src="${imgSrc}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;flex-shrink:0" onclick="openPhotoViewer('${escapeHtml(m.id)}',${i})" />` : '<span style="font-size:1.5em">📷</span>'}
        <div style="flex:1">
          <div><b>${label}</b>${p.unstructured ? ' <span style="font-size:.7em;color:#e8a040">⚠️非结构化</span>' : ''}</div>
          <div style="font-size:.75em;color:var(--dim)">${time}</div>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // Summary
  if (m.summary) {
    html += `<div class="mine-detail-section">
      <div class="mine-detail-section-title">${zh ? '📝 总结' : '📝 Summary'}</div>
      <div class="mine-detail-item">${escapeHtml(m.summary)}</div>
    </div>`;
  }

  // Action buttons
  const hasReview = !!(m.review);
  const reviewBtn = m.status === 'completed' && hasReview
    ? `<button onclick="viewMeetingReview('${escapeHtml(m.id)}')" style="flex:1;padding:10px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit">
        ${zh ? '📊 查看复盘' : '📊 View Review'}
      </button>`
    : `<button onclick="reviewMeeting('${escapeHtml(m.id)}')" style="flex:1;padding:10px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit"${m.status === 'completed' ? ' disabled' : ''}>
        ${zh ? '📊 会后复盘' : '📊 Review'}
      </button>`;
  html += `<div style="margin-top:16px;display:flex;gap:8px">
    ${reviewBtn}
    <button onclick="deleteMeeting('${escapeHtml(m.id)}')" style="padding:10px 14px;background:transparent;color:var(--dim);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:inherit">
      🗑
    </button>
  </div>`;

  html += `</div>`;
  document.getElementById('mineContent').innerHTML = html;
}

// Photo viewer — click thumbnail to see full image
export async function openPhotoViewer(meetingId, photoIndex) {
  const zh = currentLang === 'zh';
  try {
    const data = await mineApi('/data/meetings');
    const m = (data.meetings || []).find(x => x.id === meetingId);
    if (!m || !m.photos || !m.photos[photoIndex]) return;
    const p = m.photos[photoIndex];
    const typeLabels = { agenda: zh ? '议程' : 'Agenda', card: zh ? '名片' : 'Card', roster: zh ? '名单' : 'Roster', notes: zh ? '笔记' : 'Notes' };
    const label = typeLabels[p.type] || p.type;
    const imgSrc = p.image ? `data:image/jpeg;base64,${p.image}` : null;
    const time = p.timestamp ? new Date(p.timestamp).toLocaleString(zh ? 'zh-CN' : 'en-US') : '';

    let html = `<div style="padding:12px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <button onclick="openMeetingDetail('${escapeHtml(meetingId)}')" style="background:none;border:none;font-size:1.2em;cursor:pointer;color:var(--text)">←</button>
        <h3 style="margin:0;font-size:1.1em">${label}</h3>
        <span style="font-size:.75em;color:var(--dim)">${time}</span>
      </div>`;

    if (imgSrc) {
      html += `<img src="${imgSrc}" style="width:100%;border-radius:8px" />`;
    } else {
      html += `<div style="padding:20px;text-align:center;color:var(--dim)">${zh ? '📷 图片未保存' : '📷 Image not saved'}</div>`;
    }

    html += `</div>`;
    document.getElementById('mineContent').innerHTML = html;
  } catch (e) {
    alert((zh ? '加载照片失败：' : 'Load photo failed: ') + e.message);
    openMeetingDetail(meetingId);
  }
}

export function closeMeetingDetail() {
  loadMeetingsTab();
}

// ── Upload meeting photo ──

export async function uploadMeetingPhoto(meetingId, photoType) {
  const zh = currentLang === 'zh';
  pickImage(async (file) => {
    const base64 = await fileToBase64(file);
    // Compress image for KV storage (thumbnail to view later)
    let compressedImage = null;
    try { compressedImage = await compressImage(file); } catch (e) { /* compression failed, still proceed with AI recognition */ }

    // Show loading
    const content = document.getElementById('mineContent');
    const typeLabel = photoType === 'agenda' ? (zh ? '议程' : 'agenda')
      : photoType === 'card' ? (zh ? '名片' : 'cards')
      : photoType === 'roster' ? (zh ? '参会名单' : 'roster')
      : (zh ? '笔记' : 'notes');
    const loadingHtml = `<div class="mine-empty" style="padding:40px;text-align:center">
      <div style="font-size:2em;margin-bottom:8px">🔍</div>
      ${zh ? 'AI正在识别' : 'AI analyzing'}${typeLabel}…
    </div>`;
    content.innerHTML = loadingHtml;

    try {
      const result = await mineApi('/ai/meeting_photo', 'POST', {
        photo_type: photoType,
        base64,
        media_type: file.type,
        meeting_id: meetingId,
      });

      if (result.status === 'ok' && result.extracted) {
        // Merge extracted data into meeting
        const data = await mineApi('/data/meetings');
        const meetings = data.meetings || [];
        const idx = meetings.findIndex(m => m.id === meetingId);
        if (idx >= 0) {
          const m = meetings[idx];
          const ex = result.extracted;

          if (result.unstructured && ex.raw_text) {
            // LLM returned prose instead of JSON — store raw text in notes so user sees what AI recognized
            m.notes = [...(m.notes || []), `[${typeLabel}] ${ex.raw_text}`];
          } else if (photoType === 'agenda') {
            if (ex.title) m.title = ex.title;
            if (ex.date) m.date = ex.date;
            if (ex.location) m.location = ex.location;
            if (ex.purpose) m.purpose = ex.purpose;
            if (ex.agenda) m.agenda = ex.agenda;
          } else if (photoType === 'card' || photoType === 'roster') {
            if (ex.attendees) {
              // Merge new attendees (dedup by name)
              const existingNames = new Set((m.attendees || []).map(a => a.name));
              const newAttendees = ex.attendees.filter(a => !existingNames.has(a.name));
              m.attendees = [...(m.attendees || []), ...newAttendees];
            }
          } else if (photoType === 'notes') {
            if (ex.opportunities) {
              m.opportunities = [...(m.opportunities || []), ...ex.opportunities];
            }
            if (ex.contact_dynamics) {
              m.contact_dynamics = m.contact_dynamics
                ? m.contact_dynamics + '\n' + ex.contact_dynamics
                : ex.contact_dynamics;
            }
            if (ex.key_points) {
              m.notes = [...(m.notes || []), ...ex.key_points];
            }
          }

          // Record photo (with compressed image for later viewing)
          m.photos = [...(m.photos || []), { type: photoType, extracted_data: ex, timestamp: new Date().toISOString(), unstructured: !!result.unstructured, image: compressedImage }];
          m.updated = new Date().toISOString();

          // Save
          await mineApi('/data/meetings', 'POST', m);
        }
        // Reload detail
        openMeetingDetail(meetingId);
        // Notify user if AI returned unstructured content
        if (result.unstructured) {
          alert(zh ? 'AI 返回了非结构化内容（未识别为标准格式），已将原文存入笔记。可能是该图片类型 AI 识别能力有限，可重试或换张图。' : 'AI returned unstructured content (not in standard JSON format). Raw text saved to notes. The model may struggle with this image type — try again or use a different photo.');
        }
      } else {
        alert((zh ? '识别失败' : 'Recognition failed') + ': ' + (result.error || 'unknown'));
        openMeetingDetail(meetingId);
      }
    } catch (err) {
      alert((zh ? '上传失败：' : 'Upload failed: ') + err.message);
      openMeetingDetail(meetingId);
    }
  });
}

// ── Meeting review (会后复盘) ──

// Render review result HTML into #mineContent. Used by both reviewMeeting (fresh from API)
// and viewMeetingReview (re-open persisted review). Also primes _lastReview so the
// "save as image" button works on re-open.
function renderReviewResult(meetingId, r, meeting, unstructured = false) {
  const zh = currentLang === 'zh';
  _lastReview = { meetingId, review: r, meeting };
  let html = `<div style="padding:12px">
    <h3 style="margin:0 0 12px;font-size:1.1em">${zh ? '📊 会后复盘' : '📊 Meeting Review'}</h3>`;

  if (unstructured) {
    html += `<div class="mine-detail-section" style="border-left:3px solid #e8a040;padding-left:8px">
      <div style="font-size:.8em;color:#e8a040;margin-bottom:6px">⚠️ ${zh ? 'AI 返回了非结构化内容（未识别为标准 JSON 格式），以下为原文。可重新点「会后复盘」重试。' : 'AI returned unstructured content (not standard JSON). Raw text shown below. Try reviewing again.'}</div>
    </div>`;
  }

  if (r.summary) {
    html += `<div class="mine-detail-section">
      <div class="mine-detail-section-title">${zh ? '📝 总结' : '📝 Summary'}</div>
      <div class="mine-detail-item">${escapeHtml(r.summary)}</div>
    </div>`;
  }

  if (r.new_contacts && r.new_contacts.length > 0) {
    html += `<div class="mine-detail-section">
      <div class="mine-detail-section-title">${zh ? '🆕 新认识的人（已自动入库）' : '🆕 New Contacts (auto-added)'}</div>`;
    r.new_contacts.forEach(c => {
      html += `<div class="mine-detail-item">🆕 <b>${escapeHtml(c.name)}</b> — ${escapeHtml([c.title, c.company].filter(Boolean).join(', '))}
        <span style="font-size:.75em;color:var(--accent)">${zh ? '已添加' : 'added'}</span></div>`;
    });
    html += `</div>`;
  }

  if (r.follow_up_todos && r.follow_up_todos.length > 0) {
    html += `<div class="mine-detail-section">
      <div class="mine-detail-section-title">${zh ? '✅ 跟进待办（已自动创建）' : '✅ Follow-ups (auto-created)'}</div>`;
    r.follow_up_todos.forEach(t => {
      html += `<div class="mine-detail-item">☐ ${escapeHtml(t.task)}
        ${t.contact_name ? ` — ${escapeHtml(t.contact_name)}` : ''}
        ${t.due ? `<span style="font-size:.75em;color:var(--dim)"> ${escapeHtml(t.due)}</span>` : ''}
        <span style="font-size:.75em;color:var(--accent)">${zh ? '已创建' : 'created'}</span></div>`;
    });
    html += `</div>`;
  }

  if (r.opportunity_analysis && r.opportunity_analysis.length > 0) {
    html += `<div class="mine-detail-section">
      <div class="mine-detail-section-title">${zh ? '🔥 机会分析' : '🔥 Opportunities'}</div>`;
    r.opportunity_analysis.forEach(o => {
      html += `<div class="mine-detail-item">💡 ${escapeHtml(o.description)}
        ${o.action ? `<br><span style="font-size:.85em;color:var(--dim)">${zh ? '建议：' : 'Action: '}${escapeHtml(o.action)}</span>` : ''}
        ${o.contact_name ? ` — ${escapeHtml(o.contact_name)}` : ''}</div>`;
    });
    html += `</div>`;
  }

  if (r.leverage_insights) {
    html += `<div class="mine-detail-section">
      <div class="mine-detail-section-title">${zh ? '🤝 撬动合作建议' : '🤝 Leverage Insights'}</div>
      <div class="mine-detail-item">${escapeHtml(r.leverage_insights)}</div>
    </div>`;
  }

  if (r.goal_suggestions && r.goal_suggestions.length > 0) {
    html += `<div class="mine-detail-section">
      <div class="mine-detail-section-title">${zh ? '🎯 目标关联' : '🎯 Goal Links'}</div>`;
    r.goal_suggestions.forEach(g => {
      html += `<div class="mine-detail-item">🎯 ${escapeHtml(g)}</div>`;
    });
    html += `</div>`;
  }

  html += `<div style="margin-top:16px;display:flex;gap:8px">
    <button onclick="shareReviewAsImage('${escapeHtml(meetingId)}')" style="flex:1;padding:10px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:inherit">
      📸 ${zh ? '保存图片分享' : 'Save as image'}
    </button>
    <button onclick="openMeetingDetail('${escapeHtml(meetingId)}')" style="padding:10px 14px;background:transparent;color:var(--dim);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-family:inherit">
      ${zh ? '返回' : 'Back'}
    </button>
  </div></div>`;

  document.getElementById('mineContent').innerHTML = html;
}

export async function reviewMeeting(meetingId) {
  const zh = currentLang === 'zh';
  const content = document.getElementById('mineContent');
  content.innerHTML = `<div class="mine-empty" style="padding:40px;text-align:center">
    <div style="font-size:2em;margin-bottom:8px">📊</div>
    ${zh ? 'AI正在生成会后复盘…' : 'AI generating meeting review…'}
  </div>`;

  try {
    const result = await mineApi('/ai/meeting_review', 'POST', { meeting_id: meetingId });
    if (result.status === 'ok' && result.review) {
      renderReviewResult(meetingId, result.review, result.meeting, !!result.unstructured);
      // Notify if prep todos were auto-completed
      if (result.auto_completed_todos && result.auto_completed_todos > 0) {
        const n = result.auto_completed_todos;
        setTimeout(() => alert(zh ? `✅ 已自动完成 ${n} 个关联待办（与会议"${result.meeting?.title || ''}"匹配的准备待办已标记完成）` : `✅ Auto-completed ${n} prep todo(s) matching this meeting`), 100);
      }
    } else {
      alert((zh ? '复盘失败' : 'Review failed') + ': ' + (result.error || 'unknown'));
      openMeetingDetail(meetingId);
    }
  } catch (err) {
    alert((zh ? '复盘失败：' : 'Review failed: ') + err.message);
    openMeetingDetail(meetingId);
  }
}

// Re-open a persisted review (after navigating away and coming back).
export async function viewMeetingReview(meetingId) {
  const zh = currentLang === 'zh';
  try {
    const data = await mineApi('/data/meetings');
    const m = (data.meetings || []).find(x => x.id === meetingId);
    if (m && m.review) {
      // Detect unstructured persisted review: summary present but all structured fields empty
      const r = m.review;
      const isUnstructured = r.summary && !r.opportunity_analysis && !r.follow_up_todos?.length && !r.new_contacts?.length && !r.leverage_insights && !r.goal_suggestions?.length;
      renderReviewResult(meetingId, r, m, isUnstructured);
    } else {
      // No persisted review — fall back to generating one
      reviewMeeting(meetingId);
    }
  } catch (e) {
    alert((zh ? '加载复盘失败：' : 'Load review failed: ') + e.message);
    openMeetingDetail(meetingId);
  }
}

// ── Delete meeting ──

export async function deleteMeeting(meetingId) {
  const zh = currentLang === 'zh';
  if (!confirm(zh ? '确定删除这个会议吗？' : 'Delete this meeting?')) return;
  try {
    await mineApi(`/data/meetings?id=${meetingId}`, 'DELETE');
    loadMeetingsTab();
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}

// ── Helper: file to base64 ──

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Compress image for KV storage — max 800px wide, JPEG 0.7 quality
// Returns base64 (no data: prefix). Typical size: 50-200KB per photo.
function compressImage(file, maxW = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl.split(',')[1]);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ── Share review as long image ──

export async function shareReviewAsImage(meetingId) {
  const zh = currentLang === 'zh';
  if (!_lastReview || _lastReview.meetingId !== meetingId) {
    alert(zh ? '复盘数据已过期，请重新生成' : 'Review data expired, please regenerate');
    return;
  }

  const { review: r, meeting: m } = _lastReview;
  const title = m?.title || (zh ? '会议复盘' : 'Meeting Review');
  const date = m?.date || '';

  // Layout constants
  const W = 750;
  const PAD = 40;
  const CARD_PAD = 20;
  const LINE_H = 26;
  const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  const GREEN = '#4A6741';
  const BG = '#FAFAF7';
  const CARD_BG = '#fff';
  const TEXT = '#333';
  const DIM = '#888';
  const BORDER = '#e8e8e0';

  // Measure text width
  function measure(text, fontSize, weight = 'normal') {
    const c = document.createElement('canvas').getContext('2d');
    c.font = `${weight} ${fontSize}px ${FONT}`;
    return c.measureText(text).width;
  }

  // Wrap text into lines
  function wrap(text, maxW, fontSize, weight = 'normal') {
    const c = document.createElement('canvas').getContext('2d');
    c.font = `${weight} ${fontSize}px ${FONT}`;
    const chars = Array.from(text);
    const lines = [];
    let line = '';
    for (const ch of chars) {
      const test = line + ch;
      if (c.measureText(test).width > maxW && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // Build sections data
  const sections = [];
  if (r.summary) {
    sections.push({ icon: '📝', title: zh ? '总结' : 'Summary', items: [{ text: r.summary, wrap: true }] });
  }
  if (r.new_contacts?.length) {
    sections.push({
      icon: '🆕', title: zh ? '新认识的人' : 'New Contacts',
      items: r.new_contacts.map(c => ({ text: `${c.name}${c.title || c.company ? ' — ' + [c.title, c.company].filter(Boolean).join(', ') : ''}`, tag: zh ? '已入库' : 'added' })),
    });
  }
  if (r.follow_up_todos?.length) {
    sections.push({
      icon: '✅', title: zh ? '跟进待办' : 'Follow-ups',
      items: r.follow_up_todos.map(t => ({ text: `☐ ${t.task}${t.contact_name ? ' — ' + t.contact_name : ''}${t.due ? '  ' + t.due : ''}`, tag: zh ? '已创建' : 'created' })),
    });
  }
  if (r.opportunity_analysis?.length) {
    sections.push({
      icon: '🔥', title: zh ? '机会分析' : 'Opportunities',
      items: r.opportunity_analysis.map(o => ({
        text: `💡 ${o.description}${o.action ? '\n' + (zh ? '建议' : 'Action') + ': ' + o.action : ''}${o.contact_name ? ' — ' + o.contact_name : ''}`,
        wrap: true,
      })),
    });
  }
  if (r.leverage_insights) {
    sections.push({ icon: '🤝', title: zh ? '撬动合作建议' : 'Leverage Insights', items: [{ text: r.leverage_insights, wrap: true }] });
  }
  if (r.goal_suggestions?.length) {
    sections.push({ icon: '🎯', title: zh ? '目标关联' : 'Goal Links', items: r.goal_suggestions.map(g => ({ text: `🎯 ${g}` })) });
  }

  // Calculate total height
  const headerH = 140;
  let totalH = headerH + PAD;
  const sectionHeights = sections.map(s => {
    let h = 50; // title bar
    for (const item of s.items) {
      const lines = item.wrap ? wrap(item.text, W - PAD * 2 - CARD_PAD * 2 - 8, 15) : [item.text];
      h += lines.length * LINE_H + 8;
    }
    h += 16; // bottom padding
    return h;
  });
  totalH += sectionHeights.reduce((a, b) => a + b + 12, 0);
  totalH += 80; // footer

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, totalH);

  // Header bar
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, GREEN);
  grad.addColorStop(1, '#5a7a51');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 100);

  // Header text
  ctx.fillStyle = '#fff';
  ctx.font = `bold 28px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillText('📊 ' + (zh ? '会后复盘' : 'Meeting Review'), PAD, 28);

  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(title + (date ? '  ·  ' + date : ''), PAD, 64);

  // Sections
  let y = headerH;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const sh = sectionHeights[i];

    // Card background
    ctx.fillStyle = CARD_BG;
    roundRect(ctx, PAD, y, W - PAD * 2, sh, 12);
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    roundRect(ctx, PAD, y, W - PAD * 2, sh, 12);
    ctx.stroke();

    // Section title
    ctx.fillStyle = GREEN;
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillText(`${s.icon}  ${s.title}`, PAD + CARD_PAD, y + 16);

    // Divider
    ctx.strokeStyle = BORDER;
    ctx.beginPath();
    ctx.moveTo(PAD + CARD_PAD, y + 44);
    ctx.lineTo(W - PAD - CARD_PAD, y + 44);
    ctx.stroke();

    // Items
    let iy = y + 54;
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = TEXT;
    for (const item of s.items) {
      const lines = item.wrap ? wrap(item.text, W - PAD * 2 - CARD_PAD * 2 - (item.tag ? 70 : 0) - 8, 15) : [item.text];
      for (const ln of lines) {
        ctx.fillText(ln, PAD + CARD_PAD, iy);
        iy += LINE_H;
      }
      if (item.tag) {
        const tagW = measure(item.tag, 12) + 16;
        ctx.fillStyle = GREEN;
        roundRect(ctx, W - PAD - CARD_PAD - tagW - 4, iy - LINE_H + 4, tagW, 20, 10);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `12px ${FONT}`;
        ctx.fillText(item.tag, W - PAD - CARD_PAD - tagW + 8, iy - LINE_H + 7);
        ctx.font = `15px ${FONT}`;
        ctx.fillStyle = TEXT;
      }
      iy += 8;
    }

    y += sh + 12;
  }

  // Footer
  const footerH = 80;
  ctx.fillStyle = GREEN;
  ctx.font = `bold 22px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('Welian 小维', W / 2, y + 24);
  ctx.fillStyle = DIM;
  ctx.font = `16px ${FONT}`;
  ctx.fillText('welian.app', W / 2, y + 52);
  ctx.textAlign = 'left';

  // Download
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-review-${date || 'export'}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Helper: pick image from camera or album ──

function pickImage(callback) {
  const zh = currentLang === 'zh';
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9998;display:flex;align-items:flex-end;justify-content:center';
  const sheet = document.createElement('div');
  sheet.style.cssText = 'width:100%;max-width:480px;background:var(--bg);border-radius:16px 16px 0 0;padding:8px 0 20px;box-shadow:0 -4px 24px rgba(0,0,0,.2)';
  sheet.innerHTML = `
    <div style="text-align:center;color:var(--dim);font-size:.85em;padding:12px 0;border-bottom:1px solid var(--border)">${zh ? '选择来源' : 'Choose source'}</div>
    <button data-action="camera" style="display:block;width:100%;padding:16px;border:none;background:transparent;cursor:pointer;font-family:inherit;font-size:1em;text-align:center;border-bottom:1px solid var(--border)">📷 ${zh ? '拍照' : 'Camera'}</button>
    <button data-action="album" style="display:block;width:100%;padding:16px;border:none;background:transparent;cursor:pointer;font-family:inherit;font-size:1em;text-align:center;border-bottom:1px solid var(--border)">📁 ${zh ? '从相册上传' : 'Upload from album'}</button>
    <button data-action="cancel" style="display:block;width:100%;padding:16px;border:none;background:transparent;cursor:pointer;font-family:inherit;font-size:1em;text-align:center;color:var(--dim);margin-top:4px">${zh ? '取消' : 'Cancel'}</button>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  sheet.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    close();
    if (action === 'cancel') return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (action === 'camera') input.capture = 'environment';
    input.onchange = async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      callback(file);
    };
    input.click();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}
