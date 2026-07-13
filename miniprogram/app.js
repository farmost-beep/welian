// app.js — Welian 小程序入口
// 维联：维系情感，联结目标

App({
  globalData: {
    // 用户状态
    userInfo: null,
    plan: 'free',        // 'free' | 'pro'
    credits: 100,         // 剩余额度
    // 配色（供页面引用）
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
    // 小程序启动时执行
    console.log('Welian 小程序启动 — 更用心 ∞');
  },
});
