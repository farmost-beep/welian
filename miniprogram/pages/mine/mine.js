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
    showDeleteModal: false,
    deleteInput: '',
  },

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
      this.getTabBar().refresh();
    }
    if (!api.getToken()) {
      try { await app.loginReady; } catch (e) { return; }
    }
    const g = app.globalData;
    this.setData({
      plan: g.plan,
      planLabel: g.plan === 'pro' ? 'Pro' : 'Free',
      credits: g.credits,
      creditsFixed: (g.credits || 0).toFixed(2),
    });
    this.checkBinding();
    this.refreshCredits();
  },

  refreshCredits() {
    const token = api.getToken();
    if (!token) return;
    wx.request({
      url: 'https://api.welian.app/ai/billing',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: {},
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          const d = res.data;
          const credits = d.remaining || 0;
          app.globalData.credits = credits;
          app.globalData.plan = d.plan;
          this.setData({
            credits,
            creditsFixed: credits.toFixed(2),
            plan: d.plan,
            planLabel: d.plan === 'professional' ? '专业版' : d.plan === 'pro' ? 'Pro' : 'Free',
          });
        }
      },
    });
  },

  checkBinding() {
    const token = api.getToken();
    if (!token) return; // 未登录，不自动登录
    this.checkBindingWithToken(token);
  },

  checkBindingWithToken(token) {
    const isBound = token.startsWith('user_');
    this.setData({ isBound });
    if (!isBound && token.startsWith('wxmp_')) {
      const openid = token.substring(5, token.indexOf(':'));
      this.setData({ openid });
    }
  },

  goSignals() {
    wx.navigateTo({ url: '/pages/signals/signals' });
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  },

  goBilling() {},

  goPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  deleteAccount() {
    console.log('[mine] deleteAccount tapped');
    wx.showModal({
      title: '注销前确认',
      content: '你的联系人、互动记录、待办等数据已导出备份了吗？注销后所有数据将被永久删除，无法恢复。',
      confirmText: '继续',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        this._confirmDelete();
      },
      fail: (err) => {
        console.error('[mine] showModal failed:', err);
      },
    });
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
    const token = api.getToken();
    // 已绑定用户 token 是 user_xxx:secret，提取 clerk_user_id
    // 未绑定用户 token 是 wxmp_<openid>:secret，用 openid
    const clerkUserId = token && token.startsWith('user_') ? token.substring(0, token.indexOf(':')) : null;
    if (!clerkUserId) {
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
        // 用 clerk_user_id 解绑（后端通过 clerk_to_wxmp 反向映射找到 openid）
        wx.request({
          url: 'https://api.welian.app/ai/wxmp_unbind',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { clerk_user_id: clerkUserId },
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
              // 解绑后回到 welcome 页，会自动微信登录进首页
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

  onShareTimeline() {
    return {
      title: 'Welian ∞ — 维系情感，联结目标',
      query: '',
    };
  },

  showInviteQR() {
    const token = api.getToken();
    if (!token) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '生成中…' });
    wx.request({
      url: 'https://api.welian.app/ai/wxmp_invite_qrcode',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200 && res.data && res.data.ok) {
          const qrcodeUrl = res.data.qrcode_url;
          // qrcodeUrl is a data:image/png;base64,... URL
          // wx.previewImage doesn't support data URLs — write to temp file first
          if (qrcodeUrl && qrcodeUrl.startsWith('data:image/')) {
            const base64Data = qrcodeUrl.split(',')[1];
            const filePath = `${wx.env.USER_DATA_PATH}/invite_qr.png`;
            const fs = wx.getFileSystemManager();
            fs.writeFile({
              filePath,
              data: base64Data,
              encoding: 'base64',
              success: () => {
                this.setData({ inviteQrUrl: filePath });
                wx.showModal({
                  title: '邀请好友',
                  content: '长按图片保存，发给好友扫码注册即可',
                  confirmText: '查看图片',
                  success: (r) => {
                    if (r.confirm) {
                      wx.previewImage({ urls: [filePath], current: filePath });
                    }
                  },
                });
              },
              fail: () => wx.showToast({ title: '图片生成失败', icon: 'none' }),
            });
          } else {
            this.setData({ inviteQrUrl: qrcodeUrl });
            wx.showModal({
              title: '邀请好友',
              content: '长按图片保存，发给好友扫码注册即可',
              confirmText: '查看图片',
              success: (r) => {
                if (r.confirm && qrcodeUrl) {
                  wx.previewImage({ urls: [qrcodeUrl], current: qrcodeUrl });
                }
              },
            });
          }
        } else {
          wx.showToast({ title: (res.data && res.data.error) || '生成失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  dismissCelebration() {
    this.setData({ showCelebration: false });
  },

  _confirmDelete() {
    wx.showModal({
      title: '确定要注销吗？',
      content: '所有联系人、互动记录、待办和账单数据将被永久删除。',
      confirmText: '确定',
      confirmColor: '#C96442',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        // Step 3: 输入"删除"确认
        this._typeConfirmDelete();
      },
    });
  },

  _typeConfirmDelete() {
    this.setData({ showDeleteModal: true, deleteInput: '' });
  },

  onDeleteInput(e) {
    this.setData({ deleteInput: e.detail.value });
  },

  cancelDelete() {
    this.setData({ showDeleteModal: false, deleteInput: '' });
  },

  noop() {},

  showGzhQrcode() {
    this.setData({ showGzh: true });
  },

  closeGzh() {
    this.setData({ showGzh: false });
  },

  confirmDeleteInput() {
    const input = (this.data.deleteInput || '').trim();
    if (input !== '删除') {
      wx.showToast({ title: '输入不匹配', icon: 'none' });
      return;
    }
    this.setData({ showDeleteModal: false });
    this._executeDelete();
  },

  _executeDelete() {
    const token = api.getToken();
    if (!token) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '正在注销…' });
    wx.request({
      url: 'https://api.welian.app/data/delete_account',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: { confirm: true },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200 && res.data && res.data.ok) {
          // 数据已删除 → 清理本地存储，重置登录态，跳转
          api.clearToken();
          wx.removeStorageSync('welian_notes_history');
          // 重置 app.loginReady，让 welcome 页重新走登录流程
          app.loginReady = app._autoLogin();
          wx.showToast({ title: '账户已注销', icon: 'none' });
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/welcome/welcome' });
          }, 1500);
        } else {
          wx.showToast({ title: (res.data && res.data.error) || '注销失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },
});
