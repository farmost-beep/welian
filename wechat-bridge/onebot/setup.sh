#!/bin/bash
# 安装 Go + protoc 并编译 OneBot
set -e

echo "=== 检查依赖 ==="

# 检查 Go
if ! command -v go &>/dev/null; then
    echo "📥 安装 Go..."
    brew install go
else
    echo "✅ Go: $(go version)"
fi

# 检查 protoc
if ! command -v protoc &>/dev/null; then
    echo "📥 安装 protoc..."
    brew install protobuf
else
    echo "✅ protoc: $(protoc --version)"
fi

# 检查 Frida
if ! command -v frida &>/dev/null; then
    echo "📥 安装 Frida..."
    brew install frida
else
    echo "✅ Frida: $(frida --version)"
fi

echo ""
echo "=== 下载资源 ==="
bash download_assets.sh

echo ""
echo "=== 生成 protobuf 代码 ==="
cd "$(dirname "$0")"
protoc --go_out=. --go_opt=module=github.com/farmost-beep/welian/wechat-bridge/onebot \
    --proto_path=proto \
    proto/wx_msg.proto proto/text_msg.proto

echo ""
echo "=== 编译 ==="
go mod tidy
go build -o onebot .

echo ""
echo "✅ 编译完成: $(ls -la onebot | awk '{print $5}') bytes"
echo ""
echo "下一步:"
echo "  1. 打开微信"
echo "  2. ./onebot -wechat_pid=\$(pgrep -x WeChat) -send_url=http://127.0.0.1:36100/"
echo "  3. python3 ../welian_bridge.py --port 36100"
