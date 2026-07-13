// pages/contacts/contacts.js — 关系列表页
// 按撬动型/维系型分组，搜索框

const api = require('../../utils/api.js');

Page({
  data: {
    activeTab: 'leverage',  // 'leverage' | 'nurture'
    leverageList: [],
    nurtureList: [],
    searchKeyword: '',
    searchResults: null,   // null=未搜索，array=搜索结果
    loading: true,
  },

  onLoad() {
    this.loadContacts();
  },

  loadContacts() {
    this.setData({ loading: true });
    api.getContacts().then((res) => {
      this.setData({
        leverageList: res.leverage || [],
        nurtureList: res.nurture || [],
        loading: false,
      });
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
    });
  },

  clearSearch() {
    this.setData({ searchKeyword: '', searchResults: null });
  },

  tapContact(e) {
    const id = e.currentTarget.dataset.id;
    // 占位：跳转联系人详情（后续实现）
    wx.showToast({ title: '详情页开发中', icon: 'none' });
  },
});
