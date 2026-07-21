# Welian 代码库全面分析报告

> **版本**：v1.1.0 | **生成时间**：2026-07-18 | **代码总量**：Python 12,736 行 + JS 28,091 行 ≈ 40,827 行
>
> 面向技术负责人，帮助快速全面掌握整个代码框架和功能。

---

## 1. 项目定位与核心理念

### 1.1 产品定位

**Welian（小维）** 是一个**关系网络智能体**，帮助用户"成为更好的朋友、更好的家人、更好的合作者——最终成为更好的自己"。核心理念：**每段关系都值得用心**。

项目正在从 v1（关系管理工具）向 v2（关系操作系统）演进（见 `docs/SPEC_RELATIONSHIP_OS.md`）。

### 1.2 核心理念：双关系模型

所有关系分为两类，**严格区分对待**（`AGENTS.md` + `docs/SPEC_WELIAN.md`）：

| 类型 | 本质 | 隐喻 | 典型 | 语言体系 | 伦理红线 |
|------|------|------|------|----------|----------|
| **经营型（Leverage）** | 因共同目标而联结 | 果园——栽培收获 | 同行、合作方、客户 | 联结、锚定、兑现、搭桥 | 可做 ROI、排序、冷却 |
| **陪伴型（Nurture）** | 关系本身就是意义 | 浇一盆花——在场即全部 | 家人、挚友、恩师 | 陪伴、记得、在场、用心 | **绝不做 ROI/排序/冷却** |

双重关系（Dual）：同一人可既是挚友又是合作伙伴，合作事项用经营语言，私人情谊用陪伴语言。

### 1.3 四个核心动词

| 动词 | 场景 | 职责 |
|------|------|------|
| **记**（Record） | 互动后快速记录 | 确认记下、复述、自动提取待办 |
| **问**（Ask） | 见面前的功课 | 速览上次话题、待办、近况 |
| **拟**（Draft） | 不知道怎么开口 | 场景化消息草稿 |
| **报**（Report） | 周报/月报回顾 | 上周回顾 + 这周值得联系谁 + 重要日期 |

### 1.4 架构原则

**数据归你，智能来云**（SPEC §7.1）：
- 边缘端（Edge）持有所有用户数据，本地 CRUD
- 云端（Cloud）只接收最小上下文片段，处理 AI 请求后返回结果
- 云端**永不存储**完整 contacts/timeline 数据

---

## 2. 技术栈总览

| 层 | 技术 | 说明 |
|----|------|------|
| **后端核心** | Python 3.9+ | `setup.py` 入口，`welian` CLI |
| **数据层** | SQLite（stdlib `sqlite3`） | WAL 模式，无 ORM，JSON blob + 索引列混合 |
| **Web 框架** | FastAPI + Uvicorn | `src/welian/api/server.py`，AI-only 云 API |
| **LLM 调用** | httpx（同步 HTTP） | Claude / OpenAI / MiniMax / Cloud 多 provider |
| **WebSocket** | websockets 库 | `agent.py` LocalAgent 浏览器桥接 |
| **错误监控** | sentry-sdk（Python） + 轻量 HTTP（Worker） | Worker 端无 npm 依赖的 Sentry envelope |
| **云端** | Cloudflare Worker（JS） | `cloud-worker/src/worker.js`，6707 行 |
| **前端** | 原生 ES Modules（无框架） | `public/modules/*.js`，从 `app.js`（8632行）拆分 |
| **认证** | Clerk（JWT RS256） + 微信 OAuth + 阿里云 SMS | Worker 端 JWKS 验证 |
| **支付** | Paddle（USD 全球） + 微信支付/Stripe（预留） | Worker 处理 checkout + webhook |
| **部署** | Cloudflare Pages + Workers + cloudflared tunnel | `scripts/deploy.cjs` 自定义 BLAKE3 部署 |
| **测试** | pytest（Python） + vitest（JS） | 5 个 Python 测试文件 + 3 个 JS 测试文件 |
| **配置** | YAML（`config/welian.yaml`） + JSON 三层合并 | 用户/项目/本地优先级 |

### 依赖（`requirements.txt`）

```
pyyaml>=6.0       # 配置解析
httpx>=0.24       # LLM HTTP 调用
fastapi>=0.100    # 云 API
uvicorn>=0.23     # ASGI 服务器
websockets>=11.0  # Agent WebSocket
sentry-sdk>=2.0   # 错误监控
```

---

## 3. 目录结构

**src/welian/** — Python 后端核心（12,736 行）

- `__init__.py` — 版本号 1.1.0
- `engine.py` — 核心引擎（720行）— 四动词 + 双关系模型
- `db.py` — SQLite 数据层（298行）— Database 类
- `datastore.py` — per-user 数据封装（153行）— DataStore 类
- `models.py` — 数据模型（129行）— create_contact/timeline/todo
- `edge.py` — EdgeClient（1517行）— 边缘端聊天 + 上下文提取
- `agent.py` — LocalAgent（1351行）— WebSocket 服务 + 文件导入
- `agent_bridge.py` — AgentBridge（617行）— Claude/Devin 会话管理
- `intent.py` — 意图解析（276行）— LLM + regex 双通道
- `ai.py` — AI 格式化（235行）— 拟稿 + 建议格式化
- `tokens.py` — 计费系统（381行）— 联点计费
- `payment.py` — 支付系统（339行）— 占位 + Paddle 接口
- `calendar_sync.py` — 日历同步（400行）— macOS Calendar AppleScript
- `cli.py` — CLI 入口（787行）— 所有子命令
- `weekly.py` — 周报生成（268行）
- `llm/` — LLM 路由层
  - `base.py` — 抽象基类 + 异常体系（130行）
  - `router.py` — 工厂 + 自适应路由（263行）
  - `claude.py` — Anthropic Claude 客户端（186行）
  - `openai.py` — OpenAI 兼容客户端（203行）
  - `cloud.py` — Cloud 网关客户端（150行）
- `bot/` — 微信 Bot
  - `handler.py` — 消息处理（1995行）— SessionManager + IlinkApi
  - `config.py` — 配置系统（297行）— 三层 JSON 合并
  - `service.py` — 服务管理（348行）— launchd/systemd
  - `validator.py` — 安全验证（265行）— 危险命令拦截
  - `yaml_commands.py` — YAML 命令（352行）— 直接 shell 执行
  - `cmd_loader.py` — Markdown 命令加载（184行）
  - `call_caps.py` — 调用限制（226行）— 防失控
  - `hooks.py` — 钩子系统（254行）— PreToolUse/PostToolUse
  - `cdn.py` — CDN 上传（209行）— AES-128-ECB 加密
  - `commands/` — YAML 命令定义（6个 .md 文件）
- `api/server.py` — FastAPI 云 API（196行）

**cloud-worker/** — Cloudflare Worker（6,707 行 JS）

- `src/worker.js` — 主文件 — 所有 API 端点
- `wrangler.toml` — 部署配置 — KV + cron + 路由
- `package.json` — vitest 测试
- `test/` — 3 个测试文件
- `prompts/` — AI prompt 模板（PROACTIVE.md + sync.sh）

**public/** — 前端（ES Modules，~18,000 行）

- `app.js` — 单体入口（8632行，历史遗留）
- `modules/` — 拆分后的 ES Modules（11个文件）
  - `main.js` — 入口 — 导入所有模块 + 暴露 window
  - `state.js` — 全局状态 + i18n + 配置常量
  - `auth.js` — Clerk 认证 + 微信/手机登录
  - `chat.js` — 聊天核心（1945行）
  - `agent-bridge.js` — Agent 桥接（1693行）— Live/Cloud 模式
  - `contacts.js` — 联系人管理（761行）
  - `todos.js` — 待办管理（398行）
  - `timeline.js` — 时间线（130行）
  - `billing.js` — 计费 UI（507行）
  - `proactive.js` — 主动推送 + onboarding（987行）
  - `misc.js` — 杂项功能（913行）
- `index.html` — 主页
- `bind.html` — 微信绑定页
- `pricing.html` — 定价页
- `landing.html` — 落地页
- `styles.css` — 样式（38,251 字节）
- `openapi.json` — API 文档（189,371 字节）

**scripts/** — 工具脚本

- `migrate_json_to_sqlite.py` — JSON→SQLite 迁移
- `welian_pdf.py` — PDF 生成（品牌模板）
- `send_report_to_wechat.py` — 报告推送微信
- `deploy.cjs` — Cloudflare Pages 部署
- `extract_modules.cjs` — app.js→modules 拆分
- `verify_modules.cjs` — 模块验证
- `sync_config.cjs` — 配置同步
- `sync_prompts.cjs` — Prompt 同步

**tests/** — Python 测试

- `conftest.py` — fresh_data fixture — 隔离测试
- `test_engine.py` — 引擎 CRUD 测试
- `test_billing.py` — 计费测试
- `test_edge_cloud.py` — 边缘-云分离测试
- `test_import.py` — 导入流程测试
- `test_intent.py` — 意图解析测试

**其他目录**

- `config/welian.yaml` — 主配置文件
- `prompts/` — AI prompt 模板（12个 .md 文件）
- `docs/` — 文档（SPEC_WELIAN.md, SPEC_RELATIONSHIP_OS.md, ARCHITECTURE.md, BUSINESS_MODEL.md, openapi.json）
- `miniprogram/` — 微信小程序（早期版本）
- `data/` — 运行时数据（welian.db + JSON 备份）
- `data_template/` — 空数据模板
- `setup.py` — Python 包定义
- `requirements.txt` — Python 依赖
- `pytest.ini` — 测试配置
- `AGENTS.md` — AI 行为规则（可编辑调整 AI 人格）

---

## 4. 系统架构

### 4.1 架构图

系统分三层：用户交互层 → 边缘端（用户设备）→ 云端（Cloudflare Worker）。

**第一层：用户交互层**

| 渠道 | 实现 | 说明 |
|------|------|------|
| 微信 Bot | ilink HTTP long-polling | handler.py 主入口 |
| Web 前端 | Cloudflare Pages | index.html + app.js ES Modules |
| CLI | terminal | welian 命令行工具 |
| 微信小程序 | miniprogram | 规划中 |
| macOS Calendar | AppleScript | calendar_sync.py |

**第二层：边缘端（Edge — 用户设备）**

| 模块 | 文件 | 职责 |
|------|------|------|
| EdgeClient | edge.py | 聊天入口，cloud_chat() / chat() |
| Engine | engine.py | 四动词（记/问/拟/报）+ 双关系模型 |
| Intent | intent.py | LLM + regex 双通道意图解析 |
| Calendar Sync | calendar_sync.py | todos → macOS Calendar |
| DataStore | datastore.py | per-user SQLite 数据封装 |
| LLM Router | llm/router.py | Claude / OpenAI / Cloud 三客户端路由 |

DataStore 内部 SQLite 表：contacts / timeline / todos / usage（4 表 7 索引，WAL 模式）

**第三层：云端（Cloud — Cloudflare Worker）**

| 模块 | 端点 | 职责 |
|------|------|------|
| AI 路由 | /ai/chat, /ai/draft, /ai/advise | LLM 转发 + 上下文注入 |
| 数据 CRUD | /data/pull, /data/push, /data/sync | KV 存储 per-user 数据 |
| 计费网关 | deductBilling() | 统一 token-based 扣费 |
| 认证 | verifyClerkToken() | Clerk JWT + SMS OTP |
| LLM API | MiniMax / Claude | 实际 LLM 调用 |
| KV 存储 | DEVICES / USER_DATA | Cloudflare KV |
| Paddle | 支付网关 + webhook | Pro 订阅 |
| Sentry | captureException() | 异常监控 |
| Cron | 每周一 01:00 UTC | handleScheduledPush 周报推送 |

**层间数据流**：边缘端通过 LLM Router → Cloud Client 发送最小上下文片段到云端，云端调用 LLM API 后返回结果。数据存储在边缘端 SQLite（本地）和云端 KV（同步备份）。

### 4.2 数据流说明

#### 流程 A：微信用户聊天（Social AI 模式）

1. 微信用户消息 → ilinkai.weixin.qq.com (HTTP long-polling)
2. IlinkApi.get_updates() [handler.py:111]
3. process_message() [handler.py:1482]
   - SessionManager.activate_store(user_id) [handler.py:339] — 多用户隔离
   - EdgeClient.cloud_chat(text) [edge.py:325]
     - **Step 1**: POST /ai/extract_intent [worker.js:5062] — LLM 提取意图 + 关键词 + 执行数据操作（数据飞轮）
     - **Step 2**: POST /data/search 或 GET /data/context [worker.js:5102/5107] — 从 Cloud KV 搜索相关联系人数据
     - **Step 3**: POST /ai/chat [worker.js:4892]
       - handleChat() [worker.js:881]
       - verifyClerkToken() 认证 → getBillingData() 余额检查 → callLLM() 转发到 LLM Provider → deductBilling() 扣费
       - 返回 reply + usage + billing
     - **Step 4**: 保存对话历史
4. send_long_message() 分段发送回微信

#### 流程 B：Web 前端聊天（Live/Cloud 双模式）

1. 浏览器 (index.html) → modules/chat.js: send()
2. 路由决策 (agent-bridge.js):
   - **Live 模式**: WebSocket → LocalAgent (agent.py:9800端口) → EdgeClient.chat() 本地引擎 + 本地 LLM
   - **Cloud 模式**: HTTP → Worker /ai/chat → 同流程 A 的 Step 3

#### 流程 C：本地 CLI 操作

1. `welian chat "记一下：和张总聊了预算"`
2. cli.py:main() [cli.py:127]
3. EdgeClient(cloud_url).chat(text) [edge.py:547]
   - intent.parse(text) [intent.py:90] — LLM 意图识别
   - _gather_context() [edge.py:590] — 本地数据操作 + 上下文
   - _llm_respond() [edge.py:621] — LLM 生成回复
   - _bill_cloud_usage() [edge.py:73] — Cloud 模式计费

#### 流程 D：周报自动推送（Cron）

1. Cloudflare Cron: 每周一 01:00 UTC
2. scheduled() [worker.js:5585] → handleScheduledPush()
3. 遍历已绑定微信用户 → handleWeeklyReport() [worker.js:5625]
4. loadDataset() 加载 contacts/timeline/todos → callLLM() 生成结构化 JSON 周报
5. 通过微信 Bot API 推送

---

## 5. 数据层（SQLite schema + DataStore + 迁移）

### 5.1 SQLite Schema（`src/welian/db.py:24-62`）

```sql
-- 混合设计：索引列 + JSON blob
-- 索引列用于 WHERE 过滤，JSON blob 存完整记录（schema 灵活）

CREATE TABLE contacts (
    id     TEXT PRIMARY KEY,
    name   TEXT,
    nature TEXT,          -- leverage | nurture | dual
    role   TEXT,          -- friend | family | collaborator
    data   TEXT NOT NULL  -- 完整 JSON 记录
);
CREATE INDEX idx_contacts_name   ON contacts(name);
CREATE INDEX idx_contacts_nature ON contacts(nature);
CREATE INDEX idx_contacts_role   ON contacts(role);

CREATE TABLE timeline (
    id      TEXT PRIMARY KEY,
    contact TEXT,
    date    TEXT,
    data    TEXT NOT NULL
);
CREATE INDEX idx_timeline_contact ON timeline(contact);
CREATE INDEX idx_timeline_date    ON timeline(date);

CREATE TABLE todos (
    id       TEXT PRIMARY KEY,
    contact  TEXT,
    status   TEXT,         -- pending | completed | cancelled
    priority TEXT,         -- P0 | P1 | P2
    due      TEXT,
    data     TEXT NOT NULL
);
CREATE INDEX idx_todos_contact  ON todos(contact);
CREATE INDEX idx_todos_status   ON todos(status);
CREATE INDEX idx_todos_priority ON todos(priority);
CREATE INDEX idx_todos_due      ON todos(due);

CREATE TABLE usage (
    user_id TEXT PRIMARY KEY,
    data    TEXT NOT NULL   -- 计费数据 JSON
);
```

### 5.2 Database 类（`db.py:76-298`）

`Database` 是 `sqlite3.Connection` 的薄封装，线程安全（`threading.Lock`）：

| 方法 | 行号 | 职责 |
|------|------|------|
| `_connect()` | 65 | WAL 模式 + `synchronous=NORMAL` + `foreign_keys=ON` |
| `load_all_contacts()` | 98 | 全表扫描 |
| `get_contact(id)` | 121 | **O(1) PK 查找** |
| `upsert_contact()` | 129 | `INSERT OR REPLACE` 单条 |
| `query_contacts(nature, role)` | 149 | 索引列 WHERE 过滤 |
| `query_timeline(contact_id, since_date)` | 187 | `ORDER BY date DESC` |
| `add_timeline(record)` | 204 | 单条 INSERT（无需全表重写） |
| `upsert_todo()` | 257 | 单条 INSERT OR REPLACE |
| `load_usage(user_id)` | 274 | PK 查找计费数据 |
| `count(table)` | 295 | `SELECT COUNT(*)` |

### 5.3 DataStore 类（`datastore.py:29-153`）

**per-user 数据目录封装**，每个 DataStore 拥有独立的 `<data_dir>/welian.db`：

```python
store = DataStore(Path("~/.welian/data"))
contacts = store.load_contacts()           # 委托给 Database
contact = store.get_contact("c1")          # O(1) PK 查找
store.upsert_contact(contact)              # 单条写入
todos = store.query_todos(status="pending") # SQL 索引查询
```

关键设计：
- 公共 API 与旧 JSON 版本完全一致（`load_contacts()`/`save_contacts()` 等）
- `engine.py` 通过 `_default_store` 单例委托，无需知道存储格式
- `contacts_file`/`timeline_file` 等属性向后兼容，指向 `.db` 文件

### 5.4 多用户隔离（`engine.py:46-64`）

```python
_default_store = DataStore(_DATA_DIR)

def set_store(store: DataStore):
    """切换到 per-user DataStore（多用户隔离）。
    替代旧的 _init_paths() + os.environ hack。"""
    global _default_store, _CONFIG, _DATA_DIR
    _default_store = store
    _DATA_DIR = store.data_dir
```

`SessionManager`（`handler.py:287`）在处理每个用户消息前调用 `activate_store(user_id)` 切换到该用户的独立 DataStore。

### 5.5 JSON → SQLite 迁移（`scripts/migrate_json_to_sqlite.py`）

```bash
python3 scripts/migrate_json_to_sqlite.py --data-dir ~/.welian/data
```

- 读取 `contacts.json`/`timeline.json`/`todos.json`/`usage.json`
- 导入到 `welian.db`
- 原 JSON 文件重命名为 `.json.bak` 备份
- 支持 `--dry-run` 预览

### 5.6 数据模型（`models.py`）

`create_contact()`（行 11-45）确保所有联系人字段一致，无论在哪里创建（engine/agent/worker.js）：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | string | `c-{uuid[:12]}` | 主键 |
| `name` | string | 必填 | 姓名 |
| `nature` | enum | `leverage` | leverage/nurture/dual |
| `role` | string | = relation | 角色 |
| `strength` | int | 3 | 关系强度 1-5 |
| `leverage` | object | `{}` | 经营型：goals/how/direction/confirmed |
| `nurture` | object | `{}` | 陪伴型：bond/presence_events |
| `memories` | array | `[]` | 记忆条目 |
| `important_dates` | array | `[]` | 重要日期 |
| `aliases`/`alias` | array | `[]` | 别名（兼容两种拼写） |

---

## 6. 核心引擎（engine.py — 四动词 + 双关系模型）

**文件**：`src/welian/engine.py`（720 行）

### 6.1 职责

- 联系人 CRUD + 关系分类
- 时间线（互动记录）管理
- 待办管理 + 自动提取
- 建议引擎（问）
- 角色仪表盘（报）
- 双关系模型实现 + 伦理护栏

### 6.2 关键函数/类

| 函数 | 行号 | 职责 |
|------|------|------|
| `_get_home_dir()` | 18 | 查找项目根（WELIAN_HOME > 包目录 > ~/.welian） |
| `_load_config()` | 31 | 加载 YAML 配置（config.local > config > welian） |
| `get_store()` / `set_store()` | 49/54 | DataStore 单例管理（多用户隔离） |
| `_load(name)` / `_save(name, data)` | 106/125 | 表名路由到 SQLite（兼容旧 Path 调用） |
| `infer_nature(contact)` | 151 | 推断关系类型（explicit > relation/tags > 默认 leverage） |
| `contact_role(contact)` | 164 | 映射到 friend/family/collaborator 三角色 |
| `list_contacts(nature, role, tag)` | 177 | SQL 索引过滤 + Python tag 过滤 |
| `add_contact()` | 199 | O(1) PK 查重 + `create_contact()` + `upsert_contact()` |
| `resolve_contact(query)` | 223 | ID → name → alias → fuzzy 模糊匹配 |
| `auto_classify_nature()` | 277 | 基于规则自动分类（家人→nurture，默认→leverage） |
| `batch_classify_natures()` | 303 | 批量分类（dry_run 预览 / apply 应用） |
| `add_timeline()` | 457 | 记录互动 + 自动提取待办（`_auto_add_todo`） |
| `list_timeline(contact_id, days)` | 472 | SQL `WHERE date >= cutoff ORDER BY date DESC` |
| `_auto_add_todo()` | 490 | P0 关键词检测（融资/引荐/签约）→ 3天期限 |
| `list_todos(priority, status)` | 505 | SQL 索引查询 |
| `complete_todo()` | 519 | 单条 UPDATE（无需全表重写） |
| `advise_leverage(top)` | 532 | **经营型建议**：冷却评分 + 目标锚定 + 待办信号 |
| `advise_nurture(days_ahead)` | 574 | **陪伴型提醒**：重要日期 + 记忆跟进（**无评分无排序**） |
| `role_dashboard(month)` | 623 | 月度角色回顾（行为事实，不做幸福评分） |
| `get_birthdays(days)` | 667 | 生日提醒 |
| `get_dashboard()` | 706 | 总览仪表盘 |

### 6.3 双关系模型实现

**经营型（Leverage）— `advise_leverage()`（行 532）**：
- 评分系统：21天没联系 +30，14天 +20，从未联系 +25
- 目标锚定：`leverage.confirmed` +15
- 待办信号：有 pending todo +25
- 关系强度：`strength * 2`
- 按分数排序，返回 top N

**陪伴型（Nurture）— `advise_nurture()`（行 574）**：
- **伦理护栏**：无评分、无排序、无 ROI（SPEC §2.6）
- 只检查重要日期（生日/纪念日）临近
- 检查记忆中的可跟进事项（考试/手术/出差）
- 温和提醒，不催促

### 6.4 依赖关系

- `datastore.py` (DataStore — SQLite)
- `models.py` (create_contact/timeline/todo)
- `yaml` (配置加载)

---

## 7. 边缘端（edge.py EdgeClient + intent + ai）

### 7.1 EdgeClient（`edge.py`，1517 行）

**职责**：边缘端聊天客户端，持有所有数据本地，调用 LLM 生成回复。

| 方法 | 行号 | 职责 |
|------|------|------|
| `__init__(cloud_url, user_id, user_token)` | 39 | cloud_url 非空→Cloud 模式，空→自托管 |
| `_get_llm()` | 50 | 获取 LLM 客户端（Cloud/直连） |
| `_bill_cloud_usage()` | 73 | Cloud 模式按实际 token 用量计费 |
| `search_contacts(keywords, contact_name)` | 94 | 两步 LLM 流程：关键词提取→联系人搜索 |
| `get_context(text)` | 195 | 返回边缘数据上下文（不调 LLM） |
| `_gather_full_context(text)` | 212 | 收集完整上下文（联系人+待办+时间线） |
| `cloud_chat(text)` | 325 | **Cloud 聊天流程**：extract_intent → data/search → ai/chat |
| `chat(text, file_info)` | 547 | **本地聊天流程**：intent → gather → LLM respond |
| `_gather_context(intent_type, payload, text)` | 590 | 按意图路由到对应数据收集器 |
| `_llm_respond()` | 621 | LLM 生成最终回复（含多模态文件支持） |
| `_load_prompt(name, fallback)` | 665 | 从 `prompts/` 目录加载系统提示词 |
| `_template_respond()` | 690 | LLM 不可用时的模板降级 |
| `_gather_record/ask/query/check/draft/report/alias()` | 722-964 | 各意图的数据收集器 |
| `export_data(password)` | 1275 | 加密导出 |
| `import_data(data, password)` | 1299 | 加密导入 |

**Cloud 聊天流程**（`cloud_chat`，行 325）：
1. `POST /ai/extract_intent` — LLM 提取意图 + 关键词 + 执行数据操作
2. `POST /data/search` 或 `GET /data/context` — 获取数据上下文
3. `POST /ai/chat` — LLM 生成回复（带 AGENTS.md 系统提示）
4. 保存对话历史（最近 50 轮）

### 7.2 意图解析（`intent.py`，276 行）

**双通道意图识别**：LLM 优先，regex 降级。

| 意图 | 常量 | 示例 |
|------|------|------|
| 记录 | `INTENT_RECORD` | "记一下：和张总聊了预算" |
| 询问 | `INTENT_ASK` | "该联系谁" |
| 拟稿 | `INTENT_DRAFT` | "给老同学拟条消息" |
| 报告 | `INTENT_REPORT` | "本月角色回顾" |
| 查看 | `INTENT_CHECK` | "老周最近咋样" |
| 查询 | `INTENT_QUERY` | "有多少联系人" |
| 待办 | `INTENT_TODO` | "近期要做什么" |
| 别名 | `INTENT_ALIAS` | "X就是Y" |
| 帮助 | `INTENT_HELP` | "help" |

`_llm_parse()`（行 111）使用 LLM 返回 JSON 格式意图，`_regex_parse()`（行 201）使用正则模式匹配降级。

### 7.3 AI 格式化（`ai.py`，235 行）

| 函数 | 行号 | 职责 |
|------|------|------|
| `draft_message()` | 21 | 拟写消息（LLM + 模板降级） |
| `format_advise_leverage()` | 77 | 格式化经营型建议（🔴🟡 冷却标记） |
| `format_advise_nurture()` | 96 | 格式化陪伴型提醒（**无评分语言**） |
| `format_role_dashboard()` | 118 | 月度角色回顾（行为事实，非状态评判） |
| `format_nurture_check()` | 175 | 单个联系人关系详情 |

### 7.4 依赖关系

- `engine.py` (数据操作)
- `intent.py` (意图识别)
- `ai.py` (格式化)
- `tokens.py` (计费)
- `llm/router.py` (LLM 客户端)

---

## 8. 本地 Agent（agent.py WebSocket + agent_bridge）

### 8.1 LocalAgent（`agent.py`，1351 行）

**职责**：HTTP + WebSocket 服务器，桥接浏览器 ↔ 本地数据 ↔ 云端 AI。

| 方法 | 行号 | 职责 |
|------|------|------|
| `__init__(port, cloud_url, token, user_token, tunnel)` | 305 | 初始化 EdgeClient + 设备 ID |
| `_generate_token()` | 321 | 生成配对 token |
| `_get_device_id()` | 324 | 机器信息 SHA256 → 稳定设备 ID |
| `_start_tunnel()` | 330 | cloudflared 隧道 + 发现服务注册 |
| `_get_cloud_user_id()` | 400 | Clerk user_id 优先 |
| `_fetch_cloud_contacts()` | 407 | 从 Cloud KV 拉取联系人 |
| `_push_cloud_contacts()` | 427 | 推送联系人到 Cloud KV |
| `_xlsx_to_csv()` | 454 | Excel → CSV（UTF-8 BOM） |
| `_import_via_devin()` | 488 | Devin CLI 提取联系人 |
| `_chat_via_devin()` | 589 | Devin CLI 聊天 |
| `_devin_direct()` | 662 | Devin 直接执行 |

**发现服务**：`DISCOVERY_URL = "https://welian-ai.farmost.workers.dev"`，用 Clerk user_id 作为注册 key，实现多设备发现。

### 8.2 AgentBridge（`agent_bridge.py`，617 行）

**职责**：管理 per-WeChat-user 的 Agent 会话（Claude/Devin）。

| 方法 | 行号 | 职责 |
|------|------|------|
| `chat(user_id, text, agent_type)` | 203 | 非流式聊天 |
| `chat_stream(user_id, text, on_chunk)` | 220 | **流式聊天** — 实时输出 |
| `_inject_mode_prompt()` | 301 | 模式注入（learn/design/loop） |
| `confirm_pending()` | 312 | 确认待执行的危险操作 |
| `_call_claude_stream()` | 323 | Claude CLI 流式调用 |
| `_call_devin_stream()` | 362 | Devin CLI 流式调用 |
| `_run_streaming()` | 422 | 通用流式执行 |
| `_get_or_create_session()` | 526 | 获取/创建用户会话 |
| `set_agent(user_id, agent)` | 559 | 切换 agent 类型 |
| `reset_session()` | 594 | 重置会话 |
| `cancel()` | 602 | 取消执行 |

**安全层**（`chat_stream` 行 220）：
1. `validate_prompt()` — 危险命令拦截（validator.py）
2. `check_and_increment()` — 调用次数限制（call_caps.py）
3. 模式注入（learn/design/loop prompt 前缀）
4. 归因控制（commit attribution 开关）

### 8.3 依赖关系

**agent.py**

- `edge.py` (EdgeClient)
- `cli.py` (_get_user_id)
- `agent_bridge.py` (AgentBridge — 懒加载)

**agent_bridge.py**

- `bot/validator.py` (安全验证)
- `bot/call_caps.py` (调用限制)
- `bot/config.py` (配置)
- `subprocess` (Claude/Devin CLI)

---

## 9. 微信 Bot（handler.py + SessionManager 多用户）

### 9.1 IlinkApi（`handler.py:73-285`）

**微信 ilink Bot API 客户端**（HTTP long-polling）：

| 方法 | 行号 | 职责 |
|------|------|------|
| `get_updates()` | 111 | 35s long-poll 获取新消息 |
| `get_config()` | 121 | 获取 bot 配置（含 typing_ticket） |
| `get_typing_ticket()` | 128 | 获取 typing ticket（24h TTL 缓存） |
| `send_message()` | 162 | 发送消息（2.5s/user 限速） |
| `send_file_message()` | 210 | 发送文件消息 |
| `send_typing()` | 272 | 发送打字状态 |

### 9.2 SessionManager（`handler.py:287-377`）

**per-WeChat-user 会话管理 + 数据隔离**：

| 方法 | 行号 | 职责 |
|------|------|------|
| `_user_data_dir(wechat_user_id)` | 303 | 多用户：`~/.welian/users/<hash>/data/`；单用户：`~/.welian/data/` |
| `_get_or_create_store()` | 319 | 获取/创建用户 DataStore |
| `get_client(wechat_user_id)` | 327 | 获取 EdgeClient（切换 store） |
| `activate_store(wechat_user_id)` | 339 | **处理消息前切换 DataStore**（多用户隔离核心） |
| `reset()` | 353 | 重置用户会话 |
| `is_local_mode()` / `set_local_mode()` | 360/363 | 本地 Agent 模式切换 |

**多用户隔离机制**：
- 环境变量 `WELIAN_MULTI_USER=1` 启用
- 每个 WeChat user_id → SHA256 hash → 独立数据目录
- `activate_store()` 在处理每条消息前调用 `engine.set_store(store)`
- 替代旧的 `os.environ` hack，避免全局状态污染

### 9.3 消息处理流程（`handler.py:1482-1521`）

```python
async def process_message(user_id, text, api, context_token):
    if await handle_command(text, ...):  # 斜杠命令
        return
    if sessions.is_local_mode(user_id):
        await _process_local_agent(...)  # 本地 Agent 模式（流式）
    else:
        sessions.activate_store(user_id)  # 多用户隔离
        client = await sessions.get_client(user_id)
        reply = await asyncio.to_thread(client.cloud_chat, text)  # Cloud AI
        await send_long_message(api, user_id, reply, context_token)
```

### 9.4 Bot 子模块

| 模块 | 行数 | 职责 |
|------|------|------|
| `config.py` | 297 | 三层 JSON 配置合并（用户>项目>本地）+ 权限规则 + 代理配置 |
| `service.py` | 348 | launchd/systemd 服务安装/卸载/状态 |
| `validator.py` | 265 | 危险命令拦截（rm -rf / git push --force / DROP TABLE 等） |
| `yaml_commands.py` | 352 | YAML 定义的直接 shell 命令（天气/IP 等） |
| `cmd_loader.py` | 184 | Markdown 命令加载（`!`command`` shell 注入 + `$ARGUMENTS`） |
| `call_caps.py` | 226 | 调用次数限制（防 Agent 失控：git push 10次/会话） |
| `hooks.py` | 254 | PreToolUse/PostToolUse/Stop 钩子 |
| `cdn.py` | 209 | 微信 CDN 上传（AES-128-ECB 加密） |
| `commands/` | 6个md | commit/design/dev/learn/loop/review 命令模板 |

---

## 10. Cloud Worker（worker.js API 端点 + 计费 + Sentry）

**文件**：`cloud-worker/src/worker.js`（6707 行）— 单文件 Cloudflare Worker

### 10.1 API 端点总览

| 路径 | 方法 | 处理函数 | 行号 | 职责 |
|------|------|----------|------|------|
| `/health` | GET | — | 4852 | 健康检查 |
| `/` | GET | — | 4861 | API 信息 |
| `/ai/chat` | POST | `handleChat` | 881 | **计费网关**：转发 LLM + 扣费 |
| `/ai/draft` | POST | `handleDraft` | 564 | 拟写消息 |
| `/ai/extract` | POST | `handleExtract` | 616 | 提取待办/要点 |
| `/ai/advise` | POST | `handleAdvise` | 648 | 格式化建议 |
| `/ai/advise_cloud` | POST | `handleCloudAdvise` | 316 | 云端建议引擎 |
| `/ai/billing` | POST | `handleBilling` | 986 | 查询余额 |
| `/ai/upgrade` | POST | `handleUpgrade` | 1018 | 升级套餐 |
| `/ai/purchase_credits` | POST | `handlePurchaseCredits` | 1065 | 购买联点 |
| `/ai/pricing` | GET | — | 4929 | 定价信息 |
| `/ai/paddle/checkout` | POST | `handlePaddleCheckout` | 1200 | Paddle 支付 |
| `/ai/paddle/webhook` | POST | `handlePaddleWebhook` | 1274 | Paddle 回调 |
| `/ai/paddle/cancel` | POST | `handlePaddleCancel` | 1457 | 取消订阅 |
| `/ai/extract_intent` | POST | `handleExtractIntent` | 2032 | **意图提取 + 数据飞轮** |
| `/ai/import` | POST | `handleImportContacts` | 2669 | 联系人导入 |
| `/ai/import_batch` | POST | `handleImportBatch` | 2819 | 批量导入 |
| `/ai/import_chunk` | POST | `handleImportChunk` | 2854 | 分块导入 |
| `/ai/proactive` | POST | `handleProactiveSuggestion` | 3043 | 主动建议 |
| `/ai/meeting_prep` | POST | `handleMeetingPrep` | 1664 | 见面功课 |
| `/ai/weekly_report` | POST | `handleWeeklyReport` | 5625 | 周报生成 |
| `/ai/monthly_report` | POST | — | 5249 | 月报 |
| `/ai/session_summary` | POST | — | 5067 | 会话摘要 |
| `/ai/estimate_cost` | POST | `handleEstimateCost` | 1743 | 成本预估 |
| `/ai/gift_credits` | POST | `handleGiftCredits` | 1795 | 赠送联点 |
| `/ai/create_coupon` | POST | `handleCreateCoupon` | 1840 | 创建优惠券 |
| `/ai/redeem_coupon` | POST | `handleRedeemCoupon` | 1853 | 兑换优惠券 |
| `/ai/bind_wechat` | POST | `handleBindWechat` | 1883 | 微信绑定 |
| `/ai/check_bind` | POST | `handleCheckBind` | 1963 | 检查绑定 |
| `/ai/unbind_wechat` | POST | `handleUnbindWechat` | 2003 | 解绑微信 |
| `/ai/diagnostics` | POST | `handleDiagnostics` | 3817 | 诊断 |
| `/ai/search` | POST | `handleDataSearch` | 3253 | 数据搜索 |
| `/ai/read_url` | POST | — | 5017 | 读取 URL |
| `/data/sync` | POST | `handleDataSync` | 3148 | 数据同步 |
| `/data/sync_full` | POST | `handleDataSyncFull` | 3196 | 全量同步 |
| `/data/search` | POST | `handleDataSearch` | 3253 | 数据搜索 |
| `/data/context` | GET | `handleDataContext` | 3387 | 数据上下文 |
| `/data/pull` | GET | — | 5113 | 拉取数据 |
| `/data/push` | POST | — | 5124 | 推送数据 |
| `/data/contacts` | CRUD | `handleContactsCRUD` | 3548 | 联系人 CRUD |
| `/data/timeline` | CRUD | — | 5142 | 时间线 CRUD |
| `/data/todos` | CRUD | — | 5214 | 待办 CRUD |
| `/data/todos/done` | POST | — | 4704 | 完成待办 |
| `/data/todos/reopen` | POST | — | 4719 | 重开待办 |
| `/data/todos/cancel` | POST | — | 4734 | 取消待办 |
| `/data/todos/postpone` | POST | — | 4748 | 推迟待办 |
| `/data/profile` | GET/POST | — | 5147 | 用户档案 |
| `/data/memory` | GET/POST | `handleMemory` | 3778 | 记忆管理 |
| `/data/goals` | GET/POST | `handleGoals` | 4205 | 目标管理 |
| `/data/sessions` | GET/POST | `handleSessions` | 3992 | 会话管理 |
| `/data/skills` | CRUD | `handleCustomSkills` | 4100 | 自定义技能 |
| `/data/metrics` | GET | — | 5268 | 指标 |
| `/data/calendar/feed` | GET | — | 5220 | 日历订阅 |
| `/data/delete_account` | POST | `handleDeleteAccount` | 1495 | 删除账户 |
| `/auth/wechat` | GET | — | 5307 | 微信 OAuth |
| `/auth/wechat/callback` | GET | — | 5319 | OAuth 回调 |
| `/auth/sms/send` | POST | — | 5418 | 阿里云 SMS 发送 |
| `/auth/sms/verify` | POST | — | 5450 | SMS 验证 |
| `/discover/register` | POST | — | 5533 | 隧道注册 |
| `/discover/lookup` | GET | — | 5549 | 隧道查找 |
| `/ai/admin/check` | POST | `isAdmin` | 4936 | 管理员检查 |
| `/ai/admin/pricing` | GET/POST | — | 4944 | 定价管理 |

### 10.2 计费系统（统一计费）

**`deductBilling()`（行 858）— 所有 LLM 调用的统一扣费入口**：

```javascript
async function deductBilling(env, userId, usage, action, detail, modelTier) {
  const billing = await getBillingData(env, userId);  // 处理月度重置
  const multipliers = await getModelMultipliers(env);
  let tierMultiplier = multipliers[modelTier] || 1;
  // Pro 会员折扣：enhanced ×1，premium 降至 ×3
  if (billing.plan === 'pro') {
    if (modelTier === 'enhanced') tierMultiplier = 1;
    else if (modelTier === 'premium') tierMultiplier = Math.min(tierMultiplier, 3);
  }
  const basePoints = await calcPoints(usage, env);  // input/1k*1 + output/1k*2
  const points = Math.round(basePoints * tierMultiplier * 10) / 10;
  billing.used += points;
  billing.history.push({ date, action, points, detail });
  await saveBillingData(env, userId, billing);
}
```

**计费公式**：
- `points = (input_tokens/1000 × 1 + output_tokens/1000 × 2) × tier_multiplier`
- 模型层级：standard ×1, enhanced ×3, premium ×10
- Pro 会员折扣：enhanced 降至 ×1，premium 降至 ×3
- 月度额度：free 100 点，pro 500 点
- Rollover：未用完的额度可结转

### 10.3 Sentry 监控（`worker.js:33-69`）

**轻量级 Sentry，无 npm 依赖**：

```javascript
async function captureException(env, error, context = {}) {
  const dsn = env?.SENTRY_DSN;
  if (!dsn) return;  // 未配置则 no-op
  // 构建 Sentry envelope（event_id + timestamp + exception + stacktrace）
  // POST 到 https://sentry.io/api/{projectId}/envelope/
}
```

- 在 `fetch` handler 的 catch 中调用（行 5576）：`ctx.waitUntil(captureException(...))`
- 在 `scheduled` cron handler 中调用（行 5586）
- **永不阻断请求**：监控失败不影响正常流程

### 10.4 认证（`worker.js:100-230`）

- **Clerk JWT RS256 验证**：`verifyClerkToken()`（行 148）使用 JWKS（内存缓存）
- **微信绑定**：WeChat user_id → hash → `wechat_bind:wechat_<hash>` → Clerk user_id
- **SMS OTP**：阿里云 SMS，5 分钟 TTL，存 KV
- **Sync token**：`{user_id}:{sync_secret}` 格式，用于 Edge ↔ Cloud 同步

### 10.5 KV 命名空间

| Binding | 用途 |
|---------|------|
| `DEVICES` | 设备发现（tunnel URL 注册）+ SMS OTP 存储 |
| `USER_DATA` | 用户数据（contacts/timeline/todos/billing/sessions/goals/skills/memory） |

### 10.6 Cron

```toml
[triggers]
crons = ["0 1 * * 1"]  # 每周一 01:00 UTC = 周一 09:00 CST
```

→ `handleScheduledPush()`：遍历已绑定用户，生成周报并推送微信。

### 10.7 LLM 调用（`callLLM`，行 457）

- 支持 Anthropic Claude API 格式 + OpenAI 兼容格式
- 模型分层：standard（MiniMax-M3）/ enhanced / premium
- 内容安全熔断：检测 `content_filter`/`safety` 等 stop_reason，返回优雅降级

---

## 11. 前端（app.js + modules）

### 11.1 架构

前端为**原生 ES Modules**（无 React/Vue 框架），从单体 `app.js`（8632 行）拆分为 11 个模块。

### 11.2 模块说明

| 模块 | 行数 | 职责 |
|------|------|------|
| `main.js` | 187 | 入口：导入所有模块 + 暴露 `window.*` onclick + 初始化 |
| `state.js` | 793 | 全局状态 + i18n（中/英）+ 配置常量（CLOUD_URL/CLERK_KEY） |
| `auth.js` | 413 | Clerk 认证 + 微信 OAuth + 手机 SMS 登录 |
| `chat.js` | 1945 | 聊天核心：发送/接收/流式/建议/语音/PDF/天气 |
| `agent-bridge.js` | 1693 | **Live/Cloud 双模式路由** + Agent 配置 + 场景模拟 |
| `contacts.js` | 761 | 联系人列表/详情/编辑/导入/分组/冷却/见面功课 |
| `todos.js` | 398 | 待办管理：创建/完成/推迟/取消/删除 |
| `timeline.js` | 130 | 时间线列表/搜索/编辑/删除 |
| `billing.js` | 507 | 计费 UI：余额/升级/购买/Paddle checkout |
| `proactive.js` | 987 | 主动推送 + onboarding + 周报/月报分享 |
| `misc.js` | 913 | 杂项：设置/日历/记忆/目标/技能/导出/天气 |

### 11.3 关键设计

**Live/Cloud 双模式**（`agent-bridge.js`）：
- **Live 模式**：WebSocket 连接 LocalAgent（localhost:9800 或 tunnel），本地数据 + 本地 AI
- **Cloud 模式**：HTTP 连接 Worker `/ai/chat`，云端数据（KV）+ 云端 AI
- 路由配置（`config/welian.yaml` routing.mode）：auto / live_first / cloud_first / cloud_only

**状态管理**（`state.js`）：
- 全局变量通过 export/import 共享（`isAuthed`/`isLive`/`isCloud`/`conversationHistory` 等）
- setter 函数模式（`setIsAuthed()` 等）保持一致性

**i18n**：中/英双语，`I18N[currentLang]` 对象，`applyLang()` 切换。

### 11.4 页面

| 文件 | 职责 |
|------|------|
| `index.html` | 主应用（聊天 + 联系人 + 待办 + 时间线 + 计费） |
| `bind.html` | 微信绑定页（WeChat user_id → Clerk 账号） |
| `pricing.html` | 定价页 |
| `landing.html` | 落地页 |
| `privacy.html` | 隐私政策 |
| `terms.html` | 服务条款 |

---

## 12. LLM 路由与计费

### 12.1 LLM Router（`llm/router.py`，263 行）

**单例工厂模式**，根据配置自动选择 provider：

```python
_PROVIDERS = {
    "claude": ClaudeClient,   # Anthropic Claude API
    "openai": OpenAIClient,   # OpenAI 兼容 API
    "cloud": CloudLLMClient,  # 方案C: 批发赚价差
}
```

**`get_client(force_new, cloud_url, user_token)`（行 118）优先级**：
1. `cloud_url` 非空 → Cloud 模式（方案C）
2. `ai.engine` 配置（claude/openai）
3. `LLM_ENGINE` 环境变量
4. 默认 `claude`

**自适应路由**（`adaptive_route`，行 221）：
- 简单问候 → openai（便宜模型）
- 编码/分析 → claude（强模型）
- 未知复杂度 → claude（默认）

**配置注入**：从 `~/.claude/settings.json` 读取 env 段，复用系统已配置的 API Key。

### 12.2 LLM 客户端

| 客户端 | 文件 | 行数 | 协议 |
|--------|------|------|------|
| `ClaudeClient` | `claude.py` | 186 | Anthropic Messages API |
| `OpenAIClient` | `openai.py` | 203 | OpenAI Chat Completions（兼容 MiniMax 等） |
| `CloudLLMClient` | `cloud.py` | 150 | Welian Cloud 网关（方案C） |

**异常体系**（`base.py`）：
- `LLMAuthError` — 认证失败（不重试）
- `LLMRateLimitError` — 速率限制（指数退避重试）
- `LLMTimeoutError` — 超时（重试）
- `LLMResponseError` — 响应异常（重试）
- `complete_with_retry()` — 自动重试（max_retries=2，1s/2s 退避）

### 12.3 计费系统（`tokens.py`，381 行）

**双模式计费**：

**Action-based**（本地/自托管模式）：
```python
TOKEN_COSTS = {
    "ai_record_enhance": 1, "ai_draft": 2, "advise_engine": 3,
    "weekly_report": 3, "meeting_prep": 3, "anchor_assist": 3,
    "role_dashboard": 5, "annual_report": 20, "premium_model": 2,
}
FREE_MONTHLY_ALLOWANCE = 100  # 免费版
PRO_MONTHLY_ALLOWANCE = 500   # Pro 版
```

**Token-based**（Cloud 模式，方案C）：
```python
POINTS_PER_1K_INPUT = 1   # 1000 input tokens = 1 point
POINTS_PER_1K_OUTPUT = 2  # 1000 output tokens = 2 points
# 批发成本 ~0.003-0.005 元/千token，零售 1点=0.1元 → 毛利 60-70%
```

| 函数 | 行号 | 职责 |
|------|------|------|
| `consume(user_id, feature, count)` | 66 | Action-based 扣费 |
| `consume_tokens(user_id, input, output)` | 224 | Token-based 扣费（Cloud 模式） |
| `get_balance(user_id)` | 104 | 查询余额 |
| `get_plan_info(user_id)` | 176 | 套餐详情 + 下次重置时间 |
| `reset_monthly_allowance()` | 135 | 每月1号重置（保留 purchased） |
| `check_and_consume()` | 156 | 原子操作：检查+扣费 |
| `estimate_cost(messages, system)` | 306 | 调用前成本预估 |
| `check_and_consume_tokens()` | 347 | 预扣费（调用前检查余额） |

**Cloud 端统一计费**（`worker.js:deductBilling`）：
- 所有 LLM 调用（chat/draft/advise/weekly/import 等）统一走 `deductBilling()`
- 模型层级乘数：standard ×1, enhanced ×3, premium ×10
- Pro 会员折扣：enhanced 降至 ×1，premium 降至 ×3

### 12.4 支付系统（`payment.py`，339 行）

**占位实现**，预留三个渠道：

| 渠道 | 函数 | 状态 |
|------|------|------|
| 微信支付 | `wechat_pay_create/callback` | 占位（mock） |
| Stripe | `stripe_create/webhook` | 占位（mock） |
| Paddle | `paddle_checkout_url/webhook_verify` | **已实现**（Worker 端处理） |

**价格**：
- Pro 月度：¥29/月 或 $4.99/mo
- Pro 年度：¥299/年 或 $49/yr
- 联点包：100点 $1.99，500点 $7.99

**Paddle 签名验证**（`paddle_webhook_verify`，行 305）：HMAC-SHA256，格式 `ts=<timestamp>;h1=<hex_digest>`。

---

## 13. 配置系统

### 13.1 主配置（`config/welian.yaml`，128 行）

```yaml
ai:
  engine: "claude"              # claude | openai | minimax
  model: "claude-sonnet-4-6"
  prompts:                      # 12 个 prompt 模板路径
    chat: "prompts/chat.md"
    draft: "prompts/draft.md"
    # ...

cloud:
  tiers:                        # 模型分层
    standard: { model: "MiniMax-M3", base_url: "..." }
    enhanced: { model: "claude-sonnet-4-6", ... }
    premium: { model: "claude-opus-4-6", service_tier: "priority" }
  tier_routing:                 # 场景→层级映射
    chat: "standard"
    meeting_prep: "enhanced"
    weekly_report: "enhanced"

routing:
  mode: "auto"                  # auto | live_first | cloud_first | cloud_only

agent:
  engine: "devin"
  devin: { model: "GLM-5.2 High", permission_mode: "dangerous", max_turns: 50 }

tokens:
  free_monthly: 100
  pro_monthly: 500
```

### 13.2 Bot 配置（`bot/config.py`，297 行）

**三层 JSON 合并**（优先级：local > project > user）：
- `~/.welian/config.json` — 用户级默认
- `.welian/config.json` — 项目级共享
- `.welian/config.local.json` — 本地覆盖（secrets）

支持：
- `permissions`：allow/deny/ask 规则（`Exec(git *)` 格式）
- `ai.model` / `ai.engine` — 模型配置
- `proxy` — 代理配置（system/manual/off）
- `attribution` — commit 归因开关
- `agent.max_turns` — 最大推理轮数

### 13.3 Worker 配置（`wrangler.toml`）

```toml
[vars]
LLM_MODEL = "MiniMax-M3"
LLM_BASE_URL = "https://api.minimaxi.com/anthropic"
PADDLE_ENVIRONMENT = "production"

[[kv_namespaces]]
binding = "DEVICES"    # 设备发现
binding = "USER_DATA"  # 用户数据

[triggers]
crons = ["0 1 * * 1"]  # 每周一推送
```

Secrets（`wrangler secret put`）：`LLM_API_KEY`、`SENTRY_DSN`、`PADDLE_API_KEY`、`PADDLE_WEBHOOK_SECRET`、`CLERK_SECRET_KEY`、`ALIYUN_SMS_KEY` 等。

### 13.4 AI 行为规则（`AGENTS.md`）

**修改 AGENTS.md 即可调整 AI 行为，无需改代码**：
- 身份：小维（Welian），关系网络智能体
- 双关系模型 + 伦理红线
- 诚实原则（最高优先级）：不编造数据
- 四个核心场景
- 回复风格 + 后续建议格式（`<<<SUGGESTIONS>>>`）
- PDF 生成规则（品牌模板）
- 部署规则（不用 `npx wrangler`，用 `scripts/deploy.cjs`）

---

## 14. 部署与运维

### 14.1 部署架构

| 组件 | 部署到 | 工具 |
|------|--------|------|
| 前端（public/） | Cloudflare Pages | `scripts/deploy.cjs`（BLAKE3 + 代理） |
| Cloud Worker | Cloudflare Workers | `wrangler deploy`（cloud-worker/ 目录） |
| Python 后端 | 用户设备（本地） | `pip install -e .` 或直接运行 |
| 微信 Bot | 用户设备（launchd） | `welian bot-install` |
| Local Agent | 用户设备（launchd） | `welian agent-install` |
| 周报 Cron | 用户设备（launchd） | `welian weekly-install` |
| 日历同步 Cron | 用户设备（launchd） | `welian sync-calendar-install` |

### 14.2 前端部署（`scripts/deploy.cjs`，181 行）

**不用 `npx wrangler pages deploy`**（Clash Verge VPN 拦截 Node.js fetch）：

```javascript
const { ProxyAgent } = require('wrangler/node_modules/undici');
const proxy = new ProxyAgent('http://127.0.0.1:7897');
setGlobalDispatcher(proxy);

// BLAKE3 哈希（非 SHA1）
const blake3 = require('wrangler/node_modules/blake3-wasm');
function hashFile(content, filepath) {
  return blake3.hash(content.toString('base64') + ext).toString('hex').slice(0, 32);
}

// 流程：Get JWT → check-missing → upload base64 → upsert-hashes → create deployment
```

### 14.3 服务管理（`bot/service.py`，348 行）

- **macOS**：launchd plist（`RunAtLoad` + `KeepAlive` 崩溃重启 + `ThrottleInterval` 10s）
- **Linux**：systemd user unit（`Restart=always` + `enable-linger`）
- 服务：`com.welian.bot` / `com.welian.agent`
- 日志：`~/.welian/logs/`（RotatingFileHandler 2MB × 5）

### 14.4 日历同步（`calendar_sync.py`，400 行）

- AppleScript 操作 macOS Calendar
- 创建 "Welian" 日历
- 待办 → 日历事件（含见面功课：上次互动/锚定目标/记忆/重要日期）
- 经营型 vs 陪伴型不同语言（伦理护栏）
- launchd cron：每天 08:00 自动同步 + 清理已完成

### 14.5 诊断（`cli.py:_run_doctor`，行 586）

`welian doctor` 检查所有系统组件：Python 版本、数据目录、LLM 可用性、Bot 服务状态、Agent 服务状态、Cron 状态。

---

## 15. 测试体系

### 15.1 Python 测试（pytest）

| 文件 | 行数 | 覆盖范围 |
|------|------|----------|
| `conftest.py` | 59 | `fresh_data` fixture — 每个测试用独立 temp 目录 + 空 SQLite |
| `test_engine.py` | 193 | 联系人 CRUD、时间线 CRUD、待办 CRUD、字段完整性 |
| `test_billing.py` | 122 | 联点扣费、余额检查、Free/Pro 套餐、Token-based 计费 |
| `test_edge_cloud.py` | 249 | 边缘-云分离、本地离线操作、数据不外泄 |
| `test_import.py` | 175 | xlsx→csv 转换、Devin JSON 提取、去重（mock 外部调用） |
| `test_intent.py` | 73 | 四动词意图识别（中/英）、联系人提取 |

**隔离机制**（`conftest.py`）：
```python
@pytest.fixture
def fresh_data():
    tmp = Path(tempfile.mkdtemp(prefix="welian_pytest_"))
    os.environ["WELIAN_HOME"] = str(tmp)
    store = DataStore(tmp / "data")
    engine.set_store(store)  # 新 API，独立 SQLite
    # 清空所有表
    db.conn.execute("DELETE FROM contacts")
    # ...
    yield { "engine": engine, "tokens": tokens, "store": store }
    engine._init_paths()  # 恢复
```

### 15.2 JS 测试（vitest）

| 文件 | 行数 | 覆盖范围 |
|------|------|----------|
| `billing.test.js` | 135 | 计费扣费、402 余额不足、KV 持久化 |
| `import.test.js` | 175 | 联系人导入、vCard/CSV 解析 |
| `helpers.js` | 45 | mock KV + baseEnv + authHeader |

**Mock 策略**：
- `globalThis.fetch` mock LLM 响应
- KV 用内存 Map 模拟
- Clerk 认证用 mock JWT

### 15.3 运行测试

```bash
# Python
pytest  # 或 pytest tests/test_engine.py -v

# JS
cd cloud-worker && npm test  # vitest run
```

---

## 16. 最新优化记录

### 16.1 SQLite 数据层（替代 JSON 文件存储）

**改动文件**：`db.py`（新增 298 行）、`datastore.py`（重写 153 行）、`engine.py`（适配）

**改进**：
- JSON 文件 → SQLite WAL 模式
- ACID 事务保证
- 索引列加速查询（O(1) PK 查找 vs O(n) 全表扫描）
- 单条 INSERT/UPDATE（无需全表重写）
- `migrate_json_to_sqlite.py` 一键迁移 + JSON 备份

**影响**：
- `engine.add_contact()`：O(n) 查重 → O(1) PK 查找
- `engine.add_timeline()`：全表重写 → 单条 INSERT
- `engine.list_todos(status="pending")`：Python 过滤 → SQL WHERE 索引
- `engine.resolve_contact()`：O(1) PK 优先，降级到全表扫描

### 16.2 多用户隔离

**改动文件**：`engine.py`（`set_store()` 行 54）、`handler.py`（`SessionManager` 行 287）

**改进**：
- 旧方案：`os.environ["WELIAN_HOME"]` 全局变量 hack → 并发用户互相污染
- 新方案：`engine.set_store(store)` 显式切换 + `SessionManager.activate_store()` 每消息前调用
- 每个 WeChat user → SHA256 hash → `~/.welian/users/<hash>/data/welian.db`
- 环境变量 `WELIAN_MULTI_USER=1` 启用

### 16.3 Sentry 监控

**Python 端**：`sentry-sdk>=2.0`（`requirements.txt`）

**Worker 端**（`worker.js:33-69`）：
- 轻量级实现，无 npm 依赖
- `captureException(env, error, context)` 构建 Sentry envelope
- `SENTRY_DSN` 环境变量控制开关
- `ctx.waitUntil()` 异步发送，不阻断请求
- 覆盖：fetch handler catch（行 5576）+ scheduled cron（行 5586）

### 16.4 计费统一

**改动文件**：`worker.js`（`deductBilling` 行 858）、`tokens.py`（`consume_tokens` 行 224）

**改进**：
- **统一入口**：所有 LLM 调用（chat/draft/advise/weekly/import/proactive/session_summary 等）统一走 `deductBilling()`
- **模型层级乘数**：standard ×1, enhanced ×3, premium ×10
- **Pro 会员折扣**：enhanced 降至 ×1，premium 降至 ×3
- **Rollover**：未用完的月度额度可结转
- **内容安全熔断**：检测 `content_filter` stop_reason，返回优雅降级（不扣费）
- **预扣费**：`estimate_cost()` + `check_and_consume_tokens()` 调用前检查余额

### 16.5 其他近期改动

- **数据飞轮**：`/ai/extract_intent`（worker.js:2032）在意图提取时自动执行数据操作（add_timeline/add_todo/add_contact）
- **Cloud 聊天流程**：`edge.py:cloud_chat()`（行 325）三步流程替代旧的 intent→gather→respond
- **AGENTS.md 系统提示**：从 `https://welian.app/AGENTS.md` 动态加载（`edge.py:510`）
- **Paddle 支付**：完整的 checkout + webhook + cancel 流程（worker.js:1200-1457）
- **微信绑定**：WeChat user_id → Clerk 账号绑定（worker.js:1883）
- **SMS 登录**：阿里云 SMS OTP（worker.js:5418）
- **前端模块化**：app.js（8632行）拆分为 11 个 ES Modules

---

## 17. 已知技术债务

### 17.1 代码规模

| 文件 | 行数 | 问题 |
|------|------|------|
| `cloud-worker/src/worker.js` | 6707 | 单文件过大，应拆分为路由模块 |
| `public/app.js` | 8632 | 历史遗留单体，已被 modules/ 拆分但未删除 |
| `src/welian/bot/handler.py` | 1995 | 单文件含 IlinkApi + SessionManager + 消息处理 |
| `src/welian/edge.py` | 1517 | EdgeClient 单类职责过多 |
| `src/welian/agent.py` | 1351 | LocalAgent 含 WebSocket + 文件导入 + Devin 集成 |

### 17.2 架构债务

1. **`app.js` 与 `modules/` 并存**：modules/ 是从 app.js 拆分的，但 app.js 仍存在（8632行），`scripts/extract_modules.cjs` 是拆分工具。需要确认哪个是实际使用的入口。

2. **`engine.py` 全局单例**：`_default_store` 是模块级全局变量，`set_store()` 修改全局状态。虽然比 `os.environ` hack 好，但在真正的并发场景下仍需注意线程安全。

3. **`config/welian.yaml` 重复键**：`agent.devin` 段在行 82-87 和行 91-97 重复定义（YAML 后者覆盖前者）。

4. **`payment.py` 占位实现**：微信支付和 Stripe 接口都是 mock，签名验证 `_verify_signature()` 始终返回 True（行 228）。

5. **Worker 单文件**：6707 行单文件，所有端点 + 认证 + 计费 + 导入 + 数据 CRUD 混在一起，难以维护。

6. **`intent.py` LLM 依赖**：意图解析优先用 LLM，如果 LLM 不可用降级到 regex。但 regex 模式可能无法覆盖所有自然语言变体。

7. **`calendar_sync.py` macOS 专属**：AppleScript 方案只支持 macOS，Linux/Windows 无法使用。

8. **`data/` 目录混存**：`data/` 下同时有 `welian.db`（SQLite）和 `contacts.json`/`timeline.json`/`usage.json`（旧 JSON），迁移后 JSON 应为 `.bak` 但实际仍存在。

9. **前端无构建工具**：原生 ES Modules 无打包/压缩/Tree-shaking，所有模块直接通过 `<script type="module">` 加载，生产环境性能可优化。

10. **测试覆盖不完整**：`agent.py`/`agent_bridge.py`/`calendar_sync.py`/`payment.py`/`cli.py` 无单元测试。Worker 端只测了 billing 和 import。

---

## 附录：关键文件行数统计

### Python 后端（12,736 行）

| 文件 | 行数 |
|------|------|
| `bot/handler.py` | 1995 |
| `edge.py` | 1517 |
| `agent.py` | 1351 |
| `cli.py` | 787 |
| `engine.py` | 720 |
| `agent_bridge.py` | 617 |
| `calendar_sync.py` | 400 |
| `tokens.py` | 381 |
| `payment.py` | 339 |
| `bot/service.py` | 348 |
| `bot/yaml_commands.py` | 352 |
| `bot/config.py` | 297 |
| `db.py` | 298 |
| `bot/validator.py` | 265 |
| `weekly.py` | 268 |
| `intent.py` | 276 |
| `llm/router.py` | 263 |
| `bot/hooks.py` | 254 |
| `ai.py` | 235 |
| `bot/call_caps.py` | 226 |
| `bot/cdn.py` | 209 |
| `llm/openai.py` | 203 |
| `api/server.py` | 196 |
| `llm/claude.py` | 186 |
| `bot/cmd_loader.py` | 184 |
| `llm/cloud.py` | 150 |
| `datastore.py` | 153 |
| `llm/base.py` | 130 |
| `models.py` | 129 |

### 前端 + Worker（28,091 行）

| 文件 | 行数 |
|------|------|
| `public/app.js` | 8632 |
| `cloud-worker/src/worker.js` | 6707 |
| `public/modules/chat.js` | 1945 |
| `public/modules/agent-bridge.js` | 1693 |
| `public/modules/proactive.js` | 987 |
| `public/modules/misc.js` | 913 |
| `public/modules/state.js` | 793 |
| `public/modules/contacts.js` | 761 |
| `public/modules/billing.js` | 507 |
| `public/modules/auth.js` | 413 |
| `public/modules/todos.js` | 398 |
| `public/modules/main.js` | 187 |
| `public/modules/timeline.js` | 130 |

### 测试（871 行）

| 文件 | 行数 |
|------|------|
| `tests/test_edge_cloud.py` | 249 |
| `tests/test_engine.py` | 193 |
| `tests/test_import.py` | 175 |
| `tests/test_billing.py` | 122 |
| `tests/test_intent.py` | 73 |
| `tests/conftest.py` | 59 |
| `cloud-worker/test/import.test.js` | 175 |
| `cloud-worker/test/billing.test.js` | 135 |
| `cloud-worker/test/helpers.js` | 45 |

---

*报告结束。如需深入了解某个模块，请查阅对应文件源码和 `docs/` 目录下的详细规约文档。*
