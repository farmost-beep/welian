// config.js — 微信开发者工具自动化测试配置
module.exports = {
  // 微信开发者工具 CLI 路径（macOS）
  cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  // 小程序项目路径
  projectPath: '/Users/cyingfang/devin/projects/welian/miniprogram',
  // 测试账号（如果需要登录态，填测试微信号；留空则用当前开发者工具登录的账号）
  testAccount: '',
  // 超时设置（ms）
  timeout: 60000,
  // 是否截图（失败时自动截图到 screenshots/）
  screenshotOnFail: true,
};
