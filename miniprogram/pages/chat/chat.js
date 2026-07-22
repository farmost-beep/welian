// pages/chat/chat.js — 小维 AI 对话（WebSocket 流式）
const api = require('../../utils/api.js');

Page({
  data: {
    messages: [],       // { role: 'user'|'assistant', content: string, streaming?: bool }
    inputText: '',
    sending: false,
    connected: false,
    error: '',
  },

  socket: null,
  scrollTimer: null,

  onLoad() {
    this.loadHistory();
    this.connect();
  },

  onUnload() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.saveHistory();
  },

  onHide() {
    this.saveHistory();
  },

  // ── History persistence ──
  loadHistory() {
    const saved = wx.getStorageSync('welian_chat_history');
    if (saved && Array.isArray(saved)) {
      this.setData({ messages: saved });
    } else {
      this.setData({
        messages: [{
          role: 'assistant',
          content: '你好，我是小维 🌱\n可以帮你记互动、查待办、建议联系谁、拟写消息。\n有什么我能帮忙的？',
        }],
      });
    }
  },

  saveHistory() {
    const msgs = this.data.messages.filter(m => !m.streaming);
    wx.setStorageSync('welian_chat_history', msgs.slice(-50));
  },

  // ── WebSocket connection ──
  connect() {
    const token = api.getToken();
    if (!token) {
      this.setData({ error: '请先登录' });
      return;
    }

    const wsUrl = api.getChatUrl();
    if (!wsUrl) {
      this.setData({ error: '获取连接地址失败' });
      return;
    }

    this.setData({ connected: false, error: '' });

    const socket = wx.connectSocket({
      url: wsUrl,
      success: () => {},
    });

    socket.onOpen(() => {
      this.setData({ connected: true, error: '' });
    });

    socket.onMessage((res) => {
      this.handleMessage(res.data);
    });

    socket.onError((err) => {
      console.error('[chat] socket error', err);
      this.setData({ connected: false, error: '连接断开，正在重连…' });
      // Auto-reconnect after 2s
      setTimeout(() => {
        if (this.data.sending) return;
        this.connect();
      }, 2000);
    });

    socket.onClose(() => {
      this.setData({ connected: false });
    });

    this.socket = socket;
  },

  // ── Handle incoming WebSocket messages ──
  handleMessage(raw) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    const messages = [...this.data.messages];

    switch (data.type) {
      case 'start': {
        // Add an empty assistant message that we'll fill with chunks
        messages.push({ role: 'assistant', content: '', streaming: true });
        this.setData({ messages });
        this.scrollToBottom();
        break;
      }
      case 'chunk': {
        // Append text to the last streaming message
        const last = messages[messages.length - 1];
        if (last && last.streaming) {
          last.content += data.text;
          this.setData({ messages });
          this.scrollToBottom();
        }
        break;
      }
      case 'done': {
        const last = messages[messages.length - 1];
        if (last && last.streaming) {
          last.streaming = false;
        }
        this.setData({ messages, sending: false });
        this.saveHistory();
        this.scrollToBottom();
        break;
      }
      case 'error': {
        const last = messages[messages.length - 1];
        if (last && last.streaming) {
          last.streaming = false;
          if (!last.content) {
            last.content = '⚠️ ' + (data.error || '出错了');
          }
        }
        this.setData({ messages, sending: false, error: data.error || '' });

        // Out of credits → redirect to billing
        if (data.code === 'OUT_OF_CREDITS') {
          wx.showModal({
            title: '联点用完了',
            content: '升级 Pro 或购买加油包继续使用',
            confirmText: '去充值',
            success: (res) => {
              if (res.confirm) wx.navigateTo({ url: '/pages/billing/billing' });
            },
          });
        }
        break;
      }
    }
  },

  // ── Send message ──
  sendMessage() {
    const text = this.data.inputText.trim();
    if (!text || this.data.sending) return;

    if (!this.socket || !this.data.connected) {
      this.setData({ error: '正在连接…请稍候' });
      this.connect();
      return;
    }

    // Add user message to UI
    const messages = [...this.data.messages, { role: 'user', content: text }];
    this.setData({ messages, inputText: '', sending: true, error: '' });

    // Build history for backend (last 6 messages, excluding the just-added one)
    const history = messages.slice(-7, -1).map(m => ({ role: m.role, content: m.content }));

    // Send via WebSocket
    this.socket.send({
      data: JSON.stringify({ type: 'chat', message: text, history }),
    });

    this.scrollToBottom();
  },

  // ── Input handlers ──
  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  onConfirm() {
    this.sendMessage();
  },

  // ── Scroll to bottom ──
  scrollToBottom() {
    if (this.scrollTimer) clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => {
      this.setData({ scrollIntoView: 'msg-bottom' });
    }, 50);
  },

  // ── Clear history ──
  clearHistory() {
    wx.showModal({
      title: '清空对话',
      content: '确定清空所有聊天记录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('welian_chat_history');
          this.setData({
            messages: [{
              role: 'assistant',
              content: '对话已清空。有什么我能帮忙的？',
            }],
          });
        }
      },
    });
  },

  onShareAppMessage() {
    return {
      title: 'Welian — 管好你的关系网络',
      path: '/pages/welcome/welcome',
    };
  },
});
