# 关系数据内核

```mermaid
flowchart TD
  A[联系人列表<br/>miniprogram/pages/contacts/contacts.js:59-78] --> B[GET contacts<br/>cloud-worker/src/worker.js:5984-6080]
  C[联系人详情编辑<br/>miniprogram/pages/contact-detail/contact-detail.js:356-415] --> B1[POST contacts update<br/>cloud-worker/src/worker.js:6081-6160]
  D[互动记录<br/>miniprogram/pages/timeline/timeline.js:45-82] --> E[POST/PUT timeline<br/>cloud-worker/src/worker.js:6964-7053]
  F[待办列表与操作<br/>miniprogram/pages/todos/todos.js:78-157] --> G[CRUD/done/postpone<br/>cloud-worker/src/worker.js:7253-7433]
  H[AI自然语言提取<br/>cloud-worker/src/worker.js:4133-4400] --> B
  H --> E
  H --> G
  B --> I[loadDataset contacts<br/>cloud-worker/src/worker.js:5492-5501]
  E --> J[load/save timeline dataset<br/>cloud-worker/src/worker.js:5492-5553]
  G --> K[load/save todos dataset<br/>cloud-worker/src/worker.js:5492-5553]
  G --> L[完成待办自动写 timeline<br/>cloud-worker/src/worker.js:7284-7314]
  I --> M[USER_DATA KV contacts:userId]
  J --> N[USER_DATA KV timeline:userId]
  K --> O[USER_DATA KV todos:userId]
  M --> P[建议/报告/会议/感知上下文]
  N --> P
  O --> P
```

## Side effects / external dependencies

- 三个核心事实集以用户级 KV JSON 数组保存，另有 version sidecar；写入不是多键原子事务（`worker.js:5520-5553`）。
- 前端 CRUD 当前没有统一携带 `expectedVersion`，版本冲突机制存在但未形成端到端闭环。
- contacts 删除会级联 timeline/todos；todo done 会自动生成 timeline，其他入口的事件副作用不完全一致。

## 依赖

- 为所有 AI、报告、会议和通知提供事实上下文。
- 依赖统一事件/metrics 才能正确衡量用户行动。
