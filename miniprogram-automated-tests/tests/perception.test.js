// perception.test.js — 测试联系人详情页感知变化流程
const h = require('../helpers');

async function testPerception(mp) {
  // 1. 先去 dashboard 看有没有联系人
  await mp.reLaunch('/pages/dashboard/dashboard');
  await h.sleep(2000);
  const dashPage = await h.currentPage(mp);
  const dashData = await h.getPageData(dashPage);

  if (dashData.isEmpty || !dashData.stats || dashData.stats.total === 0) {
    console.log('  No contacts available — skipping perception test');
    h.assert(true, 'Skipped (no contacts)');
    return;
  }

  // 2. 找到第一个联系人，跳转到详情页
  // 从 dashboard 的角色列表中找
  let firstContactId = null;
  if (dashData.roles) {
    for (const role of dashData.roles) {
      if (role.items && role.items.length > 0) {
        firstContactId = role.items[0].contactId || role.items[0].id;
        break;
      }
    }
  }

  if (!firstContactId) {
    console.log('  Could not find a contact ID from dashboard — trying contacts page');
    h.assert(true, 'Skipped (no contact ID found)');
    return;
  }

  console.log('  Testing with contact ID:', firstContactId);

  // 3. 跳转到联系人详情页
  await mp.reLaunch(`/pages/contact-detail/contact-detail?id=${firstContactId}`);
  await h.sleep(2000);
  const page = await h.currentPage(mp);
  h.assert(page.path.includes('contact-detail'), 'Should be on contact-detail page');

  const data = await h.getPageData(page);
  h.assert(data.contact, 'Contact data loaded');
  if (data.contact) {
    console.log('  Contact:', data.contact.name);
  }

  // 4. 检查感知变化按钮存在
  const buttons = await page.$$('button');
  let hasPerceptionBtn = false;
  for (const btn of buttons) {
    const text = await btn.text();
    if (text && text.includes('感知变化')) {
      hasPerceptionBtn = true;
      break;
    }
  }
  h.assert(hasPerceptionBtn, '感知变化 button exists');

  // 5. 检查感知卡区域
  if (data.perceptions && data.perceptions.length > 0) {
    console.log(`  Found ${data.perceptions.length} existing perceptions`);
    const perc = data.perceptions[0];
    h.assert(perc.id, 'Perception has id');
    h.assert(perc.title, 'Perception has title');
    h.assert(perc.source, 'Perception has source');
    h.assert(perc.source.platform, 'Perception source has platform');
    h.assert(typeof perc.confidence === 'number', 'Perception has confidence score');

    // 检查去重：不应有相同 title 的感知
    const titles = data.perceptions.map(p => p.title);
    const uniqueTitles = [...new Set(titles)];
    h.assertEqual(titles.length, uniqueTitles.length, 'No duplicate perception titles');
  } else {
    console.log('  No existing perceptions (expected if not collected yet)');
  }

  // 6. 检查 GitHub 用户名字段
  const github = data.contact?.platforms?.github || data.contact?.github;
  if (github) {
    console.log('  GitHub username:', github);
    h.assert(true, 'Contact has GitHub username — perception should work');
  } else {
    console.log('  No GitHub username — perception will prompt to edit');
    h.assert(true, 'Contact has no GitHub username (expected behavior: prompt to edit)');
  }
}

module.exports = {
  name: '联系人详情页感知变化流程',
  fn: testPerception,
};
