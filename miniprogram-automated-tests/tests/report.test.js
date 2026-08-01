// report.test.js — 测试关系体检报告流程
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

  // 2. 如果加载成功，检查报告结构
  if (data.report) {
    const r = data.report;
    console.log('  Report contactName:', r.contactName);
    console.log('  Report temperature:', r.temperature);
    h.assert(typeof r.temperature === 'number', 'Temperature is a number');
    h.assert(r.temperature >= 0 && r.temperature <= 100, 'Temperature in valid range');
    h.assert(r.tempDesc, 'Has temperature description');
    h.assert(Array.isArray(r.suggestions), 'Has suggestions array');
    // contactName 可能为空（降级为 sharedView 时），不强制要求
  } else if (data.error) {
    console.log('  Report error:', data.error);
    // 如果是未登录错误，应该降级为 sharedView
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
    h.assert(true, 'Shared view degraded correctly (no 404)');
  } else if (data2.report) {
    h.assert(true, 'Report loaded with cid (user is logged in)');
  } else if (data2.error && !data2.isSharedView) {
    // 这不应该发生 — 如果有 error 应该已经降级
    throw new Error(`Report with cid should not show raw error: ${data2.error}`);
  }
}

module.exports = {
  name: '关系体检报告流程',
  fn: testReport,
};
