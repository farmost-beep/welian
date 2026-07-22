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
    // 操作菜单
    showActions: false,
    actionTodo: {},
    // 推迟
    showPostpone: false,
    // 编辑
    showEdit: false,
    savingEdit: false,
    editForm: {},
    priorityOptions: ['P1 紧急', 'P2 重要', 'P3 一般'],
    priorityValues: ['P1', 'P2', 'P3'],
    priorityIndex: 0,
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

  // ── 待办操作菜单 ──
  showTodoActions(e) {
    const id = e.currentTarget.dataset.id;
    const all = [...this.data.pending, ...this.data.doneList];
    const todo = all.find(t => t.id === id);
    if (!todo) return;
    this.setData({ showActions: true, actionTodo: todo });
  },

  closeActions() {
    this.setData({ showActions: false });
  },

  doMarkDone() {
    const id = this.data.actionTodo.id;
    this.setData({ showActions: false });
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

  doReopen() {
    const id = this.data.actionTodo.id;
    this.setData({ showActions: false });
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

  doCancel() {
    const id = this.data.actionTodo.id;
    const task = this.data.actionTodo.task;
    this.setData({ showActions: false });
    wx.showModal({
      title: '取消待办',
      content: `确定取消「${task}」吗？`,
      confirmText: '取消待办',
      confirmColor: '#C65D5D',
      success: (r) => {
        if (r.confirm) {
          wx.request({
            url: 'https://api.welian.app/data/todos/cancel',
            method: 'POST',
            header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
            data: { id },
            success: (res) => {
              if (res.statusCode === 200) {
                this.loadTodos();
                wx.showToast({ title: '已取消', icon: 'none' });
              }
            },
          });
        }
      },
    });
  },

  doDelete() {
    const id = this.data.actionTodo.id;
    const task = this.data.actionTodo.task;
    this.setData({ showActions: false });
    wx.showModal({
      title: '删除待办',
      content: `彻底删除「${task}」？此操作不可恢复。`,
      confirmText: '删除',
      confirmColor: '#C65D5D',
      success: (r) => {
        if (r.confirm) {
          wx.showLoading({ title: '删除中…' });
          wx.request({
            url: `https://api.welian.app/data/todos?id=${id}`,
            method: 'DELETE',
            header: { 'Authorization': 'Bearer ' + api.getToken() },
            success: (res) => {
              wx.hideLoading();
              if (res.statusCode === 200 && res.data.ok) {
                this.loadTodos();
                wx.showToast({ title: '已删除', icon: 'success' });
              } else {
                wx.showToast({ title: '删除失败', icon: 'none' });
              }
            },
            fail: () => {
              wx.hideLoading();
              wx.showToast({ title: '网络错误', icon: 'none' });
            },
          });
        }
      },
    });
  },

  // ── 推迟 ──
  doPostpone() {
    this.setData({ showActions: false, showPostpone: true });
  },

  closePostpone() {
    this.setData({ showPostpone: false });
  },

  applyPostpone(e) {
    const days = parseInt(e.currentTarget.dataset.days);
    const id = this.data.actionTodo.id;
    const d = new Date();
    d.setDate(d.getDate() + days);
    const newDue = d.toISOString().slice(0, 10);
    this.setData({ showPostpone: false });
    wx.request({
      url: 'https://api.welian.app/data/todos/postpone',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
      data: { id, due: newDue },
      success: (res) => {
        if (res.statusCode === 200) {
          this.loadTodos();
          wx.showToast({ title: `推迟到${days}天后`, icon: 'none' });
        }
      },
    });
  },

  // ── 编辑 ──
  doEdit() {
    const t = this.data.actionTodo;
    const priorityValues = this.data.priorityValues;
    const priorityIndex = Math.max(0, priorityValues.indexOf(t.priority || 'P1'));
    this.setData({
      showActions: false,
      showEdit: true,
      priorityIndex,
      editForm: {
        id: t.id,
        task: t.task || '',
        contact_name: t.contact_name || '',
        priority: t.priority || 'P1',
        due: t.due || '',
      },
    });
  },

  onEditInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`editForm.${field}`]: e.detail.value });
  },

  onPriorityChange(e) {
    this.setData({ priorityIndex: parseInt(e.detail.value) });
  },

  onDueChange(e) {
    this.setData({ 'editForm.due': e.detail.value });
  },

  closeEdit() {
    this.setData({ showEdit: false });
  },

  noop() {},

  saveEdit() {
    const form = this.data.editForm;
    if (!form.task || !form.task.trim()) {
      wx.showToast({ title: '待办内容不能为空', icon: 'none' });
      return;
    }
    this.setData({ savingEdit: true });
    const priority = this.data.priorityValues[this.data.priorityIndex];
    wx.request({
      url: 'https://api.welian.app/data/todos',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
      data: {
        id: form.id,
        task: form.task.trim(),
        contact_name: form.contact_name,
        priority,
        due: form.due,
      },
      success: (res) => {
        this.setData({ savingEdit: false });
        if (res.statusCode === 200 && res.data.ok) {
          wx.showToast({ title: '已保存', icon: 'success' });
          this.setData({ showEdit: false });
          this.loadTodos();
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ savingEdit: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
    });
  },

  onShareAppMessage() {
    return {
      title: 'Welian — 该联系谁、该做什么，一目了然',
      path: '/pages/welcome/welcome',
    };
  },
});
