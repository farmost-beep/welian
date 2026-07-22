// pages/billing/billing.js — 充值页（对齐 Web 端功能）
const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    plan: 'free',
    used: 0,
    remaining: 0,
    allowance: 100,
    rollover: 0,
    purchased: 0,
    subscription: null,
    history: [],
    loading: true,
    // 优惠券
    couponCode: '',
    couponMsg: '',
    // 赠予
    showGift: false,
    giftEmail: '',
    giftPoints: '',
    giftMsg: '',
    gifting: false,
  },

  onLoad() {
    this.loadBilling();
  },

  onShow() {
    const g = app.globalData;
    if (g.plan) {
      this.setData({ plan: g.plan });
    }
  },

  loadBilling() {
    this.setData({ loading: true });
    const token = api.getToken();
    wx.request({
      url: 'https://api.welian.app/ai/billing',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: {},
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          const d = res.data;
          const history = (d.recent_history || []).slice(-10).reverse().map(h => {
            const dt = new Date(h.date);
            const dateStr = `${dt.getMonth() + 1}/${dt.getDate()}`;
            const actionMap = {
              upgrade: '升级', purchase: '购买', coupon: '兑换',
              gift_out: '赠出', gift_in: '收到赠予', usage: '使用',
            };
            const actionLabel = actionMap[h.action] || h.action;
            const pts = h.points || 0;
            let ptsLabel = '';
            if (pts > 0) ptsLabel = `+${pts}`;
            else if (pts < 0) ptsLabel = `${pts}`;
            return { dateStr, actionLabel, ptsLabel, detail: h.detail || '' };
          });
          this.setData({
            plan: d.plan,
            used: d.used,
            remaining: d.remaining,
            allowance: d.allowance,
            rollover: d.rollover,
            purchased: d.purchased,
            subscription: d.subscription,
            history,
            loading: false,
          });
          // 同步全局
          app.globalData.plan = d.plan;
          app.globalData.credits = d.remaining;
        } else {
          this.setData({ loading: false });
        }
      },
      fail: () => {
        this.setData({ loading: false });
      },
    });
  },

  // 升级到 Pro
  upgrade() {
    if (this.data.plan === 'pro') return;
    wx.showActionSheet({
      itemList: ['Pro 月度 ¥29/月（500点/月）', 'Pro 年度 ¥299/年（省14%）'],
      success: (r) => {
        const planKey = r.tapIndex === 0 ? 'pro_monthly' : 'pro_yearly';
        const label = r.tapIndex === 0 ? 'Pro 月度（¥29/月）' : 'Pro 年度（¥299/年）';
        wx.showModal({
          title: '升级套餐',
          content: `确定升级到 ${label} 吗？`,
          success: (modal) => {
            if (modal.confirm) {
              this.doUpgrade(planKey);
            }
          },
        });
      },
    });
  },

  doUpgrade(planKey) {
    const token = api.getToken();
    wx.showLoading({ title: '升级中…' });
    wx.request({
      url: 'https://api.welian.app/ai/upgrade',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: { plan: planKey },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200 && res.data.ok) {
          wx.showToast({ title: '已升级到 Pro', icon: 'success' });
          this.loadBilling();
        } else {
          wx.showToast({ title: res.data.error || '升级失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  // 购买加油包
  buyCredits(e) {
    const pack = e.currentTarget.dataset.pack;
    const points = pack === '500' ? 500 : 100;
    const price = pack === '500' ? '¥7.99' : '¥1.99';
    wx.showModal({
      title: '购买加油包',
      content: `购买 ${points} 联点包（${price}）？`,
      confirmText: '购买',
      success: (r) => {
        if (r.confirm) {
          this.doPurchase(pack, points);
        }
      },
    });
  },

  doPurchase(pack, points) {
    const token = api.getToken();
    wx.showLoading({ title: '购买中…' });
    wx.request({
      url: 'https://api.welian.app/ai/purchase_credits',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: { pack },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200 && res.data.ok) {
          wx.showToast({ title: `已购买 ${points} 联点`, icon: 'success' });
          this.loadBilling();
        } else {
          wx.showToast({ title: res.data.error || '购买失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  // 优惠券兑换
  onCouponInput(e) {
    this.setData({ couponCode: e.detail.value });
  },

  redeemCoupon() {
    const code = this.data.couponCode.trim();
    if (!code) {
      this.setData({ couponMsg: '请输入兑换码' });
      return;
    }
    const token = api.getToken();
    wx.showLoading({ title: '兑换中…' });
    wx.request({
      url: 'https://api.welian.app/ai/redeem_coupon',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: { code },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200 && res.data.ok) {
          this.setData({ couponCode: '', couponMsg: `✓ 兑换成功，获得 ${res.data.points} 联点` });
          this.loadBilling();
        } else {
          this.setData({ couponMsg: res.data.error || '兑换失败' });
        }
      },
      fail: () => {
        wx.hideLoading();
        this.setData({ couponMsg: '网络错误' });
      },
    });
  },

  // 赠予联点
  toggleGift() {
    this.setData({ showGift: !this.data.showGift, giftMsg: '' });
  },

  onGiftEmailInput(e) {
    this.setData({ giftEmail: e.detail.value });
  },

  onGiftPointsInput(e) {
    this.setData({ giftPoints: e.detail.value });
  },

  sendGift() {
    const email = this.data.giftEmail.trim();
    const points = parseInt(this.data.giftPoints);
    if (!email) { this.setData({ giftMsg: '请输入收件人邮箱' }); return; }
    if (!points || points < 10) { this.setData({ giftMsg: '最少赠予 10 联点' }); return; }
    if (points > 500) { this.setData({ giftMsg: '最多赠予 500 联点' }); return; }
    if (points > this.data.remaining) { this.setData({ giftMsg: `联点不足，当前剩余 ${this.data.remaining}` }); return; }

    wx.showModal({
      title: '确认赠予',
      content: `向 ${email} 赠予 ${points} 联点？`,
      confirmText: '赠予',
      success: (r) => {
        if (r.confirm) this.doGift(email, points);
      },
    });
  },

  doGift(email, points) {
    const token = api.getToken();
    this.setData({ gifting: true, giftMsg: '' });
    wx.request({
      url: 'https://api.welian.app/ai/gift_credits',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: { recipient_email: email, points },
      success: (res) => {
        this.setData({ gifting: false });
        if (res.statusCode === 200 && res.data.ok) {
          wx.showToast({ title: `已赠予 ${points} 联点`, icon: 'success' });
          this.setData({ showGift: false, giftEmail: '', giftPoints: '' });
          this.loadBilling();
        } else {
          this.setData({ giftMsg: res.data.error || '赠予失败' });
        }
      },
      fail: () => {
        this.setData({ gifting: false, giftMsg: '网络错误' });
      },
    });
  },

  onPullDownRefresh() {
    this.loadBilling();
    setTimeout(() => wx.stopPullDownRefresh(), 1000);
  },
});
