// pages/onboarding/onboarding.js — 3 联系人快速激活
const api = require('../../utils/api.js');

const NATURE_LABELS = {
  leverage: '经营型',
  nurture: '陪伴型',
  dual: '双重',
};

Page({
  data: {
    step: 1,
    currentName: '',
    currentNature: 'leverage',
    currentRelationship: '',
    added: [],
    submitting: false,
    firstAdvise: '',
    autoFocus: true,
  },

  onLoad() {
    // 检查是否已完成 onboarding
    const app = getApp();
    if (app && app.globalData && app.globalData.openid) {
      // 已登录用户，检查是否已有联系人
      this.checkExistingContacts();
    }
  },

  async checkExistingContacts() {
    try {
      const data = await api.request('/data/contacts?limit=1&compact=1');
      if (data && data.contacts && data.contacts.length >= 3) {
        // 已有足够联系人，直接进 dashboard
        wx.switchTab({ url: '/pages/dashboard/dashboard' });
      }
    } catch (e) {
      // 读取失败，继续 onboarding
    }
  },

  onNameInput(e) {
    this.setData({ currentName: e.detail.value });
  },

  onRelInput(e) {
    this.setData({ currentRelationship: e.detail.value });
  },

  selectNature(e) {
    this.setData({ currentNature: e.currentTarget.dataset.nature });
  },

  addContact() {
    const name = this.data.currentName.trim();
    if (!name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }

    const added = this.data.added.concat([{
      name,
      nature: this.data.currentNature,
      relationship: this.data.currentRelationship.trim(),
      natureLabel: NATURE_LABELS[this.data.currentNature] || '',
    }]);

    this.setData({
      added,
      step: Math.min(this.data.step + 1, 3),
      currentName: '',
      currentRelationship: '',
      autoFocus: true,
    });
  },

  async submitAll() {
    if (this.data.added.length < 1) {
      wx.showToast({ title: '请至少添加 1 位联系人', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      const people = this.data.added.map(c => ({
        name: c.name,
        nature: c.nature,
        relationship: c.relationship,
      }));

      const resp = await api.request('/ai/onboarding/create_contacts', { people }, 'POST');

      if (resp && resp.ok) {
        // 标记 onboarding 完成
        const app = getApp();
        if (app && app.globalData) {
          app.globalData.onboarded = true;
        }

        this.setData({
          firstAdvise: resp.first_advise || '已为你创建联系人，去仪表盘看看建议吧！',
          submitting: false,
        });
      } else {
        throw new Error(resp && resp.error ? resp.error : '提交失败');
      }
    } catch (e) {
      this.setData({ submitting: false });
      wx.showToast({ title: e.message || '提交失败，请重试', icon: 'none' });
    }
  },

  goDashboard() {
    wx.switchTab({ url: '/pages/dashboard/dashboard' });
  },

  skipOnboarding() {
    wx.switchTab({ url: '/pages/dashboard/dashboard' });
  },
});
