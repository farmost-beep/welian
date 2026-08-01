// pages/report/report.js — 关系体检报告页
// 两种场景：
// 1. 用户自己查看（已登录，有token）→ 生成报告 + 可分享
// 2. 被分享者打开（query带contact+inviter）→ 静默绑定openid + 展示报告 + 引导试用

const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    loading: true,
    report: null,
    error: '',
    isSharedView: false,  // 是否为被分享者打开
    nicknameConfirmed: false,
    _contactName: '',
    _inviterOpenid: '',
  },

  onLoad(query) {
    // 检测是否为分享卡片打开
    if (query.contact && query.inviter) {
      this.setData({
        isSharedView: true,
        _contactName: query.contact,
        _inviterOpenid: query.inviter,
      });
      // app.js 的 _parseShareContext 已处理社交绑定上报
      // 这里加载报告供被分享者查看
      this.loadSharedReport(query.contact);
    } else if (query.cid) {
      // 从联系人详情页分享打开（用 contact_id）
      this.setData({ _contactId: query.cid });
      this.loadReport(query.cid);
    } else {
      // 用户自己查看 — 需要登录
      this.loadReport();
    }
  },

  onShow() {
    // 设置私密消息分享：防二次转发 + withShareTicket 区分单聊/群聊
    if (!this.data.isSharedView) {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline'],
      });
    }
  },

  // 用户自己查看报告
  async loadReport(contactId) {
    this.setData({ loading: true });
    try {
      await app.loginReady;
      const token = api.getToken();
      if (!token) {
        this.setData({ loading: false, error: '请先登录' });
        return;
      }
      // 调用后端生成关系体检报告
      const payload = { type: 'relationship_checkup' };
      if (contactId) payload.contact_id = contactId;
      const resp = await api.request('/ai/report', payload, 'POST');
      if (resp && resp.ok) {
        this.setData({ loading: false, report: resp.report });
      } else {
        this.setData({ loading: false, error: (resp && resp.error) || '生成报告失败' });
      }
    } catch (e) {
      this.setData({ loading: false, error: e.message || '网络错误' });
    }
  },

  // 被分享者查看简化报告
  loadSharedReport(contactName) {
    // 被分享者不需要完整报告，展示一个简化版
    this.setData({
      loading: false,
      report: {
        contactName,
        inviterName: '',
        temperature: 50,
        tempDesc: '这是一份关系体检报告，帮助你了解和维护人际关系。',
        totalInteractions: '—',
        daysSinceLast: '—',
        avgInterval: '—',
        suggestions: [
          '定期联系是维护关系的关键',
          '记住上次聊的话题，下次接着聊',
          '在重要日期主动问候',
        ],
      },
    });
  },

  // 昵称确认
  onNicknameConfirm(e) {
    const nickname = e.detail.value || '';
    if (nickname) {
      this.setData({ nicknameConfirmed: true });
      // 昵称已通过 app.js 的社交绑定流程上报
      console.log('[report] nickname confirmed:', nickname);
    }
  },

  // 被分享者点击"免费试用"
  startUsing() {
    wx.switchTab({ url: '/pages/dashboard/dashboard' });
  },

  // 分享给联系人（私密消息）
  onShareAppMessage() {
    const contactName = this.data.report?.contactName || this.data._contactName;
    // 获取当前用户的 openid 作为 inviter
    // openid 在 wxmp_login 时已返回，存储在 app.globalData
    const openid = app.globalData.openid || '';
    return {
      title: `我给你做了一份关系体检报告`,
      path: `/pages/report/report?contact=${encodeURIComponent(contactName)}&inviter=${openid}`,
    };
  },

  onShareTimeline() {
    const contactName = this.data.report?.contactName || '';
    return {
      title: `Welian 关系体检报告`,
      query: `contact=${encodeURIComponent(contactName)}`,
    };
  },
});
