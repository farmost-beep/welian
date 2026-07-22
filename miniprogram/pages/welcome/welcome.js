// pages/welcome/welcome.js — 新用户引导注册页
const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    registering: false,
    hasExistingAccount: false,
    openid: '',
  },

  onLoad() {
    // 获取 openid（从 token 中提取）
    const token = api.getToken();
    if (token && token.startsWith('wxmp_')) {
      const openid = token.substring(5, token.indexOf(':'));
      this.setData({ openid });
    }
  },

  // 一键注册
  register() {
    const { openid, registering } = this.data;
    if (registering) return;
    if (!openid) {
      wx.showToast({ title: '请先登录微信', icon: 'none' });
      return;
    }
    this.setData({ registering: true });
    wx.request({
      url: 'https://api.welian.app/ai/wxmp_register',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { openid, nickname: app.globalData.userInfo?.nickName || '' },
      success: (res) => {
        if (res.statusCode === 200 && res.data.ok) {
          api.clearToken();
          wx.setStorageSync('welian_token', res.data.token);
          this.setData({ registering: false });
          wx.showToast({ title: '注册成功', icon: 'success' });
          // 跳转到首页
          setTimeout(() => {
            wx.switchTab({ url: '/pages/signals/signals' });
          }, 1000);
        } else {
          this.setData({ registering: false });
          wx.showToast({ title: res.data.error || '注册失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ registering: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  // 已有账号 → 跳转绑定
  goBind() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  onShareAppMessage() {
    return {
      title: 'Welian ∞ — 更好的朋友、更好的家人、更好的合作者',
      path: '/pages/welcome/welcome',
    };
  },
});
