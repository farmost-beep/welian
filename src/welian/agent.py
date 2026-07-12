"""Welian local agent — WebSocket bridge between browser and local data.

The agent runs on the user's device (launched via `welian agent`).
It exposes a WebSocket server that the welian.app browser client connects to.

Architecture:
  Browser (welian.app) ←WebSocket→ Local Agent ←HTTP→ Cloud API (AI)

  - All data operations happen locally (engine reads/writes local JSON)
  - AI operations call the cloud API with minimal context
  - The agent authenticates the browser connection via a pairing token
  - No data leaves the device except minimal AI context snippets

Usage:
  welian agent [--port 9800] [--cloud https://api.welian.app]
"""
import json
import os
import asyncio
import websockets
import secrets
from datetime import datetime
from typing import Optional

from . import engine, intent, ai, tokens
from .edge import EdgeClient

# ── Agent state ──

class LocalAgent:
    """WebSocket server that bridges browser ↔ local data ↔ cloud AI."""

    def __init__(self, port: int = 9800, cloud_url: str = "", token: str = ""):
        self.port = port
        self.cloud_url = cloud_url
        self.pairing_token = token or self._generate_token()
        self.edge = EdgeClient(cloud_url=cloud_url)
        self.connected_clients = set()

    def _generate_token(self) -> str:
        """Generate a pairing token for browser authentication."""
        return secrets.token_urlsafe(16)

    async def handle_connection(self, websocket):
        """Handle a browser WebSocket connection."""
        # Authenticate: first message must be {"type": "auth", "token": "..."}
        try:
            raw = await asyncio.wait_for(websocket.recv(), timeout=10)
            msg = json.loads(raw)

            if msg.get("type") != "auth" or msg.get("token") != self.pairing_token:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Authentication failed. Check pairing token."
                }))
                await websocket.close()
                return

            await websocket.send(json.dumps({
                "type": "auth_ok",
                "message": "Connected to Welian local agent"
            }))
        except (asyncio.TimeoutError, json.JSONDecodeError, websockets.exceptions.ConnectionClosed):
            return

        self.connected_clients.add(websocket)
        print(f"✓ Browser connected ({len(self.connected_clients)} active)")

        # Handle messages
        try:
            async for raw in websocket:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "Invalid JSON"
                    }))
                    continue

                response = await self.process_command(msg)
                await websocket.send(json.dumps(response, ensure_ascii=False))

        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.connected_clients.discard(websocket)
            print(f"  Browser disconnected ({len(self.connected_clients)} active)")

    async def process_command(self, msg: dict) -> dict:
        """Process a command from the browser and return a response."""
        cmd = msg.get("cmd")
        req_id = msg.get("id", "")

        try:
            if cmd == "chat":
                text = msg.get("text", "")
                reply = self.edge.chat(text)
                return {"type": "response", "id": req_id, "reply": reply}

            elif cmd == "status":
                d = engine.get_dashboard()
                return {"type": "response", "id": req_id, "data": d}

            elif cmd == "contacts":
                nature = msg.get("nature")
                role = msg.get("role")
                contacts = engine.list_contacts(nature=nature, role=role)
                # Return minimal info (no platforms/notes for browser)
                minimal = [{
                    "id": c["id"],
                    "name": c["name"],
                    "nature": engine.infer_nature(c),
                    "role": engine.contact_role(c),
                    "relation": c.get("relation", ""),
                    "strength": c.get("strength", 1),
                } for c in contacts]
                return {"type": "response", "id": req_id, "data": minimal}

            elif cmd == "dashboard":
                dash = engine.role_dashboard()
                return {"type": "response", "id": req_id, "data": dash}

            elif cmd == "balance":
                user_id = msg.get("user_id", "default")
                bal = tokens.get_balance(user_id)
                return {"type": "response", "id": req_id, "data": bal}

            elif cmd == "add_contact":
                ok, msg_text = engine.add_contact(
                    msg.get("id", ""),
                    msg.get("name", ""),
                    relation=msg.get("relation", ""),
                    nature=msg.get("nature", "leverage"),
                )
                return {"type": "response", "id": req_id, "ok": ok, "message": msg_text}

            elif cmd == "check":
                target = msg.get("target", "")
                reply = ai.format_nurture_check(target)
                return {"type": "response", "id": req_id, "reply": reply}

            elif cmd == "ping":
                return {"type": "response", "id": req_id, "pong": True}

            else:
                return {"type": "error", "id": req_id, "message": f"Unknown command: {cmd}"}

        except Exception as e:
            return {"type": "error", "id": req_id, "message": str(e)}

    async def start(self):
        """Start the WebSocket server."""
        print(f"Welian Local Agent")
        print(f"  Port: {self.port}")
        print(f"  Cloud: {self.cloud_url or '(offline mode)'}")
        print(f"  Pairing token: {self.pairing_token}")
        print(f"  Data: {os.environ.get('WELIAN_HOME', '~/.welian')}")
        print()
        print(f"  → Open https://welian.app and enter this token to connect.")
        print()

        async with websockets.serve(
            self.handle_connection,
            "localhost",
            self.port,
            # Allow browser connections + CLI clients (no origin)
            origins=["https://welian.app", "http://localhost:*", "http://127.0.0.1:*", None],
        ):
            await asyncio.Future()  # run forever
