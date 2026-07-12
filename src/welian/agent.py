"""Welian local agent — HTTP + WebSocket bridge between browser and local data.

The agent runs on the user's device (launched via `welian agent`).
It serves a small HTTP page at http://localhost:PORT that acts as an
iframe bridge — the welian.app page embeds this iframe, which connects
to the local WebSocket (same-origin) and relays messages via postMessage.

Architecture:
  Browser (welian.app)
    ├─ iframe → http://localhost:PORT/bridge.html (same-origin as WS)
    │           └─ WebSocket → ws://localhost:PORT/ws
    └─ postMessage ↔ iframe

  Local Agent
    ├─ HTTP server (aiohttp)
    │   ├─ GET /          → bridge.html (iframe page)
    │   ├─ GET /health    → health check JSON
    │   └─ WS /ws         → WebSocket handler
    └─ engine (local data) + EdgeClient (cloud AI)

Usage:
  welian agent [--port 9800] [--cloud https://api.welian.app]
"""
import json
import os
import asyncio
import secrets
from typing import Optional

from . import engine, intent, ai, tokens
from .edge import EdgeClient

# ── Page HTML (served at http://host:PORT/) ──
# Dual mode:
# 1. Iframe bridge: embedded in welian.app, relays via postMessage
# 2. Standalone: full chat UI when accessed directly (e.g. from phone)

BRIDGE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
<title>Welian — Local Agent</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#F5F4EE;--surface:#EDEBE3;--surface2:#E4E1D6;--border:#D9D5C7;--text:#1A1915;--dim:#6B6860;--dimmer:#9A968C;--accent:#C96442;--accent-bg:#F2E8E0;--green:#4A7C59}
body{font-family:-apple-system,Inter,sans-serif;background:var(--bg);color:var(--text);font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased}
.chat-frame{max-width:540px;margin:20px auto;background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.03),0 6px 20px rgba(0,0,0,.04)}
.chat-head{display:flex;align-items:center;gap:5px;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface2)}
.chat-head .dot{width:9px;height:9px;border-radius:50%}
.chat-head .dot.r{background:#D65D5D}.chat-head .dot.y{background:#D9A441}.chat-head .dot.g{background:#5B9462}
.chat-head .title{font-size:.8em;color:var(--dim);margin-left:6px;font-weight:500}
.chat-head .badge{margin-left:auto;font-size:.6em;padding:2px 8px;border-radius:3px;font-weight:500}
.chat-head .badge.live{background:var(--green);color:#fff}
.chat-head .badge.off{background:var(--dimmer);color:var(--bg)}
.chat-body{height:60vh;min-height:280px;overflow-y:auto;padding:16px 14px;scrollbar-width:thin}
.msg{margin-bottom:14px;animation:fadein .4s ease}
@keyframes fadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.msg .who{font-size:.62em;font-weight:600;margin-bottom:3px;letter-spacing:.04em;text-transform:uppercase}
.msg .who.you{color:var(--accent)}
.msg .who.ai{color:var(--green)}
.msg .bubble{padding:10px 14px;border-radius:7px;font-size:.85em;white-space:pre-wrap;line-height:1.55;word-break:break-word}
.msg .bubble.you{background:var(--accent-bg);border:1px solid #E8D5C8}
.msg .bubble.ai{background:var(--bg);border:1px solid var(--border)}
.msg .bubble.sys{background:var(--surface2);border:1px solid var(--border);color:var(--dim);font-size:.8em}
.msg .typing{display:inline-block;width:6px;height:13px;background:var(--green);border-radius:1px;animation:blink 1s infinite;vertical-align:text-bottom}
@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
.chat-input{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid var(--border);background:var(--bg)}
.chat-input input{flex:1;background:none;border:none;color:var(--text);font-size:.85em;font-family:inherit;outline:none;min-width:0}
.chat-input input::placeholder{color:var(--dimmer)}
.chat-input .send{color:var(--dim);cursor:pointer;font-size:.78em;border:none;background:none;font-family:inherit;flex-shrink:0;padding:4px 6px}
.hint{font-size:.67em;color:var(--dimmer);text-align:center;padding:8px}
.hint span{color:var(--dim);cursor:pointer;border-bottom:1px solid transparent;padding:1px 3px}
</style>
</head>
<body>

<div class="chat-frame">
  <div class="chat-head">
    <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
    <span class="title">Welian Local</span>
    <span class="badge off" id="badge">Connecting…</span>
  </div>
  <div class="chat-body" id="body"></div>
  <div class="chat-input" id="inputBar" style="display:none">
    <input id="input" type="text" placeholder="Talk to Welian…" onkeydown="if(event.key==='Enter')send()">
    <button class="send" onclick="send()">→</button>
  </div>
  <div class="hint" id="hints" style="display:none">
    <span onclick="qs('who to reach out')">Who to reach out</span>
    <span onclick="qs('note: met with X about Y')">Quick note</span>
    <span onclick="qs('draft a message to an old friend')">Draft a message</span>
  </div>
</div>

<script>
const PAIRING_TOKEN = "__PAIRING_TOKEN__";
const wsUrl = `ws://${location.host}/ws`;
let ws = null;
let isIframe = window.parent !== window;
let parentOrigin = '*';

function $(id){return document.getElementById(id)}
function addMsg(who,text){
  const d=document.createElement('div');d.className='msg';
  const label=who==='ai'?'Welian':'You';
  d.innerHTML='<div class="who '+who+'">'+label+'</div><div class="bubble '+who+'"></div>';
  d.querySelector('.bubble').textContent=text;
  $('body').appendChild(d);$('body').scrollTop=$('body').scrollHeight;
}
function addTyping(){
  const d=document.createElement('div');d.className='msg';d.id='typing';
  d.innerHTML='<div class="who ai">Welian</div><div class="bubble ai"><span class="typing"></span></div>';
  $('body').appendChild(d);$('body').scrollTop=$('body').scrollHeight;
}
function rmTyping(){$('typing')&&$('typing').remove()}

function notifyParent(type,data){
  if(isIframe) parent.postMessage({source:'welian-bridge',type:type,data:data},parentOrigin);
}

function connect(){
  ws=new WebSocket(wsUrl);
  ws.onopen=()=>{ws.send(JSON.stringify({type:'auth',token:PAIRING_TOKEN}))};
  ws.onmessage=(e)=>{
    const data=JSON.parse(e.data);
    notifyParent('ws-message',data);
    if(data.type==='auth_ok'){
      onConnected();
    } else if(!isIframe){
      rmTyping();
      if(data.type==='error'){$('badge').textContent='Error';addMsg('ai','Error: '+data.message)}
      else if(data.type==='response'&&data.reply){addMsg('ai',data.reply)}
      else if(data.type==='response'&&data.data){addMsg('ai',JSON.stringify(data.data,null,2))}
    }
  };
  ws.onerror=()=>{notifyParent('ws-error',{});if(!isIframe){$('badge').textContent='Offline'}};
  ws.onclose=()=>{notifyParent('ws-close',{})};
}

function onConnected(){
  $('inputBar').style.display='flex';
  $('hints').style.display='block';
  $('badge').textContent='Live';
  $('badge').className='badge live';
  if(!isIframe){
    addMsg('ai','Connected to your local agent ✅\\n\\nYour data is on your device.\\n\\nTry: "who to reach out" or "note: met with X about Y"');
  }
  // Send device_id to parent for discovery linking
  if(isIframe){
    fetch('/health').then(r=>r.json()).then(d=>{
      if(d.device_id){
        parent.postMessage({source:'welian-bridge',type:'device-id',device_id:d.device_id},parentOrigin);
      }
    }).catch(()=>{});
  }
}

function send(){
  const text=$('input').value.trim();if(!text)return;
  $('input').value='';
  addMsg('you',text);addTyping();
  ws.send(JSON.stringify({cmd:'chat',id:Date.now().toString(),text:text}));
}

function qs(text){$('input').value=text;send()}

// Iframe bridge mode: listen for parent commands
window.addEventListener('message',(e)=>{
  const msg=e.data;
  if(!msg||msg.source!=='welian-parent')return;
  parentOrigin=e.origin;
  if(msg.type==='send'&&ws&&ws.readyState===WebSocket.OPEN){ws.send(JSON.stringify(msg.payload))}
});

// Notify parent if in iframe, then auto-connect
if(isIframe){
  parent.postMessage({source:'welian-bridge',type:'ready'},'*');
}
// Auto-connect on load (token is injected by agent)
connect();
</script>
</body>
</html>"""


class LocalAgent:
    """HTTP + WebSocket server that bridges browser ↔ local data ↔ cloud AI."""

    DISCOVERY_URL = "https://welian-ai.farmost.workers.dev"

    def __init__(self, port: int = 9800, cloud_url: str = "", token: str = "", tunnel: bool = False):
        self.port = port
        self.cloud_url = cloud_url
        self.pairing_token = token or self._generate_token()
        self.edge = EdgeClient(cloud_url=cloud_url)
        self.connected_clients = set()
        self.tunnel = tunnel
        self.tunnel_url = ""
        self.device_id = self._get_device_id()

    def _generate_token(self) -> str:
        return secrets.token_urlsafe(16)

    def _get_device_id(self) -> str:
        """Generate a stable device ID from machine info."""
        import hashlib, platform
        raw = f"{platform.node()}-{platform.machine()}-{os.getuid() if hasattr(os, 'getuid') else 0}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    async def _start_tunnel(self):
        """Start cloudflared named tunnel (agent.welian.app) and register with discovery."""
        import subprocess

        TUNNEL_URL = "https://agent.welian.app"

        try:
            # Start named tunnel (uses ~/.cloudflared/config.yml)
            proc = subprocess.Popen(
                ["cloudflared", "tunnel", "run", "welian-agent"],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                env={**os.environ, "NO_AUTO_UPDATE": "true"},
            )
            # Wait for tunnel to connect
            import time
            for _ in range(15):
                line = proc.stdout.readline().decode("utf-8", errors="replace")
                if "Registered tunnel connection" in line:
                    break
                time.sleep(1)

            self.tunnel_url = TUNNEL_URL
            print(f"  Tunnel: {TUNNEL_URL}")

            # Register with discovery service
            import urllib.request
            req = urllib.request.Request(
                f"{self.DISCOVERY_URL}/discover/register",
                data=json.dumps({"device_id": self.device_id, "tunnel_url": TUNNEL_URL}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=10)
            print(f"  Registered device: {self.device_id}")
        except FileNotFoundError:
            print("  ⚠ cloudflared not installed — tunnel disabled")
        except Exception as e:
            print(f"  ⚠ Tunnel error: {e}")

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

    async def handle_ws(self, request):
        """Handle WebSocket upgrade request."""
        ws_server = websockets.WebSocketServerProtocol(
            request.protocol,
            request.transport,
        )
        await self._handle_connection(ws_server)
        return ws_server

    async def _handle_connection(self, websocket):
        """Handle a WebSocket connection (auth + message loop)."""
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

    async def start(self):
        """Start HTTP + WebSocket server."""
        from aiohttp import web
        import socket

        # Get LAN IP for mobile access
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            lan_ip = s.getsockname()[0]
            s.close()
        except Exception:
            lan_ip = "localhost"

        print(f"Welian Local Agent")
        print(f"  Port: {self.port}")
        print(f"  Cloud: {self.cloud_url or '(offline mode)'}")
        print(f"  Pairing token: {self.pairing_token}")
        print(f"  Device ID: {self.device_id}")
        print(f"  Data: {os.environ.get('WELIAN_HOME', '~/.welian')}")
        print()
        if self.tunnel:
            print(f"  Starting tunnel for remote access…")
            await self._start_tunnel()
            print()
        print(f"  Desktop: https://welian.app → auto-connect")
        print(f"  Mobile:  https://welian.app → auto-connect via tunnel")
        if lan_ip != "localhost":
            print(f"  LAN:     http://{lan_ip}:{self.port}")
        print()

        async def index_handler(request):
            # Inject pairing token directly into the page —
            # no manual token entry needed.
            html = BRIDGE_HTML.replace("__PAIRING_TOKEN__", self.pairing_token)
            return web.Response(text=html, content_type="text/html")

        async def health_handler(request):
            return web.json_response({
                "status": "ok",
                "port": self.port,
                "clients": len(self.connected_clients),
                "device_id": self.device_id,
                "tunnel": self.tunnel_url or None,
            })

        async def ws_handler(request):
            ws_server = web.WebSocketResponse()
            await ws_server.prepare(request)

            # Auth
            try:
                raw = await asyncio.wait_for(ws_server.receive(), timeout=10)
                msg = json.loads(raw.data)

                if msg.get("type") != "auth" or msg.get("token") != self.pairing_token:
                    await ws_server.send_json({
                        "type": "error",
                        "message": "Authentication failed. Check pairing token."
                    })
                    await ws_server.close()
                    return ws_server

                await ws_server.send_json({
                    "type": "auth_ok",
                    "message": "Connected to Welian local agent"
                })
            except (asyncio.TimeoutError, json.JSONDecodeError):
                return ws_server

            self.connected_clients.add(ws_server)
            print(f"✓ Browser connected ({len(self.connected_clients)} active)")

            try:
                async for raw_msg in ws_server:
                    try:
                        msg = json.loads(raw_msg.data)
                    except json.JSONDecodeError:
                        await ws_server.send_json({
                            "type": "error",
                            "message": "Invalid JSON"
                        })
                        continue
                    response = await self.process_command(msg)
                    await ws_server.send_json(response)
            except Exception as e:
                print(f"  WS error: {e}")
            finally:
                self.connected_clients.discard(ws_server)
                print(f"  Browser disconnected ({len(self.connected_clients)} active)")

            return ws_server

        app = web.Application()
        app.router.add_get("/", index_handler)
        app.router.add_get("/health", health_handler)
        app.router.add_get("/ws", ws_handler)

        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "0.0.0.0", self.port)
        await site.start()

        await asyncio.Future()  # run forever
