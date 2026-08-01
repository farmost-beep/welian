// meetings-logic.js — 会议列表页纯逻辑函数（无 wx 依赖）

function formatDate(dateStr, now = new Date()) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const diff = Math.floor((d - now) / 86400000);
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  if (diff === 0) return `今天 ${md}`;
  if (diff === 1) return `明天 ${md}`;
  if (diff === -1) return `昨天 ${md}`;
  return md;
}

module.exports = { formatDate };
