// pages/profile/profile.js — 个人画像
const api = require('../../utils/api.js');

const FIELDS = [
  { key: 'name', label: '姓名', placeholder: '你的名字' },
  { key: 'occupation', label: '职业', placeholder: '如：产品经理' },
  { key: 'company', label: '公司', placeholder: '公司名称' },
  { key: 'industry', label: '行业', placeholder: '如：金融/科技' },
  { key: 'location', label: '所在地', placeholder: '如：上海' },
  { key: 'communication_style', label: '沟通风格', placeholder: '如：正式/轻松/混合' },
  { key: 'address_habit', label: '称呼习惯', placeholder: '如：老X、X总、X哥' },
  { key: 'focus_areas', label: '关注领域', placeholder: '如：量化投资、智能科技' },
  { key: 'message_tone', label: '拟消息语气', placeholder: '如：简洁直接、不卑不亢' },
  { key: 'career_goal', label: '当前职业目标', placeholder: '你的职业目标' },
  { key: 'current_projects', label: '正在推进的事', placeholder: '当前项目' },
  { key: 'network_direction', label: '人脉方向', placeholder: '如：拓展量化圈' },
];

const TEXTAREA_FIELDS = ['focus_areas', 'career_goal', 'current_projects', 'network_direction', 'notes'];

Page({
  data: {
    profile: {},
    editing: false,
    loading: true,
    saving: false,
    completeness: 0,
    fields: FIELDS,
    textareaFields: TEXTAREA_FIELDS,
  },

  onLoad() {
    if (!api.requireLogin()) return;
    this.loadProfile();
  },

  onPullDownRefresh() {
    this.loadProfile(() => wx.stopPullDownRefresh());
  },

  loadProfile(cb) {
    this.setData({ loading: true });
    const token = api.getToken();
    wx.request({
      url: 'https://api.welian.app/data/profile',
      method: 'GET',
      header: { 'Authorization': 'Bearer ' + token },
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          const profile = res.data.profile || {};
          const filled = FIELDS.filter(f => profile[f.key] && profile[f.key].trim()).length;
          this.setData({ profile, completeness: filled, loading: false });
        } else {
          this.setData({ loading: false });
        }
        if (cb) cb();
      },
      fail: () => {
        this.setData({ loading: false });
        if (cb) cb();
      },
    });
  },

  startEdit() {
    this.setData({ editing: true });
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    this.setData({ [`profile.${key}`]: value });
  },

  saveProfile() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    const token = api.getToken();
    wx.request({
      url: 'https://api.welian.app/data/profile',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: this.data.profile,
      success: (res) => {
        this.setData({ saving: false });
        if (res.statusCode === 200 && res.data && res.data.ok) {
          const filled = FIELDS.filter(f => this.data.profile[f.key] && this.data.profile[f.key].trim()).length;
          this.setData({ editing: false, completeness: filled });
          wx.showToast({ title: '已保存', icon: 'success' });
        } else {
          wx.showToast({ title: (res.data && res.data.error) || '保存失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ saving: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  cancelEdit() {
    this.setData({ editing: false });
    this.loadProfile();
  },
});
