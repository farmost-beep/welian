#!/usr/bin/env node
/**
 * Sync prompts/ directory to Cloudflare KV (prompt:*.md keys)
 * Run after deploying worker: node scripts/sync_prompts.cjs
 */
const fs = require('fs');
const path = require('path');

const PROMPTS_DIR = path.join(__dirname, '..', 'prompts');
const KV_NAMESPACE = 'USER_DATA';

async function main() {
  // Use wrangler to write each prompt file to KV
  const files = fs.readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.md'));
  console.log(`Found ${files.length} prompt files`);

  for (const file of files) {
    const content = fs.readFileSync(path.join(PROMPTS_DIR, file), 'utf8');
    const key = `prompt:${file}`;
    console.log(`  Writing ${key} (${content.length} bytes)...`);

    // Write to temp file, then use wrangler kv key put
    const tmpPath = `/tmp/welian_prompt_${file}`;
    fs.writeFileSync(tmpPath, content);
    const { execSync } = require('child_process');
    try {
      execSync(
        `npx wrangler kv key put --namespace-id=98c045b73d874a869493706dc585afb "${key}" --path "${tmpPath}"`,
        { stdio: 'pipe', cwd: path.join(__dirname, '..', 'cloud-worker') }
      );
      console.log(`  ✓ ${key}`);
    } catch (e) {
      console.error(`  ✗ ${key}: ${e.message}`);
    }
    fs.unlinkSync(tmpPath);
  }
  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
