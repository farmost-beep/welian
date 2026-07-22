// pages/contact-detail/contact-detail.js
const api = require('../../utils/api.js');

Page({
  data: {
    contact: null,
    loading: true,
    error: '',
    timeline: [],
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

  onPullDownRefresh() {
    this.loadDetail();
    setTimeout(() => wx.stopPullDownRefresh(), 1000);
  },
});
