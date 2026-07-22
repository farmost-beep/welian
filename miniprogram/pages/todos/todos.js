// pages/todos/todos.js — 待办事项页
const api = require('../../utils/api.js');

Page({
  data: {
    pending: [],
    doneList: [],
    doneCount: 0,
    activeTab: 'pending', // 'pending' | 'done'
    loading: true,
    error: '',
    newTodo: '',
    newTodoContact: '',
    adding: false,
  },

  onShow() {
    this.loadTodos();
  },

  onPullDownRefresh() {
    this.loadTodos(() => wx.stopPullDownRefresh());
  },

  loadTodos(cb) {
    this.setData({ loading: true, error: '' });
    const token = api.getToken();
    if (!token) {
      this.setData({ loading: false, error: '请先登录' });
      if (cb) cb();
      return;
    }
    // 加载待办 + 已完成
    Promise.all([
      this.fetchTodos('pending'),
      this.fetchTodos('done'),
    ]).then(([pendingData, doneData]) => {
      this.setData({
        pending: this.formatTodos(pendingData.todos || []),
        doneList: this.formatTodos(doneData.todos || []),
        doneCount: pendingData.done_count || 0,
        loading: false,
      });
      if (cb) cb();
    }).catch((err) => {
      this.setData({ loading: false, error: err.message || '加载失败' });
      if (cb) cb();
    });
  },

  fetchTodos(status) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: 'https://api.welian.app/data/todos?status=' + status,
        header: { 'Authorization': 'Bearer ' + api.getToken() },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data);
          } else {
            reject(new Error('加载失败'));
          }
        },
        fail: (err) => reject(err),
      });
    });
  },

  formatTodos(todos) {
    const now = new Date();
    return todos.map(t => {
      let dueStatus = 'normal';
      if (t.due) {
        const dueDate = new Date(t.due);
        const diff = Math.floor((dueDate - now) / 86400000);
        if (diff < 0) dueStatus = 'overdue';
        else if (diff <= 1) dueStatus = 'urgent';
        else if (diff <= 3) dueStatus = 'soon';
      }
      return {
        ...t,
        dueStatus,
        dueLabel: t.due ? this.formatDate(t.due) : '',
        priorityLabel: t.priority === 'P1' ? '🔴' : t.priority === 'P2' ? '🟡' : '',
      };
    });
  },

  formatDate(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((d - now) / 86400000);
    if (diff === 0) return '今天';
    if (diff === 1) return '明天';
    if (diff === -1) return '昨天';
    if (diff < 0) return `逾期${-diff}天`;
    if (diff <= 7) return `${diff}天后`;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  // 标记完成
  markDone(e) {
    const id = e.currentTarget.dataset.id;
    wx.request({
      url: 'https://api.welian.app/data/todos/done',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
      data: { id },
      success: (res) => {
        if (res.statusCode === 200) {
          this.loadTodos();
          wx.showToast({ title: '已完成', icon: 'success' });
        }
      },
    });
  },

  // 重新打开
  reopen(e) {
    const id = e.currentTarget.dataset.id;
    wx.request({
      url: 'https://api.welian.app/data/todos/reopen',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
      data: { id },
      success: (res) => {
        if (res.statusCode === 200) {
          this.loadTodos();
          wx.showToast({ title: '已重新打开', icon: 'none' });
        }
      },
    });
  },

  // 输入新待办
  onNewTodoInput(e) {
    this.setData({ newTodo: e.detail.value });
  },

  onNewTodoContactInput(e) {
    this.setData({ newTodoContact: e.detail.value });
  },

  // 添加待办
  addTodo() {
    const { newTodo, newTodoContact, adding } = this.data;
    if (adding) return;
    if (!newTodo.trim()) {
      wx.showToast({ title: '请输入待办内容', icon: 'none' });
      return;
    }
    this.setData({ adding: true });
    const data = { task: newTodo.trim() };
    if (newTodoContact.trim()) {
      data.contact_name = newTodoContact.trim();
    }
    wx.request({
      url: 'https://api.welian.app/data/todos',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
      data,
      success: (res) => {
        if (res.statusCode === 200) {
          this.setData({ newTodo: '', newTodoContact: '', adding: false });
          this.loadTodos();
          wx.showToast({ title: '已添加', icon: 'success' });
        } else {
          this.setData({ adding: false });
          wx.showToast({ title: '添加失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ adding: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },
});
