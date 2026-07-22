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
      api.login().then((result) => {
        this.globalData.isLoggedIn = true;
        this.checkBindingStatus(result.is_registered);
      }).catch((err) => {
        console.error('[app] Login failed:', err.message);
      });
    } else {
      this.globalData.isLoggedIn = true;
      this.checkBindingStatus();
    }
  },

  // 检查注册/绑定状态
  checkBindingStatus(loginIsRegistered) {
    const token = api.getToken();
    if (!token) return;
    // token 以 user_ 开头 = 已绑定 Web 账号（一键注册创建Clerk账号后也是这个前缀）
    // token 以 wxmp_ 开头 = 小程序独立用户（未注册或老用户）
    const isBound = token.startsWith('user_');
    this.globalData.isBound = isBound;
    // 已绑定 → 无需检查注册状态
    if (isBound) return;
    // 检查是否已注册：优先用 login 返回的 is_registered，其次查本地缓存
    const isRegistered = loginIsRegistered || wx.getStorageSync('welian_registered');
    if (!isRegistered) {
      // 未注册也未绑定 → 跳转 welcome 页
      wx.reLaunch({ url: '/pages/welcome/welcome' });
    }
  },
});
