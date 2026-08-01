// helpers.js — 测试辅助函数
const automator = require('miniprogram-automator');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let miniProgram = null;

// 启动小程序（复用实例）
async function launch() {
  if (miniProgram) return miniProgram;
  console.log('Launching mini program via automator...');
  miniProgram = await automator.launch({
    cliPath: config.cliPath,
    projectPath: config.projectPath,
    timeout: config.timeout,
  });
  console.log('Mini program launched.');
  return miniProgram;
}

// 关闭小程序
async function close() {
  if (miniProgram) {
    await miniProgram.close();
    miniProgram = null;
    console.log('Mini program closed.');
  }
}

// 获取当前页面（带重试）
async function currentPage(mp) {
  const page = await mp.currentPage();
  return page;
}

// 等待页面跳转
async function waitForPage(mp, expectedPath, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const page = await mp.currentPage();
    if (page.path && page.path.includes(expectedPath)) return page;
    await sleep(500);
  }
  throw new Error(`Timeout waiting for page: ${expectedPath}`);
}

// 获取页面数据
async function getPageData(page) {
  return await page.data();
}

// 模拟点击元素
async function tap(page, selector) {
  const element = await page.$(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  await element.tap();
  return element;
}

// 设置输入框值
async function setInput(page, selector, value) {
  const element = await page.$(selector);
  if (!element) throw new Error(`Input not found: ${selector}`);
  await element.input(value);
  return element;
}

// 截图（失败时用）
async function screenshot(mp, name) {
  if (!config.screenshotOnFail) return;
  try {
    const dir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // automator 0.12: mp.screenshot() returns base64
    const base64 = await mp.screenshot();
    if (base64) {
      fs.writeFileSync(
        path.join(dir, `${name || 'screenshot'}-${Date.now()}.png`),
        Buffer.from(base64, 'base64')
      );
    }
  } catch (e) {
    // 截图是辅助功能，失败不影响测试结果
  }
}

// 断言辅助
function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
  console.log(`  ✓ ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} — expected "${expected}", got "${actual}"`);
  }
  console.log(`  ✓ ${message}: ${actual}`);
}

function assertIncludes(haystack, needle, message) {
  if (typeof haystack === 'string' && !haystack.includes(needle)) {
    throw new Error(`Assertion failed: ${message} — "${needle}" not in "${haystack}"`);
  }
  if (Array.isArray(haystack) && !haystack.some(h => JSON.stringify(h).includes(needle))) {
    throw new Error(`Assertion failed: ${message} — "${needle}" not in array`);
  }
  console.log(`  ✓ ${message}`);
}

// sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 测试运行器
async function runTest(name, testFn) {
  console.log(`\n📋 ${name}`);
  console.log('─'.repeat(50));
  const mp = await launch();
  try {
    await testFn(mp);
    console.log(`✅ PASSED: ${name}`);
    return true;
  } catch (e) {
    console.error(`❌ FAILED: ${name}`);
    console.error(`   Error: ${e.message}`);
    await screenshot(mp, name.replace(/\s+/g, '-').toLowerCase());
    return false;
  }
}

// 运行所有测试
async function runAll(tests) {
  const results = [];
  for (const { name, fn } of tests) {
    const passed = await runTest(name, fn);
    results.push({ name, passed });
  }
  await close();

  console.log('\n' + '═'.repeat(50));
  console.log('Test Results:');
  console.log('═'.repeat(50));
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed);
  for (const r of results) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}`);
  }
  console.log('─'.repeat(50));
  console.log(`  ${passed}/${results.length} passed`);
  if (failed.length > 0) {
    console.log(`  ${failed.length} failed:`);
    for (const f of failed) {
      console.log(`    - ${f.name}`);
    }
    process.exit(1);
  } else {
    console.log('  All tests passed! 🎉');
    process.exit(0);
  }
}

module.exports = {
  launch, close, currentPage, waitForPage,
  getPageData, tap, setInput, screenshot,
  assert, assertEqual, assertIncludes,
  sleep, runTest, runAll,
};
