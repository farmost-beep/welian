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

const allTests = [...basicTests, ...e2eTests];
const modeFlags = ['--basic', '--safe', '--mutating', '--e2e', '--full'];

function skippedTests(tests, reason) {
  return tests.map(test => ({ name: test.name, reason }));
}

async function main() {
  const args = process.argv.slice(2);
  const unknownArgs = args.filter(arg => !modeFlags.includes(arg));
  const selectedModes = modeFlags.filter(flag => args.includes(flag));

  if (unknownArgs.length > 0 || selectedModes.length > 1) {
    throw new Error('Usage: node run-all.js [--basic|--safe|--mutating|--e2e|--full]');
  }

  for (const test of allTests) {
    if (typeof test.mutates !== 'boolean') {
      throw new Error(`Test is missing explicit mutates metadata: ${test.name || '(unnamed test)'}`);
    }
  }

  const mode = selectedModes[0] || 'default';
  const e2eToken = typeof process.env.WELIAN_E2E_TOKEN === 'string'
    ? process.env.WELIAN_E2E_TOKEN.trim()
    : '';
  const mutatingTests = allTests.filter(test => test.mutates);
  let testsToRun = [];
  let skipped = [];
  let tokenForRun = '';

  if (mode === '--mutating' || mode === '--full') {
    if (!e2eToken) {
      const requested = mode === '--mutating' ? mutatingTests : allTests;
      const blocked = requested.filter(test => test.mutates);
      console.error(`${mode} requires WELIAN_E2E_TOKEN; no mutating tests will run.`);
      await h.runAll([], {
        skippedTests: skippedTests(blocked, 'mutating test blocked because WELIAN_E2E_TOKEN is not set'),
      });
      process.exitCode = 1;
      return;
    }

    testsToRun = mode === '--mutating' ? mutatingTests : allTests;
    tokenForRun = e2eToken;
    console.log(`Running ${mode === '--mutating' ? 'mutating' : 'full'} tests with the dedicated E2E account.`);
    console.log('Write access: ENABLED only for the token supplied via WELIAN_E2E_TOKEN.\n');
  } else if (mode === '--e2e') {
    if (e2eToken) {
      testsToRun = e2eTests;
      tokenForRun = e2eToken;
      console.log('Running safe and mutating E2E tests with the dedicated E2E account.');
      console.log('Write access: ENABLED only for the token supplied via WELIAN_E2E_TOKEN.\n');
    } else {
      testsToRun = e2eTests.filter(test => !test.mutates);
      skipped = skippedTests(
        e2eTests.filter(test => test.mutates),
        'mutating E2E test blocked because WELIAN_E2E_TOKEN is not set'
      );
      console.log('Running safe E2E tests only.');
      console.log('Write protection: ON — mutating E2E tests will not run.\n');
    }
  } else if (mode === '--basic') {
    testsToRun = basicTests.filter(test => !test.mutates);
    skipped = skippedTests(
      basicTests.filter(test => test.mutates),
      'mutating test excluded by --basic read-only mode'
    );
    console.log('Running basic read-only tests only.');
    console.log('Write protection: ON — mutating tests will not run.\n');
  } else {
    testsToRun = allTests.filter(test => !test.mutates);
    const reason = mode === '--safe'
      ? 'mutating test excluded by --safe read-only mode'
      : 'mutating test excluded by the default read-only mode';
    skipped = skippedTests(mutatingTests, reason);
    console.log(`Running ${mode === '--safe' ? 'safe' : 'default'} tests (${testsToRun.length} read-only tests).`);
    console.log('Write protection: ON — mutating tests will not run.\n');
  }

  await h.runAll(testsToRun, {
    skippedTests: skipped,
    e2eToken: tokenForRun,
  });
}

main().catch((error) => {
  console.error(`Test runner failed: ${error.message}`);
  process.exitCode = 1;
});
