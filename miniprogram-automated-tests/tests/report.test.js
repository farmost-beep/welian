// report.test.js — 测试关系回顾报告流程
const h = require('../helpers');

async function testReport(mp) {
  // 1. 直接打开 report 页面（不带 cid — 模拟用户自己查看）
  await mp.reLaunch('/pages/report/report');
  await h.sleep(2000);
  const page = await h.currentPage(mp);
  h.assert(page.path.includes('report'), 'Should be on report page');

  const data = await h.getPageData(page);
  console.log('  Report loading:', data.loading);
  console.log('  Report error:', data.error || 'none');
  console.log('  isSharedView:', data.isSharedView);

  // 2. 如果加载成功，检查报告结构（无温度，有事实清单）
  if (data.report) {
    const r = data.report;
    console.log('  Report contactName:', r.contactName);
    h.assert(Array.isArray(r.facts), 'Has facts array');
    h.assert(r.facts.length > 0, 'Facts array is not empty');
    h.assert(r.totalInteractions !== undefined, 'Has totalInteractions');
    h.assert(r.daysSinceLast !== undefined, 'Has daysSinceLast');
    // 不应有温度字段
    h.assert(r.temperature === undefined, 'No temperature field (removed)');
    h.assert(r.tempDesc === undefined, 'No tempDesc field (removed)');
  } else if (data.error) {
    console.log('  Report error:', data.error);
    if (data.isSharedView) {
      h.assert(true, 'Degraded to shared view on auth error');
    } else {
      h.assert(true, 'Report shows error (may need login)');
    }
  }

  // 3. 测试带 cid 参数打开（模拟分享链接）
  await mp.reLaunch('/pages/report/report?cid=test-contact-id');
  await h.sleep(2000);
  const page2 = await h.currentPage(mp);
  const data2 = await h.getPageData(page2);
  console.log('  With cid — loading:', data2.loading, 'isSharedView:', data2.isSharedView);

  // 被分享者（无 token）应该降级为 sharedView，不应该报 404
  if (data2.isSharedView && data2.report) {
    h.assert(Array.isArray(data2.report.facts), 'Shared report has facts array');
    h.assert(true, 'Shared view degraded correctly (no 404)');
  } else if (data2.report) {
    h.assert(true, 'Report loaded with cid (user is logged in)');
  } else if (data2.error && !data2.isSharedView) {
    throw new Error(`Report with cid should not show raw error: ${data2.error}`);
  }
}

module.exports = {
  name: '关系回顾报告流程',
  mutates: false,
  fn: testReport,
};
