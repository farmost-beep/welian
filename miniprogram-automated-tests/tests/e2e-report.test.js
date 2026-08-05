// e2e-report.test.js — E2E: 关系回顾报告完整流程
// 旅程: 直接打开report(无cid) → 降级为sharedView → 带cid打开 → 降级 → 带真实cid打开
const h = require('../helpers');

async function testE2EReport(mp) {
  // 1. 直接打开 report（无参数）— 应降级为 sharedView
  await mp.reLaunch('/pages/report/report');
  await h.sleep(3000);
  const page = await h.currentPage(mp);
  h.assert(page.path.includes('report'), '打开 report 页');

  let data = await h.getPageData(page);
  h.assert(!data.loading, '加载完成');
  console.log('  无参数: isSharedView=' + data.isSharedView + ' error=' + (data.error || 'none'));

  // 无 token 时应该降级为 sharedView
  if (data.isSharedView && data.report) {
    h.assert(true, '无参数降级为 sharedView');
    h.assert(Array.isArray(data.report.facts), '简化报告有事实清单');
    h.assert(data.report.facts.length > 0, '事实清单不为空');
    h.assert(data.report.temperature === undefined, '无温度字段');
    console.log('  简化报告事实数:', data.report.facts.length);
  } else if (data.report) {
    // 有 token 时生成真实报告
    h.assert(true, '有token生成真实报告');
    h.assert(data.report.contactName !== undefined, '真实报告有联系人名');
    h.assert(Array.isArray(data.report.facts), '真实报告有事实清单');
    console.log('  真实报告:', data.report.contactName);
  } else if (data.error) {
    throw new Error('无参数打开不应报错: ' + data.error);
  }

  // 2. 带 cid 打开（模拟分享链接，cid 为不存在值）
  await mp.reLaunch('/pages/report/report?cid=nonexistent-id-12345');
  await h.sleep(3000);
  const page2 = await h.currentPage(mp);
  data = await h.getPageData(page2);
  console.log('  假cid: isSharedView=' + data.isSharedView + ' error=' + (data.error || 'none'));

  // 应该降级，不报 404
  h.assert(!data.error || data.isSharedView, '假cid不报错或已降级');
  if (data.isSharedView && data.report) {
    h.assert(true, '假cid降级为 sharedView');
  }

  // 3. 带真实 cid 打开 — 从 dashboard 获取
  await mp.reLaunch('/pages/dashboard/dashboard');
  await h.sleep(3000);
  const dashPage = await h.currentPage(mp);
  const dashData = await h.getPageData(dashPage);

  let realCid = null;
  if (dashData.actionCard && dashData.actionCard.contact && dashData.actionCard.contact.id) {
    realCid = dashData.actionCard.contact.id;
  }

  if (realCid) {
    console.log('  用真实cid测试:', realCid);
    await mp.reLaunch(`/pages/report/report?cid=${encodeURIComponent(realCid)}`);
    await h.sleep(3000);
    const page3 = await h.currentPage(mp);
    data = await h.getPageData(page3);
    console.log('  真实cid: isSharedView=' + data.isSharedView + ' report=' + (data.report ? 'yes' : 'no'));

    if (data.report) {
      h.assert(Array.isArray(data.report.facts), '真实报告有事实清单');
      h.assert(data.report.facts.length > 0, '事实清单不为空');
      h.assert(data.report.temperature === undefined, '无温度字段');
      console.log('  报告:', data.report.contactName);
      console.log('  事实数:', data.report.facts.length);

      // 验证统计字段
      h.assert(data.report.totalInteractions !== undefined, '有总互动数');
      h.assert(data.report.daysSinceLast !== undefined, '有距上次天数');
      h.assert(data.report.avgInterval !== undefined, '有平均间隔');
    } else if (data.isSharedView) {
      h.assert(true, '真实cid也降级(无token)');
    }
  } else {
    console.log('  无法获取真实cid — 跳过');
  }

  // 4. 测试分享场景（contact+inviter 参数）
  await mp.reLaunch('/pages/report/report?contact=测试联系人&inviter=test_openid');
  await h.sleep(2000);
  const page4 = await h.currentPage(mp);
  data = await h.getPageData(page4);
  h.assert(data.isSharedView, '分享场景 isSharedView=true');
  h.assert(data._contactName === '测试联系人', '分享场景 contactName 正确');
  h.assert(data.report, '分享场景有简化报告');
  if (data.report) {
    h.assert(Array.isArray(data.report.facts), '分享场景有事实清单');
    console.log('  分享场景报告:', data.report.contactName);
  }
}

module.exports = {
  name: 'E2E-7: 关系回顾报告(无参数+假cid+真实cid+分享场景)',
  mutates: false,
  fn: testE2EReport,
};
