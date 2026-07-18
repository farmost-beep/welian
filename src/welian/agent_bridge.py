"""Agent bridge — connect WeChat bot to local AI coding agents.

Supports two agent types:
  - claude: Claude Code CLI (claude -p "msg" --session-id <uuid> --output-format text)
  - devin:  Devin CLI      (devin -p "msg" --resume <session-id>)

Each WeChat user gets an independent agent session. Sessions persist
across messages so the agent retains conversation context.

Features borrowed from claude-code:
  - Permission modes: strict (confirm each action) / lax (auto-execute) / sandbox
  - Pre-tool-use validation via validator.py (dangerous command blocking)
  - Hook system via hooks.py (PreToolUse / PostToolUse / Stop)
  - Loop mode: re-feed prompt until completion (Ralph-Wiggum pattern)
  - Learn mode: educational output style injection
  - Design mode: frontend design principles injection

Environment variables:
  WELIAN_AGENT_TYPE     default agent type (claude|devin), default: claude
  WELIAN_AGENT_WORK_DIR working directory for agent, default: ~
  WELIAN_AGENT_TIMEOUT  per-message timeout in seconds, default: 600
  WELIAN_PERMISSION     default permission mode, default: lax
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
DEFAULT_PERMISSION = os.environ.get("WELIAN_PERMISSION", "lax").lower()
MAX_TURN_REQUESTS = int(os.environ.get("WELIAN_MAX_TURNS", "50"))  # max inference rounds per task

# ── Load Devin CLI config from config/welian.yaml (overrides env vars) ──
def _load_devin_config():
    """Load devin config from welian.yaml. Returns dict or empty."""
    try:
        import yaml as _yaml
        root = Path(__file__).resolve().parent.parent.parent
        config_path = root / "config" / "welian.yaml"
        if config_path.exists():
            with open(config_path) as f:
                full = _yaml.safe_load(f)
            return full.get("agent", {}).get("devin", {})
    except Exception:
        pass
    return {}

_DEVIN_CFG = _load_devin_config()
if _DEVIN_CFG.get("permission_mode"):
    DEFAULT_PERMISSION = _DEVIN_CFG["permission_mode"]
if _DEVIN_CFG.get("max_turns"):
    MAX_TURN_REQUESTS = int(_DEVIN_CFG["max_turns"])
if _DEVIN_CFG.get("timeout"):
    DEFAULT_TIMEOUT = int(_DEVIN_CFG["timeout"])
if _DEVIN_CFG.get("work_dir"):
    DEFAULT_WORK_DIR = _DEVIN_CFG["work_dir"]
# model is used per-call, not as a global default
DEVIN_MODEL = _DEVIN_CFG.get("model", "")

# System prompt injected into every agent query
SYSTEM_PROMPT = (
    "你正在通过微信与用户对话，不是在终端里。"
    "不要让用户去终端操作。如果用户需要文件，直接输出文件地址就行，"
    "会自动识别解析推送文件到用户的微信中。"
)

# Stop hook prompt — prevents premature stopping
STOP_HOOK_PROMPT = (
    "\n\n【防早停规则】\n"
    "在宣布任务完成之前，必须确认：\n"
    "1. 所有修改的文件已保存\n"
    "2. 如果涉及代码，已运行语法检查或测试\n"
    "3. 如果用户要求了具体交付物，已实际生成（不是承诺生成）\n"
    "如果你还没做完，继续做，不要停下来解释你打算做什么。"
)

# Post-compaction context — re-injected after /compact to preserve key info
COMPACTION_CONTEXT = (
    "【上下文恢复】\n"
    "会话刚刚被压缩。关键信息：\n"
    "- 你是微信 bot 的本地 Agent，通过 WeChat 与用户对话\n"
    "- 用户通过微信发消息，你的输出会直接发到微信\n"
    "- 如果用户之前提到了项目路径或任务，继续之前的任务\n"
    "- 如果不确定之前在做什么，简短问用户\n"
)

# Path to sandboxed gh wrapper
GH_SAFE_PATH = str(Path(__file__).parent / "bot" / "scripts" / "gh_safe.sh")

# System prompt for GitHub operations — tells agent to use gh_safe.sh
GH_SYSTEM_PROMPT = (
    "\n\n【GitHub 操作安全限制】\n"
    "当需要操作 GitHub（查看 PR、创建 PR、查看 issue 等）时，"
    f"必须使用沙箱包装器 `{GH_SAFE_PATH}` 而非直接调用 `gh`。\n"
    "示例：\n"
    f"  查看PR: {GH_SAFE_PATH} pr view 123\n"
    f"  列出PR: {GH_SAFE_PATH} pr list --state open --limit 20\n"
    f"  创建PR: {GH_SAFE_PATH} pr create --title '标题' --body '内容'\n"
    f"  查看issue: {GH_SAFE_PATH} issue view 456\n"
    f"  搜索issue: {GH_SAFE_PATH} search issues '关键词' --limit 10\n"
    "禁止直接使用 `gh` 命令。沙箱包装器会阻止危险操作（关闭PR、合并PR、删除issue等）。\n"
)

# Permission modes
PERMISSION_STRICT = "strict"   # every Bash command needs WeChat confirmation
PERMISSION_LAX = "lax"         # auto-execute, but block dangerous commands
PERMISSION_SANDBOX = "sandbox" # no network, restricted filesystem

VALID_PERMISSIONS = (PERMISSION_STRICT, PERMISSION_LAX, PERMISSION_SANDBOX)

# Mode prompts (injected when user activates a mode)
LEARN_PROMPT = (
    "【教育型输出模式已激活】\n"
    "在完成任务的同时提供教育性见解：\n"
    "1. 解释实现选择——为什么选这个而非其他方案\n"
    "2. 指出代码库中的设计模式或约定\n"
    "3. 在关键决策点列出选项和权衡\n"
    "4. 任务完成后附加知识点说明\n"
    "注意：不要过度解释简单的东西，聚焦非显而易见的决策。\n\n"
)

DESIGN_PROMPT = (
    "【前端设计模式已激活】\n"
    "作为设计负责人对待前端工作：\n"
    "1. 避免通用 AI 美学（暖米色背景+衬线标题、近黑+酸绿、报纸式布局都是默认值）\n"
    "2. 排版承载个性——刻意搭配展示字体和正文字体\n"
    "3. 结构即信息——编号和标签编码真实信息，不是装饰\n"
    "4. 克制即优雅——在签名元素上花大胆，周围保持安静\n"
    "5. 香奈儿建议：出门前照镜子，取掉一件配饰\n\n"
)

LOOP_PROMPT = (
    "【自主循环模式已激活】\n"
    "你要反复处理这个任务直到完全完成：\n"
    "1. 每次迭代先检查之前做了什么（git log、文件状态）\n"
    "2. 逐步推进——每轮聚焦一个可验证的子目标\n"
    "3. 验证每步——运行测试、检查文件\n"
    "4. 只有当任务完全且毫无疑问地完成时才停止\n"
    "5. 每轮结束输出：🔄 第N轮完成 + ✅本轮完成 + 📋下一步\n\n"
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
        # user_id → {"agent": "claude", "session_id": "uuid", "work_dir": "/path", ...}
        self._sessions: Dict[str, dict] = {}
        self._locks: Dict[str, threading.Lock] = {}
        # user_id → permission mode
        self._permissions: Dict[str, str] = {}
        # user_id → active mode ("learn", "design", "loop", None)
        self._modes: Dict[str, str] = {}
        # user_id → pending confirmation (command text awaiting user approval)
        self._pending_confirmations: Dict[str, str] = {}
        # user_id → True if compaction context should be injected next message
        self._compaction_pending: Dict[str, bool] = {}

    def _get_lock(self, user_id: str) -> threading.Lock:
        if user_id not in self._locks:
            self._locks[user_id] = threading.Lock()
        return self._locks[user_id]

    def get_permission(self, user_id: str) -> str:
        return self._permissions.get(user_id, DEFAULT_PERMISSION)

    def set_permission(self, user_id: str, mode: str) -> str:
        if mode not in VALID_PERMISSIONS:
            return f"无效权限模式：{mode}\n支持：{', '.join(VALID_PERMISSIONS)}"
        self._permissions[user_id] = mode
        return f"✅ 权限模式已设置为 {mode}"

    def get_mode(self, user_id: str) -> Optional[str]:
        return self._modes.get(user_id)

    def set_mode(self, user_id: str, mode: Optional[str]):
        if mode is None:
            self._modes.pop(user_id, None)
        else:
            self._modes[user_id] = mode

    def chat(self, user_id: str, text: str, agent_type: str = None) -> str:
        """Send a message to the local agent and return its full reply.

        Non-streaming — waits for completion, returns full text.
        """
        chunks = []

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

        # ── Pre-tool-use validation ──
        from .bot.validator import validate_prompt, ValidationLevel
        validation = validate_prompt(text)
        if validation.needs_confirmation:
            # In strict mode, block and ask for confirmation
            perm = self.get_permission(user_id)
            if perm == PERMISSION_STRICT:
                self._pending_confirmations[user_id] = text
                return f'⚠️ 需要确认才能执行：\n\n{validation.summary()}\n\n回复"确认"继续，或修改指令。'
            # In lax mode, block dangerous commands
            return f"⚠️ 检测到危险操作，已拦截：\n\n{validation.summary()}\n\n如需强制执行，请发 /permission strict 切换到严格模式后手动确认。"

        # ── Call caps check (prevent agent runaway) ──
        from .bot.call_caps import get_call_caps
        caps = get_call_caps()
        allowed, cap_msg = caps.check_and_increment(user_id, text)
        if not allowed:
            return cap_msg

        # ── Build effective prompt with mode injection ──
        effective_text = self._inject_mode_prompt(user_id, text)

        # Check attribution setting
        try:
            from .bot.config import get_attribution
            if not get_attribution():
                effective_text = "【提交归因关闭】\n不要在 git commit message 或 PR 描述中添加 'Generated with Devin' 或 'Co-Authored-By' 等归因信息。\n\n" + effective_text
        except Exception:
            pass

        # Inject compaction context if pending (after /compact)
        if self._compaction_pending.pop(user_id, False):
            effective_text = COMPACTION_CONTEXT + "\n\n" + effective_text
            logger.info(f"[agent_bridge] injected compaction context for {user_id[:12]}...")

        session = self._get_or_create_session(user_id, agent)
        work_dir = session["work_dir"]
        # Save last text for compaction recovery
        session["last_text"] = text[:200]
        # Track message count for usage/context estimation
        session["msg_count"] = session.get("msg_count", 0) + 1

        try:
            if agent == "claude":
                reply = self._call_claude_stream(effective_text, session, work_dir, on_chunk, cancel_event)
            else:
                reply = self._call_devin_stream(effective_text, session, work_dir, on_chunk, cancel_event)
        except subprocess.TimeoutExpired:
            return f"⏰ Agent 执行超时（{DEFAULT_TIMEOUT}s），已中断。可以重试或简化指令。"
        except FileNotFoundError:
            return f"❌ 未找到 {agent} 命令，请确认已安装并在 PATH 中。"
        except Exception as e:
            logger.error(f"Agent bridge error ({agent}): {e}", exc_info=True)
            return f"❌ Agent 执行出错：{str(e)[:100]}"

        return reply.strip()

    def _inject_mode_prompt(self, user_id: str, text: str) -> str:
        """Inject mode-specific prompt prefix based on active mode."""
        mode = self.get_mode(user_id)
        if mode == "learn":
            return LEARN_PROMPT + text
        elif mode == "design":
            return DESIGN_PROMPT + text
        elif mode == "loop":
            return LOOP_PROMPT + text
        return text

    def confirm_pending(self, user_id: str) -> Optional[str]:
        """Get and clear a pending confirmation for a user.

        Returns the confirmed text, or None if no pending confirmation.
        """
        return self._pending_confirmations.pop(user_id, None)

    def has_pending_confirmation(self, user_id: str) -> bool:
        """Check if user has a pending confirmation."""
        return user_id in self._pending_confirmations

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
        Injects SYSTEM_PROMPT + GH_SYSTEM_PROMPT to enforce safe GitHub operations.

        If session ID is "already in use" (e.g. after bot restart), generates
        a new session ID and retries once.
        """
        full_prompt = SYSTEM_PROMPT + GH_SYSTEM_PROMPT + STOP_HOOK_PROMPT + "\n\n" + text

        for attempt in range(2):
            cmd = [
                "claude", "-p", full_prompt,
                "--session-id", session["session_id"],
                "--output-format", "text",
                "--dangerously-skip-permissions",
                "--max-turns", str(MAX_TURN_REQUESTS),
            ]
            logger.info(f"[agent_bridge] claude: session={session['session_id'][:8]}... dir={work_dir} attempt={attempt+1}")
            try:
                return self._run_streaming(cmd, work_dir, on_chunk, cancel_event)
            except RuntimeError as e:
                err_msg = str(e)
                if "already in use" in err_msg and attempt == 0:
                    # Session ID collision (likely after bot restart) — generate fresh ID
                    logger.warning(f"[agent_bridge] session {session['session_id'][:8]}... already in use, creating new session")
                    session["session_id"] = str(uuid.uuid4())
                    continue
                raise

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
        Injects SYSTEM_PROMPT + GH_SYSTEM_PROMPT to enforce safe GitHub operations.
        """
        tmp_dir = Path(tempfile.gettempdir()) / "welian-devin"
        tmp_dir.mkdir(parents=True, exist_ok=True)

        full_prompt = SYSTEM_PROMPT + GH_SYSTEM_PROMPT + STOP_HOOK_PROMPT + "\n\n" + text
        prompt_file = tmp_dir / f"prompt-{uuid.uuid4().hex[:8]}.txt"
        prompt_file.write_text(full_prompt, encoding="utf-8")

        export_file = tmp_dir / f"export-{uuid.uuid4().hex[:8]}.json"

        cmd = [
            "devin",
            "--permission-mode", DEFAULT_PERMISSION,
            "-p",
            "--prompt-file", str(prompt_file),
            "--export", str(export_file),
        ]

        # Model override from config (config/welian.yaml agent.devin.model)
        if DEVIN_MODEL:
            cmd.extend(["--model", DEVIN_MODEL])

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

        Uses a reader thread + queue to detect process completion and avoid
        hanging on stdout EOF when the process doesn't exit promptly.
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
        import queue as _queue
        import threading as _threading

        line_queue: _queue.Queue = _queue.Queue()
        EOF_SENTINEL = None

        def _reader():
            """Read stdout lines into queue. Runs in a daemon thread."""
            try:
                for line in proc.stdout:
                    line_queue.put(line)
            except Exception:
                pass
            finally:
                line_queue.put(EOF_SENTINEL)

        reader_thread = _threading.Thread(target=_reader, daemon=True)
        reader_thread.start()

        stderr = ""
        try:
            while True:
                if cancel_event and cancel_event.is_set():
                    proc.kill()
                    break

                # Wait for next line with timeout — allows checking process status
                try:
                    line = line_queue.get(timeout=5.0)
                except _queue.Empty:
                    # No output for 5s — check if process is still alive
                    if proc.poll() is not None:
                        # Process exited but reader hasn't sent EOF yet — drain remaining
                        while True:
                            try:
                                line = line_queue.get_nowait()
                            except _queue.Empty:
                                break
                            if line is EOF_SENTINEL:
                                break
                            full_output.append(line)
                            if on_chunk and line.strip():
                                try:
                                    on_chunk(line.rstrip("\n"))
                                except Exception:
                                    pass
                        break
                    # Process still running, keep waiting
                    continue

                if line is EOF_SENTINEL:
                    break

                full_output.append(line)
                if on_chunk and line.strip():
                    try:
                        on_chunk(line.rstrip("\n"))
                    except Exception as e:
                        logger.warning(f"on_chunk callback error: {e}")

            # Process exited — wait for it to fully terminate
            proc.wait(timeout=30)

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
            return {
                "active": False,
                "agent": DEFAULT_AGENT,
                "session_id": None,
                "permission": self.get_permission(user_id),
                "mode": self.get_mode(user_id),
            }
        return {
            "active": True,
            "agent": session["agent"],
            "session_id": session["session_id"][:8] + "...",
            "work_dir": session["work_dir"],
            "permission": self.get_permission(user_id),
            "mode": self.get_mode(user_id),
        }

    def reset_session(self, user_id: str) -> str:
        """Clear user's session, starting fresh on next message."""
        self._sessions.pop(user_id, None)
        # Reset call caps for this user
        from .bot.call_caps import get_call_caps
        get_call_caps().reset(user_id)
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
