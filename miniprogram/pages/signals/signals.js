// pages/signals/signals.js — SDUI 信号页（后端驱动渲染）
const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    components: [],
    loading: true,
    error: '',
  },

  async onLoad() {
    if (!api.getToken()) {
      try { await app.loginReady; } catch (e) { return; }
    }
    this.loadSignals();
  },

  onPullDownRefresh() {
    this.loadSignals(true, () => wx.stopPullDownRefresh());
  },

  async loadSignals(refresh, cb) {
    this.setData({ loading: true, error: '' });
    try {
      const data = await api.request('/ai/render?page=signals' + (refresh ? '&refresh=1' : ''), {}, 'GET');
      if (data && data.components) {
        this.setData({ components: data.components, loading: false });
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
});
