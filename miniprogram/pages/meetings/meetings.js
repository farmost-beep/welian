// pages/meetings/meetings.js — 会议列表页
const api = require('../../utils/api.js');
const { formatDate } = require('../../utils/meetings-logic.js');

const STATUS_LABELS = { planned: '待开始', ongoing: '进行中', completed: '已结束' };

Page({
  data: {
    meetings: [],
    loading: true,
    error: '',
    showCreate: false,
    creating: false,
    scanning: false,
    form: { title: '', date: '', location: '', purpose: '' },
  },

  onShow() {
    if (!api.requireLogin()) return;
    this.loadMeetings();
  },

  onPullDownRefresh() {
    this.loadMeetings(() => wx.stopPullDownRefresh());
  },

  loadMeetings(cb) {
    this.setData({ loading: true, error: '' });
    const token = api.getToken();
    if (!token) {
      this.setData({ loading: false, error: '请先登录' });
      if (cb) cb();
      return;
    }
    wx.request({
      url: 'https://api.welian.app/data/meetings',
      method: 'GET',
      header: { 'Authorization': 'Bearer ' + token },
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          const meetings = (res.data.meetings || []).map(m => ({
            ...m,
            statusLabel: STATUS_LABELS[m.status] || m.status || '待开始',
            dateLabel: formatDate(m.date),
            attendeeCount: (m.attendees || []).length,
          })).sort((a, b) => {
            const da = new Date(a.date || 0).getTime();
            const db = new Date(b.date || 0).getTime();
            return db - da;
          });
          this.setData({ meetings, loading: false });
        } else {
          this.setData({ loading: false, error: '加载失败' });
        }
        if (cb) cb();
      },
      fail: (err) => {
        this.setData({ loading: false, error: (err && err.errMsg) || '网络错误' });
        if (cb) cb();
      },
    });
  },

  // formatDate 已提取到 utils/meetings-logic.js

  // ── 创建会议 ──
  openCreate() {
    const today = new Date();
    const defaultDate = today.toISOString().slice(0, 10);
    this.setData({ showCreate: true, form: { title: '', date: defaultDate, location: '', purpose: '' } });
  },

  closeCreate() {
    if (this.data.creating) return;
    this.setData({ showCreate: false });
  },

  noop() {},

  // ── 拍议程照片自动填充 ──
  scanAgenda() {
    if (this.data.scanning) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: (res) => {
        const tempFile = res.tempFiles && res.tempFiles[0];
        if (!tempFile) return;
        this.uploadAgendaPhoto(tempFile.tempFilePath, tempFile.fileType || 'image');
      },
    });
  },

  uploadAgendaPhoto(tempFilePath, fileType) {
    this.setData({ scanning: true });
    wx.compressImage({
      src: tempFilePath,
      quality: 70,
      compressedWidth: 800,
      success: (compressed) => this.readAndSendAgenda(compressed.tempFilePath, fileType),
      fail: () => this.readAndSendAgenda(tempFilePath, fileType),
    });
  },

  readAndSendAgenda(filePath, fileType) {
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (r) => {
        const base64 = r.data;
        const ext = (filePath || '').split('.').pop().toLowerCase();
        let mediaType = 'image/jpeg';
        if (ext === 'png') mediaType = 'image/png';
        else if (ext === 'webp') mediaType = 'image/webp';
        else if (ext === 'gif') mediaType = 'image/gif';
        this.sendAgendaPhoto(base64, mediaType);
      },
      fail: () => {
        this.setData({ scanning: false });
        wx.showToast({ title: '图片读取失败', icon: 'none' });
      },
    });
  },

  sendAgendaPhoto(base64, mediaType) {
    const token = api.getToken();
    wx.request({
      url: 'https://api.welian.app/ai/meeting_photo',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: { photo_type: 'agenda', base64, media_type: mediaType },
      success: (res) => {
        this.setData({ scanning: false });
        console.log('[meeting_photo] response:', JSON.stringify(res.data).substring(0, 500));
        if (res.statusCode === 200 && res.data && res.data.status === 'ok') {
          const ex = res.data.extracted || {};
          const form = { ...this.data.form };
          if (ex.title) form.title = ex.title;
          if (ex.date) {
            // Normalize date to YYYY-MM-DD for picker
            const d = String(ex.date).trim();
            const m = d.match(/(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})/);
            if (m) {
              form.date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
              form.date = d;
            }
          }
          if (ex.location) form.location = ex.location;
          if (ex.purpose) form.purpose = ex.purpose;
          if (ex.agenda) this._pendingAgenda = ex.agenda;
          this.setData({ form });
          if (res.data.unstructured) {
            wx.showToast({ title: '已识别（部分），请补充', icon: 'none' });
          } else {
            wx.showToast({ title: '已识别，请确认', icon: 'success' });
          }
        } else {
          wx.showToast({ title: (res.data && res.data.error) || '识别失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ scanning: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onDateChange(e) {
    this.setData({ 'form.date': e.detail.value });
  },

  createMeeting() {
    const form = this.data.form;
    if (this.data.creating) return;
    if (!form.title.trim()) {
      wx.showToast({ title: '请输入会议标题', icon: 'none' });
      return;
    }
    this.setData({ creating: true });
    const token = api.getToken();
    wx.request({
      url: 'https://api.welian.app/data/meetings',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: {
        title: form.title.trim(),
        date: form.date,
        location: form.location.trim(),
        purpose: form.purpose.trim(),
        agenda: this._pendingAgenda || [],
      },
      success: (res) => {
        this.setData({ creating: false });
        if (res.statusCode === 200 && res.data && res.data.ok) {
          const meeting = res.data.meeting || {};
          // Auto-create a "参会" todo linked to this meeting
          wx.request({
            url: 'https://api.welian.app/data/todos',
            method: 'POST',
            header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            data: {
              task: `参加：${form.title.trim()}`,
              due: form.date + 'T09:00',
              priority: 'P1',
              source: `meeting:${meeting.id}`,
            },
            success: (todoRes) => {
              if (todoRes.statusCode === 200) {
                console.log('[meeting] auto-todo created for', meeting.id);
              }
            },
          });
          wx.showToast({ title: '已创建会议+参会待办', icon: 'success' });
          this._pendingAgenda = null;
          this.setData({ showCreate: false });
          this.loadMeetings();
        } else {
          wx.showToast({ title: (res.data && res.data.error) || '创建失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ creating: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  // ── 进入详情 ──
  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/meeting-detail/meeting-detail?id=' + id });
  },

  // ── 长按删除 ──
  onLongPress(e) {
    const id = e.currentTarget.dataset.id;
    const title = e.currentTarget.dataset.title;
    wx.showModal({
      title: '删除会议',
      content: `确定删除「${title}」吗？此操作不可恢复。`,
      confirmText: '删除',
      confirmColor: '#C65D5D',
      success: (r) => {
        if (r.confirm) {
          this.deleteMeeting(id);
        }
      },
    });
  },

  deleteMeeting(id) {
    const token = api.getToken();
    wx.showLoading({ title: '删除中…' });
    wx.request({
      url: 'https://api.welian.app/data/meetings?id=' + id,
      method: 'DELETE',
      header: { 'Authorization': 'Bearer ' + token },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200 && res.data && res.data.ok) {
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadMeetings();
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

  onShareAppMessage() {
    return {
      title: 'Welian — 会议管理，拍照即记',
      path: '/pages/welcome/welcome',
    };
  },

  onShareTimeline() {
    return {
      title: '会议管理 · Welian',
      query: '',
    };
  },
});
