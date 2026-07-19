# Welian 全面测试用例设计

> 设计原则：以**实际用户视角**组织，按验证体系 L0-L6 分层。
> 每个测试用例回答一个真实用户会问的问题："如果我这样做，产品会怎样？"

---

## L0 冒烟测试 — "App能打开吗？"

### 现有（6个，已实现）
| # | 用户视角 | 测试名 | 状态 |
|---|---------|--------|------|
| L0-1 | 页面能打开吗？ | landing page loads with 200 status | ✅ |
| L0-2 | JS模块全加载吗？ | all critical JS modules load without 404 | ✅ |
| L0-3 | 有控制台错误吗？ | no uncaught console errors on page load | ✅ |
| L0-4 | 关键UI元素都在吗？ | critical DOM elements exist | ✅ |
| L0-5 | 样式加载了吗？ | CSS stylesheet loads | ✅ |
| L0-6 | 支付SDK初始化了吗？ | Paddle SDK initializes | ✅ |

### 新增（4个）
| # | 用户视角 | 测试名 | 验证什么 | 优先级 |
|---|---------|--------|---------|--------|
| L0-7 | 页面在手机上能看吗？ | viewport meta tag exists | `<meta name="viewport">`存在 | P1 |
| L0-8 | 多语言切换能用吗？ | language switcher works | 点击语言切换按钮后UI文案变化 | P1 |
| L0-9 | 离线时给提示吗？ | offline indicator shows | 断网后页面显示离线提示 | P2 |
| L0-10 | 暗色模式能用吗？ | dark mode renders | 切换暗色模式后CSS变量生效 | P2 |

---

## L1 激活旅程 — "新用户能走通到第一次获得价值吗？"

### 现有（4个，已实现）
| # | 用户视角 | 测试名 | 状态 |
|---|---------|--------|------|
| L1-1 | 新用户能完成onboarding吗？ | new user completes onboarding and sees first advise | ✅ |
| L1-2 | 老用户不会再看onboarding吗？ | returning user skips onboarding | ✅ |
| L1-3 | onboarding正确调用了extract_intent吗？ | onboarding correctly calls /ai/extract_intent with onboarding=true | ✅ |
| L1-4 | onboarding结束后调用了advise_cloud吗？ | finishOnboarding correctly calls /ai/advise_cloud | ✅ |

### 新增（6个）
| # | 用户视角 | 测试名 | 验证什么 | 优先级 |
|---|---------|--------|---------|--------|
| L1-5 | onboarding输入乱码不崩吗？ | onboarding with gibberish input doesn't crash | 输入"asdfghjkl"→提示"没提取到人名"而非崩溃 | P1 |
| L1-6 | onboarding提取0个联系人时给提示吗？ | onboarding extracts 0 contacts shows retry prompt | extract_intent返回空actions→显示"再试试" | P1 |
| L1-7 | onboarding中途刷新页面能恢复吗？ | onboarding survives page refresh | 刷新后不重复onboarding（localStorage标记） | P2 |
| L1-8 | onboarding能输入英文吗？ | onboarding works with English input | "Had lunch with John yesterday"→提取出John | P1 |
| L1-9 | onboarding输入很多人名能处理吗？ | onboarding handles many contacts at once | 输入10个人名→全部创建 | P2 |
| L1-10 | 第一次advise返回错误时有兜底吗？ | first advise error shows fallback message | advise_cloud返回500→显示友好提示非白屏 | P1 |

---

## L2 核心循环 — "四个动词能跑通吗？"

### 现有（5个，已实现）
| # | 用户视角 | 测试名 | 状态 |
|---|---------|--------|------|
| L2-1 | 记：能记录互动吗？ | "记一下：和张总聊了预算方案" creates timeline entry | ✅ |
| L2-2 | 问：能查到联系人上下文吗？ | "明天见李总，上次聊到哪了？" retrieves contact context | ✅ |
| L2-3 | 拟：能生成消息草稿吗？ | "给老许拟条消息" generates draft | ✅ |
| L2-4 | 报：能看周报吗？ | weekly report shows contacts and todos | ✅ |
| L2-5 | 后端报错时不崩吗？ | backend error shows friendly message in chat | ✅ |

### 新增：数据飞轮（7个）
| # | 用户视角 | 测试名 | 验证什么 | 优先级 |
|---|---------|--------|---------|--------|
| L2-6 | 说"完成了XX"能自动标记待办吗？ | "完成了跟进老许的待办" marks todo as done | extract_intent返回complete_todo→UI反馈"已完成" | P0 |
| L2-7 | 说"删掉XX待办"能删除吗？ | "删掉跟进张总的待办" deletes todo | extract_intent返回delete_todo→UI反馈"已删除" | P0 |
| L2-8 | 说"把老许公司改成腾讯"能更新吗？ | "把老许的公司改成腾讯" updates contact | extract_intent返回update_contact→联系人信息更新 | P1 |
| L2-9 | 说"老许和老王是同一个人"能合并吗？ | "老许和老王是同一个人" merges contacts | extract_intent返回merge_contact→合并后只剩一个联系人 | P1 |
| L2-10 | 说"提醒我下周联系张总"能创建待办吗？ | "提醒我下周联系张总" creates todo with due date | extract_intent返回add_todo→待办列表新增 | P0 |
| L2-11 | 自动提取的待办有正确优先级吗？ | auto-extracted todo has correct priority | timeline含"紧急""important"→P0，普通→P1 | P1 |
| L2-12 | 数据飞wheel结果在聊天中确认吗？ | flywheel results shown in chat reply | AI回复包含"已添加联系人""已记录互动" | P1 |

### 新增：会话持久化（3个）
| # | 用户视角 | 测试名 | 验证什么 | 优先级 |
|---|---------|--------|---------|--------|
| L2-13 | 刷新页面后聊天记录还在吗？ | chat history persists after page refresh | 发消息→刷新→历史消息仍在 | P0 |
| L2-14 | 多轮对话有上下文吗？ | multi-turn conversation retains context | 第2轮引用第1轮内容 | P0 |
| L2-15 | 长对话超过20条会截断吗？ | long conversation truncates to last 20 messages | 发25条→conversationHistory长度≤20 | P2 |

### 新增：错误恢复（5个）
| # | 用户视角 | 测试名 | 验证什么 | 优先级 |
|---|---------|--------|---------|--------|
| L2-16 | 网络断开时给提示吗？ | network failure shows error in chat | fetch reject→聊天显示"网络异常"非无限loading | P0 |
| L2-17 | token过期时能刷新吗？ | token expiry triggers refresh | getClerkToken返回null→重新获取→请求成功 | P1 |
| L2-18 | LLM超时能中止吗？ | stop button aborts LLM call | 点击停止→AbortController.abort()→请求取消 | P1 |
| L2-19 | 快速连续发送会排队吗？ | rapid sending doesn't duplicate requests | 连续点3次send→只发1条非3条 | P1 |
| L2-20 | 空消息能发送吗？ | empty message is rejected | 空输入+点send→不发送不报错 | P1 |

### 新增：边界场景（4个）
| # | 用户视角 | 测试名 | 验证什么 | 优先级 |
|---|---------|--------|---------|--------|
| L2-21 | 名字含emoji能处理吗？ | contact name with emoji works | "记一下：和😀聊了天"→不崩溃 | P2 |
| L2-22 | 超长消息能处理吗？ | very long message doesn't crash | 5000字消息→正常发送不截断 | P2 |
| L2-23 | 中英混合输入能理解吗？ | mixed CN/EN input parsed correctly | "记一下met with John about项目"→提取John+项目 | P1 |
| L2-24 | <<<SUGGESTIONS>>>解析正确吗？ | suggestions block parsed into buttons | AI回复含<<<SUGGESTIONS>>>→显示可点击建议 | P1 |

---

## L3 安全审查 — "PR代码有问题能拦住吗？"

### 现有（已实现）
- 4并行agent代码审查（2个CLAUDE.md合规 + 1个bug检测 + 1个安全/逻辑）
- 置信度≥80才报告
- 假阳性过滤

### 新增
| # | 验证什么 | 优先级 |
|---|---------|--------|
| L3-1 | 在真实PR上验证假阳性率（当前只跑过dummy diff） | P1 |
| L3-2 | 验证漏报率：故意引入bug看能否检出 | P1 |
| L3-3 | SSRF防护测试：`/ai/read_url`拒绝内网地址 | P0 |
| L3-4 | XSS防护测试：联系人名字含`<script>`不执行 | P0 |

---

## L5 单元测试 — "各模块边界条件正确吗？"

### 后端 cloud-worker（现有36个，新增按端点分组）

#### 数据CRUD（新增12个）
| # | 用户视角 | 测试名 | 优先级 |
|---|---------|--------|--------|
| L5-1 | 能创建联系人吗？ | POST /data/contacts creates contact | P0 |
| L5-2 | 能读取联系人列表吗？ | GET /data/contacts returns list | P0 |
| L5-3 | 能更新联系人吗？ | PUT /data/contacts updates fields | P0 |
| L5-4 | 能删除联系人吗？ | DELETE /data/contacts removes contact | P0 |
| L5-5 | 能创建时间线吗？ | POST /data/timeline creates entry | P0 |
| L5-6 | 能按联系人过滤时间线吗？ | GET /data/timeline filters by contact | P1 |
| L5-7 | 能创建待办吗？ | POST /data/todos creates todo | P0 |
| L5-8 | 能完成待办吗？ | POST /data/todos/done marks complete | P0 |
| L5-9 | 能推迟待办吗？ | POST /data/todos/postpone updates due date | P1 |
| L5-10 | 能取消待办吗？ | POST /data/todos/cancel marks cancelled | P1 |
| L5-11 | 能重新打开待办吗？ | POST /data/todos/reopen reopens | P1 |
| L5-12 | 无auth时所有CRUD返回401吗？ | all data endpoints require auth | P0 |

#### 数据同步（新增4个）
| # | 用户视角 | 测试名 | 优先级 |
|---|---------|--------|--------|
| L5-13 | edge能同步数据到cloud吗？ | POST /data/sync stores data_context | P1 |
| L5-14 | 双向同步能合并吗？ | POST /data/sync_full merges bidirectionally | P1 |
| L5-15 | 能搜索联系人吗？ | POST /data/search returns matched contacts | P0 |
| L5-16 | 能获取完整数据上下文吗？ | GET /data/context returns snapshot | P1 |

#### 认证（新增4个）
| # | 用户视角 | 测试名 | 优先级 |
|---|---------|--------|--------|
| L5-17 | 微信OAuth能跳转吗？ | GET /auth/wechat redirects to OAuth URL | P1 |
| L5-18 | 微信回调能处理code吗？ | GET /auth/wechat/callback exchanges code | P1 |
| L5-19 | 能发送短信验证码吗？ | POST /auth/sms/send sends OTP | P1 |
| L5-20 | 能验证短信验证码吗？ | POST /auth/sms/verify validates OTP | P1 |

#### 支付（新增6个）
| # | 用户视角 | 测试名 | 优先级 |
|---|---------|--------|--------|
| L5-21 | 能获取Paddle配置吗？ | GET /ai/paddle/config returns env config | P1 |
| L5-22 | 能创建Paddle结账吗？ | POST /ai/paddle/checkout returns checkout URL | P0 |
| L5-23 | Paddle webhook能处理吗？ | POST /ai/paddle/webhook processes payment | P0 |
| L5-24 | 能取消订阅吗？ | POST /ai/paddle/cancel cancels subscription | P1 |
| L5-25 | 无效webhook签名被拒绝吗？ | Paddle webhook rejects invalid signature | P0 |
| L5-26 | 能查余额吗？ | POST /ai/billing returns balance | P0（已有） |

#### 高级AI端点（新增8个）
| # | 用户视角 | 测试名 | 优先级 |
|---|---------|--------|--------|
| L5-27 | 能生成周报吗？ | POST /ai/weekly_report returns structured report | P1 |
| L5-28 | 能生成月报吗？ | POST /ai/monthly_report returns dashboard | P1 |
| L5-29 | 能做会议准备吗？ | POST /ai/meeting_prep returns briefing | P1 |
| L5-30 | 能生成主动建议吗？ | POST /ai/proactive returns suggestions | P1 |
| L5-31 | 能做行为诊断吗？ | POST /ai/diagnostics returns analysis | P2 |
| L5-32 | 能搜索网页吗？ | POST /ai/search returns results | P1 |
| L5-33 | 能读网页内容吗？ | POST /ai/read_url returns markdown | P1 |
| L5-34 | 能生成会话摘要吗？ | POST /ai/session_summary returns summary | P2 |

#### 记忆与目标（新增4个）
| # | 用户视角 | 测试名 | 优先级 |
|---|---------|--------|--------|
| L5-35 | 能保存记忆吗？ | POST /data/memory stores memory | P1 |
| L5-36 | 能读取记忆吗？ | GET /data/memory returns memories | P1 |
| L5-37 | 能创建目标吗？ | POST /data/goals creates goal | P2 |
| L5-38 | 能关联目标证据吗？ | goal evidence auto-linked from conversation | P2 |

#### 日历（新增2个）
| # | 用户视角 | 测试名 | 优先级 |
|---|---------|--------|--------|
| L5-39 | 能获取iCal订阅链接吗？ | GET /data/calendar/token returns feed URL | P2 |
| L5-40 | iCal订阅能返回日历数据吗？ | GET /data/calendar/feed returns iCal format | P2 |

#### 账户管理（新增2个）
| # | 用户视角 | 测试名 | 优先级 |
|---|---------|--------|--------|
| L5-41 | 能删除账户吗？ | POST /data/delete_account removes all data | P0 |
| L5-42 | 删除账户后数据真的没了吗？ | delete_account wipes contacts/todos/timeline | P0 |

### Python后端（现有30+个，新增按模块分组）

#### bot/handler.py（新增8个，当前零测试）
| # | 用户视角 | 测试名 | 优先级 |
|---|---------|--------|--------|
| L5-43 | 微信消息能正确处理吗？ | bot processes text message → reply | P0 |
| L5-44 | 限速能工作吗？ | rate limiting blocks rapid messages | P0 |
| L5-45 | 长消息能分段发送吗？ | long message split into chunks | P1 |
| L5-46 | 图片消息能处理吗？ | image message → upload CDN → reply | P1 |
| L5-47 | 斜杠命令能用吗？ | slash commands (/help, /status, /reset) | P1 |
| L5-48 | bot断线能自动重连吗？ | auto-reconnect on disconnect | P1 |
| L5-49 | 多用户会话隔离吗？ | per-user session isolation | P0 |
| L5-50 | 优雅关闭能清理资源吗？ | graceful shutdown cleanup | P2 |

#### llm/模块（新增6个，当前零测试）
| # | 用户视角 | 测试名 | 优先级 |
|---|---------|--------|--------|
| L5-51 | Claude API调用正确吗？ | claude client sends correct request | P0 |
| L5-52 | OpenAI API调用正确吗？ | openai client sends correct request | P1 |
| L5-53 | 重试逻辑能工作吗？ | retry with exponential backoff | P0 |
| L5-54 | 错误映射正确吗？ | HTTP status → correct LLMError subclass | P0 |
| L5-55 | 自适应路由能工作吗？ | adaptive routing sends simple→cheap, complex→strong | P1 |
| L5-56 | 配置优先级正确吗？ | config.local.yaml > config.yaml > env | P2 |

#### payment.py（新增3个，当前零测试）
| # | 用户视角 | 测试名 | 优先级 |
|---|---------|--------|--------|
| L5-57 | 微信支付下单能工作吗？ | WeChat Pay order creation | P1 |
| L5-58 | 支付回调能处理吗？ | payment callback verification | P0 |
| L5-59 | 退款能处理吗？ | refund processing | P2 |

---

## L6 机构记忆 — "错误不重复犯吗？"

### 现有
- CLAUDE.md 记录验证体系、部署方式、已知陷阱

### 新增
| # | 验证什么 | 优先级 |
|---|---------|--------|
| L6-1 | 每次发现新bug→更新CLAUDE.md的"已知陷阱" | 持续 |
| L6-2 | 每次新增端点→同步更新测试用例文档 | 持续 |
| L6-3 | 每次修改前端DOM ID→同步更新L0测试 | 持续 |

---

## 优先级汇总

| 优先级 | 数量 | 说明 |
|--------|------|------|
| **P0** | 28个 | 发布阻断——不通过不能上线 |
| **P1** | 38个 | 重要但非阻断——应在1-2周内补齐 |
| **P2** | 18个 | 边界场景——有空就补 |

## 实施计划

### 第一批（本次）：P0前端 + P0后端数据CRUD
- L2-6~L2-10：数据飞轮5个动词（完成/删除/更新/合并/创建待办）
- L2-13~L2-14：会话持久化 + 多轮对话
- L2-16：网络断开错误提示
- L5-1~L5-12：后端数据CRUD 12个端点
- L5-41~L5-42：账户删除

### 第二批：P0后端认证+支付+Python
- L5-17~L5-20：认证端点
- L5-21~L5-25：Paddle支付
- L5-43~L5-44：微信bot基础
- L5-51~L5-54：LLM客户端

### 第三批：P1全部
- L0-7~L0-8：移动端+多语言
- L1-5~L1-10：onboarding边界
- L2-17~L2-24：错误恢复+边界场景
- L5-13~L5-16：数据同步
- L5-27~L5-34：高级AI端点
- L5-35~L5-40：记忆/目标/日历
