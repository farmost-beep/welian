// todos-logic.js — Todos 纯逻辑函数（无 wx 依赖，可被 vitest 测试）

// 计算待办的 dueStatus
function dueStatus(todo, today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!todo.due) return 'nodate';
  const dueDate = new Date(todo.due);
  const diff = Math.floor((dueDate - t) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7) return 'week';
  return 'later';
}

// 格式化日期标签
function formatDate(dateStr, today = new Date()) {
  const d = new Date(dateStr);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.floor((d - t) / 86400000);
  const hasTime = dateStr && dateStr.includes('T');
  const timeStr = hasTime ? ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
  let label;
  if (diff === 0) label = '今天';
  else if (diff === 1) label = '明天';
  else if (diff === -1) label = '昨天';
  else if (diff < 0) label = `逾期${-diff}天`;
  else if (diff <= 7) label = `${diff}天后`;
  else label = `${d.getMonth() + 1}月${d.getDate()}日`;
  return label + timeStr;
}

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 给待办加 dueStatus/dueLabel/priorityLabel 等展示字段
function formatTodos(todos, today = new Date()) {
  return todos.map(t => ({
    ...t,
    dueStatus: dueStatus(t, today),
    dueLabel: t.due ? formatDate(t.due, today) : '',
    priorityLabel: t.priority === 'P1' ? '🔴' : t.priority === 'P2' ? '🟡' : '',
    completedLabel: t.completed_at ? formatDate(t.completed_at, today) : '',
    createdLabel: t.created_at ? formatDateTime(t.created_at) : '',
  }));
}

// 按 dueStatus 分组
function groupTodos(todos) {
  const groups = [
    { key: 'overdue', label: '已超期', icon: '🔴', items: [] },
    { key: 'today', label: '今天', icon: '⏰', items: [] },
    { key: 'week', label: '本周内', icon: '📅', items: [] },
    { key: 'later', label: '之后', icon: '🗓️', items: [] },
    { key: 'nodate', label: '长期', icon: '📝', items: [] },
  ];
  const map = {};
  groups.forEach(g => { map[g.key] = g; });
  todos.forEach(t => {
    if (map[t.dueStatus]) map[t.dueStatus].items.push(t);
  });
  return groups.filter(g => g.items.length > 0);
}

module.exports = { dueStatus, formatDate, formatDateTime, formatTodos, groupTodos };
