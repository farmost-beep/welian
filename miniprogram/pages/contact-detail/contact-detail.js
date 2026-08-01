// pages/contact-detail/contact-detail.js
const api = require('../../utils/api.js');
const { calcCooldown } = require('../../utils/contact-detail-logic.js');

Page({
  data: {
    contact: null,
    loading: true,
    error: '',
    timeline: [],
    cooldown: null,        // { days, status } 冷却预警
    meetingPrep: null,     // 见面功课
    showPrep: false,
    loadingPrep: false,
    loadingPerception: false,
    perceptions: [],
    // 编辑
    showEdit: false,
    savingEdit: false,
    editForm: {},
    natureOptions: ['撬动（经营型）', '维系（陪伴型）', '双重'],
    natureValues: ['leverage', 'nurture', 'dual'],
    natureIndex: 0,
    // Timeline 内联编辑
    showTimelineForm: false,
    timelineEditId: '',
    timelineForm: { summary: '', date: '' },
    savingTimeline: false,
    // Web搜索
    webSearching: false,
    webResults: [],
  },

  onLoad(options) {
    if (!api.requireLogin()) return;
    this.contactId = options.id;
    this.loadDetail();
  },

  loadDetail() {
    this.setData({ loading: true, error: '' });
    api.getContactDetail(this.contactId).then((contact) => {
      this.setData({ contact, loading: false });
      this.loadTimeline(contact.name);
      this.loadPerceptions();
    }).catch((err) => {
      this.setData({ loading: false, error: err.message || '加载失败' });
    });
  },

  loadTimeline(name) {
    // Load timeline entries for this contact
    const token = api.getToken();
    if (!token) return;
    wx.request({
      url: 'https://api.welian.app/data/timeline',
      method: 'GET',
      header: { 'Authorization': 'Bearer ' + token },
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          const entries = (res.data.timeline || []).filter(e =>
            (e.contact_name || '').includes(name) || (e.contact || '').includes(name)
          ).slice(0, 10);
          // 计算冷却预警（仅经营型关系）
          const contact = this.data.contact;
          const cooldown = calcCooldown(entries, contact);
          this.setData({ timeline: entries, cooldown });
        }
      },
      fail: () => {},
    });
  },

  // calcCooldown 已提取到 utils/contact-detail-logic.js

  // 记录互动
  recordInteraction() {
    const name = this.data.contact.name;
    wx.showModal({
      title: '记录互动',
      content: '和 ' + name + ' 的互动',
      editable: true,
      placeholderText: '简单记一下聊了什么…',
      success: (res) => {
        if (res.confirm && res.content) {
          this.saveInteraction(name, res.content);
        }
      },
    });
  },

  saveInteraction(name, summary) {
    const token = api.getToken();
    wx.request({
      url: 'https://api.welian.app/data/timeline',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: { contact_name: name, summary, date: new Date().toISOString().slice(0, 10) },
      success: (res) => {
        if (res.statusCode === 200) {
          wx.showToast({ title: '已记录', icon: 'success' });
          this.loadTimeline(name);
        } else {
          wx.showToast({ title: '记录失败', icon: 'none' });
        }
      },
      fail: () => wx.showToast({ title: '网络错误', icon: 'none' }),
    });
  },

  // 拟写消息
  draftMessage() {
    const contact = this.data.contact;
    if (!contact) return;
    wx.showLoading({ title: '生成中…' });
    const token = api.getToken();
    wx.request({
      url: 'https://api.welian.app/ai/draft',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: {
        name: contact.name,
        nature: contact.nature || '',
        last_interaction: this.data.timeline.length > 0 ? this.data.timeline[0].summary : '',
        user_context: `关系：${contact.relation || contact.relationship || ''}，公司：${contact.company || ''}，职位：${contact.title || ''}`,
      },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200 && res.data) {
          const draft = res.data.result || res.data.draft || res.data.text || '';
          if (!draft) {
            wx.showToast({ title: '生成失败', icon: 'none' });
            return;
          }
          wx.showModal({
            title: '消息草稿',
            content: draft,
            showCancel: true,
            cancelText: '重试',
            confirmText: '复制',
            success: (r) => {
              if (r.confirm) {
                wx.setClipboardData({ data: draft });
              } else if (r.cancel) {
                this.draftMessage();
              }
            },
          });
        } else {
          wx.showToast({ title: '生成失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  // ── 见面功课 ──
  async meetingPrep() {
    const contact = this.data.contact;
    if (!contact) return;
    this.setData({ loadingPrep: true });
    try {
      const data = await api.request('/ai/meeting_prep', { contact_id: contact.id, contact_name: contact.name }, 'POST');
      this.setData({ loadingPrep: false });
      if (data) {
        const prep = data.prep || data;
        this.setData({ meetingPrep: prep, showPrep: true });
      } else {
        wx.showToast({ title: '生成失败', icon: 'none' });
      }
    } catch (e) {
      this.setData({ loadingPrep: false });
      wx.showToast({ title: e.message || '网络错误', icon: 'none' });
    }
  },

  closePrep() {
    this.setData({ showPrep: false });
  },

  // R3-1+R3-2: 感知变化 — 手动触发采集
  async collectPerceptions() {
    const contact = this.data.contact;
    if (!contact) return;
    this.setData({ loadingPerception: true });
    try {
      const data = await api.request('/ai/perceptions/collect', {
        contact_id: contact.id,
        sources: ['github'],
      }, 'POST');
      this.setData({ loadingPerception: false });
      if (data && data.ok) {
        if (data.collected > 0) {
          wx.showToast({ title: `发现 ${data.collected} 条新变化`, icon: 'success' });
        } else {
          wx.showToast({ title: data.message || '未发现新变化', icon: 'none' });
        }
        this.loadPerceptions();
      } else {
        wx.showToast({ title: '采集失败', icon: 'none' });
      }
    } catch (e) {
      this.setData({ loadingPerception: false });
      wx.showToast({ title: e.message || '网络错误', icon: 'none' });
    }
  },

  // R3-1: 加载该联系人的感知列表
  async loadPerceptions() {
    const contact = this.data.contact;
    if (!contact) return;
    try {
      const data = await api.request('/ai/perceptions?status=all&limit=10');
      if (data && data.ok) {
        const percs = (data.perceptions || [])
          .filter(p => p.contact_id === contact.id)
          .map(p => ({
            ...p,
            collected_ago: this.formatTimeAgo(p.source?.collected_at || p.created_at),
          }));
        this.setData({ perceptions: percs });
      }
    } catch (e) { /* ignore */ }
  },

  // R3-1: 确认感知
  async confirmPerception(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const data = await api.request('/ai/perceptions/confirm', { id, action: 'confirm' }, 'POST');
      if (data && data.ok) {
        wx.showToast({ title: '已确认', icon: 'success' });
        this.loadPerceptions();
      }
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // R3-1: 拒绝感知
  async rejectPerception(e) {
    const id = e.currentTarget.dataset.id;
    try {
      const data = await api.request('/ai/perceptions/confirm', { id, action: 'reject' }, 'POST');
      if (data && data.ok) {
        wx.showToast({ title: '已忽略', icon: 'none' });
        this.loadPerceptions();
      }
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 格式化时间为"x分钟前/x小时前/x天前"
  formatTimeAgo(isoStr) {
    if (!isoStr) return '';
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  },

  // ── 编辑联系人 ──
  editContact() {
    const c = this.data.contact;
    if (!c) return;
    const natureValues = this.data.natureValues;
    const natureIndex = Math.max(0, natureValues.indexOf(c.nature || 'leverage'));
    this.setData({
      showEdit: true,
      natureIndex,
      editForm: {
        name: c.name || '',
        company: c.company || '',
        title: c.title || '',
        relation: c.relation || c.relationship || '',
        phone: c.phone || '',
        email: c.email || '',
        birthday: c.birthday || '',
        notes: c.notes || '',
        aliases: (c.aliases || c.alias || []).join('、'),
        tags: (c.tags || []).join('、'),
        leverage_goal: c.leverage_goal || c.leverage?.goal || '',
        leverage_how: c.leverage_how || c.leverage?.how || '',
        leverage_direction: c.leverage_direction || c.leverage?.direction || '',
        nurture_bond: c.nurture_bond || c.nurture?.bond || '',
        important_dates_text: (c.important_dates || []).map(d => `${d.label || d.name || ''}:${d.date}`).join('\n'),
        memories_text: (c.memories || []).map(m => typeof m === 'string' ? m : (m.content || m.text || '')).join('\n'),
      },
    });
  },

  onEditInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`editForm.${field}`]: e.detail.value });
  },

  onNatureChange(e) {
    this.setData({ natureIndex: parseInt(e.detail.value) });
  },

  closeEdit() {
    this.setData({ showEdit: false });
  },

  noop() {},

  saveEdit() {
    const c = this.data.contact;
    if (!c) return;
    const form = this.data.editForm;
    if (!form.name || !form.name.trim()) {
      wx.showToast({ title: '姓名不能为空', icon: 'none' });
      return;
    }
    this.setData({ savingEdit: true });
    const token = api.getToken();
    const nature = this.data.natureValues[this.data.natureIndex];
    // 解析高级字段
    const aliases = (form.aliases || '').split(/[、,，\s]+/).filter(Boolean);
    const tags = (form.tags || '').split(/[、,，\s]+/).filter(Boolean);
    const importantDates = (form.important_dates_text || '').split('\n').filter(Boolean).map(line => {
      const [label, date] = line.split(/[:：]/).map(s => s.trim());
      return { label: label || '重要日期', date: date || '' };
    });
    const memories = (form.memories_text || '').split('\n').filter(Boolean).map(m => ({ content: m }));
    wx.request({
      url: 'https://api.welian.app/data/contacts',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: {
        id: c.id,
        name: form.name.trim(),
        company: form.company,
        title: form.title,
        nature,
        relation: form.relation,
        phone: form.phone,
        email: form.email,
        birthday: form.birthday,
        notes: form.notes,
        aliases,
        tags,
        leverage_goal: form.leverage_goal,
        leverage_how: form.leverage_how,
        leverage_direction: form.leverage_direction,
        nurture_bond: form.nurture_bond,
        important_dates: importantDates,
        memories,
      },
      success: (res) => {
        this.setData({ savingEdit: false });
        if (res.statusCode === 200 && res.data.ok) {
          wx.showToast({ title: '已保存', icon: 'success' });
          this.setData({ showEdit: false });
          this.loadDetail();
        } else {
          wx.showToast({ title: res.data.error || '保存失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ savingEdit: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  // ── 删除联系人 ──
  deleteContact() {
    const c = this.data.contact;
    if (!c) return;
    wx.showModal({
      title: '删除联系人',
      content: `确定删除「${c.name}」吗？相关互动记录和待办也会一并删除。`,
      confirmText: '删除',
      confirmColor: '#C65D5D',
      success: (res) => {
        if (res.confirm) {
          this.doDelete();
        }
      },
    });
  },

  doDelete() {
    const token = api.getToken();
    wx.showLoading({ title: '删除中…' });
    wx.request({
      url: `https://api.welian.app/data/contacts?id=${this.contactId}`,
      method: 'DELETE',
      header: { 'Authorization': 'Bearer ' + token },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200 && res.data.ok) {
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 800);
        } else {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  addToCalendar(e) {
    const idx = e.currentTarget.dataset.index;
    const dates = this.data.contact.important_dates || [];
    const d = dates[idx];
    if (!d || !d.date) return;
    const year = new Date().getFullYear();
    const startDate = new Date(year + '-' + d.date.slice(5) + 'T09:00:00');
    wx.addPhoneCalendar({
      title: (this.data.contact.name || '') + ' ' + (d.label || d.name || '重要日期'),
      startTime: Math.floor(startDate.getTime() / 1000),
      allDay: false,
      alarm: true,
      alarmOffset: -86400,
      description: '来自 Welian 提醒',
      success: () => wx.showToast({ title: '已添加到日历', icon: 'success' }),
      fail: () => wx.showToast({ title: '添加失败', icon: 'none' }),
    });
  },

  onPullDownRefresh() {
    this.loadDetail();
    setTimeout(() => wx.stopPullDownRefresh(), 1000);
  },

  // ── Timeline 内联编辑 ──
  showAddTimeline() {
    this.setData({
      showTimelineForm: true,
      timelineEditId: '',
      timelineForm: { summary: '', date: new Date().toISOString().slice(0, 10) },
    });
  },

  editTimelineEntry(e) {
    const idx = e.currentTarget.dataset.index;
    const entry = this.data.timeline[idx];
    if (!entry) return;
    this.setData({
      showTimelineForm: true,
      timelineEditId: entry.id || '',
      timelineForm: { summary: entry.summary || '', date: (entry.date || '').slice(0, 10) },
    });
  },

  onTimelineInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`timelineForm.${field}`]: e.detail.value });
  },

  cancelTimelineForm() {
    this.setData({ showTimelineForm: false, timelineEditId: '' });
  },

  saveTimelineEntry() {
    const { summary, date } = this.data.timelineForm;
    if (!summary.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    this.setData({ savingTimeline: true });
    const token = api.getToken();
    const contact = this.data.contact;
    const isEdit = !!this.data.timelineEditId;
    wx.request({
      url: 'https://api.welian.app/data/timeline',
      method: isEdit ? 'PUT' : 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: isEdit ? {
        id: this.data.timelineEditId,
        summary: summary.trim(),
        date: date || new Date().toISOString().slice(0, 10),
      } : {
        contact_name: contact.name,
        contact: contact.id,
        summary: summary.trim(),
        date: date || new Date().toISOString().slice(0, 10),
      },
      success: (res) => {
        this.setData({ savingTimeline: false });
        if (res.statusCode === 200) {
          wx.showToast({ title: '已保存', icon: 'success' });
          this.setData({ showTimelineForm: false, timelineEditId: '' });
          this.loadTimeline(contact.name);
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ savingTimeline: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  deleteTimelineEntry(e) {
    const idx = e.currentTarget.dataset.index;
    const entry = this.data.timeline[idx];
    if (!entry || !entry.id) {
      wx.showToast({ title: '无法删除此记录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除互动记录',
      content: '确定删除这条记录吗？',
      confirmText: '删除',
      confirmColor: '#C65D5D',
      success: (res) => {
        if (res.confirm) {
          const token = api.getToken();
          wx.request({
            url: `https://api.welian.app/data/timeline?id=${entry.id}`,
            method: 'DELETE',
            header: { 'Authorization': 'Bearer ' + token },
            success: (r) => {
              if (r.statusCode === 200) {
                wx.showToast({ title: '已删除', icon: 'success' });
                this.loadTimeline(this.data.contact.name);
              } else {
                wx.showToast({ title: '删除失败', icon: 'none' });
              }
            },
            fail: () => wx.showToast({ title: '网络错误', icon: 'none' }),
          });
        }
      },
    });
  },

  // ── Web搜索联系人动态 ──
  webSearch() {
    const contact = this.data.contact;
    if (!contact || !contact.name) return;
    this.setData({ webSearching: true, webResults: [] });
    const token = api.getToken();
    wx.request({
      url: 'https://api.welian.app/ai/search',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: { query: contact.name + ' ' + (contact.company || '') },
      success: (res) => {
        this.setData({ webSearching: false });
        if (res.statusCode === 200 && res.data) {
          const results = res.data.results || res.data.web_results || [];
          this.setData({ webResults: results.slice(0, 5) });
          if (results.length === 0) {
            wx.showToast({ title: '未找到公开信息', icon: 'none' });
          }
        } else {
          wx.showToast({ title: '搜索失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ webSearching: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  // 分享关系体检报告给联系人
  // Privacy: use opaque contact_id instead of contact name; no inviter openid in URL
  onShareAppMessage() {
    const contact = this.data.contact;
    if (!contact) return {};
    return {
      title: `我给你做了一份关系体检报告`,
      path: `/pages/report/report?cid=${encodeURIComponent(contact.id || '')}`,
    };
  },

  onShareTimeline() {
    const contact = this.data.contact;
    if (!contact) return {};
    return {
      title: `Welian 关系体检`,
      query: `cid=${encodeURIComponent(contact.id || '')}`,
    };
  },
});
