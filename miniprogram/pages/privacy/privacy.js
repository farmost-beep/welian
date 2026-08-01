// pages/privacy/privacy.js — SDUI 隐私政策页（后端驱动渲染，无需登录）
const api = require('../../utils/api.js');

Page({
  data: {
    components: [],
    loading: true,
  },

  onLoad() {
    this.loadPrivacy();
  },

  async loadPrivacy() {
    // privacy 不需要登录，但如果已登录则带 token
    try {
      const data = await api.request('/ai/render?page=privacy', {}, 'GET');
      if (data && data.components) {
        this.setData({ components: data.components, loading: false });
      } else {
        this.setData({ loading: false });
      }
    } catch (e) {
      // 未登录时 api.request 可能 401，但 privacy 后端不要求 auth
      // 如果失败，用本地兜底组件
      this.setData({ loading: false, components: this._localFallback() });
    }
  },

  _localFallback() {
    return [
      { id: 'p1', type: 'title', content: 'Welian 隐私政策' },
      { id: 'p2', type: 'paragraph', content: 'Welian（维联）尊重并保护你的隐私。' },
      { id: 'p3', type: 'subtitle', content: '联系我们' },
      { id: 'p4', type: 'paragraph', content: '如有隐私相关问题，请联系：support@welian.app' },
    ];
  },
});
