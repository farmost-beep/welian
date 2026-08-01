// run-all.js — 运行所有小程序自动化测试
const h = require('./helpers');

// 基础测试（快速验证页面加载）
const basicTests = [
  require('./tests/onboarding.test.js'),
  require('./tests/dashboard.test.js'),
  require('./tests/perception.test.js'),
  require('./tests/report.test.js'),
  require('./tests/network.test.js'),
];

// E2E 端到端测试（完整用户旅程）
const e2eTests = [
  require('./tests/e2e-onboarding.test.js'),
  require('./tests/e2e-dashboard.test.js'),
  require('./tests/e2e-contact-detail.test.js'),
  require('./tests/e2e-perception.test.js'),
  require('./tests/e2e-contacts.test.js'),
  require('./tests/e2e-network.test.js'),
  require('./tests/e2e-report.test.js'),
];

// 命令行参数控制运行哪些测试
const args = process.argv.slice(2);
let testsToRun;

if (args.includes('--basic')) {
  testsToRun = basicTests;
  console.log('Running basic tests only...\n');
} else if (args.includes('--e2e')) {
  testsToRun = e2eTests;
  console.log('Running E2E tests only...\n');
} else {
  testsToRun = [...basicTests, ...e2eTests];
  console.log(`Running all tests (${basicTests.length} basic + ${e2eTests.length} e2e = ${testsToRun.length} total)...\n`);
}

h.runAll(testsToRun);
