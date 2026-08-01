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

// 全局登录锁：防止并发 401 触发多次 login
let _loginPromise = null;

function login(opts) {
  // 兼容旧调用方式：login('INVITE_CODE') → login({ inviter: 'INVITE_CODE' })
  const loginOpts = typeof opts === 'string' ? { inviter: opts } : (opts || {});
  // 如果已有进行中的 login，复用同一个 Promise
  if (_loginPromise) return _loginPromise;
  _loginPromise = new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (!res.code) {
          _loginPromise = null;
          reject(new Error('wx.login 未返回 code'));
          return;
        }
        // Exchange code for token via backend
        const data = { code: res.code };
        if (loginOpts.inviter) data.inviter = loginOpts.inviter;
        if (loginOpts.social_contact) data.social_contact = loginOpts.social_contact;
        if (loginOpts.social_inviter) data.social_inviter = loginOpts.social_inviter;
        if (loginOpts.social_is_private !== undefined) data.social_is_private = loginOpts.social_is_private;
        wx.request({
          url: BASE_URL + '/ai/wxmp_login',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data,
          success: (resp) => {
            _loginPromise = null;
            if (resp.statusCode === 200 && resp.data.ok) {
              setToken(resp.data.token);
              // 保存 openid 供分享卡片使用
              if (resp.data.openid) {
                const app = getApp();
                if (app && app.globalData) app.globalData.openid = resp.data.openid;
              }
              resolve();
            } else {
              reject(new Error(resp.data.error || '登录失败'));
            }
          },
          fail: (err) => {
            _loginPromise = null;
            reject(err);
          },
        });
      },
      fail: (err) => {
        _loginPromise = null;
        reject(err);
      },
    });
  });
  return _loginPromise;
}

// 页面登录检查：未登录时返回 false（由 app.js 自动登录流程处理导航）
function requireLogin() {
  return !!getToken();
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
  requireLogin,
  getToken,
  clearToken,
  getSyncUrl,
  getAgentUrl,
  requestSubscribe,

  // 通用请求（供 SDUI 页面等直接调用）
  request,

  // 数据飞轮：提取意图 + 自动执行数据操作（添加联系人/互动/待办）
  // Live 模式下异步调用，不阻塞 agent 回复
  extractIntent(text) {
    return request('/ai/extract_intent', { text }, 'POST').catch((e) => {
      console.warn('[extractIntent] failed:', e.message || e);
      return null;
    });
  },

  // ── 快捷操作 API ──

  // 创建待办
  addTodo(task, contactName, priority, date, time) {
    const due = date ? (time ? `${date} ${time}` : date) : '';
    return request('/data/todos', {
      task, contact: contactName || '',
      priority: priority || 'P2',
      due,
    }, 'POST');
  },

  // 添加互动记录（先搜索联系人获取 ID）
  addTimeline(contactName, summary, date) {
    return this.searchContacts(contactName).then(contacts => {
      if (contacts && contacts.length > 0) {
        return request('/data/timeline', {
          contact_id: contacts[0].id,
          summary, date: date || new Date().toISOString().slice(0, 10),
        }, 'POST');
      }
      return { ok: false, error: `未找到联系人"${contactName}"` };
    });
  },

  // 更新联系人字段
  updateContact(contactId, fields) {
    return request('/data/contacts', {
      id: contactId,
      ...fields,
    }, 'POST');
  },

  // 创建会议
  createMeeting(title, date, location, purpose) {
    return request('/data/meetings', {
      title, date: date || '',
      location: location || '', purpose: purpose || '',
    }, 'POST');
  },

  // 推迟待办（后端需要新 due 日期）
  postponeTodo(todoId, days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const newDue = d.toISOString().slice(0, 10);
    return request('/data/todos/postpone', {
      id: todoId, due: newDue,
    }, 'POST');
  },

  // 更新个人画像（先获取当前值再合并，避免全量覆盖）
  updateProfile(fields) {
    return request('/data/profile', {}, 'GET').then(existing => {
      return request('/data/profile', { ...existing, ...fields }, 'POST');
    });
  },

  // 获取周报
  getWeeklyReport(refresh) {
    return request('/ai/weekly_report', refresh ? { refresh: 1 } : {}, 'POST');
  },

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

  // 关系列表（compact 模式，分页加载）
  getContacts(offset = 0, limit = 100) {
    return request('/data/contacts?limit=' + limit + '&offset=' + offset + '&compact=1').then((data) => {
      const contacts = data.contacts || [];
      const leverage = contacts.filter(c => c.nature === 'leverage' || c.nature === 'dual' || c.nature === '双重');
      const nurture = contacts.filter(c => c.nature === 'nurture' || c.nature === 'dual' || c.nature === '双重');
      return {
        leverage: leverage.map(formatContact),
        nurture: nurture.map(formatContact),
        total: data.total || contacts.length,
        offset: data.offset || 0,
        hasMore: (data.offset || 0) + (data.limit || limit) < (data.total || 0),
      };
    });
  },

  // 联系人详情
  getContactDetail(contactId) {
    return request('/data/contacts?id=' + encodeURIComponent(contactId)).then((data) => {
      if (!data || !data.contact) throw new Error('联系人不存在');
      return data.contact;
    });
  },

  // 周报
  getWeekly(refresh) {
    return request('/ai/weekly_report', refresh ? { refresh: 1 } : {}, 'POST').then((data) => {
      if (!data || !data.ok) return { weekRange: '', report: null };
      return {
        weekRange: new Date().toLocaleDateString('zh-CN'),
        report: data.report || {},
      };
    }).catch(() => {
      return { weekRange: '', report: null };
    });
  },

  // 今日建议（从 advise_cloud 获取）
  getAdvise() {
    return request('/ai/advise_cloud', {}, 'POST').then((data) => {
      if (!data) return { advise: '', adviseId: null };
      return { advise: data.result || '', adviseId: data.advise_id || null };
    }).catch(() => {
      return { advise: '', adviseId: null };
    });
  },

  // 版本信息
  getBilling() {
    return request('/data/metrics').then((data) => {
      const plan = data.plan || 'free';
      return {
        plan,
        planLabel: plan === 'professional' ? '专业版' : plan === 'pro' ? 'Pro' : 'Free',
        credits: data.credits || 100,
        creditsTotal: data.creditsTotal || 100,
      };
    }).catch(() => {
      return { plan: 'free', planLabel: 'Free', credits: 100, creditsTotal: 100 };
    });
  },

  // 搜索联系人（用后端搜索，compact 模式）
  searchContacts(keyword) {
    return request('/data/contacts?q=' + encodeURIComponent(keyword) + '&limit=50&compact=1').then((data) => {
      return (data.contacts || []).map(formatContact);
    });
  },

  // 信号预览（公开，无需登录）
  getSignals(refresh) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: BASE_URL + '/ai/signals_preview' + (refresh ? '?refresh=1' : ''),
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
    company: c.company || '',
    title: c.title || '',
    relation: c.relation || c.role || '',
    tags: c.tags || [],
    how: c.company || c.title || c.role || c.how || '',
    bond: c.relation || c.relationship || c.bond || '',
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

// ── WebSocket sync URL ──
function getSyncUrl() {
  const token = getToken();
  if (!token) return '';
  return `wss://api.welian.app/data/sync_ws?token=${encodeURIComponent(token)}`;
}

// ── WebSocket local agent URL ──
function getAgentUrl() {
  const token = getToken();
  if (!token) return '';
  return `wss://api.welian.app/data/agent_ws?token=${encodeURIComponent(token)}`;
}

// ── 订阅消息 ──

// 订阅消息模板 ID（兜底默认值，优先从 app config 读取）
const SUBSCRIBE_TEMPLATE_IDS = {
  todo_due: '3srg81ewNIb2rBGFL83DoPG22BuHMZxzVwGGoXsevKI',
};

// 获取模板 ID：优先从 app.globalData.config 读取（后端可动态更新）
function getTemplateId(key) {
  try {
    const app = getApp();
    const configIds = app && app.globalData && app.globalData.config && app.globalData.config.subscribe_templates;
    if (configIds && configIds[key]) return configIds[key];
  } catch (e) {}
  return SUBSCRIBE_TEMPLATE_IDS[key];
}

// 请求订阅消息授权（用户点"允许"后上报到后端记录额度）
function requestSubscribe(templateKeys) {
  return new Promise((resolve) => {
    const ids = templateKeys.map(k => getTemplateId(k)).filter(Boolean);
    if (ids.length === 0) {
      resolve({ ok: false, reason: '模板未配置' });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: ids,
      success: (res) => {
        // res[templateId] = 'accept' | 'reject' | 'ban'
        const accepted = templateKeys.filter(k => {
          const id = getTemplateId(k);
          return id && res[id] === 'accept';
        });
        if (accepted.length > 0) {
          // 上报到后端记录授权额度
          wx.request({
            url: BASE_URL + '/ai/wxmp_subscribe',
            method: 'POST',
            header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
            data: { template_ids: accepted },
            success: () => resolve({ ok: true, accepted }),
            fail: () => resolve({ ok: true, accepted }), // 即使上报失败也返回成功，用户已授权
          });
        } else {
          resolve({ ok: false, reason: '用户拒绝' });
        }
      },
      fail: (err) => {
        console.warn('[subscribe] requestSubscribeMessage failed:', err);
        resolve({ ok: false, reason: err.errMsg || '请求失败' });
      },
    });
  });
}
