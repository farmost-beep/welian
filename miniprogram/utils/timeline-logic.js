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

module.exports = { filterAndGroup, formatDateInput };
