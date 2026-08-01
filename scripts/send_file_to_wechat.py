#!/usr/bin/env python3
"""Send a file to WeChat via Welian bot, waiting for user message first to get context_token."""
import sys, os, json, time, plistlib
from pathlib import Path

def get_bot_token():
    tok = os.environ.get("WELIAN_BOT_TOKEN", "")
    if tok:
        return tok
    plist_path = Path.home() / "Library/LaunchAgents/com.welian.bot.plist"
    if plist_path.exists():
        with open(plist_path, "rb") as f:
            env = plistlib.load(f).get("EnvironmentVariables", {})
        return env.get("WELIAN_BOT_TOKEN", "")
    return ""

def main():
    file_path = sys.argv[1] if len(sys.argv) > 1 else "/Users/cyingfang/devin/welian/docs/SPEC_EGO_BROWSER.md"
    title = sys.argv[2] if len(sys.argv) > 2 else "ego-browser 项目技术规格"

    path = Path(file_path).resolve()
    if not path.exists():
        print(f"❌ File not found: {path}")
        sys.exit(1)

    bot_token = get_bot_token()
    if not bot_token:
        print("❌ No WELIAN_BOT_TOKEN found")
        sys.exit(1)

    bot_users_path = Path.home() / ".welian/bot_users.json"
    users = json.loads(bot_users_path.read_text())
    target_user = users[0]

    sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
    from welian.bot.handler import IlinkApi
    api = IlinkApi(bot_token)

    # Poll for user message to get context_token
    print(f">>> 请在微信里给 welian bot 发一条消息（比如\"发\"）...")
    print(f">>> 等待中（最多5分钟）...")

    context_token = ""
    for i in range(8):  # 8 x ~35s = ~4.7min
        try:
            resp = api.get_updates()
            msgs = resp.get("msgs", [])
            if msgs:
                for msg in msgs:
                    ct = msg.get("context_token", "")
                    content = str(msg.get("content", msg.get("text", "")))[:50]
                    print(f"  [轮询{i+1}] 收到消息: {content}")
                    if ct:
                        context_token = ct
                        print(f"  >>> 找到 context_token!")
                        break
                if context_token:
                    break
            else:
                print(f"  [轮询{i+1}/8] 等待中...")
        except Exception as e:
            print(f"  [轮询{i+1}] 错误: {e}")

    if not context_token:
        print(">>> 未收到消息，用空token尝试...")

    # Send text
    print(f">>> 发送标题: {title}")
    api.send_message(target_user, f"📋 {title}", context_token)
    time.sleep(3)

    # Send file
    print(f">>> 发送文件: {path}")
    ok = api.send_file_message(target_user, str(path), context_token)
    print("✅ 文件发送成功!" if ok else "❌ 发送失败")

    # If failed, retry after 30s
    if not ok:
        print(">>> 30秒后重试...")
        time.sleep(30)
        ok = api.send_file_message(target_user, str(path), context_token)
        print("✅ 重试成功!" if ok else "❌ 重试仍失败")

    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
