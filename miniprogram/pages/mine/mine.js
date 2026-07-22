// pages/mine/mine.js — 我的（tabBar 第三页）
const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    plan: 'free',
    planLabel: 'Free',
    credits: 100,
    openid: '',
    isBound: false,
    bindEmail: '',
    bindMsg: '',
  },

  onShow() {
    const g = app.globalData;
    this.setData({
      plan: g.plan,
      planLabel: g.plan === 'pro' ? 'Pro' : 'Free',
      credits: g.credits,
    });
    // Check binding status
    this.checkBinding();
  },

  checkBinding() {
    const token = api.getToken();
    if (!token) return;
    // If token starts with wxmp_, not bound; if starts with user_, bound
    const isBound = token.startsWith('user_');
    this.setData({ isBound });
    // Get openid from token (wxmp_<openid>:secret)
    if (!isBound && token.startsWith('wxmp_')) {
      const openid = token.substring(5, token.indexOf(':'));
      this.setData({ openid });
    }
  },

  goWeekly() {
    wx.navigateTo({ url: '/pages/weekly/weekly' });
  },

  goBilling() {
    wx.navigateTo({ url: '/pages/billing/billing' });
  },

  onBindInput(e) {
    this.setData({ bindEmail: e.detail.value });
  },

  // 绑定 Web 账号
  bindWebAccount() {
    const { openid, bindEmail } = this.data;
    if (!openid) {
      this.setData({ bindMsg: '请先登录' });
      return;
    }
    if (!bindEmail || !bindEmail.includes('@')) {
      this.setData({ bindMsg: '请输入有效邮箱' });
      return;
    }
    this.setData({ bindMsg: '绑定中…' });
    wx.request({
      url: 'https://api.welian.app/ai/wxmp_bind',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { openid, email: bindEmail.trim().toLowerCase() },
      success: (res) => {
        if (res.statusCode === 200 && res.data.ok) {
          api.clearToken();
          wx.setStorageSync('welian_token', res.data.token);
          this.setData({ bindMsg: res.data.message, isBound: true });
          wx.showToast({ title: '绑定成功', icon: 'success' });
        } else {
          this.setData({ bindMsg: res.data.error || '绑定失败' });
        }
      },
      fail: () => this.setData({ bindMsg: '网络错误' }),
    });
  },
});
