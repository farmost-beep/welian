#!/usr/bin/env python3
"""Send an existing PDF + caption to WeChat via Welian bot.

Usage:
  python3 scripts/send_pdf_to_wechat.py /path/to/report.pdf "标题" "导语文本"
  python3 scripts/send_pdf_to_wechat.py --skip-message /path/to/report.pdf
"""
import sys
import os
import json
import time
import plistlib
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
    skip_message = False
    args = sys.argv[1:]
    if "--skip-message" in args:
        skip_message = True
        args.remove("--skip-message")

    if len(args) < 1:
        print("Usage: send_pdf_to_wechat.py [--skip-message] <pdf_path> [title] [caption]")
        sys.exit(1)
    pdf_path = Path(args[0]).resolve()
    title = args[1] if len(args) > 1 else pdf_path.stem
    caption = args[2] if len(args) > 2 else f"{title} 已生成，PDF 随后发送。"

    if not pdf_path.exists():
        print(f"❌ PDF not found: {pdf_path}")
        sys.exit(1)

    bot_token = get_bot_token()
    if not bot_token:
        print("❌ No WELIAN_BOT_TOKEN found")
        sys.exit(1)

    bot_users_path = Path.home() / ".welian/bot_users.json"
    users = json.loads(bot_users_path.read_text())
    if not users:
        print("❌ No target users in bot_users.json")
        sys.exit(1)
    target_user = users[0]

    sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
    from welian.bot.handler import IlinkApi
    api = IlinkApi(bot_token)

    print(f"💬 Sending to {target_user[:20]}...")

    if not skip_message:
        api.send_message(target_user, f"📋 {title}\n\n{caption}")
        # 跨类型节流：handler 内部已加 lock，此处再加 8s 做双重保险
        cross_interval = float(os.environ.get("WELIAN_CROSS_TYPE_INTERVAL", "30.0"))
        inter_send = max(8.0, cross_interval)
        print(f"⏳ Inter-send wait {inter_send:.0f}s (cross-type safety)...")
        time.sleep(inter_send)
    else:
        print("⏩ --skip-message: 跳过文字消息")

    ok = api.send_file_message(target_user, str(pdf_path))
    print("✅ sent" if ok else "❌ failed")
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
