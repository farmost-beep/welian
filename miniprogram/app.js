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
    { name: '萌芽', icon: '🌿', min_contacts: 3, min_interactions: 1 },
    { name: '成树', icon: '🌳', min_contacts: 10, min_interactions: 20 },
    { name: '开花', icon: '🌸', min_contacts: 30, min_interactions: 100 },
    { name: '盛放', icon: '🌺', min_contacts: 50, min_interactions: 300 },
  ],
  feature_flags: {
    signals: true,
    insights: true,
    evolution: true,
    meetings: true,
    upcoming_dates: true,
    todo_summary: true,
    roles: true,
  },
  labels: {
    priority: { P1: '紧急', P2: '重要', P3: '一般' },
    postpone_days: [1, 3, 7, 14],
  },
  // #2: 温暖反馈消息池（后端驱动，默认值兜底）
  warm_messages: [
    '记下了。{name} 知道你用心了',
    '已记录。用心的人，关系不会差',
    '记下了。每一段关系都值得被记住',
    '已记录。{name} 收到你的消息一定很开心',
    '记下了。你正在成为一个更好的朋友',
  ],
  // #5: 季节性提醒（后端驱动，默认值兜底）
  seasonal_cards: [
    { month: 1, day_start: 15, day_end: 31, emoji: '🧧', title: '快过年了', hint: '给家人和恩师问候一下？' },
    { month: 2, day_start: 1, day_end: 20, emoji: '🧧', title: '新年刚过', hint: '给拜年时聊到的人跟进一下' },
    { month: 3, day_start: 1, day_end: 14, emoji: '🌸', title: '春天来了', hint: '适合约老朋友出来走走' },
    { month: 5, day_start: 1, day_end: 10, emoji: '💐', title: '母亲节快到了', hint: '记得给妈妈打个电话' },
    { month: 6, day_start: 10, day_end: 25, emoji: '🎓', title: '毕业季', hint: '你的校友们最近怎么样？' },
    { month: 9, day_start: 10, day_end: 25, emoji: '🌕', title: '快中秋了', hint: '团圆的日子，记得给远方的人发个消息' },
    { month: 12, day_start: 20, day_end: 31, emoji: '❄️', title: '年末了', hint: '给这一年帮过你的人说声感谢' },
  ],
  // 角色配置（后端驱动，默认值兜底）
  role_config: [
    { key: 'friend', label: '作为朋友', icon: '🌱', cold_days: 30 },
    { key: 'family', label: '作为家人', icon: '🏡', cold_days: 30 },
    { key: 'collaborator', label: '作为合作者', icon: '🤝', cold_days: 14 },
  ],
  // 家人关键词（后端驱动，影响 dual 联系人分类）
  family_keywords: ['家人', '父母', '爸妈', '爸爸', '妈妈', '妻', '夫', '儿子', '女儿', '兄弟', '姐妹', '父', '母', '哥', '嫂', '弟', '妹', '舅', '姨', '叔', '伯', '姑', '外婆', '外公', '爷爷', '奶奶'],
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
        // 深合并 feature_flags：旧缓存可能缺少新 flag，用默认值补齐
        this.globalData.config = {
          ...DEFAULT_CONFIG,
          ...cached.data,
          feature_flags: { ...DEFAULT_CONFIG.feature_flags, ...(cached.data.feature_flags || {}) },
          warm_messages: cached.data.warm_messages || DEFAULT_CONFIG.warm_messages,
          seasonal_cards: cached.data.seasonal_cards || DEFAULT_CONFIG.seasonal_cards,
          role_config: cached.data.role_config || DEFAULT_CONFIG.role_config,
          family_keywords: cached.data.family_keywords || DEFAULT_CONFIG.family_keywords,
        };
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
              feature_flags: { ...DEFAULT_CONFIG.feature_flags, ...(res.data.feature_flags || {}) },
              labels: res.data.labels || DEFAULT_CONFIG.labels,
              subscribe_templates: res.data.subscribe_templates || DEFAULT_CONFIG.subscribe_templates,
              warm_messages: res.data.warm_messages || DEFAULT_CONFIG.warm_messages,
              seasonal_cards: res.data.seasonal_cards || DEFAULT_CONFIG.seasonal_cards,
              role_config: res.data.role_config || DEFAULT_CONFIG.role_config,
              family_keywords: res.data.family_keywords || DEFAULT_CONFIG.family_keywords,
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

  // #2: 获取随机温暖反馈消息（后端驱动文案）
  getWarmMessage(name) {
    const msgs = this.globalData.config.warm_messages || [];
    if (msgs.length === 0) return '已记录';
    const msg = msgs[Math.floor(Math.random() * msgs.length)];
    return msg.replace('{name}', name || '');
  },

  // #5: 获取当前季节性提醒卡片（后端驱动配置）
  getSeasonalCard() {
    const cards = this.globalData.config.seasonal_cards || [];
    const now = new Date();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    for (const c of cards) {
      if (c.month === m && d >= c.day_start && d <= c.day_end) {
        return { emoji: c.emoji, title: c.title, hint: c.hint };
      }
    }
    return null;
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
      // 不强制 reLaunch 到 welcome — dashboard 已处理未登录态（notLoggedIn）
      // 强制 reLaunch 会在网络延迟失败时把已跳过的用户送回登录页
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
