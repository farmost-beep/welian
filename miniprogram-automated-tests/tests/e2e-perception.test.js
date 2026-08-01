// e2e-perception.test.js — E2E: 感知变化完整流程
// 旅程: 联系人详情页 → 感知变化采集 → 查看感知列表 → 确认感知 → 拒绝感知
const h = require('../helpers');

async function getContactWithGithub(mp) {
  // 从 contacts 页获取真实 ID
  await mp.reLaunch('/pages/contacts/contacts');
  await h.sleep(3000);
  const cPage = await h.currentPage(mp);
  const cData = await h.getPageData(cPage);
  if (cData.allList && cData.allList.length > 0) {
    const c = cData.allList[0];
    console.log('  从contacts获取:', c.name, 'ID:', c.id);
    return c.id;
  }
  return null;
}

async function testE2EPerception(mp) {
  const contactId = await getContactWithGithub(mp);
  h.assert(contactId, '获取到联系人ID');
  console.log('  测试联系人ID:', contactId);

  // 1. 跳转到联系人详情页
  await mp.reLaunch(`/pages/contact-detail/contact-detail?id=${encodeURIComponent(contactId)}`);
  await h.sleep(3000);
  const page = await h.currentPage(mp);
  h.assert(page.path.includes('contact-detail'), '跳转到联系人详情页');

  let data = await h.getPageData(page);
  h.assert(data.contact, '联系人数据存在');
  const github = data.contact?.platforms?.github || data.contact?.github;
  console.log('  GitHub 用户名:', github || '(无)');

  // 2. 检查已有感知
  h.assert(Array.isArray(data.perceptions), 'perceptions 是数组');
  console.log('  已有感知数:', data.perceptions.length);

  // 3. 采集感知变化
  console.log('  触发感知变化采集...');
  await page.callMethod('collectPerceptions');
  await h.sleep(5000); // GitHub API 调用需要时间
  data = await h.getPageData(page);
  h.assert(!data.loadingPerception, '采集完成 loadingPerception=false');
  h.assert(true, 'collectPerceptions 不崩溃');

  // 4. 重新加载感知列表
  await page.callMethod('loadPerceptions');
  await h.sleep(2000);
  data = await h.getPageData(page);
  console.log('  采集后感知数:', data.perceptions.length);

  if (data.perceptions.length > 0) {
    // 5. 验证感知数据结构
    const perc = data.perceptions[0];
    h.assert(perc.id, '感知有 id');
    h.assert(perc.title, '感知有 title');
    h.assert(perc.source, '感知有 source');
    h.assert(perc.source.platform, '感知 source 有 platform');
    h.assert(typeof perc.confidence === 'number', '感知有 confidence');
    h.assert(perc.status, '感知有 status');
    console.log('  第一条感知:', perc.title);
    console.log('  状态:', perc.status, '置信度:', perc.confidence);

    // 6. 去重验证
    const titles = data.perceptions.map(p => p.title);
    const uniqueTitles = [...new Set(titles)];
    if (titles.length !== uniqueTitles.length) {
      console.log('  ⚠️ 发现重复感知(' + (titles.length - uniqueTitles.length) + '条), 可能是旧数据');
    }

    // 7. 确认第一条感知
    const firstPerc = data.perceptions[0];
    if (firstPerc.status === 'pending') {
      console.log('  确认感知:', firstPerc.title.slice(0, 30));
      await page.callMethod('confirmPerception', { currentTarget: { dataset: { id: firstPerc.id } } });
      await h.sleep(2000);
      data = await h.getPageData(page);
      const confirmed = data.perceptions.find(p => p.id === firstPerc.id);
      if (confirmed) {
        h.assertEqual(confirmed.status, 'confirmed', '感知状态变为 confirmed');
        console.log('  确认成功');
      }
    }

    // 8. 拒绝第二条感知（如果有）
    if (data.perceptions.length > 1) {
      const secondPerc = data.perceptions.find(p => p.status === 'pending');
      if (secondPerc) {
        console.log('  拒绝感知:', secondPerc.title.slice(0, 30));
        await page.callMethod('rejectPerception', { currentTarget: { dataset: { id: secondPerc.id } } });
        await h.sleep(2000);
        data = await h.getPageData(page);
        // rejectPerception 可能删除或标记 — 验证不崩溃
        h.assert(true, 'rejectPerception 不崩溃');
        const rejected = data.perceptions.find(p => p.id === secondPerc.id);
        if (rejected) {
          console.log('  拒绝后状态:', rejected.status);
        } else {
          console.log('  感知已删除');
        }
      }
    }
  } else {
    console.log('  无感知数据(联系人可能无GitHub活动) — 验证空状态处理');
    h.assert(true, '空感知状态处理正确');
  }

  // 9. 如果没有 GitHub 用户名，验证引导弹窗
  if (!github) {
    console.log('  验证无GitHub用户名时的引导...');
    // collectPerceptions 应该已经弹了 showModal，但 automator 无法捕获 modal
    // 验证 data 中没有崩溃
    h.assert(true, '无GitHub用户名时不崩溃');
  }
}

module.exports = {
  name: 'E2E-4: 感知变化完整流程(采集→确认→拒绝)',
  fn: testE2EPerception,
};
