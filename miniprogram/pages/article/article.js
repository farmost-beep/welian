// pages/article/article.js — SDUI 文章阅读页（后端驱动渲染）
const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    components: [],
    loading: true,
    error: '',
  },

  async onLoad(query) {
    this._articleUrl = query.url ? decodeURIComponent(query.url) : '';
    if (!api.getToken()) {
      try { await app.loginReady; } catch (e) { return; }
    }
    this.loadArticle();
  },

  async loadArticle() {
    if (!this._articleUrl) {
      this.setData({ loading: false, error: '文章链接缺失' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const data = await api.request('/ai/render?page=article&url=' + encodeURIComponent(this._articleUrl), {}, 'GET');
      if (data && data.components) {
        this.setData({ components: data.components, loading: false });
      } else {
        this.setData({ loading: false, error: (data && data.error) || '加载失败' });
      }
    } catch (e) {
      this.setData({ loading: false, error: e.message || '网络错误' });
    }
  },

  onButtonTap(e) {},
});
