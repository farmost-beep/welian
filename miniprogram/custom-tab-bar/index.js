// custom-tab-bar/index.js — 自定义 tabBar
const ALL_TABS = [
  { pagePath: '/pages/dashboard/dashboard', text: '概览', icon: '📊' },
  { pagePath: '/pages/contacts/contacts', text: '关系', icon: '👥' },
  { pagePath: '/pages/todos/todos', text: '待办', icon: '📋' },
  { pagePath: '/pages/mine/mine', text: '我的', icon: '⚙️' },
];

Component({
  data: {
    selected: 0,
    list: [],
    syncEnabled: false,
  },

  lifetimes: {
    attached() {
      this.updateList();
      this.checkSyncEntry();
    },
  },

  methods: {
    async checkSyncEntry() {
      try {
        const token = wx.getStorageSync('welian_token') || '';
        if (!token) return;
        const res = await new Promise((resolve, reject) => {
          wx.request({
            url: 'https://api.welian.app/data/entry',
            header: { 'Authorization': 'Bearer ' + token },
            success: resolve,
            fail: reject,
          });
        });
        if (res.statusCode === 200 && res.data) {
          this.setData({ syncEnabled: !!res.data.sync });
        }
      } catch {}
    },

    updateList() {
      this.setData({ list: ALL_TABS });
    },

    switchTab(e) {
      const path = e.currentTarget.dataset.path;
      wx.switchTab({ url: path });
    },

    goSync() {
      wx.navigateTo({ url: '/pages/sync/sync' });
    },

    refresh() {
      this.updateList();
      this.checkSyncEntry();
    },
  },
});
