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
