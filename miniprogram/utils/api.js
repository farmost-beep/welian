// utils/api.js — API 调用封装
// 先写 mock 数据，真实接入留接口（agent tunnel 或 cloud worker）

const BASE_URL = 'https://agent.welian.app';  // agent tunnel（与 Web 端一致）
const USE_MOCK = true;                          // true=mock数据，false=真实请求

// ── Mock 数据 ──

const MOCK_DASHBOARD = {
  month: '七月',
  roles: [
    {
      key: 'friend',
      label: '作为朋友',
      icon: '🌱',
      items: [
        { text: '3 次走心的交流（老周、小林、阿May）', tone: 'normal' },
        { text: '老周父亲手术那天你发了消息——在场 ✓', tone: 'positive' },
        { text: '重新联系了大学室友阿强（隔了 2 年）', tone: 'normal' },
      ],
    },
    {
      key: 'family',
      label: '作为家人',
      icon: '🏡',
      items: [
        { text: '给爸妈打了 4 个电话（上月 2 个 ↑）', tone: 'positive' },
        { text: '儿子家长会：出席了 ✓', tone: 'positive' },
        { text: '⚠️ 下周三结婚纪念日，别忘了', tone: 'warning' },
      ],
    },
    {
      key: 'collaborator',
      label: '作为合作者',
      icon: '🤝',
      items: [
        { text: '答应的事做到了 5 件，做到率 83%', tone: 'normal' },
        { text: '你帮别人牵了 2 次线（好关系是互相搭桥）', tone: 'positive' },
        { text: '张总项目验收如期完成 → 已记下', tone: 'normal' },
      ],
    },
  ],
};

const MOCK_CONTACTS = {
  leverage: [
    { id: 1, name: '王明', nature: '撬动', goals: ['事业'], how: '行业峰会资源引荐', lastContact: '3天前', cooldown: 'ok' },
    { id: 2, name: '张总', nature: '撬动', goals: ['事业'], how: '项目合作方', lastContact: '7天前', cooldown: 'ok' },
    { id: 3, name: '李博', nature: '撬动', goals: ['事业', '学习'], how: '学术引荐人', lastContact: '15天前', cooldown: 'warn' },
    { id: 4, name: '陈姐', nature: '双重', goals: ['事业'], how: '前同事，现创业合作', lastContact: '2天前', cooldown: 'ok' },
  ],
  nurture: [
    { id: 5, name: '老周', nature: '维系', bond: '十五年老友', lastContact: '2天前', nextDate: null },
    { id: 6, name: '爸妈', nature: '维系', bond: '家人', lastContact: '5天前', nextDate: '11-29 生日' },
    { id: 7, name: '小林', nature: '维系', bond: '大学室友', lastContact: '1周前', nextDate: null },
    { id: 8, name: '阿May', nature: '双重', bond: '闺蜜+同行', lastContact: '3天前', nextDate: '12-02 生日' },
  ],
};

const MOCK_WEEKLY = {
  weekRange: '7月8日 - 7月14日',
  sections: [
    {
      title: '上周回顾',
      items: [
        '记录了 6 条互动（朋友 3、家人 1、合作者 2）',
        '在场 1 次：老周父亲手术发消息',
        '做到 2 件：张总项目验收、帮李博牵线',
      ],
    },
    {
      title: '这周值得联系',
      items: [
        { name: '李博', reason: '已 15 天未联系，上次聊到学术引荐', type: 'leverage' },
        { name: '爸妈', reason: '下周三结婚纪念日，提前准备', type: 'nurture' },
        { name: '阿强', reason: '刚重新联系，趁热打铁约一次', type: 'nurture' },
      ],
    },
    {
      title: '重要日期提醒',
      items: [
        '⚠️ 7月17日（周三）— 结婚纪念日',
        '🎂 11月29日 — 妈妈生日（还有 135 天）',
      ],
    },
  ],
};

const MOCK_BILLING = {
  plan: 'free',
  planLabel: 'Free',
  credits: 73,
  creditsTotal: 100,
  creditsResetAt: '8月1日',
  plans: [
    {
      key: 'free',
      name: 'Free',
      price: 0,
      credits: 100,
      unit: '点/月',
      features: ['记录 unlimited', '基础提醒', '100 AI 点/月'],
      current: true,
    },
    {
      key: 'pro',
      name: 'Pro',
      price: 29,
      credits: 500,
      unit: '点/月',
      features: ['记录 unlimited', '建议引擎', 'AI 拟稿', '500 AI 点/月', '角色仪表盘', '年度报告'],
      current: false,
    },
  ],
};

// ── 请求封装 ──

function request(path, data, method = 'GET') {
  if (USE_MOCK) {
    return Promise.resolve(getMock(path));
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + path,
      method,
      data,
      header: { 'Content-Type': 'application/json' },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(new Error('请求失败: ' + res.statusCode));
        }
      },
      fail: (err) => reject(err),
    });
  });
}

function getMock(path) {
  switch (path) {
    case '/dashboard': return MOCK_DASHBOARD;
    case '/contacts':  return MOCK_CONTACTS;
    case '/weekly':    return MOCK_WEEKLY;
    case '/billing':   return MOCK_BILLING;
    default:           return null;
  }
}

// ── 对外 API ──

module.exports = {
  // 角色仪表盘（月度）
  getDashboard() {
    return request('/dashboard');
  },

  // 关系列表（按撬动型/维系型分组）
  getContacts() {
    return request('/contacts');
  },

  // 周报
  getWeekly() {
    return request('/weekly');
  },

  // 充值/套餐信息
  getBilling() {
    return request('/billing');
  },

  // 升级套餐（占位）
  upgradePlan(planKey) {
    if (USE_MOCK) return Promise.resolve({ success: true, plan: planKey });
    return request('/billing/upgrade', { plan: planKey }, 'POST');
  },

  // 搜索联系人（占位）
  searchContacts(keyword) {
    if (USE_MOCK) {
      const all = [...MOCK_CONTACTS.leverage, ...MOCK_CONTACTS.nurture];
      if (!keyword) return Promise.resolve(all);
      return Promise.resolve(all.filter(c => c.name.includes(keyword)));
    }
    return request('/contacts/search', { q: keyword }, 'GET');
  },
};
