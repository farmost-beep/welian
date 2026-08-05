// pages/timeline/timeline.js — 互动记录页
const api = require('../../utils/api.js');
const { filterAndGroup, formatDateInput, buildMonthDots } = require('../../utils/timeline-logic.js');

Page({
  data: {
    rawList: [],        // 原始列表
    groups: [],         // 按月分组后的列表
    searchKey: '',
    loading: true,
    error: '',
    // 弹窗
    showModal: false,
    isEdit: false,
    saving: false,
    form: {
      id: '',
      contact_name: '',
      summary: '',
      date: '',
    },
    contactSuggestions: [],
    // #4: 月度点状时间轴
    monthDots: [],
    monthActiveDays: 0,
    monthInteractions: 0,
  },

  onLoad() {
    if (!api.requireLogin()) return;
    this.loadTimeline();
  },

  onShow() {
    if (!api.getToken()) return;
    // 每次进入页面刷新
    this.loadTimeline();
  },

  onPullDownRefresh() {
    this.loadTimeline(() => wx.stopPullDownRefresh());
  },

  // ── 加载数据 ──
  loadTimeline(cb) {
    this.setData({ loading: true, error: '' });
    const token = api.getToken();
    if (!token) {
      this.setData({ loading: false, error: '请先登录' });
      if (cb) cb();
      return;
    }
    wx.request({
      url: 'https://api.welian.app/data/timeline',
      method: 'GET',
      header: { 'Authorization': 'Bearer ' + token },
      success: (res) => {
        if (res.statusCode === 200 && res.data.timeline) {
          const rawList = res.data.timeline || [];
          this.setData({ rawList, loading: false });
          this.applyFilter();
        } else {
          this.setData({ loading: false, error: '加载失败' });
        }
      },
      fail: () => {
        this.setData({ loading: false, error: '网络错误' });
      },
      complete: () => {
        if (cb) cb();
      },
    });
  },

  // ── 搜索过滤 + 分组 ──
  applyFilter() {
    const { rawList, searchKey } = this.data;
    const groups = filterAndGroup(rawList, searchKey);
    // #4: 月度点状时间轴（基于全部数据，不受搜索影响）
    const dotData = buildMonthDots(rawList);
    this.setData({ groups, monthDots: dotData.dots, monthActiveDays: dotData.activeDays, monthInteractions: dotData.monthInteractions });
  },

  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value });
    this.applyFilter();
  },

  clearSearch() {
    this.setData({ searchKey: '' });
    this.applyFilter();
  },

  // ── 添加 ──
  openAdd() {
    const today = formatDateInput(new Date());
    this.setData({
      showModal: true,
      isEdit: false,
      form: { id: '', contact_name: '', summary: '', date: today },
    });
  },

  // ── 编辑 ──
  openEdit(e) {
    const id = e.currentTarget.dataset.id;
    const entry = this.data.rawList.find(t => t.id === id);
    if (!entry) return;
    this.setData({
      showModal: true,
      isEdit: true,
      form: {
        id: entry.id,
        contact_name: entry.contact_name || '',
        summary: entry.summary || '',
        date: formatDateInput(new Date(entry.date)),
      },
    });
  },

  closeModal() {
    if (this.data.saving) return;
    this.setData({ showModal: false, contactSuggestions: [] });
  },

  noop() {},

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  onContactSearch(e) {
    const value = e.detail.value;
    this.setData({ 'form.contact_name': value });
    if (value.trim().length < 1) {
      this.setData({ contactSuggestions: [] });
      return;
    }
    api.searchContacts(value.trim()).then((results) => {
      this.setData({ contactSuggestions: results.slice(0, 8) });
    }).catch(() => {
      this.setData({ contactSuggestions: [] });
    });
  },

  pickContactSuggestion(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({ 'form.contact_name': name, contactSuggestions: [] });
  },

  onDateChange(e) {
    this.setData({ 'form.date': e.detail.value });
  },

  // ── 保存（添加/编辑） ──
  saveEntry() {
    const { form, isEdit, saving } = this.data;
    if (saving) return;
    if (!form.contact_name.trim()) {
      wx.showToast({ title: '请输入联系人', icon: 'none' });
      return;
    }
    if (!form.summary.trim()) {
      wx.showToast({ title: '请输入互动摘要', icon: 'none' });
      return;
    }
    if (!form.date) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    const payload = {
      contact_name: form.contact_name.trim(),
      summary: form.summary.trim(),
      date: form.date,
    };
    if (isEdit) payload.id = form.id;

    wx.request({
      url: 'https://api.welian.app/data/timeline',
      method: isEdit ? 'PUT' : 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
      data: payload,
      success: (res) => {
        this.setData({ saving: false });
        if (res.statusCode === 200 && (res.data.ok || res.data.id)) {
          if (!isEdit) {
            // #2: 温暖反馈（文案后端驱动）
            const app = getApp();
            wx.showToast({ title: app.getWarmMessage(form.contact_name.trim()), icon: 'none', duration: 2500 });
          } else {
            wx.showToast({ title: '已保存', icon: 'success' });
          }
          this.setData({ showModal: false });
          this.loadTimeline();
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ saving: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  // ── 删除（长按） ──
  onLongPress(e) {
    const id = e.currentTarget.dataset.id;
    const entry = this.data.rawList.find(t => t.id === id);
    if (!entry) return;
    const name = entry.contact_name || '此记录';
    wx.showModal({
      title: '删除互动记录',
      content: '确定删除「' + name + '」的互动记录吗？此操作不可恢复。',
      confirmText: '删除',
      confirmColor: '#C65D5D',
      success: (r) => {
        if (r.confirm) {
          this.deleteEntry(id);
        }
      },
    });
  },

  deleteEntry(id) {
    wx.showLoading({ title: '删除中…' });
    wx.request({
      url: 'https://api.welian.app/data/timeline?id=' + id,
      method: 'DELETE',
      header: { 'Authorization': 'Bearer ' + api.getToken() },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200 && res.data.ok) {
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadTimeline();
        } else {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  // ── 工具 ──
  // formatDateInput 已提取到 utils/timeline-logic.js

  onShareAppMessage() {
    return {
      title: 'Welian — 记录每一次用心的互动',
      path: '/pages/welcome/welcome',
    };
  },

  onShareTimeline() {
    return {
      title: '我的互动记录 · Welian',
      query: '',
    };
  },
});
