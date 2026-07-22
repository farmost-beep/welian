// pages/signals/signals.js — 每日信号页
const api = require('../../utils/api.js');

Page({
  data: {
    signals: [],
    themes: [],
    loading: true,
    error: '',
    greeting: '',
  },

  onShow() {
    this.loadSignals();
  },

  loadSignals() {
    this.setData({ loading: true, error: '' });
    api.getSignals().then((report) => {
      this.setData({
        signals: report.signals || [],
        themes: report.themes || [],
        greeting: report.greeting || '',
        loading: false,
      });
    }).catch((err) => {
      this.setData({ loading: false, error: err.message || '获取失败' });
    });
  },

  onPullDownRefresh() {
    this.loadSignals();
    setTimeout(() => wx.stopPullDownRefresh(), 1000);
  },

  // 点击信号卡片 → 打开原文（web-view 代理阅读）
  openSignal(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) {
      wx.showToast({ title: '暂无原文链接', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/article/article?url=${encodeURIComponent(url)}`,
    });
  },

  // 分享给微信好友
  onShareAppMessage() {
    const themes = this.data.themes.join('、');
    return {
      title: `今日信号 · ${themes || '科技商业快讯'}`,
      path: '/pages/signals/signals',
    };
  },
});
