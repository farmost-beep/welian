"""Agent bridge — connect WeChat bot to local AI coding agents.

Supports two agent types:
  - claude: Claude Code CLI (claude -p "msg" --session-id <uuid> --output-format text)
  - devin:  Devin CLI      (devin -p "msg" --resume <session-id>)

Each WeChat user gets an independent agent session. Sessions persist
across messages so the agent retains conversation context.

Environment variables:
  WELIAN_AGENT_TYPE     default agent type (claude|devin), default: claude
  WELIAN_AGENT_WORK_DIR working directory for agent, default: ~
  WELIAN_AGENT_TIMEOUT  per-message timeout in seconds, default: 120
"""

from __future__ import annotations

import os
import uuid
import subprocess
import logging
from pathlib import Path
from typing import Dict, Optional

logger = logging.getLogger(__name__)

SUPPORTED_AGENTS = ("claude", "devin")
DEFAULT_AGENT = os.environ.get("WELIAN_AGENT_TYPE", "claude").lower()
DEFAULT_WORK_DIR = os.environ.get("WELIAN_AGENT_WORK_DIR", str(Path.home()))
DEFAULT_TIMEOUT = int(os.environ.get("WELIAN_AGENT_TIMEOUT", "120"))


class AgentBridge:
    """Manages local agent sessions per WeChat user.

    Usage:
        bridge = AgentBridge()
        reply = bridge.chat(user_id, "fix the bug in main.py")
        reply = bridge.chat(user_id, "now run the tests", agent_type="devin")
    """

    def __init__(self):
        # user_id → {"agent": "claude", "session_id": "uuid", "work_dir": "/path"}
        self._sessions: Dict[str, dict] = {}

    def chat(self, user_id: str, text: str, agent_type: str = None) -> str:
        """Send a message to the local agent and return its reply.

        Args:
            user_id: WeChat user ID (used as session key)
            text: User's message
            agent_type: "claude" or "devin", defaults to user's current or DEFAULT_AGENT

        Returns:
            Agent's text reply (truncated to 2000 chars for WeChat)
        """
        agent = (agent_type or self._get_user_agent(user_id)).lower()
        if agent not in SUPPORTED_AGENTS:
            return f"不支持的 agent 类型：{agent}\n支持：{', '.join(SUPPORTED_AGENTS)}"

        # Get or create session
        session = self._get_or_create_session(user_id, agent)
        work_dir = session["work_dir"]

        try:
            if agent == "claude":
                reply = self._call_claude(text, session, work_dir)
            else:
                reply = self._call_devin(text, session, work_dir)
        except subprocess.TimeoutExpired:
            return f"⏰ Agent 执行超时（{DEFAULT_TIMEOUT}s），已中断。可以重试或简化指令。"
        except FileNotFoundError:
            return f"❌ 未找到 {agent} 命令，请确认已安装并在 PATH 中。"
        except Exception as e:
            logger.error(f"Agent bridge error ({agent}): {e}", exc_info=True)
            return f"❌ Agent 执行出错：{str(e)[:100]}"

        # Truncate for WeChat (single message limit ~2000 chars)
        if len(reply) > 2000:
            reply = reply[:1990] + "\n…(截断)"
        return reply.strip()

    def _call_claude(self, text: str, session: dict, work_dir: str) -> str:
        """Call Claude Code CLI in non-interactive mode."""
        cmd = [
            "claude", "-p", text,
            "--session-id", session["session_id"],
            "--output-format", "text",
        ]
        logger.info(f"[agent_bridge] claude: session={session['session_id'][:8]}... dir={work_dir}")
        result = subprocess.run(
            cmd, cwd=work_dir, capture_output=True, text=True,
            timeout=DEFAULT_TIMEOUT,
        )
        if result.returncode != 0 and not result.stdout:
            err = result.stderr.strip()[:200]
            return f"Claude Code 错误：{err}"
        return result.stdout

    def _call_devin(self, text: str, session: dict, work_dir: str) -> str:
        """Call Devin CLI in non-interactive mode.

        First message: no resume flag (creates new session).
        Subsequent messages: --continue (resumes most recent session in work_dir).
        """
        cmd = ["devin", "-p", text]
        if session.get("started"):
            cmd.append("--continue")
        logger.info(f"[agent_bridge] devin: session={session['session_id'][:8]}... dir={work_dir} continue={session.get('started', False)}")
        result = subprocess.run(
            cmd, cwd=work_dir, capture_output=True, text=True,
            timeout=DEFAULT_TIMEOUT,
        )
        session["started"] = True
        if result.returncode != 0 and not result.stdout:
            err = result.stderr.strip()[:200]
            return f"Devin CLI 错误：{err}"
        return result.stdout

    def _get_or_create_session(self, user_id: str, agent: str) -> dict:
        """Get existing session or create a new one.

        If user switches agent type, a new session is created (agents
        don't share session state). Each user gets an isolated work_dir
        so Devin's --continue doesn't cross-contaminate users.
        """
        existing = self._sessions.get(user_id)
        if existing and existing["agent"] == agent:
            return existing

        # Per-user work dir for session isolation
        import hashlib
        user_hash = hashlib.sha256(user_id.encode()).hexdigest()[:12]
        work_dir = os.path.join(DEFAULT_WORK_DIR, ".welian-agent", user_hash)
        os.makedirs(work_dir, exist_ok=True)

        session = {
            "agent": agent,
            "session_id": str(uuid.uuid4()),
            "work_dir": work_dir,
            "started": False,
        }
        self._sessions[user_id] = session
        logger.info(f"[agent_bridge] new session: user={user_id[:12]}... agent={agent} dir={work_dir}")
        return session

    def _get_user_agent(self, user_id: str) -> str:
        """Get user's current agent type, or default."""
        existing = self._sessions.get(user_id)
        return existing["agent"] if existing else DEFAULT_AGENT

    def set_agent(self, user_id: str, agent: str) -> str:
        """Switch user's agent type. Returns confirmation message."""
        agent = agent.lower()
        if agent not in SUPPORTED_AGENTS:
            return f"不支持的 agent：{agent}\n支持：{', '.join(SUPPORTED_AGENTS)}"

        old = self._sessions.get(user_id, {}).get("agent")
        # Clear session — next chat() will create a fresh one
        self._sessions.pop(user_id, None)
        # Pre-seed with new agent
        self._get_or_create_session(user_id, agent)
        if old and old != agent:
            return f"✅ 已切换到 {agent}（新会话）"
        return f"✅ 已设置 agent 为 {agent}"

    def get_status(self, user_id: str) -> dict:
        """Get user's current session status."""
        session = self._sessions.get(user_id)
        if not session:
            return {"active": False, "agent": DEFAULT_AGENT, "session_id": None}
        return {
            "active": True,
            "agent": session["agent"],
            "session_id": session["session_id"][:8] + "...",
            "work_dir": session["work_dir"],
        }

    def reset_session(self, user_id: str) -> str:
        """Clear user's session, starting fresh on next message."""
        self._sessions.pop(user_id, None)
        return "✅ Agent 会话已重置，下次发消息将开始新对话"


# Singleton
_bridge: Optional[AgentBridge] = None


def get_bridge() -> AgentBridge:
    global _bridge
    if _bridge is None:
        _bridge = AgentBridge()
    return _bridge
