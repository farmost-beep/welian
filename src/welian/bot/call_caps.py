"""Call caps — limit how many times specific commands can be executed per session.

Inspired by claude-code's CLAUDE_CODE_SCRIPT_CAPS environment variable, which
limits each script's call count per session (e.g., {"edit-issue-labels.sh": 2}).

In welian, this prevents the agent from running runaway loops — e.g., calling
`git push` 50 times in a single session, or creating 20 PRs.

Usage:
    from .call_caps import CallCapManager
    caps = CallCapManager()
    caps.set_default("git push", 5)        # max 5 git push per session
    caps.set_default("gh pr create", 2)    # max 2 PR creations per session

    # Check before executing
    if caps.check_and_increment(user_id, "git push"):
        # allowed
    else:
        # over cap — block

Config: ~/.welian/call_caps.json
{
  "defaults": {
    "git push": 5,
    "gh pr create": 2,
    "npm publish": 1,
    "rm -rf": 0
  }
}
"""
from __future__ import annotations

import json
import os
import re
import logging
from pathlib import Path
from typing import Dict, Optional, Tuple
from collections import defaultdict

logger = logging.getLogger(__name__)

# ── Default caps (applied to all users unless overridden) ──
DEFAULT_CAPS: Dict[str, int] = {
    "git push": 10,           # max 10 pushes per session
    "git push --force": 0,    # force push always blocked (0 = never)
    "git push -f": 0,         # force push always blocked
    "gh pr create": 3,        # max 3 PR creations per session
    "gh pr merge": 0,         # merge always blocked
    "gh pr close": 0,         # close always blocked
    "gh issue close": 0,      # close issue always blocked
    "gh issue delete": 0,     # delete issue always blocked
    "npm publish": 1,         # max 1 publish per session
    "pip install": 20,        # max 20 pip installs
    "rm -rf": 0,              # rm -rf always blocked (validator handles this too)
    "docker push": 3,         # max 3 docker pushes
    "docker rm": 5,           # max 5 container removals
    "kubectl delete": 3,      # max 3 k8s deletions
    "terraform destroy": 0,   # destroy always blocked
    "DROP TABLE": 0,          # SQL DROP always blocked
    "DROP DATABASE": 0,       # SQL DROP always blocked
}

# ── Regex patterns for matching commands to cap categories ──
# Each pattern maps a command string to a cap key
_CAP_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bgit\s+push\s+--force\b", re.I), "git push --force"),
    (re.compile(r"\bgit\s+push\s+-f\b", re.I), "git push -f"),
    (re.compile(r"\bgit\s+push\b", re.I), "git push"),
    (re.compile(r"\bgh\s+pr\s+create\b", re.I), "gh pr create"),
    (re.compile(r"\bgh\s+pr\s+merge\b", re.I), "gh pr merge"),
    (re.compile(r"\bgh\s+pr\s+close\b", re.I), "gh pr close"),
    (re.compile(r"\bgh\s+issue\s+close\b", re.I), "gh issue close"),
    (re.compile(r"\bgh\s+issue\s+delete\b", re.I), "gh issue delete"),
    (re.compile(r"\bnpm\s+publish\b", re.I), "npm publish"),
    (re.compile(r"\bpip\s+install\b", re.I), "pip install"),
    (re.compile(r"\brm\s+-rf\b", re.I), "rm -rf"),
    (re.compile(r"\bdocker\s+push\b", re.I), "docker push"),
    (re.compile(r"\bdocker\s+rm\b", re.I), "docker rm"),
    (re.compile(r"\bkubectl\s+delete\b", re.I), "kubectl delete"),
    (re.compile(r"\bterraform\s+destroy\b", re.I), "terraform destroy"),
    (re.compile(r"\bDROP\s+TABLE\b", re.I), "DROP TABLE"),
    (re.compile(r"\bDROP\s+DATABASE\b", re.I), "DROP DATABASE"),
]


class CallCapManager:
    """Manages per-user, per-command call caps.

    Tracks how many times each command category has been called
    per user session. Blocks execution when the cap is exceeded.
    """

    def __init__(self, config_path: Optional[str] = None):
        self._caps: Dict[str, int] = dict(DEFAULT_CAPS)
        self._counts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._config_path = config_path or str(
            Path(os.environ.get("WELIAN_HOME", os.path.expanduser("~/.welian"))) / "call_caps.json"
        )
        self._load_config()

    def _load_config(self):
        """Load custom caps from config file, merging with defaults."""
        path = Path(self._config_path)
        if not path.exists():
            return
        try:
            data = json.loads(path.read_text("utf-8"))
            custom_caps = data.get("defaults", {})
            self._caps.update(custom_caps)
            logger.info(f"Loaded call caps from {self._config_path}: {len(custom_caps)} overrides")
        except Exception as e:
            logger.warning(f"Failed to load call caps config: {e}")

    def _match_command(self, text: str) -> list[str]:
        """Match text against cap patterns, return matched cap keys."""
        matched = []
        for pattern, cap_key in _CAP_PATTERNS:
            if pattern.search(text):
                matched.append(cap_key)
        return matched

    def check(self, user_id: str, text: str) -> Tuple[bool, str]:
        """Check if text contains commands that are within their caps.

        Args:
            user_id: WeChat user ID
            text: Text to check (user message or agent prompt)

        Returns:
            (allowed, message) — True if all commands within caps,
            False if any command exceeds its cap. message explains the block.
        """
        matched_keys = self._match_command(text)
        if not matched_keys:
            return True, ""

        for cap_key in matched_keys:
            cap_limit = self._caps.get(cap_key, -1)  # -1 = no limit
            if cap_limit == -1:
                continue

            current_count = self._counts[user_id][cap_key]

            if cap_limit == 0:
                return False, (
                    f"⛔ 操作 '{cap_key}' 被完全禁止（cap=0）。\n"
                    f"如需执行此操作，请联系管理员修改 call_caps.json 配置。"
                )

            if current_count >= cap_limit:
                return False, (
                    f"⛔ 操作 '{cap_key}' 已达到上限（{current_count}/{cap_limit}）。\n"
                    f"这是为了防止 agent 失控的安全限制。\n"
                    f"发 /reset 重置会话可清除计数。"
                )

        return True, ""

    def check_and_increment(self, user_id: str, text: str) -> Tuple[bool, str]:
        """Check caps and increment counters if allowed.

        Args:
            user_id: WeChat user ID
            text: Text to check

        Returns:
            (allowed, message) — True if all commands within caps
            and counters have been incremented. False if blocked.
        """
        allowed, message = self.check(user_id, text)
        if not allowed:
            return False, message

        # Increment counters for matched commands
        matched_keys = self._match_command(text)
        for cap_key in matched_keys:
            self._counts[user_id][cap_key] += 1

        return True, ""

    def get_counts(self, user_id: str) -> Dict[str, int]:
        """Get current call counts for a user."""
        return dict(self._counts.get(user_id, {}))

    def get_cap(self, command: str) -> int:
        """Get the cap limit for a command."""
        return self._caps.get(command, -1)

    def set_cap(self, command: str, limit: int):
        """Set a custom cap for a command (runtime override)."""
        self._caps[command] = limit

    def reset(self, user_id: str):
        """Reset call counts for a user (called on /reset)."""
        self._counts.pop(user_id, None)

    def summary(self, user_id: str) -> str:
        """Get a human-readable summary of current caps and usage."""
        counts = self.get_counts(user_id)
        if not counts:
            return "无调用记录"

        lines = []
        for cap_key, count in sorted(counts.items()):
            limit = self._caps.get(cap_key, -1)
            if limit == -1:
                lines.append(f"  {cap_key}: {count} (无限制)")
            elif limit == 0:
                lines.append(f"  {cap_key}: {count} (禁止)")
            else:
                lines.append(f"  {cap_key}: {count}/{limit}")

        return "\n".join(lines)


# ── Singleton ──

_cap_manager: Optional[CallCapManager] = None


def get_call_caps() -> CallCapManager:
    global _cap_manager
    if _cap_manager is None:
        _cap_manager = CallCapManager()
    return _cap_manager
