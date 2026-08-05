#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Welian WeChat Bridge — OneBot ↔ Welian API

Receives group messages from OneBot (wechat-mac-hook), forwards to Welian API
for AI reply generation, then sends the reply back via OneBot.

Architecture:
    WeChat → Frida Hook → OneBot(58080) → This Bridge(36100) → Welian API
                                                                    ↓
                                                           AI generates reply
                                                                    ↓
    WeChat ← OneBot(58080) ← This Bridge(36100) ← Welian API ←─────┘

Requirements:
    - wechat-mac-hook running with OneBot on 127.0.0.1:58080
    - Welian API token (get from ~/.welian/config.yaml or env WELIAN_TOKEN)
    - Python 3.9+ (stdlib only, no pip install needed)

Usage:
    python3 welian_bridge.py --token YOUR_TOKEN --port 36100
    python3 welian_bridge.py --token YOUR_TOKEN --dry-run  # log but don't send
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# ── Defaults ──

DEFAULT_PORT = 36100
DEFAULT_ONEBOT_API = "http://127.0.0.1:58080"
DEFAULT_WELIAN_API = "https://api.welian.app"
DEFAULT_BOT_NAME = "小维"
CONFIG_PATH = Path.home() / "Library" / "Application Support" / "WeChatAgent" / "welian_bridge_config.json"


def log(level: str, msg: str, **fields) -> None:
    rec = {"time": time.strftime("%Y-%m-%d %H:%M:%S"), "level": level, "msg": msg}
    rec.update(fields)
    line = json.dumps(rec, ensure_ascii=False)
    print(line, flush=True)


def load_config(path: Path) -> dict:
    if path.exists():
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_config(path: Path, config: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def load_token() -> str:
    """Load Welian token from env, config file, or ~/.welian/config.yaml."""
    token = os.getenv("WELIAN_TOKEN", "")
    if token:
        return token
    # Try ~/.welian/config.yaml
    yaml_path = Path.home() / ".welian" / "config.yaml"
    if yaml_path.exists():
        for line in yaml_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("token:"):
                return line.split(":", 1)[1].strip().strip('"').strip("'")
    return ""


def send_to_welian(api_base: str, token: str, payload: dict, timeout: int = 30) -> dict:
    """POST /ai/group_message to Welian API."""
    url = f"{api_base.rstrip('/')}/ai/group_message"
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        log("ERROR", f"Welian API HTTP {e.code}", url=url, body=body[:500])
        return {"ok": False, "error": f"HTTP {e.code}"}
    except Exception as e:
        log("ERROR", f"Welian API error: {e}", url=url)
        return {"ok": False, "error": str(e)}


def send_via_onebot(onebot_api: str, group_id: str, message: str, timeout: int = 10) -> bool:
    """Send group message via OneBot /send_group_msg."""
    url = f"{onebot_api.rstrip('/')}/send_group_msg"
    payload = {"group_id": group_id, "message": message}
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            result = json.loads(body)
            ok = result.get("status") == "ok" or result.get("retcode") == 0
            if not ok:
                log("ERROR", "OneBot send failed", response=body[:300])
            return ok
    except Exception as e:
        log("ERROR", f"OneBot send error: {e}", url=url)
        return False


class BridgeHandler(BaseHTTPRequestHandler):
    """HTTP handler that receives OneBot events and bridges to Welian."""

    # Set by main()
    welian_api: str = DEFAULT_WELIAN_API
    welian_token: str = ""
    onebot_api: str = DEFAULT_ONEBOT_API
    bot_name: str = DEFAULT_BOT_NAME
    dry_run: bool = False

    def _send_json(self, code: int, data: dict) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length > 0 else b"{}"
            event = json.loads(raw.decode("utf-8"))
        except Exception as e:
            log("ERROR", f"Failed to parse event: {e}")
            self._send_json(400, {"error": "bad json"})
            return

        # OneBot event format
        post_type = event.get("post_type", "")
        if post_type != "message":
            # Acknowledge non-message events (heartbeats, etc.)
            self._send_json(200, {"ok": True})
            return

        message_type = event.get("message_type", "")
        if message_type != "group":
            self._send_json(200, {"ok": True, "skipped": "not group"})
            return

        group_id = str(event.get("group_id", ""))
        group_name = event.get("group_name", "")
        sender_id = str(event.get("sender_id") or event.get("user_id", ""))
        sender_name = ""
        if isinstance(event.get("sender"), dict):
            sender_name = event["sender"].get("card") or event["sender"].get("nickname") or ""
        raw_message = event.get("raw_message") or event.get("message", "")
        # Flatten message if it's a list of segments
        if isinstance(raw_message, list):
            parts = []
            for seg in raw_message:
                if isinstance(seg, dict):
                    if seg.get("type") == "text":
                        parts.append(seg.get("data", {}).get("text", ""))
                    elif seg.get("type") == "at":
                        parts.append(f"@{seg.get('data', {}).get('qq', '')}")
                    else:
                        parts.append(f"[{seg.get('type', 'unknown')}]")
            raw_message = "".join(parts)

        # Check if bot is @'d
        self_id = str(event.get("self_id", ""))
        is_at_bot = f"@{self_id}" in raw_message or f"@{self.bot_name}" in raw_message

        log("INFO", "Group message received",
            group_id=group_id, group_name=group_name,
            sender=sender_name or sender_id,
            message=raw_message[:100],
            is_at_bot=is_at_bot)

        # Forward to Welian API
        payload = {
            "group_id": group_id,
            "group_name": group_name,
            "sender_id": sender_id,
            "sender_name": sender_name,
            "message": raw_message,
            "is_at_bot": is_at_bot,
            "bot_name": self.bot_name,
        }

        result = send_to_welian(self.welian_api, self.welian_token, payload)
        should_reply = result.get("should_reply", False)
        reply_text = result.get("reply", "")

        if should_reply and reply_text:
            log("INFO", "AI reply generated", group_id=group_id, reply=reply_text[:80])
            if self.dry_run:
                log("INFO", "DRY RUN — not sending via OneBot")
            else:
                ok = send_via_onebot(self.onebot_api, group_id, reply_text)
                if ok:
                    log("INFO", "Reply sent via OneBot", group_id=group_id)
                else:
                    log("ERROR", "Failed to send reply via OneBot", group_id=group_id)
        else:
            reason = result.get("reason", "unknown")
            log("DEBUG", "No reply", group_id=group_id, reason=reason)

        self._send_json(200, {"ok": True, "replied": should_reply})

    def do_GET(self) -> None:
        """Health check endpoint."""
        if self.path == "/health":
            self._send_json(200, {
                "ok": True,
                "service": "welian-bridge",
                "welian_api": self.welian_api,
                "onebot_api": self.onebot_api,
                "bot_name": self.bot_name,
                "dry_run": self.dry_run,
                "token_set": bool(self.welian_token),
            })
        elif self.path == "/config":
            # Return current config (read-only)
            self._send_json(200, {
                "ok": True,
                "welian_api": self.welian_api,
                "onebot_api": self.onebot_api,
                "bot_name": self.bot_name,
                "dry_run": self.dry_run,
            })
        else:
            self._send_json(404, {"error": "not found"})

    def log_message(self, format, *args) -> None:
        # Suppress default access logs; we use our own logging
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Welian WeChat Bridge")
    parser.add_argument("--token", default="", help="Welian API token (or set WELIAN_TOKEN env)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Bridge listen port")
    parser.add_argument("--onebot-api", default=DEFAULT_ONEBOT_API, help="OneBot API URL")
    parser.add_argument("--welian-api", default=DEFAULT_WELIAN_API, help="Welian API URL")
    parser.add_argument("--bot-name", default=DEFAULT_BOT_NAME, help="Bot display name for @ detection")
    parser.add_argument("--dry-run", action="store_true", help="Log but don't send replies via OneBot")
    parser.add_argument("--host", default="127.0.0.1", help="Listen host")
    args = parser.parse_args()

    token = args.token or load_token()
    if not token:
        log("ERROR", "No Welian token found. Set WELIAN_TOKEN env or pass --token")
        sys.exit(1)

    # Load persisted config (CLI args take precedence)
    saved = load_config(CONFIG_PATH)
    onebot_api = args.onebot_api or saved.get("onebot_api", DEFAULT_ONEBOT_API)
    welian_api = args.welian_api or saved.get("welian_api", DEFAULT_WELIAN_API)
    bot_name = args.bot_name or saved.get("bot_name", DEFAULT_BOT_NAME)

    # Save config for next run
    save_config(CONFIG_PATH, {
        "onebot_api": onebot_api,
        "welian_api": welian_api,
        "bot_name": bot_name,
    })

    # Configure handler
    BridgeHandler.welian_api = welian_api
    BridgeHandler.welian_token = token
    BridgeHandler.onebot_api = onebot_api
    BridgeHandler.bot_name = bot_name
    BridgeHandler.dry_run = args.dry_run

    server = ThreadingHTTPServer((args.host, args.port), BridgeHandler)
    log("INFO", f"Welian Bridge starting on {args.host}:{args.port}",
        welian_api=welian_api,
        onebot_api=onebot_api,
        bot_name=bot_name,
        dry_run=args.dry_run)
    log("INFO", f"Configure OneBot to POST events to http://{args.host}:{args.port}/")
    log("INFO", f"Health check: http://{args.host}:{args.port}/health")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("INFO", "Bridge shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
