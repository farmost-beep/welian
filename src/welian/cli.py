"""Welian CLI — edge mode (local engine) + cloud mode (AI API).

Usage:
  # Edge mode (default): all data local, AI via cloud if configured
  welian chat "记一下：和张总聊了预算方案"
  welian status
  welian advise
  welian dashboard

  # Cloud server mode: run AI-only API (no data access)
  welian serve-cloud [--port 8000]

  # Bot mode: run edge bot (local data + cloud AI)
  welian bot
  welian bot-install    # install as launchd service (auto-start + restart)
  welian bot-uninstall  # remove launchd service
  welian bot-status     # check service status

  # Data management
  welian export [--password XXX]     # encrypted export
  welian import <file> [--password XXX]
  welian balance
  welian login                       # link CLI to Clerk account (for tunnel discovery)
"""
import sys
import os
import json
import argparse
from . import engine, intent, ai, tokens
from .edge import EdgeClient

# ── Login / Logout ──

WELIAN_CONFIG_DIR = os.path.expanduser("~/.welian")
WELIAN_HOME = os.environ.get("WELIAN_HOME", WELIAN_CONFIG_DIR)
WELIAN_AUTH_FILE = os.path.join(WELIAN_CONFIG_DIR, "auth.json")
LOGIN_CALLBACK_PORT = 9876


def _do_login():
    """Link CLI to Clerk account via browser OAuth flow."""
    import webbrowser
    import http.server
    import threading
    import urllib.parse

    os.makedirs(WELIAN_CONFIG_DIR, exist_ok=True)

    if os.path.exists(WELIAN_AUTH_FILE):
        with open(WELIAN_AUTH_FILE) as f:
            old_auth = json.load(f)
        old_user = old_auth.get("user_id", "?")
        print(f"Currently logged in as: {old_user}")
        print()
        resp = input("Log in with a different account? [y/N] ").strip().lower()
        if resp != "y":
            print("Keeping current login.")
            return
        os.remove(WELIAN_AUTH_FILE)
        print("Logged out. Starting fresh login...")

    result = {"user_id": None}

    class CallbackHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            result["user_id"] = params.get("user_id", [None])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            if result["user_id"]:
                self.wfile.write(b"<h2>Login successful!</h2><p>You can close this tab and return to your terminal.</p>")
            else:
                self.wfile.write(b"<h2>Login failed</h2>")
        def log_message(self, *args):
            pass

    server = http.server.HTTPServer(("localhost", LOGIN_CALLBACK_PORT), CallbackHandler)
    thread = threading.Thread(target=server.handle_request, daemon=True)
    thread.start()

    callback_url = f"http://localhost:{LOGIN_CALLBACK_PORT}"
    login_url = f"https://welian.app?cli_callback={urllib.parse.quote(callback_url)}"
    print(f"Opening browser for login...")
    print(f"  If browser doesn't open, visit: {login_url}")
    print()
    webbrowser.open(login_url)

    thread.join(timeout=120)
    server.server_close()

    if result["user_id"]:
        auth = {"user_id": result["user_id"], "logged_in_at": str(__import__("datetime").datetime.now())}
        with open(WELIAN_AUTH_FILE, "w") as f:
            json.dump(auth, f, indent=2)
        print(f"✓ Logged in as: {result['user_id']}")
        print(f"  Saved to {WELIAN_AUTH_FILE}")
        print()
        print("Now run: welian agent --tunnel")
        print("  Your phone will auto-discover your agent via your Clerk account.")
    else:
        print("✗ Login timed out or failed.")


def _do_logout():
    """Unlink CLI from Clerk account."""
    if os.path.exists(WELIAN_AUTH_FILE):
        os.remove(WELIAN_AUTH_FILE)
        print("✓ Logged out.")
    else:
        print("Not logged in.")


def _get_user_id():
    """Get stored Clerk user_id, or None."""
    if os.path.exists(WELIAN_AUTH_FILE):
        try:
            with open(WELIAN_AUTH_FILE) as f:
                auth = json.load(f)
            return auth.get("user_id")
        except Exception:
            pass
    return None


def main():
    parser = argparse.ArgumentParser(prog="welian", description="Welian — AI companion for relationships")
    sub = parser.add_subparsers(dest="command")

    # Edge commands (local data)
    sub.add_parser("status", help="Show overview (local data)")
    p_advise = sub.add_parser("advise", help="Who to reach out to (local scoring + cloud AI)")
    p_advise.add_argument("--cloud", default="", help="Cloud API URL (empty=offline)")
    sub.add_parser("dashboard", help="Monthly role review (local)")

    p_contacts = sub.add_parser("contacts", help="List contacts (local)")
    p_contacts.add_argument("--nature", choices=["leverage", "nurture", "dual"])
    p_contacts.add_argument("--role", choices=["friend", "family", "collaborator"])

    p_chat = sub.add_parser("chat", help="Chat with Welian (edge mode)")
    p_chat.add_argument("message", help="Your message")
    p_chat.add_argument("--cloud", default="", help="Cloud API URL (empty=offline)")

    p_add = sub.add_parser("add", help="Add a contact (local)")
    p_add.add_argument("id")
    p_add.add_argument("--name", required=True)
    p_add.add_argument("--relation", default="")
    p_add.add_argument("--nature", choices=["leverage", "nurture", "dual"], default="leverage")

    p_balance = sub.add_parser("balance", help="Check token balance (local)")
    p_balance.add_argument("--user", default="default")

    # Export / Import (edge data management)
    p_export = sub.add_parser("export", help="Export all data (encrypted if --password)")
    p_export.add_argument("--password", default="")
    p_export.add_argument("--output", "-o", default="-", help="Output file (- for stdout)")

    p_import = sub.add_parser("import", help="Import data from file")
    p_import.add_argument("file", help="Import file path")
    p_import.add_argument("--password", default="")

    # Server modes
    p_serve = sub.add_parser("serve-cloud", help="Run cloud AI API (no data access)")
    p_serve.add_argument("--port", type=int, default=8000)
    p_serve.add_argument("--host", default="0.0.0.0")

    sub.add_parser("bot", help="Run WeChat bot (edge mode: local data + cloud AI)")

    p_bot_install = sub.add_parser("bot-install", help="Install bot as launchd service (auto-start + restart on crash)")
    p_bot_uninstall = sub.add_parser("bot-uninstall", help="Uninstall bot launchd service")
    sub.add_parser("bot-status", help="Check bot launchd service status")

    sub.add_parser("agent-install", help="Install agent as launchd service")
    sub.add_parser("agent-uninstall", help="Uninstall agent launchd service")
    sub.add_parser("agent-status", help="Check agent launchd service status")

    sub.add_parser("weekly-install", help="Install weekly report as launchd cron (Sunday 8pm)")
    sub.add_parser("weekly-uninstall", help="Uninstall weekly report launchd cron")
    sub.add_parser("weekly-status", help="Check weekly report launchd cron status")

    sub.add_parser("doctor", help="Diagnose all system components")

    p_agent = sub.add_parser("agent", help="Run local agent (WebSocket for browser)")
    p_agent.add_argument("--port", type=int, default=9800)
    p_agent.add_argument("--cloud", default="", help="Cloud API URL")
    p_agent.add_argument("--token", default="", help="Pairing token (auto-generated if empty)")
    p_agent.add_argument("--tunnel", action="store_true", help="Start Cloudflare tunnel for remote/mobile access")

    sub.add_parser("login", help="Link CLI to your Clerk account (for tunnel discovery)")
    sub.add_parser("logout", help="Unlink CLI from Clerk account")

    # Weekly report
    p_weekly = sub.add_parser("weekly", help="Generate and optionally push weekly report")
    p_weekly.add_argument("--push", action="store_true", help="Push to WeChat via bot")
    p_weekly.add_argument("--user", default="", help="WeChat user ID to push to (default: all bot users)")

    # Anchor assistant (SPEC §6.2)
    p_anchor = sub.add_parser("anchor", help="AI-suggested goal anchor for a contact")
    p_anchor.add_argument("contact", help="Contact name or ID (or 'batch' for batch mode)")
    p_anchor.add_argument("--apply", action="store_true", help="Apply suggestion without confirmation")
    p_anchor.add_argument("--limit", type=int, default=20, help="Batch mode: max contacts to suggest")

    # Batch classify nature (SPEC §2.4)
    p_classify = sub.add_parser("classify", help="Batch classify contact nature (撬动/维系)")
    p_classify.add_argument("--apply", action="store_true", help="Apply suggestions (default: dry run)")
    p_classify.add_argument("--init-nurture", action="store_true", help="Also initialize nurture fields")

    args = parser.parse_args()

    # ── Edge commands ──
    if args.command == "status":
        d = engine.get_dashboard()
        print(f"Welian Status (edge / local data)")
        print(f"  Contacts: {d['total_contacts']}")
        print(f"  Pending todos: {d['pending_todos']}")
        print(f"  Recent activities (7d): {d['recent_activities']}")
        print(f"  Upcoming birthdays (14d): {len(d['upcoming_birthdays'])}")
        print(f"  Leverage suggestions: {d['leverage_suggestions']}")
        print(f"  Nurture reminders: {d['nurture_reminders']}")

    elif args.command == "advise":
        cloud = args.cloud if hasattr(args, 'cloud') and args.cloud else os.environ.get("WELIAN_CLOUD_URL", "")
        client = EdgeClient(cloud_url=cloud)
        # Use ask intent
        reply = client._handle_ask()
        print(reply)

    elif args.command == "dashboard":
        dash = engine.role_dashboard()
        print(ai.format_role_dashboard(dash))

    elif args.command == "contacts":
        contacts = engine.list_contacts(nature=args.nature, role=args.role)
        for c in contacts:
            nature = engine.infer_nature(c)
            role = engine.contact_role(c)
            print(f"  {c['name']:12s} [{nature:8s}] [{role:12s}] {c.get('relation', '')}")

    elif args.command == "chat":
        client = EdgeClient(cloud_url=args.cloud)
        reply = client.chat(args.message)
        print(reply)

    elif args.command == "add":
        ok, msg = engine.add_contact(args.id, args.name, relation=args.relation, nature=args.nature)
        print(msg)

    elif args.command == "balance":
        info = tokens.get_plan_info(args.user)
        print(f"联点余额 — {info['plan_label']}")
        print(f"  套餐: {info['plan']}")
        print(f"  每月额度: {info['allowance']} 点")
        if info['purchased'] > 0:
            print(f"  额外购买: {info['purchased']} 点")
        print(f"  本月已用: {info['used_this_month']} 点")
        print(f"  剩余可用: {info['remaining']} 点")
        print(f"  累计使用: {info['total_used']} 点")
        print(f"  下次重置: {info['next_reset_date']}（{info['days_to_reset']}天后）")
        if info['plan'] != 'pro':
            print()
            print(f"  💡 升级 Pro：¥29/月 或 ¥299/年，每月额度提升至500点")

    # ── Export / Import ──
    elif args.command == "export":
        client = EdgeClient()
        data = client.export_data(password=args.password)
        output = json.dumps(data, ensure_ascii=False, indent=2)
        if args.output == "-":
            print(output)
        else:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output)
            print(f"Exported to {args.output}")
            if args.password:
                print("  (encrypted with password)")

    elif args.command == "import":
        with open(args.file, "r", encoding="utf-8") as f:
            data = json.load(f)
        client = EdgeClient()
        ok = client.import_data(data, password=args.password)
        if ok:
            print(f"Imported from {args.file}")
        else:
            print(f"Import failed — invalid format or wrong password")

    # ── Server modes ──
    elif args.command == "serve-cloud":
        import uvicorn
        print(f"Starting Welian Cloud API (AI-only, no data) on {args.host}:{args.port}")
        print(f"  Endpoints: /ai/draft /ai/extract /ai/advise /health")
        uvicorn.run("welian.api.server:app", host=args.host, port=args.port, reload=False)

    elif args.command == "bot":
        import asyncio
        from .bot.handler import run_hub_bridge
        print("Starting Welian WeChat bot (edge mode)...")
        print(f"  Data: local (edge)")
        print(f"  AI: cloud if WELIAN_CLOUD_URL set, else offline")
        asyncio.run(run_hub_bridge())

    elif args.command == "bot-install":
        import subprocess, shutil
        plist_path = os.path.expanduser("~/Library/LaunchAgents/com.welian.bot.plist")
        # Check if already loaded
        result = subprocess.run(["launchctl", "list", "com.welian.bot"], capture_output=True)
        if result.returncode == 0:
            print("Bot service already installed. Run 'welian bot-uninstall' first.")
            return
        # Load launchd plist
        subprocess.run(["launchctl", "load", plist_path], check=True)
        print("✓ Bot installed as launchd service")
        print(f"  Plist: {plist_path}")
        print("  Auto-starts on login, restarts on crash")
        print()
        print("  Logs: ~/.welian/logs/bot.log")
        print("  Stop: welian bot-uninstall")

    elif args.command == "bot-uninstall":
        import subprocess
        plist_path = os.path.expanduser("~/Library/LaunchAgents/com.welian.bot.plist")
        subprocess.run(["launchctl", "unload", plist_path], capture_output=True)
        print("✓ Bot service uninstalled")

    elif args.command == "bot-status":
        import subprocess
        result = subprocess.run(["launchctl", "list", "com.welian.bot"], capture_output=True)
        if result.returncode == 0:
            print("✓ Bot service is running")
            output = result.stdout.decode()
            for line in output.strip().split("\n"):
                if any(k in line for k in ["PID", "Status", "LastExit"]):
                    print(f"  {line.strip()}")
        else:
            print("✗ Bot service is not running")
            print("  Install with: welian bot-install")

    elif args.command == "agent-install":
        import subprocess
        plist_path = os.path.expanduser("~/Library/LaunchAgents/com.welian.agent.plist")
        result = subprocess.run(["launchctl", "list", "com.welian.agent"], capture_output=True)
        if result.returncode == 0:
            print("Agent service already installed. Run 'welian agent-uninstall' first.")
            return
        subprocess.run(["launchctl", "load", plist_path], check=True)
        print("✓ Agent installed as launchd service")
        print(f"  Plist: {plist_path}")
        print("  Auto-starts on login, restarts on crash")
        print("  Logs: ~/.welian/logs/agent-stdout.log")

    elif args.command == "agent-uninstall":
        import subprocess
        plist_path = os.path.expanduser("~/Library/LaunchAgents/com.welian.agent.plist")
        subprocess.run(["launchctl", "unload", plist_path], capture_output=True)
        print("✓ Agent service uninstalled")

    elif args.command == "agent-status":
        import subprocess
        result = subprocess.run(["launchctl", "list", "com.welian.agent"], capture_output=True)
        if result.returncode == 0:
            print("✓ Agent service is running")
            output = result.stdout.decode()
            for line in output.strip().split("\n"):
                if any(k in line for k in ["PID", "Status", "LastExit"]):
                    print(f"  {line.strip()}")
        else:
            print("✗ Agent service is not running")
            print("  Install with: welian agent-install")

    elif args.command == "weekly-install":
        import subprocess
        plist_path = os.path.expanduser("~/Library/LaunchAgents/com.welian.weekly.plist")
        result = subprocess.run(["launchctl", "list", "com.welian.weekly"], capture_output=True)
        if result.returncode == 0:
            print("Weekly report cron already installed. Run 'welian weekly-uninstall' first.")
            return
        subprocess.run(["launchctl", "load", plist_path], check=True)
        print("✓ Weekly report installed as launchd cron")
        print(f"  Plist: {plist_path}")
        print("  Schedule: Every Sunday at 20:00")
        print("  Auto-generates report and pushes to WeChat")
        print("  Logs: ~/.welian/logs/weekly-stdout.log")
        print("  Manual: welian weekly --push")

    elif args.command == "weekly-uninstall":
        import subprocess
        plist_path = os.path.expanduser("~/Library/LaunchAgents/com.welian.weekly.plist")
        subprocess.run(["launchctl", "unload", plist_path], capture_output=True)
        print("✓ Weekly report cron uninstalled")

    elif args.command == "weekly-status":
        import subprocess
        result = subprocess.run(["launchctl", "list", "com.welian.weekly"], capture_output=True)
        if result.returncode == 0:
            print("✓ Weekly report cron is installed")
            output = result.stdout.decode()
            for line in output.strip().split("\n"):
                if any(k in line for k in ["PID", "Status", "LastExit"]):
                    print(f"  {line.strip()}")
            print("  Schedule: Every Sunday at 20:00")
        else:
            print("✗ Weekly report cron is not installed")
            print("  Install with: welian weekly-install")

    elif args.command == "agent":
        import asyncio
        from .agent import LocalAgent
        cloud = args.cloud or os.environ.get("WELIAN_CLOUD_URL", "")
        agent = LocalAgent(port=args.port, cloud_url=cloud, token=args.token, tunnel=args.tunnel)
        asyncio.run(agent.start())

    elif args.command == "login":
        _do_login()

    elif args.command == "logout":
        _do_logout()

    elif args.command == "weekly":
        from .weekly import generate_weekly_report
        report = generate_weekly_report()
        print(report)

        if args.push:
            # Push via WeChat bot's ilink API
            import json as _json
            token = os.environ.get("WELIAN_BOT_TOKEN", "")
            if not token:
                print("\n⚠ WELIAN_BOT_TOKEN not set. Export it or run via launchd.")
                return

            from .bot.handler import IlinkApi, send_long_message
            api = IlinkApi(token=token)

            # Determine target user
            user_id = args.user
            if not user_id:
                # Use stored WeChat user ID from bot sessions
                users_file = os.path.join(WELIAN_HOME, "bot_users.json")
                if os.path.exists(users_file):
                    with open(users_file) as f:
                        users = _json.load(f)
                    if users:
                        user_id = users[0] if isinstance(users, list) else list(users.keys())[0]

            if not user_id:
                print("\n⚠ No WeChat user ID found. Use --user to specify.")
                return

            # Send report
            import asyncio
            async def push():
                await send_long_message(api, user_id, report)
            asyncio.run(push())
            print(f"\n✓ Pushed to WeChat user: {user_id[:12]}...")

    elif args.command == "anchor":
        client = EdgeClient()
        if args.contact == "batch":
            print("批量锚定建议（SPEC §6.2 目标锚定助手）\n")
            results = client.batch_suggest_anchors(limit=args.limit)
            if not results:
                print("所有 core 层联系人已锚定 👍")
            for r in results:
                s = r["suggestion"]
                if "error" in s:
                    print(f"  ✗ {r['name']}: {s['error']}")
                    continue
                print(f"  {r['name']} (strength={r['strength']}, tags={r['tags']})")
                print(f"    目标：{s.get('goals', [])}")
                print(f"    联结：{s.get('how', '')}")
                print(f"    方向：{s.get('direction', '')}")
                print(f"    类型：{s.get('nature', 'leverage')}")
                if args.apply:
                    ok, msg = client.apply_anchor(r["contact_id"], s)
                    print(f"    → {msg}")
                print()
            if not args.apply:
                print("加 --apply 自动应用，或逐个确认。")
        else:
            contact, _ = engine.resolve_contact(args.contact)
            if not contact:
                print(f"未找到联系人「{args.contact}」")
                return
            suggestion = client.suggest_anchor(contact["id"])
            if "error" in suggestion:
                print(f"错误：{suggestion['error']}")
                return
            print(f"锚定建议：{contact['name']}\n")
            print(f"  目标：{suggestion.get('goals', [])}")
            print(f"  联结：{suggestion.get('how', '')}")
            print(f"  方向：{suggestion.get('direction', '')}")
            print(f"  类型：{suggestion.get('nature', 'leverage')}")
            if args.apply:
                ok, msg = client.apply_anchor(contact["id"], suggestion)
                print(f"\n{msg}")
            else:
                print("\n加 --apply 应用此建议。")

    elif args.command == "classify":
        print("批量关系分类（SPEC §2.4 双关系模型）\n")
        changes = engine.batch_classify_natures(dry_run=not args.apply)
        if not changes:
            print("所有联系人已分类，无需调整 👍")
        else:
            print(f"{'应用' if args.apply else '建议'} {len(changes)} 项变更：\n")
            for cid, name, old, new in changes:
                old_label = {"leverage": "撬动", "nurture": "维系", "dual": "双重"}.get(old, old)
                new_label = {"leverage": "撬动", "nurture": "维系", "dual": "双重"}.get(new, new)
                print(f"  {name}: {old_label} → {new_label}")
            if not args.apply:
                print(f"\n加 --apply 应用（当前为 dry run）")

        if args.init_nurture:
            print("\n初始化维系型字段（SPEC §2.5）\n")
            nurture_changes = engine.batch_init_nurture(dry_run=not args.apply)
            if not nurture_changes:
                print("所有维系型联系人已初始化 👍")
            else:
                print(f"{'应用' if args.apply else '建议'} {len(nurture_changes)} 项：\n")
                for cid, name, nature in nurture_changes:
                    print(f"  {name} [{nature}]")
                if not args.apply:
                    print(f"\n加 --apply 应用")

    elif args.command == "doctor":
        _run_doctor()

    else:
        parser.print_help()

def _run_doctor():
    """Diagnose all system components."""
    import subprocess, time, json as _json

    checks = []
    passed = 0
    failed = 0
    warnings = 0

    def check(name, status, detail=""):
        nonlocal passed, failed, warnings
        icon = "✅" if status == "ok" else "❌" if status == "fail" else "⚠️"
        if status == "ok":
            passed += 1
        elif status == "fail":
            failed += 1
        else:
            warnings += 1
        line = f"  {icon} {name}"
        if detail:
            line += f" — {detail}"
        checks.append(line)

    print("🔍 Welian Doctor — 系统诊断\n")

    # 1. Python environment
    py_version = sys.version.split()[0]
    check("Python", "ok" if py_version >= "3.9" else "warn", f"v{py_version}")

    # 2. WELIAN_HOME
    home = os.environ.get("WELIAN_HOME", WELIAN_CONFIG_DIR)
    check("WELIAN_HOME", "ok" if os.path.isdir(home) else "fail", home)

    # 3. Data files
    data_dir = os.path.join(home, "data")
    expected_files = ["contacts.json", "timeline.json", "todos.json"]
    for fname in expected_files:
        fpath = os.path.join(data_dir, fname)
        if os.path.exists(fpath):
            size = os.path.getsize(fpath)
            check(f"Data: {fname}", "ok", f"{size:,} bytes")
        else:
            check(f"Data: {fname}", "fail", "missing")

    # 4. LLM
    try:
        from .llm.router import get_client
        llm = get_client()
        check("LLM", "ok", f"{llm.model} @ {llm.base_url}")
    except Exception as e:
        check("LLM", "fail", str(e)[:60])

    # 5. Bot service (launchd)
    result = subprocess.run(["launchctl", "list", "com.welian.bot"], capture_output=True)
    if result.returncode == 0:
        output = result.stdout.decode()
        pid = ""
        for line in output.split("\n"):
            if "PID" in line:
                pid = line.strip()
        check("Bot service", "ok", pid or "loaded")
    else:
        check("Bot service", "fail", "not installed (run: welian bot-install)")

    # 6. Agent service (launchd)
    result = subprocess.run(["launchctl", "list", "com.welian.agent"], capture_output=True)
    if result.returncode == 0:
        check("Agent service", "ok", "loaded")
    else:
        check("Agent service", "fail", "not installed (run: welian agent-install)")

    # 7. Weekly cron (launchd)
    result = subprocess.run(["launchctl", "list", "com.welian.weekly"], capture_output=True)
    if result.returncode == 0:
        check("Weekly cron", "ok", "Sunday 20:00")
    else:
        check("Weekly cron", "warn", "not installed (run: welian weekly-install)")

    # 8. Agent HTTP (localhost)
    try:
        import urllib.request
        resp = urllib.request.urlopen("http://localhost:9800/health", timeout=3)
        data = _json.loads(resp.read())
        check("Agent HTTP", "ok", f"port {data.get('port')}, clients={data.get('clients')}")
    except Exception:
        check("Agent HTTP", "fail", "not responding on :9800")

    # 9. Cloudflare tunnel
    try:
        result = subprocess.run(
            ["curl", "-s", "--max-time", "5", "https://agent.welian.app/health"],
            capture_output=True, text=True
        )
        if result.returncode == 0 and result.stdout.strip():
            data = _json.loads(result.stdout)
            tunnel = data.get("tunnel", "")
            check("Tunnel", "ok", tunnel or "connected")
        else:
            check("Tunnel", "fail", "no response")
    except Exception as e:
        check("Tunnel", "fail", str(e)[:50])

    # 10. cloudflared process
    result = subprocess.run(["pgrep", "-f", "cloudflared.*welian"], capture_output=True)
    check("cloudflared", "ok" if result.returncode == 0 else "fail",
          "running" if result.returncode == 0 else "not running")

    # 11. Bot token
    token = os.environ.get("WELIAN_BOT_TOKEN", "")
    if not token:
        # Check plist
        plist = os.path.expanduser("~/Library/LaunchAgents/com.welian.bot.plist")
        if os.path.exists(plist):
            with open(plist) as f:
                content = f.read()
            if "WELIAN_BOT_TOKEN" in content and "im.bot" in content:
                check("Bot token", "ok", "set in plist")
            else:
                check("Bot token", "warn", "plist exists but token may be empty")
        else:
            check("Bot token", "warn", "not in env, plist not found")
    else:
        check("Bot token", "ok", f"{token[:20]}...")

    # 12. Bot users (for weekly push)
    users_file = os.path.join(home, "bot_users.json")
    if os.path.exists(users_file):
        with open(users_file) as f:
            users = _json.load(f)
        check("Bot users", "ok", f"{len(users)} user(s) for weekly push")
    else:
        check("Bot users", "warn", "no users saved (send a WeChat message first)")

    # 13. Bot log (recent errors)
    bot_log = os.path.join(home, "logs", "bot.log")
    if os.path.exists(bot_log):
        with open(bot_log) as f:
            lines = f.readlines()[-50:]
        errors = [l for l in lines if "ERROR" in l.upper()]
        if errors:
            check("Bot log", "warn", f"{len(errors)} recent error(s)")
        else:
            check("Bot log", "ok", "no recent errors")
    else:
        check("Bot log", "warn", "no log file")

    # 14. Frontend (welian.app)
    try:
        result = subprocess.run(
            ["curl", "-s", "--max-time", "5", "-o", "/dev/null", "-w", "%{http_code}", "https://welian.app"],
            capture_output=True, text=True
        )
        if result.returncode == 0 and result.stdout.strip() in ("200", "301", "302"):
            check("Frontend", "ok", f"welian.app (HTTP {result.stdout.strip()})")
        else:
            check("Frontend", "warn", "welian.app not reachable (may need proxy in China)")
    except Exception:
        check("Frontend", "warn", "welian.app not reachable")

    # 15. Cloudflare Worker
    try:
        resp = urllib.request.urlopen("https://welian-ai.farmost.workers.dev/health", timeout=5)
        check("Cloud Worker", "ok", "workers.dev reachable")
    except Exception:
        check("Cloud Worker", "warn", "workers.dev not reachable (may be blocked in China)")

    # Print results
    for c in checks:
        print(c)

    # Summary
    print(f"\n{'='*40}")
    total = passed + failed + warnings
    print(f"  ✅ {passed} ok   ⚠️  {warnings} warn   ❌ {failed} fail   (total {total})")

    if failed == 0 and warnings == 0:
        print("\n  🎉 All checks passed!")
    elif failed == 0:
        print(f"\n  👍 No critical issues. {warnings} warning(s) to review.")
    else:
        print(f"\n  🔧 {failed} issue(s) need attention.")

    # Suggestions for failures
    suggestions = []
    if any("Bot service" in c and "❌" in c for c in checks):
        suggestions.append("  → Run: welian bot-install")
    if any("Agent service" in c and "❌" in c for c in checks):
        suggestions.append("  → Run: welian agent-install")
    if any("Tunnel" in c and "❌" in c for c in checks):
        suggestions.append("  → Check: cloudflared tunnel run welian-agent")
    if any("LLM" in c and "❌" in c for c in checks):
        suggestions.append("  → Check: ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN")
    if any("Bot token" in c and "⚠️" in c for c in checks):
        suggestions.append("  → Set: export WELIAN_BOT_TOKEN=xxx@im.bot:xxx")
    if suggestions:
        print("\n  Fix suggestions:")
        for s in suggestions:
            print(s)


if __name__ == "__main__":
    main()
