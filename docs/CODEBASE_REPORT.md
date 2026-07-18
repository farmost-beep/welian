# Welian 代码库全面分析报告

> 生成时间：2025-07-25 | 基于实际源码交叉验证，非仅依赖 wiki

---

## 1. 项目定位与核心理念

**一句话概括**：Welian（维联）是一个本地优先（local-first）的社交关系管理 AI 助手，帮用户成为更好的朋友、家人、合作者。

**产品哲学**：
- **数据归你，智能来云**（Data to You, Intelligence to the Cloud）— 所有关系数据存储在用户本地设备（`~/.welian/data/*.json`），云端只做无状态 AI 处理，仅接收最小必要上下文 (`src/welian/edge.py:1-12`)
- **双关系模型** — 将所有关系分为经营型（Leverage，果园隐喻）和陪伴型（Nurture，浇花隐喻），陪伴型关系禁止 ROI 计算 (`src/welian/engine.py:1-9`, `AGENTS.md`)
- **四个动词**：记（Record）/ 问（Ask）/ 拟（Draft）/ 报（Report）— 构成核心交互模式 (`src/welian/intent.py:1-17`)
- **伦理红线**：陪伴型关系不做评分、排序、冷却检查、产出计量 (`src/welian/engine.py:506-510`, `AGENTS.md`)

---

## 2. 技术栈总览

| 层 | 技术 | 说明 |
|---|---|---|
| **后端** | Python 3.9+ | 核心引擎、CLI、Bot、Agent |
| **云函数** | Cloudflare Worker (JS) | 6707 行，AI 网关 + 计费 + 认证 + 数据同步 |
| **前端** | 原生 HTML + ES Modules | 11 个模块，无框架，Cloudflare Pages 部署 |
| **LLM** | Claude / OpenAI / MiniMax / Cloud | 通过 router 统一抽象，支持自适应路由 |
| **认证** | Clerk (JWT) + WeChat OAuth + SMS OTP | 三种登录方式 |
| **支付** | Paddle (USD) + WeChat Pay (占位) | 全球用户用 Paddle，国内预留微信支付 |
| **存储** | 本地 JSON 文件 + Cloudflare KV | 本地存全量数据，KV 存云端同步副本 |
| **部署** | Cloudflare Worker + Pages + launchd | 云端 Worker/Pages，本地 macOS launchd 守护进程 |
| **依赖** | pyyaml, httpx, fastapi, uvicorn, websockets, sentry-sdk | 极简依赖 (`requirements.txt`) |

---

## 3. 目录结构树

```
welian/
├── src/welian/                    # Python 后端核心
│   ├── engine.py (653行)          # 本地数据引擎：contacts/timeline/todos CRUD + 双关系模型
│   ├── edge.py (1518行)           # EdgeClient：边缘 SDK，协调本地数据与云端 AI
│   ├── agent.py (1351行)          # LocalAgent：HTTP + WebSocket 桥接浏览器与本地数据
│   ├── agent_bridge.py (617行)    # Devin/Claude CLI 桥接（微信 Bot 的编码模式）
│   ├── models.py (129行)          # 共享数据模型（Contact/Timeline/Todo schema 单一真相源）
│   ├── tokens.py (373行)          # 联点计费系统（action-based + token-based 双模式）
│   ├── intent.py (276行)          # 意图解析（LLM 优先 + regex 回退）
│   ├── ai.py (235行)              # AI 调用：拟稿/建议格式化/角色仪表盘格式化
│   ├── cli.py (787行)             # CLI 入口：20+ 子命令
│   ├── payment.py (330行)         # 支付模块（占位 + Paddle 接口预留）
│   ├── weekly.py (268行)          # 周报生成
│   ├── calendar_sync.py (400行)   # macOS Calendar 同步（AppleScript）
│   ├── llm/                       # LLM 路由层
│   │   ├── router.py (264行)      # 单例工厂 + 自适应路由
│   │   ├── base.py                # LLMClient 抽象基类
│   │   ├── claude.py              # Claude (Anthropic) 客户端
│   │   ├── openai.py              # OpenAI 客户端
│   │   └── cloud.py (150行)       # Cloud LLM 客户端（方案C 批发赚价差）
│   ├── bot/                       # 微信 Bot 模块
│   │   ├── handler.py (1965行)    # ilink API 客户端 + 消息处理 + 命令系统
│   │   ├── service.py (348行)     # launchd/systemd 服务管理
│   │   ├── config.py (297行)      # 三层配置合并（user/project/local）
│   │   ├── validator.py (265行)   # 危险命令检测（BLOCK/WARN 两级）
│   │   ├── yaml_commands.py (352行) # YAML 定义的 CLI 工具命令（绕过 AI）
│   │   ├── cmd_loader.py (184行)  # Markdown 斜杠命令加载器
│   │   ├── hooks.py (254行)       # PreToolUse/PostToolUse/Stop 钩子系统
│   │   ├── call_caps.py (226行)   # 命令调用次数上限（防失控循环）
│   │   ├── cdn.py                 # 微信文件上传（CDN 加密）
│   │   ├── commands/              # Markdown 命令模板（commit/review/dev/loop/learn/design）
│   │   └── scripts/               # Bot 辅助脚本
│   └── api/
│       └── server.py (196行)      # FastAPI 云端 AI API（自托管模式）
├── cloud-worker/                  # Cloudflare Worker（云端）
│   ├── src/worker.js (6707行)     # 全部云端逻辑：AI 网关 + 计费 + 认证 + 数据 + 搜索
│   ├── wrangler.toml              # Worker 配置（KV 绑定 + 路由 + 定时任务）
│   ├── test/                      # vitest 测试（billing + import）
│   └── prompts/                   # 云端 prompt 文件
├── public/                        # 前端（Cloudflare Pages）
│   ├── index.html (368行)         # 主页面
│   ├── app.js (397KB)             # 旧版单文件（保留兼容）
│   ├── modules/                   # 11 个 ES Module（从 app.js 拆分）
│   │   ├── state.js (793行)       # 全局状态 + i18n + DOM 引用
│   │   ├── auth.js (413行)        # Clerk 认证 + 微信登录 + SMS OTP
│   │   ├── agent-bridge.js (1693行) # Agent 桥接 + Cloud/Live 模式切换
│   │   ├── chat.js (2086行)       # 聊天核心 + 会话管理 + 建议生成
│   │   ├── contacts.js (952行)    # 联系人管理 + 导入
│   │   ├── todos.js (503行)       # 待办管理
│   │   ├── timeline.js (139行)    # 互动时间线
│   │   ├── billing.js (735行)     # 计费 + Paddle 支付
│   │   ├── proactive.js (1238行)  # 周报/月报/信号/onboarding
│   │   ├── misc.js (1192行)       # 设置/记忆/目标/技能/导出
│   │   └── main.js (187行)        # 入口：导入所有模块 + 暴露 onclick
│   ├── bind.html                  # 微信绑定页
│   ├── landing.html               # 落地页
│   ├── pricing.html               # 定价页
│   ├── api.html                   # API 文档页
│   └── styles.css                 # 全局样式
├── config/
│   └── welian.yaml (128行)        # 主配置：AI/Cloud/Agent/Tokens/Bot/API
├── prompts/                       # 12 个 prompt 模板（chat/draft/extract/advise/intent 等）
├── tests/                         # pytest 测试（engine/billing/intent/edge_cloud/import）
├── scripts/                       # 部署/迁移/工具脚本
├── data_template/                 # 数据模板（空 JSON）
├── miniprogram/                   # 微信小程序（早期版本）
├── docs/                          # 文档（ARCHITECTURE/SPEC/BUSINESS_MODEL 等）
└── setup.py                       # Python 包定义（welian-app v1.1.0）
```

---

## 4. 系统架构图

### 三种运行模式的数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Welian 系统架构                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─── Cloud Intelligence Plane (Cloudflare) ───────────────────┐   │
│  │                                                               │   │
│  │  ┌─────────────────┐    ┌──────────────────┐                │   │
│  │  │ Cloud Worker    │    │ Cloud Pages      │                │   │
│  │  │ (api.welian.app)│    │ (welian.app)     │                │   │
│  │  │ 6707 行 JS      │    │ index.html +     │                │   │
│  │  │                 │    │ 11 ES Modules    │                │   │
│  │  │ • AI 网关(方案C) │    │                  │                │   │
│  │  │ • 计费系统       │    └──────────────────┘                │   │
│  │  │ • Clerk JWT 验证 │           │ iframe                     │   │
│  │  │ • KV 数据同步    │           ▼                            │   │
│  │  │ • Paddle 支付    │    ┌──────────────────┐                │   │
│  │  │ • 搜索 + 网页阅读 │    │ Clerk Auth       │                │   │
│  │  │ • WeChat OAuth   │    │ (clerk.welian.app)│                │   │
│  │  └───────┬─────────┘    └──────────────────┘                │   │
│  │          │ LLM 调用                                         │   │
│  │          ▼                                                   │   │
│  │  ┌─────────────────┐    ┌──────────────────┐                │   │
│  │  │ LLM Provider    │    │ Cloudflare KV    │                │   │
│  │  │ (MiniMax/Claude)│    │ USER_DATA + DEVICES│               │   │
│  │  └─────────────────┘    └──────────────────┘                │   │
│  └───────────────────────────────────────────────────────────────┘   │
│          ▲                           ▲                              │
│          │ HTTPS (最小上下文)         │ WebSocket (Cloudflare Tunnel) │
│          │                           │                              │
│  ┌───────┴───────────────────────────┴──────────────────────────┐   │
│  │              User Data Plane (本地 macOS)                      │   │
│  │                                                                │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────────┐   │   │
│  │  │ CLI      │  │ WeChat   │  │ Local Agent (agent.py)    │   │   │
│  │  │ (welian) │  │ Bot      │  │ HTTP :9800 + WebSocket    │   │   │
│  │  │          │  │ (handler)│  │  • bridge.html (iframe)   │   │   │
│  │  └────┬─────┘  └────┬─────┘  │  • /health                │   │   │
│  │       │             │        │  • /ws (WebSocket)        │   │   │
│  │       │             │        └───────────┬────────────────┘   │   │
│  │       │             │                    │                     │   │
│  │       ▼             ▼                    ▼                     │   │
│  │  ┌──────────────────────────────────────────────────────┐    │   │
│  │  │  EdgeClient (edge.py) — 边缘 SDK                      │    │   │
│  │  │  • intent.parse() → 意图识别                           │    │   │
│  │  │  • _gather_context() → 收集本地数据                    │    │   │
│  │  │  • _llm_respond() → LLM 生成回复                       │    │   │
│  │  │  • cloud_chat() → 云端聊天流程                         │    │   │
│  │  └──────────────────────┬───────────────────────────────┘    │   │
│  │                         │                                     │   │
│  │                         ▼                                     │   │
│  │  ┌──────────────────────────────────────────────────────┐    │   │
│  │  │  WelianEngine (engine.py) — 本地数据引擎               │    │   │
│  │  │  • contacts.json / timeline.json / todos.json         │    │   │
│  │  │  • 双关系模型 (leverage/nurture/dual)                  │    │   │
│  │  │  • advise_leverage() / advise_nurture()                │    │   │
│  │  │  • role_dashboard() / get_dashboard()                  │    │   │
│  │  └──────────────────────┬───────────────────────────────┘    │   │
│  │                         │                                     │   │
│  │                         ▼                                     │   │
│  │  ┌──────────────────────────────────────────────────────┐    │   │
│  │  │  ~/.welian/data/*.json (本地 JSON 存储)                │    │   │
│  │  └──────────────────────────────────────────────────────┘    │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─── launchd 守护进程 ──────────────────────────────────────┐     │
│  │  com.welian.bot     — KeepAlive (微信 Bot)                 │     │
│  │  com.welian.agent   — KeepAlive (本地 Agent + Tunnel)      │     │
│  │  com.welian.weekly  — Sunday 20:00 (周报 cron)             │     │
│  └─────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

### 三种模式说明

| 模式 | 数据位置 | AI 处理 | 触发条件 |
|---|---|---|---|
| **Live 模式** | 本地 JSON | 本地 Agent (Devin/Claude CLI) | 浏览器通过 Tunnel 连接到本地 Agent |
| **Cloud 模式** | Cloudflare KV | 云端 Worker → LLM | 用户未运行本地 Agent，或选择 cloud_only |
| **Hybrid 模式** | 本地 + KV 同步 | 优先 Live，回退 Cloud | `routing.mode: "auto"` (默认) |

路由配置 (`config/welian.yaml:68-76`)：
```yaml
routing:
  mode: "auto"           # auto | live_first | cloud_first | cloud_only
```

---

## 5. 核心数据模型

### Contact（联系人）— `src/welian/models.py:11-45`

```python
{
  "id": "c-{uuid12}",           # 唯一 ID
  "name": "张三",                # 姓名（必填）
  "relation": "同行",            # 关系类型
  "role": "同行",                # 角色（默认同 relation）
  "sub_relation": "",           # 子关系
  "company": "腾讯",             # 公司
  "title": "产品经理",           # 职位
  "nature": "leverage",         # leverage | nurture | dual（默认 leverage）
  "strength": 3,                # 关系强度 1-5（默认 3）
  "tags": ["客户"],             # 标签列表
  "platforms": {"wechat": "..."}, # 平台账号
  "phone": "",                  # 电话
  "email": "",                  # 邮箱
  "notes": "",                  # 备注
  "memories": [],               # 记忆列表 [{id, content, tags, created}]
  "important_dates": [],        # 重要日期 [{date, label, type}]
  "leverage": {},               # 经营型字段 {goals, how, direction, confirmed}
  "nurture": {},                # 陪伴型字段 {bond, presence_events}
  "aliases": [],                # 别名列表
  "alias": [],                  # 别名（兼容字段）
  "created": "ISO timestamp",   # 创建时间
  "updated": "ISO timestamp",   # 更新时间
}
```

**设计决策**：`models.py` 是"单一真相源"（single source of truth），engine.py、agent.py、worker.js 三处创建联系人都必须调用 `create_contact()`，确保字段一致性 (`models.py:1-5`)。

### Timeline（互动记录）— `src/welian/models.py:48-60`

```python
{
  "id": "t-{uuid12}",
  "date": "2025-07-25",         # 日期（YYYY-MM-DD）
  "contact": "c-xxx",           # 关联联系人 ID
  "type": "message",            # message | meeting | call | outcome
  "summary": "聊了预算方案",      # 摘要
  "key_points": [],             # 关键点列表
  "pending": "",                # 待提取的待办事项
  "created": "ISO timestamp",
}
```

### Todo（待办）— `src/welian/models.py:63-75`

```python
{
  "id": "todo-{uuid12}",
  "contact": "c-xxx",           # 关联联系人
  "task": "跟进预算方案",         # 任务内容
  "priority": "P1",             # P0 | P1 | P2（默认 P1）
  "due": "2025-08-01",          # 截止日期
  "status": "pending",          # pending | completed | cancelled
  "source": "t-xxx",            # 来源 timeline ID
  "created": "ISO timestamp",
}
```

**自动待办提取**：`add_timeline()` 时如果 `pending` 非空，自动调用 `_auto_add_todo()`，根据关键词（TS/投资/融资/引荐/签约/budget/deadline）自动设置 P0 优先级 (`engine.py:391-441`)。

---

## 6. 后端模块详解

### 6.1 engine.py — 本地数据引擎（653 行）

**职责**：所有数据的 CRUD 操作 + 双关系模型逻辑 + 建议引擎

**关键函数**：
| 函数 | 行号 | 说明 |
|---|---|---|
| `_get_home_dir()` | 16-27 | 定位数据目录（WELIAN_HOME > 包目录 > ~/.welian） |
| `_init_paths()` | 48-60 | WELIAN_HOME 变更后重新初始化路径（多用户隔离用） |
| `infer_nature()` | 94-105 | 从联系人字段推断关系类型（默认 leverage） |
| `contact_role()` | 107-116 | 映射到三种社会角色（friend/family/collaborator） |
| `resolve_contact()` | 157-182 | 多策略联系人解析（ID > name > alias > 模糊匹配） |
| `auto_classify_nature()` | 208-232 | 基于关系/标签/备注自动分类（SPEC §2.4） |
| `add_timeline()` | 391-405 | 添加互动记录 + 自动提取待办 |
| `_auto_add_todo()` | 427-441 | 从互动中提取待办（关键词触发 P0） |
| `advise_leverage()` | 464-504 | 经营型建议：冷却期评分（14/21 天阈值） |
| `advise_nurture()` | 506-551 | 陪伴型提醒：重要日期 + 记忆跟进（**无评分**） |
| `role_dashboard()` | 555-595 | 月度角色回顾（行为事实，非状态评判） |
| `get_dashboard()` | 639-653 | 全局概览统计 |

**伦理红线实现**：`advise_nurture()` 的 docstring 明确标注 "No scores, no ranking, no ROI (SPEC §2.6)"，只返回温和提醒 (`engine.py:506-510`)。

### 6.2 edge.py — EdgeClient 边缘 SDK（1518 行）

**职责**：协调本地数据与云端 AI，是所有交互的入口

**两种模式**：
- **Self-hosted 模式**：`cloud_url=""` → 直接调用 LLM（用户自己的 API Key）
- **Cloud 模式（方案C）**：`cloud_url` 非空 → 通过云端计费网关 (`edge.py:39-71`)

**核心流程** (`edge.py:547-588`)：
```
chat(text) → intent.parse() → _gather_context() → _llm_respond() → _bill_cloud_usage()
```

**关键函数**：
| 函数 | 行号 | 说明 |
|---|---|---|
| `_get_llm()` | 50-71 | 获取 LLM 客户端（cloud/self-hosted 双模式） |
| `chat()` | 547-588 | 主聊天入口：意图→数据→LLM→回复 |
| `cloud_chat()` | 325-508 | 云端聊天流程：extract_intent → data/search → ai/chat |
| `_gather_full_context()` | 212-316 | 收集完整上下文（概览+待办+时间线+建议+联系人列表） |
| `search_contacts()` | 94-193 | 关键词搜索联系人 + 构建详细上下文 |
| `_llm_respond()` | 621-663 | LLM 生成最终回复（支持多模态文件） |
| `_get_system_prompt()` | 510-523 | 从云端获取 AGENTS.md 作为系统提示 |
| `_load_prompt()` | 665-685 | 从 prompts/ 目录加载 prompt 模板 |

### 6.3 agent.py — LocalAgent 本地代理（1351 行）

**职责**：HTTP + WebSocket 服务器，桥接浏览器与本地数据

**架构** (`agent.py:1-23`)：
```
Browser (welian.app)
  ├─ iframe → http://localhost:PORT/bridge.html (same-origin as WS)
  │           └─ WebSocket → ws://localhost:PORT/ws
  └─ postMessage ↔ iframe
```

**关键功能**：
- **Tunnel 发现**：通过 Cloudflare Tunnel 暴露本地 Agent，用 Clerk user_id 注册到 discovery 服务 (`agent.py:330-398`)
- **双引擎支持**：`engine="edge"`（EdgeClient LLM）或 `engine="devin"`（Devin CLI 直接调用）(`agent.py:589-655`)
- **文件导入**：支持 xlsx/xls/CSV/图片，通过 Devin CLI 提取联系人 (`agent.py:488-587`)
- **云端同步**：`_fetch_cloud_contacts()` / `_push_cloud_contacts()` 与 Cloudflare KV 同步 (`agent.py:407-452`)

### 6.4 intent.py — 意图解析（276 行）

**策略**：LLM 优先 + regex 回退 (`intent.py:90-108`)

**支持的意图类型**：
| 常量 | 值 | 说明 |
|---|---|---|
| `INTENT_RECORD` | record | 记录事件/互动 |
| `INTENT_ASK` | ask | 询问该联系谁 |
| `INTENT_DRAFT` | draft | 请求拟写消息 |
| `INTENT_REPORT` | report | 请求报告/回顾 |
| `INTENT_CHECK` | check | 查看某人关系状态 |
| `INTENT_QUERY` | query | 查询联系人/统计 |
| `INTENT_TODO` | todo | 查看待办事项 |
| `INTENT_ALIAS` | alias | 设置别名 |
| `INTENT_HELP` | help | 请求帮助 |

### 6.5 tokens.py — 联点计费系统（373 行）

**双模式计费**：
1. **Action-based**（固定扣费）：每个功能固定联点数 (`tokens.py:12-22`)
2. **Token-based**（按量计费）：按实际 LLM token 用量计费 (`tokens.py:208-272`)

**定价常量** (`tokens.py:32-33`)：
```python
POINTS_PER_1K_INPUT = 1   # 1000 input tokens = 1 point
POINTS_PER_1K_OUTPUT = 2  # 1000 output tokens = 2 points
```

**套餐**：
| 套餐 | 月度额度 | 价格 |
|---|---|---|
| Free | 100 联点 | ¥0 |
| Pro | 500 联点 | ¥29/月 或 ¥299/年 ($4.99/mo, $49/yr) |

### 6.6 llm/router.py — LLM 路由（264 行）

**设计**：单例工厂模式，配置优先级：cloud_url > config.yaml > 环境变量 (`router.py:118-192`)

**Provider 注册表** (`router.py:24-31`)：
```python
_PROVIDERS = {
    "claude": ClaudeClient,
    "openai": OpenAIClient,
    "cloud": CloudLLMClient,  # 方案C
}
```

**自适应路由** (`router.py:211-264`)：简单问候→便宜模型，编码/分析→强模型

### 6.7 llm/cloud.py — Cloud LLM 客户端（150 行）

**方案C 架构** (`cloud.py:1-20`)：
```
Edge (this client) → Welian Cloud (billing gateway) → LLM Provider
```
- 使用 Welian 批发 API Key 调用 LLM
- 返回实际 token usage 供边缘端计费
- 402 状态码 = 联点不足 (`cloud.py:113-118`)

### 6.8 其他后端模块

| 模块 | 行数 | 职责 |
|---|---|---|
| `ai.py` | 235 | 拟稿/建议格式化/角色仪表盘格式化/陪伴检查 |
| `cli.py` | 787 | CLI 入口：20+ 子命令（chat/advise/bot/agent/weekly 等） |
| `payment.py` | 330 | 支付占位 + Paddle 接口预留 |
| `weekly.py` | 268 | 周报生成（本地数据 + LLM 摘要） |
| `calendar_sync.py` | 400 | macOS Calendar 同步（AppleScript） |
| `agent_bridge.py` | 617 | Devin/Claude CLI 桥接（微信 Bot 编码模式） |

---

## 7. Cloud Worker 端点清单

> `cloud-worker/src/worker.js`（6707 行），路由分发在 `worker.js:4840-5560`

### AI 网关（方案C 计费）
| 端点 | 方法 | 行号 | 说明 |
|---|---|---|---|
| `/ai/chat` | POST | 4892 | 计费网关：转发聊天到 LLM，返回 usage + billing |
| `/ai/draft` | POST | 4870 | 从最小上下文拟写消息 |
| `/ai/extract` | POST | 4875 | 从互动文本提取待办/关键点 |
| `/ai/advise` | POST | 4880 | 格式化建议（边缘端传入候选列表） |
| `/ai/advise_cloud` | POST | 4885 | 云端建议引擎（直接查 KV） |
| `/ai/extract_intent` | POST | 5062 | LLM 提取意图 + 关键词 + 执行数据操作 |
| `/ai/session_summary` | POST | 5067 | 会话摘要 |
| `/ai/meeting_prep` | POST | 5237 | 见面功课 |
| `/ai/weekly_report` | POST | 5244 | 周报生成 |
| `/ai/monthly_report` | POST | 5249 | 月报生成 |
| `/ai/hn_signals` | POST | 5254 | Hacker News 信号分析 |
| `/ai/proactive` | POST | 5087 | 主动建议 |
| `/ai/estimate_cost` | POST | 5300 | 预估联点成本 |

### 搜索与网页阅读
| 端点 | 方法 | 行号 | 说明 |
|---|---|---|---|
| `/ai/search` | POST | 5001 | 多引擎搜索（Tavily/Brave/DDG/Google/Mojeek/Sogou/BingCN/Wikipedia） |
| `/ai/read_url` | POST | 5017 | 网页阅读（Jina Reader API + SSRF 防护） |

### 计费与支付
| 端点 | 方法 | 行号 | 说明 |
|---|---|---|---|
| `/ai/billing` | POST | 4897 | 查询余额 |
| `/ai/upgrade` | POST | 4902 | 升级套餐（直接升级，测试用） |
| `/ai/purchase_credits` | POST | 4907 | 购买联点包 |
| `/ai/pricing` | GET | 4929 | 获取定价信息 |
| `/ai/create_order` | POST | 5024 | 创建订单（微信支付模式） |
| `/ai/confirm_order` | POST | 5029 | 确认订单 |
| `/ai/list_orders` | POST | 5034 | 列出订单 |
| `/ai/paddle/checkout` | POST | 5040 | Paddle checkout（返回 price_id + discount_id） |
| `/ai/paddle/webhook` | POST | 5044 | Paddle webhook（HMAC-SHA256 验签） |
| `/ai/paddle/cancel` | POST | 5048 | 取消 Paddle 订阅 |
| `/ai/paddle/config` | GET | 5052 | Paddle 配置（前端用） |
| `/ai/gift_credits` | POST | 4982 | 赠送联点（管理员） |
| `/ai/create_coupon` | POST | 4989 | 创建优惠券（管理员） |
| `/ai/redeem_coupon` | POST | 4994 | 兑换优惠券 |

### 管理员
| 端点 | 方法 | 行号 | 说明 |
|---|---|---|---|
| `/ai/admin/check` | POST | 4936 | 检查是否管理员 |
| `/ai/admin/pricing` | GET/POST | 4944/4949 | 获取/修改全局定价 |

### 数据同步（KV CRUD）
| 端点 | 方法 | 行号 | 说明 |
|---|---|---|---|
| `/data/sync` | POST | 5092 | 增量同步 |
| `/data/sync_full` | POST | 5097 | 全量同步 |
| `/data/search` | POST | 5102 | 搜索联系人（关键词） |
| `/data/context` | GET | 5107 | 获取数据上下文 |
| `/data/pull` | GET | 5113 | 拉取全部数据（Agent sync） |
| `/data/push` | POST | 5124 | 推送数据（Agent sync） |
| `/data/contacts` | GET/POST/PUT/DELETE | 5137 | 联系人 CRUD |
| `/data/timeline` | GET/POST/PUT/DELETE | 5142 | 时间线 CRUD |
| `/data/todos` | GET/POST/DELETE | 5214 | 待办 CRUD |
| `/data/todos/done` | POST | 4704 | 标记完成 |
| `/data/todos/reopen` | POST | 4719 | 重新打开 |
| `/data/todos/cancel` | POST | 4734 | 取消 |
| `/data/todos/postpone` | POST | 4748 | 推迟 |
| `/data/profile` | GET/POST | 5147 | 用户档案 |
| `/data/memory` | GET/POST | 5152 | 记忆管理 |
| `/data/goals` | GET/POST | 5199 | 目标管理 |
| `/data/sessions` | GET/POST | 5204 | 会话管理 |
| `/data/skills` | GET/POST/DELETE | 5209 | 技能管理 |
| `/data/calendar/feed` | GET | 5220 | 日历订阅 |
| `/data/calendar/token` | GET | 5225 | 日历 token |
| `/data/delete_account` | POST | 5232 | 删除账户 |
| `/data/metrics` | GET | 5268 | 指标统计 |

### 导入
| 端点 | 方法 | 行号 | 说明 |
|---|---|---|---|
| `/ai/import` | POST | 5072 | 导入联系人（CSV 直接解析） |
| `/ai/import_batch` | POST | 5077 | 批量导入 |
| `/ai/import_chunk` | POST | 5082 | 分块导入 |
| `/ai/onboarding/create_contacts` | POST | 5261 | Onboarding 创建联系人 |

### 认证
| 端点 | 方法 | 行号 | 说明 |
|---|---|---|---|
| `/auth/wechat` | GET | 5307 | 微信 OAuth 重定向 |
| `/auth/wechat/callback` | GET | 5319 | 微信 OAuth 回调 |
| `/auth/sms/send` | POST | 5418 | 发送 SMS OTP（阿里云） |
| `/auth/sms/verify` | POST | 5450 | 验证 SMS OTP |

### 微信绑定
| 端点 | 方法 | 行号 | 说明 |
|---|---|---|---|
| `/ai/bind_wechat` | POST | 4914 | 绑定微信到 Clerk 账号 |
| `/ai/check_bind` | POST | 4919 | 检查绑定状态 |
| `/ai/unbind_wechat` | POST | 4924 | 解绑 |

### 其他
| 端点 | 方法 | 行号 | 说明 |
|---|---|---|---|
| `/health` | GET | 4852 | 健康检查 |
| `/` | GET | 4861 | API 信息 |
| `/discover/register` | POST | 5533 | 注册 Tunnel URL |
| `/discover/lookup` | GET | 5549 | 查找 Tunnel URL |
| `/ai/diagnostics` | POST | 5157 | 诊断 |
| `/ai/skills` | GET | 5162 | 技能列表 |
| `/ai/config` | GET | 5176 | 配置 |
| `/ai/push_poll` | POST | 5295 | 推送轮询 |

**定时任务** (`wrangler.toml:49-50`)：每周一 01:00 UTC（09:00 CST）触发周报推送。

---

## 8. 前端模块详解

> 11 个 ES Module，从 397KB 的 `app.js` 拆分而来，通过 `main.js` 统一导入并暴露到 window

| 模块 | 行数 | 职责 |
|---|---|---|
| **state.js** | 793 | 全局状态管理 + i18n（中英双语）+ DOM 元素引用 + 配置常量（CLOUD_URL/DISCOVERY_URL/CLERK_KEY） |
| **auth.js** | 413 | Clerk 认证初始化 + 微信登录 + 手机号 SMS OTP 登录 + CLI 回调登录 |
| **agent-bridge.js** | 1693 | Agent 桥接核心：Live/Cloud 模式切换 + iframe 通信 + 会话管理 + 模拟模式 + 目标追踪 |
| **chat.js** | 2086 | 聊天核心：消息发送/接收 + 会话列表 + 建议生成 + 语音输入 + PDF 下载 + 天气 |
| **contacts.js** | 952 | 联系人管理：列表/详情/编辑/导入/分组/冷却信息/见面功课 |
| **todos.js** | 503 | 待办管理：创建/完成/推迟/取消/删除 |
| **timeline.js** | 139 | 互动时间线：列表/搜索/编辑/删除 |
| **billing.js** | 735 | 计费面板 + Paddle checkout + 优惠券 + 赠送联点 + 模型层级选择 |
| **proactive.js** | 1238 | 周报/月报/信号报告 + onboarding 流程 + 分享卡片 |
| **misc.js** | 1192 | 设置/记忆/目标/技能/日历订阅/数据导出/账户删除 |
| **main.js** | 187 | 入口：导入所有模块 + 暴露 onclick 到 window + 初始化代码 |

**模块交互**：`main.js` 将所有函数挂载到 `window`，HTML 中的 `onclick` 直接调用。初始化顺序：`applyLang → initClerk → initCookieBanner → fetchWeather` (`main.js:146-187`)。

**模式切换流程** (`agent-bridge.js`)：
1. 页面加载 → `autoConnectAgent()` 尝试连接本地 Agent
2. 连接成功 → Live 模式（iframe bridge + WebSocket）
3. 连接失败 → `enableCloudMode()`（Cloud 模式，通过 Worker API）
4. 用户可手动切换：`routing.mode` 配置控制优先级

---

## 9. 微信 Bot 模块

> `src/welian/bot/` — 通过微信 ilink Bot API 实现微信对话交互

### 9.1 消息处理流程

```
微信用户 → ilinkai.weixin.qq.com → Bot (handler.py)
  → get_updates() 长轮询 (35s)
  → handle_command() 斜杠命令?
    ├─ 是 → 执行命令（/help /login /who /reset /local 等）
    └─ 否 → SessionManager.get_client() → EdgeClient.chat()
      → intent.parse() → _gather_context() → _llm_respond()
      → send_long_message() (自动拆分长消息)
      → extract_file_paths() → 自动推送文件到微信
```

### 9.2 命令系统

**斜杠命令** (`handler.py:548-700`)：
| 命令 | 说明 |
|---|---|
| `/help` | 显示帮助（含 YAML 命令） |
| `/login` `/bind` | 绑定/查看 Welian 账号 |
| `/logout` `/unbind` | 解绑 |
| `/status` | 查看状态 |
| `/who` | 该联系谁 |
| `/reset` | 重置会话 |
| `/stop` | 停止当前任务 |
| `/local` `/local claude` `/local devin` | 切换到本地 Agent 编码模式 |
| `/social` | 切回社交 AI 模式 |
| `/permission strict/lax` | 设置权限模式 |
| `/mode` `/mode off` | 查看/关闭特殊模式 |
| `/caps` | 查看调用上限 |
| `/yaml` `/reload` | 管理 YAML 命令 |
| `/model` | 查看/切换 AI 模型 |
| `/sessions` `/compact` | 会话管理 |
| `/hooks` `/context` `/usage` | 调试信息 |

**Markdown 命令** (`bot/commands/`)：通过 `cmd_loader.py` 从 markdown 文件加载，支持 `!`command`` shell 注入和 `$ARGUMENTS` 替换：
- `commit.md` — 提交+推送+创建PR
- `review.md` — 多维度代码审查
- `dev.md` — 7 阶段结构化开发
- `loop.md` — 自主循环直到完成
- `learn.md` — 教育型输出模式
- `design.md` — 前端设计原则模式

**YAML 命令** (`yaml_commands.py`)：轻量 CLI 工具，绕过 AI 直接执行 shell 命令（如 `/weather 北京`）。

### 9.3 安全机制

**三层安全防护**：

1. **validator.py** — 危险命令检测
   - BLOCK 级：`rm -rf /`、`git push --force`、`git reset --hard`、`DROP TABLE`、`mkfs`、`dd of=/dev/` (`validator.py:29-90`)
   - WARN 级：`rm -r`、`sudo`、`curl | bash`、`eval()`、`pickle.loads` (`validator.py:92-153`)
   - 安全模式检测：`<script>` 标签、`innerHTML`、硬编码密钥 (`validator.py:157-183`)

2. **call_caps.py** — 命令调用次数上限
   - `git push`: 10 次/会话，`git push --force`: 0 次（永远禁止）
   - `gh pr create`: 3 次，`gh pr merge`: 0 次
   - `npm publish`: 1 次，`rm -rf`: 0 次 (`call_caps.py:44-62`)

3. **yaml_commands.py** — YAML 命令白名单
   - 只允许 `curl/echo/date/whoami/df/free/ping/cat/ls` 等安全命令
   - 禁止 `;` `&&` `||` `|` `` ` `` `$()` `>` `<` 等危险字符 (`yaml_commands.py:83-92`)
   - 禁止 `rm/mv/chmod/sudo/wget/bash/ssh` 等危险命令 (`yaml_commands.py:61-79`)

### 9.4 其他 Bot 特性

- **Per-user 会话隔离**：`SessionManager` 为每个微信用户维护独立 EdgeClient (`handler.py:287-352`)
- **Typing keepalive**：5 秒间隔发送 typing 指示器 (`handler.py:360-387`)
- **Silence watchdog**：20 秒无输出时发送安抚消息 (`handler.py:392-428`)
- **文件自动推送**：从 AI 回复中提取文件路径，自动上传推送到微信 (`handler.py:437-470`)
- **长消息拆分**：按段落边界智能拆分，保持 markdown 格式完整 (`handler.py:475-545`)
- **CDN 上传**：`cdn.py` 处理微信文件上传的 AES 加密

---

## 10. 计费系统

### 10.1 联点模型

**双模式**：
1. **Action-based**（本地，`tokens.py:12-22`）：固定扣费
   - `ai_record_enhance`: 1 点，`ai_draft`: 2 点，`advise_engine`: 3 点
   - `weekly_report`: 3 点，`role_dashboard`: 5 点，`annual_report`: 20 点

2. **Token-based**（云端，`worker.js:836-879`）：按实际 LLM token 用量
   - `calcPoints()`: `input/1000 * 1 + output/1000 * 2`
   - 模型层级倍率：standard ×1, enhanced ×3, premium ×10
   - **Pro 会员优惠**：enhanced 降为 ×1，premium 降为 ×3 (`worker.js:862-866`)

### 10.2 套餐与额度

| 套餐 | 月度额度 | 价格 | 额外购买 |
|---|---|---|---|
| Free | 100 联点 | ¥0 | 100点 $1.99 / 500点 $7.99 |
| Pro | 500 联点 | $4.99/月 或 $49/年 | 同上 |

**额度计算** (`worker.js:849-853`)：
```
remaining = allowance + rollover + purchased - used
```
- `rollover`：上月未用完的订阅额度，最多滚存 1 个月 (`worker.js:790-797`)
- `purchased`：购买的联点包，不过期

### 10.3 Paddle 支付集成

**流程** (`worker.js:1200-1272`)：
1. 前端调用 `/ai/paddle/checkout` → 返回 `price_id` + `discount_id`
2. 前端调用 `Paddle.Checkout.open()` 打开结账页
3. 支付完成 → Paddle 发送 webhook 到 `/ai/paddle/webhook`
4. Worker 验证 HMAC-SHA256 签名 → 更新 billing 数据

**产品配置** (`worker.js:715-720`)：
```javascript
PADDLE_PRODUCTS = {
  pro_monthly:   { price_id_env: 'PADDLE_PRICE_PRO_MONTHLY',   usd: 4.99 },
  pro_yearly:    { price_id_env: 'PADDLE_PRICE_PRO_YEARLY',    usd: 49 },
  credits_100:   { price_id_env: 'PADDLE_PRICE_CREDITS_100',   usd: 1.99 },
  credits_500:   { price_id_env: 'PADDLE_PRICE_CREDITS_500',   usd: 7.99 },
}
```

**折扣系统**：管理员可通过 `/ai/admin/pricing` 设置全局折扣百分比，Worker 自动创建 Paddle discount (`worker.js:1217-1256`)。

### 10.4 微信支付（占位）

`payment.py` 预留了 WeChat Pay 和 Stripe 接口，当前返回 mock 数据。实际支付通过 Paddle（全球）或个人收款码模式（`/ai/create_order` + `/ai/confirm_order`）处理。

---

## 11. 认证体系

### 11.1 Clerk JWT（主要认证）

**验证流程** (`worker.js:100-224`)：
1. 从 Authorization header 或 body.session_token 提取 JWT
2. 解码 header 获取 `kid`，从 Clerk JWKS 查找匹配公钥
3. JWKS 缓存 1 小时 (`worker.js:107-121`)
4. 用 RS256 验证签名
5. 检查 `exp` 过期时间和 `iss` 签发者
6. 从 `sub` claim 提取 user_id

**前端**：Clerk JS SDK v6，支持 Passkey/Google/Apple/WeChat 登录 (`public/index.html:48-53`, `auth.js:26-80`)

### 11.2 WeChat OAuth

**流程** (`worker.js:5307-5416`)：
1. `/auth/wechat` → 重定向到微信授权页
2. 用户授权 → `/auth/wechat/callback` → 用 code 换 access_token
3. 获取微信用户信息 → 在 KV 创建/查找用户 → 返回 Clerk session

### 11.3 SMS OTP

**流程** (`worker.js:5418-5531`)：
1. `/auth/sms/send` → 通过阿里云发送验证码
2. `/auth/sms/verify` → 验证 OTP → 创建/查找 Clerk 用户 → 返回 session

### 11.4 Agent Sync Token（边缘同步认证）

**格式**：`user_id:sync_secret` (`worker.js:266-278`)

**验证** (`worker.js:249-285`)：
- `sync_secret` 与 `env.WELIAN_SYNC_SECRET` 比对
- 如果 `user_id` 以 `wechat_` 开头 → 查找 `wechat_bind:{uid}` 获取绑定的 Clerk user_id
- 否则直接使用 user_id

**微信 Bot 绑定流程**：
1. 微信用户发 `/login` → 生成 `wechat_{hash}` ID → 返回绑定链接
2. 用户在浏览器登录 Clerk → 调用 `/ai/bind_wechat` 绑定
3. 绑定后微信消息通过 `wechat_{hash}` → Clerk user_id 映射访问云端数据

### 11.5 Demo Token

支持模拟模式：`demo_{scenario_id}:demo_secret` (`worker.js:262-264`)，用于产品 demo 场景演示。

---

## 12. 部署架构

### 12.1 Cloudflare Worker

**配置** (`cloud-worker/wrangler.toml`)：
- 名称：`welian-ai`
- 路由：`api.welian.app/*`
- KV 命名空间：`DEVICES`（Tunnel 发现）+ `USER_DATA`（用户数据）
- LLM：MiniMax-M3（standard tier），可配置 Claude（enhanced/premium）
- 定时任务：每周一 09:00 CST 触发周报推送
- Secrets：`LLM_API_KEY`、`PADDLE_API_KEY`、`PADDLE_WEBHOOK_SECRET`、`CLERK_SECRET_KEY` 等

### 12.2 Cloudflare Pages

**部署**：使用自定义脚本 `scripts/deploy.cjs`（不用 `npx wrangler pages deploy`，因 Clash Verge VPN 代理问题）

**关键细节**（`AGENTS.md`）：
- 哈希算法：BLAKE3（非 SHA1）
- 代理：`http://127.0.0.1:7897`（Clash Verge）
- 上传流程：Get JWT → check-missing → upload base64 → upsert-hashes → create deployment

### 12.3 本地 Agent + LaunchAgent

**三个 launchd 服务** (`cli.py:315-416`, `service.py`)：

| 服务 | Identifier | 策略 | 说明 |
|---|---|---|---|
| Bot | `com.welian.bot` | KeepAlive | 微信 Bot，崩溃自动重启 |
| Agent | `com.welian.agent` | KeepAlive + Tunnel | 本地 Agent + Cloudflare Tunnel |
| Weekly | `com.welian.weekly` | Sunday 20:00 | 周报 cron |

**plist 生成** (`service.py:46-97`)：自动生成包含 PATH、环境变量、工作目录的 plist XML，`KeepAlive` 设置 `Crashed: true` + `SuccessfulExit: false` 确保崩溃重启。

### 12.4 Cloudflare Tunnel

**发现机制** (`agent.py:330-398`)：
1. Agent 启动时启动 cloudflared tunnel
2. 优先使用命名 tunnel（`agent.welian.app` 永久 URL）
3. 回退到 quick tunnel（`*.trycloudflare.com` 临时 URL）
4. 用 Clerk user_id（或 device_id）注册到 `/discover/register`
5. 浏览器通过 `/discover/lookup` 查找 tunnel URL

---

## 13. 测试覆盖

### Python 测试（pytest）

| 文件 | 行数 | 覆盖范围 |
|---|---|---|
| `tests/conftest.py` | 52 | `fresh_data` fixture：每个测试独立临时数据目录 |
| `tests/test_engine.py` | 193 | Contact CRUD、Timeline、Todo、Nature 分类、角色映射、建议引擎 |
| `tests/test_billing.py` | 122 | 联点扣费、余额检查、Free/Pro 套餐、月度重置 |
| `tests/test_intent.py` | 70 | 意图解析（regex 模式匹配） |
| `tests/test_edge_cloud.py` | 250 | EdgeClient 云端流程（mock HTTP） |
| `tests/test_import.py` | 150 | 数据导入（CSV/JSON） |

### Cloud Worker 测试（vitest）

| 文件 | 行数 | 覆盖范围 |
|---|---|---|
| `cloud-worker/test/billing.test.js` | 135 | 计费扣费、402 余额不足、月度重置、Pro 折扣 |
| `cloud-worker/test/import.test.js` | 134 | CSV 导入、去重、中文表头解析 |
| `cloud-worker/test/helpers.js` | 40 | mockKV、baseEnv、authHeader、jsonReq 工具函数 |

**测试特点**：
- Python 测试用 `fresh_data` fixture 实现完全隔离（`conftest.py:15-52`）
- Cloud Worker 测试 mock `globalThis.fetch` 模拟 LLM 响应，KV 用内存 Map 模拟
- 无集成测试（不调用真实 LLM 或外部服务）

---

## 14. 近期优化记录

基于源码中的实际实现，以下优化已落地：

### 14.1 数据模型统一
- `models.py`（129 行）作为单一真相源，定义 `create_contact()`/`create_timeline_entry()`/`create_todo()` 工厂函数 (`models.py:1-5`)
- `CONTACT_FIELDS`/`TIMELINE_FIELDS`/`TODO_FIELDS` schema 定义用于验证和文档 (`models.py:80-129`)
- Cloud Worker 的数据同步使用相同 schema（`worker.js` 中的 `loadDataset`/`saveDataset`）

### 14.2 计费统一
- 云端 `deductBilling()` 作为统一计费入口 (`worker.js:858-879`)，所有 LLM 调用都经过此函数
- 模型层级倍率系统：standard/enhanced/premium × 倍率 (`worker.js:776-781`)
- Pro 会员享受倍率优惠 (`worker.js:862-866`)
- 月度额度滚转（rollover）最多 1 个月 (`worker.js:790-797`)

### 14.3 Sentry 监控
- Cloud Worker 内置轻量 Sentry 集成（无 npm 依赖）(`worker.js:33-69`)
- `captureException()` 函数直接发送事件到 Sentry HTTP API
- 仅在 `SENTRY_DSN` 环境变量设置时启用，失败不影响请求

### 14.4 YAML 安全
- `yaml_commands.py` 实现三层安全：白名单命令 + 危险命令黑名单 + 危险字符检测 (`yaml_commands.py:37-140`)
- `validator.py` 实现 BLOCK/WARN 两级危险命令检测 (`validator.py:29-228`)
- `call_caps.py` 限制命令调用次数，防止失控循环 (`call_caps.py:44-62`)

### 14.5 API 文档
- `docs/openapi.json`（189KB）自动生成的 OpenAPI 规范
- `docs/gen_openapi.py`（56KB）生成脚本
- `public/api.html` / `docs/api.html` 交互式 API 文档页
- Worker 根路径 `/` 返回端点列表 (`worker.js:4861-4868`)

### 14.6 app.js 拆分
- 原 `app.js`（397KB）拆分为 11 个 ES Module（`public/modules/`）
- `main.js` 作为入口统一导入和暴露 (`main.js:1-187`)
- 拆分工具：`scripts/extract_modules.cjs`（31KB）
- 验证工具：`scripts/verify_modules.cjs`（17KB）
- 原 `app.js` 保留兼容

### 14.7 Prompt 模板化
- 12 个 prompt 模板文件在 `prompts/` 目录
- `config/welian.yaml` 配置 prompt 路径映射 (`welian.yaml:16-28`)
- Cloud Worker 从 KV 加载 prompt（5 分钟缓存）(`worker.js:229-246`)
- 同步脚本：`scripts/sync_prompts.cjs`

### 14.8 模型层级路由
- 三层模型：standard（MiniMax-M3）/ enhanced（Claude Sonnet）/ premium（Claude Opus）(`welian.yaml:37-48`)
- 场景路由：chat/draft 用 standard，meeting_prep/weekly 用 enhanced (`welian.yaml:51-60`)
- 前端可切换模型层级（`billing.js` 中的 `setModelTier`）

---

## 15. 已知技术债和改进方向

### 技术债

1. **`app.js` 仍保留**：397KB 的旧版单文件未删除，与 modules/ 并存，增加维护负担
2. **`payment.py` 为占位实现**：WeChat Pay 和 Stripe 接口都是 mock，签名验证始终返回 True (`payment.py:211-219`)
3. **数据存储用 JSON 文件**：无索引、无并发控制，联系人规模增大后性能下降
4. **Worker.js 单文件 6707 行**：所有云端逻辑在一个文件中，缺乏模块拆分
5. **handler.py 1965 行**：Bot 处理逻辑过于集中
6. **edge.py 1518 行**：EdgeClient 职责过多（聊天+搜索+导入+导出+上下文收集）
7. **`config/welian.yaml` 有重复的 `devin` 段**（`:82-87` 和 `:92-97`），后者覆盖前者
8. **无集成测试**：所有测试都是单元测试，mock 外部服务
9. **前端无框架**：原生 JS + onclick 挂载到 window，状态管理靠全局变量（`state.js` 793 行）
10. **CORS 完全开放**：Worker 和 FastAPI 都设置 `Access-Control-Allow-Origin: *` (`worker.js:27-31`, `api/server.py:24-30`)

### 改进方向

1. **数据层升级**：考虑 SQLite 替代 JSON 文件，支持索引和并发
2. **Worker 模块化**：将 worker.js 拆分为多个模块（auth/billing/data/ai/search）
3. **前端框架迁移**：考虑引入轻量框架（如 Preact）改善状态管理
4. **实时同步**：当前数据同步是 pull/push 模式，可升级为 WebSocket 实时同步
5. **多用户支持**：Bot 的多用户模式（`WELIAN_MULTI_USER`）已预留但未完善 (`handler.py:295-309`)
6. **离线 AI**：当前依赖云端 LLM，可考虑集成 Ollama 支持完全离线模式
7. **测试覆盖**：增加集成测试和 E2E 测试
8. **监控完善**：Sentry 已集成但仅覆盖 Worker，Python 端虽有 `sentry-sdk` 依赖但未实际使用

---

## 附录：关键设计决策的"为什么"

### 为什么数据存本地 JSON 而不是云端数据库？
**隐私优先**。关系数据是最敏感的个人信息，本地存储确保用户完全拥有数据。云端只做无状态 AI 处理，即使云端被攻破也无法获取用户完整关系图谱。这是产品核心卖点（"数据归你"）。

### 为什么用联点而不是按月无限使用？
**成本控制 + 公平性**。LLM 调用有真实成本（批发价 0.003-0.005 元/千 token），联点机制让用户感知用量，防止滥用。Free 100 点/月足够体验，Pro 500 点覆盖重度用户。方案C（批发赚价差）让 Welian 用批发价采购 LLM token，零售给用户赚取 60-70% 毛利 (`tokens.py:29-33`)。

###为什么陪伴型关系禁止 ROI？
**伦理设计**。产品哲学认为将家人朋友的关系量化为"投资回报"会异化人际关系。这在引擎层强制执行：`advise_nurture()` 不计算分数，只提醒重要日期和记忆 (`engine.py:506-510`)。这是区别于 CRM 工具的核心差异点。

### 为什么用 Cloudflare Tunnel 而不是 ngrok？
**稳定性 + 品牌一致性**。命名 tunnel 提供永久 URL（`agent.welian.app`），不需要每次重启更换地址。Cloudflare 生态统一管理（Worker + Pages + Tunnel），且免费额度足够个人使用。

### 为什么前端不用 React/Vue？
**极简主义 + 部署简单**。Cloudflare Pages 静态部署，无构建步骤。原生 ES Modules 性能好，依赖少。对于关系管理这种中等复杂度的应用，框架引入的抽象成本大于收益。代价是状态管理靠全局变量，已通过 `state.js` 集中管理缓解。

### 为什么 Worker 用单文件 6707 行？
**Cloudflare Worker 的限制**。Worker 虽然支持 ES Modules，但单文件部署最简单。所有逻辑在一个文件中方便全局搜索和调试。代价是可读性下降，未来可考虑用 esbuild 打包多模块。

### 为什么支持三种认证方式？
**用户覆盖**。Clerk 覆盖国际用户（Passkey/Google/Apple），微信 OAuth 覆盖中国用户，SMS OTP 覆盖无微信用户。三种方式最终都映射到 Clerk user_id，统一计费和数据管理。
