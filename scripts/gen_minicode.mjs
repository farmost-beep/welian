#!/usr/bin/env node
/**
 * 生成微信小程序码（圆形码）
 *
 * 用法：
 *   node scripts/gen_minicode.mjs --secret=你的AppSecret
 *   node scripts/gen_minicode.mjs --secret=你的AppSecret --page=pages/welcome/welcome
 *   node scripts/gen_minicode.mjs --secret=你的AppSecret --page=pages/welcome/welcome --scene=welcome --width=430
 *
 * AppSecret 获取：微信公众平台 → 开发管理 → 开发设置 → AppSecret
 * 小程序必须已发布正式版，否则接口报错。
 */

import { writeFileSync } from 'fs';

const APPID = 'wxe1ea479f0d75280c';

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  })
);

const secret = args.secret;
if (!secret) {
  console.error('用法: node scripts/gen_minicode.mjs --secret=你的AppSecret [--page=...] [--scene=...] [--width=430]');
  console.error('AppSecret 在微信公众平台 → 开发管理 → 开发设置 获取');
  process.exit(1);
}

const page = args.page || 'pages/welcome/welcome';
const scene = args.scene || '';
const width = parseInt(args.width || '430', 10);

async function main() {
  // 1. 获取 access_token
  console.log('获取 access_token...');
  const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${secret}`;
  const tokenResp = await fetch(tokenUrl);
  const tokenData = await tokenResp.json();

  if (tokenData.errcode) {
    console.error('获取 access_token 失败:', tokenData.errmsg);
    process.exit(1);
  }

  const accessToken = tokenData.access_token;
  console.log('access_token 获取成功');

  // 2. 生成小程序码
  console.log(`生成小程序码 (page=${page}, scene=${scene || '(空)'}, width=${width})...`);
  const codeUrl = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`;
  const codeResp = await fetch(codeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scene: scene || 'default',
      page,
      width,
      check_path: true,
      env_version: 'release',
    }),
  });

  const contentType = codeResp.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const errData = await codeResp.json();
    console.error('生成小程序码失败:', errData.errcode, errData.errmsg);
    process.exit(1);
  }

  // 3. 保存图片
  const buffer = Buffer.from(await codeResp.arrayBuffer());
  const filename = `minicode_${Date.now()}.png`;
  writeFileSync(filename, buffer);
  console.log(`小程序码已保存: ${filename} (${buffer.length} bytes)`);
}

main().catch(err => {
  console.error('错误:', err.message);
  process.exit(1);
});
