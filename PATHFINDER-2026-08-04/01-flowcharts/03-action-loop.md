# AI 行动闭环

```mermaid
flowchart TD
  A[contacts/timeline/todos事实<br/>worker.js:529-531] --> B[advise_cloud 规则候选<br/>worker.js:536-615]
  B --> C[LLM格式化+registerAdvise<br/>worker.js:656-661]
  A --> D[action_card 读取事实<br/>worker.js:665-682]
  D --> E{优先级选择<br/>worker.js:684-797}
  E --> F[perception/todo/nurture/leverage action card]
  F --> G[dashboard 展示<br/>miniprogram/pages/dashboard/dashboard.wxml:98-113]
  G --> H{用户选择}
  H -->|拟消息| I[POST draft<br/>worker.js:1439-1490]
  I --> J[用户自行复制/发送]
  H -->|已联系| K[confirm done<br/>worker.js:1048-1087]
  K --> L[写 timeline/完成 todo/trackAction]
  H -->|跳过| M[confirm skip<br/>worker.js:1089-1104]
  L --> N[metrics:userId<br/>worker.js:5847-5894]
  I --> N
  M --> N
  N --> O[每周自进化<br/>worker.js:396-521]
  O --> P[behavioral insights KV<br/>worker.js:377-393]
  P --> B
```

## 已知断点

- `/data/timeline` 直接 POST、`/data/todos/done`、`extract_intent complete_todo` 与 action card 的 metrics 口径不完全一致（`worker.js:6964-7053`, `7253-7314`, `4352-4380`）。
- action card done 与 todo done 的 timeline/source 副作用不统一。
- 旧式直接 CRUD 行为可能未进入 adoption/北极星指标。
- 行为洞察回流到 prompt，但用户无法看到、纠正或理解改变了什么。

## 依赖

- 依赖关系数据内核、感知、报告和触达。
- 这是下一版本最应该收束的核心系统。
