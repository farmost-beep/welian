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
USER_TOKEN = os.environ.get("WELIAN_USER_TOKEN", "")

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
        self._send_counter = 0
        self._typing_ticket_cache: Dict[str, tuple] = {}  # user_id → (ticket, fetched_at)
        self._TICKET_TTL = 24 * 3600  # 24 hours

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

    def _gen_client_id(self) -> str:
        self._send_counter += 1
        return f"welian_{int(time.time() * 1000)}_{self._send_counter}"

    def get_updates(self) -> dict:
        """Long-poll for new messages. Returns response with msgs[] and sync_buf."""
        body = {}
        if self._sync_buf:
            body["get_updates_buf"] = self._sync_buf
        resp = self._request("ilink/bot/getupdates", body, timeout=LONG_POLL_TIMEOUT + 10)
        if resp.get("sync_buf"):
            self._sync_buf = resp["sync_buf"]
        return resp

    def get_config(self, user_id: str, context_token: str = "") -> dict:
        """Fetch bot config (includes typing_ticket)."""
        return self._request("ilink/bot/getconfig", {
            "ilink_user_id": user_id,
            "context_token": context_token,
        }, timeout=10)

    def get_typing_ticket(self, user_id: str, context_token: str = "") -> str:
        """Get typing_ticket with caching (24h TTL)."""
        cached = self._typing_ticket_cache.get(user_id)
        if cached and time.time() - cached[1] < self._TICKET_TTL:
            return cached[0]
        try:
            resp = self.get_config(user_id, context_token)
            if resp.get("ret") in (0, None) and resp.get("typing_ticket"):
                ticket = resp["typing_ticket"]
                self._typing_ticket_cache[user_id] = (ticket, time.time())
                return ticket
        except Exception as e:
            logger.warning(f"getConfig failed: {e}")
        return ""

    def get_upload_url(self, filekey: str, media_type: int, to_user_id: str,
                       rawsize: int, rawfilemd5: str, file_size: int,
                       aeskey: str) -> dict:
        """Get presigned upload URL for media files."""
        return self._request("ilink/bot/getuploadurl", {
            "filekey": filekey,
            "media_type": media_type,
            "to_user_id": to_user_id,
            "rawsize": rawsize,
            "rawfilemd5": rawfilemd5,
            "filesize": file_size,
            "no_need_thumb": True,
            "aeskey": aeskey,
            "base_info": {
                "channel_version": "2.0.0",
                "bot_agent": "welian",
            },
        }, timeout=15)

    def send_message(self, to_user_id: str, text: str, context_token: str = "") -> bool:
        """Send a text message to a user. Rate-limited per user with exponential backoff retry."""
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
                "client_id": self._gen_client_id(),
                "message_type": 2,  # BOT
                "message_state": 2,  # FINISH
                "context_token": context_token,
                "item_list": [{
                    "type": 1,  # TEXT
                    "text_item": {"text": text},
                }],
            }
        }

        # Exponential backoff retry on rate-limit (ret:-2)
        max_retries = 2
        delay = 3.0
        for attempt in range(max_retries + 1):
            try:
                resp = self._request("ilink/bot/sendmessage", body, timeout=10)
                ret = resp.get("ret", 0)
                if ret == -2:
                    if attempt < max_retries:
                        self._next_send[to_user_id] = time.time() + delay + SEND_INTERVAL
                        logger.warning(f"Server rate-limited (ret:-2), retry {attempt+1}/{max_retries} in {delay}s")
                        time.sleep(delay)
                        delay = min(delay * 2, 15.0)
                        continue
                    logger.warning(f"sendMessage rate-limited after {max_retries} retries")
                    return False
                self._next_send[to_user_id] = time.time() + SEND_INTERVAL
                return ret == 0 or ret is None
            except Exception as e:
                logger.error(f"Send failed to {to_user_id[:12]}...: {e}")
                return False
        return False

    def send_file_message(self, to_user_id: str, file_path: str, context_token: str = "") -> bool:
        """Upload and send a file to a user. Images display inline, others as attachments."""
        from .cdn import upload_file, IMAGE_EXTENSIONS
        from pathlib import Path
        import base64

        path = Path(file_path)
        if not path.exists():
            self.send_message(to_user_id, f"文件不存在: {file_path}", context_token)
            return False

        try:
            media = upload_file(self, to_user_id, str(path))
            aes_key_b64 = base64.b64encode(media["aes_key_hex"].encode("utf-8")).decode("utf-8")
            is_image = media["media_type"] == "image"

            if is_image:
                item = {
                    "type": 2,  # IMAGE
                    "image_item": {
                        "media": {
                            "encrypt_query_param": media["encrypt_query_param"],
                            "aes_key": aes_key_b64,
                            "encrypt_type": 1,
                        },
                        "mid_size": media["file_size"],
                    },
                }
            else:
                item = {
                    "type": 4,  # FILE
                    "file_item": {
                        "media": {
                            "encrypt_query_param": media["encrypt_query_param"],
                            "aes_key": aes_key_b64,
                            "encrypt_type": 1,
                        },
                        "file_name": media["file_name"],
                        "len": str(media["raw_size"]),
                    },
                }

            body = {
                "msg": {
                    "from_user_id": "",
                    "to_user_id": to_user_id,
                    "client_id": self._gen_client_id(),
                    "message_type": 2,
                    "message_state": 2,
                    "context_token": context_token,
                    "item_list": [item],
                }
            }
            resp = self._request("ilink/bot/sendmessage", body, timeout=15)
            ret = resp.get("ret", 0)
            return ret == 0 or ret is None
        except Exception as e:
            logger.error(f"send_file failed: {e}")
            if "rate-limited" not in str(e):
                self.send_message(to_user_id, f"发送文件失败: {str(e)[:100]}", context_token)
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
        self._local_mode: Dict[str, bool] = {}  # user_id → True if in local agent mode
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
                client = EdgeClient(cloud_url=CLOUD_URL, user_id=wechat_user_id, user_token=USER_TOKEN)
                self._clients[wechat_user_id] = client
                logger.info(f"User session: {wechat_user_id[:12]}... → {data_dir}")
            return self._clients[wechat_user_id]

    def reset(self, wechat_user_id: str):
        if wechat_user_id in self._clients:
            del self._clients[wechat_user_id]
            logger.info(f"Reset session: {wechat_user_id[:12]}...")
        self._local_mode.pop(wechat_user_id, None)

    def is_local_mode(self, wechat_user_id: str) -> bool:
        return self._local_mode.get(wechat_user_id, False)

    def set_local_mode(self, wechat_user_id: str, enabled: bool):
        if enabled:
            self._local_mode[wechat_user_id] = True
        else:
            self._local_mode.pop(wechat_user_id, None)

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


# ── Typing keepalive ──

TYPING_KEEPALIVE_MS = 5.0  # seconds between typing pings

async def start_typing_keepalive(api: IlinkApi, user_id: str, context_token: str) -> asyncio.Event:
    """Start typing indicator with keepalive loop. Returns a stop event.

    Set the event to stop the loop and send CANCEL.
    """
    stop_event = asyncio.Event()
    ticket = await asyncio.to_thread(api.get_typing_ticket, user_id, context_token)
    if not ticket:
        return stop_event

    async def _loop():
        try:
            await asyncio.to_thread(api.send_typing, user_id, ticket, 1)  # TYPING
            while not stop_event.is_set():
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=TYPING_KEEPALIVE_MS)
                    break  # stop_event was set
                except asyncio.TimeoutError:
                    await asyncio.to_thread(api.send_typing, user_id, ticket, 1)  # keepalive
            # Send CANCEL
            await asyncio.to_thread(api.send_typing, user_id, ticket, 2)
        except Exception as e:
            logger.debug(f"Typing loop ended: {e}")

    asyncio.ensure_future(_loop())
    return stop_event


# ── Silence watchdog ──

SILENCE_WARNING_S = 20  # seconds without output before sending reassurance
SILENCE_MESSAGES = [
    "我还在处理中，这个问题有点复杂，请再稍等一下",
    "正在努力干活中，马上就有结果了，请稍等片刻",
    "有点复杂正在处理，再给我一点时间，很快就好",
    "快好了别着急，正在收尾阶段，马上给你回复",
    "还在跑呢，任务量比较大，不过马上就能出结果了",
    "任务比想象的复杂一些，再等等我，正在全力处理",
    "正在处理中，进展顺利，再等一会儿就好",
    "还没完不过已经快了，再给我一分钟就能搞定",
    "我在认真思考这个问题，请再稍等一会儿",
    "稍微有点棘手，不过已经快解决了，再等我一下",
]


async def silence_watchdog(api: IlinkApi, user_id: str, context_token: str,
                           last_output_time: list) -> asyncio.Event:
    """Monitor for silence. Sends random reassurance every 20s if no output.

    last_output_time is a mutable list [float] shared with the streaming loop.
    Returns stop event — set it to stop the watchdog.
    """
    stop_event = asyncio.Event()

    async def _loop():
        import random
        while not stop_event.is_set():
            await asyncio.sleep(2)
            if stop_event.is_set():
                break
            if time.time() - last_output_time[0] > SILENCE_WARNING_S:
                msg = random.choice(SILENCE_MESSAGES)
                api.send_message(user_id, msg, context_token)
                last_output_time[0] = time.time()  # reset to avoid spamming

    asyncio.ensure_future(_loop())
    return stop_event


# ── File path extraction from agent response ──

import re as _re
import os as _os
from os.path import expanduser as _expanduser

_AUTO_PUSH_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico",
    ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".rtf",
    ".txt", ".md",
    ".csv", ".xlsx", ".xls",
    ".mp3", ".wav", ".m4a", ".mp4", ".mov",
}

_FILE_PATH_RE = _re.compile(
    r"(?:/(?:Users|home|tmp|var|etc)/[^\s`'\"()\[\]{}|<>]+\.\w+"
    r"|~/[^\s`'\"()\[\]{}|<>]+\.\w+"
    r"|[A-Za-z]:[\\/][^\s`'\"()\[\]{}|<>]+\.\w+)"
)


def extract_file_paths(text: str) -> list:
    """Extract local file paths from agent response text."""
    paths = []
    for match in _FILE_PATH_RE.finditer(text):
        raw = match.group(0)
        resolved = _expanduser(raw) if raw.startswith("~") else raw
        paths.append(resolved)
    return paths


def get_pushable_files(text: str) -> list:
    """Extract file paths that exist and have pushable extensions."""
    paths = extract_file_paths(text)
    result = []
    for p in paths:
        ext = _os.path.splitext(p)[1].lower()
        if ext in _AUTO_PUSH_EXTENSIONS and _os.path.exists(p):
            result.append(p)
    return result


# ── Card-aware message splitting ──

def _find_safe_split_point(text: str, max_len: int) -> int:
    """Find a split point that won't break markdown formatting."""
    # Try newline first
    idx = text.rfind("\n", 0, max_len)
    if idx >= max_len * 0.3:
        return idx

    # Try sentence-ending punctuation
    for i in range(max_len, int(max_len * 0.5), -1):
        if i <= len(text) and text[i-1:i] in "。！？.!?":
            return i

    # Try space
    idx = text.rfind(" ", 0, max_len)
    if idx >= max_len * 0.3:
        return idx

    # Last resort: hard cut
    return max_len


def _split_oversized_block(text: str, max_len: int) -> list:
    """Split a single oversized block at safe boundaries."""
    chunks = []
    remaining = text
    while remaining:
        if len(remaining) <= max_len:
            chunks.append(remaining)
            break
        split_idx = _find_safe_split_point(remaining, max_len)
        chunks.append(remaining[:split_idx])
        remaining = remaining[split_idx:].lstrip("\n")
    return chunks


# ── Message handling ──

async def send_long_message(api: IlinkApi, user_id: str, text: str, context_token: str = ""):
    """Split long messages at paragraph boundaries (card-aware) and send each part."""
    if len(text) <= MAX_MSG_LEN:
        api.send_message(user_id, text, context_token)
        return

    # Split on paragraph boundaries (double newline) to keep cards intact
    blocks = [b for b in text.split("\n\n+") if b]
    chunks = []
    current = ""

    for block in blocks:
        if not current:
            if len(block) <= MAX_MSG_LEN:
                current = block
            else:
                chunks.extend(_split_oversized_block(block, MAX_MSG_LEN))
        elif len(current) + 2 + len(block) <= MAX_MSG_LEN:
            current += "\n\n" + block
        else:
            chunks.append(current)
            if len(block) <= MAX_MSG_LEN:
                current = block
            else:
                chunks.extend(_split_oversized_block(block, MAX_MSG_LEN))
                current = ""
    if current:
        chunks.append(current)

    for i, part in enumerate(chunks):
        prefix = f"[{i+1}/{len(chunks)}] " if len(chunks) > 1 else ""
        api.send_message(user_id, prefix + part, context_token)
        if i < len(chunks) - 1:
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
            "  /login — 绑定 / 查看绑定\n"
            "  /logout — 解除绑定\n"
            "  /help — 显示帮助\n"
            "  /status — 查看状态\n"
            "  /who — 该联系谁\n"
            "  /stop — 停止当前任务\n"
            "  /reset — 重置会话\n"
            "  /local — 切换到本地 Agent（编码模式）\n"
            "  /local claude — 用 Claude Code\n"
            "  /local devin — 用 Devin CLI\n"
            "  /local status — 查看 Agent 状态\n"
            "  /social — 切回社交 AI 模式\n\n"
            "社交模式（默认）：\n"
            "  · \"记一下：和张总聊了预算\"\n"
            "  · \"该联系谁\"\n"
            "  · \"给张总拟条消息\"\n"
            "  · \"月度回顾\"\n\n"
            "本地 Agent 模式：\n"
            "  · 直接发消息，转给本地 AI agent\n"
            "  · 适合编码、文件操作、系统管理",
            context_token,
        )
    elif cmd in ("/login", "/bind", "/登录", "/绑定"):
        wechat_uid = f"wechat_{hashlib.sha256(user_id.encode()).hexdigest()[:16]}"
        # Check if already bound
        bound_info = await asyncio.to_thread(_check_bind, wechat_uid)
        if bound_info and bound_info.get("bound"):
            name = bound_info.get("name", "")
            email = bound_info.get("email", "")
            if name or email:
                api.send_message(user_id,
                    f"✅ 已绑定账号\n"
                    f"  用户：{name or '未知'}\n"
                    f"  邮箱：{email or '未知'}\n\n"
                    f"你在网页和微信里看到的是同一份数据。",
                    context_token,
                )
            else:
                api.send_message(user_id,
                    f"✅ 已绑定账号（{bound_info.get('clerk_user_id', '')[:20]}...）\n\n"
                    f"你在网页和微信里看到的是同一份数据。",
                    context_token,
                )
        else:
            bind_url = f"https://welian.app/bind.html?wid={wechat_uid}"
            api.send_message(user_id,
                f"🔗 绑定你的 Welian 账号\n\n"
                f"在浏览器中打开以下链接登录即可绑定：\n\n"
                f"{bind_url}\n\n"
                f"绑定完成后会自动通知你。",
                context_token,
            )
            # Start background polling for bind completion
            asyncio.ensure_future(_poll_bind_completion(user_id, wechat_uid, api))
    elif cmd in ("/logout", "/unbind", "/解绑", "/登出", "/退出登录"):
        wechat_uid = f"wechat_{hashlib.sha256(user_id.encode()).hexdigest()[:16]}"
        result = await asyncio.to_thread(_unbind, wechat_uid)
        if result and result.get("ok"):
            sessions.reset(user_id)
            api.send_message(user_id, "✅ 已解绑。发送 /login 可重新绑定。", context_token)
        else:
            api.send_message(user_id,
                f"解绑失败：{result.get('error', '未知错误') if result else '网络错误'}",
                context_token,
            )
    elif cmd == "/status":
        s = sessions.stats()
        mode = "本地 Agent" if sessions.is_local_mode(user_id) else "社交 AI"
        api.send_message(user_id,
            f"Welian Bot 状态 ✅\n"
            f"  活跃用户：{s['active_users']}\n"
            f"  AI 模式：{s['cloud']}\n"
            f"  你的模式：{mode}",
            context_token,
        )
    elif cmd == "/who":
        client = await sessions.get_client(user_id)
        reply = await asyncio.to_thread(client._handle_ask)
        await send_long_message(api, user_id, reply, context_token)
    elif cmd == "/reset":
        sessions.reset(user_id)
        api.send_message(user_id, "会话已重置 ✅ 重新开始吧～", context_token)
    elif cmd == "/stop":
        # Signal cancellation for running agent task
        task = _active_tasks.get(user_id)
        if task and not task.done():
            task.cancel()
            api.send_message(user_id, "⏹ 已停止当前任务", context_token)
        else:
            api.send_message(user_id, "当前没有正在执行的任务", context_token)
        # Clear message queue for this user
        _message_queues.pop(user_id, None)
    elif cmd == "/local" or cmd.startswith("/local "):
        from ..agent_bridge import get_bridge, SUPPORTED_AGENTS, DEFAULT_AGENT
        bridge = get_bridge()
        parts = cmd.split(maxsplit=1)
        agent_arg = parts[1].strip() if len(parts) > 1 else ""

        if agent_arg in ("status", "st"):
            st = bridge.get_status(user_id)
            mode = "local" if sessions.is_local_mode(user_id) else "social"
            api.send_message(user_id,
                f"🔧 Agent 桥接状态\n"
                f"  当前模式：{'本地 Agent' if mode == 'local' else '社交 AI'}\n"
                f"  Agent：{st['agent']}\n"
                f"  会话：{st['session_id'] or '未创建'}\n"
                f"  工作目录：{st.get('work_dir', '~')}\n"
                f"  支持：{', '.join(SUPPORTED_AGENTS)}",
                context_token,
            )
        elif agent_arg == "reset":
            msg = bridge.reset_session(user_id)
            api.send_message(user_id, msg, context_token)
        elif agent_arg in SUPPORTED_AGENTS:
            sessions.set_local_mode(user_id, True)
            msg = bridge.set_agent(user_id, agent_arg)
            api.send_message(user_id,
                f"{msg}\n\n"
                f"现在你发的消息会直接转给本地 {agent_arg} agent。\n"
                f"发 /social 切回社交模式。",
                context_token,
            )
        elif agent_arg == "":
            # No argument — toggle to local with default agent
            sessions.set_local_mode(user_id, True)
            st = bridge.get_status(user_id)
            api.send_message(user_id,
                f"🔧 已切换到本地 Agent 模式\n"
                f"  Agent：{st['agent']}\n\n"
                f"现在你发的消息会直接转给本地 agent。\n"
                f"  /local claude — 用 Claude Code\n"
                f"  /local devin — 用 Devin CLI\n"
                f"  /social — 切回社交模式",
                context_token,
            )
        else:
            api.send_message(user_id,
                f"用法：/local [claude|devin|status|reset]\n"
                f"当前默认 agent：{DEFAULT_AGENT}",
                context_token,
            )
    elif cmd == "/social":
        sessions.set_local_mode(user_id, False)
        api.send_message(user_id,
            "💬 已切换到社交 AI 模式 ✅\n"
            "现在可以记互动、查联系人、拟消息等。\n"
            "发 /local 切回本地 Agent。",
            context_token,
        )
    else:
        api.send_message(user_id, f"未知命令：{cmd}\n输入 /help 查看可用命令", context_token)

    return True


def _check_bind(wechat_uid: str) -> dict:
    """Check if a wechat user is bound to a Clerk account."""
    import urllib.request
    sync_secret = os.environ.get("WELIAN_SYNC_SECRET", "")
    cloud_url = CLOUD_URL or "https://api.welian.app"
    try:
        body = json.dumps({"wechat_user_id": wechat_uid}).encode("utf-8")
        req = urllib.request.Request(
            f"{cloud_url}/ai/check_bind",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {wechat_uid}:{sync_secret}",
                "User-Agent": "WelianBot/1.0",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        logger.error(f"check_bind error: {e}")
        return None


def _unbind(wechat_uid: str) -> dict:
    """Unbind a wechat user from their Clerk account."""
    import urllib.request
    sync_secret = os.environ.get("WELIAN_SYNC_SECRET", "")
    cloud_url = CLOUD_URL or "https://api.welian.app"
    try:
        body = json.dumps({"wechat_user_id": wechat_uid}).encode("utf-8")
        req = urllib.request.Request(
            f"{cloud_url}/ai/unbind_wechat",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {wechat_uid}:{sync_secret}",
                "User-Agent": "WelianBot/1.0",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        logger.error(f"unbind error: HTTP {e.code}: {err[:200]}")
        try:
            return json.loads(err)
        except Exception:
            return {"error": f"HTTP {e.code}"}
    except Exception as e:
        logger.error(f"unbind error: {e}")
        return None


def _check_bind_notify(wechat_uid: str) -> dict:
    """Check for a bind notification from cloud (set when user binds on web)."""
    import urllib.request
    sync_secret = os.environ.get("WELIAN_SYNC_SECRET", "")
    cloud_url = CLOUD_URL or "https://api.welian.app"
    try:
        # Use check_bind endpoint which now also returns notification
        body = json.dumps({"wechat_user_id": wechat_uid}).encode("utf-8")
        req = urllib.request.Request(
            f"{cloud_url}/ai/check_bind",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {wechat_uid}:{sync_secret}",
                "User-Agent": "WelianBot/1.0",
                "X-Check-Notify": "1",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            # If just bound (notification exists), return notification data
            if data.get("bound") and data.get("just_bound"):
                return data
            return None
    except Exception as e:
        logger.error(f"check_bind_notify error: {e}")
        return None


async def _poll_bind_completion(user_id: str, wechat_uid: str, api: IlinkApi):
    """Poll cloud for bind completion. When detected, send success message to user."""
    max_attempts = 100  # 5 minutes at 3s interval
    for i in range(max_attempts):
        await asyncio.sleep(3)
        result = await asyncio.to_thread(_check_bind, wechat_uid)
        if result and result.get("bound"):
            name = result.get("name", "")
            email = result.get("email", "")
            api.send_message(user_id,
                f"✅ 绑定成功！\n"
                f"  用户：{name or '未知'}\n"
                f"  邮箱：{email or '未知'}\n\n"
                f"现在可以在微信里使用小维了。直接发消息即可对话：\n"
                f"  · \"记一下：和张总聊了预算\"\n"
                f"  · \"该联系谁\"\n"
                f"  · \"月度回顾\"",
            )
            logger.info(f"Bind completion detected for {user_id[:12]}... after {i*3}s")
            return
    logger.info(f"Bind polling timed out for {user_id[:12]}... (no bind in 5min)")


def _save_user_id(user_id: str):
    """Save WeChat user ID for weekly report push."""
    import json
    path = WELIAN_HOME / "bot_users.json"
    users = []
    if path.exists():
        try:
            with open(path) as f:
                users = json.load(f)
        except Exception:
            users = []
    if user_id not in users:
        users.append(user_id)
        with open(path, "w") as f:
            json.dump(users, f, ensure_ascii=False)


# ── Per-user task tracking + message queue ──

_active_tasks: Dict[str, asyncio.Task] = {}  # user_id → running processing task
_message_queues: Dict[str, list] = {}  # user_id → queued (text, context_token) pairs


async def process_message(user_id: str, text: str, api: IlinkApi, context_token: str = ""):
    """Process a user message with streaming, typing, and silence watchdog."""
    if await handle_command(text, user_id, api, context_token):
        return

    logger.info(f"Message from {user_id[:12]}...: {text[:60]}...")

    # Save user ID for weekly report push
    _save_user_id(user_id)

    # ── Route by mode: local agent vs social AI ──
    if sessions.is_local_mode(user_id):
        await _process_local_agent(user_id, text, api, context_token)
        return

    # Social AI mode (default)
    if len(text) > 10:
        api.send_message(user_id, "⏳ 正在处理...", context_token)

    # Start typing keepalive for social mode too
    typing_stop = await start_typing_keepalive(api, user_id, context_token)
    try:
        client = await sessions.get_client(user_id)
        reply = await asyncio.to_thread(client.cloud_chat, text)
        if reply:
            await send_long_message(api, user_id, reply, context_token)
            # Auto-push files mentioned in reply
            await _auto_push_files(api, user_id, reply, context_token)
        else:
            api.send_message(user_id, "（没有回复，请重试）", context_token)
    except asyncio.CancelledError:
        logger.info(f"Social AI task cancelled for {user_id[:12]}...")
    except Exception as e:
        logger.error(f"Error processing message: {e}", exc_info=True)
        api.send_message(user_id, f"处理出错：{str(e)[:100]}", context_token)
    finally:
        typing_stop.set()


async def _process_local_agent(user_id: str, text: str, api: IlinkApi, context_token: str):
    """Process a message in local agent mode with streaming output."""
    from ..agent_bridge import get_bridge

    bridge = get_bridge()

    # Send immediate acknowledgment
    api.send_message(user_id, "⏳ 收到，正在处理...", context_token)

    # Start typing keepalive
    typing_stop = await start_typing_keepalive(api, user_id, context_token)

    # Silence watchdog — last_output_time is shared mutable state
    last_output_time = [time.time()]
    silence_stop = await silence_watchdog(api, user_id, context_token, last_output_time)

    # Streaming buffer — accumulate chunks and flush at paragraph boundaries
    text_buffer = []
    MIN_FLUSH_LEN = 30
    SOFT_FLUSH_LIMIT = 1800  # leave headroom under MAX_MSG_LEN

    def on_chunk(chunk: str):
        text_buffer.append(chunk)
        last_output_time[0] = time.time()

    # Run agent in thread with streaming callback
    try:
        reply = await asyncio.to_thread(
            bridge.chat_stream, user_id, text, None, on_chunk, None
        )

        # Stop watchdog and typing
        silence_stop.set()
        typing_stop.set()

        # Flush any buffered content
        buffered = "".join(text_buffer).strip()
        if buffered and not reply:
            # Streaming produced content but chat_stream returned empty — use buffered
            reply = buffered

        if reply:
            # Check if content was already streamed (buffer was flushed during streaming)
            # For now, send the full reply if it's substantially different from what was streamed
            # Simple approach: if we accumulated chunks, they were already sent via on_chunk
            # But since we're not flushing during streaming yet, send the full reply
            await send_long_message(api, user_id, reply, context_token)

            # Auto-push files mentioned in agent response
            await _auto_push_files(api, user_id, reply, context_token)
        else:
            api.send_message(user_id, "（Agent 没有返回内容，请重试）", context_token)

    except asyncio.CancelledError:
        logger.info(f"Local agent task cancelled for {user_id[:12]}...")
        silence_stop.set()
        typing_stop.set()
        api.send_message(user_id, "⏹ 任务已停止", context_token)
    except Exception as e:
        silence_stop.set()
        typing_stop.set()
        logger.error(f"Local agent error: {e}", exc_info=True)
        api.send_message(user_id, f"Agent 执行出错：{str(e)[:100]}\n发 /social 切回社交模式", context_token)
    finally:
        silence_stop.set()
        typing_stop.set()
        _active_tasks.pop(user_id, None)


async def _auto_push_files(api: IlinkApi, user_id: str, text: str, context_token: str):
    """Scan agent response for local file paths and push them to WeChat."""
    pushable = get_pushable_files(text)
    for file_path in pushable:
        try:
            await asyncio.to_thread(api.send_file_message, user_id, file_path, context_token)
            await asyncio.sleep(1)  # avoid rate limiting between files
        except Exception as e:
            logger.warning(f"Auto-push failed for {file_path}: {e}")


# ── Extract text + media from ilink message ──

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
        elif item.get("type") == 2:
            # Image — note presence, actual download handled by extract_media
            texts.append("[用户发送了图片]")
        elif item.get("type") == 4:
            file_name = item.get("file_item", {}).get("file_name", "未知文件")
            texts.append(f"[用户发送了文件: {file_name}]")
    return "\n".join(texts)


def extract_media(msg: dict) -> dict:
    """Extract image/file media info from an ilink message for CDN download.

    Returns dict with:
        - type: 'image' | 'file' | None
        - encrypt_query_param: str
        - aes_key: str (base64)
        - file_name: str (for files)
    Returns empty dict if no media found.
    """
    items = msg.get("item_list", [])
    for item in items:
        if item.get("type") == 2:  # IMAGE
            img = item.get("image_item", {})
            # Try cdn_media format first, then flat media format
            if img.get("cdn_media", {}).get("encrypt_query_param"):
                return {
                    "type": "image",
                    "encrypt_query_param": img["cdn_media"]["encrypt_query_param"],
                    "aes_key": img["cdn_media"].get("aes_key", ""),
                }
            if img.get("media", {}).get("encrypt_query_param"):
                return {
                    "type": "image",
                    "encrypt_query_param": img["media"]["encrypt_query_param"],
                    "aes_key": img["media"].get("aes_key", img.get("aeskey", "")),
                }
        elif item.get("type") == 4:  # FILE
            f = item.get("file_item", {})
            if f.get("media", {}).get("encrypt_query_param"):
                return {
                    "type": "file",
                    "encrypt_query_param": f["media"]["encrypt_query_param"],
                    "aes_key": f["media"].get("aes_key", ""),
                    "file_name": f.get("file_name", "file"),
                }
            if f.get("cdn_media", {}).get("encrypt_query_param"):
                return {
                    "type": "file",
                    "encrypt_query_param": f["cdn_media"]["encrypt_query_param"],
                    "aes_key": f["cdn_media"].get("aes_key", ""),
                    "file_name": f.get("file_name", "file"),
                }
    return {}


def download_media(media: dict) -> Optional[str]:
    """Download and decrypt CDN media. Returns local file path or None.

    For images: saves to temp dir, returns path.
    For files: saves to temp dir with original name, returns path.
    """
    from .cdn import download_and_decrypt, detect_mime
    import tempfile
    import os

    eqp = media.get("encrypt_query_param")
    aes_key = media.get("aes_key")
    if not eqp or not aes_key:
        return None

    try:
        data = download_and_decrypt(eqp, aes_key)
        tmp_dir = Path(tempfile.gettempdir()) / "welian-media"
        tmp_dir.mkdir(parents=True, exist_ok=True)

        if media["type"] == "image":
            mime = detect_mime(data)
            ext = mime.split("/")[-1]
            if ext == "jpeg":
                ext = "jpg"
            file_name = f"img-{int(time.time())}-{os.getpid()}.{ext}"
        else:
            file_name = media.get("file_name", f"file-{int(time.time())}")

        file_path = tmp_dir / file_name
        file_path.write_bytes(data)
        logger.info(f"Media downloaded: {file_path} ({len(data)} bytes)")
        return str(file_path)
    except Exception as e:
        logger.warning(f"Media download failed: {e}")
        return None


# ── Main bot loop ──

SESSION_EXPIRED_ERRCODE = -14
SESSION_EXPIRED_PAUSE_S = 3600  # 1 hour
MAX_MSG_IDS = 1000


class WelianBot:
    """Main bot loop — long-polls ilink for messages and processes them."""

    def __init__(self, token: str):
        self.api = IlinkApi(token)
        self._should_run = False
        self._fail_count = 0
        self._recent_msg_ids: set = set()
        self._user_busy: Dict[str, bool] = {}  # user_id → True if processing

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

        # Handle session expiry
        ret = resp.get("ret")
        if ret == SESSION_EXPIRED_ERRCODE:
            logger.warning("Session expired, pausing for 1 hour")
            logger.error("⚠️ 微信会话已过期，请重新运行 setup 扫码绑定")
            await asyncio.sleep(SESSION_EXPIRED_PAUSE_S)
            return

        msgs = resp.get("msgs", [])
        if not msgs:
            return  # timeout, no messages

        for msg in msgs:
            if not self._should_run:
                break
            await self._handle_msg(msg)

    async def _handle_msg(self, msg: dict):
        """Handle a single message from ilink with dedup + queue + media."""
        # Only process USER messages (type=1), not our own BOT messages (type=2)
        msg_type = msg.get("message_type", 0)
        if msg_type != 1:
            return

        # Message dedup
        msg_id = msg.get("message_id")
        if msg_id:
            if msg_id in self._recent_msg_ids:
                return
            self._recent_msg_ids.add(msg_id)
            if len(self._recent_msg_ids) > MAX_MSG_IDS:
                # Evict oldest half (set iterates in insertion order in Python 3.7+)
                to_remove = list(self._recent_msg_ids)[:MAX_MSG_IDS // 2]
                for rid in to_remove:
                    self._recent_msg_ids.discard(rid)

        user_id = msg.get("from_user_id", "")
        context_token = msg.get("context_token", "")
        text = extract_text(msg)
        media = extract_media(msg)

        if not user_id:
            return
        if not text and not media:
            return

        # /stop and /clear bypass the queue — handle immediately
        if text and text.strip().lower() in ("/stop",):
            task = _active_tasks.get(user_id)
            if task and not task.done():
                task.cancel()
            _message_queues.pop(user_id, None)
            self._user_busy.pop(user_id, None)
            self.api.send_message(user_id, "⏹ 已停止当前任务", context_token)
            return

        # If currently processing, notify and queue
        if self._user_busy.get(user_id):
            # Queue the message
            if user_id not in _message_queues:
                _message_queues[user_id] = []
            _message_queues[user_id].append((text, context_token, media))
            self.api.send_message(user_id, "⏳ 当前还在处理上一个请求，完成后会自动处理你的消息，请稍等。", context_token)
            return

        # Process now
        await self._process_with_queue(user_id, text, context_token, media)

    async def _process_with_queue(self, user_id: str, text: str, context_token: str, media: dict = None):
        """Process a message, then drain the user's queue."""
        self._user_busy[user_id] = True

        # Handle media: download and append file info to text
        effective_text = text
        if media:
            file_path = await asyncio.to_thread(download_media, media)
            if file_path:
                if media["type"] == "image":
                    effective_text = (text + "\n\n" if text else "") + \
                        f"用户发送了图片，已保存到: {file_path}\n请先查看这张图片再回答。"
                else:
                    effective_text = (text + "\n\n" if text else "") + \
                        f"用户发送了文件: {media.get('file_name', 'file')}\n文件已保存到: {file_path}\n请先读取这个文件再回答。"

        # Create task and track it for /stop
        task = asyncio.ensure_future(
            self._process_with_timeout(user_id, effective_text, context_token)
        )
        _active_tasks[user_id] = task

        try:
            await task
        except asyncio.CancelledError:
            logger.info(f"Task cancelled for {user_id[:12]}...")
        finally:
            _active_tasks.pop(user_id, None)
            self._user_busy[user_id] = False

        # Drain queue
        queue = _message_queues.get(user_id, [])
        while queue:
            q_text, q_token, q_media = queue.pop(0)
            self._user_busy[user_id] = True
            # Handle queued media
            eff_text = q_text
            if q_media:
                file_path = await asyncio.to_thread(download_media, q_media)
                if file_path:
                    if q_media["type"] == "image":
                        eff_text = (q_text + "\n\n" if q_text else "") + \
                            f"用户发送了图片，已保存到: {file_path}\n请先查看这张图片再回答。"
                    else:
                        eff_text = (q_text + "\n\n" if q_text else "") + \
                            f"用户发送了文件: {q_media.get('file_name', 'file')}\n文件已保存到: {file_path}\n请先读取这个文件再回答。"
            task = asyncio.ensure_future(
                self._process_with_timeout(user_id, eff_text, q_token)
            )
            _active_tasks[user_id] = task
            try:
                await task
            except asyncio.CancelledError:
                break
            finally:
                _active_tasks.pop(user_id, None)
                self._user_busy[user_id] = False

        _message_queues.pop(user_id, None)

    async def _process_with_timeout(self, user_id: str, text: str, context_token: str):
        """Process a message with timeout."""
        try:
            await asyncio.wait_for(
                process_message(user_id, text, self.api, context_token),
                timeout=600,  # 10 min for agent tasks
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
