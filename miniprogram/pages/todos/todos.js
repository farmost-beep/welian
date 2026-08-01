// pages/todos/todos.js — 待办事项页
const api = require('../../utils/api.js');
const { formatTodos, groupTodos, formatDate, formatDateTime } = require('../../utils/todos-logic.js');
const app = getApp();

Page({
  data: {
    pending: [],
    pendingGroups: [],
    doneList: [],
    doneCount: 0,
    activeTab: 'pending', // 'pending' | 'done'
    loading: true,
    error: '',
    newTodo: '',
    newTodoContact: '',
    adding: false,
    newPriorityIndex: 2,
    newDueDate: '',
    newDueTime: '',
    newIsLongTerm: false,
    // 操作菜单
    showActions: false,
    actionTodo: {},
    // 推迟
    showPostpone: false,
    // 编辑
    showEdit: false,
    savingEdit: false,
    editForm: {},
    editDueDate: '',
    editDueTime: '',
    editIsLongTerm: false,
    // 详情
    showDetail: false,
    detailTodo: {},
    priorityOptions: ['P1 紧急', 'P2 重要', 'P3 一般'],  // onLoad 时从 config 覆盖
    priorityValues: ['P1', 'P2', 'P3'],                  // onLoad 时从 config 覆盖
    postponeDays: [1, 3, 7, 14],                          // onLoad 时从 config 覆盖
    priorityIndex: 0,
    newContactSuggestions: [],
    editContactSuggestions: [],
  },

  async onLoad() {
    // 从 config 覆盖优先级标签和推迟选项
    const labels = app.globalData.config.labels || {};
    if (labels.priority) {
      const priorityValues = Object.keys(labels.priority);
      const priorityOptions = priorityValues.map(k => `${k} ${labels.priority[k]}`);
      this.setData({ priorityOptions, priorityValues });
    }
    if (labels.postpone_days) {
      this.setData({ postponeDays: labels.postpone_days });
    }
  },

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
      this.getTabBar().refresh();
    }
    if (!api.getToken()) {
      this.setData({ loading: true });
      try { await app.loginReady; } catch (e) { return; }
    }
    this.loadTodos();
  },

  onHide() {},

  onUnload() {},

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
      const pending = formatTodos(pendingData.todos || []);
      this.setData({
        pending,
        pendingGroups: groupTodos(pending),
        doneList: formatTodos(doneData.todos || []),
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
          } else if (res.statusCode === 401) {
            // Token expired — re-login and retry
            api.login().then(() => {
              wx.request({
                url: 'https://api.welian.app/data/todos?status=' + status,
                header: { 'Authorization': 'Bearer ' + api.getToken() },
                success: (res2) => {
                  if (res2.statusCode === 200) resolve(res2.data);
                  else reject(new Error('加载失败'));
                },
                fail: (err) => reject(err),
              });
            }).catch(reject);
          } else {
            reject(new Error('加载失败'));
          }
        },
        fail: (err) => reject(err),
      });
    });
  },
  // formatTodos/groupTodos/formatDate/formatDateTime 已提取到 utils/todos-logic.js


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
    const value = e.detail.value;
    this.setData({ newTodoContact: value });
    if (value.trim().length < 1) {
      this.setData({ newContactSuggestions: [] });
      return;
    }
    api.searchContacts(value.trim()).then((results) => {
      this.setData({ newContactSuggestions: results.slice(0, 8) });
    }).catch(() => {
      this.setData({ newContactSuggestions: [] });
    });
  },

  pickNewContactSuggestion(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({ newTodoContact: name, newContactSuggestions: [] });
  },

  onNewPriorityChange(e) {
    this.setData({ newPriorityIndex: parseInt(e.detail.value) });
  },

  onNewDueDateChange(e) {
    this.setData({ newDueDate: e.detail.value });
  },

  onNewDueTimeChange(e) {
    this.setData({ newDueTime: e.detail.value });
  },

  toggleNewLongTerm() {
    const isLong = !this.data.newIsLongTerm;
    this.setData({
      newIsLongTerm: isLong,
      newDueDate: isLong ? '' : this.data.newDueDate,
      newDueTime: isLong ? '' : this.data.newDueTime,
    });
  },

  // 添加待办
  addTodo() {
    const { newTodo, newTodoContact, adding } = this.data;
    if (adding) return;
    if (!newTodo.trim()) {
      wx.showToast({ title: '请输入待办内容', icon: 'none' });
      return;
    }
    if (!newTodoContact.trim()) {
      wx.showToast({ title: '请关联联系人', icon: 'none' });
      return;
    }
    if (!this.data.newIsLongTerm) {
      if (!this.data.newDueDate) {
        wx.showToast({ title: '请选择日期', icon: 'none' });
        return;
      }
      if (!this.data.newDueTime) {
        wx.showToast({ title: '请选择时间', icon: 'none' });
        return;
      }
    }
    this.setData({ adding: true });
    const priority = this.data.priorityValues[this.data.newPriorityIndex];
    const data = { task: newTodo.trim(), priority, contact_name: newTodoContact.trim() };
    data.due = this.data.newIsLongTerm ? '' : (this.data.newDueDate + 'T' + this.data.newDueTime);
    wx.request({
      url: 'https://api.welian.app/data/todos',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
      data,
      success: (res) => {
        if (res.statusCode === 200) {
          this.setData({ newTodo: '', newTodoContact: '', newDueDate: '', newDueTime: '', newIsLongTerm: false, adding: false });
          this.loadTodos();
          wx.showToast({ title: '已添加', icon: 'success' });
          // 请求待办到期提醒授权
          if (!this.data.newIsLongTerm) api.requestSubscribe(['todo_due']);
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

  doDetail() {
    this.setData({ showActions: false, showDetail: true, detailTodo: this.data.actionTodo });
  },

  closeDetail() {
    this.setData({ showDetail: false });
  },

  _todoStartTime(t) {
    if (t.due) {
      const dueStr = t.due.includes('T') ? t.due : t.due + 'T09:00:00';
      return Math.floor(new Date(dueStr).getTime() / 1000);
    }
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return Math.floor(new Date(d.toISOString().slice(0, 10) + 'T09:00:00').getTime() / 1000);
  },

  addTodoToCalendar() {
    const t = this.data.detailTodo;
    if (!t || !t.task) return;
    wx.addPhoneCalendar({
      title: t.task,
      startTime: this._todoStartTime(t),
      allDay: false,
      alarm: true,
      alarmOffset: -3600,
      description: (t.contact_name ? '关联联系人：' + t.contact_name + '\n' : '') + '来自 Welian 待办',
      success: () => wx.showToast({ title: '已添加到日历', icon: 'success' }),
      fail: () => wx.showToast({ title: '添加失败', icon: 'none' }),
    });
  },

  batchAddCalendar() {
    const todos = this.data.pending;
    if (!todos || todos.length === 0) return;
    wx.showModal({
      title: '导入日历',
      content: `将 ${todos.length} 条待办添加到手机日历？`,
      confirmText: '添加',
      success: (r) => {
        if (!r.confirm) return;
        let success = 0;
        let fail = 0;
        let idx = 0;
        const addNext = () => {
          if (idx >= todos.length) {
            wx.showToast({ title: `已添加 ${success} 条${fail ? '，失败' + fail + '条' : ''}`, icon: 'none' });
            return;
          }
          const t = todos[idx++];
          wx.addPhoneCalendar({
            title: t.task,
            startTime: this._todoStartTime(t),
            allDay: false,
            alarm: true,
            alarmOffset: -3600,
            description: (t.contact_name ? '关联联系人：' + t.contact_name + '\n' : '') + '来自 Welian 待办',
            success: () => { success++; addNext(); },
            fail: () => { fail++; addNext(); },
          });
        };
        addNext();
      },
    });
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
      confirmText: '取消',
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
    let editDueDate = '', editDueTime = '', editIsLongTerm = false;
    if (t.due) {
      if (t.due.includes('T')) {
        const [d, tm] = t.due.split('T');
        editDueDate = d;
        editDueTime = tm.slice(0, 5);
      } else {
        editDueDate = t.due;
      }
    } else {
      editIsLongTerm = true;
    }
    this.setData({
      showActions: false,
      showEdit: true,
      priorityIndex,
      editDueDate,
      editDueTime,
      editIsLongTerm,
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

  onEditContactSearch(e) {
    const value = e.detail.value;
    this.setData({ 'editForm.contact_name': value });
    if (value.trim().length < 1) {
      this.setData({ editContactSuggestions: [] });
      return;
    }
    api.searchContacts(value.trim()).then((results) => {
      this.setData({ editContactSuggestions: results.slice(0, 8) });
    }).catch(() => {
      this.setData({ editContactSuggestions: [] });
    });
  },

  pickEditContactSuggestion(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({ 'editForm.contact_name': name, editContactSuggestions: [] });
  },

  onPriorityChange(e) {
    this.setData({ priorityIndex: parseInt(e.detail.value) });
  },

  onEditDueDateChange(e) {
    this.setData({ editDueDate: e.detail.value });
  },

  onEditDueTimeChange(e) {
    this.setData({ editDueTime: e.detail.value });
  },

  toggleEditLongTerm() {
    const isLong = !this.data.editIsLongTerm;
    this.setData({
      editIsLongTerm: isLong,
      editDueDate: isLong ? '' : this.data.editDueDate,
      editDueTime: isLong ? '' : this.data.editDueTime,
    });
  },

  closeEdit() {
    this.setData({ showEdit: false, editContactSuggestions: [] });
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
    const due = this.data.editIsLongTerm ? '' : (this.data.editDueDate ? (this.data.editDueDate + (this.data.editDueTime ? 'T' + this.data.editDueTime : '')) : '');
    wx.request({
      url: 'https://api.welian.app/data/todos',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api.getToken() },
      data: {
        id: form.id,
        task: form.task.trim(),
        contact_name: form.contact_name,
        priority,
        due,
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

  onShareTimeline() {
    return {
      title: 'Welian ∞ — 更用心',
      query: '',
    };
  },
});
