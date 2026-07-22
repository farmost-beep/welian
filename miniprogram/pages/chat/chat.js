// pages/chat/chat.js — 小维 AI 对话（WebSocket 流式，支持 Local Agent + Cloud 回退）
const api = require('../../utils/api.js');

Page({
  data: {
    messages: [],       // { role: 'user'|'assistant', content: string, streaming?: bool }
    inputText: '',
    sending: false,
    connected: false,
    error: '',
    agentMode: '',      // 'live' | 'cloud' | ''
  },

  socket: null,
  scrollTimer: null,
  agentMode: '',       // 'live' | 'cloud'

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
  // Strategy: try local agent first (8s timeout), fall back to cloud.
  connect() {
    const token = api.getToken();
    if (!token) {
      this.setData({ error: '请先登录' });
      return;
    }

    this.setData({ connected: false, error: '', agentMode: '' });
    this.agentMode = '';

    // Try local agent first
    const agentUrl = api.getAgentUrl();
    if (agentUrl) {
      this.connectAgent(agentUrl);
    } else {
      this.connectCloud();
    }
  },

  // Connect to local agent (with 8s timeout → fallback to cloud)
  connectAgent(wsUrl) {
    let settled = false;
    const socket = wx.connectSocket({ url: wsUrl, success: () => {} });

    // Timeout: if no agent_connected within 8s, fall back to cloud
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { socket.close(); } catch {}
      this.connectCloud();
    }, 8000);

    socket.onOpen(() => {
      // Wait for agent_connected message before declaring success
    });

    socket.onMessage((res) => {
      if (settled) return;
      let data;
      try { data = JSON.parse(res.data); } catch { return; }

      if (data.type === 'agent_connected') {
        settled = true;
        clearTimeout(timeout);
        this.agentMode = 'live';
        this.socket = socket;
        this.setData({ connected: true, agentMode: 'live', error: '' });
        return;
      }

      // Handle error during connection attempt
      if (data.type === 'error' && (data.error === 'no_local_agent' || data.error === 'agent_unreachable' || data.error === 'agent_connect_failed')) {
        settled = true;
        clearTimeout(timeout);
        try { socket.close(); } catch {}
        this.connectCloud();
        return;
      }

      // If we get other messages, treat as connected
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        this.agentMode = 'live';
        this.socket = socket;
        this.setData({ connected: true, agentMode: 'live', error: '' });
      }

      // Process the message
      this.handleMessage(res.data);
    });

    socket.onError((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      this.connectCloud();
    });

    socket.onClose(() => {
      if (settled && this.agentMode === 'live') {
        this.setData({ connected: false, agentMode: '' });
      }
    });
  },

  // Connect to cloud chat (fallback)
  connectCloud() {
    const wsUrl = api.getChatUrl();
    if (!wsUrl) {
      this.setData({ error: '获取连接地址失败' });
      return;
    }

    this.agentMode = 'cloud';
    const socket = wx.connectSocket({ url: wsUrl, success: () => {} });

    socket.onOpen(() => {
      this.socket = socket;
      this.setData({ connected: true, agentMode: 'cloud', error: '' });
    });

    socket.onMessage((res) => {
      this.handleMessage(res.data);
    });

    socket.onError((err) => {
      console.error('[chat] cloud socket error', err);
      this.setData({ connected: false, error: '连接断开，正在重连…' });
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
      case 'agent_connected':
      case 'auth_ok':
        // Connection confirmation, no UI action needed
        break;

      case 'start': {
        // Cloud: add empty assistant message
        messages.push({ role: 'assistant', content: '', streaming: true });
        this.setData({ messages });
        this.scrollToBottom();
        break;
      }

      case 'chunk': {
        // Both cloud and local agent (translated) send chunk
        let last = messages[messages.length - 1];
        if (!last || !last.streaming) {
          // Local agent might send chunk without start — create message
          messages.push({ role: 'assistant', content: '', streaming: true });
          last = messages[messages.length - 1];
        }
        if (last && last.streaming) {
          last.content += data.text || '';
          this.setData({ messages });
          this.scrollToBottom();
        }
        break;
      }

      case 'stream': {
        // Local agent raw stream (shouldn't reach here due to Worker translation, but handle just in case)
        let last = messages[messages.length - 1];
        if (!last || !last.streaming) {
          messages.push({ role: 'assistant', content: '', streaming: true });
          last = messages[messages.length - 1];
        }
        if (last && last.streaming) {
          last.content += data.text || data.chunk || '';
          this.setData({ messages });
          this.scrollToBottom();
        }
        break;
      }

      case 'done': {
        const last = messages[messages.length - 1];
        if (last && last.streaming) {
          last.streaming = false;
          // If done has text and last is empty, use done's text (local agent response)
          if (!last.content && data.text) {
            last.content = data.text;
          }
        }
        this.setData({ messages, sending: false });
        this.saveHistory();
        this.scrollToBottom();
        break;
      }

      case 'response': {
        // Local agent final response (shouldn't reach here due to Worker translation)
        const last = messages[messages.length - 1];
        if (last && last.streaming) {
          last.streaming = false;
          if (!last.content && data.text) {
            last.content = data.text;
          }
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
            last.content = '⚠️ ' + (data.error || data.message || '出错了');
          }
        }
        this.setData({ messages, sending: false, error: data.error || '' });

        // Agent disconnected → try cloud fallback
        if (data.error === 'agent_disconnected' || data.error === 'agent_error') {
          this.setData({ agentMode: '' });
          setTimeout(() => this.connectCloud(), 1000);
          return;
        }

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

    // Send via WebSocket (same format for both cloud and local agent)
    // Worker proxy translates to local agent protocol
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

  // ── Reconnect / switch mode ──
  reconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connect();
  },

  onShareAppMessage() {
    return {
      title: 'Welian — 管好你的关系网络',
      path: '/pages/welcome/welcome',
    };
  },
});
