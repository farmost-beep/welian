"""Welian CLI — development and admin interface.

Usage:
  welian chat "记一下：和张总聊了预算方案"
  welian status
  welian contacts [--nature leverage|nurture|dual]
  welian advise
  welian dashboard
  welian serve [--port 8000]
  welian bot
"""
import sys
import argparse
from . import engine, intent, ai, tokens
from .bot.handler import process_message

def main():
    parser = argparse.ArgumentParser(prog="welian", description="Welian — AI companion for relationships")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("status", help="Show overview")
    sub.add_parser("advise", help="Who to reach out to")
    sub.add_parser("dashboard", help="Monthly role review")

    p_contacts = sub.add_parser("contacts", help="List contacts")
    p_contacts.add_argument("--nature", choices=["leverage", "nurture", "dual"])
    p_contacts.add_argument("--role", choices=["friend", "family", "collaborator"])

    p_chat = sub.add_parser("chat", help="Send a message to Welian")
    p_chat.add_argument("message", help="Your message")

    p_serve = sub.add_parser("serve", help="Run API server")
    p_serve.add_argument("--port", type=int, default=8000)
    p_serve.add_argument("--host", default="127.0.0.1")

    sub.add_parser("bot", help="Run WeChat bot bridge")

    p_add = sub.add_parser("add", help="Add a contact")
    p_add.add_argument("id")
    p_add.add_argument("--name", required=True)
    p_add.add_argument("--relation", default="")
    p_add.add_argument("--nature", choices=["leverage", "nurture", "dual"], default="leverage")

    p_balance = sub.add_parser("balance", help="Check token balance")
    p_balance.add_argument("--user", default="default")

    args = parser.parse_args()

    if args.command == "status":
        d = engine.get_dashboard()
        print(f"Welian Status")
        print(f"  Contacts: {d['total_contacts']}")
        print(f"  Pending todos: {d['pending_todos']}")
        print(f"  Recent activities (7d): {d['recent_activities']}")
        print(f"  Upcoming birthdays (14d): {len(d['upcoming_birthdays'])}")
        print(f"  Leverage suggestions: {d['leverage_suggestions']}")
        print(f"  Nurture reminders: {d['nurture_reminders']}")

    elif args.command == "advise":
        leverage = engine.advise_leverage(top=5)
        nurture = engine.advise_nurture(days_ahead=14)
        if leverage:
            print(ai.format_advise_leverage(leverage))
        if nurture:
            print()
            print(ai.format_advise_nurture(nurture))
        if not leverage and not nurture:
            print("这周没有特别需要联系的。")

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
        reply = process_message("cli", args.message)
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

    elif args.command == "serve":
        import uvicorn
        print(f"Starting Welian API on {args.host}:{args.port}")
        uvicorn.run("welian.api.server:app", host=args.host, port=args.port, reload=False)

    elif args.command == "bot":
        import asyncio
        from .bot.handler import run_hub_bridge
        print("Starting Welian WeChat bot bridge...")
        asyncio.run(run_hub_bridge())

    else:
        parser.print_help()

if __name__ == "__main__":
    main()
