# Welian × ego-browser：Web感知层功能架构设计

> **版本**：v1.0
> **日期**：2026-07-31
> **核心命题**：用 ego-browser 的浏览器自动化能力，为 Welian 关系网络智能体装上"Web感知层"——从手动记录进化为自动采集，从被动问答进化为主动发现。

---

## 一、问题定义：Welian 的数据瓶颈

### 1.1 现状

Welian 当前的数据来源全部依赖**用户主动输入**：

| 动词 | 数据来源 | 瓶颈 |
|------|----------|------|
| 记 | 用户手动输入对话摘要 | 遗忘、懒惰、延迟 |
| 问 | 查询已记录的历史 | 数据稀疏，只有用户记下的才有 |
| 拟 | 基于已有数据生成消息 | 缺乏对方最新动态 |
| 报 | 聚合已记录的互动 | 容易漏掉未记录的互动 |
| 会 | 拍照提取 | 仅限线下会议 |

**核心问题**：Welian 只知道用户告诉它的，不知道用户没告诉它的。关系网络的变化（升职、跳槽、发帖、互动）发生在微信、LinkedIn、Twitter、GitHub 等平台上，Welian 无法感知。

### 1.2 ego-browser 带来的可能性

ego-browser 的核心能力恰好填补这个缺口：

| ego-browser 能力 | Welian 应用场景 |
|------------------|-----------------|
| 继承用户登录状态 | 无需重新登录微信/LinkedIn/Twitter |
| 任务空间隔离 | 多平台并行采集，不干扰用户浏览 |
| 语义快照（snapshotText） | 结构化提取社交动态 |
| CDP 直接调用 | 穿透 SPA、虚拟列表、iframe |
| 控制权交接（handOff） | 需要验证码/二次验证时交给用户 |
| 文件上传/下载 | 导出/导入联系人数据 |
| browserFetch | 继承页面 origin 调用平台 API |

**关键洞察**：ego-browser 让 Welian 从"等用户输入"进化为"自己去Web上感知"。

---

## 二、整体架构：四层感知模型

```
┌──────────────────────────────────────────────────────────────┐
│                        交互层                                  │
│   微信Bot · 小程序 · Web · Telegram · 飞书 · 钉钉              │
├──────────────────────────────────────────────────────────────┤
│                     智能体核心（已有）                           │
│   意图理解 · 关系推理 · 记忆系统 · 信号映射 · 行动建议            │
├──────────────────────────────────────────────────────────────┤
│                   Web 感知层（新增）                            │
│   ego-browser 任务空间集群                                     │
│   ├── LinkedIn 传感器 → 职业动态采集                            │
│   ├── Twitter/X 传感器 → 社交动态采集                           │
│   ├── GitHub 传感器 → 技术动态采集                              │
│   ├── 微信公众号 传感器 → 内容发布采集                           │
│   └── 通用 Web 传感器 → 任意网站信息采集                         │
├──────────────────────────────────────────────────────────────┤
│                        数据层（已有）                            │
│   SQLite 边缘端 · KV 云端 · LLM Gateway                        │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 感知层定位

感知层是 Welian 和外部 Web 世界之间的**传感器阵列**：

- **不是爬虫**：不批量抓取公开数据，而是基于用户已有关系网络，定向感知特定人的动态
- **不是监控**：不持续跟踪所有人，而是在合适时机（会前、冷却期、信号触发时）做定向感知
- **不是替代用户输入**：感知层补充数据，不替代用户的主动记录。用户说的"我和张总聊了预算"仍然是最重要的数据源

### 2.2 设计原则

| 原则 | 含义 |
|------|------|
| **用户登录继承** | 利用 ego-browser 继承用户登录态，无需存储密码或 OAuth |
| **任务空间隔离** | 每个平台一个 task space，并行运行，互不干扰 |
| **语义优先** | 优先用 snapshotText 语义快照提取数据，减少 token 消耗 |
| **按需感知** | 不做全量爬取，只在触发条件满足时做定向感知 |
| **人机协作** | 遇到验证码/二次验证时 handOff 给用户，不强行绕过 |
| **隐私内嵌** | 感知到的数据只存在用户本地 SQLite，不上传云端 |

---

## 三、五大感知器设计

### 3.1 LinkedIn 传感器（职业动态）

**触发时机**：
- 用户记录了新联系人（自动补充职业背景）
- 会前功课（"问"动词触发）
- 冷却期检测（某人很久没联系，检查是否有职业变动）
- 周报前聚合（每周一自动扫描关键联系人的动态）

**采集内容**：
```javascript
// ego-browser 伪代码
const task = await useOrCreateTaskSpace('linkedin-sensor')
await openOrReuseTab('https://www.linkedin.com/feed/', { wait: true })

// 1. 提取首页动态中联系人的帖子
const feedData = await js(String.raw`(() => {
  const posts = [...document.querySelectorAll('[data-urn*="activity"]')]
  return posts.slice(0, 20).map(post => ({
    author: post.querySelector('.update-components-actor__name')?.textContent?.trim(),
    title: post.querySelector('.update-components-text')?.textContent?.trim()?.substring(0, 200),
    time: post.querySelector('.update-components-actor__sub-description')?.textContent?.trim(),
    urn: post.getAttribute('data-urn')
  }))
})()`)

// 2. 访问特定联系人页面，提取职业变动
await gotoAndWait(`https://www.linkedin.com/in/${contactLinkedinId}/`)
const profileData = await js(String.raw`(() => {
  return {
    name: document.querySelector('h1')?.textContent?.trim(),
    headline: document.querySelector('.text-body-medium')?.textContent?.trim(),
    currentRole: document.querySelector('[data-field="experience"][0] .t-14')?.textContent?.trim(),
    about: document.querySelector('#about')?.parentElement?.textContent?.trim()?.substring(0, 500)
  }
})()`)
```

**数据映射到 Welian**：
- 职位变动 → 生成信号"张总从A公司跳槽到B公司" → 触发"拟"建议
- 发帖内容 → 存入 timeline 作为互动上下文
- 共同联系人 → 丰富关系图谱（Phase 3 引荐路径推理）

### 3.2 Twitter/X 传感器（社交动态）

**触发时机**：
- 信号触发（某联系人发帖提到关键词）
- 会前功课
- 周报聚合

**采集内容**：
```javascript
const task = await useOrCreateTaskSpace('x-sensor')
await openOrReuseTab(`https://x.com/${contactHandle}`, { wait: true })

// 提取最近 tweets
const tweets = await js(String.raw`(() => {
  const articles = [...document.querySelectorAll('article[data-testid="tweet"]')]
  return articles.slice(0, 10).map(article => ({
    text: article.querySelector('[data-testid="tweetText"]')?.textContent?.trim()?.substring(0, 280),
    time: article.querySelector('time')?.getAttribute('datetime'),
    likes: article.querySelector('[data-testid="like"]')?.textContent?.trim(),
    retweets: article.querySelector('[data-testid="retweet"]')?.textContent?.trim()
  }))
})()`)
```

**数据映射**：
- 发帖内容 → 信号"李总最近在讨论AI Agent" → 会前功课素材
- 高互动帖子 → 标记为"热点动态" → 建议用户互动
- 长期未发帖 → 冷却信号补充

### 3.3 GitHub 传感器（技术动态）

**触发时机**：
- 技术类联系人的定期扫描
- 会前功课（技术合作方）

**采集内容**：
```javascript
const task = await useOrCreateTaskSpace('github-sensor')
await openOrReuseTab(`https://github.com/${username}`, { wait: true })

const activity = await js(String.raw`(() => {
  const repos = [...document.querySelectorAll('.pinned-item-list-item')]
  const contributions = document.querySelector('.js-yearly-contributions')?.textContent?.trim()
  return {
    pinnedRepos: repos.map(r => ({
      name: r.querySelector('.repo')?.textContent?.trim(),
      description: r.querySelector('.pinned-item-desc')?.textContent?.trim(),
      stars: r.querySelector('.octicon-star')?.parentElement?.textContent?.trim()
    })),
    contributionSummary: contributions?.substring(0, 200),
    followers: document.querySelector('.vcard-detail .octicon-people')?.parentElement?.textContent?.trim()
  }
})()`)
```

### 3.4 微信公众号传感器（内容发布）

**触发时机**：
- 用户是公众号运营者（如当前用户的场景）
- 联系人中有人运营公众号

**采集内容**：
- 检查公众号最新文章
- 提取文章主题、发布时间、阅读量
- 与联系人关联（如果联系人是公众号作者）

### 3.5 通用 Web 传感器（任意网站）

**触发时机**：
- 用户指定特定网站需要监控
- "问"动词的扩展——用户问"张总的公司最近怎么样"

**采集内容**：
- 公司官网新闻
- 行业媒体报道
- 招聘网站（公司扩张信号）

```javascript
const task = await useOrCreateTaskSpace('web-sensor-' + domain)
await openOrReuseTab(url, { wait: true })

// 通用提取：语义快照 + AI 解读
const snapshot = await snapshotText()
// 将快照发送给 LLM，提取与联系人相关的信息
```

---

## 四、感知触发机制

### 4.1 触发类型

| 触发类型 | 触发条件 | 感知动作 | 频率 |
|----------|----------|----------|------|
| **会前感知** | 用户说"明天见XX" | 定向感知XX的最近动态 | 按需 |
| **冷却感知** | 某联系人超过N天无互动 | 感知其是否有重大变动 | 每日 |
| **信号感知** | 信号引擎检测到异常 | 定向感知确认信号 | 按需 |
| **周报感知** | 每周一 cron | 批量感知关键联系人的本周动态 | 每周 |
| **主动感知** | 用户主动请求 | 定向感知特定联系人 | 按需 |
| **新联系人感知** | 用户添加新联系人 | 感知其公开背景信息 | 按需 |

### 4.2 触发流程

```
用户输入/定时触发
       │
       ▼
  感知调度器
  (Perception Scheduler)
       │
       ├── 判断需要哪些传感器
       ├── 判断触发条件是否满足
       └── 分配 task space
              │
              ▼
       ego-browser 执行
       (在隔离 task space 中)
              │
              ├── 继承用户登录态
              ├── 语义快照提取
              ├── 遇到验证码 → handOff
              └── 返回结构化数据
              │
              ▼
       数据清洗 + LLM 解读
       (Cloud Worker / Edge)
              │
              ├── 提取关键信号
       ├── 关联到联系人
       ├── 存入 timeline / memories
       └── 生成行动建议
              │
              ▼
       推送给用户
       (通过已有 IM 通道)
```

### 4.3 感知调度器设计

感知调度器是 Welian 智能体核心新增的组件：

```python
# src/welian/perception.py（新增）

class PerceptionScheduler:
    """感知调度器：管理 ego-browser 传感器的触发和执行"""

    SENSORS = {
        'linkedin': LinkedInSensor,
        'twitter': TwitterSensor,
        'github': GitHubSensor,
        'wechat_mp': WeChatMPSensor,
        'generic_web': GenericWebSensor,
    }

    def trigger_for_meeting(self, contact_name: str):
        """会前感知：明天见XX → 感知XX的最近动态"""
        contact = self.db.get_contact_by_name(contact_name)
        if not contact:
            return

        sensors_to_run = []
        if contact.linkedin_id:
            sensors_to_run.append(('linkedin', contact.linkedin_id))
        if contact.twitter_handle:
            sensors_to_run.append(('twitter', contact.twitter_handle))
        if contact.github_username:
            sensors_to_run.append(('github', contact.github_username))

        # 并行启动多个 ego-browser task space
        results = self.run_sensors_parallel(sensors_to_run)

        # LLM 解读
        briefing = self.llm.summarize_for_meeting(contact, results)

        # 存入 memory + 返回给用户
        self.db.add_memory(contact.id, f"会前感知：{briefing}")
        return briefing

    def trigger_for_cooldown(self):
        """冷却感知：每日扫描长期未联系的联系人"""
        cooled_contacts = self.db.get_cooled_contacts(days=30)
        for contact in cooled_contacts[:10]:  # 每日最多感知10人
            self.run_sensor('linkedin', contact.linkedin_id)
            self.run_sensor('twitter', contact.twitter_handle)

    def trigger_for_weekly(self):
        """周报感知：每周一批量感知"""
        key_contacts = self.db.get_key_contacts(limit=20)
        # 分批感知，避免频率过高
        for batch in chunks(key_contacts, 5):
            self.run_sensors_parallel(batch)
            time.sleep(60)  # 每批间隔60秒
```

---

## 五、ego-browser 集成架构

### 5.1 集成方式

ego-browser 通过 CLI 被 Welian 的 Python 后端调用：

```python
# src/welian/perception/ego_runner.py（新增）

import subprocess
import json
from typing import Optional

class EgoBrowserRunner:
    """ego-browser CLI 封装"""

    def run_script(self, script: str, task_space: str = None) -> dict:
        """执行 ego-browser nodejs 脚本"""
        if task_space:
            # 复用已有 task space
            header = f"const task = await useOrCreateTaskSpace('{task_space}');\n"
        else:
            header = ""

        full_script = header + script

        result = subprocess.run(
            ['ego-browser', 'nodejs'],
            input=full_script,
            capture_output=True,
            text=True,
            timeout=120  # 2分钟超时
        )

        if result.returncode != 0:
            raise PerceptionError(f"ego-browser failed: {result.stderr}")

        # 解析 cliLog 输出
        return self._parse_output(result.stdout)

    def perceive_linkedin(self, linkedin_id: str) -> dict:
        """感知 LinkedIn 联系人"""
        script = f"""
        const task = await useOrCreateTaskSpace('linkedin-sensor')
        await openOrReuseTab('https://www.linkedin.com/in/{linkedin_id}/', {{ wait: true, timeout: 15 }})
        await wait(3)

        // 检查是否需要登录
        const info = await pageInfo()
        if (info.url.includes('/login') || info.url.includes('/signin')) {{
            await handOffTaskSpace()
            cliLog(JSON.stringify({{ status: 'needs_login', url: info.url }}))
        }} else {{
            const data = await js(String.raw`(() => {{
                return {{
                    name: document.querySelector('h1')?.textContent?.trim(),
                    headline: document.querySelector('.text-body-medium')?.textContent?.trim(),
                    // ... 更多提取逻辑
                }}
            }})()`)
            cliLog(JSON.stringify({{ status: 'success', data: data }}))
        }}
        """
        return self.run_script(script, 'linkedin-sensor')

    def perceive_twitter(self, handle: str) -> dict:
        """感知 Twitter/X 联系人"""
        script = f"""
        const task = await useOrCreateTaskSpace('x-sensor')
        await openOrReuseTab('https://x.com/{handle}', {{ wait: true, timeout: 15 }})
        await wait(3)

        const info = await pageInfo()
        if (info.url.includes('/login') || info.url.includes('/i/flow/login')) {{
            await handOffTaskSpace()
            cliLog(JSON.stringify({{ status: 'needs_login' }}))
        }} else {{
            const tweets = await js(String.raw`(() => {{
                const articles = [...document.querySelectorAll('article[data-testid="tweet"]')]
                return articles.slice(0, 5).map(a => ({{
                    text: a.querySelector('[data-testid="tweetText"]')?.textContent?.trim()?.substring(0, 200),
                    time: a.querySelector('time')?.getAttribute('datetime')
                }}))
            }})()`)
            cliLog(JSON.stringify({{ status: 'success', data: tweets }}))
        }}
        """
        return self.run_script(script, 'x-sensor')
```

### 5.2 Task Space 生命周期管理

```
┌─────────────────────────────────────────────────┐
│              Task Space 生命周期                   │
├─────────────────────────────────────────────────┤
│                                                   │
│  创建 ──→ 运行 ──→ [需登录?] ──→ handOff          │
│   │                      │       │                │
│   │                      │       ▼                │
│   │                      │     用户登录            │
│   │                      │       │                │
│   │                      │       ▼                │
│   │                      │     takeOver           │
│   │                      │       │                │
│   │                      ▼       ▼                │
│   │                   提取数据                     │
│   │                      │                        │
│   ▼                      ▼                        │
│  复用（跨感知任务）      completeTaskSpace         │
│  （保持登录态）          （关闭空间）                │
│                                                   │
└─────────────────────────────────────────────────┘
```

**关键设计**：
- 每个平台一个**持久化 task space**（如 `linkedin-sensor`），复用登录态
- 感知任务完成后**不关闭** task space，保持登录状态供下次使用
- 只在用户主动退出时 `completeTaskSpace`
- 遇到验证码/二次验证时 `handOffTaskSpace`，用户处理后 `takeOverTaskSpace`

### 5.3 错误处理与降级

| 错误类型 | 处理方式 |
|----------|----------|
| ego-browser 未安装 | 降级为纯手动模式，提示用户安装 |
| 页面加载超时 | 重试1次，仍失败则跳过该联系人 |
| 需要登录 | handOff 给用户，用户登录后继续 |
| 频率限制（被平台限流） | 降速，增加间隔时间 |
| 提取数据为空 | 记录日志，不报错 |
| task space 不可用 | 创建新 task space |

---

## 六、数据流与隐私

### 6.1 数据流

```
ego-browser 感知
      │
      ▼
  结构化数据（JSON）
  {
    contact: "张总",
    source: "linkedin",
    signals: [
      { type: "job_change", from: "A公司", to: "B公司", date: "2026-07-15" },
      { type: "post", topic: "AI Agent", date: "2026-07-20" }
    ]
  }
      │
      ▼
  LLM 解读（边缘端）
  "张总最近从A公司跳槽到B公司，并在讨论AI Agent话题"
      │
      ├──→ 存入 SQLite timeline（边缘端，永久）
      ├──→ 存入 KV memories（云端，7天TTL的上下文片段）
      └──→ 生成行动建议
            "建议在见面时聊他的新角色和AI Agent方向"
      │
      ▼
  推送给用户
  （通过微信Bot/小程序/Telegram等已有通道）
```

### 6.2 隐私设计

| 原则 | 实现 |
|------|------|
| **数据最小化** | 只采集与联系人相关的动态，不采集无关数据 |
| **本地存储** | 感知到的原始数据存在用户本地 SQLite，不上传云端 |
| **云端只存摘要** | 只有 LLM 解读后的摘要进入 KV（7天TTL） |
| **用户可控** | 用户可以随时关闭某个传感器，或设置感知频率 |
| **不存储密码** | 利用 ego-browser 继承用户登录态，不存储任何密码 |
| **合规边界** | 只感知用户已有关系网络中的人，不做大规模爬取 |

---

## 七、功能演进路线

### Phase 1：基础感知（1-2周）

**目标**：实现 LinkedIn + Twitter 两个传感器，打通会前感知流程

| 功能 | 描述 | 优先级 |
|------|------|--------|
| EgoBrowserRunner | Python 封装 ego-browser CLI | P0 |
| LinkedIn 传感器 | 提取联系人职业动态 | P0 |
| Twitter 传感器 | 提取联系人最近 tweets | P0 |
| 会前感知触发 | "明天见XX" → 自动感知 | P0 |
| 感知结果存储 | 存入 timeline + memories | P0 |
| 感知结果推送 | 通过已有 IM 通道推送 | P1 |

### Phase 2：定期感知（2-4周）

**目标**：实现冷却感知和周报感知

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 冷却感知 | 每日扫描长期未联系的人 | P0 |
| 周报感知 | 每周一批量感知关键联系人 | P0 |
| GitHub 传感器 | 技术联系人动态 | P1 |
| 感知调度器 | 统一管理所有传感器的触发 | P0 |
| 频率控制 | 避免被平台限流 | P1 |
| 降级机制 | ego-browser 不可用时降级 | P1 |

### Phase 3：智能感知（1-2月）

**目标**：LLM 驱动的智能感知决策

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 智能触发 | LLM 判断何时需要感知谁 | P0 |
| 信号关联 | 感知数据与已有信号关联 | P0 |
| 关系图谱丰富 | 共同联系人、互动网络 | P1 |
| 通用 Web 传感器 | 任意网站的信息提取 | P1 |
| 感知质量评估 | 评估感知数据的准确性和有用性 | P2 |

### Phase 4：开放感知（3-6月）

**目标**：用户自定义传感器

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 传感器 SDK | 用户可以用 ego-browser 写自定义传感器 | P0 |
| 传感器市场 | 社区分享传感器配置 | P2 |
| MCP Server | 将感知能力暴露为 MCP 协议 | P1 |
| 多用户感知 | 支持团队共享感知结果 | P2 |

---

## 八、与现有架构的集成点

### 8.1 新增文件

```
src/welian/
├── perception/              # 感知层（新增）
│   ├── __init__.py
│   ├── scheduler.py         # 感知调度器
│   ├── ego_runner.py        # ego-browser CLI 封装
│   ├── sensors/             # 各平台传感器
│   │   ├── linkedin.py
│   │   ├── twitter.py
│   │   ├── github.py
│   │   ├── wechat_mp.py
│   │   └── generic_web.py
│   ├── triggers.py          # 触发条件判断
│   └── privacy.py           # 隐私控制
```

### 8.2 修改现有文件

| 文件 | 修改内容 |
|------|----------|
| `engine.py` | 在"问"动词中集成会前感知 |
| `weekly.py` | 在周报生成前触发周报感知 |
| `intent.py` | 识别"明天见XX"等意图时触发感知 |
| `db.py` | 新增 `perception_log` 表 |
| `cloud-worker/src/worker.js` | 新增 `/perception/trigger` 端点 |
| `miniprogram/pages/contact-detail/` | 显示感知到的动态 |

### 8.3 新增数据模型

```sql
-- 感知日志表
CREATE TABLE perception_log (
    id          TEXT PRIMARY KEY,
    contact_id  TEXT,
    sensor      TEXT,          -- linkedin | twitter | github | ...
    trigger     TEXT,          -- meeting | cooldown | weekly | manual
    status      TEXT,          -- success | failed | needs_login
    data        TEXT,          -- 原始感知数据 JSON
    summary     TEXT,          -- LLM 解读摘要
    created_at  TEXT
);
CREATE INDEX idx_perception_contact ON perception_log(contact_id);
CREATE INDEX idx_perception_created ON perception_log(created_at);

-- 联系人扩展字段（在 contacts.data JSON 中新增）
{
  "linkedin_id": "zhang-san-123",
  "twitter_handle": "@zhangsan",
  "github_username": "zhangsan",
  "wechat_mp_id": "gh_xxxx",
  "perception_enabled": true,
  "perception_frequency": "weekly"  // daily | weekly | monthly
}
```

### 8.4 新增 API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/perception/trigger` | POST | 手动触发感知 |
| `/perception/status` | GET | 查询感知任务状态 |
| `/perception/history` | GET | 查询感知历史 |
| `/perception/config` | GET/PUT | 感知配置（开关、频率） |

---

## 九、典型用户旅程

### 旅程1：会前功课（问 + 感知）

```
用户（微信Bot）：明天见张总，上次聊到哪了？

Welian 智能体：
  1. 意图识别：会前功课（"问"动词）
  2. 查询本地数据：和张总的最近互动记录
  3. 触发感知：LinkedIn + Twitter 传感器
     ├── ego-browser 打开 LinkedIn（继承登录态）
     ├── 提取张总最近动态：跳槽到B公司、发了AI Agent帖子
     ├── ego-browser 打开 Twitter
     └── 提取张总最近 tweets：在讨论大模型落地
  4. LLM 解读：综合本地记录 + 感知数据
  5. 返回：
     "上次和张总聊了预算方案，他当时在A公司。
      他最近从A公司跳槽到了B公司，在LinkedIn上发了
      一篇关于AI Agent的帖子，Twitter上也在讨论大模型落地。
      建议明天聊聊他在B公司的新方向和AI Agent的实践。"
```

### 旅程2：冷却感知（自动触发）

```
[每日 cron 08:00]

Welian 感知调度器：
  1. 查询冷却联系人：张总（45天无互动）、李总（60天无互动）
  2. 触发 LinkedIn 感知
     ├── 张总：检测到职位变动（A→B）
     ├── 李总：无重大变动，最近发了行业评论
  3. 生成信号：
     - "张总跳槽到B公司"（高优先级信号）
     - "李总最近活跃，发了行业评论"（低优先级信号）
  4. 推送（微信Bot）：
     "今天有2条关系动态：
      🔴 张总从A公司跳槽到了B公司（45天未联系，建议问候）
      🟢 李总最近在LinkedIn上发了行业评论（60天未联系，可以互动）"
```

### 旅程3：周报感知（每周一）

```
[每周一 cron 09:00]

Welian 感知调度器：
  1. 获取关键联系人列表（20人）
  2. 分4批，每批5人，并行感知
     ├── LinkedIn：职位变动、新帖子
     ├── Twitter：最近 tweets、互动热度
     └── GitHub（技术联系人）：repo更新、贡献活跃度
  3. LLM 聚合解读：
     "本周关系网络动态：
      - 张总跳槽到B公司（重大变动）
      - 王总发了AI Agent的帖子，互动很高
      - 李总的GitHub新开了一个Agent框架的repo
      - 3位联系人长期无动态，建议主动联系"
  4. 生成周报 + 推送
```

---

## 十、技术风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| ego-browser 仅支持 macOS | 部署受限 | 感知层只在用户本地运行，云端不依赖 ego-browser |
| 平台反爬机制 | 感知失败 | 低频感知 + 人类行为模拟 + handOff 降级 |
| 登录态过期 | 需要频繁登录 | 持久化 task space + handOff 机制 |
| 平台 DOM 变化 | 提取规则失效 | 语义快照优先 + 定期更新选择器 + 降级处理 |
| 感知数据准确性 | 误导用户 | LLM 解读时标注置信度 + 用户可标记"不准确" |
| 隐私合规 | 法律风险 | 只感知用户已有关系 + 不存储密码 + 用户可控 |

---

## 十一、与 ego-browser GitHub 项目的协同

### 11.1 learnings 复用

ego-browser 项目已有 learnings 库，Welian 可以直接复用：

| learning | Welian 应用 |
|----------|-------------|
| `/learnings/github/` | GitHub 传感器的选择器和提取逻辑 |
| `/learnings/google/` | 通用 Web 传感器的搜索能力 |
| `/learnings/x-com/` | Twitter 传感器的 timeline 提取逻辑 |

### 11.2 贡献回 ego-browser

Welian 开发的传感器 learnings 可以贡献回 ego-browser 社区：
- `/learnings/linkedin/` — LinkedIn 页面结构和提取逻辑
- `/learnings/wechat-mp/` — 微信公众号页面结构

### 11.3 ego-browser 能力需求

Welian 的感知场景可能需要 ego-browser 增强的能力：

| 需求 | 当前状态 | 需要的能力 |
|------|----------|------------|
| 后台定时执行 | 需要手动触发 | cron 集成或 daemon 模式 |
| 多传感器并行 | task space 已支持 | 无需增强 |
| 感知结果回调 | 需要轮询 | webhook 或 callback 机制 |
| 感知日志 | 无 | task space 操作日志 |
| 感知统计 | 无 | task space 运行指标 |

---

## 十二、总结

### 核心价值

ego-browser 为 Welian 带来的核心价值是**从被动记录到主动感知**：

| 维度 | 现状（无感知层） | 有感知层后 |
|------|------------------|------------|
| 数据来源 | 用户手动输入 | 手动 + Web自动感知 |
| 会前功课 | 只能查已有记录 | 自动补充对方最新动态 |
| 冷却检测 | 只知道"很久没联系" | 知道"很久没联系+对方有变动" |
| 周报质量 | 基于不完整的记录 | 基于完整的动态聚合 |
| 关系图谱 | 只有用户知道的关系 | 自动发现共同联系人和网络结构 |

### 架构哲学

这个设计遵循 Welian 已有的架构哲学：
- **端云分离**：感知在用户本地（ego-browser），解读在边缘端（LLM），只摘要上云
- **双关系模型**：感知层对陪伴型关系同样不做 ROI/排序/冷却，只做"记得"和"在场"
- **智能体进化**：感知数据喂入数据飞轮，让智能体越用越懂用户的关系网络
- **伦理优先**：只感知用户已有关系，不做大规模爬取，用户可控开关

### 一句话总结

**ego-browser 是 Welian 的眼睛和耳朵——让关系网络智能体从"等用户说"进化为"自己去Web上感知"。**
