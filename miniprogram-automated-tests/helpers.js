// helpers.js — 测试辅助函数
const automator = require('miniprogram-automator');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let miniProgram = null;

function getE2EToken() {
  return typeof process.env.WELIAN_E2E_TOKEN === 'string'
    ? process.env.WELIAN_E2E_TOKEN.trim()
    : '';
}

// 启动小程序（复用实例）
async function launch(options = {}) {
  if (miniProgram) return miniProgram;
  const e2eToken = options.useE2EAccount ? getE2EToken() : '';
  if (options.useE2EAccount && !e2eToken) {
    throw new Error('WELIAN_E2E_TOKEN is required for the dedicated E2E account.');
  }
  console.log('Launching mini program via automator...');
  miniProgram = await automator.launch({
    cliPath: config.cliPath,
    projectPath: config.projectPath,
    timeout: config.timeout,
  });

  if (options.e2eToken) {
    try {
      // miniprogram-automator 0.12.1 没有 setStorage API；官方 evaluate API 可在 AppService 中调用 wx.setStorageSync。
      await miniProgram.evaluate((key, value) => {
        wx.setStorageSync(key, value);
      }, 'welian_token', options.e2eToken);
      await miniProgram.reLaunch('/pages/dashboard/dashboard');
      console.log('Dedicated E2E account configured.');
    } catch (e) {
      try { await miniProgram.close(); } catch (closeError) {}
      miniProgram = null;
      throw new Error('Failed to configure the dedicated E2E account.');
    }
  }

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
async function runTest(name, testFn, options = {}) {
  console.log(`\n📋 ${name}`);
  console.log('─'.repeat(50));
  let mp = null;
  try {
    mp = await launch(options);
    await testFn(mp);
    console.log(`✅ PASSED: ${name}`);
    return true;
  } catch (e) {
    console.error(`❌ FAILED: ${name}`);
    console.error(`   Error: ${e.message}`);
    if (mp) await screenshot(mp, name.replace(/\s+/g, '-').toLowerCase());
    return false;
  }
}

// 运行所有测试
async function runAll(tests, options = {}) {
  const results = [];
  const skipped = [...(options.skippedTests || [])];

  for (const test of tests) {
    if (typeof test.mutates !== 'boolean') {
      throw new Error(`Test is missing explicit mutates metadata: ${test.name || '(unnamed test)'}`);
    }
    if (test.mutates && !options.e2eToken) {
      skipped.push({
        name: test.name,
        reason: 'mutating test requires WELIAN_E2E_TOKEN',
      });
      continue;
    }
    const passed = await runTest(test.name, test.fn, { e2eToken: options.e2eToken });
    results.push({ name: test.name, passed });
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
  for (const s of skipped) {
    console.log(`  [SKIPPED] ${s.name} — ${s.reason}`);
  }
  console.log('─'.repeat(50));
  console.log(`  ${passed}/${results.length} passed`);
  console.log(`  ${skipped.length} skipped`);
  if (failed.length > 0) {
    console.log(`  ${failed.length} failed:`);
    for (const f of failed) {
      console.log(`    - ${f.name}`);
    }
    process.exitCode = 1;
  } else if (results.length === 0) {
    console.log('  No tests ran.');
  } else {
    console.log('  All selected tests passed!');
  }

  return { results, skipped };
}

module.exports = {
  launch, close, currentPage, waitForPage,
  getPageData, tap, setInput, screenshot,
  assert, assertEqual, assertIncludes,
  sleep, runTest, runAll,
};
