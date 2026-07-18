#!/usr/bin/env node
/**
 * Paddle Product Setup Script
 *
 * Creates 4 products + prices in Paddle (sandbox or production) via API.
 * Outputs the price IDs needed for wrangler secrets.
 *
 * Usage:
 *   node paddle_setup.js                    # Interactive: prompts for API key
 *   PADDLE_API_KEY=xxx node paddle_setup.js # Non-interactive
 *   PADDLE_ENV=production node paddle_setup.js  # Target production
 *
 * Prerequisites:
 *   - Paddle account (sandbox or production)
 *   - API key from Paddle dashboard → Developer Tools → Authentication
 */

const https = require('https');
const readline = require('readline');

const ENV = process.env.PADDLE_ENV || 'sandbox';
const API_BASE = ENV === 'production'
  ? 'https://api.paddle.com'
  : 'https://sandbox-api.paddle.com';

const PRODUCTS = [
  {
    key: 'pro_monthly',
    name: 'Welian Pro Monthly',
    description: '500 credits/month, enhanced model access, reduced premium multiplier',
    type: 'subscription',
    price: 4.99,
    interval: 'month',
    env_var: 'PADDLE_PRICE_PRO_MONTHLY',
  },
  {
    key: 'pro_yearly',
    name: 'Welian Pro Yearly',
    description: '500 credits/month, enhanced model access, 17% discount vs monthly',
    type: 'subscription',
    price: 49,
    interval: 'year',
    env_var: 'PADDLE_PRICE_PRO_YEARLY',
  },
  {
    key: 'credits_100',
    name: 'Welian Credits 100',
    description: '100 one-time credits, never expire',
    type: 'one-time',
    price: 1.99,
    interval: null,
    env_var: 'PADDLE_PRICE_CREDITS_100',
  },
  {
    key: 'credits_500',
    name: 'Welian Credits 500',
    description: '500 one-time credits, never expire, 20% discount vs 100-pack',
    type: 'one-time',
    price: 7.99,
    interval: null,
    env_var: 'PADDLE_PRICE_CREDITS_500',
  },
];

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function paddleRequest(path, method, apiKey, body) {
  const url = `${API_BASE}${path}`;
  const data = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };
    if (data) {
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = https.request(options, (res) => {
      let chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          const json = JSON.parse(raw);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: raw });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function createProduct(apiKey, product) {
  // Step 1: Create product
  console.log(`\n📦 Creating product: ${product.name}`);
  const productResp = await paddleRequest('/products', 'POST', apiKey, {
    name: product.name,
    description: product.description,
    tax_category: 'saas',
    type: product.type === 'subscription' ? 'subscription' : 'standard',
  });

  if (productResp.status !== 200 && productResp.status !== 201) {
    console.error(`  ❌ Product creation failed: ${JSON.stringify(productResp.data)}`);
    return null;
  }

  const productId = productResp.data.data.id;
  console.log(`  ✓ Product ID: ${productId}`);

  // Step 2: Create price
  console.log(`  💰 Creating price: $${product.price}${product.interval ? '/' + product.interval : ''}`);
  const priceBody = {
    product_id: productId,
    description: product.name,
    unit_price: {
      amount: (product.price * 100).toFixed(0).toString(),
      currency_code: 'USD',
    },
    quantity: {
      minimum: 1,
      maximum: 1,
    },
  };

  if (product.type === 'subscription' && product.interval) {
    priceBody.type = 'recurring';
    priceBody.recurring = {
      interval: product.interval,
      frequency: 1,
      trial_period: null,
    };
  } else {
    priceBody.type = 'standard';
  }

  const priceResp = await paddleRequest('/prices', 'POST', apiKey, priceBody);

  if (priceResp.status !== 200 && priceResp.status !== 201) {
    console.error(`  ❌ Price creation failed: ${JSON.stringify(priceResp.data)}`);
    return null;
  }

  const priceId = priceResp.data.data.id;
  console.log(`  ✓ Price ID: ${priceId}`);

  return { productId, priceId, ...product };
}

async function listExistingProducts(apiKey) {
  const resp = await paddleRequest('/products?per_page=100', 'GET', apiKey);
  if (resp.status === 200 && resp.data?.data) {
    return resp.data.data.filter(p => p.name?.startsWith('Welian'));
  }
  return [];
}

async function main() {
  console.log(`\n🚀 Paddle Product Setup — ${ENV.toUpperCase()} environment`);
  console.log(`   API: ${API_BASE}\n`);

  let apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) {
    apiKey = await ask(`Enter your Paddle ${ENV} API key (paddle_...): `);
  }
  if (!apiKey || !apiKey.startsWith('paddle_')) {
    console.error('❌ Invalid API key. Must start with "paddle_"');
    process.exit(1);
  }

  // Check for existing products
  console.log('\n🔍 Checking for existing Welian products...');
  const existing = await listExistingProducts(apiKey);
  if (existing.length > 0) {
    console.log(`   Found ${existing.length} existing Welian product(s):`);
    for (const p of existing) {
      console.log(`   - ${p.name} (ID: ${p.id})`);
    }
    const recreate = await ask('\nRecreate products? This will create duplicates. (y/N): ');
    if (recreate.toLowerCase() !== 'y') {
      console.log('\nℹ️  Skipping product creation. Use existing price IDs from Paddle dashboard.');
      console.log('   Set them via: wrangler secret put <ENV_VAR>');
      process.exit(0);
    }
  }

  // Create products
  const results = [];
  for (const product of PRODUCTS) {
    const result = await createProduct(apiKey, product);
    if (result) results.push(result);
  }

  if (results.length === 0) {
    console.error('\n❌ No products were created. Check your API key and try again.');
    process.exit(1);
  }

  // Output results
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('✅ Product setup complete!');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Set these wrangler secrets:\n');
  for (const r of results) {
    console.log(`  wrangler secret put ${r.env_var}`);
    console.log(`  # Value: ${r.priceId}\n`);
  }

  console.log('Also set:');
  console.log(`  wrangler secret put PADDLE_API_KEY`);
  console.log(`  # Value: ${apiKey}\n`);
  console.log(`  wrangler secret put PADDLE_WEBHOOK_SECRET`);
  console.log(`  # Get from: Paddle dashboard → Developer Tools → Webhooks\n`);

  // Write results to file for the deploy script
  const fs = require('fs');
  const outputPath = '/tmp/paddle_price_ids.json';
  const output = {};
  for (const r of results) {
    output[r.env_var] = r.priceId;
  }
  output.PADDLE_API_KEY = apiKey;
  output.PADDLE_ENVIRONMENT = ENV;
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n📄 Price IDs saved to: ${outputPath}`);
  console.log('   Use with deploy script: ./deploy_paddle.sh');
}

main().catch(err => {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
});
