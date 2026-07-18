"""Hook system — PreToolUse / PostToolUse / Stop event hooks.

Inspired by claude-code's hook architecture. Allows external scripts to
intercept agent actions at key lifecycle points:

  PreToolUse  — before agent executes a tool (can block)
  PostToolUse — after agent executes a tool (can warn)
  Stop        — when agent finishes a task (can re-awaken)

Hooks are configured in ~/.welian/hooks.json:
{
  "PreToolUse": [
    {"matcher": "Bash", "command": "python3 /path/to/validator.py", "timeout": 10}
  ],
  "PostToolUse": [
    {"matcher": "Edit|Write", "command": "python3 /path/to/security_check.py"}
  ],
  "Stop": [
    {"command": "python3 /path/to/summary.py", "asyncRewake": false}
  ]
}

Hook scripts receive JSON on stdin:
  {"tool_name": "Bash", "tool_input": {"command": "rm -rf /"}, "user_id": "xxx"}

Hook scripts output JSON on stdout:
  {"block": true, "message": "Dangerous command blocked"}
  {"warn": "This looks suspicious"}
  {} (no action — allow)
"""
from __future__ import annotations

import json
import os
import subprocess
import logging
import time
from pathlib import Path
from typing import Dict, List, Optional, Callable

logger = logging.getLogger(__name__)

HOOK_TIMEOUT_DEFAULT = 10  # seconds


class HookConfig:
    """Configuration for a single hook."""

    def __init__(self, event: str, matcher: str, command: str,
                 timeout: int = HOOK_TIMEOUT_DEFAULT, async_rewake: bool = False,
                 rewake_message: str = "", rewake_summary: str = ""):
        self.event = event
        self.matcher = matcher  # regex pattern to match tool names, or "*" for all
        self.command = command
        self.timeout = timeout
        self.async_rewake = async_rewake
        self.rewake_message = rewake_message
        self.rewake_summary = rewake_summary

    def matches(self, tool_name: str) -> bool:
        """Check if this hook's matcher matches the given tool name."""
        if self.matcher == "*" or not self.matcher:
            return True
        import re
        return bool(re.match(self.matcher, tool_name, re.I))


class HookResult:
    """Result from running a hook."""

    def __init__(self, block: bool = False, warn: str = "", message: str = "",
                 rewake: bool = False, rewake_message: str = ""):
        self.block = block
        self.warn = warn
        self.message = message
        self.rewake = rewake
        self.rewake_message = rewake_message


class HookManager:
    """Manages hook lifecycle for agent interactions.

    Loads hook configuration from ~/.welian/hooks.json and executes
    hook scripts at the appropriate lifecycle events.
    """

    def __init__(self, config_path: Optional[str] = None):
        self._hooks: Dict[str, List[HookConfig]] = {
            "PreToolUse": [],
            "PostToolUse": [],
            "Stop": [],
            "SessionStart": [],
            "UserPromptSubmit": [],
        }
        self._config_path = config_path or str(
            Path(os.environ.get("WELIAN_HOME", os.path.expanduser("~/.welian"))) / "hooks.json"
        )
        self._load()

    def _load(self):
        """Load hook configuration from JSON file."""
        path = Path(self._config_path)
        if not path.exists():
            logger.debug(f"No hooks config at {self._config_path}")
            return

        try:
            data = json.loads(path.read_text("utf-8"))
            hooks_data = data.get("hooks", data)

            for event, hook_list in hooks_data.items():
                if event not in self._hooks:
                    continue
                for hook_entry in hook_list:
                    matcher = hook_entry.get("matcher", "*")
                    hooks = hook_entry.get("hooks", [])
                    for h in hooks:
                        cmd = h.get("command", "")
                        if not cmd:
                            continue
                        timeout = h.get("timeout", HOOK_TIMEOUT_DEFAULT)
                        async_rewake = h.get("asyncRewake", False)
                        rewake_msg = h.get("rewakeMessage", "")
                        rewake_summary = h.get("rewakeSummary", "")
                        self._hooks[event].append(HookConfig(
                            event, matcher, cmd, timeout, async_rewake, rewake_msg, rewake_summary
                        ))

            total = sum(len(v) for v in self._hooks.values())
            if total > 0:
                logger.info(f"Loaded {total} hooks from {self._config_path}")

        except Exception as e:
            logger.warning(f"Failed to load hooks config: {e}")

    def run_hooks(self, event: str, tool_name: str, tool_input: dict,
                  user_id: str = "", extra: dict = None) -> List[HookResult]:
        """Run all hooks for a given event that match the tool name.

        Returns list of HookResults from each hook.
        """
        results = []
        for hook in self._hooks.get(event, []):
            if not hook.matches(tool_name):
                continue

            result = self._run_hook(hook, tool_name, tool_input, user_id, extra or {})
            results.append(result)

            # If a hook blocks, stop running further hooks
            if result.block:
                break

        return results

    def _run_hook(self, hook: HookConfig, tool_name: str, tool_input: dict,
                  user_id: str, extra: dict) -> HookResult:
        """Execute a single hook script."""
        stdin_data = json.dumps({
            "tool_name": tool_name,
            "tool_input": tool_input,
            "user_id": user_id,
            "event": hook.event,
            **extra,
        })

        try:
            proc = subprocess.run(
                hook.command,
                input=stdin_data,
                capture_output=True,
                text=True,
                timeout=hook.timeout,
                shell=True,
            )

            if proc.returncode == 2:
                # Exit code 2 = block + show stderr to agent
                return HookResult(block=True, message=proc.stderr.strip())

            if proc.returncode != 0:
                logger.warning(f"Hook {hook.command[:50]}... exited {proc.returncode}: {proc.stderr[:100]}")
                if proc.stderr.strip():
                    return HookResult(warn=proc.stderr.strip())
                return HookResult()

            # Parse stdout JSON
            if proc.stdout.strip():
                try:
                    data = json.loads(proc.stdout)
                    return HookResult(
                        block=data.get("block", False),
                        warn=data.get("warn", ""),
                        message=data.get("message", ""),
                        rewake=hook.async_rewake,
                        rewake_message=hook.rewake_message,
                    )
                except json.JSONDecodeError:
                    pass

            return HookResult()

        except subprocess.TimeoutExpired:
            logger.warning(f"Hook {hook.command[:50]}... timed out ({hook.timeout}s)")
            return HookResult()
        except Exception as e:
            logger.warning(f"Hook execution error: {e}")
            return HookResult()

    def has_hooks(self, event: str) -> bool:
        """Check if any hooks are registered for an event."""
        return len(self._hooks.get(event, [])) > 0


# ── Built-in hooks (always active, no config needed) ──

def builtin_pre_tool_use(tool_name: str, tool_input: dict, user_id: str) -> HookResult:
    """Built-in PreToolUse hook — always runs, provides baseline safety.

    Uses the validator module to check for dangerous commands.
    """
    from .validator import validate_command, validate_prompt

    if tool_name == "Bash":
        command = tool_input.get("command", "")
        if command:
            result = validate_command(command)
            if result.needs_confirmation:
                return HookResult(block=True, message=result.summary())
            if result.warnings:
                return HookResult(warn=result.summary())

    # Also scan text content in prompts for dangerous patterns
    text = tool_input.get("text", "") or tool_input.get("prompt", "")
    if text:
        result = validate_prompt(text)
        if result.needs_confirmation:
            return HookResult(block=True, message=result.summary())
        if result.warnings:
            return HookResult(warn=result.summary())

    return HookResult()


# Singleton

_hook_manager: Optional[HookManager] = None


def get_hook_manager() -> HookManager:
    global _hook_manager
    if _hook_manager is None:
        _hook_manager = HookManager()
    return _hook_manager
