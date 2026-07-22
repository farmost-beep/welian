// pages/contacts/contacts.js — 关系列表页
const api = require('../../utils/api.js');

Page({
  data: {
    activeTab: 'leverage',
    leverageList: [],
    nurtureList: [],
    searchKeyword: '',
    searchResults: null,
    loading: true,
    error: '',
    totalContacts: 0,
    showingCount: 0,
  },

  onShow() {
    this.loadContacts();
  },

  loadContacts() {
    this.setData({ loading: true, error: '' });
    api.getContacts().then((res) => {
      this.setData({
        leverageList: res.leverage || [],
        nurtureList: res.nurture || [],
        totalContacts: res.total || 0,
        showingCount: (res.leverage || []).length + (res.nurture || []).length,
        loading: false,
      });
    }).catch((err) => {
      this.setData({ loading: false, error: err.message || '加载失败' });
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab, searchResults: null, searchKeyword: '' });
  },

  onSearchInput(e) {
    const keyword = e.detail.value;
    this.setData({ searchKeyword: keyword });
    if (!keyword.trim()) {
      this.setData({ searchResults: null });
      return;
    }
    api.searchContacts(keyword.trim()).then((results) => {
      this.setData({ searchResults: results });
    }).catch(() => {
      this.setData({ searchResults: [] });
    });
  },

  clearSearch() {
    this.setData({ searchKeyword: '', searchResults: null });
  },

  tapContact(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/contact-detail/contact-detail?id=${id}` });
  },

  onPullDownRefresh() {
    this.loadContacts();
    setTimeout(() => wx.stopPullDownRefresh(), 1000);
  },
});
