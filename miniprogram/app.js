// app.js — Welian 小程序入口
// 维联：维系情感，联结目标

const api = require('./utils/api.js');

// 默认 config（网络拉取失败时的兜底，与后端 /ai/config 默认值一致）
const DEFAULT_CONFIG = {
  thresholds: {
    cooldown_leverage: 14,
    cooldown_nurture: 30,
    page_size_contacts: 100,
    page_size_search: 50,
    upcoming_dates_window: 30,
    dashboard_cache_sec: 30,
  },
  evolution_stages: [
    { name: '初生', icon: '🌱', min_contacts: 0, min_interactions: 0 },
    { name: '启蒙', icon: '✨', min_contacts: 3, min_interactions: 1 },
    { name: '成长', icon: '🌿', min_contacts: 10, min_interactions: 20 },
    { name: '成熟', icon: '🌳', min_contacts: 30, min_interactions: 100 },
    { name: '精通', icon: '🏆', min_contacts: 50, min_interactions: 300 },
  ],
  feature_flags: {
    signals: true,
    insights: true,
    evolution: true,
    meetings: true,
    upcoming_dates: true,
    todo_summary: true,
  },
  labels: {
    priority: { P1: '紧急', P2: '重要', P3: '一般' },
    postpone_days: [1, 3, 7, 14],
  },
  subscribe_templates: {
    todo_due: '3srg81ewNIb2rBGFL83DoPG22BuHMZxzVwGGoXsevKI',
  },
};

App({
  globalData: {
    userInfo: null,
    plan: 'free',
    credits: 100,
    config: DEFAULT_CONFIG,  // 后端配置驱动，启动时拉取
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

  // 登录 Promise — 页面通过 await app.loginReady 等待登录完成
  loginReady: null,
  // config 就绪 Promise — 页面通过 await app.configReady 等待配置加载
  configReady: null,

  onLaunch(options) {
    console.log('Welian 小程序启动 — 更用心 ∞');
    this._parseShareContext(options);
    // 启动登录，暴露 Promise 给页面 await
    this.loginReady = this._autoLogin();
    // 拉取后端配置（不阻塞登录，独立进行）
    this.configReady = this._fetchConfig();
  },

  onShow(options) {
    // 从后台切回前台时也可能带新的分享上下文
    if (options && options.query && (options.query.contact || options.query.inviter)) {
      this._parseShareContext(options);
    }
  },

  // 解析分享卡片携带的上下文：contact=姓名 & inviter=openid & shareTicket
  _parseShareContext(options) {
    let inviter = '';
    let socialContact = '';
    let socialInviter = '';
    let shareTicket = '';

    if (options && options.query) {
      inviter = options.query.inviter || '';
      socialContact = options.query.contact || '';
      socialInviter = options.query.inviter || '';
      shareTicket = options.shareTicket || '';
    } else if (options && options.scene) {
      const scene = decodeURIComponent(options.scene);
      const match = scene.match(/inviter=([A-Z0-9]+)/);
      if (match) inviter = match[1];
    }

    this._inviter = inviter;
    this._socialContact = socialContact;
    this._socialInviter = socialInviter;
    // shareTicket 存在 → 群聊场景；不存在 → 单聊场景（高置信度）
    this._socialIsPrivate = shareTicket ? false : true;
    this._shareTicket = shareTicket;
  },

  // 拉取后端配置（7天本地缓存，失败用默认值兜底）
  _fetchConfig() {
    // 先用本地缓存（7天内有效）
    try {
      const cached = wx.getStorageSync('app_config');
      if (cached && cached.ts && Date.now() - cached.ts < 7 * 86400000) {
        this.globalData.config = { ...DEFAULT_CONFIG, ...cached.data };
        // 后台异步刷新，不阻塞
        this._refreshConfigFromNetwork();
        return Promise.resolve(this.globalData.config);
      }
    } catch (e) {}

    // 无缓存，同步拉取
    return this._refreshConfigFromNetwork();
  },

  _refreshConfigFromNetwork() {
    return new Promise((resolve) => {
      wx.request({
        url: 'https://api.welian.app/ai/config',
        method: 'GET',
        success: (res) => {
          if (res.statusCode === 200 && res.data) {
            const config = {
              thresholds: res.data.thresholds || DEFAULT_CONFIG.thresholds,
              evolution_stages: res.data.evolution_stages || DEFAULT_CONFIG.evolution_stages,
              feature_flags: res.data.feature_flags || DEFAULT_CONFIG.feature_flags,
              labels: res.data.labels || DEFAULT_CONFIG.labels,
              subscribe_templates: res.data.subscribe_templates || DEFAULT_CONFIG.subscribe_templates,
            };
            this.globalData.config = config;
            try {
              wx.setStorageSync('app_config', { data: config, ts: Date.now() });
            } catch (e) {}
            resolve(config);
          } else {
            resolve(this.globalData.config);
          }
        },
        fail: () => resolve(this.globalData.config),
      });
    });
  },

  // 获取 feature flag（页面调用 app.flag('insights')）
  flag(name) {
    const flags = this.globalData.config.feature_flags || {};
    return flags[name] !== false;  // 默认 true，只有显式 false 才关闭
  },

  // 获取阈值（页面调用 app.threshold('cooldown_leverage')）
  threshold(name) {
    const t = this.globalData.config.thresholds || {};
    return t[name];
  },

  // 自动静默登录 — 返回 Promise
  _autoLogin() {
    if (api.getToken()) {
      // 已登录，但如果有社交图谱上下文，仍需上报绑定
      if (this._socialContact && this._socialInviter) {
        this._reportSocialBinding();
      }
      return Promise.resolve();
    }
    const loginOpts = { inviter: this._inviter };
    if (this._socialContact) loginOpts.social_contact = this._socialContact;
    if (this._socialInviter) loginOpts.social_inviter = this._socialInviter;
    loginOpts.social_is_private = this._socialIsPrivate;
    return api.login(loginOpts).then(() => {
      // 如果当前在 welcome 页则跳首页
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      if (current && current.route === 'pages/welcome/welcome') {
        wx.switchTab({ url: '/pages/dashboard/dashboard' });
      }
    }).catch((err) => {
      console.error('[app] auto-login failed:', err);
      wx.reLaunch({ url: '/pages/welcome/welcome' });
      throw err;
    });
  },

  // 已登录用户打开分享卡片时，单独上报社交绑定
  _reportSocialBinding() {
    const token = api.getToken();
    if (!token || !this._socialContact || !this._socialInviter) return;
    wx.login({
      success: (res) => {
        if (!res.code) return;
        wx.request({
          url: 'https://api.welian.app/ai/wxmp_login',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: {
            code: res.code,
            social_contact: this._socialContact,
            social_inviter: this._socialInviter,
            social_is_private: this._socialIsPrivate,
          },
          success: (resp) => {
            if (resp.statusCode === 200 && resp.data.ok) {
              console.log('[social_graph] binding reported for', this._socialContact);
            }
          },
          fail: (err) => console.error('[social_graph] report failed:', err),
        });
      },
    });
  },
});
