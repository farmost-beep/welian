// pages/onboarding/onboarding.js — 3 联系人快速激活
const api = require('../../utils/api.js');

const NATURE_LABELS = {
  leverage: '经营型',
  nurture: '陪伴型',
  dual: '双重',
};

Page({
  data: {
    currentName: '',
    currentNature: 'leverage',
    added: [],
    submitting: false,
    firstAdvise: '',
    autoFocus: true,
    nameError: '',
  },

  onLoad() {
    const app = getApp();
    if (app && app.globalData && app.globalData.openid) {
      this.checkExistingContacts();
    }
  },

  // 页面卸载（含系统返回键）— 标记 onboarded，防止 dashboard 空状态再次跳回
  onUnload() {
    const app = getApp();
    if (app && app.globalData) app.globalData.onboarded = true;
    try { wx.setStorageSync('welian_onboarded', true); } catch (e) {}
  },

  async checkExistingContacts() {
    try {
      const data = await api.request('/data/contacts?limit=1&compact=1');
      if (data && data.contacts && data.contacts.length >= 3) {
        wx.switchTab({ url: '/pages/dashboard/dashboard' });
      }
    } catch (e) {}
  },

  onNameInput(e) {
    this.setData({ currentName: e.detail.value, nameError: '' });
  },

  selectNature(e) {
    this.setData({ currentNature: e.currentTarget.dataset.nature });
  },

  addContact() {
    const name = this.data.currentName.trim();
    if (!name) {
      this.setData({ nameError: '请输入姓名' });
      return;
    }

    const added = this.data.added.concat([{
      name,
      nature: this.data.currentNature,
      natureLabel: NATURE_LABELS[this.data.currentNature] || '',
    }]);

    this.setData({
      added,
      currentName: '',
      autoFocus: true,
      nameError: '',
    });
  },

  // 删除已添加的联系人
  removeContact(e) {
    const index = e.currentTarget.dataset.index;
    const added = this.data.added.slice();
    added.splice(index, 1);
    this.setData({ added });
  },

  noop() {},

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
      }));

      const resp = await api.request('/ai/onboarding/create_contacts', { people }, 'POST');

      if (resp && resp.ok) {
        const app = getApp();
        if (app && app.globalData) app.globalData.onboarded = true;
        try { wx.setStorageSync('welian_onboarded', true); } catch (e) {}

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
    const app = getApp();
    if (app && app.globalData) app.globalData.onboarded = true;
    try { wx.setStorageSync('welian_onboarded', true); } catch (e) {}
    wx.switchTab({ url: '/pages/dashboard/dashboard' });
  },
});
