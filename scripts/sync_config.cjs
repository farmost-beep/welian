#!/usr/bin/env node
/**
 * Sync config/welian.yaml routing section to Cloudflare KV (config:routing key)
 * Run after changing routing config: node scripts/sync_config.cjs
 *
 * Also syncs prompts/ → KV (prompt:*.md keys), same as sync_prompts.cjs.
 * This script is the unified "push config to cloud" command.
 *
 * Usage:
 *   node scripts/sync_config.cjs              # sync routing + prompts
 *   node scripts/sync_config.cjs --routing    # sync routing only
 *   node scripts/sync_config.cjs --prompts    # sync prompts only
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PROMPTS_DIR = path.join(ROOT, 'prompts');
const CONFIG_PATH = path.join(ROOT, 'config', 'welian.yaml');
const KV_ID = '98c045b73d874a869493706dc585bafb';
const WRANGLER_CWD = path.join(ROOT, 'cloud-worker');

// ── Minimal YAML parser for routing section ──
// We only need: routing.mode, routing.live_timeout_ms, routing.agent_context_timeout_ms
// Full yaml parser avoids fragile regex, but Node doesn't ship one.
// Use a simple line-based parser for the routing block.
function parseRoutingYaml(yamlText) {
  const lines = yamlText.split('\n');
  let inRouting = false;
  let inCloud = false;
  let inTierRouting = false;
  let inDataPriority = false;
  const routing = {};
  const tierRouting = {};
  const dataPriority = [];

  for (const line of lines) {
    // Detect top-level sections
    if (/^routing:/.test(line)) { inRouting = true; inCloud = false; inTierRouting = false; inDataPriority = false; continue; }
    if (/^cloud:/.test(line)) { inCloud = true; inRouting = false; inTierRouting = false; inDataPriority = false; continue; }
    if (/^[a-z]/.test(line) && !line.startsWith(' ')) { inRouting = false; inCloud = false; inTierRouting = false; inDataPriority = false; continue; }

    if (inRouting) {
      const m = line.match(/^\s+(\w+):\s*"?([^"#]*)"?\s*(?:#.*)?$/);
      if (m) routing[m[1]] = isNaN(m[2]) ? m[2] : parseInt(m[2], 10);
    }

    if (inCloud) {
      if (/^\s+tier_routing:/.test(line)) { inTierRouting = true; inDataPriority = false; continue; }
      if (/^\s+data_priority:/.test(line)) { inDataPriority = true; inTierRouting = false; continue; }
      if (/^\s+\w+:/.test(line) && !line.startsWith('    ')) { inTierRouting = false; inDataPriority = false; }

      if (inTierRouting) {
        const m = line.match(/^\s+(\w+):\s*"?([^"#]*)"?\s*(?:#.*)?$/);
        if (m && m[1] !== 'data_priority') tierRouting[m[1]] = m[2];
      }

      if (inDataPriority) {
        const m = line.match(/^\s+-\s*"?([^"#"]+)"?\s*(?:#.*)?$/);
        if (m) dataPriority.push(m[1]);
      }
    }
  }

  return { routing, tierRouting, dataPriority };
}

function kvPut(key, value) {
  const tmpPath = `/tmp/welian_config_${Date.now()}.json`;
  fs.writeFileSync(tmpPath, typeof value === 'string' ? value : JSON.stringify(value));
  try {
    execSync(
      `npx wrangler kv key put --namespace-id=${KV_ID} "${key}" --path "${tmpPath}"`,
      { stdio: 'pipe', cwd: WRANGLER_CWD }
    );
    console.log(`  ✓ ${key}`);
    return true;
  } catch (e) {
    console.error(`  ✗ ${key}: ${e.message}`);
    return false;
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

function syncRouting() {
  console.log('\n── Syncing routing config ──');
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`  Config not found: ${CONFIG_PATH}`);
    return;
  }
  const yamlText = fs.readFileSync(CONFIG_PATH, 'utf8');
  const { routing, tierRouting, dataPriority } = parseRoutingYaml(yamlText);

  if (!routing.mode) {
    console.error('  No routing section found in welian.yaml');
    return;
  }

  console.log(`  Parsed routing:`, routing);
  kvPut('config:routing', routing);

  if (Object.keys(tierRouting).length > 0) {
    console.log(`  Parsed tier_routing:`, tierRouting);
    kvPut('config:tier_routing', tierRouting);
  }

  if (dataPriority.length > 0) {
    console.log(`  Parsed data_priority:`, dataPriority);
    kvPut('config:data_priority', dataPriority);
  }
}

function syncPrompts() {
  console.log('\n── Syncing prompts ──');
  if (!fs.existsSync(PROMPTS_DIR)) {
    console.error(`  Prompts dir not found: ${PROMPTS_DIR}`);
    return;
  }
  const files = fs.readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.md'));
  console.log(`  Found ${files.length} prompt files`);

  for (const file of files) {
    const content = fs.readFileSync(path.join(PROMPTS_DIR, file), 'utf8');
    const key = `prompt:${file}`;
    console.log(`  Writing ${key} (${content.length} bytes)...`);
    kvPut(key, content);
  }
}

function main() {
  const arg = process.argv[2] || '';
  console.log('Welian config sync → Cloudflare KV');

  if (!arg || arg === '--routing') syncRouting();
  if (!arg || arg === '--prompts') syncPrompts();

  console.log('\nDone! Changes are live immediately (5min cache on worker side).');
}

main();
