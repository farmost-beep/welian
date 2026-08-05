# Welian Duplication Report

> 依据：8 个域流程图、Worker 源码和两个独立重复审查。

## 1. 必须统一的重复

### 1.1 用户行动事件与 metrics

**位置**：
- `cloud-worker/src/worker.js:1034-1076`：action card draft/done/todo 完成
- `cloud-worker/src/worker.js:1486`：draft endpoint
- `cloud-worker/src/worker.js:4302,4380`：extract_intent 写互动/完成待办
- `cloud-worker/src/worker.js:8169,9930`：同步路径写互动
- `cloud-worker/src/worker.js:5847-5894`：`trackAction`

**问题**：同一行为从多个入口埋点，meta 字段和 await 方式不一致；部分直接 CRUD 写入不追踪，导致北极星指标和 adoption 不完整。

**判断**：意外重复，不是合法专门化。

**统一方向**：保留 `trackAction` 作为唯一事件入口，标准化 `{event_id, action_type, contact_id, source, occurred_at}`；所有事实写入成功后通过同一 domain event 触发。

### 1.2 联系人解析/匹配

**位置**：
- `worker.js:4283-4285`、`4310-4313`、`4366`
- `worker.js:8158-8179`
- `worker.js:9921-9942`
- `worker.js:5557-5572` 的 `contactMatchesName` 已存在但未被所有写入路径复用

**问题**：name、includes、`aliases`、`alias` 的匹配规则在不同路径不一致。

**判断**：意外重复，已经导致昵称路径行为不一致。

**统一方向**：所有自然语言动作和导入路径统一调用 `resolveContact`/`contactMatchesName`，返回唯一联系人或明确的歧义状态。

### 1.3 Timeline / Todo 写入副作用

**位置**：
- `worker.js:7297-7312`：todo done 自动写 timeline
- `worker.js:1056-1065`：action card done 手动写 timeline
- `worker.js:4295-4302`、`7012-7018`、`7865-7868`、`8167-8169`、`9928-9930`、`10526-10533`：多条写入路径
- `worker.js:5735-5762`：工厂函数

**问题**：有的使用工厂函数，有的手动构造；source、去重、metrics、副作用不一致。

**判断**：写入来源差异合法，但实现分叉不合法。

**统一方向**：单一 `recordInteraction` / `completeTodo` domain operation；每个 operation 统一负责模型创建、幂等、事件和必要的关联 timeline。

### 1.4 关系候选选择

**位置**：
- `worker.js:536-615`：`handleCloudAdvise` 内联评分/提醒
- `worker.js:801-931`：`buildNurtureCandidates` / `buildLeverageCandidates`
- `worker.js:665-797`：action card 使用候选

**问题**：`advise_cloud` 与 action card 使用相似但不同阈值和随机扰动，用户可能看到互相矛盾的推荐。

**判断**：意外重复。

**统一方向**：单一 `selectRelationshipCandidates(context, mode)`，由 `advise_cloud` 和 action card 共同调用；陪伴型和经营型保留不同规则，但共享候选数据和伦理护栏。

### 1.5 通知发送

**位置**：
- `worker.js:14372-14433`：通知偏好/计数
- `worker.js:13796-13800`、`13945-13948`、`14435-14471`：多个 handler 手写 queue 写入
- `worker.js:13964-14276`、`14335-14571`、`15160-15212`：多种 Cron/订阅触达

**问题**：每个 handler 手动做 prefs、计数、队列和渠道发送，频率限制容易漏调用。

**判断**：意外重复。

**统一方向**：单一 `dispatchNotification({userId, category, payload, dedupeKey})`，内部完成偏好、静默时段、每日上限、幂等、入队和渠道分发。

## 2. 可共享但保留业务差异的重复

### 2.1 报告统计

**位置**：`worker.js:11845-11960`、`11981-12070`、`12262-12435`、`13697-13796`。

周/月/年时间窗口不同是合法差异；但时间过滤、角色分类、关系状态分类和基础计数应共享。报告的语气、结构和 CTA 可以专门化。

### 2.2 会议复盘与行动卡

**位置**：
- `worker.js:3373-3596`：会议复盘生成 follow-up todos
- `worker.js:665-797`：action card 选择行动
- `worker.js:1004-1104`：行动确认

会议场景有专门的照片和复盘逻辑，这是合法专门化；但其输出的 follow-up 应进入统一 Action/事件模型，而不是形成另一套待办/行动闭环。

### 2.3 感知确认与行动确认

**位置**：
- `worker.js:11226-11300`：perception confirm/reject
- `worker.js:1004-1104`：action card draft/done/skip

感知的证据确认和行动采用是不同信任决策，不能强行合并为一个按钮；但应共享审计事件、来源和可撤销状态。

## 3. 发布阻断级断点

1. 数据写入成功但 metrics 未记录，导致所有增长判断不可信。
2. 多入口写入导致 timeline/todo 的 source、幂等和关联结果不一致。
3. `saveDataset` 版本机制存在但前端未使用，且多键写入非原子（`worker.js:5520-5553`）。
4. 触达有多套 Cron，但用户通知偏好、静默和幂等需要单一出口。
5. 分享/社交图谱身份关联必须显式同意，不能默认隐式绑定（`docs/SPEC_WELIAN_ROADMAP_v3.md:85-95`）。

## Confidence / gaps

- 高置信：事件、匹配、写入、候选、通知的重复均有多处源码证据。
- 中置信：部分 Worker 老路径可能是兼容/低流量路径，需要上线前按 route telemetry 确认调用量。
- 未覆盖：Python engine 与 Worker 的跨语言行为等价性需另做迁移审计。
