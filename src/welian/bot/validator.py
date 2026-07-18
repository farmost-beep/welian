"""Bash command validator — intercepts dangerous commands before agent execution.

Inspired by claude-code's bash_command_validator_example.py and security-guidance plugin.
Scans agent prompts for dangerous shell commands and returns warnings that the
WeChat bridge can surface to the user for confirmation.

Usage:
    from .validator import validate_prompt, ValidationLevel
    result = validate_prompt(user_text)
    if result.level == ValidationLevel.BLOCK:
        # send warning to user, wait for confirmation
"""
from __future__ import annotations

import re
from enum import IntEnum
from typing import List, Tuple


class ValidationLevel(IntEnum):
    OK = 0       # no issues
    WARN = 1     # suspicious but allowed with warning
    BLOCK = 2    # dangerous — requires explicit user confirmation


# ── Danger patterns ──
# Each: (regex, level, message)

_DANGER_PATTERNS: List[Tuple[re.Pattern, ValidationLevel, str]] = [
    # ── BLOCK: irreversible / destructive ──
    (
        re.compile(r"\brm\s+-rf?\s+(?:/|~|\$HOME|\.\.|\*|\$OLDPWD)", re.I),
        ValidationLevel.BLOCK,
        "⚠️ 检测到 rm -rf 危险路径（根目录/home/通配符），需要确认后才会执行",
    ),
    (
        re.compile(r"\brm\s+-rf?\s+/", re.I),
        ValidationLevel.BLOCK,
        "⚠️ 检测到 rm -rf 根目录操作，这会删除所有文件，需要确认",
    ),
    (
        re.compile(r"\bgit\s+push\s+(?:--force|-f)\b", re.I),
        ValidationLevel.BLOCK,
        "⚠️ 检测到 git push --force，这会覆盖远程历史，需要确认",
    ),
    (
        re.compile(r"\bgit\s+reset\s+--hard\b", re.I),
        ValidationLevel.BLOCK,
        "⚠️ 检测到 git reset --hard，这会丢弃所有未提交的改动，需要确认",
    ),
    (
        re.compile(r"\bDROP\s+(?:TABLE|DATABASE|SCHEMA)\b", re.I),
        ValidationLevel.BLOCK,
        "⚠️ 检测到 SQL DROP 操作，这会永久删除数据，需要确认",
    ),
    (
        re.compile(r"\bTRUNCATE\s+TABLE\b", re.I),
        ValidationLevel.BLOCK,
        "⚠️ 检测到 SQL TRUNCATE 操作，这会清空表数据，需要确认",
    ),
    (
        re.compile(r"\bDELETE\s+FROM\s+\w+\s*;", re.I),
        ValidationLevel.BLOCK,
        "⚠️ 检测到无 WHERE 条件的 DELETE，这会删除全表数据，需要确认",
    ),
    (
        re.compile(r"\bmkfs\.\w+\b", re.I),
        ValidationLevel.BLOCK,
        "⚠️ 检测到 mkfs 格式化操作，这会擦除磁盘，需要确认",
    ),
    (
        re.compile(r"\bdd\s+if=.*of=/dev/", re.I),
        ValidationLevel.BLOCK,
        "⚠️ 检测到 dd 写入设备操作，这会破坏磁盘数据，需要确认",
    ),
    (
        re.compile(r">\s*/dev/sd[a-z]", re.I),
        ValidationLevel.BLOCK,
        "⚠️ 检测到写入磁盘设备操作，需要确认",
    ),
    (
        re.compile(r"\bchmod\s+-R\s+0?777\s+/", re.I),
        ValidationLevel.BLOCK,
        "⚠️ 检测到 chmod 777 根目录，需要确认",
    ),
    (
        re.compile(r"\bkillall?\s+-9\s+(?:-1|0|init|systemd)", re.I),
        ValidationLevel.BLOCK,
        "⚠️ 检测到 kill 关键进程，需要确认",
    ),

    # ── WARN: suspicious but not necessarily destructive ──
    (
        re.compile(r"\brm\s+-r\b", re.I),
        ValidationLevel.WARN,
        "⚠️ 检测到 rm -r 递归删除，请确认路径正确",
    ),
    (
        re.compile(r"\bgit\s+clean\s+-fd\b", re.I),
        ValidationLevel.WARN,
        "⚠️ git clean -fd 会删除未跟踪的文件",
    ),
    (
        re.compile(r"\bsudo\s+", re.I),
        ValidationLevel.WARN,
        "⚠️ 检测到 sudo 命令，agent 可能需要管理员权限",
    ),
    (
        re.compile(r"\bcurl\s+.*\|\s*(?:bash|sh|zsh)\b", re.I),
        ValidationLevel.WARN,
        "⚠️ 检测到 curl | bash 管道执行，有安全风险",
    ),
    (
        re.compile(r"\bwget\s+.*\|\s*(?:bash|sh|zsh)\b", re.I),
        ValidationLevel.WARN,
        "⚠️ 检测到 wget | bash 管道执行，有安全风险",
    ),
    (
        re.compile(r"\beval\s*\(", re.I),
        ValidationLevel.WARN,
        "⚠️ 检测到 eval() 调用，有代码注入风险",
    ),
    (
        re.compile(r"\bexec\s*\(", re.I),
        ValidationLevel.WARN,
        "⚠️ 检测到 exec() 调用，有代码执行风险",
    ),
    (
        re.compile(r"\bos\.system\s*\(", re.I),
        ValidationLevel.WARN,
        "⚠️ 检测到 os.system() 调用，有命令注入风险",
    ),
    (
        re.compile(r"\bpickle\.loads?\b", re.I),
        ValidationLevel.WARN,
        "⚠️ 检测到 pickle 反序列化，有远程代码执行风险",
    ),
    (
        re.compile(r"\bsubprocess\.call\s*\(.*shell\s*=\s*True", re.I),
        ValidationLevel.WARN,
        "⚠️ 检测到 shell=True 的 subprocess 调用，有注入风险",
    ),
    (
        re.compile(r"\bimport\s+os\b.*\bopen\s*\(", re.I),
        ValidationLevel.WARN,
        "⚠️ 检测到文件操作，请确认路径安全",
    ),
    (
        re.compile(r"\b(?:DROP|ALTER)\s+(?:TABLE|COLUMN)", re.I),
        ValidationLevel.WARN,
        "⚠️ 检测到数据库结构变更操作",
    ),
]

# ── Security patterns (from security-guidance plugin) ──

_SECURITY_PATTERNS: List[Tuple[re.Pattern, ValidationLevel, str]] = [
    (
        re.compile(r"<script\b[^>]*>", re.I),
        ValidationLevel.WARN,
        "⚠️ 检测到 <script> 标签，可能有 XSS 风险",
    ),
    (
        re.compile(r"\binnerHTML\s*=", re.I),
        ValidationLevel.WARN,
        "⚠️ 检测到 innerHTML 赋值，可能有 XSS 风险",
    ),
    (
        re.compile(r"\bdocument\.write\s*\(", re.I),
        ValidationLevel.WARN,
        "⚠️ 检测到 document.write()，可能有 XSS 风险",
    ),
    (
        re.compile(r"\bSELECT\s+.*\bFROM\s+.*\bCONCAT\s*\(", re.I),
        ValidationLevel.WARN,
        "⚠️ 检测到 SQL CONCAT 调用，可能有注入风险",
    ),
    (
        re.compile(r"\b(?:password|secret|api[_-]?key|token)\s*=\s*['\"][^'\"]{8,}['\"]", re.I),
        ValidationLevel.WARN,
        "⚠️ 检测到硬编码密钥/密码，应该使用环境变量",
    ),
]


class ValidationResult:
    """Result of validating a user prompt."""

    def __init__(self, level: ValidationLevel = ValidationLevel.OK, warnings: List[str] = None):
        self.level = level
        self.warnings = warnings or []

    @property
    def is_ok(self) -> bool:
        return self.level == ValidationLevel.OK

    @property
    def needs_confirmation(self) -> bool:
        return self.level >= ValidationLevel.BLOCK

    def add_warning(self, msg: str, level: ValidationLevel = ValidationLevel.WARN):
        self.warnings.append(msg)
        if level > self.level:
            self.level = level

    def summary(self) -> str:
        if not self.warnings:
            return ""
        return "\n".join(self.warnings)


def validate_prompt(text: str) -> ValidationResult:
    """Validate a user prompt for dangerous commands.

    Scans the text for shell commands, SQL statements, and code patterns
    that could be dangerous. Returns a ValidationResult with warnings.
    """
    result = ValidationResult()

    for pattern, level, message in _DANGER_PATTERNS:
        if pattern.search(text):
            result.add_warning(message, level)

    for pattern, level, message in _SECURITY_PATTERNS:
        if pattern.search(text):
            result.add_warning(message, level)

    return result


def validate_command(command: str) -> ValidationResult:
    """Validate a single shell command (more precise than prompt validation).

    Checks in order:
    1. deny/ask/allow permission rules from config.json (highest priority)
    2. Built-in danger patterns (regex)
    3. Call caps (handled separately in call_caps.py)
    """
    result = ValidationResult()

    # ── Check deny/ask/allow rules from config ──
    try:
        from .config import check_permission_rules
        rule_decision = check_permission_rules(command)
        if rule_decision == "deny":
            result.add_warning(
                f"🚫 命令被权限规则拒绝：{command[:60]}",
                ValidationLevel.BLOCK,
            )
            return result  # deny is final
        elif rule_decision == "ask":
            result.add_warning(
                f"⚠️ 命令需要确认（权限规则）：{command[:60]}",
                ValidationLevel.BLOCK,
            )
        # allow → don't add warning, but still check danger patterns below
    except Exception:
        pass  # config not available, fall through to pattern matching

    # ── Built-in danger patterns ──
    for pattern, level, message in _DANGER_PATTERNS:
        if pattern.search(command):
            result.add_warning(message, level)

    return result
