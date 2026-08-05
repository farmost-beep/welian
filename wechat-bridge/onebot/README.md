# Welian OneBot — 最小可用版

> 基于 [yincongcyincong/weixin-macos](https://github.com/yincongcyincong/weixin-macos)（GPL v3）简化。
> 仅支持群文本消息收发，配合 `welian_bridge.py` 使用。

## 架构

```
微信(4.1.11.53) → Frida Hook → OneBot(58080) → Bridge(36100) → Welian API
                                                                  ↓
                                                         AI 生成回复
                                                                  ↓
微信 ← OneBot(58080) ← Bridge(36100) ← Welian API ←──────────────┘
```

## 最小可用范围

- ✅ 群消息接收（文本）
- ✅ 群消息发送（文本）
- ✅ HTTP API（OneBot v11 兼容）
- ❌ 图片/视频/语音/文件
- ❌ 私聊消息
- ❌ WebSocket
- ❌ 引用消息

## 前置条件

1. **macOS** + 微信 **4.1.11.53**（其他版本需对应偏移 JSON）
2. **Frida** 已安装（`brew install frida`）
3. **Go 1.21+** + **protoc**（`brew install protobuf`）
4. **关闭 SIP** 或已注入 FridaGadget

## 快速开始

### 1. 下载 Frida 脚本和版本偏移

```bash
cd wechat-bridge/onebot
./download_assets.sh
```

### 2. 生成 protobuf 代码并编译

```bash
make proto    # 生成 .pb.go
make build    # 编译 onebot 二进制
```

### 3. 启动微信

正常打开微信应用。

### 4. 启动 OneBot

```bash
# 方式 A: 关闭 SIP，直接 attach
./onebot -wechat_pid=$(pgrep -x WeChat) -send_url=http://127.0.0.1:36100/

# 方式 B: 通过 Frida Gadget（不关闭 SIP）
./onebot -type=gadget -gadget_addr=127.0.0.1:27042 -send_url=http://127.0.0.1:36100/
```

### 5. 启动 Bridge

```bash
cd wechat-bridge
export WELIAN_TOKEN=your_token
python3 welian_bridge.py --port 36100
```

### 6. 配置 Welian 群聊白名单

```bash
curl -X POST https://api.welian.app/ai/group_chat/config \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "target_groups": [{"id": "群ID@chatroom", "name": "测试群"}]}'
```

## API

### 发送群消息

```bash
curl -X POST http://127.0.0.1:58080/send_group_msg \
  -H "Content-Type: application/json" \
  -d '{
    "group_id": "123456@chatroom",
    "message": [{"type": "text", "data": {"text": "你好"}}]
  }'
```

### 健康检查

```bash
curl http://127.0.0.1:58080/get_status
```

## 微信版本支持

| 版本 | 状态 | 偏移文件 |
|------|------|----------|
| 4.1.6.12 - 4.1.11.53 | ✅ 已有 | `wechat_version/*.json` |
| 4.1.12.28 | ❌ 待社区提供 | 放入 `wechat_version/4_1_12_28_mac.json` 即可 |

**如何支持新版本**：等社区逆向出新偏移 JSON，放入 `wechat_version/` 目录，启动时用 `-wechat_conf` 指定即可。

## SIP 处理

### 关闭 SIP（简单）

```bash
# 重启进入恢复模式，终端执行
csrutil disable
# 重启后 frida 可以直接 attach
```

### 不关闭 SIP（FridaGadget）

参考原项目 [frida-gadget/readme.md](https://github.com/yincongcyincong/weixin-macos/blob/main/frida-gadget/readme.md)：
1. 下载 FridaGadget.dylib
2. 用 insert_dylib 注入 WeChat 二进制
3. 重新签名
4. 启动微信后用 `-type=gadget` 模式

## 许可证

GPL v3（继承原项目）
