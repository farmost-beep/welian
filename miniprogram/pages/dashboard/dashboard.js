// pages/dashboard/dashboard.js — 角色仪表盘
// SPEC §3.2：三角色分栏，只做行为回顾不评分

const api = require('../../utils/api.js');

Page({
  data: {
    month: '',
    roles: [],
    loading: true,
  },

  onLoad() {
    this.loadDashboard();
  },

  onPullDownRefresh() {
    this.loadDashboard(() => wx.stopPullDownRefresh());
  },

  loadDashboard(cb) {
    this.setData({ loading: true });
    api.getDashboard().then((res) => {
      this.setData({
        month: res.month,
        roles: res.roles,
        loading: false,
      });
      if (cb) cb();
    });
  },
});
