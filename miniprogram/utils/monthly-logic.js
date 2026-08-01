// monthly-logic.js — 月报页纯逻辑函数（无 wx 依赖）

function formatMonthLabel(month) {
  if (month && /^\d{4}-\d{1,2}$/.test(month)) {
    const parts = month.split('-');
    return parts[0] + '年' + parseInt(parts[1], 10) + '月回顾';
  }
  const now = new Date();
  return now.getFullYear() + '年' + (now.getMonth() + 1) + '月回顾';
}

module.exports = { formatMonthLabel };
