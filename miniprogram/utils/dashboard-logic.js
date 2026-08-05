// dashboard-logic.js — Dashboard 纯逻辑函数（无 wx 依赖，可被 vitest 测试）

// 默认家人关键词（config 未传入时兜底）
const DEFAULT_FAMILY_KEYWORDS = ['家人', '父母', '爸妈', '爸爸', '妈妈', '妻', '夫', '儿子', '女儿', '兄弟', '姐妹', '父', '母', '哥', '嫂', '弟', '妹', '舅', '姨', '叔', '伯', '姑', '外婆', '外公', '爷爷', '奶奶'];

// 默认角色配置（config 未传入时兜底）
const DEFAULT_ROLE_CONFIG = [
  { key: 'friend', label: '作为朋友', icon: '🌱', cold_days: 30 },
  { key: 'family', label: '作为家人', icon: '🏡', cold_days: 30 },
  { key: 'collaborator', label: '作为合作者', icon: '🤝', cold_days: 14 },
];

// 联系人分类：以 nature 为主，relation 仅在区分家人/朋友时辅助
// familyKeywords 可从 config 传入（后端驱动）
function classifyContact(c, familyKeywords) {
  const rel = (c.relationship || c.relation || '').toLowerCase();
  const nature = (c.nature || '').toLowerCase();
  const isNurture = nature === 'nurture' || nature === '陪伴' || nature === '陪伴型' || nature === '家人';
  const isDual = nature === 'dual' || nature === '双重';
  const keywords = familyKeywords || DEFAULT_FAMILY_KEYWORDS;
  const familyByRel = keywords.some(kw => rel.includes(kw.toLowerCase()));
  const friendByRel = /朋友|同学|校友|室友|闺蜜|发小|老乡|邻居/.test(rel);

  // 陪伴型：按 relation 区分家人 vs 朋友
  if (isNurture) {
    return familyByRel ? 'family' : 'friend';
  }
  // 双重：relation 含家人关键词归 family，否则归朋友（双重关系既有经营面也有情感面）
  if (isDual) {
    return familyByRel ? 'family' : 'friend';
  }
  // 经营型（默认）：relation 含家人关键词归 family，否则归 collaborator
  if (familyByRel) return 'family';
  if (friendByRel) return 'friend';
  return 'collaborator';
}

// 按 friend/family/collaborator 三角色分组
// config 可包含 role_config / family_keywords（后端驱动）
function buildRoles(contacts, timeline, now, config) {
  now = now || new Date();
  config = config || {};
  const familyKeywords = config.family_keywords || DEFAULT_FAMILY_KEYWORDS;
  const roleConfigRaw = config.role_config || DEFAULT_ROLE_CONFIG;
  // 兼容 cold_days 和 coldDays 两种命名
  const roleConfig = roleConfigRaw.map(r => ({ ...r, coldDays: r.cold_days ?? r.coldDays ?? 30 }));

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthTimeline = timeline.filter(t => {
    const d = new Date(t.date || '');
    return d >= monthStart;
  });
  const lastMonthTimeline = timeline.filter(t => {
    const d = new Date(t.date || '');
    return d >= lastMonthStart && d < monthStart;
  });

  const groups = { friend: [], family: [], collaborator: [] };
  for (const c of contacts) {
    groups[classifyContact(c, familyKeywords)].push(c);
  }

  return roleConfig.map(cfg => {
    const roleContacts = groups[cfg.key];
    const items = [];
    let recentInteractions = [];

    const roleTimeline = monthTimeline.filter(t => {
      const contact = contacts.find(c => c.id === t.contact || c.name === t.contact_name);
      return contact && groups[cfg.key].includes(contact);
    });
    const lastRoleTimeline = lastMonthTimeline.filter(t => {
      const contact = contacts.find(c => c.id === t.contact || c.name === t.contact_name);
      return contact && groups[cfg.key].includes(contact);
    });

    if (roleContacts.length === 0) {
      items.push({ text: '还没有记录这类关系，去「关系」页添加', tone: 'normal' });
    } else {
      const interactedCount = new Set(roleTimeline.map(t => t.contact || t.contact_name).filter(Boolean)).size;
      const thisCount = roleTimeline.length;
      const lastCount = lastRoleTimeline.length;

      if (lastCount > 0) {
        const diff = thisCount - lastCount;
        const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
        items.push({ text: `本月 ${thisCount} 次互动（${interactedCount} 人）${arrow} 上月 ${lastCount} 次`, tone: diff > 0 ? 'positive' : diff < 0 ? 'warning' : 'normal' });
      } else {
        items.push({ text: `本月 ${thisCount} 次互动（${interactedCount} 人）`, tone: thisCount > 0 ? 'positive' : 'normal' });
      }

      const interactedNames = [...new Set(roleTimeline.map(t => t.contact_name || t.contact).filter(Boolean))];
      if (interactedNames.length > 0) {
        items.push({ text: `在场：${interactedNames.slice(0, 5).join('、')}`, tone: 'positive' });
      }

      const cold = roleContacts.filter(c => {
        const allTimeline = timeline.filter(t => t.contact === c.id || t.contact_name === c.name);
        const last = allTimeline.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
        if (!last) return true;
        const days = Math.floor((now - new Date(last.date)) / 86400000);
        return days >= cfg.coldDays;
      });
      if (cold.length > 0) {
        const icon = cfg.coldDays <= 14 ? '⚠️' : '💛';
        const coldNames = cold.slice(0, 3).map(c => c.name);
        items.push({
          text: `${icon} ${cold.length} 人超过 ${cfg.coldDays} 天未联系：${coldNames.join('、')}`,
          tone: 'warning',
          actionable: true,
          contactName: coldNames[0],
        });
      }

      const recentRole = roleTimeline
        .filter(t => t.summary || t.title || t.content)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, 2);
      recentInteractions = recentRole.map(t => {
        const name = t.contact_name || t.contact || '';
        const summary = (t.summary || t.title || t.content || '').slice(0, 40);
        return { name, summary, id: t.id };
      });

      for (const c of roleContacts) {
        if (c.birthday) {
          const d = new Date(c.birthday);
          if (!isNaN(d)) {
            const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
            if (next < now) next.setFullYear(now.getFullYear() + 1);
            const days = Math.ceil((next - now) / 86400000);
            if (days <= 30) {
              items.push({ text: `🎂 ${c.name}生日还有 ${days} 天`, tone: 'warning' });
            }
          }
        }
        for (const d of (c.important_dates || [])) {
          if (!d.date) continue;
          let dateStr = d.date;
          if (dateStr.length === 5) {
            dateStr = `${now.getFullYear()}-${dateStr}`;
          }
          const targetDate = new Date(dateStr);
          if (isNaN(targetDate)) continue;
          const next = new Date(now.getFullYear(), targetDate.getMonth(), targetDate.getDate());
          if (next < now) next.setFullYear(now.getFullYear() + 1);
          const days = Math.ceil((next - now) / 86400000);
          if (days <= 30) {
            const label = d.label || '重要日期';
            items.push({ text: `📅 ${c.name}的${label}还有 ${days} 天`, tone: 'warning' });
          }
        }
      }
    }

    return { key: cfg.key, label: cfg.label, icon: cfg.icon, items, recentInteractions };
  });
}

// 待办分类：overdue + today
function classifyTodos(todos, today = new Date()) {
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return {
    overdue: todos.filter(t => t.due && t.due.slice(0, 10) < todayStr).slice(0, 3),
    today: todos.filter(t => t.due && t.due.slice(0, 10) === todayStr).slice(0, 3),
  };
}

// 进化阶段：5 阶段，按联系人数 + 互动数判定（stages 可从 config 传入）
// 兼容驼峰 minContacts 和下划线 min_contacts 两种命名
function calcEvolutionStage(contactCount, interactionCount, stages) {
  stages = stages || [
    { name: '初生', icon: '🌱', minContacts: 0, minInteractions: 0 },
    { name: '启蒙', icon: '✨', minContacts: 3, minInteractions: 1 },
    { name: '成长', icon: '🌿', minContacts: 10, minInteractions: 20 },
    { name: '成熟', icon: '🌳', minContacts: 30, minInteractions: 100 },
    { name: '精通', icon: '🏆', minContacts: 50, minInteractions: 300 },
  ];
  // 统一字段名（兼容 config 传入的下划线命名）
  const norm = s => ({ ...s, minContacts: s.minContacts ?? s.min_contacts ?? 0, minInteractions: s.minInteractions ?? s.min_interactions ?? 0 });
  stages = stages.map(norm);

  let idx = 0;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (contactCount >= stages[i].minContacts && interactionCount >= stages[i].minInteractions) {
      idx = i;
      break;
    }
  }
  const current = stages[idx];
  const next = stages[idx + 1] || null;
  const progress = next
    ? Math.round(
        (Math.min(1, Math.max(0, (contactCount - current.minContacts) / (next.minContacts - current.minContacts))) +
         Math.min(1, Math.max(0, (interactionCount - current.minInteractions) / (next.minInteractions - current.minInteractions)))) / 2 * 100
      )
    : 100;
  // 差距数字：到下一阶段还需多少联系人/互动
  const needContacts = next ? Math.max(0, next.minContacts - contactCount) : 0;
  const needInteractions = next ? Math.max(0, next.minInteractions - interactionCount) : 0;
  // 阶段列表（带已解锁标记）
  const stageList = stages.map((s, i) => ({ ...s, unlocked: i <= idx }));
  return { idx, name: current.name, icon: current.icon, progress, next: next ? next.name : null, nextIcon: next ? next.icon : null, needContacts, needInteractions, stages: stageList };
}

// 近期重要日期：未来 N 天内的生日/纪念日（windowDays 可从 config 传入）
function buildUpcomingDates(contacts, now, windowDays) {
  now = now || new Date();
  windowDays = windowDays || 30;
  const items = [];
  for (const c of contacts) {
    if (c.birthday) {
      const d = new Date(c.birthday);
      if (!isNaN(d)) {
        const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
        if (next < now) next.setFullYear(now.getFullYear() + 1);
        const days = Math.ceil((next - now) / 86400000);
        if (days <= windowDays) {
          items.push({ name: c.name, label: '生日', days, date: next });
        }
      }
    }
    for (const d of (c.important_dates || [])) {
      if (!d.date) continue;
      let dateStr = d.date;
      if (dateStr.length === 5) dateStr = `${now.getFullYear()}-${dateStr}`;
      const targetDate = new Date(dateStr);
      if (isNaN(targetDate)) continue;
      const next = new Date(now.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      if (next < now) next.setFullYear(now.getFullYear() + 1);
      const days = Math.ceil((next - now) / 86400000);
      if (days <= windowDays) {
        items.push({ name: c.name, label: d.label || '重要日期', days, date: next });
      }
    }
  }
  return items.sort((a, b) => a.days - b.days).slice(0, 5);
}

module.exports = { buildRoles, classifyContact, classifyTodos, calcEvolutionStage, buildUpcomingDates };
