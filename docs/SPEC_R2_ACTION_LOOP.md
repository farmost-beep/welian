# R2「每周行动闭环」实施计划

> **版本**：v2.0 路线图实施计划  
> **日期**：2026-08-01  
> **前置条件**：R1「可信内核」已完成（数据可信、质量门通过、隐私收口）  
> **目标**：每周至少帮助用户完成一件由本人确认的关系行动

---

## 现状评估

### 已有基础设施

| 能力 | 实现状态 | 代码位置 |
|------|---------|---------|
| Onboarding 端点 | ✅ 已实现，支持批量创建联系人 + 生成首次建议 | `handleOnboardingCreateContacts` L12155 |
| 建议生成 | ✅ 已实现，基于联系人/时间线/待办评分 | `handleCloudAdvise` L494 |
| 建议采纳追踪 | ✅ 已实现，7天内行动算采纳，按周统计 | `trackAction` L5210, `registerAdvise` L5242 |
| 信号推送 | ✅ 每日 07:00/22:00 CST 推送科技商业信号 | `handleDailySignalsPush` L13091 |
| 待办到期推送 | ✅ 每日 08:00 CST 推送待办到期订阅消息 | `handleTodoDueSubscribePush` L13816 |
| 周报推送 | ✅ 每周一 09:00 CST | `handleScheduledPush` L12692 |
| 自进化 | ✅ 每周一 10:00 CST 分析指标，更新行为洞察 | `handleSelfEvolution` L396 |
| 消息草稿 | ✅ 已实现，场景化拟写 | `/ai/draft_message` |
| 信号→行动追踪 | ✅ 已实现 | `/ai/signal_action` L8478 |

### 关键缺口

| 缺口 | 影响 | 优先级 |
|------|------|--------|
| **小程序无引导式 onboarding** | 用户登录后直接进 dashboard，空状态只有"去添加联系人"按钮，无引导流程 | P0 |
| **首次价值时间无法测量** | 无 onboarding 漏斗埋点，无法计算"首个价值中位时间 <3分钟" | P0 |
| **行动闭环不统一** | 信号、待办、会议跟进分散在不同入口，用户需手动跳转 | P1 |
| **自进化结果不可见** | 行为洞察写入 `prompt:behavioral_insights` 但用户看不到"学到了什么" | P1 |
| **主动触达缺少频率控制** | 有多个 cron 推送但无用户级频率/静默设置 | P2 |

---

## 实施计划

### R2-1: 3 联系人快速激活 (P0)

**目标**：用户登录后 3 分钟内完成添加 3 个联系人并收到第一条建议。

#### 后端（已就绪，仅需微调）

- `handleOnboardingCreateContacts` 已支持批量创建 + 生成首次建议
- **微调**：在返回中增加 `onboarding_completed_at` 时间戳，用于计算首次价值时间
- **微调**：在 `trackAction` 中增加 `onboarding_complete` 事件类型

#### 小程序（新建 onboarding 页）

**文件清单**：
- `miniprogram/pages/onboarding/onboarding.js` — 页面逻辑
- `miniprogram/pages/onboarding/onboarding.wxml` — 3 步引导 UI
- `miniprogram/pages/onboarding/onboarding.wxss` — 样式
- `miniprogram/pages/onboarding/onboarding.json` — 页面配置
- `miniprogram/app.json` — 注册页面路由

**交互流程**：
1. **第 1 步**：输入第 1 个联系人姓名 + 选择关系类型（经营/陪伴/双重）+ 关系描述
2. **第 2 步**：输入第 2 个联系人（同上）
3. **第 3 步**：输入第 3 个联系人（同上）
4. **提交**：调用 `/ai/onboarding` 端点，展示 `first_advise`
5. **完成**：跳转 dashboard，此时已有数据和首次建议

**dashboard 联动**：
- `dashboard.js` 的 `isEmpty` 分支：跳转 onboarding 页而非仅显示按钮
- onboarding 完成后设置 `app.globalData.onboarded = true`，dashboard 不再跳转

**验证方式**：
- 页面文件存在且 app.json 注册
- 模拟 3 联系人提交，确认 `/ai/onboarding` 返回 200 + `first_advise` 非空
- 确认 dashboard 空状态跳转 onboarding

#### 退出门

- [ ] onboarding 页可完成 3 联系人输入并提交
- [ ] 提交后收到 first_advise
- [ ] dashboard 空状态自动跳转 onboarding
- [ ] 首次价值时间可采集（onboarding_complete 时间戳）

---

### R2-2: 统一行动闭环 (P1)

**目标**：信号、会议、到期待办进入同一流程：为什么现在 → 建议聊什么 → 用户确认草稿 → 用户自行发送 → 记录结果 → 生成跟进。

#### 当前状态

- 信号推送 → 用户看到信号 → `/ai/signal_action` 记录查看
- 待办到期 → 推送订阅消息 → 用户手动处理
- 建议生成 → `/ai/advise` 返回建议列表
- 消息草稿 → `/ai/draft_message` 生成草稿

这些是分散的点，没有串成一条闭环。

#### 实施方案

**1. 统一行动卡组件**

在 `cloud-worker/src/worker.js` 中新增 `handleActionCard` 端点：

```
GET /ai/action_card → 返回当前最值得行动的 1 件事
{
  type: "signal" | "todo_due" | "meeting_prep" | "advise",
  reason: "为什么现在",
  contact: { id, name, nature },
  suggested_topic: "建议聊什么",
  draft_available: true,
  todo_id: "xxx"  // 可选
}
```

**2. 行动确认流程**

```
POST /ai/action_card/confirm
{
  action_card_id: "xxx",
  action: "draft" | "done" | "skip",
  contact_id: "xxx"
}
```

- `draft` → 生成消息草稿，用户自行发送
- `done` → 记录互动，生成跟进待办
- `skip` → 跳过，记录原因（用于自进化）

**3. 小程序行动卡入口**

在 dashboard 顶部增加"本周最值得做的一件事"卡片，点击进入行动流程。

**验证方式**：
- `/ai/action_card` 返回有效行动建议
- 确认草稿 → 生成草稿 → 记录互动 → 生成跟进待办，全链路通过
- `trackAction` 记录 `action_card_draft` / `action_card_done` / `action_card_skip`

#### 退出门

- [ ] `/ai/action_card` 返回至少 1 条有效建议
- [ ] 确认→草稿→记录→跟进全链路通过
- [ ] 行动卡在 dashboard 可见
- [ ] 行动转化可采集

---

### R2-3: 克制的主动触达 (P2)

**目标**：从现有 `todo_due` 扩展到会议前、重要日期和周报就绪，提供频率和静默控制。

#### 当前状态

已有 7 个 cron 任务（R1 修复后），但无用户级频率控制。

#### 实施方案

**1. 用户通知偏好**

新增 KV 键 `notify_prefs:${userId}`：
```json
{
  "daily_signals": true,
  "evening_recap": false,
  "todo_due": true,
  "weekly_report": true,
  "festival_reminder": true,
  "quiet_hours": { "start": "22:00", "end": "08:00" },
  "max_per_day": 3
}
```

**2. 推送前检查**

在每个 push handler 中增加 `checkNotifyPrefs(env, userId)` 调用：
- 检查对应类别是否开启
- 检查当前时间是否在静默时段
- 检查今日已推送次数是否超限

**3. 小程序设置页**

在设置页增加通知偏好开关。

**验证方式**：
- 设置 `daily_signals: false` 后，该用户不再收到信号推送
- 设置静默时段后，该时段内推送被跳过
- `max_per_day` 超限后跳过

#### 退出门

- [ ] 通知偏好可设置和读取
- [ ] 推送前检查生效
- [ ] 静默时段跳过验证
- [ ] 小程序设置页可操作

---

### R2-4: 可解释自进化 (P1)

**目标**：展示"学到了什么、依据哪些记录、改变了什么建议"，支持编辑、删除和重置。

#### 当前状态

`handleSelfEvolution` 每周一分析指标，生成行为洞察，写入 `prompt:behavioral_insights:${userId}.md`。但用户看不到这个文件，也不知道 AI 学到了什么。

#### 实施方案

**1. 暴露行为洞察**

新增端点：
```
GET /ai/evolution → 返回当前行为洞察
{
  insights: "洞察文本",
  updated_at: "2026-08-01T10:00:00Z",
  based_on: {
    weeks_analyzed: 4,
    total_actions: 23,
    adoption_rate: 35
  }
}
```

**2. 小程序进化卡片**

在 dashboard 底部（已有 `evolution-card` 占位）展示：
- "小维学到了…" 一句话总结
- "依据：过去 4 周 23 次行动，采纳率 35%"
- 支持删除（重置洞察）

**3. 洞察格式标准化**

修改 `handleSelfEvolution` 的 LLM prompt，要求输出 JSON：
```json
{
  "summary": "一句话总结",
  "details": ["具体洞察1", "具体洞察2"],
  "changed_recommendations": ["因为XX，建议改为YY"]
}
```

**验证方式**：
- `/ai/evolution` 返回有效洞察
- 小程序展示进化卡片
- 删除后洞察清空

#### 退出门

- [ ] `/ai/evolution` 返回洞察数据
- [ ] 小程序展示进化卡片
- [ ] 支持删除/重置
- [ ] 洞察格式标准化

---

### R2-5: 留存通过后再做裂变 (P2)

**目标**：邀请码和分享能力保留，但邀请奖励仅在激活、留存门槛达成后开启。

#### 当前状态

- 邀请码已实现：`claimInviteReward` L3260
- 分享已实现：`onShareAppMessage` / `onShareTimeline`
- 奖励：邀请者和被邀请者各 100 credits

#### 实施方案

**1. 延迟奖励**

修改 `claimInviteReward`：
- 被邀请者必须完成 onboarding（至少 3 联系人）
- 被邀请者 7 日内至少 1 次行动（互动记录/待办完成/草稿生成）
- 满足后才发放奖励

**2. 奖励状态追踪**

新增 KV 键 `invite_reward_pending:${inviteeId}`：
```json
{
  "inviter_id": "xxx",
  "created_at": "...",
  "onboarding_done": false,
  "first_action_done": false,
  "reward_claimed": false
}
```

**3. 自动检查**

在 `trackAction` 中检查 pending 奖励是否满足条件，满足后自动发放。

**验证方式**：
- 新用户注册但未完成 onboarding → 奖励不发放
- 完成 onboarding 但 7 日内无行动 → 奖励不发放
- 完成 onboarding + 7 日内有行动 → 奖励自动发放

#### 退出门

- [ ] 延迟奖励逻辑生效
- [ ] 奖励状态可追踪
- [ ] 自动发放验证

---

## 优先级排序

| 顺序 | 功能 | 优先级 | 预计文件数 | 依赖 |
|------|------|--------|-----------|------|
| 1 | R2-1: 3 联系人快速激活 | P0 | 5 新建 + 2 修改 | 无 |
| 2 | R2-4: 可解释自进化 | P1 | 1 修改 + 1 修改 | R2-1（需要用户数据） |
| 3 | R2-2: 统一行动闭环 | P1 | 2 修改 + 1 新建 | R2-1（需要联系人数据） |
| 4 | R2-3: 克制的主动触达 | P2 | 3 修改 + 1 新建 | 无 |
| 5 | R2-5: 留存后再裂变 | P2 | 2 修改 | R2-1（需要 onboarding 完成） |

## 退出门（R2 整体）

沿用 SPEC_AGENT_v3.md 的目标值：

- [ ] 首个价值中位时间 `<3 分钟`
- [ ] 7 日激活率 `≥40%`
- [ ] D30 留存 `≥20%`
- [ ] 建议到关系行动转化 `≥15%`

**明确不做**：自动发送、陪伴型冷却或排序、团队协作、更多信号源。
