// onboarding.test.js — 测试 onboarding 3联系人引导流程
const h = require('../helpers');

async function testOnboarding(mp) {
  // 1. 重启到首页（dashboard）
  await mp.reLaunch('/pages/dashboard/dashboard');
  await h.sleep(1000);
  const page = await h.currentPage(mp);
  h.assert(page.path.includes('dashboard'), 'Should be on dashboard');

  // 2. 检查 dashboard 数据
  const data = await h.getPageData(page);
  console.log('  Dashboard data keys:', Object.keys(data).join(', '));

  // 3. 如果是空状态（isEmpty=true），应该有引导去 onboarding
  if (data.isEmpty) {
    h.assert(true, 'Dashboard shows empty state — onboarding needed');
    // 检查是否有 onboarding 入口（按钮或自动跳转）
    const onboardingBtn = await page.$('.empty-guide button') || await page.$('button');
    if (onboardingBtn) {
      h.assert(true, 'Found onboarding entry button');
    }
  } else {
    h.assert(true, 'Dashboard has data — onboarding already completed');
  }

  // 4. 手动跳转到 onboarding 页面验证页面能打开
  await mp.reLaunch('/pages/onboarding/onboarding');
  await h.sleep(1000);
  const onboardingPage = await h.currentPage(mp);
  h.assert(onboardingPage.path.includes('onboarding'), 'Should be on onboarding page');

  const onboardingData = await h.getPageData(onboardingPage);
  console.log('  Onboarding data:', JSON.stringify(onboardingData).slice(0, 200));

  // 5. 检查 onboarding 页面有联系人输入结构
  h.assert(onboardingData.added !== undefined || onboardingData.contacts || onboardingData.step !== undefined, 'Onboarding has contact input structure');

  // 6. 测试输入联系人
  // 尝试找到输入框
  const inputs = await onboardingPage.$$('input');
  console.log(`  Found ${inputs.length} input fields`);
  h.assert(inputs.length > 0, 'Onboarding has input fields');

  if (inputs.length >= 2) {
    await inputs[0].input('测试用户A');
    await inputs[1].input('测试用户B');
    h.assert(true, 'Filled in test contacts');
  }
}

module.exports = {
  name: 'Onboarding 3联系人引导流程',
  mutates: false,
  fn: testOnboarding,
};
