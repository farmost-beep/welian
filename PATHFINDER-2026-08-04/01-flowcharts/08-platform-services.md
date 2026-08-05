# 触达与平台服务

```mermaid
flowchart TD
  A[用户数据/配置<br/>app.js:134-223] --> B[USER_DATA KV]
  B --> C[Cloudflare scheduled<br/>wrangler.toml:83-91 / worker.js:11667-11706]
  C --> D[周报/信号/晚间/日期/健康/自进化 handlers]
  D --> E[notify_prefs 检查<br/>worker.js:14372-14433]
  E -->|允许| F[微信订阅/IM/推送队列]
  E -->|静默/超限| G[跳过]
  B --> H[calendar token/feed<br/>worker.js:7085-7242]
  H --> I[外部日历订阅]
  J[小程序同步页<br/>miniprogram/pages/sync/sync.js:1-334] --> K[WebSocket sync]
  K --> B
  L[计费/支付/IM] --> M[billing KV + 外部平台<br/>worker.js:1575-1863]
```

## 已知断点 / 风险

- 多个 Cron 都可能触达同一用户；已有 prefs 和每日上限，但时区、失败重试、全局熔断仍需收口。
- 日历 token/feed 有独立设计，但撤销、访问频率和审计需要成为产品信任能力。
- IM session、计费和 KV 多键写入存在并发/可靠性风险。
- 平台能力应服务于“每周一次有意义的关系行动”，不应继续作为功能数量增长的主线。
