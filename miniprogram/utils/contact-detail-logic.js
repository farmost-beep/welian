// contact-detail-logic.js - 联系人详情页纯逻辑函数（无 wx 依赖）

// 冷却预警：计算距上次互动天数（仅 leverage/dual 触发）
// thresholds 可从 config 传入：{ cooldown_leverage, cooldown_nurture }
function calcCooldown(entries, contact, now, thresholds) {
  if (!contact || !entries || entries.length === 0) return null;
  const nature = (contact.nature || '').toLowerCase();
  if (nature !== 'leverage' && nature !== 'dual') return null;
  now = now || new Date();
  thresholds = thresholds || {};
  const coldDays = thresholds.cooldown_leverage || 30;
  const coolDays = thresholds.cooldown_leverage ? Math.floor(thresholds.cooldown_leverage * 0.47) : 14;
  const sorted = entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const lastDate = sorted[0] && sorted[0].date;
  if (!lastDate) return null;
  const last = new Date(lastDate);
  const nowMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastMid = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  const days = Math.floor((nowMid - lastMid) / 86400000);
  let status = 'ok';
  if (days >= coldDays) status = 'cold';
  else if (days >= coolDays) status = 'cooling';
  return { days, status, lastDate };
}

module.exports = { calcCooldown };
