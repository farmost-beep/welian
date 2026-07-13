#!/usr/bin/env node
// welian-cloud CLI — deploy your own Welian cloud worker instance
//
// Usage:
//   npx welian-cloud deploy          Deploy to Cloudflare Workers
//   npx welian-cloud dev             Run locally (wrangler dev)
//   npx welian-cloud init            Create wrangler.toml with your config
//   npx welian-cloud secret set      Set LLM_API_KEY secret

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');

const cmd = process.argv[2] || 'help';

const HELP = `
Welian Cloud Worker — AI billing gateway (方案C)

Commands:
  deploy       Deploy to Cloudflare Workers (wrangler deploy)
  dev          Run locally for development (wrangler dev)
  init         Interactive setup: configure wrangler.toml + set secrets
  secret list  List configured secrets
  secret set   Set a secret (LLM_API_KEY, CLERK_SECRET_KEY, etc.)
  help         Show this help

Quick start:
  npx welian-cloud init
  npx welian-cloud deploy

After deploy, your cloud worker will be at:
  https://<your-worker-name>.<your-subdomain>.workers.dev

Then configure your Welian CLI:
  welian agent --cloud https://<your-worker-url> --user-token <your-token>
`;

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, ans => { rl.close(); resolve(ans.trim()); });
  });
}

async function runInit() {
  console.log('\n🚀 Welian Cloud Worker Setup\n');

  const workerName = await ask('Worker name (default: welian-ai): ') || 'welian-ai';
  const llmModel = await ask('LLM model (default: MiniMax-M3): ') || 'MiniMax-M3';
  const llmBaseUrl = await ask('LLM base URL (default: https://api.minimaxi.com/anthropic): ') || 'https://api.minimaxi.com/anthropic';
  const customDomain = await ask('Custom domain (optional, e.g. api.yourapp.com): ');

  // Generate wrangler.toml
  let toml = `name = "${workerName}"\nmain = "src/worker.js"\ncompatibility_date = "2024-09-01"\nworkers_dev = true\n\n`;
  if (customDomain) {
    toml += `routes = [\n  { pattern = "${customDomain}", zone_name = "${customDomain.split('.').slice(-2).join('.')}" }\n]\n\n`;
  }
  toml += `[vars]\nLLM_MODEL = "${llmModel}"\nLLM_BASE_URL = "${llmBaseUrl}"\n\n`;
  toml += `# KV namespace for device discovery (create with: npx wrangler kv namespace create DEVICES)\n[[kv_namespaces]]\nbinding = "DEVICES"\n# Replace with your KV namespace ID\nid = "placeholder"\n\n`;
  toml += `# Set secrets via: npx welian-cloud secret set\n`;

  const tomlPath = join(PKG_ROOT, 'wrangler.toml');
  writeFileSync(tomlPath, toml);
  console.log(`\n✓ wrangler.toml created`);

  // Set LLM_API_KEY
  console.log('\n📝 Now set your LLM API key:');
  const apiKey = await ask('LLM_API_KEY (your provider API key): ');
  if (apiKey) {
    try {
      execSync(`npx wrangler secret put LLM_API_KEY`, {
        input: apiKey + '\n',
        stdio: ['pipe', 'inherit', 'inherit'],
        cwd: PKG_ROOT,
      });
      console.log('✓ LLM_API_KEY set');
    } catch {
      console.log('⚠ Could not set LLM_API_KEY. Run: npx wrangler secret put LLM_API_KEY');
    }
  }

  console.log('\n✅ Setup complete! Run: npx welian-cloud deploy\n');
}

function runDeploy() {
  console.log('Deploying Welian Cloud Worker...\n');
  try {
    execSync('npx wrangler deploy', { stdio: 'inherit', cwd: PKG_ROOT });
  } catch {
    console.error('\n❌ Deploy failed. Make sure you have wrangler configured.');
    console.error('   Run: npx wrangler login');
    process.exit(1);
  }
}

function runDev() {
  console.log('Starting Welian Cloud Worker locally...\n');
  try {
    execSync('npx wrangler dev', { stdio: 'inherit', cwd: PKG_ROOT });
  } catch {
    process.exit(1);
  }
}

function runSecret(action, name) {
  if (action === 'list') {
    execSync('npx wrangler secret list', { stdio: 'inherit', cwd: PKG_ROOT });
    return;
  }
  if (action === 'set' && name) {
    execSync(`npx wrangler secret put ${name}`, { stdio: 'inherit', cwd: PKG_ROOT });
    return;
  }
  if (action === 'set') {
    // Interactive: ask which secret
    execSync('npx wrangler secret put', { stdio: 'inherit', cwd: PKG_ROOT });
    return;
  }
  console.log('Usage: npx welian-cloud secret set [SECRET_NAME]');
  console.log('       npx welian-cloud secret list');
}

// Main
switch (cmd) {
  case 'deploy': runDeploy(); break;
  case 'dev': runDev(); break;
  case 'init': runInit(); break;
  case 'secret':
    runSecret(process.argv[3], process.argv[4]);
    break;
  case 'help':
  case '--help':
  case '-h':
  default:
    console.log(HELP);
}
