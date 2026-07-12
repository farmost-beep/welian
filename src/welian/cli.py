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

    p_agent = sub.add_parser("agent", help="Run local agent (WebSocket for browser)")
    p_agent.add_argument("--port", type=int, default=9800)
    p_agent.add_argument("--cloud", default="", help="Cloud API URL")
    p_agent.add_argument("--token", default="", help="Pairing token (auto-generated if empty)")
    p_agent.add_argument("--tunnel", action="store_true", help="Start Cloudflare tunnel for remote/mobile access")

    sub.add_parser("login", help="Link CLI to your Clerk account (for tunnel discovery)")
    sub.add_parser("logout", help="Unlink CLI from Clerk account")

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
        bal = tokens.get_balance(args.user)
        print(f"Token Balance ({bal['plan']})")
        print(f"  Allowance: {bal['allowance']}/month")
        print(f"  Purchased: {bal['purchased']}")
        print(f"  Used this month: {bal['used_this_month']}")
        print(f"  Remaining: {bal['remaining']}")

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
            # Parse launchctl output
            output = result.stdout.decode()
            for line in output.strip().split("\n"):
                if any(k in line for k in ["PID", "Status", "LastExit"]):
                    print(f"  {line.strip()}")
        else:
            print("✗ Bot service is not running")
            print("  Install with: welian bot-install")

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

    else:
        parser.print_help()

if __name__ == "__main__":
    main()
