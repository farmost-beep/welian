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
    notLoggedIn: false,  // 未登录 — 展示空状态 shell（审核要求：可跳过登录体验）
    stats: {},
    signals: [],
    pendingCount: 0,
    todoSummary: null,  // { overdue: [], today: [] }
    evolution: null,    // { name, icon, progress, next, stages }
    evolutionMetrics: null, // { monthInteractions, totalInteractions, contactCount }
    stageUpgrade: null, // 升级提示 { name, icon, contacts, interactions }
    upcomingDates: [],  // 未来30天重要日期
    insights: [],       // AI 行为洞察
    behavioralInsights: null,  // R2-4: 自进化行为洞察 { insights, based_on }
    actionCard: null,          // R2-2: 本周最值得做的行动
    actionBusy: false,         // action request in flight
    drafting: false,            // draft request in flight
    flags: {},          // feature flags
    userName: '',
    _lastLoad: 0,
    // #1: 进化树
    treeAnimation: false,
    treeLeaf: '',
    // #3: 月度故事
    storyText: '',
    // #5: 季节性提醒
    seasonalCard: null,
  },

  onUnload() {},

  // 跳转登录页（未登录状态下用户主动点击登录）
  goLogin() {
    wx.navigateTo({ url: '/pages/welcome/welcome' });
  },

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    if (!api.getToken()) {
      this.setData({ loading: true });
      try { await app.loginReady; } catch (e) {
        // 自动登录失败 — 展示未登录状态，不卡永久 loading（审核要求：可跳过登录）
        this.setData({ loading: false, notLoggedIn: true });
        return;
      }
    }
    // Token ready — refresh tab bar to check sync entry
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().refresh();
    }
    // 30秒内不重复全量加载
    const now = Date.now();
    if (this.data._lastLoad && now - this.data._lastLoad < 30000 && this.data.roles.length > 0) {
      return;
    }
    this.setData({ _lastLoad: now });
    this.loadDashboard();
  },

  onPullDownRefresh() {
    this.loadDashboard(() => wx.stopPullDownRefresh());
  },

  loadDashboard(cb) {
    this.setData({ loading: true, error: '' });
    const token = api.getToken();
    if (!token) {
      this.setData({ loading: false, notLoggedIn: true });
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
      const roles = buildRoles(contacts, timeline, undefined, {
        role_config: app.globalData.config.role_config,
        family_keywords: app.globalData.config.family_keywords,
      });
      // stats 用后端统计端点的数据（不受分页影响）
      const stats = {
        total: contactStats.total || contactData.total || contacts.length,
        leverage: contactStats.leverage || 0,
        nurture: contactStats.nurture || 0,
        dual: contactStats.dual || 0,
      };
      const isEmpty = contacts.length === 0;
      // 空状态且未完成 onboarding → 跳转 onboarding 引导页
      // 检查 globalData + storage 持久标记（用户可能已跳过 onboarding）
      const onboarded = app.globalData.onboarded || wx.getStorageSync('welian_onboarded');
      if (isEmpty && !onboarded) {
        wx.navigateTo({ url: '/pages/onboarding/onboarding' });
        return;
      }
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
      // 升级检测（用 storage 记录已弹过的阶段，避免重复弹窗）
      const shownStages = wx.getStorageSync('welian_evolution_shown') || [];
      const prevStageIdx = wx.getStorageSync('welian_evolution_stage') || 0;
      if (evolution.idx > prevStageIdx && shownStages.indexOf(evolution.idx) === -1) {
        wx.setStorageSync('welian_evolution_stage', evolution.idx);
        wx.setStorageSync('welian_evolution_shown', shownStages.concat(evolution.idx));
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
        roles: app.flag('roles'),
      };
      // 待办分类：逾期 + 今日
      const todoSummary = classifyTodos(todos);
      // #3: 月度故事
      const storyText = this.buildStory(stats, evolutionMetrics, timeline, roles);
      // #5: 季节性提醒（后端驱动）
      const seasonalCard = app.getSeasonalCard();
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
        storyText,
        seasonalCard,
        loading: false,
      });
      // #1: 进化树呼吸动画
      this.setData({ treeAnimation: true });
      setTimeout(() => this.setData({ treeAnimation: false }), 2000);
      if (cb) cb();

      // 非首屏数据异步加载（不阻塞渲染）
      this.fetchSignals().then((signals) => {
        this.setData({ signals: signals.slice(0, 3) });
      }).catch(() => {});
      this.fetchInsights().then((insights) => {
        this.setData({ insights });
      }).catch(() => {});
      // 行为洞察已迁移到「我的」页
      // R2-2: 加载本周最值得做的行动
      this.fetchActionCard().then((ac) => {
        this.setData({ actionCard: ac });
      }).catch(() => {});
    }).catch((err) => {
      this.setData({ loading: false, error: err.message || '加载失败' });
      if (cb) cb();
    });
  },

  fetchContacts() {
    const token = api.getToken();
    const levReq = new Promise((resolve) => {
      wx.request({
        url: 'https://api.welian.app/data/contacts?limit=100&compact=1&nature=leverage',
        header: { 'Authorization': 'Bearer ' + token },
        success: (res) => resolve(res.statusCode === 200 ? (res.data.contacts || []) : []),
        fail: () => resolve([]),
      });
    });
    const nurReq = new Promise((resolve) => {
      wx.request({
        url: 'https://api.welian.app/data/contacts?limit=100&compact=1&nature=nurture',
        header: { 'Authorization': 'Bearer ' + token },
        success: (res) => resolve(res.statusCode === 200 ? (res.data.contacts || []) : []),
        fail: () => resolve([]),
      });
    });
    return Promise.all([levReq, nurReq]).then(([lev, nur]) => {
      // deduplicate dual contacts
      const levIds = new Set(lev.map(c => c.id));
      const all = lev.concat(nur.filter(c => !levIds.has(c.id)));
      return { contacts: all, total: all.length };
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

  // R2-4: 加载自进化行为洞察
  fetchBehavioralInsights() {
    return new Promise((resolve) => {
      wx.request({
        url: 'https://api.welian.app/ai/evolution',
        header: { 'Authorization': 'Bearer ' + api.getToken() },
        success: (res) => {
          if (res.statusCode === 200 && res.data && res.data.has_insights) {
            resolve(res.data);
          } else {
            resolve(null);
          }
        },
        fail: () => resolve(null),
      });
    });
  },

  // R2-4: 重置行为洞察
  resetBehavioralInsights() {
    wx.showModal({
      title: '重置行为洞察',
      content: '小维将忘记从你的行为中学到的内容，下次周报时会重新分析。',
      success: (res) => {
        if (!res.confirm) return;
        wx.request({
          url: 'https://api.welian.app/ai/evolution',
          method: 'DELETE',
          header: { 'Authorization': 'Bearer ' + api.getToken() },
          success: () => {
            this.setData({ behavioralInsights: null });
            wx.showToast({ title: '已重置', icon: 'success' });
          },
          fail: () => wx.showToast({ title: '重置失败', icon: 'none' }),
        });
      },
    });
  },

  // R2-2: 加载本周最值得做的行动
  fetchActionCard() {
    if (this.data.notLoggedIn || !api.getToken()) return Promise.resolve(null);
    return new Promise((resolve) => {
      wx.request({
        url: 'https://api.welian.app/ai/action_card',
        header: { 'Authorization': 'Bearer ' + api.getToken() },
        success: (res) => {
          if (res.statusCode === 200 && res.data && res.data.ok && res.data.action_card) {
            resolve(res.data.action_card);
          } else {
            resolve(null);
          }
        },
        fail: () => resolve(null),
      });
    });
  },

  // R2-2: 行动卡 — 拟消息（调用 /ai/draft 生成草稿并展示）
  onActionCardDraft(e) {
    if (this.data.notLoggedIn || !api.getToken() || this.data.actionBusy) return;
    const { actionId, actionVersion, contactId, todoId } = e.currentTarget.dataset;
    const card = this.data.actionCard;
    const contact = card && card.contact;
    if (!contact) return;
    const release = () => this.setData({ actionBusy: false, drafting: false });
    const version = actionVersion === undefined ? card.version : actionVersion;
    this.setData({ actionBusy: true, drafting: true });
    wx.showLoading({ title: '生成中…' });
    wx.request({
      url: 'https://api.welian.app/ai/draft',
      method: 'POST',
      header: { 'Authorization': 'Bearer ' + api.getToken(), 'Content-Type': 'application/json' },
      data: {
        name: contact.name,
        nature: contact.nature || '',
        last_interaction: '',
        user_context: card.suggested_topic ? `建议话题：${card.suggested_topic}` : '',
      },
      success: (res) => {
        wx.hideLoading();
        const draft = res.statusCode === 200 && res.data
          ? res.data.result || res.data.draft || res.data.text || ''
          : '';
        if (!draft) {
          release();
          wx.showToast({ title: '生成失败', icon: 'none' });
          return;
        }
        wx.request({
          url: 'https://api.welian.app/ai/action_card/confirm',
          method: 'POST',
          header: { 'Authorization': 'Bearer ' + api.getToken(), 'Content-Type': 'application/json' },
          data: {
            action: 'draft',
            action_id: actionId || card.action_id || card.id,
            contact_id: contactId,
            todo_id: todoId || undefined,
            version,
            draft_text: draft,
          },
          success: (confirmRes) => {
            if (confirmRes.statusCode !== 200 || !confirmRes.data || !confirmRes.data.ok) {
              release();
              wx.showToast({ title: '操作失败', icon: 'none' });
              return;
            }
            const confirmedVersion = confirmRes.data.version === undefined ? version : confirmRes.data.version;
            this.setData({ actionCard: { ...card, version: confirmedVersion } });
            wx.showModal({
              title: '消息草稿',
              content: draft,
              showCancel: true,
              cancelText: '重试',
              confirmText: '复制',
              success: (r) => {
                if (r.confirm) {
                  wx.setClipboardData({
                    data: draft,
                    success: () => {
                      this.setData({ actionCard: null });
                      this.fetchActionCard().then((ac) => this.setData({ actionCard: ac })).catch(() => {}).then(release);
                    },
                    fail: () => {
                      release();
                      wx.showToast({ title: '复制失败', icon: 'none' });
                    },
                  });
                } else if (r.cancel) {
                  const retryEvent = {
                    currentTarget: {
                      dataset: { ...e.currentTarget.dataset, actionVersion: confirmedVersion },
                    },
                  };
                  this.setData({ actionBusy: false, drafting: false }, () => this.onActionCardDraft(retryEvent));
                } else {
                  release();
                }
              },
              fail: release,
            });
          },
          fail: () => {
            release();
            wx.showToast({ title: '操作失败', icon: 'none' });
          },
        });
      },
      fail: () => {
        wx.hideLoading();
        release();
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  // R2-2: 行动卡 — 已联系
  onActionCardDone(e) {
    if (this.data.notLoggedIn || !api.getToken() || this.data.actionBusy) return;
    const { actionId, actionVersion, contactId, todoId } = e.currentTarget.dataset;
    const card = this.data.actionCard;
    if (!card) return;
    const release = () => this.setData({ actionBusy: false, drafting: false });
    this.setData({ actionBusy: true, drafting: false });
    wx.request({
      url: 'https://api.welian.app/ai/action_card/confirm',
      method: 'POST',
      header: { 'Authorization': 'Bearer ' + api.getToken(), 'Content-Type': 'application/json' },
      data: {
        action: 'done',
        action_id: actionId || card.action_id || card.id,
        contact_id: contactId,
        todo_id: todoId || undefined,
        version: actionVersion === undefined ? card.version : actionVersion,
        suggested_topic: card.suggested_topic || '',
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.ok) {
          wx.showToast({ title: res.data.message || '已记录', icon: 'success' });
          this.setData({ actionCard: null });
          this.fetchActionCard()
            .then((ac) => this.setData({ actionCard: ac }))
            .catch(() => {})
            .then(release);
        } else {
          release();
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
      fail: () => {
        release();
        wx.showToast({ title: '操作失败', icon: 'none' });
      },
    });
  },

  onActionCardSnooze(e) {
    if (this.data.notLoggedIn || !api.getToken() || this.data.actionBusy) return;
    const actionId = e && e.currentTarget && e.currentTarget.dataset.actionId;
    const actionVersion = e && e.currentTarget && e.currentTarget.dataset.actionVersion;
    const card = this.data.actionCard;
    if (!card) return;
    const contactId = card.contact ? card.contact.id : undefined;
    const todoId = card.todo_id || undefined;
    const perceptionId = card.perception_id || undefined;
    const release = () => this.setData({ actionBusy: false, drafting: false });
    this.setData({ actionBusy: true, drafting: false });
    wx.request({
      url: 'https://api.welian.app/ai/action_card/confirm',
      method: 'POST',
      header: { 'Authorization': 'Bearer ' + api.getToken(), 'Content-Type': 'application/json' },
      data: {
        action: 'snooze',
        action_id: actionId || card.action_id || card.id,
        contact_id: contactId,
        todo_id: todoId,
        perception_id: perceptionId,
        version: actionVersion === undefined ? card.version : actionVersion,
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.ok) {
          this.setData({ actionCard: null });
          this.fetchActionCard()
            .then((ac) => this.setData({ actionCard: ac }))
            .catch(() => {})
            .then(release);
        } else {
          release();
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
      fail: () => {
        release();
        wx.showToast({ title: '操作失败', icon: 'none' });
      },
    });
  },

  // R2-2: 行动卡 — 跳过（可选原因）
  onActionCardSkip(e) {
    if (this.data.notLoggedIn || !api.getToken() || this.data.actionBusy) return;
    const actionId = e && e.currentTarget && e.currentTarget.dataset.actionId;
    const actionVersion = e && e.currentTarget && e.currentTarget.dataset.actionVersion;
    const card = this.data.actionCard;
    if (!card) return;
    const contactId = card.contact ? card.contact.id : undefined;
    const todoId = card && card.todo_id ? card.todo_id : undefined;
    const perceptionId = card && card.perception_id ? card.perception_id : undefined;
    const release = () => this.setData({ actionBusy: false, drafting: false });

    // 先弹原因选择（可选，不强制）
    wx.showActionSheet({
      itemList: ['时机不对', '关系描述不准', '不想联系', '直接跳过'],
      success: (sheetRes) => {
        const reasons = ['timing', 'inaccurate', 'dont_want', ''];
        const skipReason = reasons[sheetRes.tapIndex] || '';
        this.setData({ actionBusy: true, drafting: false });
        wx.request({
          url: 'https://api.welian.app/ai/action_card/confirm',
          method: 'POST',
          header: { 'Authorization': 'Bearer ' + api.getToken(), 'Content-Type': 'application/json' },
          data: {
            action: 'skip',
            action_id: actionId || card.action_id || card.id,
            contact_id: contactId,
            todo_id: todoId,
            perception_id: perceptionId,
            version: actionVersion === undefined ? card.version : actionVersion,
            skip_reason: skipReason,
          },
          success: (res) => {
            if (res.statusCode === 200 && res.data && res.data.ok) {
              this.setData({ actionCard: null });
              this.fetchActionCard()
                .then((ac) => this.setData({ actionCard: ac }))
                .catch(() => {})
                .then(release);
            } else {
              release();
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          },
          fail: () => {
            release();
            wx.showToast({ title: '操作失败', icon: 'none' });
          },
        });
      },
      fail: () => {
        // 用户取消，不跳过
      },
    });
  },

  // R2-2: 行动卡整体点击（展开详情或跳转联系人）
  onActionCardTap() {
    // 整卡点击不做额外操作，按钮用 catchtap 阻止冒泡
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

  goTimeline() {
    wx.navigateTo({ url: '/pages/timeline/timeline' });
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

  // #3: 月度故事生成
  buildStory(stats, metrics, timeline, roles) {
    const monthCount = metrics.monthInteractions || 0;
    if (monthCount === 0) {
      return '这个月还没有互动记录。去和重要的人聊聊天吧，小维帮你记着。';
    }
    // 本月联系了多少不同的人
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthContacts = new Set(
      timeline.filter(t => new Date(t.date || '') >= monthStart)
        .map(t => t.contact_name || t.contact)
        .filter(Boolean)
    ).size;
    // 上月互动数对比
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastCount = timeline.filter(t => {
      const d = new Date(t.date || '');
      return d >= lastMonthStart && d < monthStart;
    }).length;
    const parts = [];
    parts.push(`这个月，你用心了 ${monthCount} 次，联系了 ${monthContacts} 个人。`);
    if (lastCount > 0) {
      if (monthCount > lastCount) {
        parts.push(`比上月多了 ${monthCount - lastCount} 次，你在更用心地经营关系。`);
      } else if (monthCount < lastCount) {
        parts.push(`上月是 ${lastCount} 次，这个月可以再主动一些。`);
      } else {
        parts.push(`和上月一样稳定。`);
      }
    }
    // 找到互动最多的人
    const contactCounts = {};
    timeline.filter(t => new Date(t.date || '') >= monthStart).forEach(t => {
      const name = t.contact_name || t.contact;
      if (name) contactCounts[name] = (contactCounts[name] || 0) + 1;
    });
    const topName = Object.entries(contactCounts).sort((a, b) => b[1] - a[1])[0];
    if (topName && topName[1] >= 2) {
      parts.push(`和 ${topName[0]} 互动最多，${topName[1]} 次。`);
    }
    return parts.join('');
  },

  // #2: 记录互动后的温暖反馈（文案后端驱动）
  showWarmFeedback(contactName) {
    const msg = app.getWarmMessage(contactName);
    wx.showToast({ title: msg, icon: 'none', duration: 2500 });
    // #1: 触发树叶动画
    const leaves = ['🌸', '🌺', '✨'];
    this.setData({ treeLeaf: leaves[Math.floor(Math.random() * leaves.length)], treeAnimation: true });
    setTimeout(() => this.setData({ treeLeaf: '' }), 2000);
    setTimeout(() => this.setData({ treeAnimation: false }), 2000);
  },
});
