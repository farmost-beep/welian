"""YAML command configuration layer — lightweight CLI tools that bypass the AI agent.

Commands defined in runner.yaml are executed directly via subprocess, without
spinning up Claude/Devin. This is for deterministic shell commands (weather, IP,
deploy scripts) that should return instantly.

Architecture:
  /weather 北京 → yaml_commands.exec_command("weather", "北京") → exec("curl wttr.in/北京") → result

Contrast with cmd_loader.py (markdown commands) which renders prompts for the AI agent.
"""
from __future__ import annotations

import os
import subprocess
import logging
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Dict, List

import yaml

logger = logging.getLogger(__name__)

# ── Config path ──

WELIAN_HOME = Path(os.environ.get("WELIAN_HOME", os.path.expanduser("~/.welian")))
DEFAULT_CONFIG_PATH = WELIAN_HOME / "runner.yaml"

MAX_OUTPUT_DEFAULT = 2000
TIMEOUT_DEFAULT = 30

# ── Security: command whitelist ──

# Allowed command prefixes — the first token of the command must be in this set
# (or in the config-extended allowed_commands list).
DEFAULT_ALLOWED_COMMANDS = frozenset({
    "curl",       # HTTP requests (weather, IP lookup)
    "echo",       # text output
    "date",       # current date/time
    "whoami",     # current user
    "uptime",     # system uptime
    "df",         # disk usage
    "free",       # memory usage
    "ping",       # network diagnostics
    "dig",        # DNS lookup
    "nslookup",   # DNS lookup
    "head",       # file head
    "tail",       # file tail
    "cat",        # file read
    "ls",         # list directory
    "pwd",        # print working directory
    "uname",      # system info
    "hostname",   # hostname
    "ifconfig",   # network config
    "weather",    # custom weather script
    "ip",         # custom IP script
})

# Dangerous commands — blocked if they appear as the command name (first token).
DANGEROUS_COMMANDS = frozenset({
    "rm", "rmdir", "mv", "cp", "chmod", "chown", "kill", "killall",
    "shutdown", "reboot", "halt", "poweroff",
    "sudo", "su", "doas",
    "wget",
    "nc", "ncat", "netcat",
    "dd",
    "mkfs", "fdisk", "parted",
    "iptables", "ufw",
    "crontab",
    "systemctl", "service",
    "mount", "umount",
    "useradd", "userdel", "usermod", "passwd",
    "ssh", "scp", "sftp", "rsync",
    "bash", "sh", "zsh", "dash", "fish",
    "eval", "exec", "source",
    "tar", "zip", "unzip", "gzip", "gunzip", "bzip2",
    "tee", "nohup",
})

# Dangerous characters/patterns — block if present anywhere in the final command.
# Prevents command chaining, piping, redirection, and command substitution.
DANGEROUS_PATTERNS = [
    (";",  "分号（命令分隔）"),
    ("&&", "逻辑与操作符"),
    ("||", "逻辑或操作符"),
    ("|",  "管道符"),
    ("`",  "反引号（命令替换）"),
    ("$(", "命令替换 $()"),
    (">",  "输出重定向"),
    ("<",  "输入重定向"),
]


def validate_command(command: str, extra_allowed: Optional[List[str]] = None) -> tuple:
    """Validate a command against the security whitelist.

    Checks:
      1. No dangerous characters/patterns (prevents injection and chaining)
      2. First token is not a dangerous command
      3. First token is in the allowed command set

    Args:
        command: The final interpolated command string to execute
        extra_allowed: Additional allowed command names from config

    Returns:
        (is_safe, error_message) — error_message is empty when is_safe is True
    """
    if not command or not command.strip():
        return False, "空命令"

    stripped = command.strip()

    # 1. Check for dangerous characters/patterns
    for pattern, desc in DANGEROUS_PATTERNS:
        if pattern in stripped:
            return False, f"命令包含禁止字符: {desc}"

    # 2. Extract first token (command name), strip any path prefix
    tokens = stripped.split()
    if not tokens:
        return False, "空命令"

    first_token = tokens[0]
    first_cmd = first_token.rsplit("/", 1)[-1]  # /usr/bin/curl → curl

    # 3. Check against dangerous commands
    if first_cmd.lower() in DANGEROUS_COMMANDS:
        return False, f"禁止的命令: {first_cmd}"

    # 4. Check against allowed commands
    allowed = DEFAULT_ALLOWED_COMMANDS
    if extra_allowed:
        allowed = allowed | frozenset(extra_allowed)

    if first_cmd not in allowed:
        return False, f"命令不在白名单中: {first_cmd}（允许: {', '.join(sorted(allowed))}）"

    return True, ""


@dataclass
class YamlCommand:
    """A single YAML-defined command."""
    name: str
    exec: str
    description: str = ""
    timeout: int = TIMEOUT_DEFAULT
    max_output: int = MAX_OUTPUT_DEFAULT


@dataclass
class YamlCommandConfig:
    """Full YAML command configuration."""
    commands: Dict[str, YamlCommand] = field(default_factory=dict)
    max_output: int = MAX_OUTPUT_DEFAULT
    allowed_commands: List[str] = field(default_factory=list)
    config_path: str = str(DEFAULT_CONFIG_PATH)

    def get_command(self, name: str) -> Optional[YamlCommand]:
        return self.commands.get(name)

    def list_commands(self) -> List[str]:
        return sorted(self.commands.keys())

    def add_command(self, name: str, exec: str, description: str = "", timeout: int = TIMEOUT_DEFAULT):
        self.commands[name] = YamlCommand(
            name=name, exec=exec, description=description, timeout=timeout,
            max_output=self.max_output,
        )
        self.save()

    def remove_command(self, name: str) -> bool:
        if name in self.commands:
            del self.commands[name]
            self.save()
            return True
        return False

    def save(self):
        """Save config back to YAML file."""
        data = {
            "max_output": self.max_output,
            "allowed_commands": self.allowed_commands,
            "commands": {
                name: {
                    "description": cmd.description,
                    "exec": cmd.exec,
                    "timeout": cmd.timeout,
                }
                for name, cmd in self.commands.items()
            }
        }
        path = Path(self.config_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(yaml.dump(data, allow_unicode=True, default_flow_style=False), encoding="utf-8")
        logger.info(f"YAML commands saved to {path}")

    def reload(self):
        """Hot-reload from YAML file."""
        self.commands.clear()
        self._load()
        logger.info(f"YAML commands reloaded: {len(self.commands)} commands")


# ── Singleton ──

_config: Optional[YamlCommandConfig] = None


def get_config(config_path: str = None) -> YamlCommandConfig:
    """Get or create the singleton config instance."""
    global _config
    if _config is None:
        path = config_path or str(DEFAULT_CONFIG_PATH)
        _config = load_config(path)
    return _config


def load_config(config_path: str) -> YamlCommandConfig:
    """Load YAML command config from file. Creates default if missing."""
    path = Path(config_path)
    config = YamlCommandConfig(config_path=str(path))

    if not path.exists():
        # Create with example commands
        config.max_output = MAX_OUTPUT_DEFAULT
        config.commands = {
            "weather": YamlCommand(
                name="weather",
                exec="curl -s 'wttr.in/${args}?format=3'",
                description="查天气",
                timeout=10,
            ),
            "ip": YamlCommand(
                name="ip",
                exec="curl -s ifconfig.me",
                description="查公网 IP",
                timeout=5,
            ),
        }
        config.save()
        logger.info(f"Created default runner.yaml at {path}")
    else:
        config._load()

    return config


# Add _load method to YamlCommandConfig
def _load(self: YamlCommandConfig):
    """Load commands from YAML file."""
    path = Path(self.config_path)
    if not path.exists():
        return

    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not raw:
        return

    self.max_output = raw.get("max_output", MAX_OUTPUT_DEFAULT)
    self.allowed_commands = raw.get("allowed_commands", [])
    commands = raw.get("commands", {})
    for name, cmd_data in commands.items():
        self.commands[name] = YamlCommand(
            name=name,
            exec=cmd_data.get("exec", ""),
            description=cmd_data.get("description", ""),
            timeout=cmd_data.get("timeout", TIMEOUT_DEFAULT),
            max_output=self.max_output,
        )

YamlCommandConfig._load = _load


# ── Execution ──

def exec_command(name: str, args: str = "") -> str:
    """Execute a YAML command directly. Returns output string.

    Args:
        name: Command name (key in runner.yaml)
        args: Raw arguments from user, interpolated into ${args} placeholder

    Returns:
        Command output (truncated to max_output), or error message
    """
    config = get_config()
    cmd = config.get_command(name)
    if not cmd:
        available = ", ".join(f"/{c}" for c in config.list_commands())
        return f"未知命令: /{name}\n可用命令: {available}"

    # Interpolate ${args} — note: this is shell injection by design
    # Security is handled by: (1) only trusted users, (2) timeout, (3) output limit
    command = cmd.exec.replace("${args}", args or "")
    timeout = cmd.timeout
    max_output = cmd.max_output

    # Security check: validate against whitelist before execution
    is_safe, error_msg = validate_command(command, config.allowed_commands)
    if not is_safe:
        logger.warning(f"[yaml_commands] blocked /{name}: {error_msg} (command: {command[:80]})")
        return f"⛔ 命令被安全检查拦截: {error_msg}"

    logger.info(f"[yaml_commands] exec: /{name} {args} → {command[:80]}")

    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        output = result.stdout.strip()
        if not output and result.stderr.strip():
            output = result.stderr.strip()
        if not output:
            output = "(无输出)"

        if len(output) > max_output:
            output = output[:max_output - 20] + "\n... (输出已截断)"

        return output

    except subprocess.TimeoutExpired:
        return f"命令超时（{timeout}s）"
    except Exception as e:
        return f"命令执行失败: {str(e)[:200]}"


def is_yaml_command(name: str) -> bool:
    """Check if a command name exists in YAML config."""
    config = get_config()
    return name in config.commands


def get_help_text() -> str:
    """Generate help text for YAML commands."""
    config = get_config()
    cmds = config.list_commands()
    if not cmds:
        return ""

    lines = ["CLI 工具命令（直接执行，不经过 AI）："]
    for name in cmds:
        cmd = config.get_command(name)
        desc = cmd.description if cmd and cmd.description else name
        lines.append(f"  /{name} — {desc}")
    return "\n".join(lines)
