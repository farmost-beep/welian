# Handoff prompts

## 1. 事实写入与事件流

```text
请按 Pathfinder-2026-08-04/03-unified-proposal.md 的“统一系统 1”制定实施计划。
目标：将 timeline/todo/contact 的多入口写入统一到 domain operation，并让所有成功事实写入进入标准化事件流。

必须覆盖的现有调用点：
- cloud-worker/src/worker.js:7012-7018
- cloud-worker/src/worker.js:7297-7312
- cloud-worker/src/worker.js:1056-1076
- cloud-worker/src/worker.js:4295-4302, 4352-4380
- cloud-worker/src/worker.js:8167-8179, 9928-9942
- cloud-worker/src/worker.js:10526-10533

参考流程图：PATHFINDER-2026-08-04/01-flowcharts/02-relationship-core.md、03-action-loop.md。
要求：统一 resolveContact、模型工厂、幂等、source、事件 meta 和 expectedVersion；不要保留第二套写入抽象，不要改变 nurture 伦理规则；先写失败测试，再实现。
```

## 2. 统一 Action

```text
请按 Pathfinder-2026-08-04/03-unified-proposal.md 的“统一系统 2”制定实施计划。
目标：让 advise_cloud、action_card、会议复盘、感知和信号都输出统一 Action，不新增并行的行动闭环。

必须覆盖的现有调用点：
- cloud-worker/src/worker.js:536-615
- cloud-worker/src/worker.js:665-797
- cloud-worker/src/worker.js:3373-3596
- cloud-worker/src/worker.js:684-710
- cloud-worker/src/worker.js:1439-1490

参考流程图：PATHFINDER-2026-08-04/01-flowcharts/03-action-loop.md、04-signal-perception.md、05-meeting.md。
要求：保留 leverage/nurture/dual 的不同伦理策略；nurture 不得使用冷却、ROI、价值排序；pending perception 必须先确认再转行动；不自动发送消息；优先删掉重复候选逻辑，而不是新增 registry/factory 层。
```

## 3. 报告与可解释学习

```text
请按 Pathfinder-2026-08-04/03-unified-proposal.md 的“统一系统 3”制定实施计划。
目标：统一周/月/年报告基础统计，并把隐藏的行为洞察变成用户可见、可校正、可关闭的 EvolutionInsight。

必须覆盖的现有调用点：
- cloud-worker/src/worker.js:11845-11960
- cloud-worker/src/worker.js:11981-12070
- cloud-worker/src/worker.js:12262-12435
- cloud-worker/src/worker.js:13697-13796
- cloud-worker/src/worker.js:396-521
- cloud-worker/src/worker.js:11144-11180

参考流程图：PATHFINDER-2026-08-04/01-flowcharts/06-reports-growth.md。
要求：统计口径先写测试；区分完成率、采纳率和关系行动数；洞察必须有 evidence/range/effect/status；不能把 LLM 自由生成的文字当作事实指标；不增加幸福评分或陪伴型关系的功利化指标。
```

## 4. 通知分发

```text
请按 Pathfinder-2026-08-04/03-unified-proposal.md 的“统一系统 4”制定实施计划。
目标：把所有 Cron/订阅/IM 通知统一到 dispatchNotification 单一出口。

必须覆盖的现有调用点：
- cloud-worker/src/worker.js:13796-13800
- cloud-worker/src/worker.js:13945-13948
- cloud-worker/src/worker.js:14435-14471
- cloud-worker/src/worker.js:13964-14276
- cloud-worker/src/worker.js:15160-15212
- cloud-worker/src/worker.js:14372-14433

参考流程图：PATHFINDER-2026-08-04/01-flowcharts/08-platform-services.md。
要求：统一偏好、静默时段、max_per_day、dedupeKey、失败记录和队列写入；不要增加新的通知类别；通知必须服务于高置信关系行动，默认克制；验证时覆盖时区、重复触发和外部渠道失败。
```
