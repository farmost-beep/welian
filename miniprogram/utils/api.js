// utils/api.js — API 调用封装（真实 API + 微信登录）
const BASE_URL = 'https://api.welian.app';
const TOKEN_KEY = 'welian_token';

// ── Token 管理 ──

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || '';
}

function setToken(token) {
  wx.setStorageSync(TOKEN_KEY, token);
}

function clearToken() {
  wx.removeStorageSync(TOKEN_KEY);
}

// ── 微信登录 ──

function login() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (!res.code) {
          reject(new Error('wx.login 未返回 code'));
          return;
        }
        // Exchange code for token via backend
        wx.request({
          url: BASE_URL + '/ai/wxmp_login',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { code: res.code },
          success: (resp) => {
            if (resp.statusCode === 200 && resp.data.ok) {
              setToken(resp.data.token);
              resolve({ token: resp.data.token, isNewUser: resp.data.is_new_user });
            } else {
              reject(new Error(resp.data.error || '登录失败'));
            }
          },
          fail: (err) => reject(err),
        });
      },
      fail: (err) => reject(err),
    });
  });
}

// 确保已登录（无 token 时自动 login）
async function ensureLogin() {
  let token = getToken();
  if (token) return token;
  const result = await login();
  return result.token;
}

// ── 请求封装 ──

function request(path, data, method = 'GET') {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const header = { 'Content-Type': 'application/json' };
    if (token) header['Authorization'] = 'Bearer ' + token;

    wx.request({
      url: BASE_URL + path,
      method,
      data,
      header,
      success: (res) => {
        if (res.statusCode === 401) {
          // Token expired — re-login and retry once
          clearToken();
          login().then(() => {
            request(path, data, method).then(resolve).catch(reject);
          }).catch(reject);
          return;
        }
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

// ── 对外 API ──

module.exports = {
  // 登录
  login,
  ensureLogin,
  getToken,
  clearToken,
  isLoggedIn() { return !!getToken(); },

  // 仪表盘（从 advise_cloud 获取建议）
  getDashboard() {
    return request('/ai/advise_cloud', {}, 'POST').then((data) => {
      // Transform advise response to dashboard format
      if (!data || !data.ok) return { month: '', roles: [] };
      const advice = data.advice || '';
      const lines = advice.split('\n').filter(Boolean);
      return {
        month: new Date().toLocaleDateString('zh-CN', { month: 'long' }),
        roles: [{
          key: 'collaborator',
          label: '今日建议',
          icon: '🤝',
          items: lines.slice(0, 5).map(text => ({ text, tone: 'normal' })),
        }],
      };
    });
  },

  // 关系列表
  getContacts() {
    return request('/data/contacts').then((data) => {
      const contacts = data.contacts || [];
      const leverage = contacts.filter(c => c.nature === 'leverage' || c.nature === 'dual' || c.nature === '双重');
      const nurture = contacts.filter(c => c.nature === 'nurture' || c.nature === 'dual' || c.nature === '双重');
      return {
        leverage: leverage.map(formatContact),
        nurture: nurture.map(formatContact),
      };
    });
  },

  // 联系人详情
  getContactDetail(contactId) {
    return request('/data/contacts').then((data) => {
      const contacts = data.contacts || [];
      const contact = contacts.find(c => c.id === contactId);
      if (!contact) throw new Error('联系人不存在');
      return contact;
    });
  },

  // 周报
  getWeekly() {
    return request('/ai/weekly_report').then((data) => {
      if (!data || !data.ok) return { weekRange: '', sections: [] };
      const report = data.report || '';
      // Parse the text report into sections
      const sections = [];
      const lines = report.split('\n').filter(Boolean);
      let currentSection = null;
      for (const line of lines) {
        if (line.startsWith('##') || line.startsWith('📊') || line.startsWith('🔥') || line.startsWith('📅')) {
          currentSection = { title: line.replace(/^##\s*/, '').trim(), items: [] };
          sections.push(currentSection);
        } else if (currentSection && line.trim()) {
          currentSection.items.push(line.trim());
        }
      }
      return {
        weekRange: new Date().toLocaleDateString('zh-CN'),
        sections: sections.length > 0 ? sections : [{ title: '本周报告', items: lines.slice(0, 10) }],
      };
    });
  },

  // 充值/套餐信息
  getBilling() {
    return request('/data/metrics').then((data) => {
      return {
        plan: data.plan || 'free',
        planLabel: (data.plan || 'free') === 'pro' ? 'Pro' : 'Free',
        credits: data.credits || 100,
        creditsTotal: data.creditsTotal || 100,
        creditsResetAt: '下月1日',
        plans: [
          {
            key: 'free',
            name: 'Free',
            price: 0,
            credits: 100,
            unit: '点/月',
            features: ['记录 unlimited', '基础提醒', '100 AI 点/月'],
            current: (data.plan || 'free') === 'free',
          },
          {
            key: 'pro',
            name: 'Pro',
            price: 29,
            credits: 500,
            unit: '点/月',
            features: ['记录 unlimited', '建议引擎', 'AI 拟稿', '500 AI 点/月', '角色仪表盘', '年度报告'],
            current: data.plan === 'pro',
          },
        ],
      };
    }).catch(() => {
      // Fallback if metrics endpoint fails
      return {
        plan: 'free', planLabel: 'Free', credits: 100, creditsTotal: 100,
        creditsResetAt: '下月1日',
        plans: [
          { key: 'free', name: 'Free', price: 0, credits: 100, unit: '点/月', features: ['记录 unlimited', '基础提醒', '100 AI 点/月'], current: true },
          { key: 'pro', name: 'Pro', price: 29, credits: 500, unit: '点/月', features: ['记录 unlimited', '建议引擎', 'AI 拟稿', '500 AI 点/月', '角色仪表盘', '年度报告'], current: false },
        ],
      };
    });
  },

  // 升级套餐
  upgradePlan(planKey) {
    return request('/ai/billing/upgrade', { plan: planKey }, 'POST');
  },

  // 搜索联系人
  searchContacts(keyword) {
    return request('/data/contacts').then((data) => {
      const contacts = data.contacts || [];
      if (!keyword) return contacts.map(formatContact);
      return contacts.filter(c => (c.name || '').includes(keyword)).map(formatContact);
    });
  },

  // 信号预览（公开，无需登录）
  getSignals() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: BASE_URL + '/ai/signals_preview',
        method: 'GET',
        header: { 'Content-Type': 'application/json' },
        success: (res) => {
          if (res.statusCode === 200 && res.data) {
            resolve(res.data.report || { signals: [], themes: [] });
          } else {
            reject(new Error('获取信号失败'));
          }
        },
        fail: (err) => reject(err),
      });
    });
  },
};

// ── Helpers ──

function formatContact(c) {
  const natureMap = { leverage: '撬动', nurture: '维系', dual: '双重', '双重': '双重' };
  const nature = natureMap[c.nature] || c.nature || '撬动';
  const lastInteraction = c.last_interaction || c.lastContact;
  const daysSince = lastInteraction ? Math.floor((Date.now() - new Date(lastInteraction).getTime()) / 86400000) : null;

  return {
    id: c.id,
    name: c.name,
    nature,
    goals: c.goals || [],
    how: c.company || c.role || c.how || '',
    bond: c.relationship || c.bond || '',
    lastContact: daysSince !== null ? `${daysSince}天前` : '未记录',
    cooldown: daysSince !== null && daysSince > 14 ? 'warn' : 'ok',
    nextDate: c.birthday ? formatBirthday(c.birthday) : null,
    _raw: c,
  };
}

function formatBirthday(birthday) {
  if (!birthday) return null;
  const d = new Date(birthday);
  const now = new Date();
  const thisYear = now.getFullYear();
  const nextBday = new Date(thisYear, d.getMonth(), d.getDate());
  if (nextBday < now) nextBday.setFullYear(thisYear + 1);
  const days = Math.ceil((nextBday - now) / 86400000);
  const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (days <= 30) return `🎂 ${mmdd} 生日（${days}天后）`;
  return `🎂 ${mmdd} 生日`;
}
