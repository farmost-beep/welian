---
title: Welian.app · 产品发布手册 v1.0
version: 1.0.0
updated: 2026-07-13
status: 发布就绪
companion: docs/SPEC_WELIAN.md（产品规约）| docs/BUSINESS_MODEL.md（商业模型）
---

# Welian.app 产品发布手册

> **本手册是 Welian Phase 1 微信 MVP 的发布操作指南——从代码冻结到用户上手，覆盖技术部署、服务配置、验证测试、用户引导全流程。**

---

## §1. 发布概览

### 1.1 发布范围

| 组件 | 形态 | 状态 | 部署位置 |
|:----|:----|:----|:----|
| Web 官网 (welian.app) | Cloudflare Pages | ✅ 已上线 | Cloudflare Pages |
| Cloud AI Worker | Cloudflare Worker | ✅ 已部署 | Cloudflare Workers |
| CLI 工具 (welian) | Python pip 包 | ✅ v1.0.0 | PyPI / GitHub |
| 微信 Bot | ilink 桥接 + launchd | ✅ 已部署 | 本机 launchd |
| 本地 Agent | WebSocket + Cloudflare Tunnel | ✅ 已部署 | 本机 launchd |
| 社交周报 | launchd 定时任务 | ✅ 已部署 | 本机 launchd (周日 20:00) |
| 诊断工具 (welian doctor) | CLI 子命令 | ✅ 已就绪 | 随 CLI 安装 |

### 1.2 发布前检查清单

- [ ] `welian doctor` 全部通过（17 项检查）
- [ ] welian.app 可访问，欢迎页正常显示
- [ ] Clerk 登录流程正常（手动登录，无自动登录）
- [ ] 微信 Bot 在线，可收发消息
- [ ] 本地 Agent 运行中，Cloudflare Tunnel 连通
- [ ] 周报定时任务已安装
- [ ] LLM API Key 有效（ANTHROPIC_API_KEY 或国产模型 Key）

---

## §2. 技术架构部署

### 2.1 架构总览

```
┌─────────────── 用户端（数据面）───────────────┐      ┌────── Welian 云（智能面）──────┐
│                                               │      │                                │
│  微信 Bot (ilink 桥接)                         │      │  Cloudflare Worker             │
│  ├─ 记/问/拟/报 全对话交互                      │      │  ├─ /ai/draft  (AI 拟稿)        │
│  └─ 数据存本地 (~/.welian/data/)               │ ───→ │  ├─ /ai/extract (记录增强)      │
│                                               │      │  ├─ /ai/advise (建议引擎)       │
│  本地 Agent (WebSocket)                        │ ←─── │  ├─ /auth/*    (Clerk/微信/短信) │
│  ├─ welian.app iframe 桥接                     │      │  └─ /discover/* (隧道发现)       │
│  └─ Cloudflare Tunnel → agent.welian.app      │      │                                │
│                                               │      │  Clerk (认证服务)               │
│  CLI 工具 (welian)                             │      │  welian.app (Cloudflare Pages)  │
│  ├─ chat / advise / dashboard                  │      │                                │
│  ├─ weekly (周报生成+推送)                      │      └────────────────────────────────┘
│  └─ doctor (系统诊断)                          │
│                                               │
│  launchd 服务                                  │
│  ├─ com.welian.bot    (微信 Bot 常驻)           │
│  ├─ com.welian.agent  (本地 Agent 常驻)         │
│  └─ com.welian.weekly (周报定时推送)            │
└───────────────────────────────────────────────┘
```

### 2.2 端云分离原则（SPEC §7.1）

- **数据归用户**：contacts.json / timeline.json / todos.json 全量存于本地 `~/.welian/data/`
- **智能来云端**：LLM 调用时仅发送最小上下文（如某联系人近 5 条时间线摘要），响应后即焚
- **云端不持久化**：Cloudflare Worker 不存储任何关系数据，不用于模型训练
- **端侧可导出**：`welian export --password XXX` 加密导出，不锁定用户

---

## §3. 部署操作

### 3.1 CLI 安装

```bash
# 从源码安装（当前推荐）
git clone https://github.com/farmost-beep/welian.git
cd welian
pip install -e .

# 验证
welian status
```

### 3.2 配置文件

```bash
# 配置目录
mkdir -p ~/.welian/config
cp config/welian.yaml ~/.welian/config/config.local.yaml

# 编辑配置
vi ~/.welian/config/config.local.yaml
```

关键配置项：

```yaml
# AI / LLM
ai:
  engine: "claude"              # claude | openai | deepseek | qwen
  model: "claude-sonnet-4-6"
  api_key_env: "ANTHROPIC_API_KEY"

# 微信 Bot
bot:
  hub_url: "ws://localhost:9800"
  bot_id: "welian-bot"

# API 服务
api:
  host: "127.0.0.1"
  port: 8000
```

环境变量：

```bash
# LLM API Key（至少一个）
export ANTHROPIC_API_KEY="sk-ant-..."

# 微信 Bot Token（从 ilink 平台获取）
export WELIAN_BOT_TOKEN="..."

# Cloud AI URL（Cloudflare Worker 地址）
export WELIAN_CLOUD_URL="https://welian-ai.farmost.workers.dev"
```

### 3.3 数据初始化

```bash
# 初始化数据目录（从模板创建空数据文件）
mkdir -p ~/.welian/data
cp data_template/*.json ~/.welian/data/

# 从 social-agent 迁移（如已有数据）
python scripts/migrate_from_social_agent.py
```

数据文件说明：

| 文件 | 内容 | 格式 |
|:----|:----|:----|
| contacts.json | 联系人库（双关系模型字段） | JSON 数组 |
| timeline.json | 互动时间线 | JSON 数组 |
| todos.json | 待办事项 | JSON 数组 |
| wechat_ids.json | 微信用户 ID 映射 | JSON 对象 |
| usage.json | 联点消耗记录 | JSON 对象 |

### 3.4 微信 Bot 部署

```bash
# 安装为 launchd 服务（开机自启 + 崩溃自动重启）
welian bot-install

# 检查状态
welian bot-status

# 手动运行（前台调试）
welian bot
```

launchd 配置：`~/Library/LaunchAgents/com.welian.bot.plist`
- 自动重启：崩溃后 5 秒重启
- 日志轮转：`~/.welian/logs/bot.log`，10MB 滚动

### 3.5 本地 Agent 部署

```bash
# 安装为 launchd 服务
welian agent-install

# 检查状态
welian agent-status

# 手动运行（带 Cloudflare Tunnel）
welian agent --tunnel
```

Agent 架构：
- HTTP 服务：`http://localhost:9800`
- WebSocket：`ws://localhost:9800/ws`
- Tunnel：`https://agent.welian.app`（Cloudflare Tunnel 自动配置）
- 桥接页面：`http://localhost:9800/`（供 welian.app iframe 嵌入）

### 3.6 社交周报部署

```bash
# 安装定时任务（每周日 20:00 自动生成并推送微信）
welian weekly-install

# 检查状态
welian weekly-status

# 手动生成（仅查看，不推送）
welian weekly

# 手动生成并推送
welian weekly --push
```

launchd 配置：`~/Library/LaunchAgents/com.welian.weekly.plist`
- 触发时间：每周日 20:00
- 自动推送：生成周报后通过微信 Bot 推送给所有已绑定用户

### 3.7 Web 官网部署

```bash
# Cloudflare Pages 部署
cd docs
npx wrangler pages deploy . --project-name=welian
```

官网功能：
- 欢迎页：tagline "每段关系都值得用心"
- Clerk 登录：Passkey / Google / Apple
- 聊天界面：ChatGPT 风格，连接本地 Agent 后可对话
- 多语言：中文 / English 切换

### 3.8 Cloud Worker 部署

```bash
cd cloud-worker
npx wrangler deploy
```

Worker 端点：

| 路径 | 方法 | 功能 |
|:----|:----|:----|
| `/ai/draft` | POST | AI 拟稿（仅接收最小上下文） |
| `/ai/extract` | POST | 记录增强（提取待办/关键点） |
| `/ai/advise` | POST | 建议引擎格式化 |
| `/auth/wechat` | GET | 微信 OAuth 重定向 |
| `/auth/sms/send` | POST | 短信验证码发送 |
| `/auth/sms/verify` | POST | 短信验证码校验 |
| `/discover/register` | GET | 注册隧道 URL |
| `/discover/lookup` | GET | 按用户 ID 查找隧道 |
| `/health` | GET | 健康检查 |

---

## §4. 认证与连接

### 4.1 Clerk 认证

Welian 使用 Clerk 作为认证服务，支持 Passkey / Google / Apple 登录。

**CLI 登录**（将本地 Agent 关联到 Clerk 账户）：

```bash
welian login
# → 浏览器打开 welian.app?cli_callback=http://localhost:9876
# → 用户在网页登录
# → Clerk 回调 localhost:9876?user_id=xxx
# → 保存到 ~/.welian/auth.json
```

**Web 登录**：
- 用户访问 welian.app
- 点击 "Sign in" → 弹出 Clerk 登录表单
- 登录成功后自动连接本地 Agent（通过隧道发现）
- **无自动登录**：每次访问需手动点击 Sign in

### 4.2 隧道发现机制

```
用户在手机浏览器访问 welian.app
  → Clerk 登录获得 user_id
  → 查询 Cloud Worker: GET /discover/lookup?user_id=xxx
  → 返回 tunnel_url: https://agent.welian.app
  → 嵌入 iframe → WebSocket 连接本地 Agent
  → Agent 验证配对令牌 → auth_ok
```

---

## §5. 功能验证

### 5.1 系统诊断

```bash
# 全面诊断（17 项检查）
welian doctor
```

诊断项目：

| # | 检查项 | 通过条件 |
|:-:|:----|:----|
| 1 | Python 环境 | Python 3.9+ |
| 2 | 数据文件 | contacts/timeline/todos 存在且可读 |
| 3 | LLM 配置 | API Key 环境变量已设置 |
| 4 | 微信 Bot 服务 | launchd 服务已加载且运行中 |
| 5 | 本地 Agent 服务 | launchd 服务已加载且运行中 |
| 6 | 周报服务 | launchd 服务已加载 |
| 7 | Agent HTTP | localhost:9800 可访问 |
| 8 | Cloudflare Tunnel | agent.welian.app 可访问 |
| 9 | cloudflared 进程 | 进程运行中 |
| 10 | Bot Token | WELIAN_BOT_TOKEN 已设置 |
| 11 | Bot 用户 | bot_users.json 有记录 |
| 12 | Bot 日志 | 无近期错误 |
| 13 | 前端可达 | welian.app 返回 200 |
| 14 | Cloud Worker | Worker 返回 200 |
| 15-17 | 预留扩展 | — |

### 5.2 功能测试矩阵

| 功能 | 测试方式 | 预期结果 |
|:----|:----|:----|
| **记** | 微信发"记一下：和张总聊了预算" | Bot 回复确认 + 待办提取 |
| **问** | 微信发"明天见李总，上次聊到哪了" | Bot 返回该联系人近期互动摘要 |
| **拟** | 微信发"给老王拟条生日祝福" | Bot 返回草稿，可确认发送 |
| **报** | `welian weekly` | 生成周报（本周回顾+下周建议） |
| **报推送** | `welian weekly --push` | 周报推送到微信 |
| **建议** | `welian advise` | 返回该联系谁+为什么+聊什么 |
| **仪表盘** | `welian dashboard` | 月度角色回顾（朋友/家人/合作者） |
| **Web 对话** | welian.app 登录后聊天 | 连接本地 Agent，实时对话 |
| **导出** | `welian export --password XXX` | 生成加密数据包 |
| **联点** | `welian balance` | 显示剩余联点 |

### 5.3 微信 Bot 验证

```bash
# 1. 确认 Bot 在线
welian bot-status

# 2. 查看日志
tail -f ~/.welian/logs/bot.log

# 3. 微信发送测试消息
# 在微信中给 Bot 发送: /help
# 预期: 返回命令列表

# 4. 测试记录功能
# 发送: 记一下：测试记录
# 预期: Bot 回复 "✓ 已记录" + 待办提取
```

---

## §6. 用户引导

### 6.1 新用户上手路径

```
1. 微信加 Bot 为好友（扫码或搜索）
2. 发送任意消息 → Bot 自动创建会话
3. 发送 "记一下：今天和XX聊了YY" → 体验记录功能
4. 发送 "该联系谁" → 体验建议引擎
5. 发送 "给XX拟条消息" → 体验拟稿功能
6. 周日 20:00 自动收到周报
```

### 6.2 Web 用户上手路径

```
1. 访问 welian.app
2. 点击 "Sign in" → Clerk 登录
3. 自动连接本地 Agent（需电脑上运行 welian agent --tunnel）
4. 在聊天框对话
```

### 6.3 CLI 用户上手路径

```bash
# 安装
pip install welian

# 初始化
welian login          # 关联 Clerk 账户
welian status         # 查看数据概览

# 日常使用
welian chat "记一下：和张总聊了预算方案"
welian advise         # 该联系谁
welian dashboard      # 月度回顾
welian weekly         # 周报
```

---

## §7. 运维监控

### 7.1 日志位置

| 服务 | 日志路径 |
|:----|:----|
| 微信 Bot | `~/.welian/logs/bot.log`（10MB 轮转） |
| 本地 Agent | `~/.welian/logs/agent.log` |
| 周报 | `~/.welian/logs/weekly.log` |
| Cloud Worker | Cloudflare Dashboard → Workers → Logs |
| Web 访问 | Cloudflare Dashboard → Pages → Analytics |

### 7.2 常见问题排查

| 症状 | 排查步骤 |
|:----|:----|
| Bot 不回复微信消息 | `welian bot-status` → 检查日志 → 确认 BOT_TOKEN |
| Web 无法连接 Agent | `welian agent-status` → 检查 Tunnel → `curl agent.welian.app/health` |
| 周报未推送 | `welian weekly-status` → 手动 `welian weekly --push` 测试 |
| LLM 调用失败 | 检查 API Key → `welian doctor` 第 3 项 |
| 登录后回到欢迎页 | 清除 sessionStorage → 重新登录 → 检查 Clerk 配置 |

### 7.3 服务管理命令

```bash
# Bot
welian bot-install       # 安装服务
welian bot-uninstall     # 卸载服务
welian bot-status        # 状态检查
welian bot               # 前台运行（调试用）

# Agent
welian agent-install
welian agent-uninstall
welian agent-status
welian agent --tunnel    # 前台运行

# 周报
welian weekly-install
welian weekly-uninstall
welian weekly-status

# 全面诊断
welian doctor
```

---

## §8. 联点系统（商业层）

### 8.1 联点定价（BUSINESS_MODEL §2-3）

| 动作 | 联点消耗 |
|:----|:--:|
| AI 记录增强 | 2 |
| AI 拟稿 | 3 |
| 建议引擎 | 3 |
| 社交周报 | 3 |
| 见面功课 | 3 |
| 角色仪表盘 | 5 |
| 年度报告 | 20 |

### 8.2 免费额度

- 每月 100 联点免费
- 记录层（记/问）永久免费（不消耗联点）
- 查询余额：`welian balance`

### 8.3 当前状态

Phase 1 阶段联点系统为**记账模式**（不实际扣费），用于收集用量数据验证定价模型。支付系统在 M2 付费验证门槛通过后接入。

---

## §9. 数据安全与合规

### 9.1 数据存储

| 数据 | 存储位置 | 加密 |
|:----|:----|:----|
| 联系人库 | 本地 `~/.welian/data/contacts.json` | 无（用户设备） |
| 时间线 | 本地 `~/.welian/data/timeline.json` | 无 |
| 待办 | 本地 `~/.welian/data/todos.json` | 无 |
| 联点记录 | 本地 `~/.welian/data/usage.json` | 无 |
| Clerk 认证 | 本地 `~/.welian/auth.json` | 无 |
| LLM 上下文 | 云端（即用即焚） | 传输 TLS 1.3 |

### 9.2 数据导出与迁移

```bash
# 加密导出
welian export --password mypassword
# → 生成 welian_export_20260713.enc

# 导入到新设备
welian import welian_export_20260713.enc --password mypassword
```

### 9.3 合规要点（SPEC §7.2）

- 《个人信息保护法》：端侧存储天然最小化；云端仅处理最小上下文
- 《生成式AI服务管理暂行办法》：默认接入已备案国产模型（DeepSeek/Qwen/GLM）
- 微信生态规范：Bot 不做诱导分享，小程序类目合规

---

## §10. 发布后监控指标（SPEC §10）

### 10.1 北极星指标

**每周被用心对待的关系行动数**：用户因为 Welian 而采取的行动（联系了、到场了、做到了）。

### 10.2 M1 种子期门槛（+3 月）

| 指标 | 门槛 |
|:----|:----|
| 注册用户 | 500 |
| 周活跃记录率 | >40% |
| 北极星（周兑现行动）人均 | >1 |

### 10.3 监控数据来源

| 指标 | 数据来源 |
|:----|:----|
| 注册用户 | Clerk Dashboard |
| 周活跃记录率 | 本地 timeline.json 统计 |
| 建议采纳率 | 本地 todos.json 状态变更 |
| 联点消耗 | 本地 usage.json |
| Bot 活跃 | bot_users.json + Bot 日志 |

---

## §11. 回滚与应急

### 11.1 服务回滚

```bash
# 停止所有服务
welian bot-uninstall
welian agent-uninstall
welian weekly-uninstall

# 回滚 CLI 版本
pip install welian==1.0.0  # 指定版本

# Web 回滚
# Cloudflare Pages → Deployments → 回滚到上一版本
```

### 11.2 数据备份

```bash
# 发布前备份
welian export --password backup
cp welian_export_*.enc ~/Backups/

# 紧急恢复
welian import ~/Backups/welian_export_*.enc --password backup
```

---

## §12. 联系与支持

| 事项 | 渠道 |
|:----|:----|
| 产品官网 | https://welian.app |
| 开源代码 | https://github.com/farmost-beep/welian |
| 问题反馈 | GitHub Issues |
| 用户支持 | 微信 Bot 内直接对话 |

---

**最后更新**：2026-07-13
**版本**：v1.0.0
**状态**：发布就绪
**配套文档**：`SPEC_WELIAN.md`（产品规约）| `BUSINESS_MODEL.md`（商业模型）
