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
import uuid
import asyncio
import secrets
from datetime import datetime
from typing import Optional

from . import engine, intent, ai, tokens
from .edge import EdgeClient

def _load_agent_config():
    """Load agent config from config/welian.yaml. Returns dict with defaults."""
    cfg = {"engine": "edge", "devin": {"model": "", "permission_mode": "dangerous", "max_turns": 50, "timeout": 600, "work_dir": ""}}
    try:
        import yaml as _yaml
        from pathlib import Path
        root = Path(__file__).resolve().parent.parent.parent
        config_path = root / "config" / "welian.yaml"
        if config_path.exists():
            with open(config_path) as f:
                full = _yaml.safe_load(f)
            agent_cfg = full.get("agent", {})
            if agent_cfg.get("engine"):
                cfg["engine"] = agent_cfg["engine"]
            if agent_cfg.get("devin"):
                cfg["devin"] = {**cfg["devin"], **agent_cfg["devin"]}
    except Exception:
        pass
    return cfg


def _merge_agent_config(current: dict, updates: dict) -> dict:
    """Merge updates into current agent config. Returns new dict."""
    result = {**current}
    if "engine" in updates:
        result["engine"] = updates["engine"]
    if "devin" in updates and isinstance(updates["devin"], dict):
        result["devin"] = {**result.get("devin", {}), **updates["devin"]}
    return result


def _apply_devin_env(devin_cfg: dict):
    """Apply devin config to agent_bridge module-level variables (runtime override)."""
    try:
        from . import agent_bridge
        if devin_cfg.get("permission_mode"):
            agent_bridge.DEFAULT_PERMISSION = devin_cfg["permission_mode"]
        if devin_cfg.get("max_turns"):
            agent_bridge.MAX_TURN_REQUESTS = int(devin_cfg["max_turns"])
        if devin_cfg.get("timeout"):
            agent_bridge.DEFAULT_TIMEOUT = int(devin_cfg["timeout"])
        if devin_cfg.get("work_dir"):
            agent_bridge.DEFAULT_WORK_DIR = devin_cfg["work_dir"]
        if devin_cfg.get("model"):
            agent_bridge.DEVIN_MODEL = devin_cfg["model"]
        else:
            agent_bridge.DEVIN_MODEL = ""
    except Exception:
        pass


def _save_agent_config(cfg: dict):
    """Persist agent config back to config/welian.yaml (agent section only)."""
    try:
        from pathlib import Path
        root = Path(__file__).resolve().parent.parent.parent
        config_path = root / "config" / "welian.yaml"
        if not config_path.exists():
            return
        text = config_path.read_text("utf-8")
        lines = text.split("\n")
        # Find agent section and replace it
        out = []
        in_agent = False
        agent_done = False
        for line in lines:
            if line.startswith("agent:"):
                in_agent = True
                out.append(line)
                # Write new agent section
                out.append(f'  engine: "{cfg.get("engine", "edge")}"')
                devin = cfg.get("devin", {})
                out.append('  devin:')
                out.append(f'    model: "{devin.get("model", "")}"')
                out.append(f'    permission_mode: "{devin.get("permission_mode", "dangerous")}"')
                out.append(f'    max_turns: {devin.get("max_turns", 50)}')
                out.append(f'    timeout: {devin.get("timeout", 600)}')
                out.append(f'    work_dir: "{devin.get("work_dir", "")}"')
                out.append('  edge:')
                out.append(f'    model: ""')
                agent_done = True
                continue
            if in_agent:
                # Skip old agent section lines (indented under agent:)
                if line.startswith("  ") and not line.startswith("    "):
                    # Could be a subsection like "  devin:" — skip old content
                    continue
                if line.startswith("    "):
                    continue
                # Non-indented line = end of agent section
                in_agent = False
            out.append(line)
        if not agent_done:
            # No agent section found, append at end
            out.append("agent:")
            out.append(f'  engine: "{cfg.get("engine", "edge")}"')
            out.append('  devin:')
            devin = cfg.get("devin", {})
            out.append(f'    model: "{devin.get("model", "")}"')
            out.append(f'    permission_mode: "{devin.get("permission_mode", "dangerous")}"')
            out.append(f'    max_turns: {devin.get("max_turns", 50)}')
            out.append(f'    timeout: {devin.get("timeout", 600)}')
            out.append(f'    work_dir: "{devin.get("work_dir", "")}"')
        config_path.write_text("\n".join(out), "utf-8")
    except Exception as e:
        print(f"  ⚠ Failed to save agent config: {e}")

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
const CLERK_USER_ID = new URLSearchParams(location.search).get('clerk_uid') || "";
const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProto}//${location.host}/ws`;
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
  ws.onopen=()=>{ws.send(JSON.stringify({type:'auth',token:PAIRING_TOKEN,clerk_uid:CLERK_USER_ID}))};
  ws.onmessage=(e)=>{
    const data=JSON.parse(e.data);
    // Auto-reply pong to server ping (keepalive for long tasks)
    if(data.type==='ping'){ws.send(JSON.stringify({type:'pong'}));return}
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
  if(msg.type==='send'){
    if(ws&&ws.readyState===WebSocket.OPEN){
      ws.send(JSON.stringify(msg.payload));
    } else {
      // ws not open — notify parent so it can fallback to cloud immediately
      // instead of waiting for agentChat timeout
      notifyParent('ws-close',{reason:'ws_not_open',readyState:ws?ws.readyState:0});
    }
  }
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

    def __init__(self, port: int = 9800, cloud_url: str = "", token: str = "",
                 user_token: str = "", tunnel: bool = False):
        self.port = port
        self.cloud_url = cloud_url
        self.user_token = user_token
        self.pairing_token = token or self._generate_token()
        self.edge = EdgeClient(cloud_url=cloud_url, user_token=user_token)
        self.connected_clients = set()
        self.tunnel = tunnel
        self.tunnel_url = ""
        self.device_id = self._get_device_id()
        self.agent_config = _load_agent_config()
        self._devin_bridge = None  # lazy-init Devin bridge when engine=devin
        self._ws_loop = None  # asyncio loop for cross-thread WS sends (set in start())
        self.clerk_user_id = None  # set from browser WS auth (dynamic, per-session)

    def _generate_token(self) -> str:
        return secrets.token_urlsafe(16)

    def _get_device_id(self) -> str:
        """Generate a stable device ID from machine info."""
        import hashlib, platform
        raw = f"{platform.node()}-{platform.machine()}-{os.getuid() if hasattr(os, 'getuid') else 0}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    async def _start_tunnel(self):
        """Start cloudflared tunnel and register with discovery service.

        Uses Clerk user_id (from 'welian login') as the key, so any device
        logged into the same Clerk account can discover this tunnel.
        Falls back to device_id if not logged in.
        """
        import subprocess, re, time, urllib.request

        # Determine registry key: prefer Clerk user_id, fall back to device_id
        from .cli import _get_user_id
        user_id = _get_user_id()
        registry_key = user_id or self.device_id

        try:
            # Try named tunnel first (permanent URL)
            tunnel_url = "https://agent.welian.app"
            try:
                proc = subprocess.Popen(
                    ["cloudflared", "tunnel", "run", "welian-agent"],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    env={**os.environ, "NO_AUTO_UPDATE": "true"},
                )
                for _ in range(15):
                    line = proc.stdout.readline().decode("utf-8", errors="replace")
                    if "Registered tunnel connection" in line:
                        break
                    time.sleep(1)
            except Exception:
                # Fall back to quick tunnel
                proc = subprocess.Popen(
                    ["cloudflared", "tunnel", "--url", f"http://localhost:{self.port}"],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    env={**os.environ, "NO_AUTO_UPDATE": "true"},
                )
                tunnel_url = ""
                for _ in range(30):
                    line = proc.stdout.readline().decode("utf-8", errors="replace")
                    if "trycloudflare.com" in line:
                        m = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', line)
                        if m:
                            tunnel_url = m.group(0)
                            break
                    time.sleep(1)

            if not tunnel_url:
                print("  ⚠ Tunnel failed to start")
                return

            self.tunnel_url = tunnel_url
            print(f"  Tunnel: {tunnel_url}")

            # Register with discovery service using user_id (or device_id)
            req = urllib.request.Request(
                f"{self.DISCOVERY_URL}/discover/register",
                data=json.dumps({"device_id": registry_key, "tunnel_url": tunnel_url}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=10)
            if user_id:
                print(f"  Registered to Clerk user: {user_id}")
            else:
                print(f"  Registered to device: {self.device_id}")
                print(f"  ⚠ Run 'welian login' to enable multi-device discovery")
        except FileNotFoundError:
            print("  ⚠ cloudflared not installed — tunnel disabled")
        except Exception as e:
            print(f"  ⚠ Tunnel error: {e}")

    def _get_cloud_user_id(self) -> str:
        """Get user_id for cloud ops: prefer browser Clerk login, fallback to env."""
        if self.clerk_user_id:
            return self.clerk_user_id
        from .cli import _get_user_id
        return _get_user_id() or os.environ.get("WELIAN_USER_TOKEN", "")

    def _fetch_cloud_contacts(self) -> list:
        """Fetch contacts from cloud KV."""
        import urllib.request

        cloud_url = os.environ.get("WELIAN_CLOUD_URL", "https://api.welian.app")
        user_id = self._get_cloud_user_id()
        sync_secret = os.environ.get("WELIAN_SYNC_SECRET", "")
        if not user_id or not sync_secret:
            return []

        sync_token = f"{user_id}:{sync_secret}"
        req = urllib.request.Request(
            f"{cloud_url}/data/pull",
            headers={"Authorization": f"Bearer {sync_token}", "User-Agent": "welian-agent/1.0"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
        return data.get("contacts", [])

    def _push_cloud_contacts(self, contacts: list):
        """Push contacts to cloud KV."""
        import urllib.request

        cloud_url = os.environ.get("WELIAN_CLOUD_URL", "https://api.welian.app")
        user_id = self._get_cloud_user_id()
        sync_secret = os.environ.get("WELIAN_SYNC_SECRET", "")
        if not user_id or not sync_secret:
            print("  Cloud push skipped — no credentials")
            return

        sync_token = f"{user_id}:{sync_secret}"
        payload = json.dumps({"contacts": contacts}).encode("utf-8")
        req = urllib.request.Request(
            f"{cloud_url}/data/push",
            data=payload,
            headers={
                "Authorization": f"Bearer {sync_token}",
                "Content-Type": "application/json",
                "User-Agent": "welian-agent/1.0",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            json.loads(resp.read())
        print(f"  Cloud push: {len(contacts)} contacts → cloud ({user_id})")

    def _xlsx_to_csv(self, file_path: str, filename: str) -> str:
        """Convert xlsx/xls to CSV file. Returns new file path."""
        import tempfile
        from pathlib import Path

        tmp_dir = Path(tempfile.gettempdir()) / "welian-devin-import"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        csv_path = tmp_dir / f"converted-{uuid.uuid4().hex[:8]}.csv"

        lower = filename.lower()
        if lower.endswith('.xlsx'):
            import openpyxl
            wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
            ws = wb.active
            with open(csv_path, 'w', encoding='utf-8-sig', newline='') as f:
                import csv
                writer = csv.writer(f)
                for row in ws.iter_rows(values_only=True):
                    writer.writerow(['' if c is None else str(c) for c in row])
            wb.close()
        elif lower.endswith('.xls'):
            import xlrd
            wb = xlrd.open_workbook(file_path)
            ws = wb.sheet_by_index(0)
            with open(csv_path, 'w', encoding='utf-8-sig', newline='') as f:
                import csv
                writer = csv.writer(f)
                for row_idx in range(ws.nrows):
                    writer.writerow([str(ws.cell_value(row_idx, col_idx)) for col_idx in range(ws.ncols)])
        else:
            return file_path

        return str(csv_path)

    def _import_via_devin(self, file_path: str, filename: str) -> dict:
        """Use Devin CLI (GLM) to extract contacts from an uploaded file.

        Converts xlsx/xls to CSV first (Devin reads text, not binary).
        Returns {"contacts": [...]} or {"error": "..."}.
        """
        import subprocess
        import tempfile
        from pathlib import Path

        # Convert spreadsheet files to CSV (Devin reads text, not binary)
        lower_name = filename.lower()
        is_image = lower_name.endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'))

        devin_cfg = self.agent_config.get("devin", {})
        work_dir = devin_cfg.get("work_dir") or str(Path.home())
        permission = devin_cfg.get("permission_mode", "dangerous")
        model = devin_cfg.get("model", "")
        timeout = int(devin_cfg.get("timeout", 600))

        if is_image:
            prompt = f"""请识别这张名片图片中的联系人信息。

文件路径：{file_path}

要求：
1. 用 read 工具读取图片，识别名片上的文字信息
2. 提取以下字段（有就填，没有留空）：
   - name: 姓名（必须有，否则跳过）
   - company: 公司
   - title: 职位
   - phone: 电话
   - email: 邮箱
   - notes: 备注（地址、行业等其他信息）
3. 只输出 JSON 数组，不要其他文字
4. 格式：[{{"name":"张三","company":"腾讯","title":"产品经理","phone":"13800138000","email":"zhangsan@qq.com","notes":"深圳市南山区"}}]"""
        else:
            prompt = f"""请解析文件 {filename}，提取其中的所有联系人信息。

文件路径：{file_path}

要求：
1. 用 read 工具读取文件内容。如果是 xlsx/xls 等表格文件，可以用 shell 工具（如 python3 + openpyxl）读取
2. 每个联系人提取以下字段（有就填，没有留空）：
   - name: 姓名（必须有，否则跳过）
   - relation: 关系
   - company: 公司
   - title: 职位
   - phone: 电话
   - email: 邮箱
   - notes: 备注
3. 跳过表头、空行、明显不是联系人的行
4. 只输出 JSON 数组，不要其他文字
5. 格式：[{{"name":"张三","relation":"同事","company":"腾讯","title":"产品经理","phone":"13800138000","email":"zhangsan@qq.com","notes":""}}]"""

        tmp_dir = Path(tempfile.gettempdir()) / "welian-devin-import"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        prompt_file = tmp_dir / f"prompt-{uuid.uuid4().hex[:8]}.txt"
        prompt_file.write_text(prompt, encoding="utf-8")
        export_file = tmp_dir / f"export-{uuid.uuid4().hex[:8]}.json"

        cmd = [
            "devin",
            "--permission-mode", permission,
            "-p",
            "--prompt-file", str(prompt_file),
            "--export", str(export_file),
        ]
        if model:
            cmd.extend(["--model", model])

        try:
            result = subprocess.run(
                cmd, cwd=work_dir, capture_output=True, text=True,
                timeout=timeout, env={**os.environ, "NO_AUTO_UPDATE": "true"},
            )
            reply = result.stdout.strip() if result.stdout else ""
            if result.returncode != 0 and not reply:
                return {"error": f"Devin CLI 错误：{result.stderr.strip()[:300]}"}
        except subprocess.TimeoutExpired:
            return {"error": f"Devin CLI 执行超时（{timeout}s）"}
        except FileNotFoundError:
            return {"error": "未找到 devin 命令"}
        except Exception as e:
            return {"error": f"执行出错：{str(e)[:200]}"}
        finally:
            prompt_file.unlink(missing_ok=True)
            export_file.unlink(missing_ok=True)

        # Extract JSON array from reply
        import re
        json_match = re.search(r'\[[\s\S]*\]', reply)
        if json_match:
            try:
                contacts = json.loads(json_match.group(0))
                if isinstance(contacts, list):
                    return {"contacts": contacts}
            except json.JSONDecodeError:
                pass
        return {"error": f"未能从 Devin 输出中提取联系人 JSON。输出前500字：{reply[:500]}"}

    def _chat_via_devin(self, text: str) -> str:
        """Route chat through Devin CLI directly (not via agent_bridge).

        Calls `devin` CLI with Welian chat prompt from prompts/chat.md.
        No WeChat bot prompt injection — clean Devin CLI invocation.
        Config from agent.devin section of welian.yaml.
        """
        import subprocess
        import tempfile
        from pathlib import Path

        devin_cfg = self.agent_config.get("devin", {})
        work_dir = devin_cfg.get("work_dir") or str(Path.home())
        permission = devin_cfg.get("permission_mode", "dangerous")
        model = devin_cfg.get("model", "")
        timeout = int(devin_cfg.get("timeout", 3600))  # default 60 min for long tasks

        # Load Welian chat prompt (same as edge.py)
        system_prompt = self.edge._load_prompt("chat", "")
        full_prompt = f"{system_prompt}\n\n用户消息：{text}" if system_prompt else text

        # Write prompt to temp file (Devin CLI reads from --prompt-file)
        tmp_dir = Path(tempfile.gettempdir()) / "welian-devin-direct"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        prompt_file = tmp_dir / f"prompt-{uuid.uuid4().hex[:8]}.txt"
        prompt_file.write_text(full_prompt, encoding="utf-8")
        export_file = tmp_dir / f"export-{uuid.uuid4().hex[:8]}.json"

        cmd = [
            "devin",
            "--permission-mode", permission,
            "-p",
            "--prompt-file", str(prompt_file),
            "--export", str(export_file),
        ]
        if model:
            cmd.extend(["--model", model])

        # Resume previous session if exists
        if hasattr(self, "_devin_direct_session_id") and self._devin_direct_session_id:
            cmd.extend(["-r", self._devin_direct_session_id])

        try:
            result = subprocess.run(
                cmd, cwd=work_dir, capture_output=True, text=True,
                timeout=timeout, env={**os.environ, "NO_AUTO_UPDATE": "true"},
            )
            reply = result.stdout.strip() if result.stdout else ""
            if result.returncode != 0 and not reply:
                reply = f"Devin CLI 错误：{result.stderr.strip()[:200]}"
        except subprocess.TimeoutExpired:
            reply = f"⏰ Devin CLI 执行超时（{timeout}s）"
        except FileNotFoundError:
            reply = "❌ 未找到 devin 命令，请确认已安装并在 PATH 中"
        except Exception as e:
            reply = f"❌ 执行出错：{str(e)[:200]}"
        finally:
            # Save session ID for resume
            try:
                if export_file.exists():
                    export_data = json.loads(export_file.read_text("utf-8"))
                    sid = export_data.get("session_id", "")
                    if sid:
                        self._devin_direct_session_id = sid
            except Exception:
                pass
            prompt_file.unlink(missing_ok=True)
            export_file.unlink(missing_ok=True)

        if len(reply) > 3000:
            reply = reply[:2990] + "\n…(截断)"
        return reply

    def _devin_direct(self, text: str, websocket=None, req_id: str = "", file_info=None) -> str:
        """Direct Devin CLI passthrough — user message goes to Devin as-is.

        No Welian system prompt, no intent parsing, no data context.
        Pure terminal-like Devin CLI invocation.

        If file_info is provided, saves file to temp path and includes it in prompt.
        If websocket is provided, streams output chunks in real-time:
        sends {type: 'stream', id: req_id, chunk: '...'} for each chunk.
        Final return value is the complete reply.
        """
        import subprocess
        import tempfile
        import threading
        import base64 as b64mod
        from pathlib import Path

        devin_cfg = self.agent_config.get("devin", {})
        work_dir = devin_cfg.get("work_dir") or str(Path.home())
        permission = devin_cfg.get("permission_mode", "dangerous")
        model = devin_cfg.get("model", "")
        timeout = int(devin_cfg.get("timeout", 3600))  # default 60 min for long tasks

        tmp_dir = Path(tempfile.gettempdir()) / "welian-devin-direct"
        tmp_dir.mkdir(parents=True, exist_ok=True)

        # Save attached file to temp dir
        saved_file_path = None
        if file_info and file_info.get("base64"):
            try:
                safe_name = (file_info.get("filename") or "upload").replace("/", "_").replace("\\", "_")
                saved_file_path = tmp_dir / f"file-{uuid.uuid4().hex[:8]}-{safe_name}"
                saved_file_path.write_bytes(b64mod.b64decode(file_info["base64"]))
                print(f"  Saved attached file: {saved_file_path} ({saved_file_path.stat().st_size} bytes)")
            except Exception as e:
                print(f"  File save error: {e}")
                saved_file_path = None

        # Build prompt: include file reference if attached
        prompt_text = text
        if saved_file_path:
            file_hint = f"\n\n[附件] 文件路径：{saved_file_path}\n请用 read 工具读取这个文件的内容，然后根据用户的消息处理。"
            prompt_text = (text + file_hint) if text else f"请读取文件 {saved_file_path} 的内容并分析。"

        prompt_file = tmp_dir / f"prompt-{uuid.uuid4().hex[:8]}.txt"
        prompt_file.write_text(prompt_text, encoding="utf-8")
        export_file = tmp_dir / f"export-{uuid.uuid4().hex[:8]}.json"

        cmd = [
            "devin",
            "--permission-mode", permission,
            "-p",
            "--prompt-file", str(prompt_file),
            "--export", str(export_file),
        ]
        if model:
            cmd.extend(["--model", model])

        # Use a separate session ID namespace for direct mode
        if hasattr(self, "_devin_passthrough_session_id") and self._devin_passthrough_session_id:
            cmd.extend(["-r", self._devin_passthrough_session_id])

        # Stream chunks via websocket (thread-safe send)
        loop = asyncio.new_event_loop() if websocket else None

        def send_chunk(chunk):
            if not websocket or not chunk:
                return
            try:
                msg = json.dumps({"type": "stream", "id": req_id, "chunk": chunk}, ensure_ascii=False)
                if hasattr(websocket, 'send'):
                    # websockets library (async)
                    asyncio.run_coroutine_threadsafe(websocket.send(msg), self._ws_loop)
                elif hasattr(websocket, 'send_json'):
                    # aiohttp WebSocketResponse (sync in aiohttp context)
                    websocket.send_json(json.loads(msg))
            except Exception:
                pass

        try:
            proc = subprocess.Popen(
                cmd, cwd=work_dir,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, env={**os.environ, "NO_AUTO_UPDATE": "true"},
            )

            chunks = []
            try:
                while True:
                    line = proc.stdout.readline()
                    if not line and proc.poll() is not None:
                        break
                    if line:
                        chunks.append(line)
                        send_chunk(line)
            except Exception:
                pass

            try:
                proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
                timeout_msg = f"\n⏰ Devin CLI 执行超时（{timeout}s），已中断"
                chunks.append(timeout_msg)
                send_chunk(timeout_msg)

            reply = "".join(chunks).strip()
            if proc.returncode != 0 and not reply:
                stderr = proc.stderr.read().strip() if proc.stderr else ""
                reply = f"Devin CLI 错误：{stderr[:200]}"
        except FileNotFoundError:
            reply = "❌ 未找到 devin 命令，请确认已安装并在 PATH 中"
        except Exception as e:
            reply = f"❌ 执行出错：{str(e)[:200]}"
        finally:
            try:
                if export_file.exists():
                    export_data = json.loads(export_file.read_text("utf-8"))
                    sid = export_data.get("session_id", "")
                    if sid:
                        self._devin_passthrough_session_id = sid
            except Exception:
                pass
            prompt_file.unlink(missing_ok=True)
            export_file.unlink(missing_ok=True)
            if saved_file_path:
                saved_file_path.unlink(missing_ok=True)

        if len(reply) > 20000:
            # Keep head + tail to preserve file paths that often appear at the end
            reply = reply[:15000] + "\n…(中间截断)…\n" + reply[-4990:]
        return reply

    async def process_command(self, msg: dict, websocket=None) -> dict:
        """Process a command from the browser and return a response.

        If websocket is provided and command supports streaming,
        intermediate chunks are sent via websocket during execution.
        """
        cmd = msg.get("cmd")
        req_id = msg.get("id", "")

        try:
            if cmd == "chat":
                text = msg.get("text", "")
                file_info = msg.get("file")  # {base64, filename, media_type, is_image}
                engine = self.agent_config.get("engine", "edge")
                if engine == "devin":
                    # engine=devin: stream Devin CLI output chunks via websocket
                    reply = await asyncio.get_event_loop().run_in_executor(
                        None, self._devin_direct, text, websocket, req_id, file_info)
                else:
                    reply = await asyncio.get_event_loop().run_in_executor(
                        None, self.edge.chat, text, file_info)
                return {"type": "response", "id": req_id, "reply": reply}

            elif cmd == "devin_direct":
                # Direct Devin CLI passthrough — no Welian prompt, no intent, no data context
                # User's message goes straight to Devin CLI as-is
                text = msg.get("text", "")
                file_info = msg.get("file")
                reply = await asyncio.get_event_loop().run_in_executor(
                    None, self._devin_direct, text, websocket, req_id, file_info)
                return {"type": "response", "id": req_id, "reply": reply}

            elif cmd == "context":
                # Return edge data context without calling LLM (cloud-first mode)
                text = msg.get("text", "")
                ctx = await asyncio.get_event_loop().run_in_executor(
                    None, self.edge.get_context, text)
                return {"type": "response", "id": req_id, "data": ctx}

            elif cmd == "search":
                # Search contacts by keywords (two-step LLM flow step 2)
                keywords = msg.get("keywords", [])
                contact_name = msg.get("contact_name", "")
                intent = msg.get("intent", "")
                ctx = await asyncio.get_event_loop().run_in_executor(
                    None, self.edge.search_contacts, keywords, contact_name, intent)
                return {"type": "response", "id": req_id, "data": ctx}

            elif cmd == "read_file":
                # Read a local file and return as base64 (for PDF download from chat)
                import base64 as _b64
                from pathlib import Path
                file_path = msg.get("path", "")
                if not file_path:
                    return {"type": "error", "id": req_id, "message": "missing path"}
                try:
                    p = Path(file_path).expanduser()
                    if not p.exists():
                        return {"type": "error", "id": req_id, "message": f"file not found: {file_path}"}
                    if p.stat().st_size > 50 * 1024 * 1024:
                        return {"type": "error", "id": req_id, "message": "file too large (>50MB)"}
                    content = p.read_bytes()
                    return {
                        "type": "response", "id": req_id,
                        "content": _b64.b64encode(content).decode("ascii"),
                        "filename": p.name,
                        "size": len(content),
                    }
                except Exception as e:
                    return {"type": "error", "id": req_id, "message": str(e)[:200]}

            elif cmd == "save_turn":
                # Save conversation turn after web-side LLM generates reply
                text = msg.get("text", "")
                reply = msg.get("reply", "")
                await asyncio.get_event_loop().run_in_executor(
                    None, self.edge.save_turn, text, reply)
                return {"type": "response", "id": req_id, "ok": True}

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

            elif cmd == "pdf":
                # Generate PDF directly via pdf-sandbox module (no HTTP service needed)
                # msg: {cmd: 'pdf', type: 'weekly|monthly|signals', report: {...}}
                import base64 as _b64
                import importlib
                import sys as _sys
                from pathlib import Path

                report_type = msg.get("type", "")
                report = msg.get("report", {})
                if not report:
                    return {"type": "error", "id": req_id, "message": "missing report"}

                try:
                    # Import pdf-sandbox server module directly
                    pdf_sandbox_dir = Path.home() / "devin" / "pdf-sandbox"
                    if str(pdf_sandbox_dir) not in _sys.path:
                        _sys.path.insert(0, str(pdf_sandbox_dir))
                    server = importlib.import_module("server")
                    styles = server._build_styles()

                    if report_type == "weekly":
                        pdf_bytes = server.build_weekly_pdf(report, styles)
                    elif report_type == "monthly":
                        pdf_bytes = server.build_monthly_pdf(report, styles)
                    elif report_type == "signals":
                        pdf_bytes = server.build_signals_pdf(report, styles)
                    else:
                        return {"type": "error", "id": req_id, "message": f"unknown type: {report_type}"}

                    return {
                        "type": "response", "id": req_id,
                        "pdf": _b64.b64encode(pdf_bytes).decode("ascii"),
                        "filename": f"welian_{report_type}_{datetime.now().strftime('%Y%m%d')}.pdf",
                    }
                except ImportError as e:
                    return {"type": "error", "id": req_id, "message": f"pdf-sandbox module not found: {e}"}
                except Exception as e:
                    return {"type": "error", "id": req_id, "message": f"PDF error: {e}"}

            elif cmd == "agent_config":
                # Get or set agent engine config (edge | devin + devin params)
                action = msg.get("action", "get")
                if action == "get":
                    return {"type": "response", "id": req_id, "data": self.agent_config}
                elif action == "set":
                    updates = msg.get("config", {})
                    self.agent_config = _merge_agent_config(self.agent_config, updates)
                    # Persist to config/welian.yaml so it survives restarts
                    _save_agent_config(self.agent_config)
                    # Apply to agent_bridge if loaded
                    if self._devin_bridge is not None:
                        _apply_devin_env(self.agent_config.get("devin", {}))
                    return {"type": "response", "id": req_id, "ok": True, "data": self.agent_config}
                else:
                    return {"type": "error", "id": req_id, "message": f"Unknown action: {action}"}

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

        # Heartbeat task — sends ping every 30s to keep connection alive during long tasks
        async def heartbeat():
            try:
                while True:
                    await asyncio.sleep(30)
                    await websocket.send(json.dumps({"type": "ping"}))
            except (websockets.exceptions.ConnectionClosed, asyncio.CancelledError):
                pass

        heartbeat_task = asyncio.create_task(heartbeat())

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
                # Ignore pong replies from browser
                if msg.get("type") == "pong":
                    continue
                response = await self.process_command(msg, websocket=websocket)
                await websocket.send(json.dumps(response, ensure_ascii=False))
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            heartbeat_task.cancel()
            self.connected_clients.discard(websocket)
            print(f"  Browser disconnected ({len(self.connected_clients)} active)")

    async def start(self):
        """Start HTTP + WebSocket server."""
        from aiohttp import web
        import socket

        # ── Sentry monitoring (opt-in via SENTRY_DSN env var) ──
        sentry_dsn = os.environ.get("SENTRY_DSN", "")
        if sentry_dsn:
            try:
                import sentry_sdk
                sentry_sdk.init(
                    dsn=sentry_dsn,
                    environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
                    traces_sample_rate=0.0,  # disable performance tracing (local agent)
                    attach_stack_trace=True,
                )
                print(f"  Sentry: enabled (env={os.environ.get('SENTRY_ENVIRONMENT', 'production')})")
            except ImportError:
                print("  ⚠ Sentry DSN set but sentry-sdk not installed — pip install sentry-sdk")
            except Exception as e:
                print(f"  ⚠ Sentry init failed: {e}")

        self._ws_loop = asyncio.get_event_loop()  # for cross-thread WS sends

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
            ws_server = web.WebSocketResponse(heartbeat=30.0)
            await ws_server.prepare(request)

            # Auth
            try:
                raw = await asyncio.wait_for(ws_server.receive(), timeout=10)
                if raw.data is None:
                    await ws_server.close()
                    return ws_server
                msg = json.loads(raw.data)

                if msg.get("type") != "auth" or msg.get("token") != self.pairing_token:
                    await ws_server.send_json({
                        "type": "error",
                        "message": "Authentication failed. Check pairing token."
                    })
                    await ws_server.close()
                    return ws_server

                # Save Clerk user_id from browser for cloud operations
                clerk_uid = msg.get("clerk_uid", "")
                if clerk_uid:
                    self.clerk_user_id = clerk_uid
                    print(f"✓ Clerk user: {clerk_uid}")

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
                    if raw_msg.data is None:
                        continue
                    try:
                        msg = json.loads(raw_msg.data)
                    except json.JSONDecodeError:
                        await ws_server.send_json({
                            "type": "error",
                            "message": "Invalid JSON"
                        })
                        continue
                    response = await self.process_command(msg, websocket=ws_server)
                    await ws_server.send_json(response)
            except Exception as e:
                print(f"  WS error: {e}")
            finally:
                self.connected_clients.discard(ws_server)
                print(f"  Browser disconnected ({len(self.connected_clients)} active)")

            return ws_server

        async def import_handler(request):
            """POST /ai/import — file upload, Devin CLI (GLM) extracts contacts."""
            import base64 as b64mod
            import tempfile
            from pathlib import Path

            CORS_HDR = {"Access-Control-Allow-Origin": "*"}

            try:
                body = await request.json()
            except Exception:
                return web.json_response({"error": "Invalid JSON"}, status=400)

            base64_data = body.get("base64", "")
            filename = body.get("filename", "upload")
            if not base64_data:
                return web.json_response({"error": "No file data"}, status=400)

            # Save uploaded file to temp dir
            tmp_dir = Path(tempfile.gettempdir()) / "welian-devin-import"
            tmp_dir.mkdir(parents=True, exist_ok=True)
            safe_name = filename.replace("/", "_").replace("\\", "_")
            file_path = tmp_dir / f"upload-{uuid.uuid4().hex[:8]}-{safe_name}"

            try:
                file_path.write_bytes(b64mod.b64decode(base64_data))
            except Exception as e:
                return web.json_response({"error": f"File decode error: {e}"}, status=400)

            print(f"  Import request: {filename} ({file_path.stat().st_size} bytes)")

            # Run Devin CLI in thread (blocking subprocess)
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None, self._import_via_devin, str(file_path), filename
            )

            # Clean up temp file
            file_path.unlink(missing_ok=True)

            if "error" in result:
                print(f"  Import failed: {result['error'][:100]}")
                return web.json_response(result, status=500)

            contacts = result.get("contacts", [])
            print(f"  Import extracted {len(contacts)} contacts")

            # Dedup + save to CLOUD (not local) — cloud is source of truth
            loop = asyncio.get_event_loop()
            existing = await loop.run_in_executor(None, self._fetch_cloud_contacts)

            existing_names = {c.get("name", "") for c in existing}
            imported = 0
            skipped = 0
            for c in contacts:
                name = (c.get("name", "") or "").strip()
                if not name:
                    skipped += 1
                    continue
                if name in existing_names:
                    skipped += 1
                    continue
                from .models import create_contact
                notes_parts = [c.get("notes", "")]
                if c.get("phone"): notes_parts.append(f"📱 {c['phone']}")
                if c.get("email"): notes_parts.append(f"✉️ {c['email']}")
                existing.append(create_contact(
                    name=name,
                    relation=c.get("relation", ""),
                    company=c.get("company", ""),
                    title=c.get("title", ""),
                    notes="\n".join(filter(None, notes_parts)) or "",
                ))
                existing_names.add(name)
                imported += 1

            if imported > 0:
                await loop.run_in_executor(None, self._push_cloud_contacts, existing)

            return web.json_response({"imported": imported, "skipped": skipped, "total": len(contacts), "extracted_names": [c.get("name","") for c in contacts[:5]]})

        async def cors_options_handler(request):
            """Handle CORS preflight for all routes."""
            return web.Response(headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            })

        @web.middleware
        async def cors_middleware(request, handler):
            """Add CORS headers + capture exceptions to Sentry."""
            if request.method == "OPTIONS":
                return web.Response(headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization",
                })
            try:
                response = await handler(request)
                response.headers["Access-Control-Allow-Origin"] = "*"
                return response
            except Exception as e:
                # Capture in Sentry (no-op if not initialized)
                try:
                    import sentry_sdk
                    sentry_sdk.capture_exception(e)
                except ImportError:
                    pass
                raise

        app = web.Application(middlewares=[cors_middleware])
        app.router.add_get("/", index_handler)
        app.router.add_get("/health", health_handler)
        app.router.add_get("/ws", ws_handler)
        app.router.add_post("/ai/import", import_handler)

        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "0.0.0.0", self.port)
        await site.start()

        # Start background data sync to cloud (full cloud mode)
        asyncio.create_task(self._sync_loop())

        await asyncio.Future()  # run forever

    async def _sync_loop(self):
        """Periodically pull cloud data to local (one-way: cloud → edge).

        Uses clerk_uid from browser WS auth (dynamic), falls back to env.
        """
        import urllib.request
        from .engine import get_store

        cloud_url = os.environ.get("WELIAN_CLOUD_URL", "https://api.welian.app")
        sync_secret = os.environ.get("WELIAN_SYNC_SECRET", "")

        if not sync_secret:
            print("  ⚠ Cloud pull skipped — WELIAN_SYNC_SECRET not set")
            return

        def _pull_from_cloud(uid, token):
            """Pull full datasets from cloud and overwrite local files."""
            req = urllib.request.Request(
                f"{cloud_url}/data/pull",
                headers={
                    "Authorization": f"Bearer {token}",
                    "User-Agent": "welian-agent/1.0",
                },
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())

            store = get_store()
            for name in ("contacts", "timeline", "todos"):
                items = data.get(name, [])
                if items:
                    store.save(name, items)

            return len(data.get("contacts", [])), len(data.get("todos", [])), len(data.get("timeline", []))

        # Pull immediately on startup, then every 30 minutes
        while True:
            user_id = self._get_cloud_user_id()
            if not user_id or len(user_id) < 10:
                print("  ⚠ Cloud pull skipped — no user_id (waiting for browser login)")
                await asyncio.sleep(60)
                continue

            sync_token = f"{user_id}:{sync_secret}"
            try:
                nc, nt, ntl = await asyncio.get_event_loop().run_in_executor(
                    None, _pull_from_cloud, user_id, sync_token)
                print(f"  ☁ Cloud pull ({user_id[:20]}): {nc} contacts, {nt} todos, {ntl} timeline → local")
            except Exception as e:
                print(f"  ⚠ Cloud pull failed: {e}")
            await asyncio.sleep(1800)  # 30 minutes


