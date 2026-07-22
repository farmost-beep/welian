// pages/dashboard/dashboard.js — 角色仪表盘
const api = require('../../utils/api.js');

Page({
  data: {
    month: '',
    roles: [],
    loading: true,
    error: '',
  },

  onShow() {
    this.loadDashboard();
  },

  onPullDownRefresh() {
    this.loadDashboard(() => wx.stopPullDownRefresh());
  },

  loadDashboard(cb) {
    this.setData({ loading: true, error: '' });
    api.getDashboard().then((res) => {
      this.setData({
        month: res.month,
        roles: res.roles,
        loading: false,
      });
      if (cb) cb();
    }).catch((err) => {
      this.setData({ loading: false, error: err.message || '加载失败' });
      if (cb) cb();
    });
  },
});
