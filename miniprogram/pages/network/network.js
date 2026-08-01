// pages/network/network.js — 关系网络可视化
const api = require('../../utils/api.js');

Page({
  data: {
    mode: 'graph',
    graph: { nodes: [], edges: [], stats: { totalContacts: 0, totalConnections: 0 } },
    fromName: '',
    toName: '',
    pathResult: null,
    searching: false,
  },

  onLoad() {
    if (!api.requireLogin()) return;
    this.loadGraph();
  },

  onShow() {
    this.loadGraph();
  },

  async loadGraph() {
    try {
      const data = await api.request('/ai/network/graph');
      if (data && data.nodes) {
        this.setData({ graph: data });
      }
    } catch (e) {
      // 静默失败，用户可下拉刷新
    }
  },

  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  onFromInput(e) {
    this.setData({ fromName: e.detail.value });
  },

  onToInput(e) {
    this.setData({ toName: e.detail.value });
  },

  async searchPath() {
    const { fromName, toName } = this.data;
    if (!fromName.trim() || !toName.trim()) {
      wx.showToast({ title: '请输入双方姓名', icon: 'none' });
      return;
    }
    this.setData({ searching: true });
    try {
      const result = await api.request('/ai/network/path', {
        from_name: fromName.trim(),
        to_name: toName.trim(),
      }, 'POST');
      this.setData({ searching: false, pathResult: result });
    } catch (e) {
      this.setData({ searching: false });
      wx.showToast({ title: e.message || '查找失败', icon: 'none' });
    }
  },

  goContactDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: `/pages/contact-detail/contact-detail?id=${id}` });
  },

  onPullDownRefresh() {
    this.loadGraph().then(() => wx.stopPullDownRefresh());
  },
});
