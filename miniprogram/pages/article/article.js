// pages/article/article.js — 原文阅读页（rich-text 渲染）
const api = require('../../utils/api.js');

Page({
  data: {
    title: '',
    content: '',  // HTML string for rich-text
    url: '',
    loading: true,
    error: '',
    unsupported: false,
  },

  onLoad(options) {
    const url = decodeURIComponent(options.url || '');
    if (!url) {
      wx.showToast({ title: '链接无效', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({ url });
    this.loadArticle(url);
  },

  loadArticle(targetUrl) {
    this.setData({ loading: true, error: '' });
    wx.request({
      url: 'https://api.welian.app/ai/proxy_article',
      method: 'GET',
      data: { url: targetUrl },
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          if (res.data.unsupported) {
            this.setData({ unsupported: true, loading: false });
          } else if (res.data.ok && res.data.content) {
            this.setData({
              title: res.data.title || '',
              content: res.data.content,
              loading: false,
            });
            wx.setNavigationBarTitle({ title: res.data.title || '原文阅读' });
          } else {
            this.setData({ loading: false, error: res.data.error || '加载失败' });
          }
        } else {
          this.setData({ loading: false, error: '网络错误' });
        }
      },
      fail: () => {
        this.setData({ loading: false, error: '网络错误' });
      },
    });
  },

  // 复制原文链接
  copyLink() {
    wx.setClipboardData({
      data: this.data.url,
      success: () => {
        wx.showToast({ title: '链接已复制', icon: 'success' });
      },
    });
  },

  onShareAppMessage() {
    return {
      title: this.data.title || 'Welian 今日信号',
      path: '/pages/signals/signals',
    };
  },
});
