// pages/contact-detail/contact-detail.js
const api = require('../../utils/api.js');

Page({
  data: {
    contact: null,
    loading: true,
    error: '',
    timeline: [],
    // 编辑
    showEdit: false,
    savingEdit: false,
    editForm: {},
    natureOptions: ['撬动（经营型）', '维系（陪伴型）', '双重'],
    natureValues: ['leverage', 'nurture', 'dual'],
    natureIndex: 0,
  },

  onLoad(options) {
    this.contactId = options.id;
    this.loadDetail();
  },

  loadDetail() {
    this.setData({ loading: true, error: '' });
    api.getContactDetail(this.contactId).then((contact) => {
      this.setData({ contact, loading: false });
      this.loadTimeline(contact.name);
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
          this.setData({ timeline: entries });
        }
      },
      fail: () => {},
    });
  },

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
        contact_name: contact.name,
        scenario: '问候',
        context: `关系：${contact.relationship || ''}，公司：${contact.company || ''}`,
      },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200 && res.data) {
          const draft = res.data.draft || res.data.text || '';
          wx.showModal({
            title: '消息草稿',
            content: draft,
            showCancel: true,
            cancelText: '重新生成',
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
    wx.request({
      url: 'https://api.welian.app/data/contacts',
      method: 'PUT',
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

  onPullDownRefresh() {
    this.loadDetail();
    setTimeout(() => wx.stopPullDownRefresh(), 1000);
  },
});
