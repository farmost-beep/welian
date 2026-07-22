// pages/dashboard/dashboard.js — 角色仪表盘
// 基于真实 contacts + timeline 数据，按朋友/家人/合作者分组展示本月行为回顾
const api = require('../../utils/api.js');

Page({
  data: {
    month: '',
    roles: [],
    loading: true,
    error: '',
    isEmpty: false,  // 新用户无数据
    stats: {},
  },

  onShow() {
    this.loadDashboard();
  },

  onPullDownRefresh() {
    this.loadDashboard(() => wx.stopPullDownRefresh());
  },

  loadDashboard(cb) {
    this.setData({ loading: true, error: '' });
    const token = api.getToken();
    if (!token) {
      this.setData({ loading: false, error: '请先登录' });
      if (cb) cb();
      return;
    }

    // 并行获取 contacts + timeline
    Promise.all([
      this.fetchContacts(),
      this.fetchTimeline(),
    ]).then(([contacts, timeline]) => {
      const roles = this.buildRoles(contacts, timeline);
      const stats = this.buildStats(contacts, timeline);
      const isEmpty = contacts.length === 0;
      this.setData({
        month: this.getMonthName(),
        roles,
        stats,
        isEmpty,
        loading: false,
      });
      if (cb) cb();
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
            resolve(res.data.contacts || []);
          } else {
            resolve([]);
          }
        },
        fail: () => resolve([]),
      });
    });
  },

  fetchTimeline() {
    return new Promise((resolve) => {
      wx.request({
        url: 'https://api.welian.app/data/timeline',
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

  // 按 friend/family/collaborator 三角色分组
  buildRoles(contacts, timeline) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthTimeline = timeline.filter(t => {
      const d = new Date(t.date || '');
      return d >= monthStart;
    });

    // 按关系类型分组联系人
    const groups = { friend: [], family: [], collaborator: [] };
    for (const c of contacts) {
      const rel = (c.relationship || c.relation || '').toLowerCase();
      const nature = (c.nature || '').toLowerCase();
      // 判断角色
      let role = 'collaborator'; // 默认
      if (/家人|父母|爸|妈|妻|夫|儿子|女儿|兄弟|姐妹|家/.test(rel)) {
        role = 'family';
      } else if (/朋友|友|同学|室友|闺蜜|发小/.test(rel)) {
        role = 'friend';
      } else if (/合作|同事|客户|老板|领导|合作方|引荐/.test(rel) || nature === 'leverage') {
        role = 'collaborator';
      }
      groups[role].push(c);
    }

    // 为每个角色生成行为项
    const roleConfig = [
      { key: 'friend', label: '作为朋友', icon: '🌱' },
      { key: 'family', label: '作为家人', icon: '🏡' },
      { key: 'collaborator', label: '作为合作者', icon: '🤝' },
    ];

    return roleConfig.map(cfg => {
      const roleContacts = groups[cfg.key];
      const items = [];

      // 本月互动数
      const roleTimeline = monthTimeline.filter(t => {
        const contact = contacts.find(c => c.id === t.contact || c.name === t.contact_name);
        return contact && groups[cfg.key].includes(contact);
      });

      if (roleContacts.length === 0) {
        items.push({ text: '还没有记录这类关系，去「关系」页添加', tone: 'normal' });
      } else {
        items.push({ text: `本月记录了 ${roleTimeline.length} 次互动（涉及 ${roleContacts.length} 人）`, tone: roleTimeline.length > 0 ? 'positive' : 'normal' });

        // 列出本月互动过的人
        const interactedNames = [...new Set(roleTimeline.map(t => t.contact_name || t.contact).filter(Boolean))];
        if (interactedNames.length > 0) {
          items.push({ text: `在场：${interactedNames.slice(0, 5).join('、')}`, tone: 'positive' });
        }

        // 冷却预警（仅合作者）
        if (cfg.key === 'collaborator') {
          const cold = roleContacts.filter(c => {
            const last = roleTimeline
              .filter(t => t.contact === c.id || t.contact_name === c.name)
              .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
            if (!last) return true; // 从未联系
            const days = Math.floor((now - new Date(last.date)) / 86400000);
            return days >= 14;
          });
          if (cold.length > 0) {
            items.push({ text: `⚠️ ${cold.length} 人超过 14 天未联系：${cold.slice(0, 3).map(c => c.name).join('、')}`, tone: 'warning' });
          }
        }

        // 重要日期提醒（仅家人）
        if (cfg.key === 'family') {
          for (const c of roleContacts) {
            if (c.birthday) {
              const d = new Date(c.birthday);
              const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
              if (next < now) next.setFullYear(now.getFullYear() + 1);
              const days = Math.ceil((next - now) / 86400000);
              if (days <= 30) {
                items.push({ text: `🎂 ${c.name}生日还有 ${days} 天`, tone: 'warning' });
              }
            }
          }
        }
      }

      return { key: cfg.key, label: cfg.label, icon: cfg.icon, items };
    });
  },

  buildStats(contacts, timeline) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthTimeline = timeline.filter(t => new Date(t.date || '') >= monthStart);
    return {
      totalContacts: contacts.length,
      monthInteractions: monthTimeline.length,
      leverageCount: contacts.filter(c => ['leverage', 'dual', '双重'].includes(c.nature)).length,
      nurtureCount: contacts.filter(c => ['nurture', 'dual', '双重'].includes(c.nature)).length,
    };
  },

  getMonthName() {
    const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
    return months[new Date().getMonth()];
  },

  goContacts() {
    wx.switchTab({ url: '/pages/contacts/contacts' });
  },
});
