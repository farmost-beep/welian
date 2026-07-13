# Welian Cloud Worker

AI billing gateway + auth + tunnel discovery for Welian (方案C).

## Quick Start

```bash
# Deploy your own cloud worker
npx welian-cloud init
npx welian-cloud deploy
```

## Commands

| Command | Description |
|---------|-------------|
| `npx welian-cloud init` | Interactive setup (configure wrangler.toml + set API keys) |
| `npx welian-cloud deploy` | Deploy to Cloudflare Workers |
| `npx welian-cloud dev` | Run locally for development |
| `npx welian-cloud secret set LLM_API_KEY` | Set a secret |
| `npx welian-cloud secret list` | List configured secrets |

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /ai/chat` | Billing gateway — forward to LLM, return usage (方案C) |
| `POST /ai/draft` | AI message drafting |
| `POST /ai/extract` | Record enhancement (extract todos/key points) |
| `POST /ai/advise` | Advice formatting |
| `POST /ai/billing` | Balance query |
| `GET /ai/pricing` | Pricing info |
| `GET /auth/wechat` | WeChat OAuth redirect |
| `POST /auth/sms/send` | SMS verification (Aliyun) |
| `POST /auth/sms/verify` | SMS verification |
| `POST /discover/register` | Register tunnel URL |
| `GET /discover/lookup` | Lookup tunnel by user ID |
| `GET /health` | Health check |

## Configuration

### Environment Variables (wrangler.toml `[vars]`)

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_MODEL` | `MiniMax-M3` | LLM model name |
| `LLM_BASE_URL` | `https://api.minimaxi.com/anthropic` | LLM API base URL (Anthropic-compatible) |

### Secrets (set via `npx welian-cloud secret set`)

| Secret | Required | Description |
|--------|----------|-------------|
| `LLM_API_KEY` | ✅ | LLM provider API key |
| `CLERK_SECRET_KEY` | Optional | Clerk authentication |
| `WECHAT_APP_ID` | Optional | WeChat OAuth |

## Connect Your CLI

After deploying, configure your Welian CLI to use your cloud:

```bash
welian agent --cloud https://your-worker-url.workers.dev --user-token your-token
```

## License

MIT
