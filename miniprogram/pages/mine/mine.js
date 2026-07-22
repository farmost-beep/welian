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
            bindMsg: '验证码已发到邮箱，请查收',
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
          this.setData({
            binding: false,
            isBound: true,
            bindMsg: res.data.message,
            codeSent: false,
          });
          wx.showToast({ title: '绑定成功', icon: 'success' });
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
    if (!openid) return;
    wx.showModal({
      title: '确认解绑',
      content: '解绑后小程序将无法访问你的联系人数据，确定解绑吗？',
      confirmText: '解绑',
      confirmColor: '#C96442',
      success: (res) => {
        if (!res.confirm) return;
        wx.request({
          url: 'https://api.welian.app/ai/wxmp_unbind',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { openid },
          success: (res) => {
            if (res.statusCode === 200 && res.data.ok) {
              api.clearToken();
              wx.setStorageSync('welian_token', res.data.token);
              this.setData({
                isBound: false,
                bindMsg: '',
                bindEmail: '',
                bindCode: '',
                codeSent: false,
              });
              wx.showToast({ title: '已解绑', icon: 'none' });
              // 解绑后跳回 welcome 页
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
});
