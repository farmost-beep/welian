// contacts-logic.js — Contacts 纯逻辑函数（无 wx 依赖，可被 vitest 测试）

// 按指定模式对联系人列表分组
// groupMode: 'company' | 'relation' | 'tag'
function groupContactsBy(list, groupMode) {
  if (!groupMode || groupMode === 'none') return [];
  const emptyLabel = groupMode === 'company' ? '未填写'
                   : groupMode === 'relation' ? '未分类'
                   : '无标签';
  const groups = {};
  for (const c of list) {
    let key = '';
    if (groupMode === 'company') key = (c.company || '').trim() || emptyLabel;
    else if (groupMode === 'relation') key = (c.relation || c.relationship || '').trim() || emptyLabel;
    else if (groupMode === 'tag') key = (c.tags && c.tags[0]) || emptyLabel;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }
  return Object.keys(groups).sort((a, b) => {
    if (a === emptyLabel) return 1;
    if (b === emptyLabel) return -1;
    return a.localeCompare(b, 'zh');
  }).map(k => ({ key: k, count: groups[k].length, items: groups[k] }));
}

// 生成分组标签数组
function groupLabels(grouped) {
  return grouped.map(g => `${g.key}（${g.count}）`);
}

// 本地搜索过滤（不依赖网络）
function filterContacts(list, keyword) {
  const kw = (keyword || '').trim();
  if (!kw) return null;
  const lower = kw.toLowerCase();
  return list.filter(c =>
    (c.name && c.name.toLowerCase().includes(lower)) ||
    (c.company && c.company.toLowerCase().includes(lower)) ||
    (c.relation || c.relationship || '').toLowerCase().includes(lower) ||
    (c.tags || []).some(t => t.toLowerCase().includes(lower))
  );
}

module.exports = { groupContactsBy, groupLabels, filterContacts };
