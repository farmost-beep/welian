# ego-browser / ego-lite 项目技术规格

> **版本**: v1.0
> **日期**: 2026-07-31
> **来源**: 深度探索 ego-lite GitHub 仓库 (citrolabs/ego-lite, 5918 stars)、本地 skill 文件系统、CLI 运行时探测

---

## 1. 项目概览

| 属性 | 值 |
|------|-----|
| **项目名** | ego-lite (ego browser) |
| **开发方** | CitroLabs |
| **GitHub** | https://github.com/citrolabs/ego-lite |
| **官网** | https://lite.ego.app |
| **文档** | https://lite.ego.app/document/ |
| **许可证** | MIT |
| **框架版本** | 0.4.4.17 |
| **Skill版本** | 1.2.3 (2026-06-25) |
| **Stars** | 5,918 |
| **平台** | macOS (Intel + Apple Silicon); Windows/Linux 路线图中 |

### 1.1 定位

为 AI Agent 设计的 Chromium 浏览器。人类用户和 AI Agent 在同一个浏览器中并行工作——Agent 在独立的 Space 中运行任务，继承用户的登录状态，但不干扰用户的正常浏览。

### 1.2 核心差异

| 对比维度 | ego-lite | Browser-Use / agent-browser | ChatGPT Atlas / Perplexity Comet |
|----------|----------|---------------------------|----------------------------------|
| 本质 | 真实浏览器 | 自动化库 | AI 浏览器（内置 Agent） |
| 登录继承 | ✅ 用户登录态 | ❌ 需重新登录 | ❌ 独立环境 |
| Agent 选择 | 任意 Agent | 任意 Agent | 内置固定 |
| 独立浏览器 | 不需要 | 需要 | 需要 |

---

## 2. 技术架构

```
┌──────────────────────────────────────────────┐
│              ego-lite 浏览器 (Chromium)         │
│  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  用户空间    │  │  Agent 任务空间 (Space)   │ │
│  │  (正常浏览)  │  │  ┌───┐ ┌───┐ ┌───┐     │ │
│  │             │  │  │Tab│ │Tab│ │Tab│     │ │
│  └─────────────┘  │  └───┘ └───┘ └───┘     │ │
│                   └─────────────────────────┘ │
│                          ▲ CDP                 │
│                          │                     │
│                   ┌──────┴──────┐              │
│                   │ ego-browser  │              │
│                   │ (Node.js RT) │              │
│                   └──────┬──────┘              │
│                          │ stdin/heredoc       │
│                   ┌──────┴──────┐              │
│                   │  Agent CLI  │              │
│                   │ (Claude/    │              │
│                   │  Devin/etc) │              │
│                   └─────────────┘              │
└──────────────────────────────────────────────┘
```

- **浏览器内核**: Chromium
- **Agent 连接层**: ego-browser (CLI-accessible Node.js runtime)
- **通信协议**: Chrome DevTools Protocol (CDP)
- **不依赖**: Playwright、Puppeteer 等第三方自动化库

---

## 3. 安装

### 3.1 DMG 安装（推荐）
```bash
# 从 https://lite.ego.app/download 下载 DMG
# 拖拽到 /Applications
```

### 3.2 脚本安装
```bash
sh /Users/cyingfang/.agents/skills/ego-browser/scripts/install.sh
```
脚本自动检测 CPU 架构 (arm64/x64)，下载对应 DMG，安装到 `/Applications/ego lite.app`，移除 quarantine 属性，启动应用。

### 3.3 Onboarding
1. 选择是否从 Chrome 导入数据（书签、Cookie、扩展、登录状态）
2. 注册 `ego-browser` 命令到 PATH (`~/.local/bin`)
3. 扫描已安装的 Agent CLI，自动安装 skill

### 3.4 验证
```bash
command -v ego-browser
ego-browser nodejs <<'EOF'
cliLog('ego-browser ready')
EOF
```

---

## 4. CLI 用法

### 4.1 基本模式
```bash
ego-browser nodejs <<'EOF'
// JavaScript 代码，所有 helper 预加载
const task = await useOrCreateTaskSpace('my-task')
await openOrReuseTab('https://example.com', { wait: true })
const snapshot = await snapshotText()
cliLog(snapshot)
EOF
```

### 4.2 执行模型
- **运行时**: Node.js，所有 helper 预加载
- **输入**: heredoc (stdin)
- **输出**: `cliLog()` 输出到 stdout
- **状态**: 每个 heredoc 后退出，不保留 JS 运行时状态
- **跨轮次**: 通过 `useOrCreateTaskSpace()` 复用任务空间和登录态

---

## 5. Helper 函数完整清单

### 5.1 任务空间管理 (7个)

| 函数 | 用途 | 关键行为 |
|------|------|----------|
| `listTaskSpaces()` | 列出所有空间 | 返回空间列表 |
| `useOrCreateTaskSpace(nameOrId)` | 使用或创建空间 | 跨 heredoc 复用同一空间 |
| `claimTaskSpace(id)` | 声明所有权 | 转移所有权到 agent |
| `handOffTaskSpace([nameOrId])` | 交给用户 | 需 captcha/登录时使用 |
| `takeOverTaskSpace([nameOrId])` | 夺回控制权 | 用户确认后调用 |
| `waitForAgentControl(nameOrId)` | 等待控制权 | 只读阻塞轮询 |
| `completeTaskSpace(nameOrId, {keep})` | 完成空间 | 默认 keep:false 关闭 |

**所有权类型**: `agent` | `agentDelegatedToUser` | `user`

### 5.2 导航与状态 (9个)

| 函数 | 用途 |
|------|------|
| `listTabs()` | 列出当前空间所有标签页 |
| `openOrReuseTab(url, {wait, timeout})` | 打开或复用标签页 |
| `closeTab(target?)` | 关闭标签页 |
| `gotoAndWait(url, {timeout, settle})` | 在当前标签页导航 |
| `currentTab()` | 获取当前标签页信息 |
| `switchTab(targetId)` | 切换标签页 |
| `gotoUrl(url)` | 简单导航 |
| `pageInfo()` | 页面信息 `{url, title, w, h, sx, sy, pw, ph}` 或 `{dialog:...}` |
| `ensureRealTab()` | 切换到非内部页面 |

### 5.3 观察与捕获 (3个)

| 函数 | 用途 | 输出 |
|------|------|------|
| `snapshotText({scope})` | 语义快照 | `[ref=N, loc=...] text` 语义树 |
| `captureScreenshot({options})` | 截图 | 视觉验证 |
| `drainEvents()` | 消费事件队列 | 导航/网络事件 |

### 5.4 滚动与鼠标 (7个)

| 函数 | 用途 |
|------|------|
| `scrollBy(pixels)` | DOM 滚动 |
| `scrollToBottomUntil(predicate, {step, wait, maxSteps})` | 滚动到底部直到条件满足 |
| `scroll({dy})` | 真实滚轮事件 |
| `click(target, {label})` | 点击 |
| `doubleClick(target, {label})` | 双击 |
| `hover(target, {label})` | 悬停 |
| `dragMouse([from, to], {options})` | 拖拽 |

**target 格式**: CSS选择器 / `xpath=...` / `@N` / `ref=N` / `loc=...` / `[x,y]` / `{x,y}` / `{selector, x, y}`

### 5.5 键盘与输入 (4个)

| 函数 | 用途 |
|------|------|
| `typeText(text)` | 模拟键盘输入 |
| `fillInput(target, value, {options})` | 填充输入框 |
| `pressKey(key)` | 按键 (Enter, Escape, Tab...) |
| `dispatchKey(keyEvent)` | 精细键盘事件 |

### 5.6 文件 (1个)

| 函数 | 用途 |
|------|------|
| `uploadFile(selector, filePath)` | 上传文件 |

### 5.7 等待 (4个)

| 函数 | 用途 | 注意 |
|------|------|------|
| `wait(seconds)` | 等待 | **单位是秒** |
| `waitForLoad({options})` | 等待加载 | |
| `waitForElement(target, {options})` | 等待元素 | |
| `waitForNetworkIdle({options})` | 等待网络空闲 | |

### 5.8 网络请求 (2个)

| 函数 | 用途 |
|------|------|
| `serverFetch(url, {options})` | Node 端请求（不依赖浏览器上下文） |
| `browserFetch(url, {options})` | 浏览器端请求（继承页面 origin） |

### 5.9 CDP 与 JS 执行 (2个)

| 函数 | 用途 | 注意 |
|------|------|------|
| `js(code)` | 执行浏览器端 JS | 接受字符串，不捕获闭包，推荐 IIFE |
| `cdp(method, params)` | 原始 CDP 调用 | escape hatch |

### 5.10 输出与帮助 (2个)

| 函数 | 用途 |
|------|------|
| `cliLog(value)` | 输出到终端（heredoc 内唯一输出机制） |
| `help(name)` | 打印 helper 用法 |

---

## 6. Facade API

### 6.1 page Facade
```javascript
page.goto(url, options)       // 导航
page.reload(options)          // 重新加载
page.url()                    // 当前 URL
page.title()                  // 页面标题
page.info()                   // 页面信息
page.snapshot(options)        // 快照
page.screenshot(options)      // 截图
page.screencast(options)      // 录屏
page.evaluate(code)           // 执行 JS
page.waitForLoad(options)     // 等待加载
page.waitForElement(target)   // 等待元素
page.waitForNetworkIdle()     // 等待网络空闲
page.waitForRequest(pred)     // 等待请求
page.waitForResponse(pred)    // 等待响应
page.keyboard.type(text)      // 键盘输入
page.keyboard.press(key)      // 按键
page.mouse.click(x, y)        // 鼠标点击
page.mouse.doubleClick(x, y)  // 双击
page.mouse.hover(x, y)        // 悬停
page.mouse.dragTo(x, y)       // 拖拽
page.locator(selector)        // 创建定位器
```

### 6.2 page.locator(selector) Facade
```javascript
locator.click(options)                    // 点击
locator.hover(options)                    // 悬停
locator.dragTo(target, options)           // 拖拽
locator.fill(value, options)              // 填充
locator.selectOption(value)               // 选择
locator.check() / locator.uncheck()       // 勾选/取消
locator.type(text)                        // 输入
locator.press(key)                        // 按键
locator.setInputFiles(files)              // 上传
locator.isVisible() / isHidden()          // 可见性
locator.isEnabled()                       // 启用状态
locator.count() / locator.all()           // 集合操作
locator.first() / nth(n) / last()         // 过滤
locator.evaluate(code)                    // 元素级执行
locator.screenshot(options)               // 元素截图
locator.waitFor(options)                  // 等待
```

### 6.3 browser Facade
```javascript
browser.listTabs()           // 列出标签页
browser.currentTab()         // 当前标签页
browser.switchTab(targetId)  // 切换标签页
browser.openOrReuseTab(url)  // 打开或复用
browser.closeTab(target?)    // 关闭标签页
browser.ensureRealTab()      // 确保真实标签页
browser.iframeTarget()       // iframe 目标
```

### 6.4 taskSpaces Facade
```javascript
taskSpaces.list()                    // 列出空间
taskSpaces.switch(nameOrId)          // 切换空间
taskSpaces.new(name)                 // 创建空间
taskSpaces.useOrCreate(nameOrId)     // 使用或创建
taskSpaces.claim(id)                 // 声明所有权
taskSpaces.complete(nameOrId, {keep})// 完成空间
taskSpaces.handOff([nameOrId])       // 移交控制权
taskSpaces.takeOver([nameOrId])      // 夺回控制权
taskSpaces.waitForAgentControl(id)   // 等待控制权
```

---

## 7. 三大工作流

### 7.1 语义工作流（默认）
适用：普通网站，有真实 DOM 控件
```javascript
const task = await useOrCreateTaskSpace('task-name')
await openOrReuseTab('https://example.com', { wait: true })
const snapshot = await snapshotText()
cliLog(snapshot)
await click('@21', { label: 'click submit button' })
await fillInput('@5', 'test@example.com')
cliLog(await snapshotText())
```

### 7.2 视觉工作流
适用：Canvas 应用、富编辑器、虚拟列表
```javascript
await captureScreenshot()
await click([420, 260])
await doubleClick([300, 200])
await pressKey('Enter')
await typeText('Hello World')
await captureScreenshot()
```

### 7.3 直接 DOM/CDP 工作流
适用：需要浏览器状态、紧凑数据提取
```javascript
const data = await js(String.raw`(() => {
  const items = [...document.querySelectorAll('article')]
  return items.map(el => ({ text: el.innerText }))
})()`)
await cdp('Page.handleJavaScriptDialog', { accept: true })
```

---

## 8. Learnings 库

### 8.1 目录结构
```
learnings/
├── github/
│   ├── manifest.json
│   ├── notes/overview.md
│   ├── tools/search-repos.js     # searchRepos(query, maxResults)
│   ├── tools/open-issues.js      # getOpenIssues(owner, repo)
│   └── browser-tools/repo-stats.js
├── google/
│   ├── manifest.json
│   ├── notes/overview.md
│   ├── tools/search-extract.js   # searchAndExtract(query, maxResults)
│   └── browser-tools/autocomplete.js
└── x-com/
    ├── manifest.json
    ├── notes/overview.md
    ├── notes/timeline.md
    ├── tools/timeline.js         # getTimelinePosts(maxPosts)
    ├── tools/search-users.js     # searchUsers(query)
    └── browser-tools/extract-post.js
```

### 8.2 GitHub 选择器
- 仓库名: `[data-target="repo-banner.repoName"]`
- Stars: `a[href*="stargazers"]`
- Forks: `a[href*="forks"]`
- 语言: `[itemprop="programmingLanguage"]`
- 搜索: `input[data-testid="search-input"]`
- Issues: `[data-test-id="issue-list-item"]`

### 8.3 Google 选择器
- 搜索框: `textarea[name="q"]` 或 `input[name="q"]`
- 结果容器: `div#search`
- 单个结果: `div.g`
- 结果标题: `div.g h3`
- 自动补全: `.ssb-a` 或 `span.gsqphr`

### 8.4 X (Twitter) 选择器
- 推文: `[data-testid="tweet"]`
- 推文文本: `[data-testid="tweetText"]`
- 作者名: `[data-testid="User-Name"] span`
- 时间戳: `time[datetime]`
- 搜索: `[data-testid="SearchBox_Search_Input"]`
- 时间线: `[data-testid="primaryColumn"]`

---

## 9. 关键注意事项

### 9.1 时间单位
- `wait()` 和 `timeout`: **秒**
- 只有以 `Ms` 结尾的参数才是毫秒

### 9.2 @N 引用生命周期
- 仅对最近一次 `snapshotText()` 有效
- 每次 snapshot 重建 refMap
- 元素滚出视口、DOM 重新渲染会导致 "Unknown ref"
- 长期引用使用 `loc=...` 或 CSS 选择器

### 9.3 js() 使用
- 接受字符串，不捕获闭包，无参数通道
- 推荐显式 IIFE: `(() => { ... })()`
- 模板字符串中正则反斜杠需双写: `\\d`, `\\s`
- 或使用 `String.raw`

### 9.4 pageInfo() 对话框
- 正常: `{ url, title, w, h, sx, sy, pw, ph }`
- 对话框打开时: `{ dialog: ... }` — 页面 JS 被阻塞
- 必须先用 `cdp('Page.handleJavaScriptDialog', { accept: true/false })` 处理

### 9.5 completeTaskSpace
- 必须在独立的最终 heredoc 中运行
- 默认 `keep: false`（关闭空间）
- 对用户空间调用 `keep: true` 会被跳过

### 9.6 所有权策略

| Helper | 用户拥有空间时 |
|--------|--------------|
| `switchTaskSpace` | 抛出异常 |
| `claimTaskSpace` | 转移所有权到 agent |
| `handOffTaskSpace` | 跳过 |
| `completeTaskSpace(keep:true)` | 跳过 |
| `completeTaskSpace(keep:false)` | 声明所有权后关闭 |

---

## 10. 性能优势

| 指标 | ego-browser | agent-browser |
|------|-------------|---------------|
| 复杂工作流速度 | 基准 | 慢 2.5-3.45x |
| Token 消耗 | 快照更省 | HTML 更多 |
| 引用稳定性 | @N 在 class 旋转时稳定 | 依赖 class 名 |

---

## 11. 集成支持

### 11.1 支持的 Agent CLI
Claude Code, Codex, Cursor, Continue, Gemini CLI, Kiro, Hermes Agent, OpenClaw, 以及任何能运行 shell 命令的自定义 Agent。

### 11.2 集成方式
1. 安装 ego-lite 应用
2. 完成 onboarding（导入 Chrome 数据）
3. ego-browser 自动安装到 Agent skill 目录
4. Agent 通过 `ego-browser nodejs <<'EOF' ... EOF` 调用

### 11.3 无需 SDK
不需要 Playwright、Puppeteer 或任何第三方自动化库。直接通过 CDP 与 ego-lite 通信。

---

## 12. 本地文件系统

### 12.1 Skill 目录
```
~/.agents/skills/ego-browser/
├── SKILL.md              # 主技能文档 (209行)
├── references/install.md # 安装指南
├── scripts/install.sh    # macOS 安装脚本 (234行)
└── learnings/            # 平台学习库
    ├── github/
    ├── google/
    └── x-com/
```

### 12.2 应用位置
```
/Applications/ego lite.app/
└── Contents/Frameworks/ego Framework.framework/Versions/0.4.4.17/Helpers/
    ├── ego-browser       # CLI 可执行文件
    └── ego Helper (GPU|Renderer|Node|Alerts).app
```

### 12.3 用户数据
```
~/Library/Application Support/Citro Labs/
├── ego lite/             # 浏览器用户数据
└── EgoUpdater/           # 自动更新器
```

---

## 13. 更新与社区

- **自动更新**: macOS 后台下载，下次启动应用
- **Discord**: https://discord.gg/5eGZVvHbTq
- **GitHub Discussions**: https://github.com/citrolabs/ego-lite/discussions
- **用例**: https://lite.ego.app/use-cases

---

## 14. 已知限制

1. **平台**: 仅 macOS (Intel + Apple Silicon)
2. **状态不保留**: 每个 heredoc 后 Node.js 运行时退出
3. **@N 时效**: 仅对最近一次 snapshot 有效
4. **js() 闭包**: 不捕获闭包，无参数通道
5. **对话框阻塞**: 原生对话框打开时页面 JS 被阻塞
6. **权限**: `Browser.grantPermissions` / `Browser.setPermission` 未暴露
7. **不创建 .js 文件**: 代码直接写在 heredoc 中
8. **不导入 Playwright**: 不启动另一个浏览器实例
