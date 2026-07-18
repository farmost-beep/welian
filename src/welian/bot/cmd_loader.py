"""Command loader — dynamically loads slash commands from markdown files.

Inspired by claude-code's .claude/commands/*.md pattern. Commands are defined
as markdown files with YAML frontmatter, allowing new commands to be added
without modifying Python code.

Command file format:
    ---
    command: commit
    description: Create a git commit
    permission: lax
    argument-hint: optional args
    ---
    ## Context
    - Current git status: !`git status`
    ## Your task
    Based on the above changes, create a single git commit.

Features:
    - !`command` syntax: shell command output is injected into the prompt
    - $ARGUMENTS: replaced with user's arguments to the command
    - permission: strict (needs confirmation) | lax (auto-execute) | sandbox
"""
from __future__ import annotations

import os
import re
import subprocess
import logging
from pathlib import Path
from typing import Dict, Optional, List

logger = logging.getLogger(__name__)

COMMANDS_DIR = Path(__file__).parent / "commands"

# Regex to parse !`command` syntax in command templates
_SHELL_INJECT_RE = re.compile(r"!`([^`]+)`")
# Regex to parse $ARGUMENTS
_ARGS_RE = re.compile(r"\$ARGUMENTS")


class CommandDef:
    """Definition of a slash command loaded from a markdown file."""

    def __init__(self, name: str, description: str, template: str,
                 permission: str = "lax", argument_hint: str = ""):
        self.name = name
        self.description = description
        self.template = template  # raw markdown body
        self.permission = permission  # strict | lax | sandbox
        self.argument_hint = argument_hint

    def render(self, arguments: str = "", work_dir: str = None) -> str:
        """Render the command template with arguments and shell injections.

        Args:
            arguments: User's arguments to the command
            work_dir: Working directory for shell injections

        Returns:
            Rendered prompt text ready to send to agent
        """
        text = self.template

        # Replace $ARGUMENTS
        text = _ARGS_RE.sub(arguments or "(未指定)", text)

        # Process !`command` injections
        def inject_shell(match):
            cmd = match.group(1)
            try:
                result = subprocess.run(
                    cmd, capture_output=True, text=True, timeout=10,
                    cwd=work_dir, shell=True,
                )
                output = result.stdout.strip()
                if not output and result.stderr.strip():
                    output = f"(error: {result.stderr.strip()[:100]})"
                return output or "(empty)"
            except Exception as e:
                return f"(error: {e})"

        text = _SHELL_INJECT_RE.sub(inject_shell, text)

        return text


def _parse_frontmatter(content: str) -> tuple:
    """Parse YAML frontmatter from markdown content.

    Returns (frontmatter_dict, body_text).
    """
    if not content.startswith("---"):
        return {}, content

    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content

    frontmatter_text = parts[1].strip()
    body = parts[2].strip()

    # Simple YAML parsing (no dependency on PyYAML)
    meta = {}
    for line in frontmatter_text.split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" in line:
            key, _, value = line.partition(":")
            key = key.strip().lower()
            value = value.strip().strip('"').strip("'")
            meta[key] = value

    return meta, body


def load_commands(commands_dir: Path = None) -> Dict[str, CommandDef]:
    """Load all command definitions from the commands directory.

    Returns dict mapping command name → CommandDef.
    """
    commands_dir = commands_dir or COMMANDS_DIR
    commands = {}

    if not commands_dir.exists():
        logger.warning(f"Commands directory not found: {commands_dir}")
        return commands

    for md_file in sorted(commands_dir.glob("*.md")):
        try:
            content = md_file.read_text("utf-8")
            meta, body = _parse_frontmatter(content)

            name = meta.get("command", md_file.stem)
            description = meta.get("description", "")
            permission = meta.get("permission", "lax")
            argument_hint = meta.get("argument-hint", "")

            commands[name] = CommandDef(
                name=name,
                description=description,
                template=body,
                permission=permission,
                argument_hint=argument_hint,
            )
            logger.debug(f"Loaded command: /{name} — {description}")

        except Exception as e:
            logger.warning(f"Failed to load command from {md_file}: {e}")

    logger.info(f"Loaded {len(commands)} commands from {commands_dir}")
    return commands


# ── Singleton loader ──

_commands_cache: Optional[Dict[str, CommandDef]] = None


def get_commands() -> Dict[str, CommandDef]:
    """Get cached command definitions, loading from disk on first call."""
    global _commands_cache
    if _commands_cache is None:
        _commands_cache = load_commands()
    return _commands_cache


def reload_commands() -> Dict[str, CommandDef]:
    """Force reload commands from disk."""
    global _commands_cache
    _commands_cache = load_commands()
    return _commands_cache


def get_command(name: str) -> Optional[CommandDef]:
    """Get a single command by name."""
    return get_commands().get(name)


def list_commands() -> List[str]:
    """List all available command names."""
    return sorted(get_commands().keys())
