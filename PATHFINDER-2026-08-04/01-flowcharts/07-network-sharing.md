# 关系网络与分享

```mermaid
flowchart TD
  A[联系人 connections/tags<br/>worker.js:5706-5733] --> B[buildNetworkGraph<br/>worker.js:5657-5701]
  A --> C[findRelationshipPath BFS<br/>worker.js:5574-5617]
  A --> D[recommendByScenario<br/>worker.js:5619-5645]
  B --> E[network graph API<br/>worker.js:10301-10364]
  C --> E
  D --> E
  E --> F[小程序 network 页面<br/>miniprogram/pages/network/network.js]
  G[报告/联系人分享] --> H[social graph API<br/>worker.js:9465-9525]
  H --> I[pending/confirm 关系绑定]
  I --> J[分享报告/关系上下文]
```

## Side effects / external dependencies

- 图谱只使用联系人字段中明确存在的 connections/tags；陪伴型关系不进入路径和图谱计算。
- 分享/社交绑定涉及微信 openid、联系人姓名和邀请关系，必须使用 opaque ID、显式确认和可撤销机制。
- 当前网络能力已有后端算法和小程序列表入口，但图谱可视化不是下一版本首要价值证明。
