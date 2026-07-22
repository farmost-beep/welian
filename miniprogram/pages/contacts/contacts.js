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
    // 名片扫描
    scanning: false,
    scanResult: null,  // { contact, is_duplicate, message }
    scanError: '',
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

  // ── 名片扫描 ──
  scanCard() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFile = res.tempFiles[0];
        this.uploadAndScan(tempFile.tempFilePath);
      },
    });
  },

  uploadAndScan(filePath) {
    this.setData({ scanning: true, scanError: '', scanResult: null });
    // 读取图片为 base64
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (fileRes) => {
        const base64 = fileRes.data;
        // 判断图片类型
        const ext = filePath.split('.').pop().toLowerCase();
        const mediaType = ext === 'png' ? 'image/png' : 'image/jpeg';
        // 调后端识别
        wx.request({
          url: 'https://api.welian.app/ai/wxmp_card_scan',
          method: 'POST',
          header: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + api.getToken(),
          },
          data: { base64, media_type: mediaType },
          success: (res) => {
            if (res.statusCode === 200 && res.data && res.data.ok) {
              // 确保所有字段是字符串
              const c = res.data.contact || {};
              const s = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
              const scanResult = {
                ok: true,
                message: s(res.data.message),
                is_duplicate: !!res.data.is_duplicate,
                contact: {
                  id: s(c.id),
                  name: s(c.name),
                  company: s(c.company),
                  title: s(c.title),
                  phone: s(c.phone),
                  email: s(c.email),
                  relation: s(c.relation),
                },
              };
              this.setData({ scanning: false, scanResult });
              this.loadContacts();
              wx.showToast({ title: scanResult.message, icon: 'success' });
            } else {
              const errMsg = (res.data && res.data.error) || '识别失败';
              this.setData({ scanning: false, scanError: errMsg });
              wx.showToast({ title: errMsg, icon: 'none' });
            }
          },
          fail: () => {
            this.setData({ scanning: false, scanError: '网络错误' });
            wx.showToast({ title: '网络错误', icon: 'none' });
          },
        });
      },
      fail: () => {
        this.setData({ scanning: false, scanError: '读取图片失败' });
        wx.showToast({ title: '读取图片失败', icon: 'none' });
      },
    });
  },

  closeScanResult() {
    this.setData({ scanResult: null });
  },

  viewScannedContact() {
    const result = this.data.scanResult;
    if (result && result.contact && result.contact.id) {
      wx.navigateTo({ url: `/pages/contact-detail/contact-detail?id=${result.contact.id}` });
      this.setData({ scanResult: null });
    }
  },

  onPullDownRefresh() {
    this.loadContacts();
    setTimeout(() => wx.stopPullDownRefresh(), 1000);
  },

  onShareAppMessage() {
    return {
      title: 'Welian — 管好你的关系网络',
      path: '/pages/welcome/welcome',
    };
  },
});
