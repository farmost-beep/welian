#!/usr/bin/env node
/**
 * Cloudflare Pages deployment script for Welian (CJS version).
 * Usage: node scripts/deploy.cjs
 */

const { ProxyAgent, setGlobalDispatcher, fetch, FormData } = require('/opt/homebrew/lib/node_modules/wrangler/node_modules/undici');
const { readFile, readdir } = require('fs/promises');
const { join, relative, extname } = require('path');
const { readFileSync } = require('fs');
const { execSync } = require('child_process');
const { Blob } = require('buffer');

const blake3 = require('/opt/homebrew/lib/node_modules/wrangler/node_modules/blake3-wasm');

const REPO_DIR = join(__dirname, '..');
const PUBLIC_DIR = join(REPO_DIR, 'public');

const PROXY = process.env.HTTP_PROXY || 'http://127.0.0.1:7897';
const proxy = new ProxyAgent(PROXY);
setGlobalDispatcher(proxy);

const ACCOUNT_ID = '79eeed26ff635772adb4a4ad8e0f29c1';

const configContent = readFileSync(
  `${process.env.HOME}/Library/Preferences/.wrangler/config/default.toml`,
  'utf-8'
);
const TOKEN = configContent.match(/oauth_token = "([^"]+)"/)[1];
const COMMIT_HASH = execSync('git rev-parse HEAD', { cwd: REPO_DIR }).toString().trim();
const COMMIT_MSG = execSync('git log -1 --pretty=%s', { cwd: REPO_DIR }).toString().trim();

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json',
  '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/markdown',
  '.txt': 'text/plain', '.pdf': 'application/pdf',
};

function getType(name) {
  for (const [ext, type] of Object.entries(TYPES)) {
    if (name.endsWith(ext)) return type;
  }
  return 'application/octet-stream';
}

function hashFile(content, filepath) {
  const base64Content = content.toString('base64');
  const ext = extname(filepath).substring(1);
  return blake3.hash(base64Content + ext).toString('hex').slice(0, 32);
}

const IGNORE = new Set(['_worker.js', '_redirects', '_headers', '_routes.json']);

async function walk(dir, baseDir = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const rel = relative(baseDir, fullPath);
    if (rel.startsWith('.')) continue;
    if (IGNORE.has(rel)) continue;
    if (entry.isDirectory()) files.push(...await walk(fullPath, baseDir));
    else if (entry.isFile()) {
      const content = await readFile(fullPath);
      const hash = hashFile(content, rel);
      files.push({ path: rel, hash, content, contentType: getType(rel) });
    }
  }
  return files;
}

async function main() {
  // ── Pre-deploy gate: smart journey tests ──
  // Strategy: map changed frontend files → relevant test files.
  // L0 smoke always runs if any frontend file changed (~10s, 8 tests).
  // Other test files run only if the modules they test were changed.
  //
  // Controls:
  //   SKIP_TESTS=1  — skip all tests (emergency hotfix)
  //   FULL_TESTS=1  — force all 57 tests (pre-release)
  //   Default       — run only tests relevant to changed files

  const skipTests = process.env.SKIP_TESTS === '1';
  const forceFull = process.env.FULL_TESTS === '1';

  // Map: changed file (relative to public/) → test files to run
  // L0 smoke (l0-smoke.spec.js) always included when any frontend file changes.
  const FILE_TO_TESTS = {
    'app.js':                ['l1-activation', 'l2-core-loop'],
    'index.html':            ['l1-activation'],
    'modules/main.js':       ['l1-activation', 'l2-core-loop', 'l2-meetings'],
    'modules/chat.js':       ['l2-chat-interaction', 'l2-core-loop', 'l2-file-attachment', 'l3-security'],
    'modules/contacts.js':   ['l2-core-loop', 'l3-security'],
    'modules/todos.js':      ['l2-core-loop'],
    'modules/timeline.js':   ['l2-core-loop'],
    'modules/meetings.js':   ['l2-meetings'],
    'modules/proactive.js':  ['l2-core-loop'],
    'modules/agent-bridge.js': ['l2-agent-offline', 'l2-file-attachment'],
    'modules/auth.js':       ['l1-activation'],
    'modules/billing.js':    [],
    'modules/misc.js':       ['l3-security'],
    'modules/state.js':      ['l1-activation'],
    'styles.css':            [],
  };

  // Map: changed file (relative to repo root, not public/) → vitest test files
  // Used for cloud-worker and miniprogram changes (backend tests, not journey tests).
  const BACKEND_FILE_TO_TESTS = {
    'cloud-worker/src/worker.js': ['test/wxmp.test.js', 'test/data-crud.test.js', 'test/advanced-endpoints.test.js'],
    'miniprogram/':               ['test/wxmp.test.js'],
  };

  let shouldRunTests = true;
  let testFiles = [];

  if (skipTests && !forceFull) {
    shouldRunTests = false;
    console.log('⏭️  Skipping journey tests (SKIP_TESTS=1)');
  } else if (!forceFull) {
    // Get changed frontend files (committed + uncommitted)
    let changedFiles = [];
    try {
      const committed = execSync('git diff --name-only HEAD~1 HEAD -- public/', { cwd: REPO_DIR }).toString().trim();
      const uncommitted = execSync('git diff --name-only -- public/ && git diff --name-only --cached -- public/', { cwd: REPO_DIR }).toString().trim();
      changedFiles = [...committed.split('\n'), ...uncommitted.split('\n')]
        .filter(f => f.trim())
        .map(f => f.replace(/^public\//, ''))
        .filter(f => FILE_TO_TESTS.hasOwnProperty(f));
      // Dedupe
      changedFiles = [...new Set(changedFiles)];
    } catch (e) {
      console.log('Could not determine frontend changes, running full suite to be safe');
      testFiles = null; // null = run all
    }

    if (testFiles !== null) {
      if (changedFiles.length === 0) {
        shouldRunTests = false;
        console.log('⏭️  Skipping journey tests (no frontend files changed in public/)');
      } else {
        // L0 smoke always runs
        const testSet = new Set(['l0-smoke']);
        for (const f of changedFiles) {
          for (const t of FILE_TO_TESTS[f]) testSet.add(t);
        }
        testFiles = [...testSet];
        console.log(`Frontend files changed: ${changedFiles.join(', ')}`);
        console.log(`Running ${testFiles.length} test file(s): ${testFiles.join(', ')}`);
      }
    }
  } else {
    console.log('🔧 FULL_TESTS=1 — forcing full journey suite');
    testFiles = null; // null = run all
  }

  if (shouldRunTests) {
    const testPattern = testFiles === null
      ? ''  // run all
      : testFiles.map(f => `tests/browser/${f}.spec.js`).join(' ');
    const cmd = `npx playwright test --project=journey --workers=1 --reporter=line ${testPattern}`.trim();
    console.log(`Running: ${cmd}`);
    try {
      execSync(cmd, {
        cwd: REPO_DIR,
        stdio: 'inherit',
        timeout: 300000,
      });
      console.log('✅ Journey tests passed');
    } catch (e) {
      console.error('❌ Journey tests FAILED — aborting deploy');
      console.error('Fix the failing tests before deploying.');
      console.error('Or use SKIP_TESTS=1 to deploy anyway (not recommended).');
      process.exit(1);
    }
  }

  // ── Pre-deploy gate: backend vitest tests (cloud-worker + miniprogram) ──
  // Run relevant vitest tests if cloud-worker/src/worker.js or miniprogram/ changed.
  if (!skipTests || forceFull) {
    let backendTestFiles = [];
    try {
      const allChanged = execSync('git diff --name-only HEAD~1 HEAD && git diff --name-only && git diff --name-only --cached', {
        cwd: REPO_DIR, encoding: 'utf-8',
      }).trim().split('\n').filter(f => f.trim());

      const testSet = new Set();
      for (const f of allChanged) {
        for (const [prefix, tests] of Object.entries(BACKEND_FILE_TO_TESTS)) {
          if (f.startsWith(prefix)) {
            for (const t of tests) testSet.add(t);
          }
        }
      }
      backendTestFiles = [...testSet];
    } catch {
      // git diff failed — skip backend tests
    }

    if (backendTestFiles.length > 0) {
      console.log(`\nBackend files changed → running vitest: ${backendTestFiles.join(', ')}`);
      const vitestCmd = `npx vitest run ${backendTestFiles.join(' ')}`;
      try {
        execSync(vitestCmd, {
          cwd: join(REPO_DIR, 'cloud-worker'),
          stdio: 'inherit',
          timeout: 120000,
        });
        console.log('✅ Backend vitest tests passed');
      } catch (e) {
        console.error('❌ Backend vitest tests FAILED — aborting deploy');
        console.error('Fix the failing tests or use SKIP_TESTS=1 to deploy anyway.');
        process.exit(1);
      }
    }
  }

  // Sync AGENTS.md from project root to public/ (single source of truth)
  const { copyFileSync } = require('fs');
  try {
    copyFileSync(join(REPO_DIR, 'AGENTS.md'), join(PUBLIC_DIR, 'AGENTS.md'));
    console.log('Synced AGENTS.md → public/AGENTS.md');
  } catch (e) {
    console.log('No AGENTS.md to sync (skipping)');
  }

  console.log(`Collecting files from ${PUBLIC_DIR}...`);
  const files = await walk(PUBLIC_DIR);
  console.log(`Found ${files.length} files`);

  let redirectsContent = null;
  try { redirectsContent = await readFile(join(PUBLIC_DIR, '_redirects')); } catch {}

  console.log('Getting JWT...');
  const jwtResp = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/welian/upload-token`,
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
  const jwt = (await jwtResp.json()).result.jwt;

  console.log('Checking missing hashes...');
  const hashes = files.map(f => f.hash);
  const checkResp = await fetch('https://api.cloudflare.com/client/v4/pages/assets/check-missing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ hashes }),
  });
  const missing = (await checkResp.json()).result || [];
  console.log(`Missing: ${missing.length} of ${hashes.length}`);

  const toUpload = files.filter(f => missing.includes(f.hash));
  if (toUpload.length > 0) {
    console.log(`Uploading ${toUpload.length} files...`);
    for (let i = 0; i < toUpload.length; i += 5) {
      const batch = toUpload.slice(i, i + 5);
      const payload = batch.map(f => ({
        key: f.hash,
        value: f.content.toString('base64'),
        metadata: { contentType: f.contentType },
        base64: true,
      }));
      const r = await fetch('https://api.cloudflare.com/client/v4/pages/assets/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify(payload),
      });
      console.log(`  Batch ${Math.floor(i / 5) + 1}: ${(await r.json()).success}`);
    }
    await fetch('https://api.cloudflare.com/client/v4/pages/assets/upsert-hashes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ hashes }),
    });
    console.log('Upserted hashes');
  } else {
    console.log('All files cached');
  }

  console.log('Creating deployment...');
  const manifest = {};
  for (const f of files) manifest[`/${f.path}`] = f.hash;

  const formData = new FormData();
  formData.append('manifest', JSON.stringify(manifest));
  formData.append('branch', 'main');
  formData.append('commit_hash', COMMIT_HASH);
  formData.append('commit_message', COMMIT_MSG.substring(0, 200));
  formData.append('commit_dirty', 'true');

  if (redirectsContent) {
    formData.append('_redirects', new Blob([redirectsContent]), '_redirects');
  }

  const depResp = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/welian/deployments`,
    { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: formData }
  );
  const depData = await depResp.json();
  console.log(`Deploy: ${depData.success}, URL: ${depData.result?.url}`);

  console.log('Waiting for deploy...');
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const sResp = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/welian/deployments/${depData.result.id}`,
        { headers: { Authorization: `Bearer ${TOKEN}` } }
      );
      const stage = (await sResp.json()).result?.latest_stage;
      console.log(`  ${stage?.name}: ${stage?.status}`);
      if (stage?.name === 'deploy' && stage?.status === 'success') {
        console.log(`\n✅ Deployment complete! URL: ${depData.result?.url}`);
        console.log(`   Production: https://welian.app`);
        break;
      }
    } catch (e) {
      console.log(`  Status check error (retrying): ${e.message}`);
    }
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
