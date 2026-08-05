#!/bin/bash
# 下载 Frida 脚本和微信版本偏移配置
# 来源: yincongcyincong/weixin-macos (GPL v3)
set -e

BASE_URL="https://raw.githubusercontent.com/yincongcyincong/weixin-macos/main"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "📥 下载 script.js..."
curl -fsSL "${BASE_URL}/onebot/script.js" -o "${SCRIPT_DIR}/script.js"
echo "✅ script.js 已下载"

echo "📥 下载微信版本偏移配置..."
mkdir -p "${SCRIPT_DIR}/wechat_version"

# 下载所有版本配置
VERSIONS="4_1_6_12_mac 4_1_6_46_mac 4_1_6_47_mac 4_1_7_31_mac 4_1_7_55_mac 4_1_7_57_mac 4_1_8_28_mac 4_1_8_29_mac 4_1_8_104_mac 4_1_8_107_mac 4_1_9_52_mac 4_1_10_53_mac 4_1_11_53_mac"

for ver in $VERSIONS; do
    echo "  下载 ${ver}.json..."
    curl -fsSL "${BASE_URL}/wechat_version/${ver}.json" -o "${SCRIPT_DIR}/wechat_version/${ver}.json" 2>/dev/null || echo "  ⚠️  ${ver}.json 下载失败，跳过"
done

echo ""
echo "✅ 下载完成"
echo ""
echo "当前支持的微信版本:"
ls -1 "${SCRIPT_DIR}/wechat_version/" 2>/dev/null | sed 's/_mac.json//' | sed 's/_/./g' || echo "无版本配置"
echo ""
echo "⚠️  微信 4.1.12.28 暂不支持，等社区出偏移后放入 wechat_version/ 即可"
echo ""
echo "下一步:"
echo "  1. make proto  # 生成 protobuf Go 代码"
echo "  2. make build  # 编译"
echo "  3. ./onebot -wechat_pid=\$(pgrep WeChat) -send_url=http://127.0.0.1:36100/"
