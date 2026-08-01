// pages/webview/webview.js — 外部链接 web-view 容器
Page({
  data: { url: '' },
  onLoad(query) {
    const url = query.url ? decodeURIComponent(query.url) : '';
    this.setData({ url });
  },
});
