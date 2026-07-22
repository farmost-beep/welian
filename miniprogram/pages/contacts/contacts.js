// pages/contacts/contacts.js — 关系列表页
const api = require('../../utils/api.js');

const PAGE_SIZE = 100;

Page({
  data: {
    activeTab: 'leverage',
    leverageList: [],
    nurtureList: [],
    searchKeyword: '',
    searchResults: null,
    loading: true,
    loadingMore: false,
    error: '',
    totalContacts: 0,
    currentOffset: 0,
    hasMore: true,
    // 名片扫描
    scanning: false,
    scanResult: null,
    scanError: '',
  },

  onShow() {
    this.loadContacts();
  },

  loadContacts() {
    this.setData({ loading: true, error: '', currentOffset: 0, hasMore: true });
    api.getContacts(0, PAGE_SIZE).then((res) => {
      this.setData({
        leverageList: res.leverage || [],
        nurtureList: res.nurture || [],
        totalContacts: res.total || 0,
        currentOffset: PAGE_SIZE,
        hasMore: res.hasMore,
        loading: false,
      });
    }).catch((err) => {
      this.setData({ loading: false, error: err.message || '加载失败' });
    });
  },

  // 加载更多
  loadMore() {
    const { currentOffset, hasMore, loadingMore, activeTab } = this.data;
    if (!hasMore || loadingMore) return;
    this.setData({ loadingMore: true });
    api.getContacts(currentOffset, PAGE_SIZE).then((res) => {
      this.setData({
        leverageList: this.data.leverageList.concat(res.leverage || []),
        nurtureList: this.data.nurtureList.concat(res.nurture || []),
        currentOffset: currentOffset + PAGE_SIZE,
        hasMore: res.hasMore,
        loadingMore: false,
      });
    }).catch(() => {
      this.setData({ loadingMore: false });
    });
  },

  // 触底加载
  onReachBottom() {
    this.loadMore();
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
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (fileRes) => {
        const base64 = fileRes.data;
        const ext = filePath.split('.').pop().toLowerCase();
        const mediaType = ext === 'png' ? 'image/png' : 'image/jpeg';
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
              const c = res.data.contact || {};
              const s = (v) => {
                if (v == null) return '';
                if (typeof v === 'string') return v;
                if (typeof v === 'number') return String(v);
                if (Array.isArray(v)) return v.find(e => typeof e === 'string') || '';
                if (typeof v === 'object') {
                  for (const k of ['name', 'type', 'value', 'label', 'text']) {
                    if (typeof v[k] === 'string') return v[k];
                  }
                  return Object.values(v).find(e => typeof e === 'string') || '';
                }
                return String(v);
              };
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
