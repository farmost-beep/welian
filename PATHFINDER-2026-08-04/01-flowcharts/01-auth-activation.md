# 身份与激活

## 主路径

```mermaid
flowchart TD
  A[小程序启动<br/>miniprogram/app.js:92-99] --> B[_autoLogin<br/>miniprogram/app.js:226-251]
  B --> C[api.login 获取 code<br/>miniprogram/utils/api.js:24-74]
  C --> D[POST wxmp_login<br/>cloud-worker/src/worker.js:9368-9463]
  D --> E[绑定或自动注册用户<br/>cloud-worker/src/worker.js:3845-3892]
  E --> F[保存 token<br/>miniprogram/utils/api.js:49-57]
  F --> G[进入 dashboard<br/>miniprogram/app.js:239-245]
  D -->|失败| H[welcome 降级页<br/>miniprogram/pages/welcome/welcome.js:27-45]
  H -->|重试| C
  H -->|跳过| I[reLaunch dashboard<br/>miniprogram/pages/welcome/welcome.js:63-66]
  G --> J{联系人为空且未完成激活?}
  I --> J
  J -->|是| K[onboarding<br/>miniprogram/pages/dashboard/dashboard.js:120-127]
  K --> L[添加联系人<br/>miniprogram/pages/onboarding/onboarding.js:44-79]
  L --> M[提交批量联系人<br/>miniprogram/pages/onboarding/onboarding.js:83-115]
  M --> N[创建联系人+首条建议+埋点<br/>cloud-worker/src/worker.js:13411-13495]
  N --> O[显示 first_advise<br/>miniprogram/pages/onboarding/onboarding.wxml:95-105]
  O --> G
  J -->|否| P[进入可用 dashboard]
```

## Side effects / external dependencies

- WeChat `wx.login`、微信 jscode2session、Clerk/KV 绑定和用户自动注册。
- onboarding 写入 `contacts:${userId}`，调用 LLM 生成首次建议，写入 metrics，并可能触发邀请奖励/欢迎邮件。
- 登录失败、跳过登录和 onboarding 返回都依赖前端状态/本地 storage，存在回跳和状态持久化耦合。

## 依赖

- 依赖关系数据内核（contacts）。
- 依赖建议和 metrics（首条建议、activation 统计）。
