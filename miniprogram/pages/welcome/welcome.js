// pages/welcome/welcome.js — 登录降级页（自动登录失败时展示）
const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    loggingIn: false,
    inviter: '',
  },

  onLoad(options) {
    // From invite QR code: scene = "inviter=CODE"
    if (options.scene) {
      const scene = decodeURIComponent(options.scene);
      const match = scene.match(/inviter=([A-Z0-9]+)/);
      if (match) {
        this.setData({ inviter: match[1] });
      }
    }
    // From direct share link
    if (options.inviter) {
      this.setData({ inviter: options.inviter });
    }
    this.checkStatus();
  },

  async checkStatus() {
    const token = api.getToken();
    if (token) {
      // 已登录 → 直接进首页
      wx.switchTab({ url: '/pages/dashboard/dashboard' });
      return;
    }
    // 等 app.js 的自动登录完成
    try {
      await app.loginReady;
      // 登录完成后再次检查 token（防止 loginReady 是旧 promise）
      if (api.getToken()) {
        wx.switchTab({ url: '/pages/dashboard/dashboard' });
      }
      // 没 token 说明 loginReady 是旧的 resolved promise，停在 welcome 等手动重试
    } catch (e) {
      // 自动登录失败 → 停在 welcome 页，等用户手动重试
    }
  },

  // 手动重试登录
  retryLogin() {
    if (this.data.loggingIn) return;
    this.setData({ loggingIn: true });
    api.login(this.data.inviter).then(() => {
      this.setData({ loggingIn: false });
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/dashboard/dashboard' });
      }, 800);
    }).catch(() => {
      this.setData({ loggingIn: false });
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
    });
  },

  onShow() {},

  onShareAppMessage() {
    return {
      title: 'Welian ∞ — 更好的朋友、更好的家人、更好的合作者',
      path: '/pages/welcome/welcome',
    };
  },

  onShareTimeline() {
    return {
      title: 'Welian ∞ — 更好的朋友、更好的家人、更好的合作者',
      query: '',
    };
  },
});
