// components/sdui-renderer/sdui-renderer.js — 通用 SDUI 渲染器
// 接收后端返回的组件树，渲染为小程序 UI
// 支持 HTTP 模式（GET /ai/render?page=xxx）和 WebSocket 模式（sync 页复用）

Component({
  properties: {
    components: { type: Array, value: [] },
    loading: { type: Boolean, value: false },
    error: { type: String, value: '' },
  },

  methods: {
    onTapItem(e) {
      const { id, action, url } = e.currentTarget.dataset;
      if (action === 'navigate' && url) {
        wx.navigateTo({ url });
      } else if (action === 'switchTab' && url) {
        wx.switchTab({ url });
      } else if (action === 'copy' && e.currentTarget.dataset.text) {
        wx.setClipboardData({ data: e.currentTarget.dataset.text });
      }
      this.triggerEvent('itemtap', { id, action, url });
    },

    onButtonTap(e) {
      const { id, action, url, key } = e.currentTarget.dataset;
      if (action === 'navigate' && url) {
        wx.navigateTo({ url });
      } else if (action === 'switchTab' && url) {
        wx.switchTab({ url });
      } else if (action === 'copy' && e.currentTarget.dataset.text) {
        wx.setClipboardData({ data: e.currentTarget.dataset.text });
      } else if (action === 'open-url' && url) {
        // 用 web-view 页面打开外部链接
        wx.navigateTo({ url: '/pages/webview/webview?url=' + encodeURIComponent(url) });
      } else if (action === 'share') {
        this.triggerEvent('share', { key });
      }
      this.triggerEvent('buttontap', { id, action, url, key });
    },
  },
});
