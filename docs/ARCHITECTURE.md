---
title: Welian.app · 架构设计与自进化方案 v1.0
version: 1.0.0
updated: 2026-07-13
status: 设计文档
companion: docs/SPEC_WELIAN.md（产品规约）| docs/BUSINESS_MODEL.md（商业模型）| docs/RELEASE_MANUAL.md（发布手册）
---

# Welian.app 架构设计与自进化方案

> **本方案定义 Welian 的技术架构、模块设计、数据流、演进机制与自进化闭环。
> 架构继承 SPEC §7-8（端云分离 + 技术选型），自进化继承 ROADMAP_v5 §2（数据飞轮）与 SPEC §9（演进路线）。**

---

## §1. 架构总览

### 1.1 设计原则

| # | 原则 | 来源 | 架构体现 |
|:-:|:----|:----|:----|
| 1 | **数据归用户，智能来云端** | SPEC §7.1 | 端侧持有全量数据，云端仅处理最小上下文 |
| 2 | **数据先于功能** | ROADMAP §原则十三 | 功能解锁由数据量触发，非设计冲动 |
| 3 | **双关系模型不可撤销伦理保护** | SPEC §2.7 | 维系型关系在引擎层禁止 ROI 计算 |
| 4 | **LLM 可替换** | SPEC §8 | LLM Gateway 抽象层，provider 注册表扩展 |
| 5 | **微信优先** | SPEC §5.1 | Bot 对话是最小完整产品，Web/CLI 是补充 |
| 6 | **AI-First 运营** | BUSINESS §8.1 | 一个人 + AI 军团，近零人力成本 |

### 1.2 系统拓扑

```
                          ┌─────────────────────────────────────────────┐
                          │              Welian 云（智能面）              │
                          │                                             │
                          │  Cloudflare Worker (welian-ai.*.workers.dev) │
                          │  ├─ /ai/draft     AI 拟稿                    │
                          │  ├─ /ai/extract   记录增强                    │
                          │  ├─ /ai/advise    建议格式化                  │
                          │  ├─ /auth/*       Clerk/微信/短信认证          │
                          │  └─ /discover/*   隧道发现                     │
                          │                                             │
                          │  Cloudflare Pages (welian.app)               │
                          │  └─ Web UI (ChatGPT 风格聊天界面)             │
                          │                                             │
                          │  Clerk (认证服务)                             │
                          │  └─ Passkey/Google/Apple/微信/短信            │
                          └──────────────┬──────────────────────────────┘
                                         │ HTTPS (最小上下文)
                                         │
          ┌──────────────────────────────┼──────────────────────────────┐
          │          用户端（数据面）        │                              │
          │                              │                              │
          │  ┌─────────────┐    ┌────────┴───────┐    ┌──────────────┐  │
          │  │  微信 Bot    │    │  本地 Agent     │    │  CLI 工具     │  │
          │  │  (ilink桥接) │    │  (WebSocket)    │    │  (welian)    │  │
          │  │              │    │                 │    │              │  │
          │  │  记/问/拟/报  │    │  iframe桥接     │    │  chat/advise │  │
          │  │  全对话交互   │    │  Tunnel暴露     │    │  dashboard   │  │
          │  │              │    │                 │    │  weekly      │  │
          │  └──────┬───────┘    └────────┬────────┘    └──────┬───────┘  │
          │         │                     │                     │          │
          │         └──────────┬──────────┴─────────────────────┘          │
          │                    │                                           │
          │         ┌──────────┴──────────┐                                │
          │         │  Welian Engine       │                                │
          │         │  (Python 核心引擎)    │                                │
          │         │                      │                                │
          │         │  双关系模型 + 四动词  │                                │
          │         │  联点计费 + 数据CRUD  │                                │
          │         │                      │                                │
          │         │  数据存储 (JSON)      │                                │
          │         │  ~/.welian/data/     │                                │
          │         └──────────────────────┘                                │
          │                                                                  │
          │  launchd 服务                                                     │
          │  ├─ com.welian.bot    (Bot 常驻)                                  │
          │  ├─ com.welian.agent  (Agent 常驻)                                │
          │  └─ com.welian.weekly (周报定时)                                  │
          └──────────────────────────────────────────────────────────────────┘
```

### 1.3 三层架构（SPEC §6）

```
┌─────────────────────────────────────────────────────────────────┐
│  成长层（会员专属）                                                │
│  ├─ 角色仪表盘 (role_dashboard)     5 联点                       │
│  ├─ 年度关系报告 (annual_report)   20 联点                       │
│  ├─ 关系组合分析 (portfolio_analysis)                            │
│  └─ 引荐路径 (find_path)                                         │
├─────────────────────────────────────────────────────────────────┤
│  智能层（联点计费·云端 LLM）                                       │
│  ├─ AI 记录增强 (ai_record_enhance)  2 联点                      │
│  ├─ AI 拟稿 (ai_draft)               3 联点                      │
│  ├─ 建议引擎 (advise_engine)         3 联点                      │
│  ├─ 社交周报 (weekly_report)         3 联点                      │
│  ├─ 见面功课 (meeting_prep)          3 联点                      │
│  └─ 目标锚定助手 (anchor_assist)     3 联点                      │
├─────────────────────────────────────────────────────────────────┤
│  记录层（免费·本地优先）                                            │
│  ├─ 快速记录 (record)              0 联点                        │
│  ├─ 联系人库 (contacts)            0 联点                        │
│  ├─ 时间线 (timeline)              0 联点                        │
│  ├─ 待办提取 (todo)                0 联点                        │
│  └─ 提醒 (reminder)                0 联点                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## §2. 模块设计

### 2.1 核心引擎 (engine.py)

**职责**：双关系模型 + 四动词 + 数据 CRUD，纯本地运行，不依赖网络。

```
engine.py
├─ 数据管理
│  ├─ _load() / _save()          JSON 读写
│  ├─ _init_paths()              路径初始化（WELIAN_HOME 优先级）
│  └─ _load_config()             YAML 配置加载
│
├─ 联系人管理
│  ├─ list_contacts()            列表（支持 nature/role/tag 过滤）
│  ├─ add_contact()              新增（默认撬动型，家人默认维系型）
│  ├─ get_contact() / resolve_contact()  查找（ID/名称/别名模糊匹配）
│  ├─ update_contact()           更新
│  └─ infer_nature()             推断关系类型
│
├─ 双关系模型
│  ├─ set_nature()               设置关系类型（撬动/维系/双重）
│  ├─ set_leverage()             撬动维度（goals/how/direction）
│  ├─ get_leverage()             读取撬动维度
│  ├─ add_memory()               维系维度·记忆库
│  ├─ add_important_date()       维系维度·重要日期
│  ├─ set_bond()                 维系维度·关系描述
│  ├─ add_presence_event()       维系维度·在场事件
│  └─ get_nurture_info()         读取维系维度
│
├─ 时间线与待办
│  ├─ add_timeline()             添加互动记录 + 自动提取待办
│  ├─ list_timeline()            查询时间线（支持天数/联系人过滤）
│  ├─ _auto_add_todo()           从互动中自动提取待办
│  ├─ list_todos()               待办列表（支持优先级/状态）
│  └─ complete_todo()            完成待办
│
├─ 建议引擎
│  ├─ advise_leverage()          撬动型建议（冷却预警 14/21 天 + 三元组）
│  ├─ advise_nurture()           维系型建议（重要日期 + 心意建议）
│  └─ _days_since_last()         距上次互动天数
│
├─ 角色成长
│  ├─ role_dashboard()           月度角色回顾（朋友/家人/合作者）
│  ├─ contact_role()             联系人角色推断
│  └─ get_dashboard()            全局仪表盘
│
└─ 兑现追踪
   ├─ add_outcome()              记录兑现（人脉兑现/承诺兑现）
   └─ get_birthdays()            近期生日提醒
```

**伦理护栏（代码级强制）**：

```python
# engine.py 中 advise_nurture() 明确不做：
# - 不计算 ROI
# - 不做冷却预警（家人不需要 14 天检查）
# - 不做强度排序
# - 不做互动次数排名
# 仅返回：重要日期 + 心意建议 + 在场提醒
```

### 2.2 LLM 抽象层 (llm/)

**职责**：解耦大模型调用，上层代码不依赖具体 provider。

```
llm/
├─ base.py               抽象基类 + 异常体系
│  ├─ LLMClient(ABC)     complete() / complete_with_retry()
│  ├─ LLMError           基类异常
│  ├─ LLMAuthError       认证失败
│  ├─ LLMRateLimitError  速率限制（触发退避）
│  ├─ LLMTimeoutError    超时
│  └─ LLMResponseError   响应异常
│
├─ claude.py             Claude provider (Anthropic API)
├─ openai.py             OpenAI-compatible provider (也支持 DeepSeek/Qwen)
└─ router.py             工厂 + 配置路由
   ├─ _PROVIDERS         注册表（扩展只需加一行）
   ├─ get_client()       单例工厂
   └─ list_providers()   列出可用 provider
```

**扩展新模型**（SPEC §8 LLM Gateway）：

```python
# 1. 实现 LLMClient 子类
class DeepSeekClient(OpenAIClient):  # DeepSeek 兼容 OpenAI API
    ...

# 2. 注册到 _PROVIDERS
_PROVIDERS["deepseek"] = DeepSeekClient

# 3. 配置切换
# config.local.yaml:
# ai:
#   engine: "deepseek"
```

### 2.3 意图解析 (intent.py)

**职责**：自然语言 → 动作映射，支持四动词 + 扩展意图。

```
intent.py
├─ INTENT_RECORD    "记一下：..."     → engine.add_timeline()
├─ INTENT_ASK       "该联系谁"        → engine.advise_leverage() + advise_nurture()
├─ INTENT_DRAFT     "给X拟条消息"     → ai.draft_message()
├─ INTENT_REPORT    "月度回顾"        → engine.role_dashboard()
├─ INTENT_CHECK     "X最近咋样"       → engine.get_nurture_info()
├─ INTENT_QUERY     "有多少联系人"    → engine.list_contacts()
├─ INTENT_TODO      "待办"           → engine.list_todos()
├─ INTENT_ALIAS     "X就是Y"         → engine.update_contact()
├─ INTENT_HELP      "帮助"           → 返回帮助文本
└─ INTENT_UNKNOWN   无法识别          → LLM 兜底理解
```

**解析策略**：正则优先（零成本、零延迟），LLM 兜底（自然语言理解）。

### 2.4 边缘客户端 (edge.py)

**职责**：端侧 SDK，持有全量数据，按需提取最小上下文调用 LLM。

```
edge.py — EdgeClient
├─ chat(text)                 主入口：意图解析 → 路由 → 响应
├─ _gather_context()          按意图提取最小上下文
│  ├─ _gather_record()        记录：联系人匹配信息
│  ├─ _gather_ask()           建议：top-5 候选 + 近期互动摘要
│  ├─ _gather_draft()         拟稿：联系人记忆 + 上次互动
│  ├─ _gather_report()        报告：月度数据汇总
│  ├─ _gather_check()         查看：维系信息 + 在场事件
│  ├─ _gather_query()         查询：联系人统计
│  └─ _gather_todo()          待办：待办列表
├─ _llm_respond()             LLM 生成响应
├─ _template_respond()        无 LLM 时的模板兜底
├─ export_data()              加密导出
├─ import_data()              加密导入
├─ _encrypt() / _decrypt()    AES 加密
└─ _handle_*()                各意图的具体处理
```

**端云分离的关键**：`_gather_*` 方法只提取 LLM 所需的最小上下文（如某联系人近 5 条时间线摘要），**不发送完整 contacts.json 或 timeline.json**。

### 2.5 微信 Bot (bot/handler.py)

**职责**：ilink 桥接，微信对话即产品。

```
bot/handler.py
├─ 长轮询循环
│  ├─ getUpdates()             35s 长轮询获取消息
│  ├─ 自动重连                  超时/失败后 3s 重连，最多 10 次
│  └─ 优雅关闭                  SIGTERM/SIGINT 信号处理
│
├─ 消息处理
│  ├─ 用户会话管理              per-user data isolation
│  ├─ EdgeClient.chat()         调用边缘客户端
│  ├─ 速率限制                  2.5s/user 间隔
│  ├─ 长消息分割                >2000 字自动分段
│  └─ 斜杠命令                  /help /status /reset /who
│
├─ 用户绑定
│  ├─ bot_users.json            微信用户 ID 持久化
│  └─ 周报推送目标              weekly.py 读取此文件推送
│
└─ 日志
   └─ RotatingFileHandler       10MB 滚动，~/.welian/logs/bot.log
```

### 2.6 本地 Agent (agent.py)

**职责**：WebSocket 桥接，让 welian.app 网页连接本地数据。

```
agent.py
├─ HTTP 服务 (aiohttp)
│  ├─ GET /            → bridge.html (iframe 桥接页)
│  ├─ GET /health      → 健康检查 JSON
│  └─ WS /ws           → WebSocket 处理器
│
├─ WebSocket 协议
│  ├─ auth             配对令牌验证
│  ├─ chat             对话消息（转发到 EdgeClient）
│  ├─ advise           建议请求
│  └─ dashboard        仪表盘请求
│
├─ Cloudflare Tunnel
│  ├─ 自动启动          agent --tunnel 时启动 cloudflared
│  ├─ 隧道注册          向 Cloud Worker 注册 tunnel_url
│  └─ 健康检查          agent.welian.app/health
│
└─ 桥接页面 (bridge.html)
   ├─ postMessage 通信   与父窗口 (welian.app) 双向通信
   ├─ WebSocket 连接     same-origin 连接本地 WS
   └─ 令牌注入           Agent 注入配对令牌到页面
```

### 2.7 周报模块 (weekly.py)

**职责**：数据采集 + LLM 生成周报 + 微信推送。

```
weekly.py
├─ gather_weekly_data()        采集周报数据
│  ├─ 本周时间线               Monday → Sunday
│  ├─ 完成/待办待办             todos 状态统计
│  ├─ 联系人触达                本周互动的联系人
│  ├─ 近期生日                 14 天内生日提醒
│  └─ 维系提醒                 重要日期/在场提醒
│
├─ generate_report(data)       LLM 生成周报正文
│  ├─ 系统提示词               Welian 人格 + 周报格式
│  └─ 自然语言总结             上周回顾 + 下周建议
│
└─ push_to_wechat(report)      微信推送
   ├─ 读取 bot_users.json      获取推送目标
   └─ Bot API 发送             逐用户推送
```

### 2.8 联点系统 (tokens.py)

**职责**：联点计费，追踪消耗，免费额度管理。

```
tokens.py
├─ TOKEN_COSTS                 动作→联点映射表
├─ FREE_MONTHLY_ALLOWANCE      免费额度 100/月
├─ PRO_MONTHLY_ALLOWANCE       Pro 额度 500/月
├─ get_usage()                 读取消耗记录
├─ consume(action, count)      扣减联点
├─ get_balance()               查询余额
└─ check_and_consume()         检查+扣减（原子操作）
```

### 2.9 Cloud Worker (cloud-worker/src/worker.js)

**职责**：云端 AI API，无状态，不存储数据。

```
worker.js
├─ /ai/draft                   AI 拟稿（接收最小上下文）
├─ /ai/extract                 记录增强（提取待办/关键点）
├─ /ai/advise                  建议格式化（不参与评分）
├─ /auth/wechat                微信 OAuth 重定向
├─ /auth/sms/send              短信验证码（阿里云）
├─ /auth/sms/verify            短信验证码校验
├─ /discover/register          注册隧道 URL
├─ /discover/lookup            按用户 ID 查找隧道
├─ /discover/link              设备 ID 关联用户 ID
└─ /health                     健康检查
```

**端云分离的关键**：Worker 只接收 `{name, nature, memories[], last_interaction, context}` 等最小字段，**不接收也不存储完整联系人数据**。

---

## §3. 数据架构

### 3.1 数据模型

**联系人 (contacts.json)**：

```json
{
  "id": "uuid",
  "name": "王明",
  "alias": ["老王", "王总"],
  "relation": "行业峰会认识",
  "nature": "双重",                    // 撬动 | 维系 | 双重
  "tags": ["事业", "引荐人"],
  "role": "collaborator",              // friend | family | collaborator
  "leverage": {                        // nature 含"撬动"时有效
    "goals": ["事业"],
    "how": "行业峰会资源引荐",
    "direction": "互惠",               // 互惠 | 报恩 | 单向
    "confirmed": "2026-07-15"
  },
  "nurture": {                         // nature 含"维系"时有效
    "bond": "十五年老友",
    "important_dates": [{"date": "11-29", "label": "生日", "dtype": "birthday"}],
    "memories": [{"content": "儿子小宇今年中考", "tags": ["家庭"], "date": "2026-06-01"}],
    "presence_events": ["父亲住院时他来陪床"]
  },
  "created": "2026-07-12",
  "last_interaction": "2026-07-10"
}
```

**时间线 (timeline.json)**：

```json
{
  "id": "uuid",
  "contact_id": "uuid",
  "date": "2026-07-10",
  "summary": "聊了Q3预算方案，他下周给答复",
  "type": "message",                   // message | meeting | call | event
  "key_points": ["Q3预算", "下周答复"],
  "pending": "等张总Q3预算答复",
  "emotion": "positive"                // positive | neutral | negative (可选)
}
```

**待办 (todos.json)**：

```json
{
  "id": "uuid",
  "contact_id": "uuid",
  "task": "跟进张总Q3预算",
  "priority": "high",                   // high | medium | low
  "status": "pending",                  // pending | done
  "source": "timeline",                 // timeline | manual | advise
  "source_id": "timeline_uuid",
  "due": "2026-07-17",
  "created": "2026-07-10",
  "completed": null
}
```

**联点消耗 (usage.json)**：

```json
{
  "default": {
    "plan": "free",
    "tokens_used": {"2026-07": {"ai_draft": 3, "advise_engine": 6}},
    "total_used": {"2026-07": 9},
    "purchased": 0
  }
}
```

### 3.2 数据存储演进路线

| 阶段 | 存储 | 触发条件 | 迁移方案 |
|:----|:----|:----|:----|
| Phase 1 (当前) | JSON 文件 | — | — |
| Phase 2 | SQLite | 联系人 >200 或时间线 >1000 | JSON → SQLite 自动迁移脚本 |
| Phase 3 | 端侧 SQLite + 加密云备份 | 多端同步需求 | SQLite + 增量同步 |

### 3.3 端云数据流

```
用户输入 "记一下：和张总聊了预算"
    │
    ▼
┌─ 端侧 (edge.py) ──────────────────────────────┐
│ 1. intent.py 解析 → INTENT_RECORD              │
│ 2. engine.add_timeline() → 写入 timeline.json  │
│ 3. engine._auto_add_todo() → 写入 todos.json   │
│ 4. [可选] 提取最小上下文 → 调用 LLM 增强         │
│    └─ 上下文：{text: "聊了预算方案", contact: "张总"} │
│    └─ LLM 返回：{pending: "等预算答复", key_points: ["Q3预算"]} │
│ 5. 联点扣减：tokens.consume("ai_record_enhance", 2) │
└────────────────────────────────────────────────┘
                    │
                    ▼ (仅步骤 4 的最小上下文)
┌─ 云端 (Worker) ───────────────────────────────┐
│ POST /ai/extract                               │
│ Body: {text: "聊了预算方案"}                    │
│ → 调用 LLM → 返回 {pending, key_points}        │
│ → 不存储任何数据，响应后即焚                     │
└────────────────────────────────────────────────┘
```

---

## §4. 接口设计

### 4.1 CLI 接口

```
welian <command> [options]

# 记录层（免费）
welian status                    # 数据概览
welian chat "记一下：..."         # 对话交互
welian contacts                  # 联系人列表
welian add "王明" --relation "..." # 添加联系人

# 智能层（联点计费）
welian advise                    # 该联系谁+为什么+聊什么
welian dashboard                 # 月度角色回顾
welian weekly [--push]           # 周报生成（+推送）

# 服务管理
welian bot-install/uninstall/status
welian agent-install/uninstall/status
welian weekly-install/uninstall/status
welian agent [--tunnel]          # 前台运行 Agent

# 数据管理
welian export [--password XXX]   # 加密导出
welian import <file> [--password XXX]
welian balance                   # 联点余额
welian login / logout            # Clerk 认证

# 诊断
welian doctor                    # 17 项系统检查
```

### 4.2 Bot 对话协议

```
用户 → Bot:
  记一下：和张总聊了预算方案
  该联系谁
  给老王拟条生日祝福
  本月角色回顾
  张总最近咋样
  /help

Bot → 用户:
  ✓ 已记录
  联系人：张总 · 撬动[事业]
  待办：等张总Q3预算答复（已自动提取）
  
  💡 本周值得联系：
  🔴 张总 — 14天未联系 · 撬动[事业]
     聊什么：Q3预算方案进展
  ...
```

### 4.3 WebSocket 协议 (Agent)

```json
// Client → Agent
{"type": "auth", "token": "pairing_token"}
{"type": "chat", "id": "req_123", "text": "该联系谁"}

// Agent → Client
{"type": "auth_ok"}
{"type": "response", "reply": "💡 本周值得联系..."}
{"type": "error", "message": "..."}
```

### 4.4 Cloud Worker API

```
POST /ai/draft
  Body: {name, nature, memories[], last_interaction, context, tone}
  Resp: {draft: "Hey! It's been way too long..."}

POST /ai/extract
  Body: {text: "聊了预算方案，他下周给答复"}
  Resp: {pending: "等预算答复", key_points: ["Q3预算"]}

POST /ai/advise
  Body: {candidates: [{name, days, goal, how}...], nurture: [...]}
  Resp: {result: "💡 本周值得联系..."}

GET /discover/lookup?user_id=xxx
  Resp: {found: true, tunnel_url: "https://agent.welian.app"}
```

---

## §5. 自进化方案

### 5.1 数据飞轮（核心引擎）

> **数据飞轮是 Welian 的第一性增长引擎——记录摩擦每降一分，全线功能价值升一档。**

```
        ┌──────────────────────────────────────────┐
        │                                          │
        ▼                                          │
  ① 记录（零摩擦免费）                                │
  │ "记一下：和张总聊了预算"                           │
  │ → timeline +1, todos +1                        │
  │                                                │
  ▼                                                │
  ② 数据积累                                        │
  │ timeline 34条/月 → 100条/月                      │
  │ contacts 33人 → 80人                            │
  │                                                │
  ▼                                                │
  ③ 建议变准                                         │
  │ advise_leverage() 有足够数据排序                  │
  │ advise_nurture() 有记忆库支撑心意建议              │
  │                                                │
  ▼                                                │
  ④ 价值显现                                         │
  │ 周报"懂你"了 → 用户感到被理解                     │
  │ 建议被采纳 → 用户采取行动                         │
  │                                                │
  ▼                                                │
  ⑤ 习惯形成                                         │
  │ 周活跃记录率 >40%                                 │
  │ 记录成为肌肉记忆                                  │
  │                                                │
  ▼                                                │
  ⑥ 免费额度不够用                                    │
  │ 100 联点/月 ≈ 10 次拟稿 + 1 份周报               │
  │ → 自然付费墙                                     │
  │                                                │
  ▼                                                │
  ⑦ 订阅转化                                         │
  │ → 更多使用 → 数据更厚 → 建议更准                   │
  │   → 留存护城河（个人数据网络效应）                  │
  │                                                │
  └────────────────────────────────────────────────┘
```

### 5.2 四个减摩机制（ROADMAP_v5 §2）

| # | 机制 | 当前实现 | 演进方向 |
|:-:|:----|:----|:----|
| 1 | **输入减摩** | 微信 Bot 对话即记录 | 语音输入 → 自动转写记录 |
| 2 | **理解减摩** | 正则 + LLM 意图解析 | 意图准确率监控 + 自动补丁 |
| 3 | **行动减摩** | 建议三元组 + 一键拟稿 | 拟稿后一键发送（微信内） |
| 4 | **反馈减摩** | 待办状态手动标记 | 自动检测互动完成（时间线匹配待办） |

### 5.3 建议质量自进化

```
┌─────────────────────────────────────────────────┐
│  建议质量闭环                                      │
│                                                  │
│  ① advise_leverage() 生成建议三元组                │
│     (who + why + what_to_say)                    │
│                                                  │
│  ② 用户行动反馈                                    │
│     - 采纳：timeline 新增互动 → _days_since_last 重置 │
│     - 忽略：建议未触发行动 → 冷却计数继续            │
│     - 拒绝：用户标记"不合适" → 建议降权             │
│                                                  │
│  ③ 采纳率统计                                      │
│     - 按联系人维度：某类联系人建议采纳率高/低         │
│     - 按目标维度：某目标维度的建议质量               │
│     - 按时间维度：建议发送时机的效果                 │
│                                                  │
│  ④ 参数自调优                                      │
│     - 冷却阈值动态调整（14/21天 → 按用户节奏）       │
│     - 建议条数自适应（采纳率高→增至5条，低→降至2条）  │
│     - 建议措辞学习（采纳率高的措辞模式复用）          │
│                                                  │
│  ⑤ LLM Prompt 迭代                                │
│     - 系统提示词版本化（DRAFT_SYSTEM v1 → v2）      │
│     - A/B 测试不同 prompt 的采纳率                  │
│     - 高采纳率对话模式注入 prompt 示例              │
│                                                  │
│  目标：建议采纳率 >30%（SPEC §10 价值指标）          │
└─────────────────────────────────────────────────┘
```

### 5.4 双关系模型自进化

```
┌─────────────────────────────────────────────────┐
│  关系类型流动检测                                    │
│                                                  │
│  ① 信号采集                                        │
│     - timeline 情感词密度变化                      │
│     - 互动场景变化（工作→私人）                     │
│     - 互动频率突变（骤增/骤减）                     │
│     - 称呼变化（"张总"→"老张"）                     │
│                                                  │
│  ② 流动提示                                        │
│     - 检测到信号 → 提示用户确认                     │
│     - "你和老张最近聊了不少私事，要更新关系类型吗？"   │
│     - 绝不自动改类（SPEC §2.4）                    │
│                                                  │
│  ③ 升级触发器（SPEC §2.7）                         │
│     - >40% 联系人标注"双重" → 二分升级为光谱模型     │
│     - 上级/恩师类建议采纳率低 → 增加"尊长"修饰符     │
│     - "撬动"语义负反馈集中于恩人 → 独立"恩义"标记    │
│                                                  │
│  ④ 不变量（不可撤销）                               │
│     - 维系型关系不被计量的伦理保护                   │
│     - 无论模型如何升级，此条永久有效                  │
└─────────────────────────────────────────────────┘
```

### 5.5 LLM 路由自进化

```
┌─────────────────────────────────────────────────┐
│  模型分级与动态路由                                  │
│                                                  │
│  ① 场景分级（当前）                                 │
│     - 标准（×1）：DeepSeek/Qwen/GLM → 日常全部场景  │
│     - 增强（×3）：Sonnet 级 → 重要拟稿、复杂建议     │
│     - 最强（×10）：Opus/GPT-5 级 → 年度报告、关键文稿│
│                                                  │
│  ② 质量监控                                        │
│     - 每次调用记录：场景/模型/响应质量评分             │
│     - 用户隐式反馈：采纳/修改/重试                   │
│                                                  │
│  ③ 动态路由（Phase 2）                              │
│     - 简单记录增强 → 自动降级到最便宜模型             │
│     - 重要拟稿 → 自动升级到增强模型                  │
│     - 用户满意度低 → 自动切换模型并重试              │
│                                                  │
│  ④ 成本优化                                        │
│     - 缓存高频请求（如见面功课对同一联系人）          │
│     - 批量处理（周报一次调用覆盖多个场景）            │
│     - 国产模型默认 + 旗舰按需 = 成本分级 = 联点分级   │
└─────────────────────────────────────────────────┘
```

### 5.6 数据量驱动的功能解冻

| 功能 | 解冻条件 | 当前状态 | 理由 |
|:----|:----|:----|:----|
| 建议引擎 | 联系人 ≥10 + 时间线 ≥30 | ✅ 已解冻 | 需要足够数据排序 |
| 角色仪表盘 | 时间线 ≥50（近 30 天） | ✅ 已解冻 | 需要月度数据量 |
| 关系组合分析 | 联系人 ≥30 + 锚定目标 ≥3 | ⏳ 待数据 | SPEC §6.3 成长层 |
| 引荐路径 | 联系人 ≥50 + 互动密度达标 | ⏳ 待数据 | SPEC §6.3 成长层 |
| 年度报告 | 使用满 1 年 | ⏳ 待时间 | 需要完整年度数据 |
| 关系流动检测 | 时间线 ≥200 | ⏳ 待数据 | 需要足够样本检测模式 |

### 5.7 自进化闭环架构

```
┌──────────────────────────────────────────────────────────┐
│                    自进化闭环                               │
│                                                           │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐│
│   │  数据   │───→│  分析   │───→│  决策   │───→│  执行   ││
│   │  采集   │    │  引擎   │    │  引擎   │    │  引擎   ││
│   └────┬────┘    └─────────┘    └─────────┘    └────┬────┘│
│        │                                              │    │
│        │         ┌──────────────────────┐             │    │
│        └─────────│   反馈存储 (本地)     │←────────────┘    │
│                  │   ~/.welian/feedback/│                  │
│                  └──────────────────────┘                  │
│                                                           │
│  ① 数据采集                                               │
│     - timeline 每条互动                                   │
│     - todos 采纳/完成状态                                  │
│     - advise 采纳率（timeline 匹配建议）                   │
│     - draft 采纳率（用户是否发送草稿）                     │
│     - 用户显式反馈（"这个建议不好"）                       │
│                                                           │
│  ② 分析引擎                                               │
│     - 周报生成时同步分析建议质量                            │
│     - 月度仪表盘包含采纳率趋势                             │
│     - 异常检测（某联系人建议连续被忽略）                    │
│                                                           │
│  ③ 决策引擎                                               │
│     - 冷却阈值调整建议                                     │
│     - 建议条数调整建议                                     │
│     - Prompt 版本更新建议                                  │
│     - 关系类型流动提示                                     │
│                                                           │
│  ④ 执行引擎                                               │
│     - 自动调整参数（冷却天数、建议条数）                    │
│     - Prompt 版本切换（A/B 测试）                          │
│     - 用户确认后更新关系类型                               │
│     - 功能解冻（数据量达标自动解锁）                       │
│                                                           │
│  关键原则：                                                │
│  - 所有进化在端侧完成，不上传用户数据                       │
│  - 进化参数存储在本地，可被用户审查和覆盖                    │
│  - 维系型关系的伦理保护不受进化影响                         │
└──────────────────────────────────────────────────────────┘
```

---

## §6. 演进路线

### 6.1 Phase 路线图（SPEC §9）

```
Phase 0 (已完成) ── social-agent v4.0.3 + welian.app 官网上线
│  ✅ Python 引擎 (4627 行, 201 测试用例)
│  ✅ 双关系模型字段
│  ✅ 四动词 (记/问/拟/报)
│  ✅ 微信 Bot (ilink 桥接)
│  ✅ 本地 Agent (WebSocket + Tunnel)
│  ✅ Web UI (ChatGPT 风格)
│  ✅ Cloud Worker (AI API)
│  ✅ Clerk 认证
│  ✅ 社交周报 (定时推送)
│  ✅ 联点系统 (记账模式)
│  ✅ 诊断工具 (welian doctor)
│
Phase 1 (3个月) ── 微信 MVP：Bot对话 + 双关系模型 + 联点系统 + 支付
│  📋 M1 种子门槛：500 注册 / 周活跃记录率 >40% / 北极星人均 >1
│  📋 支付接入（微信支付）
│  📋 联点从记账模式切换为实际计费
│  📋 数据飞轮启动：记录摩擦 → 数据积累 → 建议变准
│
Phase 2 (6-12月) ── 小程序仪表盘 + 角色成长体系 + 年度报告裂变
│  📋 小程序：角色仪表盘、关系列表、周报/年报、充值
│  📋 年度关系报告（可分享卡片 → 裂变钩子）
│  📋 关系图谱解冻（引荐路径 find-path）
│  📋 SQLite 迁移（JSON → SQLite）
│  📋 M2 付费验证：转化 >5% / 流失 <8% / LTV/CAC >3
│
Phase 3 (12月+) ── 情境感知 + 家庭共享 + App 评估
   📋 日历/位置情境感知
   📋 家庭共享关系数据
   📋 独立 App 评估（小程序 DAU >5万 且有微信承载不了的场景）
   📋 M3 增长引擎：1万注册 / K >0.3 / 年度报告分享率 >15%
   📋 M4 规模化：10万注册 / 收入 ¥200万/年 / 毛利率 >80%
```

### 6.2 技术债清单

| # | 技术债 | 优先级 | 触发条件 | 解决方案 |
|:-:|:----|:----|:----|:----|
| 1 | JSON → SQLite | 中 | 联系人 >200 或时间线 >1000 | 自动迁移脚本 + 增量同步 |
| 2 | 单用户 → 多用户 | 高 | M1 种子用户 >10 | 会话隔离已在 Bot 实现，Agent 需扩展 |
| 3 | 联点记账 → 实际计费 | 高 | M2 付费验证 | 微信支付接入 + 联点扣减原子化 |
| 4 | Prompt 版本管理 | 中 | 建议 A/B 测试需求 | Prompt 版本化 + 采纳率追踪 |
| 5 | 日志结构化 | 低 | 运维监控需求 | JSON 日志 + Cloudflare Analytics |
| 6 | 自动化测试覆盖 | 中 | 功能迭代加速 | CI/CD + 测试覆盖率监控 |
| 7 | 多模型支持 | 中 | 合规要求国产模型 | DeepSeek/Qwen provider 实现 |

### 6.3 架构演进原则

| # | 原则 | 说明 |
|:-:|:----|:----|
| 1 | **数据先于功能** | 功能解锁由数据量触发，非设计冲动 |
| 2 | **端侧优先** | 能在端侧完成的不上云（隐私 + 成本） |
| 3 | **LLM 可替换** | provider 注册表，切换模型改一行配置 |
| 4 | **伦理不可撤销** | 维系型关系的保护不随版本升级而削弱 |
| 5 | **最小上下文** | 云端只接收本次请求所需的最小数据 |
| 6 | **渐进式迁移** | JSON → SQLite 不破坏现有数据，自动迁移 |
| 7 | **AI-First 运营** | 开发/测试/客服/内容均由 AI 承担，近零人力 |

---

## §7. 安全与隐私架构

### 7.1 威胁模型

| 威胁 | 风险 | 防护 |
|:----|:----|:----|
| 云端数据泄露 | 低 | 云端不存储关系数据，即用即焚 |
| 本地数据泄露 | 中 | 加密导出 + 用户设备加密（FileVault） |
| LLM 上下文泄露 | 低 | 仅发送最小上下文，不含完整联系人信息 |
| Bot Token 泄露 | 中 | 环境变量存储 + launchd 权限隔离 |
| 隧道中间人 | 低 | Cloudflare Tunnel TLS 1.3 |
| Clerk 认证绕过 | 低 | Clerk 托管认证 + 配对令牌 |

### 7.2 隐私架构（SPEC §7.1）

```
┌─ 端侧（数据面）──────────────────────────────┐
│                                              │
│  全量数据仅存于端侧                            │
│  ├─ contacts.json (联系人全量)                │
│  ├─ timeline.json (互动全量)                  │
│  ├─ todos.json (待办全量)                     │
│  └─ usage.json (联点记录)                     │
│                                              │
│  用户完全控制                                  │
│  ├─ welian export --password XXX (加密导出)   │
│  ├─ welian import (导入到新设备)              │
│  └─ 直接删除文件 = 完全清除                    │
│                                              │
└──────────────────────────────────────────────┘
              │
              │ 仅发送最小上下文
              │ (如：某联系人近5条时间线摘要)
              ▼
┌─ 云端（智能面）──────────────────────────────┐
│                                              │
│  Cloudflare Worker                           │
│  ├─ 接收最小上下文                            │
│  ├─ 调用 LLM                                 │
│  ├─ 返回结果                                 │
│  └─ 即用即焚：不存储、不训练                   │
│                                              │
│  Clerk                                       │
│  └─ 仅存储 user_id + 认证信息                 │
│                                              │
└──────────────────────────────────────────────┘
```

### 7.3 合规设计

| 法规 | 要求 | 架构应对 |
|:----|:----|:----|
| 《个人信息保护法》 | 最小化原则 | 端侧存储天然最小化 |
| 《个人信息保护法》 | 注销即焚 | 删除本地文件 = 完全清除 |
| 《生成式AI服务管理暂行办法》 | 已备案模型 | LLM Gateway 支持国产模型切换 |
| 微信生态规范 | 不诱导分享 | Bot 不做分享引导 |

---

## §8. 监控与可观测性

### 8.1 指标体系

| 层 | 指标 | 数据来源 | 目标 |
|:--:|:----|:----|:----|
| **北极星** | 每周被用心对待的关系行动数 | timeline + todos 交叉分析 | 持续上升 |
| 习惯 | 周活跃记录率 | timeline.json 按周统计 | >40% |
| 价值 | 建议采纳率 | advise → timeline 匹配 | >30% |
| 维系 | 重要时刻在场率 | important_dates → timeline 匹配 | >60% |
| 商业 | 免费→付费转化率 | usage.json plan 字段 | >5% (M2) |
| 质量 | LLM 调用成功率 | edge.py 调用日志 | >99% |
| 成本 | 单用户月 LLM 成本 | usage.json + API 账单 | <¥0.5 (免费) |

### 8.2 自进化触发条件

| 触发条件 | 进化动作 | 影响范围 |
|:----|:----|:----|
| 建议采纳率 <20% 连续 2 周 | 降低建议条数 + 调整 Prompt | advise_leverage() |
| 某联系人建议连续被忽略 3 次 | 降低该联系人建议优先级 | _days_since_last() 权重 |
| 联系人 >40% 标注"双重" | 提示升级为光谱模型 | 产品层决策 |
| LLM 调用失败率 >5% | 自动切换备用 provider | llm/router.py |
| 联点消耗接近免费额度 | 推送付费引导 | 产品层触达 |
| 数据量达到解冻阈值 | 自动解锁对应功能 | §5.6 功能解冻表 |

---

## §9. 关键决策记录 (ADR)

### ADR-001: JSON 文件存储而非数据库

- **决策**：Phase 1 使用 JSON 文件存储
- **理由**：零依赖、零运维、易导出、易调试；Phase 1 数据量小（<1000 条）
- **代价**：并发写入无事务保护、查询效率低
- **退出条件**：联系人 >200 或时间线 >1000 → 迁移 SQLite

### ADR-002: Edge 优先，Cloud 仅 AI

- **决策**：所有数据操作在端侧完成，云端仅处理 AI 调用
- **理由**：隐私架构（SPEC §7.1）+ 成本（免费用户 <¥0.5/月）+ 离线可用
- **代价**：多端同步需额外机制（Phase 2 加密云备份）
- **不变量**：云端永远不存储关系数据

### ADR-003: LLM 抽象层 + Provider 注册表

- **决策**：通过 `llm/base.py` 抽象基类 + `router.py` 注册表解耦 LLM
- **理由**：模型可替换（合规要求国产模型）+ 成本分级（标准/增强/最强）
- **代价**：无法使用 provider 特有功能（如 Claude 的 prompt caching）
- **演进**：Phase 2 按需暴露 provider 特有能力（通过 optional 方法）

### ADR-004: 正则优先 + LLM 兜底的意图解析

- **决策**：`intent.py` 先用正则匹配，失败后再调用 LLM
- **理由**：正则零成本零延迟，覆盖 80% 常见意图；LLM 兜底处理自然语言变体
- **代价**：正则维护成本（新意图需新增模式）
- **演进**：积累 LLM 兜底数据 → 训练轻量分类器（Phase 2）

### ADR-005: 维系型关系伦理护栏在引擎层

- **决策**：`engine.py` 的 `advise_nurture()` 在代码层禁止 ROI/排序/冷却
- **理由**：SPEC §2.6 伦理设计必须代码级强制，非文档约定
- **不变量**：无论模型如何升级，此保护不可撤销

### ADR-006: 微信 Bot 作为 Phase 1 唯一产品形态

- **决策**：Phase 1 不做小程序/App，Bot 对话即完整产品
- **理由**：创始用户已验证 Bot 交互；微信是自然入口；最小化开发成本
- **退出条件**：出现"看"的场景需求（仪表盘/列表）→ Phase 2 小程序

---

**最后更新**：2026-07-13
**版本**：v1.0.0
**状态**：设计文档
**配套文档**：`SPEC_WELIAN.md`（产品规约）| `BUSINESS_MODEL.md`（商业模型）| `RELEASE_MANUAL.md`（发布手册）
