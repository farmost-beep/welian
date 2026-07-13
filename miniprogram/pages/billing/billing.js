// pages/billing/billing.js — 充值页
// Free 100点/月, Pro ¥29/月 500点

const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    plan: 'free',
    planLabel: 'Free',
    credits: 0,
    creditsTotal: 100,
    creditsResetAt: '',
    plans: [],
    loading: true,
  },

  onLoad() {
    this.loadBilling();
  },

  onShow() {
    // 从全局同步最新状态
    const g = app.globalData;
    if (g.plan) {
      this.setData({ plan: g.plan, planLabel: g.plan === 'pro' ? 'Pro' : 'Free', credits: g.credits });
    }
  },

  loadBilling() {
    this.setData({ loading: true });
    api.getBilling().then((res) => {
      this.setData({
        plan: res.plan,
        planLabel: res.planLabel,
        credits: res.credits,
        creditsTotal: res.creditsTotal,
        creditsResetAt: res.creditsResetAt,
        plans: res.plans,
        loading: false,
      });
    });
  },

  upgrade(e) {
    const planKey = e.currentTarget.dataset.key;
    if (planKey === this.data.plan) return;
    wx.showModal({
      title: '升级套餐',
      content: '确定升级到 ' + (planKey === 'pro' ? 'Pro（¥29/月）' : 'Free') + ' 吗？',
      success: (res) => {
        if (res.confirm) {
          api.upgradePlan(planKey).then(() => {
            // 更新全局状态
            app.globalData.plan = planKey;
            app.globalData.credits = planKey === 'pro' ? 500 : 100;
            this.setData({
              plan: planKey,
              planLabel: planKey === 'pro' ? 'Pro' : 'Free',
              credits: planKey === 'pro' ? 500 : 100,
              creditsTotal: planKey === 'pro' ? 500 : 100,
            });
            // 更新 plans 的 current 标记
            const plans = this.data.plans.map(p => ({
              ...p,
              current: p.key === planKey,
            }));
            this.setData({ plans });
            wx.showToast({ title: '已升级', icon: 'success' });
          });
        }
      },
    });
  },
});
