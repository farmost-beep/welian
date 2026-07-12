"""WeChat bot handler — runs on the EDGE, calls cloud for AI only.

Architecture (SPEC §7.1):
  WeChat user → Bot (edge) → EdgeClient (local engine) → Cloud (AI only)
                ↑ all data stays here           ↑ only minimal context sent

The bot process runs on the user's device (or a device they control).
All relationship data stays local. Only AI operations hit the cloud.
"""
import json
import os
import asyncio
import websockets

from ..edge import EdgeClient

# ── Edge client instance ──
# The bot runs on the edge — it has a local EdgeClient
_cloud_url = os.environ.get("WELIAN_CLOUD_URL", "")  # empty = offline mode
_edge = EdgeClient(cloud_url=_cloud_url)

def process_message(user_id, text):
    """Process a user message via the edge client.

    All data operations happen locally. AI features call the cloud
    with minimal context only.
    """
    return _edge.chat(text)

# ── OpeniLink Hub bridge ──

HUB_URL = os.environ.get("WELIAN_HUB_URL", "ws://localhost:9800")
BOT_ID = os.environ.get("WELIAN_BOT_ID", "welian-bot")

async def run_hub_bridge():
    """Run the OpeniLink Hub WebSocket bridge.

    The bot connects to the Hub (which interfaces with WeChat),
    receives messages, processes them via the edge client, and
    sends replies back.

    Data flow:
      WeChat → Hub → Bot(edge) → EdgeClient(local) → [Cloud AI if needed]
      ← reply ← Bot ← EdgeClient ← [Cloud AI result]
    """
    print(f"Welian bot (edge) connecting to {HUB_URL}...")
    print(f"  Cloud URL: {_cloud_url or '(offline mode)'}")
    while True:
        try:
            async with websockets.connect(HUB_URL) as ws:
                print("✓ Connected to Hub")
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
                        # Process on edge — data stays local
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
