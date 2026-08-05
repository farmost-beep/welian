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

// 按 dueStatus 分组，序列待办折叠为一张卡片
function groupTodos(todos, seriesGroups = []) {
  const groups = [
    { key: 'overdue', label: '已超期', icon: '🔴', items: [] },
    { key: 'today', label: '今天', icon: '⏰', items: [] },
    { key: 'week', label: '本周内', icon: '📅', items: [] },
    { key: 'later', label: '之后', icon: '🗓️', items: [] },
    { key: 'nodate', label: '长期', icon: '📝', items: [] },
  ];
  const map = {};
  groups.forEach(g => { map[g.key] = g; });

  // Build set of series todo IDs to skip (they'll be shown as folded cards)
  const seriesTodoIds = new Set();
  const seriesCards = [];
  for (const sg of seriesGroups) {
    if (!sg.steps || sg.steps.length === 0) continue;
    const activeStep = sg.active_step || sg.steps.find(s => s.series_active) || sg.steps[0];
    const activeIndex = sg.steps.findIndex(s => s.id === activeStep.id);
    const activeTodo = todos.find(t => t.id === activeStep.id);
    if (!activeTodo) continue;
    sg.steps.forEach(s => seriesTodoIds.add(s.id));
    // Format step due labels
    const stepsWithLabels = sg.steps.map(s => ({
      ...s,
      dueLabel: s.due ? formatDate(s.due, today) : '',
    }));
    const card = {
      isSeries: true,
      series_id: sg.series_id,
      series_label: sg.label,
      series_total: sg.total,
      series_completed: sg.completed,
      series_percent: sg.total > 0 ? Math.round((sg.completed / sg.total) * 100) : 0,
      series_steps: stepsWithLabels,
      active_step: activeStep,
      active_index: activeIndex >= 0 ? activeIndex : 0,
      // Use active step's display fields for grouping
      id: `series_card_${sg.series_id}`,
      dueStatus: activeTodo.dueStatus,
      dueLabel: activeTodo.dueLabel,
      priorityLabel: activeTodo.priorityLabel,
      contact_name: activeTodo.contact_name,
      task: activeStep.task,
    };
    seriesCards.push(card);
  }

  // Add non-series todos
  todos.forEach(t => {
    if (seriesTodoIds.has(t.id)) return;
    if (map[t.dueStatus]) map[t.dueStatus].items.push(t);
  });

  // Add series cards to their active step's due group
  seriesCards.forEach(card => {
    if (map[card.dueStatus]) map[card.dueStatus].items.push(card);
  });

  return groups.filter(g => g.items.length > 0);
}

// Build series progress dots: ● for done, ○ for pending
function seriesProgress(steps) {
  if (!steps || steps.length === 0) return '';
  return steps.map((s, i) => {
    const done = s.done || s.status === 'done' || s.status === 'completed';
    return done ? '●' : '○';
  }).join(' ');
}

module.exports = { dueStatus, formatDate, formatDateTime, formatTodos, groupTodos, seriesProgress };
