// pages/dashboard/dashboard.js — 角色仪表盘
// 基于真实 contacts + timeline 数据，按朋友/家人/合作者分组展示本月行为回顾
const api = require('../../utils/api.js');
const { buildRoles, classifyTodos, calcEvolutionStage, buildUpcomingDates } = require('../../utils/dashboard-logic.js');
const app = getApp();

Page({
  data: {
    roles: [],
    loading: true,
    error: '',
    isEmpty: false,  // 新用户无数据
    stats: {},
    signals: [],
    pendingCount: 0,
    todoSummary: null,  // { overdue: [], today: [] }
    evolution: null,    // { name, icon, progress, next, stages }
    evolutionMetrics: null, // { monthInteractions, totalInteractions, contactCount }
    stageUpgrade: null, // 升级提示 { name, icon, contacts, interactions }
    upcomingDates: [],  // 未来30天重要日期
    insights: [],       // AI 行为洞察
    flags: {},          // feature flags
    userName: '',
    syncPinned: false,
    _lastLoad: 0,
  },

  onUnload() {},

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
      this.getTabBar().refresh();
    }
    this.setData({ syncPinned: false });
    if (!api.getToken()) {
      this.setData({ loading: true });
      try { await app.loginReady; } catch (e) { return; }
    }
    // 30秒内不重复全量加载
    const now = Date.now();
    if (this.data._lastLoad && now - this.data._lastLoad < 30000 && this.data.roles.length > 0) {
      return;
    }
    this.setData({ _lastLoad: now });
    this.loadDashboard();
    this.checkSyncEntry();
  },

  onPullDownRefresh() {
    this.loadDashboard(() => wx.stopPullDownRefresh());
  },

  // 检查后端是否开启同步入口
  async checkSyncEntry() {
    try {
      const token = api.getToken();
      if (!token) return;
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: 'https://api.welian.app/data/entry',
          header: { 'Authorization': `Bearer ${token}` },
          success: resolve,
          fail: reject,
        });
      });
      if (res.statusCode === 200 && res.data && res.data.sync) {
        this.setData({ syncPinned: true });
      }
    } catch {}
  },

  loadDashboard(cb) {
    this.setData({ loading: true, error: '' });
    const token = api.getToken();
    if (!token) {
      this.setData({ loading: false, error: '请先登录' });
      if (cb) cb();
      return;
    }

    // 核心数据并行获取（首屏必需）
    Promise.all([
      this.fetchContacts(),
      this.fetchTimeline(),
      this.fetchTodos(),
      this.fetchContactStats(),
    ]).then(([contactData, timeline, todos, contactStats]) => {
      const contacts = contactData.contacts;
      const roles = buildRoles(contacts, timeline);
      // stats 用后端统计端点的数据（不受分页影响）
      const stats = {
        total: contactStats.total || contactData.total || contacts.length,
        leverage: contactStats.leverage || 0,
        nurture: contactStats.nurture || 0,
        dual: contactStats.dual || 0,
      };
      const isEmpty = contacts.length === 0;
      // 进化阶段（stages 从 config 读取，支持后端动态调整）
      const stages = app.globalData.config.evolution_stages;
      const totalContacts = contactData.total || contacts.length;
      const evolution = calcEvolutionStage(totalContacts, timeline.length, stages);
      // 进化指标（对齐 web 端 2x2 网格）
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthInteractions = timeline.filter(t => new Date(t.date || '') >= monthStart).length;
      const evolutionMetrics = {
        monthInteractions,
        totalInteractions: timeline.length,
        contactCount: totalContacts,
      };
      // 升级检测（用 storage 记录上次阶段）
      const prevStageIdx = wx.getStorageSync('welian_evolution_stage') || 0;
      if (evolution.idx > prevStageIdx) {
        wx.setStorageSync('welian_evolution_stage', evolution.idx);
        this.setData({ stageUpgrade: { name: evolution.name, icon: evolution.icon, contacts: totalContacts, interactions: timeline.length } });
      } else if (prevStageIdx === 0 && evolution.idx === 0) {
        wx.setStorageSync('welian_evolution_stage', 0);
      }
      // 近期重要日期（窗口天数从 config 读取）
      const windowDays = app.threshold('upcoming_dates_window') || 30;
      const upcomingDates = buildUpcomingDates(contacts, undefined, windowDays);
      // feature flags
      const flags = {
        signals: app.flag('signals'),
        insights: app.flag('insights'),
        evolution: app.flag('evolution'),
        upcoming_dates: app.flag('upcoming_dates'),
        todo_summary: app.flag('todo_summary'),
      };
      // 待办分类：逾期 + 今日
      const todoSummary = classifyTodos(todos);
      this.setData({
        roles,
        stats,
        isEmpty,
        pendingCount: todos.length,
        todoSummary,
        evolution,
        evolutionMetrics,
        upcomingDates,
        flags,
        loading: false,
      });
      if (cb) cb();

      // 非首屏数据异步加载（不阻塞渲染）
      this.fetchSignals().then((signals) => {
        this.setData({ signals: signals.slice(0, 3) });
      }).catch(() => {});
      this.fetchProfile().then((profile) => {
        this.setData({ userName: profile.name || '' });
      }).catch(() => {});
      this.fetchInsights().then((insights) => {
        this.setData({ insights });
      }).catch(() => {});
    }).catch((err) => {
      this.setData({ loading: false, error: err.message || '加载失败' });
      if (cb) cb();
    });
  },

  fetchContacts() {
    return new Promise((resolve) => {
      wx.request({
        url: 'https://api.welian.app/data/contacts?limit=100&compact=1',
        header: { 'Authorization': 'Bearer ' + api.getToken() },
        success: (res) => {
          if (res.statusCode === 200 && res.data) {
            resolve({ contacts: res.data.contacts || [], total: res.data.total || 0 });
          } else {
            resolve({ contacts: [], total: 0 });
          }
        },
        fail: () => resolve({ contacts: [], total: 0 }),
      });
    });
  },

  fetchContactStats() {
    return new Promise((resolve) => {
      wx.request({
        url: 'https://api.welian.app/data/contacts?stats=1',
        header: { 'Authorization': 'Bearer ' + api.getToken() },
        success: (res) => {
          if (res.statusCode === 200 && res.data) {
            resolve(res.data);
          } else {
            resolve({ total: 0, leverage: 0, nurture: 0, dual: 0 });
          }
        },
        fail: () => resolve({ total: 0, leverage: 0, nurture: 0, dual: 0 }),
      });
    });
  },

  fetchProfile() {
    return new Promise((resolve) => {
      wx.request({
        url: 'https://api.welian.app/data/profile',
        header: { 'Authorization': 'Bearer ' + api.getToken() },
        success: (res) => {
          if (res.statusCode === 200 && res.data && res.data.profile) {
            resolve(res.data.profile);
          } else {
            resolve({});
          }
        },
        fail: () => resolve({}),
      });
    });
  },

  fetchTimeline() {
    return new Promise((resolve) => {
      wx.request({
        url: 'https://api.welian.app/data/timeline?limit=100',
        header: { 'Authorization': 'Bearer ' + api.getToken() },
        success: (res) => {
          if (res.statusCode === 200 && res.data) {
            resolve(res.data.timeline || []);
          } else {
            resolve([]);
          }
        },
        fail: () => resolve([]),
      });
    });
  },

  fetchSignals() {
    return api.getSignals().then((report) => report.signals || []).catch(() => []);
  },

  fetchInsights() {
    return new Promise((resolve) => {
      wx.request({
        url: 'https://api.welian.app/ai/insights',
        header: { 'Authorization': 'Bearer ' + api.getToken() },
        success: (res) => {
          if (res.statusCode === 200 && res.data && res.data.insights) {
            resolve(res.data.insights);
          } else {
            resolve([]);
          }
        },
        fail: () => resolve([]),
      });
    });
  },

  fetchTodos() {
    return new Promise((resolve) => {
      wx.request({
        url: 'https://api.welian.app/data/todos?status=pending',
        header: { 'Authorization': 'Bearer ' + api.getToken() },
        success: (res) => {
          if (res.statusCode === 200 && res.data) {
            resolve(res.data.todos || []);
          } else {
            resolve([]);
          }
        },
        fail: () => resolve([]),
      });
    });
  },

  // 最近8周互动趋势 / 角色分组 / 待办分类 已提取到 utils/dashboard-logic.js


  // 一键拟消息：跳转到小维对话页，自动发起拟消息请求
  goDraftMessage(e) {
    const name = e.currentTarget.dataset.name;
    if (!name) return;
    wx.navigateTo({ url: `/pages/sync/sync?draft=${encodeURIComponent(name)}` });
  },

  goContacts() {
    wx.switchTab({ url: '/pages/contacts/contacts' });
  },

  goSignals() {
    wx.navigateTo({ url: '/pages/signals/signals' });
  },

  closeStageUpgrade() {
    this.setData({ stageUpgrade: null });
  },

  goWeekly() {
    wx.navigateTo({ url: '/pages/weekly/weekly' });
  },

  goMonthly() {
    wx.navigateTo({ url: '/pages/monthly/monthly' });
  },

  goAnnual() {
    wx.navigateTo({ url: '/pages/annual/annual' });
  },

  goMeetings() {
    wx.navigateTo({ url: '/pages/meetings/meetings' });
  },

  goTimeline() {
    wx.navigateTo({ url: '/pages/timeline/timeline' });
  },

  goSync() {
    wx.navigateTo({ url: '/pages/sync/sync' });
  },

  goTodos() {
    wx.switchTab({ url: '/pages/todos/todos' });
  },

  onShareAppMessage() {
    return {
      title: 'Welian — 更好的朋友、更好的家人、更好的合作者',
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
