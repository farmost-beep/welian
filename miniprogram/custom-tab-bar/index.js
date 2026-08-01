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
  },

  lifetimes: {
    attached() {
      this.updateList();
    },
  },

  methods: {
    updateList() {
      this.setData({ list: ALL_TABS });
    },

    switchTab(e) {
      const path = e.currentTarget.dataset.path;
      wx.switchTab({ url: path });
    },

    refresh() {
      this.updateList();
    },
  },
});
