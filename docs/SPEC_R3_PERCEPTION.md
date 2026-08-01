# R3「可解释感知」实施计划

> **版本**：v2.0 路线图实施计划  
> **日期**：2026-08-01  
> **前置条件**：R1「可信内核」+ R2「每周行动闭环」已完成  
> **目标**：不仅记得过去，还能带出处地发现对方的新变化，并转化为用户确认的行动

---

## 现状评估

### 已有基础设施

| 能力 | 实现状态 | 代码位置 |
|------|---------|---------|
| 信号系统 | ✅ 每日采集科技/商业/AI 信号，关联到用户联系人 | `handleHnSignals` L11990, `handleSignalsPreview` L12206 |
| 信号→联系人关联 | ✅ LLM 分析信号与联系人的相关性，输出 `related_contacts` | L12142 (prompt) |
| 联系人公司动态 | ✅ `contact_signals` 字段，高等级联系人公司最新动态 | L11272 |
| 信号推送 | ✅ 每日 07:00/22:00 CST 推送到公众号 | `handleDailySignalsPush` L13471 |
| 信号→行动追踪 | ✅ `/ai/signal_action` 记录查看/分享/拟消息 | L8478 |
| 关系网络图 | ✅ BFS 路径搜索、场景推荐、图谱构建 | `findRelationshipPath` L5088, `buildNetworkGraph` L5163 |
| 网络端点 | ✅ `/ai/network/path`, `/ai/network/recommend`, `/ai/network/graph`, `/ai/network/connect` | L9767-9806 |
| ego-browser | ✅ 已安装为 Claude 技能，支持 AI 驱动浏览器自动化 | `~/.claude/skills/ego-browser/` |
| 行为洞察 | ✅ 自进化分析，注入建议 prompt | `handleSelfEvolution` L396 |
| 通知偏好 | ✅ 用户级推送频率/静默控制 (R2-3) | `checkNotifyPrefs` L13324 |

### 关键缺口

| 缺口 | 影响 | 优先级 |
|------|------|--------|
| **无联系人变化感知** | 信号系统采集外部新闻，但不主动监测联系人自身变化（GitHub 活动、博客更新、职位变动） | P0 |
| **感知无出处展示** | 信号有来源但不展示采集时间、置信度、原文片段 | P0 |
| **感知不可撤销** | 信号关联到联系人后无法纠错或删除 | P0 |
| **网络图不可视化** | 有图谱数据但小程序无可视化展示 | P1 |
| **无 next-best-action** | 有建议但没有基于确认事实的实验性下一步行动推荐 | P1 |
| **ego-browser 未集成** | 技能已安装但未接入 Welian 后端作为感知传感器 | P2 |

---

## 实施计划

### R3-1: 感知卡系统 — 证据优先 (P0)

**目标**：每条感知必须展示来源、采集时间、原文和置信度，用户确认后才写入记忆或时间线。

#### 数据模型

新增 `perceptions` 数据集（KV key: `perceptions:${userId}`）：

```json
{
  "id": "perc_1234567890_abc",
  "contact_id": "c_xxx",
  "contact_name": "老许",
  "type": "github_activity | blog_post | job_change | news_mention | signal_match",
  "title": "感知标题",
  "summary": "一句话摘要",
  "source": {
    "url": "https://github.com/users/xu/events",
    "platform": "github",
    "collected_at": "2026-08-01T10:00:00Z",
    "original_text": "原文片段（最多 500 字）"
  },
  "confidence": 0.85,
  "status": "pending | confirmed | rejected | expired",
  "created_at": "...",
  "confirmed_at": null,
  "action_taken": null
}
```

#### 后端端点

**1. `GET /ai/perceptions` — 获取待确认感知列表**

```
Query: ?status=pending&limit=10
Response: {
  ok: true,
  perceptions: [...],
  total_pending: 3
}
```

**2. `POST /ai/perceptions/confirm` — 确认感知**

```
Body: { id, action: "confirm" | "reject", note?: "用户纠错备注" }
```

- `confirm` → 写入联系人 `memories` 或 `timeline`，状态改为 confirmed
- `reject` → 状态改为 rejected，记录纠错原因

**3. `DELETE /ai/perceptions/:id` — 撤销已确认感知**

- 从 `memories` 或 `timeline` 中删除对应记录
- 感知状态改为 rejected

**4. `POST /ai/perceptions/collect` — 手动触发感知采集**

```
Body: { contact_id, sources: ["github", "web"] }
```

- 调用感知采集器（R3-2）
- 返回新采集的感知列表

#### 小程序感知卡

在 dashboard 新增"感知"区域，展示待确认感知卡：

```
┌─────────────────────────────────┐
│ 🔍 发现了老许的新变化              │
│                                 │
│ 老许在 GitHub 上创建了新仓库       │
│ "welian-perception"             │
│                                 │
│ 📊 置信度: 85%                   │
│ 🔗 来源: github.com/users/xu     │
│ 🕐 采集: 2小时前                 │
│                                 │
│ [确认] [不是这样] [稍后]          │
└─────────────────────────────────┘
```

#### 退出门

- [ ] `GET /ai/perceptions` 返回待确认感知列表
- [ ] 确认感知 → 写入 memories/timeline
- [ ] 拒绝感知 → 记录纠错原因
- [ ] 撤销已确认感知 → 从 memories/timeline 删除
- [ ] 小程序展示感知卡（含出处/置信度/采集时间）
- [ ] 100% 感知卡具有出处

---

### R3-2: 低风险感知传感器 (P0)

**目标**：从 GitHub 和用户指定网页试点，手动触发，不批量定时采集。

#### 传感器架构

```
感知采集器 (perception_collector.js)
├── GitHubSensor
│   ├── 输入: contact.github_username 或 contact.platforms.github
│   ├── 输出: 最近活动（新仓库、PR、Issue、Star）
│   └── API: https://api.github.com/users/{username}/events/public
├── WebPageSensor
│   ├── 输入: contact.platforms.website 或用户指定 URL
│   ├── 输出: 页面变化检测（与上次采集对比）
│   └── 实现: ego-browser 抓取 + diff
└── NewsMentionSensor
    ├── 输入: contact.name + contact.company
    ├── 输出: 新闻提及（复用已有信号源）
    └── 实现: 复用 fetchAllSignalSources + LLM 过滤
```

#### GitHub 传感器实现

```javascript
async function collectGitHubPerceptions(env, userId, contact) {
  const username = contact.platforms?.github;
  if (!username) return [];
  
  const resp = await fetch(`https://api.github.com/users/${username}/events/public`, {
    headers: { 'Accept': 'application/vnd.github.v3+json' },
  });
  if (!resp.ok) return [];
  
  const events = await resp.json();
  const recentEvents = events.filter(e => {
    const age = (Date.now() - new Date(e.created_at).getTime()) / 86400000;
    return age <= 7; // 最近 7 天
  });
  
  return recentEvents.map(e => ({
    contact_id: contact.id,
    contact_name: contact.name,
    type: 'github_activity',
    title: formatGitHubEvent(e),
    source: {
      url: `https://github.com/${username}`,
      platform: 'github',
      collected_at: new Date().toISOString(),
      original_text: JSON.stringify(e).slice(0, 500),
    },
    confidence: 0.9, // GitHub 公开数据，高置信度
    status: 'pending',
  }));
}
```

#### Web 页面传感器实现

使用 ego-browser 技能抓取页面，与上次快照对比：

```javascript
async function collectWebPagePerceptions(env, userId, contact) {
  const url = contact.platforms?.website;
  if (!url) return [];
  
  // 用 ego-browser 抓取当前页面
  const currentSnapshot = await egoBrowserFetch(url);
  
  // 加载上次快照
  const lastSnapshot = await env.USER_DATA.get(`web_snapshot:${contact.id}`);
  
  if (!lastSnapshot) {
    // 首次采集，只存快照不生成感知
    await env.USER_DATA.put(`web_snapshot:${contact.id}`, currentSnapshot);
    return [];
  }
  
  // 比较差异
  const diff = computeDiff(lastSnapshot, currentSnapshot);
  if (diff.length === 0) return [];
  
  // 更新快照
  await env.USER_DATA.put(`web_snapshot:${contact.id}`, currentSnapshot);
  
  return diff.map(d => ({
    contact_id: contact.id,
    contact_name: contact.name,
    type: 'blog_post',
    title: d.summary,
    source: {
      url,
      platform: 'web',
      collected_at: new Date().toISOString(),
      original_text: d.text.slice(0, 500),
    },
    confidence: 0.7, // 网页变化，中等置信度
    status: 'pending',
  }));
}
```

#### 采集流程

1. 用户在小程序联系人详情页点击"感知变化"
2. 调用 `POST /ai/perceptions/collect`，指定 contact_id 和 sources
3. 后端调用对应传感器采集
4. 新感知写入 `perceptions:${userId}`，状态为 pending
5. 返回新采集的感知列表
6. 用户在 dashboard 感知卡区域确认/拒绝

#### 退出门

- [ ] GitHub 传感器能采集最近 7 天活动
- [ ] Web 页面传感器能检测页面变化
- [ ] 手动触发采集返回感知列表
- [ ] 感知自动写入 pending 状态
- [ ] 不做批量定时采集（仅手动触发）

---

### R3-3: 显式关系网络可视化 (P1)

**目标**：在小程序中可视化用户确认的关系网络，提供引荐路径和会前协作图。

#### 当前状态

后端已有完整的网络算法：
- `findRelationshipPath` — BFS 最短路径
- `recommendByScenario` — 场景推荐
- `buildNetworkGraph` — 图谱构建（nodes + edges）
- `/ai/network/graph` 端点已就绪

但小程序无可视化展示。

#### 实施方案

**1. 小程序关系网络页**

新建 `miniprogram/pages/network/network.{js,wxml,wxss,json}`：

- **图谱视图**：用 canvas 或 SVG 绘制关系网络图
  - 节点 = 联系人，按 nature 着色（经营=绿、陪伴=黄、双重=橙）
  - 边 = 用户确认的 connections
  - 支持拖拽、缩放、点击节点跳转联系人详情
- **引荐路径**：输入 from → to，展示最短路径
- **场景推荐**：选择场景（如"技术合作""融资引荐"），展示推荐联系人

**2. 会前协作图**

在会议详情页新增"协作图"标签：
- 展示参会人之间的关系
- 高亮已有 connections
- 标注"第一次见面"的参会人

**3. 隐私保护**

- 只展示用户录入或确认的 connections
- 不展示关系评分
- 不对陪伴型关系计算路径或价值
- 用户可隐藏特定联系人不出现在图谱中

#### 退出门

- [ ] 小程序网络页可展示图谱
- [ ] 引荐路径搜索可用
- [ ] 场景推荐可用
- [ ] 会议详情页展示协作图
- [ ] 陪伴型关系不参与路径计算

---

### R3-4: 实验 next-best-action (P1)

**目标**：仅根据确认事实生成下一步行动建议，用户决定是否采用，永不自动发送。

#### 当前状态

R2-2 的 `handleActionCard` 已基于逾期待办和联系人评分返回行动建议。R3-4 在此基础上增加基于**感知事实**的行动建议。

#### 实施方案

**1. 感知驱动行动建议**

修改 `handleActionCard`，在优先级中增加感知来源：

```
优先级:
1. 逾期待办 (todo_due) — 已有
2. 感知驱动行动 (perception_driven) — 新增
3. 高分经营联系人 (advise) — 已有
```

感知驱动行动示例：
- 老许发布了新仓库 → 建议聊聊他的新项目
- 张总公司被收购 → 建议祝贺
- 李总博客更新了融资文章 → 建议分享观点

**2. 行动建议格式**

```json
{
  "type": "perception_driven",
  "reason": "老许在 GitHub 创建了新仓库 welian-perception",
  "contact": { "id": "...", "name": "老许", "nature": "leverage" },
  "suggested_topic": "聊聊你的新项目 welian-perception",
  "perception_id": "perc_xxx",
  "draft_available": true
}
```

**3. 确认后更新感知状态**

在 `handleActionCardConfirm` 中，如果 `perception_id` 存在：
- `draft` → 感知状态改为 confirmed，action_taken = "draft"
- `done` → 感知状态改为 confirmed，action_taken = "interaction"
- `skip` → 感知保持 pending，不改变状态

#### 退出门

- [ ] 感知驱动行动出现在 action_card 中
- [ ] 确认后感知状态正确更新
- [ ] 永不自动发送消息
- [ ] 感知到有用行动转化 `≥20%`

---

### R3-5: 按质量扩展传感器 (P2)

**目标**：只有来源健康、准确性和行动转化达标后，才扩大来源与自动频率。

#### 质量门控

新增 `sensor_quality` 数据集：

```json
{
  "github": {
    "accuracy_rate": 0.92,    // 用户确认率
    "action_rate": 0.25,      // 行动转化率
    "collect_count": 50,
    "confirm_count": 46,
    "reject_count": 4,
    "last_evaluated": "..."
  },
  "web": { ... },
  "news_mention": { ... }
}
```

#### 扩展条件

- `accuracy_rate ≥ 90%` 且 `action_rate ≥ 20%` → 可开启自动采集
- `accuracy_rate < 80%` → 暂停该传感器
- 每周自进化时自动评估传感器质量

#### 自动采集（达标后）

- GitHub：每日采集一次（复用 cron）
- Web：每周采集一次
- 新闻提及：复用已有信号推送频率

#### 退出门

- [ ] 传感器质量指标可追踪
- [ ] 准确率低于 80% 自动暂停
- [ ] 达标后可开启自动采集
- [ ] 用户可手动关闭特定传感器

---

## 优先级排序

| 顺序 | 功能 | 优先级 | 预计文件数 | 依赖 |
|------|------|--------|-----------|------|
| 1 | R3-1: 感知卡系统 | P0 | 3 修改 + 1 新建 | 无 |
| 2 | R3-2: 低风险传感器 | P0 | 2 新建 + 1 修改 | R3-1 |
| 3 | R3-4: next-best-action | P1 | 1 修改 | R3-1, R3-2 |
| 4 | R3-3: 关系网络可视化 | P1 | 4 新建 + 1 修改 | 无 |
| 5 | R3-5: 质量扩展 | P2 | 1 修改 + 1 新建 | R3-1, R3-2 |

## 退出门（R3 整体）

沿用 SPEC_WELIAN_ROADMAP_v3.md 的目标值：

- [ ] 100% 感知卡具有出处
- [ ] 用户确认准确率 `≥90%`
- [ ] 错误写入可完全撤销
- [ ] 感知到有用行动转化 `≥20%`
- [ ] 无未经同意的身份关联

**明确不做**：陌生人发现、批量爬取、自动社交、技能市场、MCP 平台化。

---

## 技术决策

### 为什么用 KV 存感知而非独立数据库

- 感知数据量小（每用户每天 < 10 条）
- KV 已有完善的 `loadDataset`/`saveDataset` 模式
- 无需额外基础设施成本
- 版本控制（R1-6）自动适用

### 为什么 GitHub 传感器优先

- GitHub API 公开免费，无需认证
- 数据结构化，置信度高
- 开发者用户群体匹配度高
- 无法律/隐私风险（公开活动）

### 为什么 ego-browser 只做 Web 页面传感器

- ego-browser 已安装为技能，但需要 CLI 访问
- Web 页面变化检测是 ego-browser 的强项（JS 渲染、登录态）
- 不用于批量爬取（路线图明确禁止）
- 仅在用户手动触发时调用

### 为什么感知不自动写入

- 路线图要求"用户确认后才写入记忆或时间线"
- 感知可能不准确（LLM 误判、网页变化误判）
- 用户纠错是质量门控的关键输入
- 保留 pending 状态让用户掌控数据
