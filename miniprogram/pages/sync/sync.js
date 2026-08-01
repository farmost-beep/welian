// pages/sync/sync.js — 通用页面渲染器
const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    components: [],
    inputValue: '',
    connected: false,
    scrollToId: '',
  },

  socket: null,
  _unloaded: false,
  _reconnectTimer: null,
  _reconnectAttempts: 0,
  _inputValue: '',
  _scrollSeq: 0,

  _scrollTo(id, baseComponents) {
    this._scrollSeq++;
    const anchorId = `anchor_${this._scrollSeq}`;
    // 先插入锚点并渲染
    const source = baseComponents || this.data.components;
    const components = source.filter(c => !c.id?.startsWith('anchor_'));
    components.push({ id: anchorId, type: 'anchor' });
    this.setData({ components }, () => {
      // DOM 渲染完成后再触发滚动
      this.setData({ scrollToId: anchorId });
    });
  },

  async onLoad(options) {
    if (!api.getToken()) {
      try { await app.loginReady; } catch (e) { return; }
    }
    this._unloaded = false;
    this._draftContact = options && options.draft ? decodeURIComponent(options.draft) : '';
    this.connect();
  },

  onUnload() {
    this._unloaded = true;
    this._cleanup();
  },

  onHide() {
    // 保持连接，不清理
  },

  onShow() {
    if (!api.getToken()) return;
    if (!this._unloaded && !this.socket && !this.data.connected && !this._reconnectTimer) {
      this.connect();
    }
  },

  _cleanup() {
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = null;
    }
  },

  connect() {
    const token = api.getToken();
    if (!token) {
      this.setData({ connected: false });
      return;
    }

    this.setData({ connected: false });
    const wsUrl = api.getSyncUrl();
    if (!wsUrl) return;

    let opened = false;
    console.log('[sync] connecting to', wsUrl.substring(0, 60) + '...');

    // 修复：回调直接作为 connectSocket 参数传入，避免 onOpen 注册时连接已 open 导致回调丢失
    const socket = wx.connectSocket({
      url: wsUrl,
      success: () => { console.log('[sync] connectSocket success (pending open)'); },
      fail: (err) => { console.error('[sync] connectSocket FAIL:', err); },
      onOpen: () => {
        opened = true;
        this.socket = socket;
        this._reconnectAttempts = 0;
        this.setData({ connected: true });
        console.log('[sync] WebSocket connected');
        // 主动请求初始页面（兜底 stateless 模式下后端 pushRender 丢失）
        try {
          socket.send({ data: JSON.stringify({ action: 'init' }) });
        } catch (e) {
          console.warn('[sync] init send failed:', e.message);
        }
        // 一键拟消息：从 Dashboard 跳转来自动发起拟消息请求
        if (this._draftContact) {
          const msg = `帮我给${this._draftContact}写条消息`;
          setTimeout(() => {
            try { socket.send({ data: JSON.stringify({ action: 'input', value: msg }) }); } catch (e) {}
            this._draftContact = '';
          }, 800);
        }
      },
      onMessage: (res) => {
        this.handleMessage(res.data);
      },
      onError: (err) => {
        console.error('[sync] socket error:', JSON.stringify(err));
      },
      onClose: (result) => {
        this.socket = null;
        this.setData({ connected: false });
        console.log('[sync] closed, code:', result.code, 'reason:', result.reason, 'opened was:', opened);
        if (!opened) {
          console.error('[sync] NEVER connected — likely socket domain not configured or token invalid');
        }
        this._scheduleReconnect();
      },
    });

    // 兜底：如果 connectSocket 返回的 SocketTask 已 open（时序竞争），补注册回调
    if (socket && typeof socket.onOpen === 'function') {
      socket.onOpen(() => {
        if (!opened) {
          opened = true;
          this.socket = socket;
          this._reconnectAttempts = 0;
          this.setData({ connected: true });
          console.log('[sync] WebSocket connected (via SocketTask.onOpen)');
          try {
            socket.send({ data: JSON.stringify({ action: 'init' }) });
          } catch (e) {}
        }
      });
      socket.onMessage((res) => this.handleMessage(res.data));
      socket.onError((err) => console.error('[sync] socket error:', JSON.stringify(err)));
      socket.onClose((result) => {
        this.socket = null;
        this.setData({ connected: false });
        if (!this._reconnectTimer) this._scheduleReconnect();
      });
    }
  },

  _scheduleReconnect() {
    if (this._unloaded) return;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectAttempts++;
    const delay = Math.min(2000 * Math.pow(1.5, this._reconnectAttempts - 1), 30000);
    this._reconnectTimer = setTimeout(() => {
      if (this._unloaded) return;
      this.connect();
    }, delay);
  },

  handleMessage(data) {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    // 收到任何消息都说明连接已建立（兜底 stateless 模式下 onOpen 丢失的情况）
    if (!this.data.connected) {
      this.setData({ connected: true });
    }

    if (msg.type === 'render') {
      // 全量替换页面组件
      const components = msg.page?.components || [];
      this._inputValue = '';
      const last = components[components.length - 1];
      if (last) {
        this._scrollTo(last.id, components);
      } else {
        this.setData({ components, inputValue: '' });
      }
    } else if (msg.type === 'patch') {
      // 增量更新某个组件
      this.applyPatch(msg);
    } else if (msg.type === 'navigate') {
      if (msg.tab) {
        wx.switchTab({ url: msg.url });
      } else {
        wx.navigateTo({ url: msg.url });
      }
    } else if (msg.type === 'action' && msg.action?.setStorage) {
      wx.setStorageSync(msg.action.setStorage.key, msg.action.setStorage.value);
    } else if (msg.type === 'action' && msg.action?.pay) {
      this._handlePay(msg.action.pay);
    } else if (msg.type === 'action' && msg.action?.download) {
      this._handleDownload(msg.action.download);
    } else if (msg.type === 'toast') {
      wx.showToast({ title: msg.text || '', icon: 'none' });
    }
  },

  applyPatch(patch) {
    const components = this.data.components.slice();
    const idx = components.findIndex(c => c.id === patch.target);
    if (idx === -1) {
      // 目标组件不存在，创建新的
      if (patch.op === 'create') {
        components.push({ id: patch.target, type: 'text', content: patch.content || '' });
        this.setData({ components });
      }
      return;
    }

    if (patch.op === 'append') {
      components[idx] = {
        ...components[idx],
        content: (components[idx].content || '') + (patch.content || ''),
      };
      this._scrollTo(patch.target, components);
    } else if (patch.op === 'replace') {
      components[idx] = {
        ...components[idx],
        content: patch.content || '',
      };
      this._scrollTo(patch.target, components);
    } else if (patch.op === 'done') {
      // 流式输出完成，无操作
    } else if (patch.op === 'remove') {
      components.splice(idx, 1);
      this.setData({ components });
    }
  },

  onInput(e) {
    this._inputValue = e.detail.value;
    this.setData({ inputValue: e.detail.value });
  },

  onSend() {
    const value = this._inputValue;
    if (!value || !value.trim()) return;
    if (!this.socket) return;

    // 立即本地显示用户气泡，不等后端确认
    const components = this.data.components.filter(c => c.type !== 'input' && c.type !== 'buttons');
    const localId = `local_u_${Date.now()}`;
    components.push({ id: localId, type: 'text', role: 'user', content: value.trim() });
    this._inputValue = '';
    this._scrollTo(localId, components);
    this.setData({ inputValue: '' });

    this.socket.send({
      data: JSON.stringify({ action: 'input', value: value.trim() }),
    });
  },

  onTap(e) {
    if (!this.socket) return;
    const id = e.currentTarget.dataset.id;

    // 立即本地显示用户气泡
    const components = this.data.components.filter(c => c.type !== 'input' && c.type !== 'buttons');
    const localId = `local_u_${Date.now()}`;
    components.push({ id: localId, type: 'text', role: 'user', content: id });
    this._scrollTo(localId, components);

    this.socket.send({
      data: JSON.stringify({ action: 'tap', id }),
    });
  },

  _handleDownload(dl) {
    if (!dl || !dl.url) {
      console.error('[sync] download action received but no url', dl);
      return;
    }
    console.log('[sync] downloading PDF:', dl.url.substring(0, 80));
    wx.showLoading({ title: '下载中…' });
    wx.downloadFile({
      url: dl.url,
      success: (res) => {
        wx.hideLoading();
        console.log('[sync] download result:', res.statusCode, res.tempFilePath);
        if (res.statusCode === 200) {
          wx.openDocument({
            filePath: res.tempFilePath,
            fileType: 'pdf',
            showMenu: true,
            success: () => console.log('[sync] PDF opened'),
            fail: (e) => {
              console.error('[sync] openDocument failed:', e);
              wx.showToast({ title: '无法打开文件', icon: 'none' });
            },
          });
        } else {
          console.error('[sync] download failed, status:', res.statusCode);
          wx.showToast({ title: `下载失败(${res.statusCode})`, icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('[sync] downloadFile failed:', err);
        wx.showToast({ title: '下载失败: ' + (err.errMsg || ''), icon: 'none', duration: 3000 });
      },
    });
  },

  _handlePay(pay) {
    if (!pay || !pay.timeStamp) return;
    wx.requestPayment({
      timeStamp: pay.timeStamp,
      nonceStr: pay.nonceStr,
      package: pay.package,
      signType: pay.signType,
      paySign: pay.paySign,
      success: () => {
        if (this.socket) {
          this.socket.send({ data: JSON.stringify({ action: 'pay_result', status: 'success', orderId: pay.orderId }) });
        }
      },
      fail: (err) => {
        const cancelled = err.errMsg && err.errMsg.includes('cancel');
        if (this.socket) {
          this.socket.send({ data: JSON.stringify({ action: 'pay_result', status: cancelled ? 'cancelled' : 'failed', orderId: pay.orderId }) });
        }
      },
    });
  },

  reconnect() {
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    this._reconnectAttempts = 0;
    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = null;
    }
    this.connect();
  },
});
