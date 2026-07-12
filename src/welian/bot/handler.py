"""Welian WeChat bot — production-grade ilink bridge.

Architecture (SPEC §7.1):
  WeChat user → ilinkai.weixin.qq.com → Bot (edge) → EdgeClient (local) → [LLM]
                ↑ all data stays here           ↑ only minimal context to LLM

Uses WeChat ilink Bot API (HTTP long-polling):
  - getUpdates: long-poll for incoming messages (35s timeout)
  - sendMessage: send reply with rate limiting (2.5s/user)
  - sendTyping: typing indicator

Features:
  - Per-user session management (data isolation)
  - Auto-reconnect on long-poll timeout/failure
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
import hashlib
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional, Dict, List

from ..edge import EdgeClient

# ── Config ──

ILINK_BASE_URL = os.environ.get("WELIAN_ILINK_URL", "https://ilinkai.weixin.qq.com")
BOT_TOKEN = os.environ.get("WELIAN_BOT_TOKEN", "")
CLOUD_URL = os.environ.get("WELIAN_CLOUD_URL", "")

MAX_MSG_LEN = 2000
LONG_POLL_TIMEOUT = 35  # seconds (ilink uses 35s long-poll)
RECONNECT_DELAY = 3     # seconds between failed polls
MAX_RETRIES = 10        # max consecutive failures before long backoff
SEND_INTERVAL = 2.5     # min seconds between sends to same user (rate limit)

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


# ── ilink API client ──

class IlinkApi:
    """WeChat ilink Bot API client (HTTP long-polling)."""

    def __init__(self, token: str, base_url: str = ILINK_BASE_URL):
        self.token = token
        self.base_url = base_url.rstrip("/")
        self._next_send: Dict[str, float] = {}
        self._sync_buf = ""

    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}",
            "AuthorizationType": "ilink_bot_token",
        }

    def _request(self, path: str, body: dict, timeout: float = 15.0) -> dict:
        url = f"{self.base_url}/{path}"
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=self._headers(), method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            logger.error(f"ilink HTTP {e.code}: {err_body[:200]}")
            raise
        except urllib.error.URLError as e:
            logger.error(f"ilink URL error: {e}")
            raise

    def get_updates(self) -> dict:
        """Long-poll for new messages. Returns response with msgs[] and sync_buf."""
        body = {}
        if self._sync_buf:
            body["get_updates_buf"] = self._sync_buf
        resp = self._request("ilink/bot/getupdates", body, timeout=LONG_POLL_TIMEOUT + 10)
        if resp.get("sync_buf"):
            self._sync_buf = resp["sync_buf"]
        return resp

    def send_message(self, to_user_id: str, text: str, context_token: str = "") -> bool:
        """Send a text message to a user. Rate-limited per user."""
        # Rate limiting
        now = time.time()
        next_available = self._next_send.get(to_user_id, 0)
        if now < next_available:
            delay = next_available - now
            logger.debug(f"Rate limit: waiting {delay:.1f}s for {to_user_id[:12]}...")
            time.sleep(delay)

        body = {
            "msg": {
                "from_user_id": "",  # bot's own ID, filled by server
                "to_user_id": to_user_id,
                "client_id": f"welian_{int(now * 1000)}",
                "message_type": 2,  # BOT
                "message_state": 2,  # FINISH
                "context_token": context_token,
                "item_list": [{
                    "type": 1,  # TEXT
                    "text_item": {"text": text},
                }],
            }
        }

        try:
            resp = self._request("ilink/bot/sendmessage", body, timeout=10)
            ret = resp.get("ret", 0)
            if ret == -2:
                # Rate limited by server, back off
                self._next_send[to_user_id] = time.time() + 5
                logger.warning(f"Server rate-limited send to {to_user_id[:12]}...")
                return False
            self._next_send[to_user_id] = time.time() + SEND_INTERVAL
            return ret == 0 or ret is None  # some responses omit ret on success
        except Exception as e:
            logger.error(f"Send failed to {to_user_id[:12]}...: {e}")
            return False

    def send_typing(self, user_id: str, typing_ticket: str, status: int = 1):
        """Send typing indicator."""
        body = {
            "ilink_user_id": user_id,
            "typing_ticket": typing_ticket,
            "status": status,
        }
        try:
            self._request("ilink/bot/sendtyping", body, timeout=10)
        except Exception:
            pass  # typing is best-effort


# ── Per-user session management ──

class SessionManager:
    """Manages per-WeChat-user EdgeClient instances with data isolation."""

    def __init__(self):
        self._clients: Dict[str, EdgeClient] = {}
        self._lock = asyncio.Lock()

    def _user_data_dir(self, wechat_user_id: str) -> Path:
        """Get data directory for a WeChat user.

        For single-user mode (default), uses the main ~/.welian/ directory
        so existing data is accessible. For multi-user mode, set
        WELIAN_MULTI_USER=1 to enable per-user isolation.
        """
        multi_user = os.environ.get("WELIAN_MULTI_USER", "")
        if multi_user.lower() in ("1", "true", "yes"):
            h = hashlib.sha256(wechat_user_id.encode()).hexdigest()[:16]
            d = WELIAN_HOME / "users" / h
            d.mkdir(parents=True, exist_ok=True)
            return d
        # Single-user mode: use main data directory
        return WELIAN_HOME

    async def get_client(self, wechat_user_id: str) -> EdgeClient:
        async with self._lock:
            if wechat_user_id not in self._clients:
                data_dir = self._user_data_dir(wechat_user_id)
                if str(data_dir) != str(WELIAN_HOME):
                    os.environ["WELIAN_HOME"] = str(data_dir)
                    from .. import engine
                    engine._init_paths()
                else:
                    # Reset to main WELIAN_HOME if it was changed
                    os.environ["WELIAN_HOME"] = str(WELIAN_HOME)
                    from .. import engine
                    engine._init_paths()
                client = EdgeClient(cloud_url=CLOUD_URL, user_id=wechat_user_id)
                self._clients[wechat_user_id] = client
                logger.info(f"User session: {wechat_user_id[:12]}... → {data_dir}")
            return self._clients[wechat_user_id]

    def reset(self, wechat_user_id: str):
        if wechat_user_id in self._clients:
            del self._clients[wechat_user_id]
            logger.info(f"Reset session: {wechat_user_id[:12]}...")

    def stats(self) -> dict:
        # Check if LLM is actually available
        try:
            from ..llm.router import get_client
            llm = get_client()
            llm_info = f"✅ {llm.model}" if hasattr(llm, 'model') else "✅ LLM"
        except Exception:
            llm_info = "(no LLM)"
        return {"active_users": len(self._clients), "cloud": llm_info}


sessions = SessionManager()


# ── Message handling ──

async def send_long_message(api: IlinkApi, user_id: str, text: str, context_token: str = ""):
    """Split long messages and send each part."""
    if len(text) <= MAX_MSG_LEN:
        api.send_message(user_id, text, context_token)
        return

    # Split on newlines, then hard-split
    parts = []
    for para in text.split("\n\n"):
        while len(para) > MAX_MSG_LEN:
            parts.append(para[:MAX_MSG_LEN])
            para = para[MAX_MSG_LEN:]
        parts.append(para)

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
        api.send_message(user_id, prefix + part, context_token)
        if i < len(merged) - 1:
            await asyncio.sleep(0.5)


async def handle_command(text: str, user_id: str, api: IlinkApi, context_token: str) -> bool:
    """Handle slash commands. Returns True if handled."""
    if not text.startswith("/"):
        return False

    cmd = text.strip().lower()
    logger.info(f"Command from {user_id[:12]}...: {cmd}")

    if cmd in ("/help", "/h", "/？", "/?"):
        api.send_message(user_id,
            "Welian 命令：\n"
            "  /help — 显示帮助\n"
            "  /status — 查看状态\n"
            "  /who — 该联系谁\n"
            "  /reset — 重置会话\n\n"
            "直接发消息即可对话：\n"
            "  · \"记一下：和张总聊了预算\"\n"
            "  · \"该联系谁\"\n"
            "  · \"给张总拟条消息\"\n"
            "  · \"月度回顾\"",
            context_token,
        )
    elif cmd == "/status":
        s = sessions.stats()
        api.send_message(user_id,
            f"Welian Bot 状态 ✅\n"
            f"  活跃用户：{s['active_users']}\n"
            f"  AI 模式：{s['cloud']}",
            context_token,
        )
    elif cmd == "/who":
        client = await sessions.get_client(user_id)
        reply = await asyncio.to_thread(client._handle_ask)
        await send_long_message(api, user_id, reply, context_token)
    elif cmd == "/reset":
        sessions.reset(user_id)
        api.send_message(user_id, "会话已重置 ✅ 重新开始吧～", context_token)
    else:
        api.send_message(user_id, f"未知命令：{cmd}\n输入 /help 查看可用命令", context_token)

    return True


async def process_message(user_id: str, text: str, api: IlinkApi, context_token: str = ""):
    """Process a user message."""
    if await handle_command(text, user_id, api, context_token):
        return

    logger.info(f"Message from {user_id[:12]}...: {text[:60]}...")

    # Processing indicator for non-trivial messages
    if len(text) > 10:
        api.send_message(user_id, "⏳ 正在处理...", context_token)

    try:
        client = await sessions.get_client(user_id)
        reply = await asyncio.to_thread(client.chat, text)
        if reply:
            await send_long_message(api, user_id, reply, context_token)
        else:
            api.send_message(user_id, "（没有回复，请重试）", context_token)
    except Exception as e:
        logger.error(f"Error processing message: {e}", exc_info=True)
        api.send_message(user_id, f"处理出错：{str(e)[:100]}", context_token)


# ── Extract text from ilink message ──

def extract_text(msg: dict) -> str:
    """Extract text content from an ilink message."""
    items = msg.get("item_list", [])
    texts = []
    for item in items:
        if item.get("type") == 1 and item.get("text_item", {}).get("text"):
            texts.append(item["text_item"]["text"])
        elif item.get("type") == 3 and item.get("voice_item", {}).get("text"):
            # Voice message with transcription
            texts.append(f"[语音] {item['voice_item']['text']}")
    return "\n".join(texts)


# ── Main bot loop ──

class WelianBot:
    """Main bot loop — long-polls ilink for messages and processes them."""

    def __init__(self, token: str):
        self.api = IlinkApi(token)
        self._should_run = False
        self._fail_count = 0

    async def start(self):
        """Start the bot long-poll loop."""
        self._should_run = True
        logger.info("=== Welian Bot starting ===")
        logger.info(f"  ilink: {ILINK_BASE_URL}")
        # Show actual LLM status
        try:
            from ..llm.router import get_client
            llm = get_client()
            llm_name = getattr(llm, 'model', 'unknown')
            logger.info(f"  LLM: ✅ {llm_name}")
        except Exception as e:
            logger.info(f"  LLM: ⚠ {e}")
        logger.info(f"  Data: {WELIAN_HOME}")

        # Handle graceful shutdown
        loop = asyncio.get_event_loop()
        try:
            import signal
            for sig in (signal.SIGINT, signal.SIGTERM):
                loop.add_signal_handler(sig, self.stop)
        except (NotImplementedError, AttributeError):
            pass

        while self._should_run:
            try:
                await self._poll_once()
                self._fail_count = 0
            except asyncio.CancelledError:
                break
            except Exception as e:
                self._fail_count += 1
                wait = min(RECONNECT_DELAY * (2 ** min(self._fail_count - 1, 5)), 60)
                logger.warning(f"Poll error ({e}), retrying in {wait}s (fail #{self._fail_count})")
                await asyncio.sleep(wait)

        logger.info("Bot stopped.")

    def stop(self):
        logger.info("Stopping bot...")
        self._should_run = False

    async def _poll_once(self):
        """Single long-poll cycle."""
        # Run blocking HTTP request in thread
        resp = await asyncio.to_thread(self.api.get_updates)

        msgs = resp.get("msgs", [])
        if not msgs:
            return  # timeout, no messages

        for msg in msgs:
            if not self._should_run:
                break
            await self._handle_msg(msg)

    async def _handle_msg(self, msg: dict):
        """Handle a single message from ilink."""
        # Only process USER messages (type=1), not our own BOT messages (type=2)
        msg_type = msg.get("message_type", 0)
        if msg_type != 1:
            return

        user_id = msg.get("from_user_id", "")
        context_token = msg.get("context_token", "")
        text = extract_text(msg)

        if not text or not user_id:
            return

        # Process with timeout
        try:
            await asyncio.wait_for(
                process_message(user_id, text, self.api, context_token),
                timeout=120,
            )
        except asyncio.TimeoutError:
            logger.error(f"Processing timeout for {user_id[:12]}...")
            self.api.send_message(user_id, "⏱ 处理超时", context_token)


# ── Entry point ──

async def run_hub_bridge():
    """Run the WeChat ilink bot."""
    if not BOT_TOKEN:
        logger.error("WELIAN_BOT_TOKEN not set!")
        logger.error("  Get token from: ~/.wechat-claude-code/accounts/*.json (botToken field)")
        logger.error("  export WELIAN_BOT_TOKEN=xxx@im.bot:xxx")
        return

    bot = WelianBot(BOT_TOKEN)
    await bot.start()


if __name__ == "__main__":
    asyncio.run(run_hub_bridge())
