---
title: Welian 小程序获客引流规约
version: 1.0.0
updated: 2026-07-22
status: 设计完成，待实现
predecessor: docs/SPEC_WELIAN.md v1.1.0 §4.3（获客-激活-留存漏斗）
scope: 微信小程序（miniprogram/）+ cloud-worker 后端
---

# Welian 小程序获客引流规约

> **本规约定义 Welian 小程序的获客、裂变、引流机制设计。**
> 核心逻辑：用户用 Welian 管关系 → 产出有价值的内容（周报/建议/信号）→
> 分享到朋友圈/群 → 朋友看到 → 扫码注册 → 新用户产出内容再分享。
> 不是硬推广告，是让产品本身的价值成为传播载体。

> **设计原则**：
> 1. 每次使用都是一次曝光——分享卡片展示数据，不是空壳品牌
> 2. 给分享一个理由——联点激励让分享有 tangible benefit
> 3. 内容即广告——周报/信号/文章自带 Welian 水印，自然传播
> 4. 沉默用户拉回——订阅消息 + 周报推送，不靠 push notification 轰炸
> 5. 零成本为主——利用微信生态原生能力（分享/小程序码/订阅消息），不依赖付费投放

---

## §1. 现状分析

### 1.1 已有能力

| 能力 | 现状 | 位置 |
|:----|:----|:----|
| 小程序注册 | 一键注册（openid → Clerk 账号） | `wxmp_register` |
| 对话 | Live（agent）+ Cloud（LLM）双模式 | `chat.js` |
| 周报/月报 | 已有页面，纯文字展示 | `weekly/`, `monthly/` |
| 文章 | 信号文章 rich-text 渲染 | `article/` |
| 信号 | 行业信号列表 | `signals/` |
| 计费 | 联点体系（月度额度 + 加油包） | `billing/` |
| Dashboard | 关系概览 + AI 建议 | `dashboard/` |

### 1.2 缺失能力

| 缺失 | 影响 |
|:----|:----|
| 分享配置 | 除 chat 外无 `onShareAppMessage`，分享卡片无吸引力 |
| 小程序码 | 无专属码，无法追踪邀请来源 |
| 邀请激励 | 无奖励机制，用户没有分享动力 |
| 内容分享 | 周报/信号无法导出为图片分享朋友圈 |
| 订阅消息 | 无拉回机制，沉默用户自然流失 |
| 公众号联动 | 小程序与公众号无互通入口 |

---

## §2. 模块设计

### 2.1 分享优化（P0）

**目标**：让每个关键页面都可分享，分享卡片数据驱动、有吸引力。

#### 2.1.1 分享卡片设计

每个页面的分享卡片包含三要素：**数据摘要 + 行动引导 + 小程序标识**。

| 页面 | 分享标题模板 | 分享路径 | 说明 |
|:----|:----|:----|:----|
| Dashboard | "我管理了 {N} 个关系，本周联系了 {M} 人" | `/pages/dashboard/dashboard` | 数据驱动，展示产品价值 |
| Chat | "我在用小维管理关系网络，试试看" | `/pages/chat/chat` | 展示 AI 能力 |
| Weekly | "我的本周关系周报：联系了 {N} 人，{M} 条待办" | `/pages/weekly/weekly` | 周报作为传播载体 |
| Contacts | "我正在用心经营 {N} 段关系" | `/pages/contacts/contacts` | 关系数量即社交资本 |
| Article | "{文章标题}" | `/pages/article/article?id={id}` | 内容自带传播力 |
| Signals | "Welian 发现：{信号标题}" | `/pages/signals/signals` | 行业信号吸引商务人群 |

#### 2.1.2 朋友圈分享

每个页面同时配置 `onShareAppMessage`（转发好友/群）和 `onShareTimeline`（分享朋友圈）。

朋友圈分享标题限制 30 字，用精简版：
- "我管理了 47 个关系，本周联系了 5 人"
- "我的本周关系周报已生成"
- "Welian — 每段关系都值得用心"

#### 2.1.3 技术实现

```javascript
// 每个页面 Page() 中添加：
onShareAppMessage() {
  const contactsCount = this.data.contactsCount || 0;
  const weekCount = this.data.weekCount || 0;
  return {
    title: `我管理了 ${contactsCount} 个关系，本周联系了 ${weekCount} 人`,
    path: '/pages/dashboard/dashboard?ref=share',
    imageUrl: '', // 可选：自定义分享图片
  };
},
onShareTimeline() {
  return {
    title: '我管理了 ' + (this.data.contactsCount || 0) + ' 个关系',
    query: 'ref=timeline',
  };
},
```

**改动范围**：
- `miniprogram/pages/dashboard/dashboard.js` — 加 share + 数据统计
- `miniprogram/pages/weekly/weekly.js` — 加 share
- `miniprogram/pages/contacts/contacts.js` — 加 share
- `miniprogram/pages/article/article.js` — 加 share（已有，优化标题）
- `miniprogram/pages/signals/signals.js` — 加 share
- `miniprogram/pages/chat/chat.js` — 优化现有 share 标题

---

### 2.2 邀请奖励（P0）

**目标**：联点激励让用户主动分享，双向奖励降低被邀请人的心理门槛。

#### 2.2.1 奖励规则

| 事件 | 邀请人奖励 | 被邀请人奖励 | 说明 |
|:----|:----|:----|:----|
| 被邀请人注册 | 50 联点 | 50 联点 | 双向激励，降低接受门槛 |
| 被邀请人完成 onboarding | 50 联点 | 0 | 鼓励邀请人引导新用户激活 |
| 月度邀请 Top 3 | 额外 200 联点 | — | 排行榜激励（Phase 2） |

**防刷机制**：
- 每个用户每月最多奖励 10 次邀请（超出不再奖励但继续记录）
- 被邀请人必须是新 Clerk 账号（openid 未注册过）
- 联点奖励 24 小时内到账，期间可撤销（防批量注册刷联点）

#### 2.2.2 数据模型

```json
// KV key: referrals:{userId}
{
  "referrals": [
    {
      "invitee_id": "user_abc123",
      "invitee_name": "张三",
      "status": "registered",       // registered | onboarded | revoked
      "registered_at": "2026-07-22T10:00:00Z",
      "onboarded_at": null,
      "rewarded_register": false,   // 注册奖励是否已发放
      "rewarded_onboard": false     // onboarding 奖励是否已发放
    }
  ],
  "total_invited": 3,
  "total_rewarded": 2,
  "credits_earned": 200,
  "month_count": { "2026-07": 3 }  // 按月计数，防刷
}
```

```json
// 注册时写入 wechat_bind:{wxmp_openid}
{
  "clerkUserId": "user_abc123",
  "referred_by": "user_xyz789",    // 邀请人 userId
  "registered_at": "2026-07-22T10:00:00Z"
}
```

#### 2.2.3 用户界面

**"我的"页面新增邀请入口**：
- 卡片标题："邀请好友，各得 50 联点"
- 副标题："已邀请 {N} 人，获得 {M} 联点"
- 点击 → 邀请页面

**邀请页面**（新建 `pages/invite/invite`）：
- 顶部：专属小程序码（带 ref 参数）
- 中部：邀请记录列表（头像 + 状态 + 奖励联点数）
- 底部：分享按钮（转发好友/群 + 朋友圈）
- 规则说明：奖励规则 + 防刷说明

#### 2.2.4 技术实现

**后端新增端点**：

| 端点 | 方法 | 说明 |
|:----|:----|:----|
| `/ai/wxmp_qrcode` | POST | 生成带 ref 参数的小程序码（调 `wx.getUnlimited`） |
| `/ai/wxmp_referrals` | GET | 获取邀请记录和统计 |
| `/ai/wxmp_register` | POST（修改） | 注册时检查 ref 参数，创建 referral 记录，发放双方联点 |
| `/ai/extract_intent` | POST（修改） | onboarding 完成时触发 onboarding 奖励 |

**联点发放**：复用现有 `addCredits(env, userId, amount, reason)` 函数。

**小程序码生成**：
```
POST /ai/wxmp_qrcode
Body: { }
Response: { qrcode_url: "https://...", scene: "ref=user_xyz789" }
```
后端调微信 `wxacode.getunlimited` API，scene 参数为 `ref={userId}`。
小程序码图片存入 KV（7 天 TTL）或直接返回 base64。

**注册时 ref 追踪**：
```
小程序启动 → 检查 query.ref → 存入本地 storage
注册时 → wxmp_register 带 ref 参数 → 后端记录 referred_by → 创建 referral → 双方加联点
```

---

### 2.3 小程序码获客（P1）

**目标**：每个用户有专属小程序码，可印名片/发朋友圈/发群。

#### 2.3.1 场景

| 场景 | 使用方式 |
|:----|:----|
| 线下社交 | 名片背面印小程序码，对方扫码注册 |
| 朋友圈 | 分享小程序码图片 + 文案 |
| 微信群 | 群里发小程序码 + "我用了觉得不错" |
| 公众号文章 | 文末放小程序码 |

#### 2.3.2 技术实现

- 邀请页面展示小程序码（从 `/ai/wxmp_qrcode` 获取）
- 用户可保存到相册（`wx.saveImageToPhotosAlbum`）
- 小程序码带 `scene=ref={userId}` 参数
- 冷启动场景：用户扫码 → 进入 welcome 页 → 注册时自动带上 ref

**小程序码缓存**：
- 生成后存入 KV（key: `qrcode:{userId}`，TTL 30 天）
- 30 天后重新生成（微信小程序码永久有效，但缓存减少 API 调用）

---

### 2.4 内容引流（P1）

**目标**：周报/信号/文章作为传播载体，用户分享到朋友圈带来新用户。

#### 2.4.1 周报图片分享

**设计**：
- Weekly 页面加"分享到朋友圈"按钮
- 点击后用 canvas 绘制周报摘要卡片：
  - 顶部：Welian logo + "关系周报"
  - 中部：本周数据（联系人数/互动次数/待办数）
  - 底部：小程序码 + "扫码用 Welian 管好你的关系"
- `wx.canvasToTempFilePath` 生成图片
- `wx.saveImageToPhotosAlbum` 保存到相册
- 用户手动发朋友圈（不自动发，遵守"用心不可自动化"原则）

**canvas 卡片设计**：
```
┌─────────────────────────┐
│  🌱 Welian · 关系周报    │
│                         │
│  本周联系 5 人           │
│  记录互动 8 次           │
│  完成待办 3 件           │
│  本周建议关注：老许       │
│                         │
│  [小程序码]  扫码体验     │
└─────────────────────────┘
```

#### 2.4.2 文章底部 CTA

**设计**：
- Article 页面底部固定区域：
  - "用 Welian 管好你的关系网络"
  - 小程序码（用户自己的 ref 码）
  - "扫码免费使用"按钮

#### 2.4.3 信号卡片分享

**设计**：
- Signals 页面每条信号加分享按钮
- 分享卡片：信号标题 + "Welian 发现" 水印
- 点击进入小程序看完整信号

#### 2.4.4 技术实现

| 功能 | 技术 |
|:----|:----|
| 周报图片 | canvas 2D API + `canvasToTempFilePath` + `saveImageToPhotosAlbum` |
| 文章 CTA | wxml 固定定位区域 + 小程序码图片 |
| 信号分享 | `onShareAppMessage` 动态标题 |

**canvas 绘制函数**（新建 `utils/share-card.js`）：
```javascript
function drawWeeklyCard(canvas, ctx, data) {
  // data: { contactsCount, interactionCount, todoCount, suggestName, qrcodePath }
  // 绘制 750x1200 的卡片图片
}
```

---

### 2.5 订阅消息（P2）

**目标**：拉回沉默用户，让用户养成打开习惯。

#### 2.5.1 订阅类型

| 类型 | 触发条件 | 频率 | 模板内容 |
|:----|:----|:----|:----|
| 每日建议 | 每天早上 8:00 | 每天 1 条 | "小维建议今天联系 {name}，上次聊到 {topic}" |
| 周报推送 | 每周一 9:00 | 每周 1 条 | "你的本周关系周报已生成，本周建议关注 {N} 人" |
| 信号推送 | 有新信号时 | 不定期 | "你关注的行业有新信号：{title}" |

#### 2.5.2 订阅流程

1. **注册时引导**：注册成功后弹窗"开启小维提醒，不错过重要关系时刻"
2. **用户授权**：`wx.requestSubscribeMessage` 申请 3 个模板权限
3. **管理入口**："我的"页面可随时开关每种订阅
4. **后端推送**：Worker cron trigger 已有定时任务，加推送逻辑

#### 2.5.3 技术实现

**模板消息申请**：
- 在微信公众平台创建 3 个订阅消息模板
- 获取 template_id

**前端授权**：
```javascript
wx.requestSubscribeMessage({
  tmplIds: ['daily_advice_id', 'weekly_report_id', 'signal_push_id'],
  success(res) {
    // res.{template_id} = 'accept' | 'reject' | 'ban'
    // 存入后端
  }
});
```

**后端推送**：
```
KV key: subscriptions:{userId}
{ "daily_advice": true, "weekly_report": true, "signal_push": false }
```

Worker cron trigger 调 `subscribeMessage.send` API：
```javascript
// 每日 8:00 (cron: 0 0 * * *)
for (const user of subscribedUsers) {
  const advise = await getDailyAdvise(env, user.id);
  await sendSubscribeMessage(env, user.openid, 'daily_advice_id', {
    thing1: { value: advise.contactName },
    thing2: { value: advise.topic },
  });
}
```

**注意**：微信订阅消息每次发送消耗一次订阅权限，用户授权一次只能发一条。需要设计"持续订阅"引导——每次用户打开小程序时静默续订。

---

### 2.6 公众号联动（P2）

**目标**：公众号内容漏斗引导到小程序，小程序引导关注公众号。

#### 2.6.1 公众号 → 小程序

| 入口 | 实现 |
|:----|:----|
| 文章底部小程序卡片 | 公众号图文编辑器插入 `<mp-miniprogram-card>` |
| 公众号菜单 | 菜单链接到小程序指定页面 |
| 自动回复 | 关注后自动回复引导语 + 小程序链接 |

#### 2.6.2 小程序 → 公众号

| 入口 | 实现 |
|:----|:----|
| "我的"页面关注组件 | `<official-account>` 组件（需在小程序后台配置关联） |
| 文章页底部关注引导 | 文字 + 公众号二维码图片 |

#### 2.6.3 技术实现

- 公众号侧配置在 mp.weixin.qq.com 后台（不在代码中）
- 小程序侧加 `<official-account>` 组件（需公众号与小程序同主体或已关联）
- 小程序后台「设置 → 关联设置」关联公众号

---

## §3. 数据追踪

### 3.1 来源追踪

注册时记录用户来源，用于评估各渠道效果。

| 来源标识 | 含义 | 追踪方式 |
|:----|:----|:----|
| `share` | 转发卡片进入 | `query.ref = 'share'` |
| `timeline` | 朋友圈分享进入 | `query.ref = 'timeline'` |
| `qrcode` | 小程序码进入 | `scene = 'ref={userId}'` |
| `article` | 文章页进入 | `query.ref = 'article'` |
| `official` | 公众号进入 | `query.ref = 'official'` |
| `direct` | 直接打开 | 无 ref 参数 |

### 3.2 漏斗指标

| 漏斗环节 | 指标 | 目标 |
|:----|:----|:----|
| 曝光 | 分享卡片点击率 | >5% |
| 注册 | 扫码/点击 → 注册转化率 | >30% |
| 激活 | 注册 → 7 天内添加 ≥3 联系人 | >40% |
| 邀请 | 注册 → 首次邀请好友 | >20% |
| 留存 | D7 留存 | >40% |
| 留存 | D30 留存 | >20% |

### 3.3 后端数据端点

| 端点 | 方法 | 说明 |
|:----|:----|:----|
| `/ai/wxmp_growth_stats` | GET | 获取增长统计（来源分布/漏斗/邀请数） |
| `/ai/wxmp_referrals` | GET | 获取邀请记录 |
| `/ai/wxmp_qrcode` | POST | 生成小程序码 |
| `/ai/wxmp_subscribe` | POST | 更新订阅消息偏好 |

---

## §4. 页面改动清单

### 4.1 新增页面

| 页面 | 路径 | 说明 |
|:----|:----|:----|
| 邀请页 | `pages/invite/invite` | 小程序码 + 邀请记录 + 分享按钮 |

### 4.2 改动页面

| 页面 | 改动内容 |
|:----|:----|
| `dashboard/dashboard` | 加 `onShareAppMessage` + `onShareTimeline` + 数据统计 |
| `chat/chat` | 优化分享标题（数据驱动） |
| `weekly/weekly` | 加分享 + canvas 图片导出 |
| `contacts/contacts` | 加分享 |
| `article/article` | 底部 CTA + 分享优化 |
| `signals/signals` | 加分享 |
| `mine/mine` | 加邀请入口 + 订阅管理入口 + 公众号关注组件 |
| `welcome/welcome` | 注册时检查 ref 参数并记录 |

### 4.3 新增工具函数

| 文件 | 函数 | 说明 |
|:----|:----|:----|
| `utils/share-card.js` | `drawWeeklyCard()` | canvas 绘制周报分享卡片 |
| `utils/share-card.js` | `drawSignalCard()` | canvas 绘制信号分享卡片 |
| `utils/ref.js` | `getRef()` | 获取来源 ref 参数 |
| `utils/ref.js` | `saveRef()` | 保存 ref 到 storage |

---

## §5. 后端改动清单

### 5.1 新增端点

| 端点 | 方法 | 说明 |
|:----|:----|:----|
| `/ai/wxmp_qrcode` | POST | 生成带 ref 的小程序码 |
| `/ai/wxmp_referrals` | GET | 获取邀请记录和统计 |
| `/ai/wxmp_growth_stats` | GET | 获取增长统计（管理端） |
| `/ai/wxmp_subscribe` | POST | 更新订阅消息偏好 |

### 5.2 修改端点

| 端点 | 改动 |
|:----|:----|
| `/ai/wxmp_register` | 接收 `ref` 参数，记录 `referred_by`，创建 referral，发放双方联点 |
| `/ai/extract_intent` | onboarding 完成时触发 onboarding 奖励 |

### 5.3 新增 KV 数据

| Key 格式 | TTL | 说明 |
|:----|:----|:----|
| `referrals:{userId}` | 永久 | 邀请记录 |
| `qrcode:{userId}` | 30 天 | 小程序码缓存 |
| `subscriptions:{userId}` | 永久 | 订阅消息偏好 |
| `growth_stats:{YYYY-MM}` | 90 天 | 月度增长统计 |

### 5.4 新增 Cron Trigger

| Cron | 说明 |
|:----|:----|
| `0 0 * * *` | 每日 8:00（UTC 0 = 北京 8:00）推送每日建议 |
| `0 1 * * 1` | 每周一 9:00 推送周报生成通知 |

---

## §6. 实现优先级

| 优先级 | 模块 | 工作量 | 预期效果 | 依赖 |
|:----|:----|:----|:----|:----|
| **P0** | 分享优化 | 小（2h） | 每次分享都是一次曝光 | 无 |
| **P0** | 邀请奖励 | 中（4h） | 给分享一个理由 | 联点体系（已有） |
| **P1** | 小程序码 | 小（2h） | 线下场景 + 朋友圈 | 邀请奖励 |
| **P1** | 内容引流 | 中（4h） | 朋友圈传播载体 | canvas API |
| **P2** | 订阅消息 | 中（4h） | 拉回沉默用户 | 模板消息审批 |
| **P2** | 公众号联动 | 小（1h） | 内容漏斗 | 公众号关联配置 |

**总计**：约 17 小时开发量。

---

## §7. 不做什么

1. **不做自动发朋友圈**——用户手动分享，用心不可自动化（SPEC_WELIAN §11.7）
2. **不做强制分享解锁功能**——分享是自然行为不是付费墙
3. **不做多级分销**——只奖励一级邀请，不做传销式裂变
4. **不做邀请排行榜公开曝光**——隐私优先，只显示自己的邀请数
5. **不做付费投放**（当前阶段）——先验证免费裂变模型
6. **不做红包/现金奖励**——联点是产品内货币，不涉及真实金钱
7. **不做批量导入通讯录邀请**——合规红线，不碰用户通讯录

---

## §8. 风险与对策

| 风险 | 对策 |
|:----|:----|
| 微信审核拒绝小程序码带 ref 参数 | scene 参数只支持 32 字符，用短 ID 而非完整 userId |
| 订阅消息被用户频繁关闭 | 每次打开小程序时静默引导续订，不强制弹窗 |
| 联点奖励被刷（批量注册） | 每月最多 10 次奖励 + 新账号需完成 onboarding 才发第二段奖励 |
| 分享卡片点击率低 | A/B 测试不同标题模板，数据驱动优化 |
| 周报图片 canvas 渲染慢 | 预渲染 + 缓存，首次生成后存入本地 storage |

---

**最后更新**：2026-07-22
**版本**：v1.0.0
**状态**：设计完成，待实现
**前置依赖**：小程序基础功能（对话/周报/信号/联系人）已完成
**下一步**：按 P0 → P1 → P2 顺序实现
