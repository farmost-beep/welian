// pages/annual/annual.js — SDUI 年度报告页（后端驱动渲染）
const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    components: [],
    loading: true,
    error: '',
    shareTitle: '我的Welian年度报告',
  },

  async onLoad() {
    if (!api.getToken()) {
      try { await app.loginReady; } catch (e) { return; }
    }
    this.loadReport();
  },

  onPullDownRefresh() {
    this.loadReport(true, () => wx.stopPullDownRefresh());
  },

  async loadReport(refresh, cb) {
    this.setData({ loading: true, error: '' });
    try {
      const data = await api.request('/ai/render?page=annual' + (refresh ? '&refresh=1' : ''), {}, 'GET');
      if (data && data.components) {
        const header = data.components.find(c => c.type === 'header');
        const yearStr = header && header.date ? header.date : '';
        this.setData({
          components: data.components,
          loading: false,
          shareTitle: `${yearStr}年度报告`,
        });
      } else {
        this.setData({ loading: false, error: (data && data.error) || '加载失败' });
      }
    } catch (e) {
      this.setData({ loading: false, error: e.message || '网络错误' });
    } finally {
      if (cb) cb();
    }
  },

  onItemTap(e) {},
  onButtonTap(e) {},

  onShareAppMessage() {
    return {
      title: this.data.shareTitle,
      path: '/pages/annual/annual',
    };
  },

  onShareTimeline() {
    return {
      title: this.data.shareTitle,
    };
  },
});
