"""Agent bridge — connect WeChat bot to local AI coding agents.

Supports two agent types:
  - claude: Claude Code CLI (claude -p "msg" --session-id <uuid> --output-format text)
  - devin:  Devin CLI      (devin -p "msg" --resume <session-id>)

Each WeChat user gets an independent agent session. Sessions persist
across messages so the agent retains conversation context.

Environment variables:
  WELIAN_AGENT_TYPE     default agent type (claude|devin), default: claude
  WELIAN_AGENT_WORK_DIR working directory for agent, default: ~
  WELIAN_AGENT_TIMEOUT  per-message timeout in seconds, default: 600
"""
from __future__ import annotations

import os
import uuid
import subprocess
import logging
import tempfile
import json
import threading
from pathlib import Path
from typing import Dict, Optional, Callable

logger = logging.getLogger(__name__)

SUPPORTED_AGENTS = ("claude", "devin")
DEFAULT_AGENT = os.environ.get("WELIAN_AGENT_TYPE", "claude").lower()
DEFAULT_WORK_DIR = os.environ.get("WELIAN_AGENT_WORK_DIR", str(Path.home()))
DEFAULT_TIMEOUT = int(os.environ.get("WELIAN_AGENT_TIMEOUT", "600"))

# System prompt injected into every agent query
SYSTEM_PROMPT = (
    "你正在通过微信与用户对话，不是在终端里。"
    "不要让用户去终端操作。如果用户需要文件，直接输出文件地址就行，"
    "会自动识别解析推送文件到用户的微信中。"
)


class AgentBridge:
    """Manages local agent sessions per WeChat user.

    Usage:
        bridge = AgentBridge()
        reply = bridge.chat(user_id, "fix the bug in main.py")
        reply = bridge.chat(user_id, "now run the tests", agent_type="devin")

    Streaming:
        bridge.chat_stream(user_id, "msg", on_chunk=lambda chunk: ...)
    """

    def __init__(self):
        # user_id → {"agent": "claude", "session_id": "uuid", "work_dir": "/path", "started": bool}
        self._sessions: Dict[str, dict] = {}
        self._locks: Dict[str, threading.Lock] = {}

    def _get_lock(self, user_id: str) -> threading.Lock:
        if user_id not in self._locks:
            self._locks[user_id] = threading.Lock()
        return self._locks[user_id]

    def chat(self, user_id: str, text: str, agent_type: str = None) -> str:
        """Send a message to the local agent and return its full reply.

        Non-streaming — waits for completion, returns full text.
        """
        chunks = []
        bridge = self

        def collector(chunk: str):
            chunks.append(chunk)

        self.chat_stream(user_id, text, agent_type=agent_type, on_chunk=collector)

        reply = "".join(chunks).strip()
        if len(reply) > 2000:
            reply = reply[:1990] + "\n…(截断)"
        return reply

    def chat_stream(
        self,
        user_id: str,
        text: str,
        agent_type: str = None,
        on_chunk: Optional[Callable[[str], None]] = None,
        cancel_event: Optional[threading.Event] = None,
    ) -> str:
        """Send a message to the local agent, streaming output via on_chunk.

        Args:
            user_id: WeChat user ID (used as session key)
            text: User's message
            agent_type: "claude" or "devin", defaults to user's current or DEFAULT_AGENT
            on_chunk: Called with each text chunk as it arrives (real-time streaming)
            cancel_event: If set, agent process is killed immediately

        Returns:
            Agent's full text reply
        """
        agent = (agent_type or self._get_user_agent(user_id)).lower()
        if agent not in SUPPORTED_AGENTS:
            return f"不支持的 agent 类型：{agent}\n支持：{', '.join(SUPPORTED_AGENTS)}"

        session = self._get_or_create_session(user_id, agent)
        work_dir = session["work_dir"]

        try:
            if agent == "claude":
                reply = self._call_claude_stream(text, session, work_dir, on_chunk, cancel_event)
            else:
                reply = self._call_devin_stream(text, session, work_dir, on_chunk, cancel_event)
        except subprocess.TimeoutExpired:
            return f"⏰ Agent 执行超时（{DEFAULT_TIMEOUT}s），已中断。可以重试或简化指令。"
        except FileNotFoundError:
            return f"❌ 未找到 {agent} 命令，请确认已安装并在 PATH 中。"
        except Exception as e:
            logger.error(f"Agent bridge error ({agent}): {e}", exc_info=True)
            return f"❌ Agent 执行出错：{str(e)[:100]}"

        return reply.strip()

    def _call_claude_stream(
        self,
        text: str,
        session: dict,
        work_dir: str,
        on_chunk: Optional[Callable[[str], None]],
        cancel_event: Optional[threading.Event],
    ) -> str:
        """Call Claude Code CLI with streaming stdout.

        Uses --dangerously-skip-permissions because the WeChat bridge
        has no way to surface permission prompts to the user.
        """
        cmd = [
            "claude", "-p", text,
            "--session-id", session["session_id"],
            "--output-format", "text",
            "--dangerously-skip-permissions",
        ]
        logger.info(f"[agent_bridge] claude: session={session['session_id'][:8]}... dir={work_dir}")
        return self._run_streaming(cmd, work_dir, on_chunk, cancel_event)

    def _call_devin_stream(
        self,
        text: str,
        session: dict,
        work_dir: str,
        on_chunk: Optional[Callable[[str], None]],
        cancel_event: Optional[threading.Event],
    ) -> str:
        """Call Devin CLI with streaming stdout + precise session resume.

        First message: no resume (creates new session, --export captures session_id).
        Subsequent messages: --resume <session_id> for precise continuation.
        Uses --permission-mode dangerous.
        """
        tmp_dir = Path(tempfile.gettempdir()) / "welian-devin"
        tmp_dir.mkdir(parents=True, exist_ok=True)

        prompt_file = tmp_dir / f"prompt-{uuid.uuid4().hex[:8]}.txt"
        prompt_file.write_text(text, encoding="utf-8")

        export_file = tmp_dir / f"export-{uuid.uuid4().hex[:8]}.json"

        cmd = [
            "devin",
            "--permission-mode", "dangerous",
            "-p",
            "--prompt-file", str(prompt_file),
            "--export", str(export_file),
        ]

        # Precise resume: use saved session_id instead of --continue
        if session.get("devin_session_id"):
            cmd.extend(["-r", session["devin_session_id"]])

        logger.info(f"[agent_bridge] devin: dir={work_dir} resume={bool(session.get('devin_session_id'))}")
        try:
            result = self._run_streaming(cmd, work_dir, on_chunk, cancel_event)
        finally:
            # Read session_id from export file
            try:
                if export_file.exists():
                    export_data = json.loads(export_file.read_text("utf-8"))
                    sid = export_data.get("session_id", "")
                    if sid:
                        session["devin_session_id"] = sid
                        logger.info(f"[agent_bridge] devin session saved: {sid[:12]}...")
            except Exception:
                pass
            # Cleanup temp files
            prompt_file.unlink(missing_ok=True)
            export_file.unlink(missing_ok=True)

        return result

    def _run_streaming(
        self,
        cmd: list,
        work_dir: str,
        on_chunk: Optional[Callable[[str], None]],
        cancel_event: Optional[threading.Event],
    ) -> str:
        """Run a subprocess with real-time stdout streaming.

        Each line/chunk of stdout is passed to on_chunk immediately.
        Returns the full stdout text.
        """
        proc = subprocess.Popen(
            cmd,
            cwd=work_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,  # line-buffered
        )

        full_output = []

        try:
            # Read stdout line by line in real-time
            for line in proc.stdout:
                if cancel_event and cancel_event.is_set():
                    proc.kill()
                    break
                full_output.append(line)
                if on_chunk and line.strip():
                    try:
                        on_chunk(line.rstrip("\n"))
                    except Exception as e:
                        logger.warning(f"on_chunk callback error: {e}")

            proc.wait(timeout=DEFAULT_TIMEOUT)

        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
            raise
        finally:
            # Drain stderr for logging
            stderr = proc.stderr.read() if proc.stderr else ""
            if proc.returncode and proc.returncode != 0 and not full_output:
                err = stderr.strip()[:200]
                raise RuntimeError(f"Agent 错误 (exit {proc.returncode}): {err}")

        result = "".join(full_output).strip()
        if not result and stderr.strip():
            return f"Agent 错误: {stderr.strip()[:200]}"
        return result

    def _get_or_create_session(self, user_id: str, agent: str) -> dict:
        """Get existing session or create a new one.

        If user switches agent type, a new session is created (agents
        don't share session state). Each user gets an isolated work_dir
        so sessions don't cross-contaminate users.
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
            "devin_session_id": None,  # precise resume ID
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

    def cancel(self, user_id: str):
        """Signal cancellation for a user's running agent (if any)."""
        # The cancel_event is managed by the caller in handler.py
        # This is a hook for future use
        pass


# Singleton
_bridge: Optional[AgentBridge] = None


def get_bridge() -> AgentBridge:
    global _bridge
    if _bridge is None:
        _bridge = AgentBridge()
    return _bridge
