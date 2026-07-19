# cloud-worker CLAUDE.md — 机构记忆

> 每次AI在这里做错事，把教训加到这个文件里。Claude Code在写代码前会读这个文件。
> 这个文件checked into git，整个团队共享同一份。错误只经历一次。

## 项目结构

- `src/worker.js` — 单文件Cloudflare Worker，6600+行，包含所有路由和handler
- `test/` — Vitest单元测试，mock KV + mock fetch
- `prompts/` — LLM prompt模板（从KV加载，fallback到inline常量）
- `wrangler.toml` — 部署配置，两个KV namespace: DEVICES + USER_DATA

## 已知AI易错点（持续更新）

### 数据操作

- **add_timeline和add_todo的联系人查找逻辑不同**：add_timeline用`includes`+`aliases.some(a => a.includes())`三重匹配，add_todo只用`name.includes()`。改其中一个时必须同步另一个，否则用户说昵称时一个能创建一个不能。
- **contact的nature字段有多种值**：`'leverage'`、`'nurture'`、`'dual'`、`'双重'`。判断时必须同时检查英文和中文值，不能只查一个。已在handleCloudAdvise和handleOnboardingCreateContacts中出现过这个bug。
- **todo的due日期默认逻辑**：不提供due时默认7天后。用`localDate(req)`不是`new Date()`——前者处理了时区。直接用`new Date()`会导致UTC偏移问题。
- **KV的TTL陷阱**：saveDataset不带expirationTtl——contacts/todos/timeline必须永久保存。之前604800s/7天TTL导致过数据丢失。只有`ctx:${userId}`（data_context）才用7天TTL。

### LLM调用

- **callLLM返回null时要有fallback**：LLM可能超时或返回空。handleAdvise有fallback到`parts.join('\n')`，handleDraft有fallback到模板。新增LLM handler时必须提供fallback。
- **prompt从KV加载有fallback**：`getPrompt(env, name, fallback)`模式——KV有就用KV的，没有用inline常量。不要假设KV一定有prompt文件。
- **LLM响应格式**：Anthropic-compatible API返回`{content: [{type: 'text', text: ...}], usage: {input_tokens, output_tokens}}`。不是OpenAI格式。mock时用`llmResponse()`helper。

### 认证

- **两种认证方式**：Clerk session token（生产）和sync secret（`user_id:sync_secret`，测试用）。`getVerifiedUserId`自动处理两种。测试用`authHeader()`helper走sync secret。
- **handleDraft是例外**：它可选认证——有userId就追踪metrics，没有也不报错。不要给它加强制认证。

### 路由

- **路由顺序敏感**：`/ai/advise`（简单格式化）和`/ai/advise_cloud`（完整KV查询引擎）是两个不同端点。前端onboarding后调的是`advise_cloud`。
- **GET请求不能调`req.json()`**：GET handler里用`const body = method === 'GET' ? null : await req.json().catch(() => ({}))`模式。
- **新端点加在Onboarding段之后**：metrics端点加在`/ai/onboarding/create_contacts`之后，`/ai/push_poll`之前。

### Metrics追踪（P0功能，2026-07新增）

- **trackAction是fire-and-forget**：不await，不阻塞主流程。如果trackAction失败，不影响用户操作完成。
- **registerAdvise要await**：它返回adviseId，后续响应需要这个ID。
- **metrics KV key格式**：`metrics:${userId}`，不是`metrics:${name}:${userId}`。和contacts/todos不同。
- **week key用ISO周**：`getWeekKey()`返回`YYYY-WW`格式。不要用简单的`Math.ceil(dayOfYear/7)`——那不准确。

### 测试

- **mock fetch在beforeEach设置，afterEach恢复**：`globalThis.fetch = originalFetch`。忘记恢复会导致后续测试全部失败。
- **测试用sync secret认证**：`authHeader()`返回`Bearer testuser:secret`。不要在测试里mock Clerk。
- **KV mock是Map**：`env.USER_DATA._store`可以直接检查存储状态。但这是test-only API，生产代码不要用。

## 代码风格

- 单引号字符串，不用双引号
- 函数名用camelCase：`handleCloudAdvise`、`trackAction`
- 常量用UPPER_SNAKE：`ADVISE_SYSTEM`、`DRAFT_SYSTEM`
- KV key用冒号分隔：`contacts:${userId}`、`metrics:${userId}`
- ID生成用`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

## 部署

- **不用`npx wrangler pages deploy`**——Clash Verge VPN会拦截。用`node scripts/deploy.cjs`
- **Worker部署用`npx wrangler deploy`**（在cloud-worker/目录下）——这个不受VPN影响
- **部署前必须跑测试**：`cd cloud-worker && npx vitest run`
- **`npm run deploy`会自动跑lint+test再部署**（predeploy gate）

## 验证体系（按用户旅程组织，7层）

> 设计原则：按"新用户能否走通从落地到第一次获得价值"组织，不是按代码模块组织。
> 发布阻断层（L0-L2）跨前后端验证；单元层（L5）按模块验证。

| 层 | 验证什么 | 机制 | 状态 |
|:--|:--|:--|:--|
| **L0 冒烟** | App能加载吗？JS模块全加载吗？无控制台错误？ | Playwright `l0-smoke.spec.js` | ✅ |
| **L1 激活旅程** | 新用户能走通 落地→注册→onboarding→第一次advise？ | Playwright `l1-activation.spec.js`（mock后端） | ✅ |
| **L2 核心循环** | 四个动词（记/问/拟/报）能跑通吗？ | Playwright `l2-core-loop.spec.js`（mock后端） | ✅ |
| **L3 安全审查** | PR代码有安全/逻辑/CLAUDE.md合规问题吗？ | 多agent代码审查（4并行agent+置信度≥80） | ✅ |
| **L4 人工审查** | PR review | 人工 | ✅ |
| **L5 单元** | 各模块边界条件正确？ | vitest 36 tests + eslint + pytest | ✅ |
| **L6 机构记忆** | 错误不重复犯？ | 本文件（CLAUDE.md） | ✅ |

### L0-L2 旅程测试（发布阻断层）

- **位置**：`tests/browser/l0-smoke.spec.js`、`l1-activation.spec.js`、`l2-core-loop.spec.js`
- **运行**：`npx playwright test --project=journey`
- **架构**：mock Clerk认证 + mock后端API响应，验证前端正确调用后端端点并处理响应
- **覆盖的用户旅程**：
  - L0：页面加载、JS模块加载、CSS加载、无控制台错误、关键DOM元素存在
  - L1：新用户onboarding→extract_intent→创建联系人→advise_cloud→第一次建议显示
  - L2：记（add_timeline）、问（query）、拟（draft）、报（report）、后端错误处理

### L3 代码审查脚本

- **脚本**：`scripts/code-review.mjs`
- **CI触发**：`.github/workflows/code-review.yml`，PR opened/synchronized时自动跑
- **本地运行**：`node scripts/code-review.mjs`（当前分支diff）或`node scripts/code-review.mjs --pr 123 --comment`
- **架构**：4个并行agent（2个CLAUDE.md合规 + 1个bug检测 + 1个安全/逻辑），每个issue经验证agent二次确认，置信度≥80才报告
- **假阳性过滤**：预先存在的问题、linter能抓的、吹毛求疵的、依赖特定输入的——不报

### L5 单元测试

- **cloud-worker**：`cd cloud-worker && npx vitest run`（36 tests）+ `npx eslint src/`（0 errors）
- **Python后端**：`pytest tests/ --ignore=tests/e2e`（engine/billing/intent/import/edge）
- **E2E（真实LLM）**：`pytest tests/e2e/`（需ANTHROPIC_AUTH_TOKEN）
