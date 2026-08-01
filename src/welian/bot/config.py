"""Configuration layer — user/project/local three-tier config with JSON merge.

Borrowed from Devin CLI's config design:
  ~/.welian/config.json        — user-level defaults (personal, not committed)
  .welian/config.json          — project-level shared config (committed to git)
  .welian/config.local.json    — local overrides (secrets, gitignored)

Merge priority: local > project > user (later overrides earlier).

Supports:
  - permissions: { allow: [...], deny: [...], ask: [...] }
  - model: "claude" | "openai" | engine name
  - agent: { model: "...", work_dir: "..." }
  - mcpServers: { ... }
  - yaml_commands: { max_output: 2000 }
"""
from __future__ import annotations

import os
import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

WELIAN_HOME = Path(os.environ.get("WELIAN_HOME", os.path.expanduser("~/.welian")))


def _deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge override into base. Override values win."""
    result = dict(base)
    for key, val in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(val, dict):
            result[key] = _deep_merge(result[key], val)
        else:
            result[key] = val
    return result


def _user_config_path() -> Path:
    return WELIAN_HOME / "config.json"


def _project_config_path() -> Path:
    """Find project config by walking up from CWD."""
    cwd = Path.cwd()
    for p in [cwd] + list(cwd.parents):
        candidate = p / ".welian" / "config.json"
        if candidate.exists():
            return candidate
    return cwd / ".welian" / "config.json"


def _local_config_path() -> Path:
    """Find local override config."""
    cwd = Path.cwd()
    for p in [cwd] + list(cwd.parents):
        candidate = p / ".welian" / "config.local.json"
        if candidate.exists():
            return candidate
    return cwd / ".welian" / "config.local.json"


def _load_json(path: Path) -> dict:
    """Load JSON file, return empty dict if missing or invalid."""
    if not path.exists():
        return {}
    try:
        text = path.read_text(encoding="utf-8")
        # Strip JSON comments (// and /* */) for convenience
        import re
        text = re.sub(r'//.*?$', '', text, flags=re.MULTILINE)
        text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
        return json.loads(text)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Config load error {path}: {e}")
        return {}


def load_config() -> dict:
    """Load merged config from all three tiers.

    Priority: local > project > user
    """
    user = _load_json(_user_config_path())
    project = _load_json(_project_config_path())
    local = _load_json(_local_config_path())

    merged = _deep_merge(_deep_merge(user, project), local)

    # Inject environment variable overrides (highest priority)
    env_engine = os.environ.get("LLM_ENGINE")
    if env_engine:
        merged.setdefault("ai", {})["engine"] = env_engine
    env_model = os.environ.get("LLM_MODEL") or os.environ.get("ANTHROPIC_MODEL")
    if env_model:
        merged.setdefault("ai", {})["model"] = env_model

    return merged


def save_user_config(config: dict):
    """Save to user-level config file."""
    path = _user_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info(f"User config saved to {path}")


def update_user_config(key_path: str, value: Any):
    """Update a single key in user config. key_path is dot-separated (e.g. 'ai.model')."""
    config = _load_json(_user_config_path())
    parts = key_path.split(".")
    d = config
    for part in parts[:-1]:
        d = d.setdefault(part, {})
    d[parts[-1]] = value
    save_user_config(config)


def get_config_value(key_path: str, default: Any = None) -> Any:
    """Get a value from merged config. key_path is dot-separated."""
    config = load_config()
    parts = key_path.split(".")
    val = config
    for part in parts:
        if isinstance(val, dict) and part in val:
            val = val[part]
        else:
            return default
    return val


# ── Permission rules helpers ──

def get_permission_rules() -> dict:
    """Get permission rules: { allow: [...], deny: [...], ask: [...] }"""
    return get_config_value("permissions", {})


def check_permission_rules(command: str) -> str:
    """Check command against permission rules.

    Returns: "allow" | "deny" | "ask" | None (no rule matched)

    Rule format: "Exec(git *)" or "Exec(rm -rf)" or "Write(src/**)"
    Currently only Exec() rules are checked against shell commands.
    """
    rules = get_permission_rules()

    # Check deny first (highest priority)
    for rule in rules.get("deny", []):
        if _match_rule(rule, command):
            return "deny"

    # Check ask second
    for rule in rules.get("ask", []):
        if _match_rule(rule, command):
            return "ask"

    # Check allow last
    for rule in rules.get("allow", []):
        if _match_rule(rule, command):
            return "allow"

    return None  # no rule matched


def _match_rule(rule: str, command: str) -> bool:
    """Match a permission rule against a command string.

    Rule format: "Exec(pattern)" or "Write(pattern)" or "Read(pattern)"
    Pattern supports glob: * matches anything, ** matches recursively.
    """
    import fnmatch

    # Parse rule: Exec(git push *) → extract "git push *"
    if "(" in rule and rule.endswith(")"):
        tool = rule[:rule.index("(")].strip()
        pattern = rule[rule.index("(") + 1 : -1].strip()
    else:
        return False

    if tool == "Exec":
        # Glob match against command
        return fnmatch.fnmatch(command, pattern)
    elif tool == "Write" or tool == "Read":
        # File path matching — not used for command validation
        return False
    return False


# ── Model config helpers ──

def get_model_config() -> dict:
    """Get AI model configuration."""
    return get_config_value("ai", {})


def set_model(model: str):
    """Set the AI model in user config."""
    update_user_config("ai.model", model)


def set_engine(engine: str):
    """Set the AI engine in user config."""
    update_user_config("ai.engine", engine)


# ── Proxy config ──

def get_proxy_config() -> dict:
    """Get proxy configuration.

    Returns: {"mode": "system"|"manual"|"off", "url": "...", "no_proxy": "..."}
    """
    proxy = get_config_value("proxy", {})
    # Fall back to environment variables
    if not proxy:
        if os.environ.get("HTTP_PROXY") or os.environ.get("HTTPS_PROXY"):
            return {
                "mode": "manual",
                "url": os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY", ""),
                "no_proxy": os.environ.get("NO_PROXY", ""),
            }
    return proxy


def apply_proxy_env():
    """Apply proxy config to environment variables for subprocess inheritance."""
    proxy = get_proxy_config()
    mode = proxy.get("mode", "off")
    url = proxy.get("url", "")
    no_proxy = proxy.get("no_proxy", "")

    if mode == "off":
        for key in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
            os.environ.pop(key, None)
    elif mode == "manual" and url:
        os.environ["HTTP_PROXY"] = url
        os.environ["HTTPS_PROXY"] = url
        if no_proxy:
            os.environ["NO_PROXY"] = no_proxy
    # mode == "system" → don't touch env, let system handle it


# ── Gitignore-aware file access ──

_GITIGNORE_PATTERNS = [
    "node_modules", ".git", "__pycache__", "*.pyc", ".pytest_cache",
    ".mypy_cache", ".ruff_cache", "dist", "build", ".next", ".nuxt",
    ".output", ".turbo", ".vercel", ".wrangler", "vendor", "target",
    "*.egg-info", ".eggs", "*.so", "*.dylib", ".DS_Store", "Thumbs.db",
    ".env", ".env.local", ".env.*.local", "coverage", ".nyc_output",
    "*.log", "*.min.js", "*.min.css", "*.map",
]

def is_gitignored(path: str) -> bool:
    """Check if a path matches common gitignore patterns.

    This is a lightweight check — doesn't parse actual .gitignore files,
    but covers the most common patterns that agents shouldn't touch.
    """
    from pathlib import Path
    p = Path(path)
    parts = p.parts

    for pattern in _GITIGNORE_PATTERNS:
        if pattern.startswith("*"):
            if p.match(pattern):
                return True
        elif pattern in parts:
            return True
        # Check suffix patterns
        if pattern.startswith("*.") and p.suffix == pattern[1:]:
            return True

    return False


# ── Commit attribution control ──

def get_attribution() -> bool:
    """Whether to add 'Generated with Devin/Claude' attribution to commits.

    Returns True by default (attribution enabled).
    Set to False via: update_user_config("attribution", False)
    """
    return get_config_value("attribution", True)


# ── Max turn requests ──

def get_max_turns() -> int:
    """Get max inference rounds per task. Default: 50."""
    return get_config_value("agent.max_turns", 50)
