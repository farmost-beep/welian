// pages/article/article.js — 原文阅读页（web-view 代理）
Page({
  data: {
    articleUrl: '',
  },

  onLoad(options) {
    const url = decodeURIComponent(options.url || '');
    if (!url) {
      wx.showToast({ title: '链接无效', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({
      articleUrl: `https://api.welian.app/ai/proxy_article?url=${encodeURIComponent(url)}`,
    });
  },

  onShareAppMessage() {
    return {
      title: 'Welian 今日信号',
      path: '/pages/signals/signals',
    };
  },
});
