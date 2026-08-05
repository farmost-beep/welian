// pages/network/network.js — 关系连接清单
const api = require('../../utils/api.js');

Page({
  data: {
    mode: 'list',
    graph: { nodes: [], edges: [], stats: { totalContacts: 0, totalConnections: 0 } },
    fromName: '',
    toName: '',
    pathResult: null,
    searching: false,
    // 添加连接
    showConnectModal: false,
    connectASearch: '',
    connectASearchResults: [],
    connectAId: '',
    connectAName: '',
    connectBSearch: '',
    connectBSearchResults: [],
    connectBId: '',
    connectBName: '',
    connectDesc: '',
    connecting: false,
    // 圈子
    circleSearch: '',
    filteredCircles: [],
    expandedCircle: '',
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
        const circles = data.circles || [];
        this.setData({ graph: data, filteredCircles: circles });
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

  goContacts() {
    wx.switchTab({ url: '/pages/contacts/contacts' });
  },

  // ── 圈子 ──
  onCircleSearchInput(e) {
    const q = e.detail.value.trim().toLowerCase();
    this.setData({ circleSearch: q });
    const circles = this.data.graph.circles || [];
    if (!q) {
      this.setData({ filteredCircles: circles });
      return;
    }
    const filtered = circles.filter(c =>
      c.tag.toLowerCase().includes(q) ||
      c.members.some(m => (m.name || '').toLowerCase().includes(q))
    );
    this.setData({ filteredCircles: filtered });
  },

  toggleCircle(e) {
    const tag = e.currentTarget.dataset.tag;
    this.setData({ expandedCircle: this.data.expandedCircle === tag ? '' : tag });
  },

  // ── 添加连接（搜索选择） ──
  showAddConnection() {
    this.setData({
      showConnectModal: true,
      connectASearch: '', connectASearchResults: [], connectAId: '', connectAName: '',
      connectBSearch: '', connectBSearchResults: [], connectBId: '', connectBName: '',
      connectDesc: '',
    });
  },

  closeConnectModal() {
    this.setData({ showConnectModal: false });
  },

  noop() {},

  _searchContacts(q, side) {
    if (!q) {
      this.setData({ [side + 'SearchResults']: [] });
      return;
    }
    const token = api.getToken();
    if (!token) return;
    wx.request({
      url: `https://api.welian.app/data/contacts?q=${encodeURIComponent(q)}&limit=10&compact=1`,
      method: 'GET',
      header: { 'Authorization': 'Bearer ' + token },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.contacts) {
          // Exclude already-selected contact on the other side
          const otherId = side === 'connectA' ? this.data.connectBId : this.data.connectAId;
          const results = res.data.contacts.filter(c => c.id !== otherId);
          this.setData({ [side + 'SearchResults']: results });
        }
      },
    });
  },

  onConnectASearchInput(e) {
    const q = e.detail.value.trim();
    this.setData({ connectASearch: q });
    this._searchContacts(q, 'connectA');
  },

  onConnectBSearchInput(e) {
    const q = e.detail.value.trim();
    this.setData({ connectBSearch: q });
    this._searchContacts(q, 'connectB');
  },

  selectConnectA(e) {
    const { id, name } = e.currentTarget.dataset;
    this.setData({
      connectAId: id, connectAName: name,
      connectASearch: '', connectASearchResults: [],
    });
  },

  selectConnectB(e) {
    const { id, name } = e.currentTarget.dataset;
    this.setData({
      connectBId: id, connectBName: name,
      connectBSearch: '', connectBSearchResults: [],
    });
  },

  onConnectDescInput(e) {
    this.setData({ connectDesc: e.detail.value });
  },

  async addConnection() {
    const { connectAId, connectBId, connectDesc, connecting } = this.data;
    if (connecting) return;
    if (!connectAId || !connectBId) {
      wx.showToast({ title: '请搜索并选择两位联系人', icon: 'none' });
      return;
    }
    if (connectAId === connectBId) {
      wx.showToast({ title: '请选择不同的联系人', icon: 'none' });
      return;
    }
    this.setData({ connecting: true });
    try {
      await api.request('/ai/network/connect', {
        contact_id: connectAId,
        target_id: connectBId,
        relation_desc: connectDesc.trim(),
      }, 'POST');
      this.setData({ connecting: false, showConnectModal: false });
      wx.showToast({ title: '已添加连接', icon: 'success' });
      this.loadGraph();
    } catch (e) {
      this.setData({ connecting: false });
      wx.showToast({ title: e.message || '添加失败', icon: 'none' });
    }
  },

  // ── 删除连接 ──
  deleteConnection(e) {
    const { sourceId, targetId } = e.currentTarget.dataset;
    if (!sourceId || !targetId) return;
    wx.showModal({
      title: '删除连接',
      content: '确定删除这条连接关系吗？',
      confirmText: '删除',
      confirmColor: '#C96442',
      success: (res) => {
        if (!res.confirm) return;
        api.request('/ai/network/disconnect', {
          contact_id: sourceId,
          target_id: targetId,
        }, 'POST').then(() => {
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadGraph();
        }).catch((err) => {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        });
      },
    });
  },

  onPullDownRefresh() {
    this.loadGraph().then(() => wx.stopPullDownRefresh());
  },
});
