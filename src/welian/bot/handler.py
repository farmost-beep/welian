"""WeChat bot handler — bridges WeChat messages to Welian engine.

Supports two modes:
1. OpeniLink Hub bridge (WebSocket, production)
2. HTTP webhook (for testing/development)

Message flow:
  WeChat user → Bot → handler.process(user_id, text) → reply → Bot → WeChat user
"""
import json
import os
import asyncio
import websockets
from .. import engine, intent, ai, tokens
from ..api.server import _handle_record, _handle_ask, _handle_draft, _handle_report, _handle_check, _fallback, _help_text, _intent_to_feature

# ── Core message processing ──

def process_message(user_id, text):
    """Process a user message and return Welian's reply.

    This is the single entry point for all bot integrations.
    """
    text = text.strip()
    if not text:
        return "跟我说点什么吧 😊"

    intent_type, payload = intent.parse(text)

    if intent_type == intent.INTENT_HELP:
        return _help_text()

    elif intent_type == intent.INTENT_RECORD:
        # Ensure user has a data directory (multi-tenant)
        _ensure_user_data(user_id)
        reply = _handle_record(payload, user_id)
        tokens.consume(user_id, "ai_record_enhance")
        return reply

    elif intent_type == intent.INTENT_ASK:
        _ensure_user_data(user_id)
        ok, remaining, msg = tokens.consume(user_id, "advise_engine")
        if not ok:
            return msg
        return _handle_ask(user_id)

    elif intent_type == intent.INTENT_DRAFT:
        _ensure_user_data(user_id)
        ok, remaining, msg = tokens.consume(user_id, "ai_draft")
        if not ok:
            return msg
        return _handle_draft(payload, user_id)

    elif intent_type == intent.INTENT_REPORT:
        _ensure_user_data(user_id)
        ok, remaining, msg = tokens.consume(user_id, "role_dashboard")
        if not ok:
            return msg
        return _handle_report(user_id)

    elif intent_type == intent.INTENT_CHECK:
        _ensure_user_data(user_id)
        return _handle_check(payload)

    else:
        return _fallback(text)

def _ensure_user_data(user_id):
    """Ensure user has a data directory. In production, this would set up
    per-user SQLite or isolated JSON files."""
    import os
    from pathlib import Path
    home = Path.home() / ".welian" / "users" / user_id
    home.mkdir(parents=True, exist_ok=True)
    # In production, engine would use per-user data paths
    # For now, all users share the default data dir (single-tenant MVP)

# ── OpeniLink Hub bridge ──

HUB_URL = os.environ.get("WELIAN_HUB_URL", "ws://localhost:9800")
BOT_ID = os.environ.get("WELIAN_BOT_ID", "welian-bot")

async def run_hub_bridge():
    """Run the OpeniLink Hub WebSocket bridge.

    Connects to the Hub, receives WeChat messages, processes them,
    and sends replies back through the Hub API.
    """
    print(f"Welian bot connecting to {HUB_URL}...")
    while True:
        try:
            async with websockets.connect(HUB_URL) as ws:
                print("✓ Connected to Hub")
                # Register bot
                await ws.send(json.dumps({
                    "type": "register",
                    "bot_id": BOT_ID,
                    "name": "Welian",
                }))
                async for raw in ws:
                    msg = json.loads(raw)
                    if msg.get("type") == "message":
                        user_id = msg.get("from", "default")
                        text = msg.get("content", "")
                        reply = process_message(user_id, text)
                        await ws.send(json.dumps({
                            "type": "reply",
                            "to": msg.get("from"),
                            "content": reply,
                        }))
        except (ConnectionRefusedError, websockets.exceptions.ConnectionClosed) as e:
            print(f"Connection lost: {e}, reconnecting in 5s...")
            await asyncio.sleep(5)
        except Exception as e:
            print(f"Error: {e}, reconnecting in 5s...")
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(run_hub_bridge())
