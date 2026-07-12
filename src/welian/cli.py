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

  # Data management
  welian export [--password XXX]     # encrypted export
  welian import <file> [--password XXX]
  welian balance
"""
import sys
import os
import json
import argparse
from . import engine, intent, ai, tokens
from .edge import EdgeClient

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

    p_agent = sub.add_parser("agent", help="Run local agent (WebSocket for browser)")
    p_agent.add_argument("--port", type=int, default=9800)
    p_agent.add_argument("--cloud", default="", help="Cloud API URL")
    p_agent.add_argument("--token", default="", help="Pairing token (auto-generated if empty)")

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

    elif args.command == "agent":
        import asyncio
        from .agent import LocalAgent
        cloud = args.cloud or os.environ.get("WELIAN_CLOUD_URL", "")
        agent = LocalAgent(port=args.port, cloud_url=cloud, token=args.token)
        asyncio.run(agent.start())

    else:
        parser.print_help()

if __name__ == "__main__":
    main()
