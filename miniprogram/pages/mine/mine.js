// pages/mine/mine.js — 我的（tabBar）
const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    plan: 'free',
    planLabel: 'Free',
    credits: 100,
    openid: '',
    isBound: false,
    bindEmail: '',
    bindCode: '',
    bindMsg: '',
    codeSent: false,
    sendingCode: false,
    binding: false,
    showCelebration: false,
  },

  onShow() {
    const g = app.globalData;
    this.setData({
      plan: g.plan,
      planLabel: g.plan === 'pro' ? 'Pro' : 'Free',
      credits: g.credits,
    });
    this.checkBinding();
  },

  checkBinding() {
    const token = api.getToken();
    if (!token) return;
    const isBound = token.startsWith('user_');
    this.setData({ isBound });
    if (!isBound && token.startsWith('wxmp_')) {
      const openid = token.substring(5, token.indexOf(':'));
      this.setData({ openid });
    }
  },

  goWeekly() {
    wx.navigateTo({ url: '/pages/weekly/weekly' });
  },

  goChat() {
    wx.navigateTo({ url: '/pages/chat/chat' });
  },

  goBilling() {
    wx.navigateTo({ url: '/pages/billing/billing' });
  },

  onBindEmailInput(e) {
    this.setData({ bindEmail: e.detail.value });
  },

  onBindCodeInput(e) {
    this.setData({ bindCode: e.detail.value });
  },

  // 第一步：发送验证码
  sendCode() {
    const { openid, bindEmail, sendingCode } = this.data;
    if (sendingCode) return;
    if (!openid) {
      this.setData({ bindMsg: '请先登录' });
      return;
    }
    if (!bindEmail || !bindEmail.includes('@')) {
      this.setData({ bindMsg: '请输入有效邮箱' });
      return;
    }
    this.setData({ sendingCode: true, bindMsg: '发送中…' });
    wx.request({
      url: 'https://api.welian.app/ai/wxmp_bind_sendcode',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { openid, email: bindEmail.trim().toLowerCase() },
      success: (res) => {
        if (res.statusCode === 200 && res.data.ok) {
          this.setData({
            codeSent: true,
            sendingCode: false,
            bindMsg: res.data.is_new_user
              ? '验证码已发送，验证后将自动注册新账号'
              : '验证码已发到邮箱，请查收',
          });
        } else {
          this.setData({
            sendingCode: false,
            bindMsg: res.data.error || '发送失败',
          });
        }
      },
      fail: () => this.setData({ sendingCode: false, bindMsg: '网络错误' }),
    });
  },

  // 第二步：验证码绑定
  verifyAndBind() {
    const { openid, bindCode, binding } = this.data;
    if (binding) return;
    if (!bindCode || bindCode.length !== 6) {
      this.setData({ bindMsg: '请输入6位验证码' });
      return;
    }
    this.setData({ binding: true, bindMsg: '绑定中…' });
    wx.request({
      url: 'https://api.welian.app/ai/wxmp_bind_verify',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { openid, code: bindCode },
      success: (res) => {
        if (res.statusCode === 200 && res.data.ok) {
          api.clearToken();
          wx.setStorageSync('welian_token', res.data.token);
          wx.setStorageSync('welian_registered', true);
          this.setData({
            binding: false,
            isBound: true,
            bindMsg: res.data.message,
            codeSent: false,
          });
          if (res.data.is_new_user) {
            // 新用户：显示庆祝动画
            this.setData({ showCelebration: true });
            setTimeout(() => {
              this.setData({ showCelebration: false });
            }, 2500);
          } else {
            wx.showToast({ title: '绑定成功', icon: 'success' });
          }
        } else {
          this.setData({ binding: false, bindMsg: res.data.error || '绑定失败' });
        }
      },
      fail: () => this.setData({ binding: false, bindMsg: '网络错误' }),
    });
  },

  // 解绑
  unbind() {
    const { openid } = this.data;
    const token = api.getToken();
    // 已绑定用户 token 是 user_xxx:secret，提取 clerk_user_id
    // 未绑定用户 token 是 wxmp_<openid>:secret，用 openid
    const clerkUserId = token && token.startsWith('user_') ? token.substring(0, token.indexOf(':')) : null;
    if (!openid && !clerkUserId) {
      wx.showToast({ title: '无法解绑，请重新登录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认解绑',
      content: '解绑后小程序将无法访问你的联系人数据，确定解绑吗？',
      confirmText: '解绑',
      confirmColor: '#C96442',
      success: (res) => {
        if (!res.confirm) return;
        const data = {};
        if (openid) data.openid = openid;
        if (clerkUserId) data.clerk_user_id = clerkUserId;
        wx.request({
          url: 'https://api.welian.app/ai/wxmp_unbind',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data,
          success: (res) => {
            if (res.statusCode === 200 && res.data.ok) {
              api.clearToken();
              wx.setStorageSync('welian_token', res.data.token);
              wx.removeStorageSync('welian_registered');
              this.setData({
                isBound: false,
                bindMsg: '',
                bindEmail: '',
                bindCode: '',
                codeSent: false,
              });
              wx.showToast({ title: '已解绑', icon: 'none' });
              setTimeout(() => wx.reLaunch({ url: '/pages/welcome/welcome' }), 1500);
            } else {
              wx.showToast({ title: res.data.error || '解绑失败', icon: 'none' });
            }
          },
          fail: () => wx.showToast({ title: '网络错误', icon: 'none' }),
        });
      },
    });
  },

  onShareAppMessage() {
    return {
      title: 'Welian ∞ — 更用心，更好的关系',
      path: '/pages/welcome/welcome',
    };
  },

  dismissCelebration() {
    this.setData({ showCelebration: false });
  },
});
