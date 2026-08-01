# Welian 微信生态进化方案

> 版本：v1.0 | 日期：2026-07-22
> 基于微信小程序能力盘点 + Welian 当前功能基线

## 一、现状基线

### 已用微信能力

| 能力 | API | 使用场景 |
|------|-----|---------|
| 静默登录 | wx.login | openid 换 token |
| 拍照/相册 | wx.chooseMedia | 名片扫描、会议拍照 |
| 通讯录导入 | wx.chooseContact | 逐个选联系人导入 |
| 文件选择 | wx.chooseMessageFile | XLSX/CSV 导入 |
| 微信支付 | wx.requestPayment | 充值、套餐升级 |
| WebSocket | wx.connectSocket | AI 对话流式输出 |
| 剪贴板 | wx.setClipboardData | 复制消息草稿 |

### 未用但可用的关键能力

| 能力 | API | 价值 |
|------|-----|------|
| **订阅消息** | wx.requestSubscribeMessage | **唯一主动触达通道** |
| 朋友圈分享 | onShareTimeline | 免费裂变 |
| 用户头像昵称 | wx.getUserProfile | 个性化体验 |
| 系统日历 | wx.addPhoneCalendar | 不依赖小程序的提醒 |
| 扫码 | wx.scanCode | 名片/签到/企业微信 |
| 地图导航 | wx.openLocation | 会议路线 |
| 定位 | wx.getLocation | 附近人脉 |
| 语音录制 | wx.getRecorderManager | 语音记互动 |
| 开放数据 | open-data 组件 | 好友也在用 |
| 客服消息 | button open-type=contact | 用户反馈通道 |
| 小程序码 | wxacode.getUnlimited | 邀请裂变 |

### 现有提醒机制（均需用户打开小程序才能看到）

- Dashboard 冷却预警（>14 天未联系的经营型联系人）
- Dashboard 生日提醒（≤30 天的家人重要日期）
- 待办到期状态（overdue/urgent/soon）
- 健康预警推送（双周，仅推送到微信 bot/IM，不推送到小程序）

**核心问题：用户不打开小程序 = 感知不到任何价值。**

---

## 二、四阶段进化路线

### Phase 1：触达补全（1-2 周）

> 解决"用户不知道该打开小程序"的问题

#### 1.1 订阅消息推送 ⭐ 最高优先级

**目标**：5 个核心场景的主动触达

| 场景 | 触发时机 | 模板内容示例 |
|------|---------|-------------|
| 待办到期 | due_date 前 1 天 | 「你有一个待办即将到期：联系张总讨论供应链合作」 |
| 关系冷却 | 冷却天数 > 阈值时 | 「与李明上次互动已超过 30 天，该联系了」 |
| 重要日期 | 生日/纪念日前 3 天 | 「王芳的生日还有 3 天，别忘了说声生日快乐」 |
| 周报就绪 | 每周日 20:00 | 「你的本周关系回顾已生成，本周联系了 5 人，2 人需要关注」 |
| 每日信号 | 每日 08:00 | 「今日 3 条科技商业信号，1 条可能与你的人脉相关」 |

**技术方案**：

```
前端（授权收集）：
  关键操作时调 wx.requestSubscribeMessage
  → 用户授权 1 次可收 1 条对应模板
  → 授权状态存 KV: subscribe:${userId}:${templateId} = {count, expireAt}

后端（定时触发）：
  Cloudflare Worker cron（已有 schedule）
  → 扫描待办/冷却/日期
  → 调微信 subscribeMessage.send API
  → 每发 1 条扣减 1 次授权额度
  → 额度不足时跳过，等用户下次授权

微信模板申请：
  → mp.weixin.qq.com → 订阅消息 → 我的模板
  → 5 个模板，每个需提交审核（1-3 天）
```

**授权收集策略**（不打扰用户）：

| 时机 | 请求授权的模板 |
|------|--------------|
| 添加待办时 | 待办到期 |
| 添加联系人时 | 关系冷却 + 重要日期 |
| 首次完成周报时 | 周报就绪 |
| 首次打开信号页时 | 每日信号 |
| 每次打开小程序时 | 补充已用完的模板授权 |

#### 1.2 朋友圈分享

```js
// 页面级 onShareTimeline（当前未实现）
onShareTimeline() {
  return {
    title: '我在用 Welian 经营关系网络 — 更用心，更好的朋友',
    query: 'from=timeline',
    image: '/assets/share-timeline.png', // 1:1 方图
  };
}
```

**分享场景**：
- 周报生成后 → 分享朋友圈 → 卡片含数据摘要
- 信号文章 → 分享朋友圈 → 内容预览
- 联系人详情 → 分享朋友圈 → "推荐你也用 Welian 管理人脉"

#### 1.3 用户头像昵称

```xml
<!-- welcome 页 -->
<button open-type="chooseAvatar" bindchooseavatar="onChooseAvatar">
  <image src="{{avatarUrl || '/assets/default-avatar.png'}}" />
</button>
<input type="nickname" bindinput="onNicknameInput" placeholder="点击获取昵称" />
```

**用途**：
- chat 页个性化问候："早上好，颖芳"
- 周报/月报中的个人标识
- 分享卡片中的用户身份
- 注册时传 nickname 给后端（当前传的是空字符串）

---

### Phase 2：场景融入（2-4 周）

> 让 Welian 融入微信日常使用习惯

#### 2.1 系统日历同步

```js
wx.addPhoneCalendar({
  title: '王芳生日',
  startTime: Date.parse('2026-08-15T09:00:00'),
  allDay: true,
  alarm: true,
  alarmOffset: -86400, // 提前 1 天
  description: '来自 Welian 提醒',
});
```

**场景**：
- 联系人重要日期 → 一键添加到手机日历
- 会议创建后 → 自动添加日历事件 + 导航地址
- 系统级提醒，不依赖小程序是否打开

#### 2.2 扫码能力

| 扫码类型 | 实现方式 | 价值 |
|---------|---------|------|
| 名片二维码 | wx.scanCode → 解析 vCard → 自动填充 | 比拍照 OCR 更准 |
| 企业微信二维码 | wx.scanCode → 解析 URI → 提取公司+姓名 | 展会快速收集 |
| 会议签到码 | wx.scanCode → 关联会议 ID → 标记到场 | 会议管理增强 |
| 个人小程序码 | 后端 wxacode.getUnlimited → 生成带参码 | 邀请裂变入口 |

#### 2.3 地图与位置

```js
// 会议导航
wx.openLocation({
  latitude: 31.2304,
  longitude: 121.4737,
  name: '邮储银行上海分行',
  address: '上海市黄浦区中山东二路15号',
});

// 附近人脉
wx.getLocation({
  success: (res) => {
    // 后端匹配联系人 city 字段
    api.getNearbyContacts(res.latitude, res.longitude);
  },
});
```

**场景**：
- 会议详情页 → "导航到会议地点"按钮
- Dashboard → "你附近有 3 位关系人"卡片
- 出差时 → 提醒目的地的关系人

#### 2.4 语音记录

```js
const recorder = wx.getRecorderManager();
recorder.onStop((res) => {
  // 上传语音 → 后端语音转文字 → AI 提取互动记录
  this.uploadVoiceForTranscript(res.tempFilePath);
});
```

**场景**：
- 聊天页长按 → 语音说"今天和张总吃了午饭，聊了供应链合作，下周要跟进报价"
- 后端语音转文字 → AI 提取 → 自动创建互动记录 + 待办
- 比打字快 5 倍，适合社交场景即时记录

---

### Phase 3：社交增长（1-2 月）

> 利用微信社交关系链实现用户增长

#### 3.1 邀请有礼机制

```
用户 A → 生成个人小程序码（携带 inviter=A 参数）
用户 B 扫码注册 → 后端记录 inviter 关系
B 完成首次互动记录 → A 获得 50 点额度
B 注册成功 → B 获得 100 点新用户额度
```

**技术**：
- 后端：`wxacode.getUnlimited` API 生成带参小程序码
- 前端：mine 页显示"邀请好友"入口 → 展示小程序码图片 → 保存到相册分享
- 后端：注册时解析 scene 参数 → 记录邀请关系 → 首次互动后发放奖励

#### 3.2 开放数据组件

```xml
<!-- welcome 页或 dashboard -->
<open-data type="userAvatarUrl"></open-data>
<open-data type="userNickName"></open-data>

<!-- 如果接入 unionid 体系 -->
<text>你的 {{friendCount}} 位微信好友也在用 Welian</text>
```

**价值**：社交证明，提升新用户注册转化率。

#### 3.3 朋友圈周报卡片

```
周报生成 → 渲染为精美图片（Canvas 2D）
→ wx.shareImageMessage 分享到朋友圈
→ 图片含小程序码 → 扫码进入
→ 卡片内容：本周联系了 X 人，Y 个待办完成，Z 人需要关注
```

#### 3.4 客服消息通道

```xml
<button open-type="contact" session-from="welian">
  联系客服
</button>
```

**用途**：
- 用户反馈/bug 上报
- 付费用户专属支持通道
- 后端通过客服消息 API 主动回复

---

### Phase 4：智能自动化（2-3 月）

> 从"用户记"进化到"AI 主动帮"

#### 4.1 AI 主动关联推送

```
Worker 每日分析：
  联系人 A 上次互动聊了"融资"
  + 信号库今天有"融资"相关新闻
  → 订阅消息：「关于你和张总上次聊的融资话题，今天有一条相关动态」
  → 用户点击 → 打开信号文章 → 底部 CTA「分享给张总」
```

#### 4.2 智能提醒时机

```
分析用户历史互动时间分布（从 timeline 数据）：
  → 用户通常晚上 21:00-22:00 联系人
  → 待办提醒不在早上推，晚上 20:30 推
  → 周报不在周一早上推，周日晚上推（用户规划下周时）
  → 信号不在凌晨推，用户通勤时间 08:30 推
```

#### 4.3 会议全流程智能联动

```
会议前 1 天：
  → 订阅消息：「明天和 XX 的会议，上次聊了 YY，建议跟进 ZZ」
  → wx.addPhoneCalendar 添加日历事件
  → wx.openLocation 预览路线

会议结束后：
  → 提醒上传笔记照片
  → AI 提取机会 + 跟进待办
  → 订阅消息：「会议提取了 2 个跟进事项，点击查看」
```

#### 4.4 关系健康度自动报告

```
每月 1 号：
  → AI 分析全部联系人互动频率/深度/趋势
  → 生成关系健康度报告（PDF）
  → 订阅消息通知
  → 朋友圈分享卡片
```

---

## 三、能力矩阵

| 能力 | 现状 | P1 | P2 | P3 | P4 |
|------|------|----|----|----|----|
| 主动触达 | ❌ | ✅ 订阅消息 | | | ✅ AI 智能推送 |
| 分享裂变 | 基础 | ✅ 朋友圈 | | ✅ 邀请有礼 | |
| 用户身份 | 仅 openid | ✅ 头像昵称 | | ✅ 开放数据 | |
| 日历提醒 | ❌ | | ✅ 系统日历 | | ✅ 智能时机 |
| 扫码 | ❌ | | ✅ 名片/签到 | ✅ 小程序码 | |
| 位置 | ❌ | | ✅ 会议导航 | | ✅ 附近人脉 |
| 语音 | ❌ | | ✅ 语音记录 | | |
| 内容分发 | 公众号 | | | ✅ 朋友圈卡片 | ✅ 视频号 |
| 客服 | ❌ | | | ✅ 客服消息 | |
| AI 主动性 | 被动响应 | | | | ✅ 主动分析 |

---

## 四、优先级排序

### 立即做（本周）

1. **订阅消息** — 微信小程序唯一主动触达通道，没有它所有提醒都形同虚设
2. **朋友圈分享** — 零成本增长
3. **头像昵称** — 零成本体验提升

### 本月做

4. **系统日历同步** — 不依赖小程序的提醒
5. **扫码添加联系人** — 比拍照更准更快
6. **会议导航** — 会议场景补全

### 下个月

7. **邀请有礼** — 系统化增长
8. **语音记录** — 降低记录门槛
9. **朋友圈周报卡片** — 内容驱动增长

### 长期

10. **AI 主动推送** — 从工具到智能体
11. **智能提醒时机** — 个性化触达
12. **关系健康度报告** — 深度价值

---

## 五、技术依赖

### 微信平台配置

| 项目 | 操作 | 审核周期 |
|------|------|---------|
| 订阅消息模板 | mp.weixin.qq.com → 订阅消息 → 创建模板 | 1-3 天 |
| 小程序码 | 已有 AppID 即可调用 | 即时 |
| 客服消息 | mp.weixin.qq.com → 客服 → 添加客服 | 即时 |
| 朋友圈分享 | 页面配置 onShareTimeline | 无需审核 |

### 后端新增

| 模块 | 位置 | 说明 |
|------|------|------|
| 订阅消息发送 | cloud-worker/src/worker.js | 调 `subscribeMessage.send` API |
| 订阅授权管理 | cloud-worker KV | `subscribe:${userId}:${tplId}` |
| 邀请关系追踪 | cloud-worker KV | `invite:${inviteeId} = inviterId` |
| 小程序码生成 | cloud-worker | 调 `wxacode.getUnlimited` |
| 语音转文字 | cloud-worker | 调微信 `mediaToText` 或 LLM |
| 附近人脉 | cloud-worker | 联系人 city 字段 + 地理距离计算 |

### 前端新增

| 页面 | 改动 |
|------|------|
| app.js | onLaunch 时补充订阅授权 |
| welcome.js | 头像昵称获取 + 分享配置 |
| dashboard.js | onShareTimeline + 附近人脉卡片 |
| contacts.js | 扫码入口 + 语音记录按钮 |
| meeting-detail.js | 导航按钮 + 日历同步 |
| mine.js | 邀请好友入口 + 小程序码展示 |
| 所有页面 | onShareTimeline 配置 |
