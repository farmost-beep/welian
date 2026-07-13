// pages/weekly/weekly.js — 周报页

const api = require('../../utils/api.js');

Page({
  data: {
    weekRange: '',
    sections: [],
    loading: true,
  },

  onLoad() {
    this.loadWeekly();
  },

  onPullDownRefresh() {
    this.loadWeekly(() => wx.stopPullDownRefresh());
  },

  loadWeekly(cb) {
    this.setData({ loading: true });
    api.getWeekly().then((res) => {
      this.setData({
        weekRange: res.weekRange,
        sections: res.sections,
        loading: false,
      });
      if (cb) cb();
    });
  },
});
