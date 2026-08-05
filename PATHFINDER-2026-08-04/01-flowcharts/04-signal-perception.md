# 感知与信号

```mermaid
flowchart TD
  A[外部信号 HN/RSS/Tavily<br/>worker.js:12437-13410] --> B[个性化与联系人匹配<br/>worker.js:13032-13194]
  C[GitHub 手动采集<br/>worker.js:1110-1228] --> D[去重+证据包装]
  B --> E[信号展示/行动追踪<br/>worker.js:9218-9224]
  D --> F[perceptions pending KV]
  F --> G[联系人详情采集/查看<br/>miniprogram/pages/contact-detail/contact-detail.js:213-308]
  G --> H{用户确认或拒绝}
  H -->|确认| I[写入 contact memories/timeline<br/>worker.js:11226-11300]
  H -->|拒绝| J[rejected+原因<br/>worker.js:11226-11300]
  F --> K[action_card perception_driven<br/>worker.js:684-710]
  K --> L[拟稿/已联系/跳过<br/>worker.js:1004-1104]
  L --> M[更新 perception action_taken]
  F --> N[sensor_quality 评估<br/>worker.js:486-516]
```

## Side effects / external dependencies

- HN/RSS/Tavily/GitHub 等外部来源；LLM 负责相关性和摘要。
- 感知应包含来源 URL、采集时间、原文片段、置信度；确认后才进入记忆或时间线。
- Python 感知层和 ego-browser 设计存在，但尚未全部接入当前 Worker 主链路。

## 已知断点

- 已确认感知的完整撤销路径尚未形成稳定端点/体验。
- 自动采集尚未按质量门控真正扩大，传感器来源和实现存在分叉。
- 感知进入 action card 的优先级高于逾期待办，若没有频率/数量控制可能造成打扰。
