// dashboard.test.js — 测试 dashboard 行动卡 + 感知卡 + 进化阶段
const h = require('../helpers');

async function testDashboard(mp) {
  await mp.reLaunch('/pages/dashboard/dashboard');
  await h.sleep(2000);
  const page = await h.currentPage(mp);
  h.assert(page.path.includes('dashboard'), 'Should be on dashboard');

  const data = await h.getPageData(page);
  console.log('  Stats:', JSON.stringify(data.stats || {}));
  console.log('  isEmpty:', data.isEmpty);

  // 1. 检查统计概览
  if (!data.isEmpty) {
    h.assert(data.stats && typeof data.stats.total === 'number', 'Stats total is a number');
    h.assert(data.stats && typeof data.stats.leverage === 'number', 'Stats leverage is a number');
  }

  // 2. 检查进化阶段
  if (data.evolution) {
    console.log('  Evolution:', data.evolution.name, 'progress:', data.evolution.progress + '%');
    h.assert(data.evolution.name, 'Evolution has a name');
    h.assert(typeof data.evolution.progress === 'number', 'Evolution progress is a number');
    h.assert(Array.isArray(data.evolution.stages), 'Evolution has stages array');
  }

  // 3. 检查进化指标
  if (data.evolutionMetrics) {
    console.log('  Metrics:', JSON.stringify(data.evolutionMetrics));
    h.assert(typeof data.evolutionMetrics.monthInteractions === 'number', 'Month interactions is a number');
    h.assert(typeof data.evolutionMetrics.totalInteractions === 'number', 'Total interactions is a number');
  }

  // 4. 检查行动卡（R2-2）
  if (data.actionCard) {
    console.log('  Action card:', data.actionCard.type, '-', data.actionCard.reason);
    h.assert(data.actionCard.type, 'Action card has type');
    h.assert(data.actionCard.reason, 'Action card has reason');
    h.assert(data.actionCard.contact, 'Action card has contact');
  } else {
    console.log('  No action card (may be expected if no pending items)');
  }

  // 5. 检查行为洞察（R2-4）
  if (data.behavioralInsights) {
    console.log('  Behavioral insights:', JSON.stringify(data.behavioralInsights).slice(0, 100));
    h.assert(true, 'Behavioral insights loaded');
  }

  // 6. 检查 flags
  console.log('  Flags:', JSON.stringify(data.flags));
  h.assert(typeof data.flags === 'object', 'Flags object exists');
}

module.exports = {
  name: 'Dashboard 行动卡+感知卡+进化阶段',
  mutates: false,
  fn: testDashboard,
};
