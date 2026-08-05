// pages/meeting-detail/meeting-detail.js — 会议详情页
const api = require('../../utils/api.js');

const STATUS_LABELS = { planned: '待开始', ongoing: '进行中', completed: '已结束' };
const PHOTO_TYPES = {
  agenda: '拍议程',
  card: '拍名片',
  roster: '拍参会名单',
  notes: '拍笔记',
};

Page({
  data: {
    meeting: null,
    loading: true,
    error: '',
    statusLabel: '',
    // 上传中状态
    uploading: '',
    // 识别结果
    prepResult: null,
    reviewResult: null,
    showPrep: false,
    showReview: false,
    notesText: '',
    // 提取数据展示
    extracted: {},
    // loading
    prepLoading: false,
    reviewLoading: false,
  },

  onLoad(options) {
    if (!api.requireLogin()) return;
    this.meetingId = options.id;
  },

  onShow() {
    if (!api.getToken()) return;
    if (this.meetingId) this.loadDetail();
  },

  onPullDownRefresh() {
    this.loadDetail(() => wx.stopPullDownRefresh());
  },

  loadDetail(cb) {
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
          const meeting = (res.data.meetings || []).find(m => String(m.id) === String(this.meetingId));
          if (meeting) {
            this.setData({
              meeting,
              statusLabel: STATUS_LABELS[meeting.status] || meeting.status || '待开始',
              loading: false,
            });
          } else {
            this.setData({ loading: false, error: '会议不存在' });
          }
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

  noop() {},

  // ── 拍照上传 ──
  choosePhoto(e) {
    const photoType = e.currentTarget.dataset.type;
    if (this.data.uploading) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: (res) => {
        const tempFile = res.tempFiles && res.tempFiles[0];
        if (!tempFile) return;
        this.uploadPhoto(photoType, tempFile.tempFilePath, tempFile.fileType || 'image');
      },
      fail: () => {},
    });
  },

  uploadPhoto(photoType, tempFilePath, fileType) {
    this.setData({ uploading: photoType });
    // Compress image first (max 800px wide)
    wx.compressImage({
      src: tempFilePath,
      quality: 70,
      compressedWidth: 800,
      success: (compressed) => {
        this._tempPhotoPath = compressed.tempFilePath;
        this.readAndSend(photoType, compressed.tempFilePath, fileType);
      },
      fail: () => {
        // Fallback: use original image
        this._tempPhotoPath = tempFilePath;
        this.readAndSend(photoType, tempFilePath, fileType);
      },
    });
  },

  readAndSend(photoType, filePath, fileType) {
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (r) => {
        const base64 = r.data;
        const mediaType = this.getMediaType(filePath, fileType);
        this.sendPhoto(photoType, base64, mediaType);
      },
      fail: () => {
        this.setData({ uploading: '' });
        wx.showToast({ title: '图片读取失败', icon: 'none' });
      },
    });
  },

  getMediaType(filePath, fileType) {
    if (fileType === 'image') {
      const ext = (filePath || '').split('.').pop().toLowerCase();
      if (ext === 'png') return 'image/png';
      if (ext === 'gif') return 'image/gif';
      if (ext === 'webp') return 'image/webp';
      return 'image/jpeg';
    }
    return 'image/jpeg';
  },

  sendPhoto(photoType, base64, mediaType) {
    const token = api.getToken();
    wx.request({
      url: 'https://api.welian.app/ai/meeting_photo',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: {
        meeting_id: this.meetingId,
        photo_type: photoType,
        base64,
        media_type: mediaType,
      },
      success: (res) => {
        this.setData({ uploading: '' });
        if (res.statusCode === 200 && res.data && res.data.status === 'ok') {
          const extractedData = res.data.extracted || {};
          const extracted = this.data.extracted;
          extracted[photoType] = extractedData;
          this.setData({ extracted });
          wx.showToast({ title: '已识别', icon: 'success' });
          // Save photo + extracted data to meeting object
          this.savePhotoToMeeting(photoType, base64, extractedData);
        } else {
          wx.showToast({ title: (res.data && res.data.error) || '识别失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ uploading: '' });
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  // ── 会前准备 ──
  async runPrep() {
    if (this.data.prepLoading) return;
    this.setData({ prepLoading: true });
    try {
      const data = await api.request('/ai/meeting_prep', { meeting_id: this.meetingId }, 'POST');
      this.setData({ prepLoading: false });
      if (data && data.prep) {
        this.setData({ prepResult: data.prep, showPrep: true });
      } else {
        wx.showToast({ title: (data && data.error) || '生成失败', icon: 'none' });
      }
    } catch (e) {
      this.setData({ prepLoading: false });
      wx.showToast({ title: e.message || '网络错误', icon: 'none' });
    }
  },

  closePrep() {
    this.setData({ showPrep: false });
  },

  // ── 会后复盘 ──
  onNotesInput(e) {
    this.setData({ notesText: e.detail.value });
  },

  async runReview() {
    if (this.data.reviewLoading) return;
    const notes = this.data.notesText.trim();
    if (!notes) {
      wx.showToast({ title: '请先输入会议笔记', icon: 'none' });
      return;
    }
    this.setData({ reviewLoading: true });
    try {
      const res = await api.request('/ai/meeting_review', { meeting_id: this.meetingId, notes_text: notes }, 'POST');
      this.setData({ reviewLoading: false });
      if (res && res.status === 'ok') {
        const r = res.review || {};
        this.setData({
          reviewResult: {
            summary: r.summary || '',
            new_contacts: r.new_contacts || [],
            follow_up_todos: r.follow_up_todos || [],
            opportunity_analysis: r.opportunity_analysis || [],
            leverage_insights: r.leverage_insights || '',
            goal_suggestions: r.goal_suggestions || [],
            unstructured: res.unstructured || false,
            auto_completed_todos: res.auto_completed_todos || 0,
            created_todos: res.created_todos || 0,
          },
          showReview: true,
        });
        // 刷新会议数据（后端已更新状态为 completed）
        this.loadDetail();
      } else {
        wx.showToast({ title: (res && res.error) || '生成失败', icon: 'none' });
      }
    } catch (e) {
      this.setData({ reviewLoading: false });
      wx.showToast({ title: e.message || '网络错误', icon: 'none' });
    }
  },

  closeReview() {
    this.setData({ showReview: false });
  },

  // ── 标记完成 ──
  markCompleted() {
    this.updateMeetingStatus('completed', '已标记为已完成');
  },

  // ── 重新设为待开始 ──
  markPlanned() {
    this.updateMeetingStatus('planned', '已重新设为待开始');
  },

  async updateMeetingStatus(status, toastMsg) {
    const m = this.data.meeting;
    if (!m) return;
    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: 'https://api.welian.app/data/meetings',
          method: 'POST',
          header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
          data: { id: m.id, status },
          success: resolve,
          fail: reject,
        });
      });
      if (res.statusCode === 200 && res.data && res.data.ok) {
        wx.showToast({ title: toastMsg, icon: 'success' });
        this.loadDetail();
      } else {
        wx.showToast({ title: (res.data && res.data.error) || '操作失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: e.message || '网络错误', icon: 'none' });
    }
  },

  // ── 删除会议 ──
  deleteMeeting() {
    const m = this.data.meeting;
    if (!m) return;
    wx.showModal({
      title: '删除会议',
      content: `确定删除「${m.title}」吗？此操作不可恢复。`,
      confirmText: '删除',
      confirmColor: '#C65D5D',
      success: (r) => {
        if (r.confirm) this.doDelete();
      },
    });
  },

  doDelete() {
    const token = api.getToken();
    wx.showLoading({ title: '删除中…' });
    wx.request({
      url: 'https://api.welian.app/data/meetings?id=' + this.meetingId,
      method: 'DELETE',
      header: { 'Authorization': 'Bearer ' + token },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200 && res.data && res.data.ok) {
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 800);
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

  // ── 保存照片到 meeting 对象 ──
  savePhotoToMeeting(photoType, base64, extractedData) {
    const token = api.getToken();
    const meeting = this.data.meeting;
    if (!meeting) return;
    const photos = meeting.photos || [];
    // Add new photo
    photos.push({
      type: photoType,
      image: `data:image/jpeg;base64,${base64}`,
      extracted_data: extractedData,
      timestamp: new Date().toISOString(),
    });
    // Merge extracted data into meeting fields
    let updatedMeeting = { ...meeting, photos, updated: new Date().toISOString() };
    if (photoType === 'agenda' && extractedData.title) {
      updatedMeeting.title = extractedData.title;
      updatedMeeting.date = extractedData.date || updatedMeeting.date;
      updatedMeeting.location = extractedData.location || updatedMeeting.location;
      updatedMeeting.purpose = extractedData.purpose || updatedMeeting.purpose;
      if (extractedData.agenda) updatedMeeting.agenda = extractedData.agenda;
    }
    if ((photoType === 'card' || photoType === 'roster') && extractedData.attendees) {
      // Merge attendees (dedup by name)
      const existing = updatedMeeting.attendees || [];
      const names = new Set(existing.map(a => a.name));
      for (const a of extractedData.attendees) {
        if (!names.has(a.name)) existing.push(a);
        else {
          // Update existing attendee with new info
          const idx = existing.findIndex(e => e.name === a.name);
          if (idx >= 0) existing[idx] = { ...existing[idx], ...a };
        }
      }
      updatedMeeting.attendees = existing;
    }
    if (photoType === 'notes') {
      if (extractedData.opportunities) {
        updatedMeeting.opportunities = [...(updatedMeeting.opportunities || []), ...extractedData.opportunities];
      }
      if (extractedData.contact_dynamics) updatedMeeting.contact_dynamics = extractedData.contact_dynamics;
      if (extractedData.key_points) updatedMeeting.notes = [...(updatedMeeting.notes || []), ...extractedData.key_points];
    }
    // POST update
    wx.request({
      url: 'https://api.welian.app/data/meetings',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: updatedMeeting,
      success: () => {
        this.setData({ meeting: updatedMeeting });
      },
      fail: () => {},
    });
  },

  // ── 查看照片 ──
  previewPhoto(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    // base64 data URL → need to save to temp file first
    if (url.startsWith('data:')) {
      const fs = wx.getFileSystemManager();
      const tempPath = `${wx.env.USER_DATA_PATH}/meeting_photo_${Date.now()}.jpg`;
      fs.writeFile({
        filePath: tempPath,
        data: url.replace(/^data:image\/\w+;base64,/, ''),
        encoding: 'base64',
        success: () => {
          wx.previewImage({ urls: [tempPath], current: tempPath });
        },
        fail: () => wx.showToast({ title: '图片加载失败', icon: 'none' }),
      });
    } else {
      wx.previewImage({ urls: [url], current: url });
    }
  },

  // ── 跳转联系人详情 ──
  openContact(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/contact-detail/contact-detail?id=${id}` });
  },

  openLocation() {
    const m = this.data.meeting;
    if (!m) return;
    if (m.latitude && m.longitude) {
      wx.openLocation({
        latitude: m.latitude,
        longitude: m.longitude,
        name: m.title || '会议',
        address: m.location || '',
      });
    } else if (m.location) {
      // No coordinates — copy address
      wx.setClipboardData({
        data: m.location,
        success: () => wx.showToast({ title: '地址已复制', icon: 'success' }),
      });
    } else {
      wx.showToast({ title: '无地址信息', icon: 'none' });
    }
  },

  addMeetingToCalendar() {
    const m = this.data.meeting;
    if (!m || !m.date) return;
    const dateStr = m.date.includes('T') ? m.date : m.date + 'T09:00:00';
    const startDate = new Date(dateStr);
    const startTs = isNaN(startDate.getTime()) ? Math.floor(Date.now() / 1000) : Math.floor(startDate.getTime() / 1000);
    const endTs = startTs + 3600; // 默认1小时
    wx.addPhoneCalendar({
      title: m.title || 'Welian 会议',
      startTime: startTs,
      endTime: endTs,
      allDay: false,
      alarm: true,
      alarmOffset: -3600,
      location: m.location || '',
      description: (m.purpose || '') + ' — 来自 Welian 提醒',
      success: () => wx.showToast({ title: '已添加到日历', icon: 'success' }),
      fail: (err) => {
        console.error('addPhoneCalendar fail:', err);
        const msg = (err && err.errMsg) || '';
        if (msg.includes('auth') || msg.includes('permission')) {
          wx.showModal({ title: '需要日历权限', content: '请在设置中开启日历权限', confirmText: '去设置', success: (r) => { if (r.confirm) wx.openSetting(); } });
        } else {
          wx.showToast({ title: '添加失败：' + (msg || '未知错误'), icon: 'none' });
        }
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
      title: '会议详情 · Welian',
      query: '',
    };
  },
});
