# Welian k6 压力测试

用 [k6](https://k6.io) 对 Welian 后端 API 做压力测试。脚本针对 Cloudflare Workers 后端，支持本地 `wrangler dev` 和生产环境。

## 安装 k6

```bash
# macOS
brew install k6

# 其他平台见 https://k6.io/docs/getting-started/installation/
```

## 本地运行

先启动本地后端：

```bash
cd cloud-worker && npx wrangler dev
# 默认监听 http://localhost:8787
```

另开终端跑压测：

```bash
# 冒烟压测（轻量，验证基本并发）
k6 run tests/perf/k6-smoke.js

# LLM 端点压测（中等负载）
k6 run tests/perf/k6-llm.js

# 信号端点压测（最重，耗时最长）
k6 run tests/perf/k6-signals.js
```

## 压生产环境

通过 `-e BASE_URL=...` 指定生产地址：

```bash
k6 run tests/perf/k6-smoke.js -e BASE_URL=https://api.welian.app
k6 run tests/perf/k6-llm.js -e BASE_URL=https://api.welian.app
k6 run tests/perf/k6-signals.js -e BASE_URL=https://api.welian.app
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BASE_URL` | `http://localhost:8787` | 后端 API 基地址 |
| `AUTH_TOKEN` | `perf_test:testsecret` | Bearer token，格式 `user_id:sync_secret` |

示例：

```bash
k6 run tests/perf/k6-smoke.js \
  -e BASE_URL=https://api.welian.app \
  -e AUTH_TOKEN=your_user_id:your_sync_secret
```

## 脚本说明

### k6-smoke.js — 冒烟压测

验证基本并发能力，不跑重端点。

| 端点 | 并发 | 持续 | 阈值 |
|------|------|------|------|
| `GET /ai/config`（无认证） | 50 VU | 30s | p95 < 500ms，错误率 < 5% |
| `GET /data/contacts`（需认证） | 20 VU | 30s | p95 < 500ms，错误率 < 5% |

### k6-llm.js — LLM 端点压测

测 LLM 相关端点在并发下的表现。LLM 调用较慢，阈值放宽。

| 端点 | 并发 | 持续 | 阈值 |
|------|------|------|------|
| `POST /ai/extract_intent` | 10 VU | 60s | p95 < 10s，错误率 < 10% |
| `POST /ai/advise_cloud` | 5 VU | 60s | p95 < 10s，错误率 < 10% |

请求体：
- `extract_intent`: `{"session_token": "perf_test:testsecret", "text": "记一下今天和老许聊了项目进展"}`
- `advise_cloud`: `{"session_token": "perf_test:testsecret", "text": "该联系谁了"}`

### k6-signals.js — 信号端点压测（最重）

测最重的 `hn_signals` 端点（13 源信号抓取 + LLM 筛选，单次耗时 5-15 秒）。阈值最宽松，因为该端点可能超时。

| 端点 | 并发 | 持续 | 阈值 |
|------|------|------|------|
| `POST /ai/hn_signals` | 3 VU | 120s | p95 < 30s，错误率 < 20% |

请求体：`{"session_token": "perf_test:testsecret"}`

## 注意事项

- 冒烟脚本可随时跑，负载轻。
- LLM 脚本会真实调用 LLM API，注意 token 消耗和费用。
- signals 脚本会触发 13 源信号抓取，**生产环境慎跑**，建议低峰期执行。
- 所有脚本独立可跑，互不依赖。
- 阈值不满足时 k6 退出码非 0，可用于 CI 流水线。
