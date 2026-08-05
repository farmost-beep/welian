# Welian WeChat Bridge

> 本地 Bridge 服务：把 wechat-mac-hook 的 OneBot 群消息接入 Welian API，实现微信群聊自动回复。

## 架构

```
微信(4.1.11.53) → Frida Hook → OneBot(58080) → Bridge(36100) → Welian API
                                                                  ↓
                                                         AI 生成回复
                                                                  ↓
微信 ← OneBot(58080) ← Bridge(36100) ← Welian API ←──────────────┘
```

## 前置条件

1. **macOS** + 微信 4.1.11.53（wechat-mac-hook 适配版本）
2. **wechat-mac-hook** 已部署运行（OneBot 在 `127.0.0.1:58080`）
3. **Welian API token**（从 `~/.welian/config.yaml` 或小程序获取）
4. **Python 3.9+**（仅用标准库，无需 pip install）

## 快速开始

### 1. 启动 Bridge

```bash
# 方式一：直接运行
python3 welian_bridge.py --token YOUR_TOKEN

# 方式二：用环境变量
export WELIAN_TOKEN=your_token_here
python3 welian_bridge.py

# 方式三：dry-run 模式（只看不发）
python3 welian_bridge.py --token YOUR_TOKEN --dry-run
```

Bridge 默认监听 `127.0.0.1:36100`。

### 2. 配置 OneBot

在 wechat-mac-hook 的 OneBot 配置中，设置 HTTP POST 上报地址：

```json
{
  "http_post": {
    "url": "http://127.0.0.1:36100/",
    "message_post_format": "string"
  }
}
```

或者用 OneBot 的 `http` 配置：

```json
{
  "http": {
    "post": [
      {
        "url": "http://127.0.0.1:36100/",
        "timeout": 30000
      }
    ]
  }
}
```

### 3. 配置 Welian 群聊白名单

通过 Welian API 启用群聊自动回复：

```bash
# 查看当前配置
curl https://api.welian.app/ai/group_chat/config \
  -H "Authorization: Bearer YOUR_TOKEN"

# 启用并配置白名单
curl -X POST https://api.welian.app/ai/group_chat/config \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "target_groups": [
      {"id": "1234567890@chatroom", "name": "测试群"}
    ],
    "require_at": true,
    "trigger_keywords": ["小维", "帮我查"],
    "max_replies_per_hour": 5,
    "max_replies_per_day": 20,
    "min_interval_seconds": 30
  }'
```

### 4. 验证

```bash
# 检查 Bridge 健康
curl http://127.0.0.1:36100/health

# 在微信群里 @小维 发一条消息，观察 Bridge 日志
```

## 安全护栏（SPEC 6.3）

群聊自动回复需满足以下**全部条件**（缺一不可）：

1. ✅ **群白名单**：用户明确启用了该群的自动回复（默认关闭）
2. ✅ **触发条件**：@小维 或用户配置的关键词，不是对所有消息自动回复
3. ✅ **频率限制**：每群每小时上限、每日上限、最小间隔
4. ✅ **可关闭**：用户可随时一键关闭（`enabled: false`）
5. ✅ **AI 标注**：回复内容带 `🤖` 前缀，不伪装人类发言
6. ✅ **不越界**：不在群内自动发起私聊、不自动加群成员为好友

## 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `enabled` | `false` | 全局开关 |
| `target_groups` | `[]` | 群白名单 `[{id, name}]` |
| `trigger_keywords` | `[]` | 触发关键词（空=仅@小维） |
| `require_at` | `true` | 是否必须@小维才回复 |
| `max_replies_per_hour` | `5` | 每群每小时上限 |
| `max_replies_per_day` | `20` | 每群每日上限 |
| `min_interval_seconds` | `30` | 最小回复间隔 |
| `reply_prefix` | `🤖 ` | AI 标注前缀 |
| `system_prompt` | 见默认 | LLM 系统提示词 |

## Bridge 命令行参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--token` | (env) | Welian API token |
| `--port` | `36100` | Bridge 监听端口 |
| `--onebot-api` | `http://127.0.0.1:58080` | OneBot API URL |
| `--welian-api` | `https://api.welian.app` | Welian API URL |
| `--bot-name` | `小维` | Bot 显示名（用于 @ 检测） |
| `--dry-run` | `false` | 只记日志不发消息 |
| `--host` | `127.0.0.1` | 监听地址 |

## 故障排查

### Bridge 收不到消息

1. 检查 OneBot 是否在运行：`curl http://127.0.0.1:58080/get_status`
2. 检查 OneBot 的 HTTP POST 上报地址是否指向 Bridge
3. 检查 Bridge 日志是否有 "Group message received"

### Bridge 收到消息但不回复

查看 Bridge 日志中的 `reason` 字段：
- `group_chat disabled` → Welian 配置未启用
- `group not in whitelist` → 群不在白名单
- `not triggered` → 消息未触发（需@小维或包含关键词）
- `hourly limit reached` / `daily limit reached` → 频率限制
- `LLM error` → LLM 调用失败

### OneBot 发送失败

1. 检查 OneBot 是否在运行
2. 检查群 ID 是否正确（OneBot 的 group_id 格式通常是 `数字@chatroom`）
3. 检查微信是否登录

## 与 wechat-mac-hook 的关系

这个 Bridge 是 wechat-mac-hook 和 Welian 之间的**薄适配层**：

- **wechat-mac-hook** 负责：Hook 微信进程、OneBot 协议、消息收发
- **Bridge** 负责：消息格式转换、转发给 Welian API、回复发送
- **Welian API** 负责：群白名单检查、触发条件判断、频率限制、LLM 回复生成

Bridge 不做任何业务逻辑，所有决策在 Welian API 侧完成。
