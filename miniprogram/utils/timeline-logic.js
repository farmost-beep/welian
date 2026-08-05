// timeline-logic.js — 互动时间线页纯逻辑函数（无 wx 依赖）

// 搜索过滤 + 日期降序排序 + 按月分组
function filterAndGroup(rawList, searchKey) {
  const key = (searchKey || '').trim().toLowerCase();
  let filtered = rawList;
  if (key) {
    filtered = rawList.filter(item => {
      const name = (item.contact_name || '').toLowerCase();
      const summary = (item.summary || '').toLowerCase();
      return name.indexOf(key) !== -1 || summary.indexOf(key) !== -1;
    });
  }
  filtered = filtered.slice().sort((a, b) => {
    return new Date(b.date) - new Date(a.date);
  });
  const groups = [];
  const monthMap = {};
  filtered.forEach(item => {
    const d = new Date(item.date);
    const monthKey = d.getFullYear() + '-' + (d.getMonth() + 1);
    if (!monthMap[monthKey]) {
      monthMap[monthKey] = {
        key: monthKey,
        label: d.getFullYear() + '年' + (d.getMonth() + 1) + '月',
        entries: [],
      };
      groups.push(monthMap[monthKey]);
    }
    monthMap[monthKey].entries.push({
      ...item,
      dateLabel: (d.getMonth() + 1) + '月' + d.getDate() + '日',
    });
  });
  return groups;
}

// 格式化日期为 YYYY-MM-DD（用于表单输入）
function formatDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

// 构建本月点状时间轴：每天一个点，有互动的点高亮
function buildMonthDots(rawList) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();
  const dots = [];
  const dayCounts = {};
  rawList.forEach(item => {
    const d = new Date(item.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    }
  });
  for (let day = 1; day <= daysInMonth; day++) {
    const count = dayCounts[day] || 0;
    dots.push({
      day,
      count,
      isToday: day === today,
      isPast: day < today,
      isFuture: day > today,
      active: count > 0,
      intensity: count >= 3 ? 'high' : count >= 2 ? 'mid' : count >= 1 ? 'low' : 'none',
    });
  }
  const activeCount = Object.values(dayCounts).filter(c => c > 0).length;
  return { dots, activeDays: activeCount, totalDays: daysInMonth, monthInteractions: Object.values(dayCounts).reduce((a, b) => a + b, 0) };
}

module.exports = { filterAndGroup, formatDateInput, buildMonthDots };
