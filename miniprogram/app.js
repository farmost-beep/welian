// app.js — Welian 小程序入口
// 维联：维系情感，联结目标

const api = require('./utils/api.js');

App({
  globalData: {
    userInfo: null,
    plan: 'free',
    credits: 100,
    isLoggedIn: false,
    isBound: false,
    theme: {
      bg: '#F5F4EE',
      surface: '#EDEBE3',
      surface2: '#E4E1D6',
      border: '#D9D5C7',
      text: '#1A1915',
      dim: '#6B6860',
      dimmer: '#9A968C',
      accent: '#C96442',
      accentBg: '#F2E8E0',
      green: '#4A7C59',
    },
  },

  onLaunch() {
    console.log('Welian 小程序启动 — 更用心 ∞');
    // Auto-login on launch
    if (!api.isLoggedIn()) {
      api.login().then(() => {
        this.globalData.isLoggedIn = true;
        this.checkBindingStatus();
      }).catch((err) => {
        console.error('[app] Login failed:', err.message);
      });
    } else {
      this.globalData.isLoggedIn = true;
      this.checkBindingStatus();
    }
  },

  // 检查注册/绑定状态
  checkBindingStatus() {
    const token = api.getToken();
    if (!token) return;
    // token 以 user_ 开头 = 已绑定 Web 账号
    // token 以 wxmp_ 开头 = 小程序独立用户（注册或未注册）
    const isBound = token.startsWith('user_');
    this.globalData.isBound = isBound;
    // 检查是否已注册
    const isRegistered = wx.getStorageSync('welian_registered');
    if (!isBound && !isRegistered) {
      // 未注册也未绑定 → 跳转 welcome 页
      wx.reLaunch({ url: '/pages/welcome/welcome' });
    }
  },
});
