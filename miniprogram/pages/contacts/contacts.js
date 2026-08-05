// pages/contacts/contacts.js — 关系列表页
const api = require('../../utils/api.js');
const { groupContactsBy, groupLabels } = require('../../utils/contacts-logic.js');
const app = getApp();

const PAGE_SIZE_DEFAULT = 100;
let PAGE_SIZE = PAGE_SIZE_DEFAULT;

Page({
  data: {
    activeTab: 'all',
    allList: [],
    leverageList: [],
    nurtureList: [],
    // 分组
    groupMode: 'none', // none/company/relation/tag
    groupModeIndex: 0,
    groupModeOptions: ['不分组', '按公司', '按关系', '按标签'],
    groupModeValues: ['none', 'company', 'relation', 'tag'],
    groupedContacts: [],
    groupedContactsNames: [],
    selectedGroup: '',
    selectedGroupIndex: 0,
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
    scanSaving: false,
    // 通讯录导入
    importing: false,
    // 粘贴文本提取联系人
    pasteModal: false,
    pasteInput: '',
    pasteParsing: false,
    pasteResult: false,
    pasteResultContacts: [],
    pasteSaving: false,
  },

  onLoad() {
    // 从 config 覆盖分页大小
    const ps = app.threshold('page_size_contacts');
    if (ps) PAGE_SIZE = ps;
  },

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    if (!api.getToken()) {
      this.setData({ loading: true });
      try { await app.loginReady; } catch (e) { this.setData({ loading: false }); return; }
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().refresh();
    }
    this.loadContacts();
  },

  loadContacts() {
    this.setData({ loading: true, error: '', currentOffset: 0, hasMore: true });
    api.getContacts(0, PAGE_SIZE).then((res) => {
      const leverage = res.leverage || [];
      const nurture = res.nurture || [];
      const all = leverage.concat(nurture);
      this.setData({
        allList: all,
        leverageList: leverage,
        nurtureList: nurture,
        totalContacts: res.total || 0,
        currentOffset: PAGE_SIZE,
        hasMore: res.hasMore,
        loading: false,
      });
      this.applyGrouping();
    }).catch((err) => {
      this.setData({ loading: false, error: err.message || '加载失败' });
    });
  },

  // 加载更多
  loadMore() {
    const { currentOffset, hasMore, loadingMore } = this.data;
    if (!hasMore || loadingMore) return;
    this.setData({ loadingMore: true });
    api.getContacts(currentOffset, PAGE_SIZE).then((res) => {
      const leverage = this.data.leverageList.concat(res.leverage || []);
      const nurture = this.data.nurtureList.concat(res.nurture || []);
      // deduplicate dual contacts for allList
      const levIds = new Set(leverage.map(c => c.id));
      const all = leverage.concat(nurture.filter(c => !levIds.has(c.id)));
      this.setData({
        allList: all,
        leverageList: leverage,
        nurtureList: nurture,
        currentOffset: currentOffset + PAGE_SIZE,
        hasMore: res.hasMore,
        loadingMore: false,
      });
      this.applyGrouping();
    }).catch(() => {
      this.setData({ loadingMore: false });
    });
  },

  // 分组
  onGroupModeChange(e) {
    const idx = parseInt(e.detail.value);
    this.setData({ groupMode: this.data.groupModeValues[idx], groupModeIndex: idx });
    this.applyGrouping();
  },

  applyGrouping() {
    const { groupMode, activeTab } = this.data;
    let list = activeTab === 'leverage' ? this.data.leverageList :
               activeTab === 'nurture' ? this.data.nurtureList :
               this.data.allList;
    if (groupMode === 'none') {
      this.setData({ groupedContacts: [], selectedGroup: '' });
      return;
    }
    const grouped = groupContactsBy(list, groupMode);
    const names = groupLabels(grouped);
    this.setData({ groupedContacts: grouped, groupedContactsNames: names, selectedGroup: '', selectedGroupIndex: 0 });
  },

  // 第二层 picker：选具体分组项
  onSelectedGroupChange(e) {
    const idx = parseInt(e.detail.value);
    const group = this.data.groupedContacts[idx];
    if (group) {
      this.setData({ selectedGroupIndex: idx, selectedGroup: group.key });
    }
  },

  // 触底加载
  onReachBottom() {
    this.loadMore();
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab, searchResults: null, searchKeyword: '' });
    this.applyGrouping();
  },

  toggleGroup(e) {
    const key = e.currentTarget.dataset.key;
    const hidden = this.data.hiddenGroups || {};
    hidden[key] = !hidden[key];
    this.setData({ hiddenGroups: hidden });
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

  goNetwork() {
    wx.navigateTo({ url: '/pages/network/network' });
  },

  // ── 名片扫描 ──
  scanCard() {
    wx.showActionSheet({
      itemList: ['📷 拍照识别', '🖼️ 从相册选择'],
      success: (r) => {
        const sourceType = r.tapIndex === 0 ? ['camera'] : ['album'];
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType,
          sizeType: ['original'],
          camera: 'back',
          success: (res) => {
            const tempFile = res.tempFiles[0];
            // 压缩图片到合理尺寸（长边1280px），保证清晰度的同时减少传输
            wx.compressImage({
              src: tempFile.tempFilePath,
              quality: 92,
              compressedWidth: 1280,
              success: (compRes) => {
                this.uploadAndScan(compRes.tempFilePath);
              },
              fail: () => {
                // 压缩失败用原图
                this.uploadAndScan(tempFile.tempFilePath);
              },
            });
          },
        });
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
                needs_confirm: !!res.data.needs_confirm,
                contact: {
                  id: s(c.id),
                  name: s(c.name),
                  company: s(c.company),
                  title: s(c.title),
                  phone: s(c.phone),
                  email: s(c.email),
                  relation: s(c.relation),
                  confidence: s(c.confidence),
                },
              };
              this.setData({ scanning: false, scanResult });
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

  onScanEdit(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`scanResult.contact.${field}`]: e.detail.value });
  },

  confirmScanSave() {
    const contact = this.data.scanResult.contact;
    if (!contact.name || !contact.name.trim()) {
      wx.showToast({ title: '请填写姓名', icon: 'none' });
      return;
    }
    this.setData({ scanSaving: true });
    const token = api.getToken();
    wx.request({
      url: 'https://api.welian.app/ai/wxmp_card_scan',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: {
        confirm: true,
        contact_data: {
          name: contact.name.trim(),
          company: contact.company || '',
          title: contact.title || '',
          phone: contact.phone || '',
          email: contact.email || '',
          relation: contact.relation || '同行',
        },
      },
      success: (res) => {
        this.setData({ scanSaving: false });
        if (res.statusCode === 200 && res.data && res.data.ok) {
          const msg = res.data.message || '已保存';
          wx.showToast({ title: msg, icon: 'success' });
          this.setData({ scanResult: null });
          this.loadContacts();
        } else {
          wx.showToast({ title: (res.data && res.data.error) || '保存失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ scanSaving: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  viewScannedContact() {
    const result = this.data.scanResult;
    if (result && result.contact && result.contact.id) {
      wx.navigateTo({ url: `/pages/contact-detail/contact-detail?id=${result.contact.id}` });
      this.setData({ scanResult: null });
    }
  },

  // ── 粘贴文本提取联系人 ──
  noop() {},

  pasteText() {
    this.setData({ pasteModal: true, pasteInput: '', pasteParsing: false });
  },

  onPasteInput(e) {
    this.setData({ pasteInput: e.detail.value });
  },

  closePasteModal() {
    this.setData({ pasteModal: false });
  },

  submitPasteText() {
    const text = (this.data.pasteInput || '').trim();
    if (!text) {
      wx.showToast({ title: '请粘贴文本', icon: 'none' });
      return;
    }
    this.setData({ pasteParsing: true });
    const token = api.getToken();
    wx.request({
      url: 'https://api.welian.app/ai/import_chunk',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: { text },
      success: (res) => {
        this.setData({ pasteParsing: false });
        if (res.statusCode === 200 && res.data) {
          const contacts = (res.data.contacts || []).filter(c => c.name && c.name.trim());
          if (contacts.length === 0) {
            wx.showToast({ title: '未识别到联系人', icon: 'none' });
            return;
          }
          this.setData({
            pasteModal: false,
            pasteResult: true,
            pasteResultContacts: contacts.map(c => ({
              name: c.name || '',
              company: c.company || '',
              title: c.title || '',
              phone: c.phone || '',
              email: c.email || '',
              relation: c.relation || '',
            })),
          });
        } else {
          wx.showToast({ title: (res.data && res.data.error) || '提取失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ pasteParsing: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  onPasteContactEdit(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    const contacts = this.data.pasteResultContacts;
    contacts[index][field] = e.detail.value;
    this.setData({ pasteResultContacts: contacts });
  },

  closePasteResult() {
    this.setData({ pasteResult: false });
  },

  confirmPasteSave() {
    const contacts = this.data.pasteResultContacts.filter(c => c.name && c.name.trim());
    if (contacts.length === 0) {
      wx.showToast({ title: '没有有效联系人', icon: 'none' });
      return;
    }
    this.setData({ pasteSaving: true });
    const token = api.getToken();
    wx.request({
      url: 'https://api.welian.app/ai/import_batch',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: { contacts },
      success: (res) => {
        this.setData({ pasteSaving: false });
        if (res.statusCode === 200 && res.data) {
          const imported = res.data.imported || 0;
          const skipped = res.data.skipped || 0;
          if (imported > 0) {
            wx.showToast({ title: `导入${imported}人，跳过${skipped}人`, icon: 'success' });
            this.setData({ pasteResult: false });
            this.loadContacts();
          } else {
            wx.showToast({ title: '全部已存在', icon: 'none' });
          }
        } else {
          wx.showToast({ title: (res.data && res.data.error) || '保存失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ pasteSaving: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  // ── 导入入口（从手机通讯录导入）──
  importMenu() {
    this.importContact();
  },

  onPullDownRefresh() {
    this.loadContacts();
    setTimeout(() => wx.stopPullDownRefresh(), 1000);
  },

  // ── 微信通讯录直接导入 ──
  importContact() {
    if (this.data.importing) return;
    this._pickedContacts = [];
    this._pickOneContact();
  },

  _pickOneContact() {
    wx.chooseContact({
      success: (res) => {
        const name = (res.displayName || '').trim();
        if (!name) {
          this._finishContactImport();
          return;
        }
        const phone = res.phoneNumber || '';
        const phoneList = res.phoneNumberList || (phone ? [phone] : []);
        this._pickedContacts.push({ name, phone, phone_list: phoneList });
        wx.showModal({
          title: '已选择' + this._pickedContacts.length + '人',
          content: '继续添加下一个联系人？',
          confirmText: '继续',
          cancelText: '完成',
          success: (modal) => {
            if (modal.confirm) {
              this._pickOneContact();
            } else {
              this._finishContactImport();
            }
          },
        });
      },
      fail: () => {
        this._finishContactImport();
      },
    });
  },

  _finishContactImport() {
    const contacts = this._pickedContacts || [];
    if (contacts.length === 0) return;
    this.setData({ scanning: true, importing: true });
    const token = api.getToken();
    wx.request({
      url: 'https://api.welian.app/ai/import_batch',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: { contacts: contacts },
      success: (res) => {
        this.setData({ scanning: false, importing: false });
        if (res.statusCode === 200 && res.data) {
          const imported = res.data.imported || 0;
          const skipped = res.data.skipped || 0;
          if (imported > 0) {
            wx.showToast({ title: `导入${imported}人，跳过${skipped}人`, icon: 'success' });
            this.loadContacts();
          } else {
            wx.showToast({ title: '全部已存在', icon: 'none' });
          }
        } else {
          wx.showToast({ title: (res.data && res.data.error) || '导入失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ scanning: false, importing: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  onShareAppMessage() {
    return {
      title: 'Welian — 管好你的关系网络',
      path: '/pages/welcome/welcome',
    };
  },

  onShareTimeline() {
    return {
      title: '我在用 Welian 管理关系网络',
      query: '',
    };
  },

});
