"""Welian WeChat bot — production-grade edge bridge.

Architecture (SPEC §7.1):
  WeChat user → OpeniLink Hub → Bot (edge) → EdgeClient (local) → [LLM]
                ↑ all data stays here           ↑ only minimal context to LLM

Features:
  - Auto-reconnect with exponential backoff
  - Per-user session management (data isolation)
  - Message queue for reliability
  - Heartbeat/ping keep-alive
  - Slash commands (/help, /status, /reset, /who)
  - Long message splitting
  - Structured logging with rotation
  - Graceful shutdown
"""
import json
import os
import asyncio
import logging
import logging.handlers
import time
import hashlib
from pathlib import Path
from typing import Optional, Dict

import websockets

from ..edge import EdgeClient

# ── Config ──

HUB_URL = os.environ.get("WELIAN_HUB_URL", "ws://localhost:9800")
HUB_HTTP = os.environ.get("WELIAN_HUB_HTTP", "http://localhost:9800")
BOT_ID = os.environ.get("WELIAN_BOT_ID", "welian-bot")
APP_TOKEN = os.environ.get("WELIAN_BOT_APP_TOKEN", "")
SESSION_TOKEN = os.environ.get("WELIAN_BOT_SESSION_TOKEN", "")
CLOUD_URL = os.environ.get("WELIAN_CLOUD_URL", "")

MAX_MSG_LEN = 2000       # WeChat text message limit (safe margin)
MAX_RETRIES = 5          # Max reconnect attempts before long backoff
HEARTBEAT_INTERVAL = 30  # seconds between ping frames
MSG_TIMEOUT = 120        # seconds to wait for edge processing

WELIAN_HOME = Path(os.environ.get("WELIAN_HOME", os.path.expanduser("~/.welian")))
LOG_DIR = WELIAN_HOME / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# ── Logging ──

logger = logging.getLogger("welian.bot")
logger.setLevel(logging.DEBUG)

_file_handler = logging.handlers.RotatingFileHandler(
    LOG_DIR / "bot.log", maxBytes=2_000_000, backupCount=5, encoding="utf-8",
)
_file_handler.setFormatter(logging.Formatter(
    "%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S",
))
_file_handler.setLevel(logging.DEBUG)
logger.addHandler(_file_handler)

_console_handler = logging.StreamHandler()
_console_handler.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
_console_handler.setLevel(logging.INFO)
logger.addHandler(_console_handler)


# ── Per-user session management ──

class SessionManager:
    """Manages per-WeChat-user EdgeClient instances with data isolation.

    Each WeChat user gets their own data directory under ~/.welian/users/<hash>/.
    This ensures multiple WeChat users can share one bot instance without
    seeing each other's data.
    """

    def __init__(self):
        self._clients: Dict[str, EdgeClient] = {}
        self._lock = asyncio.Lock()

    def _user_data_dir(self, wechat_user_id: str) -> str:
        """Hash the WeChat user ID to create a stable, private directory."""
        h = hashlib.sha256(wechat_user_id.encode()).hexdigest()[:16]
        d = WELIAN_HOME / "users" / h
        d.mkdir(parents=True, exist_ok=True)
        return str(d)

    async def get_client(self, wechat_user_id: str) -> EdgeClient:
        """Get or create an EdgeClient for a WeChat user."""
        async with self._lock:
            if wechat_user_id not in self._clients:
                data_dir = self._user_data_dir(wechat_user_id)
                os.environ["WELIAN_HOME"] = data_dir  # edge engine reads this
                # Re-import engine to pick up new WELIAN_HOME
                from .. import engine
                engine._init_paths()
                client = EdgeClient(cloud_url=CLOUD_URL, user_id=wechat_user_id)
                self._clients[wechat_user_id] = client
                logger.info(f"Created EdgeClient for user {wechat_user_id[:8]}... → {data_dir}")
            return self._clients[wechat_user_id]

    def reset_client(self, wechat_user_id: str):
        """Reset a user's session (e.g. via /reset command)."""
        if wechat_user_id in self._clients:
            del self._clients[wechat_user_id]
            logger.info(f"Reset session for user {wechat_user_id[:8]}...")

    def stats(self) -> dict:
        return {
            "active_users": len(self._clients),
            "cloud_url": CLOUD_URL or "(offline)",
        }


sessions = SessionManager()


# ── Message sending ──

async def send_via_hub(text: str, context_token: str = "") -> bool:
    """Send a text message to the current chat via OpeniLink Hub HTTP API."""
    if not APP_TOKEN:
        logger.warning("WELIAN_BOT_APP_TOKEN not set, cannot send")
        return False
    try:
        body = json.dumps({"text": text, "context_token": context_token})
        resp = await asyncio.to_thread(
            _http_post,
            f"{HUB_HTTP}/api/bots/{BOT_ID}/send",
            body,
            {"Cookie": f"session={SESSION_TOKEN}", "Content-Type": "application/json"},
        )
        ok = resp.get("ok", False)
        if not ok:
            logger.error(f"Hub send failed: {resp}")
        return ok
    except Exception as e:
        logger.error(f"Hub send error: {e}")
        return False


def _http_post(url: str, body: str, headers: dict) -> dict:
    """Synchronous HTTP POST (run in thread via asyncio.to_thread)."""
    import urllib.request
    req = urllib.request.Request(url, data=body.encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


async def send_long_message(text: str, context_token: str = ""):
    """Split long messages and send each part via Hub."""
    if len(text) <= MAX_MSG_LEN:
        await send_via_hub(text, context_token)
        return

    # Split on newlines first, then hard-split
    parts = []
    for paragraph in text.split("\n\n"):
        while len(paragraph) > MAX_MSG_LEN:
            parts.append(paragraph[:MAX_MSG_LEN])
            paragraph = paragraph[MAX_MSG_LEN:]
        parts.append(paragraph)

    # Merge small parts
    merged = []
    buf = ""
    for p in parts:
        if len(buf) + len(p) + 2 <= MAX_MSG_LEN:
            buf = (buf + "\n\n" + p) if buf else p
        else:
            if buf:
                merged.append(buf)
            buf = p
    if buf:
        merged.append(buf)

    for i, part in enumerate(merged):
        prefix = f"[{i+1}/{len(merged)}] " if len(merged) > 1 else ""
        await send_via_hub(prefix + part, context_token)
        if i < len(merged) - 1:
            await asyncio.sleep(0.5)  # avoid rate limit


# ── Slash commands ──

async def handle_command(text: str, user_id: str, context_token: str) -> bool:
    """Handle slash commands. Returns True if handled."""
    if not text.startswith("/"):
        return False

    cmd = text.strip().lower()
    logger.info(f"Command from {user_id[:8]}...: {cmd}")

    if cmd in ("/help", "/h", "/？", "/?"):
        await send_via_hub(
            "Welian 命令：\n"
            "  /help — 显示帮助\n"
            "  /status — 查看状态\n"
            "  /who — 该联系谁\n"
            "  /reset — 重置会话\n\n"
            "直接发消息即可与 Welian 对话：\n"
            "  · \"记一下：和张总聊了预算\"\n"
            "  · \"该联系谁\"\n"
            "  · \"给张总拟条消息\"\n"
            "  · \"月度回顾\"",
            context_token,
        )
    elif cmd == "/status":
        s = sessions.stats()
        await send_via_hub(
            f"Welian Bot 状态 ✅\n"
            f"  活跃用户：{s['active_users']}\n"
            f"  AI 模式：{s['cloud_url']}\n"
            f"  Hub：{HUB_URL}",
            context_token,
        )
    elif cmd == "/who":
        client = await sessions.get_client(user_id)
        reply = client._handle_ask()
        await send_long_message(reply, context_token)
    elif cmd == "/reset":
        sessions.reset_client(user_id)
        await send_via_hub("会话已重置 ✅ 重新开始吧～", context_token)
    else:
        await send_via_hub(f"未知命令：{cmd}\n输入 /help 查看可用命令", context_token)

    return True


# ── Message processing ──

async def process_message(user_id: str, text: str, context_token: str = ""):
    """Process a user message: route to command or edge client."""
    # Handle slash commands first
    if await handle_command(text, user_id, context_token):
        return

    logger.info(f"Message from {user_id[:8]}...: {text[:60]}...")

    # Send "processing" indicator for non-trivial messages
    if len(text) > 10:
        await send_via_hub("⏳ 正在处理...", context_token)

    try:
        client = await sessions.get_client(user_id)
        # Run edge.chat in thread to avoid blocking event loop
        reply = await asyncio.to_thread(client.chat, text)
        if reply:
            await send_long_message(reply, context_token)
        else:
            await send_via_hub("（没有回复，请重试）", context_token)
    except asyncio.TimeoutError:
        await send_via_hub("⏱ 处理超时，请稍后重试", context_token)
        logger.error(f"Timeout processing message from {user_id[:8]}...")
    except Exception as e:
        logger.error(f"Error processing message from {user_id[:8]}...: {e}", exc_info=True)
        await send_via_hub(f"处理出错：{str(e)[:100]}", context_token)


# ── WebSocket bridge ──

class HubBridge:
    """Manages the WebSocket connection to OpeniLink Hub with reconnection."""

    def __init__(self):
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self._reconnect_count = 0
        self._should_run = False
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._message_queue: asyncio.Queue = asyncio.Queue()
        self._processor_task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the bridge — connect, register, and process messages."""
        self._should_run = True
        self._processor_task = asyncio.create_task(self._process_queue())
        logger.info(f"=== Welian Bot starting ===")
        logger.info(f"  Hub: {HUB_URL}")
        logger.info(f"  Bot ID: {BOT_ID}")
        logger.info(f"  Cloud: {CLOUD_URL or '(offline mode)'}")
        logger.info(f"  Data: {WELIAN_HOME}")

        while self._should_run:
            try:
                await self._connect_and_run()
            except Exception as e:
                logger.error(f"Bridge error: {e}", exc_info=True)
            if self._should_run:
                await self._reconnect()

        logger.info("Bot stopped.")

    async def _connect_and_run(self):
        """Connect to Hub, register bot, and listen for messages."""
        ws_url = f"{HUB_URL}/bot/v1/ws?token={APP_TOKEN}"
        logger.info(f"Connecting to {HUB_URL}/bot/v1/ws ...")

        async with websockets.connect(
            ws_url,
            ping_interval=None,  # we handle heartbeat ourselves
            close_timeout=5,
            open_timeout=10,
        ) as ws:
            self.ws = ws
            self._reconnect_count = 0  # reset on successful connect
            logger.info("✓ Connected to Hub")

            # Start heartbeat
            self._heartbeat_task = asyncio.create_task(self._heartbeat(ws))

            # Listen for messages
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                    await self._handle_hub_message(msg)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON from Hub: {raw[:100]}")
                except Exception as e:
                    logger.error(f"Error handling Hub message: {e}", exc_info=True)

    async def _handle_hub_message(self, msg: dict):
        """Handle a message from the Hub."""
        msg_type = msg.get("type")

        if msg_type == "init":
            app_name = msg.get("data", {}).get("app_name", "?")
            logger.info(f"Hub init: app={app_name}")
            return

        if msg_type == "event" and msg.get("event", {}).get("type", "").startswith("message."):
            # Queue message for async processing
            await self._message_queue.put(msg)
            return

        logger.debug(f"Unhandled Hub message type: {msg_type}")

    async def _process_queue(self):
        """Process messages from queue sequentially."""
        while self._should_run:
            try:
                msg = await self._message_queue.get()
                await self._process_hub_event(msg)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Queue processing error: {e}", exc_info=True)

    async def _process_hub_event(self, event: dict):
        """Process a single message event from the Hub."""
        data = event.get("event", {}).get("data", {})
        if not data:
            return

        # Extract text from message items
        text = ""
        if data.get("items"):
            for item in data["items"]:
                if item.get("type") == "text" and item.get("text"):
                    text += item["text"]
        elif data.get("content"):
            text = data["content"]

        if not text:
            logger.debug("Skipping non-text event")
            return

        # Extract user ID and context token
        user_id = data.get("from", data.get("sender", "default"))
        context_token = data.get("context_token", "")

        # Process with timeout
        try:
            await asyncio.wait_for(
                process_message(user_id, text, context_token),
                timeout=MSG_TIMEOUT,
            )
        except asyncio.TimeoutError:
            logger.error(f"Message processing timeout for user {user_id[:8]}...")
            await send_via_hub("⏱ 处理超时", context_token)

    async def _heartbeat(self, ws):
        """Send periodic ping to keep connection alive."""
        while self._should_run:
            try:
                await asyncio.sleep(HEARTBEAT_INTERVAL)
                if ws.open:
                    ws.pong()  # respond to any pending ping
                    logger.debug("Heartbeat sent")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Heartbeat error: {e}")
                break

    async def _reconnect(self):
        """Reconnect with exponential backoff."""
        self._reconnect_count += 1
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            self._heartbeat_task = None

        if self._reconnect_count > MAX_RETRIES:
            wait = 60  # long backoff after many failures
        else:
            wait = min(5 * (2 ** (self._reconnect_count - 1)), 60)

        logger.warning(f"Reconnecting in {wait}s (attempt {self._reconnect_count})...")
        await asyncio.sleep(wait)

    async def stop(self):
        """Gracefully stop the bridge."""
        logger.info("Stopping bot...")
        self._should_run = False
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
        if self._processor_task:
            self._processor_task.cancel()
        if self.ws and self.ws.open:
            await self.ws.close()
        logger.info("Bot stopped.")


# ── Entry point ──

async def run_hub_bridge():
    """Run the OpeniLink Hub WebSocket bridge."""
    if not APP_TOKEN:
        logger.error("WELIAN_BOT_APP_TOKEN not set! Set it in environment.")
        logger.error("  export WELIAN_BOT_APP_TOKEN=app_xxx")
        return

    bridge = HubBridge()

    # Handle graceful shutdown
    loop = asyncio.get_event_loop()

    async def _shutdown():
        await bridge.stop()

    try:
        import signal
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, lambda: asyncio.create_task(_shutdown()))
    except (NotImplementedError, AttributeError):
        pass  # Windows doesn't support add_signal_handler

    await bridge.start()


if __name__ == "__main__":
    asyncio.run(run_hub_bridge())
