// run-all.js — 运行所有小程序自动化测试
const h = require('./helpers');

const tests = [
  require('./tests/onboarding.test.js'),
  require('./tests/dashboard.test.js'),
  require('./tests/perception.test.js'),
  require('./tests/report.test.js'),
  require('./tests/network.test.js'),
];

h.runAll(tests);
