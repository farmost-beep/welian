// app.js — Welian 小程序入口
// 维联：维系情感，联结目标

const api = require('./utils/api.js');

App({
  globalData: {
    userInfo: null,
    plan: 'free',
    credits: 100,
    isLoggedIn: false,
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
        if (result.isNewUser) {
          console.log('[app] New user logged in');
        }
      }).catch((err) => {
        console.error('[app] Login failed:', err.message);
      });
    } else {
      this.globalData.isLoggedIn = true;
    }
  },
});
