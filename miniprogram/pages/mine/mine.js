// pages/mine/mine.js — 我的（tabBar 第三页）
// 入口：周报、充值、设置

const app = getApp();

Page({
  data: {
    plan: 'free',
    planLabel: 'Free',
    credits: 100,
  },

  onShow() {
    // 同步全局状态
    const g = app.globalData;
    this.setData({
      plan: g.plan,
      planLabel: g.plan === 'pro' ? 'Pro' : 'Free',
      credits: g.credits,
    });
  },

  goWeekly() {
    wx.navigateTo({ url: '/pages/weekly/weekly' });
  },

  goBilling() {
    wx.navigateTo({ url: '/pages/billing/billing' });
  },
});
