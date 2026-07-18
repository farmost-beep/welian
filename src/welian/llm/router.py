"""LLM Router - 根据配置自动选择provider

设计：
- 单例工厂：get_client() 每次返回相同实例（避免重复初始化）
- 配置优先级：config.local.yaml > config.yaml > 环境变量
- provider注册表：可扩展，只需在 _PROVIDERS 添加
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional, Dict, Type

import yaml

from .base import LLMClient, LLMAuthError
from .claude import ClaudeClient
from .openai import OpenAIClient
from .cloud import CloudLLMClient


# ── Provider 注册表 ──

_PROVIDERS: Dict[str, Type[LLMClient]] = {
    "claude": ClaudeClient,
    "openai": OpenAIClient,
    "cloud": CloudLLMClient,  # 方案C: 批发赚价差模式
    # 未来扩展：只需在这里加一行
    # "minimax": MiniMaxClient,
    # "local_ollama": OllamaClient,
}


# ── 单例缓存 ──

_client_instance: Optional[LLMClient] = None


def _find_project_root() -> Optional[Path]:
    """查找项目根目录（含 config/ 目录）

    优先级：
    1. 环境变量 WELIAN_HOME
    2. 包内目录（从 llm/router.py 向上三层到项目根）
    3. ~/.welian/
    4. 当前工作目录
    """
    # 1. 环境变量
    env = os.environ.get("WELIAN_HOME")
    if env and (Path(env) / "config").is_dir():
        return Path(env)

    # 2. 包内目录（src/welian/llm/router.py → src/welian/ → src/ → 项目根）
    pkg_root = Path(__file__).resolve().parent.parent.parent.parent
    if (pkg_root / "config").is_dir():
        return pkg_root
    # PyPI 安装：src/welian/llm/router.py → src/welian/ → src/
    pkg_src = Path(__file__).resolve().parent.parent.parent
    if (pkg_src / "config").is_dir():
        return pkg_src

    # 3. 用户目录
    user_dir = Path.home() / ".welian"
    if user_dir.is_dir() and (user_dir / "config").is_dir():
        return user_dir

    # 4. 当前工作目录
    cwd = Path.cwd()
    if (cwd / "config").is_dir():
        return cwd
    return None


def _load_llm_config() -> dict:
    """从 welian.yaml / config.local.yaml 读取 ai 段"""
    root = _find_project_root()
    if root is None:
        return {}

    config_paths = [
        root / "config" / "config.local.yaml",
        root / "config" / "welian.yaml",
        root / "config" / "config.yaml",
    ]

    for cp in config_paths:
        if cp.exists():
            try:
                with open(cp, "r", encoding="utf-8") as f:
                    cfg = yaml.safe_load(f) or {}
                    return cfg.get("ai", {}) or {}
            except (yaml.YAMLError, OSError):
                continue

    return {}


def _load_claude_settings_env() -> dict:
    """从 ~/.claude/settings.json 读取 env 段（系统已配置的 LLM 环境变量）

    Claude Code 用户通常在 settings.json 的 env 段配置 API Key / base_url / model。
    此函数让 social CLI 独立运行时也能复用这些配置，无需重复设置环境变量。
    """
    import json

    settings_path = Path.home() / ".claude" / "settings.json"
    if not settings_path.exists():
        return {}

    try:
        with open(settings_path, "r", encoding="utf-8") as f:
            cfg = json.load(f) or {}
        return cfg.get("env", {}) or {}
    except (json.JSONDecodeError, OSError):
        return {}


def get_client(force_new: bool = False, cloud_url: str = "", user_token: str = "") -> LLMClient:
    """获取 LLM Client 单例

    优先级：
    1. cloud_url 非空 → cloud 模式（方案C: 批发赚价差）
    2. ai.engine 指定（"claude"/"openai"）
    3. 环境变量 LLM_ENGINE
    4. 默认 "claude"

    Args:
        force_new: 强制创建新实例（用于测试或切换配置）
        cloud_url: Welian 云端 URL（非空时启用 cloud 模式）
        user_token: 用户认证 token（cloud 模式用）

    Returns:
        LLMClient 实例

    Raises:
        LLMAuthError: 无可用provider或认证失败
    """
    global _client_instance

    # Cloud mode (方案C): route through Welian cloud billing gateway
    if cloud_url:
        if _client_instance is not None and not force_new:
            if isinstance(_client_instance, CloudLLMClient):
                return _client_instance
        _client_instance = CloudLLMClient(
            cloud_url=cloud_url,
            user_token=user_token or os.environ.get("WELIAN_USER_TOKEN", ""),
        )
        return _client_instance

    if _client_instance is not None and not force_new:
        return _client_instance

    # 从 ~/.claude/settings.json 注入系统已配置的环境变量（不覆盖已有值）
    for key, val in _load_claude_settings_env().items():
        if key not in os.environ and val:
            os.environ[key] = val

    config = _load_llm_config()

    # 决定 provider
    engine = (
        config.get("engine")
        or os.environ.get("LLM_ENGINE")
        or "claude"
    )

    if engine not in _PROVIDERS:
        raise LLMAuthError(
            f"未知 LLM engine: '{engine}'。"
            f"可用: {', '.join(_PROVIDERS.keys())}"
        )

    client_cls = _PROVIDERS[engine]

    # 构造客户端参数
    # 优先级：环境变量 > config.yaml > client 默认值
    kwargs = {}
    env_model = (
        os.environ.get("ANTHROPIC_MODEL")
        or os.environ.get("OPENAI_MODEL")
        or os.environ.get("LLM_MODEL")
    )
    if not env_model and "model" in config:
        kwargs["model"] = config["model"]
    if "api_key" in config:
        kwargs["api_key"] = config["api_key"]
    if "base_url" in config:
        kwargs["base_url"] = config["base_url"]

    _client_instance = client_cls(**kwargs)
    return _client_instance


def reset_client() -> None:
    """重置单例（测试或切换配置用）"""
    global _client_instance
    _client_instance = None


def list_providers() -> list:
    """列出所有可用 provider（用于CLI提示）"""
    return list(_PROVIDERS.keys())


# ── Adaptive model routing ──

# Task complexity → model mapping
# Simple tasks (greetings, quick questions) → cheaper model
# Complex tasks (coding, analysis, multi-step) → capable model
_ADAPTIVE_RULES = [
    # (regex pattern, engine, model) — first match wins
    (r"^(你好|hi|hello|hey|在吗|谢谢|ok|好的|嗯|👍|😊)", "openai", None),  # greetings → cheap
    (r"^(什么是|解释一下|什么意思|怎么说|怎么写)", "openai", None),  # simple questions → cheap
    (r"(写代码|实现|修复|重构|review|审查|提交|commit|push|PR|部署|deploy)", "claude", None),  # coding → strong
    (r"(分析|设计|架构|方案|计划|对比|评估)", "claude", None),  # analysis → strong
]

import re as _re

def adaptive_route(text: str) -> tuple:
    """Route text to appropriate engine+model based on content complexity.

    Returns (engine, model) tuple. Model may be None (use default).
    """
    text_lower = text.lower().strip()
    for pattern, engine, model in _ADAPTIVE_RULES:
        if _re.search(pattern, text_lower, _re.I):
            return engine, model
    # Default: claude for unknown complexity
    return "claude", None


def get_client_adaptive(text: str, force_new: bool = False) -> LLMClient:
    """Get LLM client with adaptive routing based on text content.

    Only routes if engine is set to "adaptive" in config.
    Otherwise falls back to normal get_client().
    """
    from ..bot.config import get_config_value
    engine = get_config_value("ai.engine", "claude")

    if engine == "adaptive":
        routed_engine, routed_model = adaptive_route(text)
        # Temporarily set env vars for this routing
        old_engine = os.environ.get("LLM_ENGINE")
        old_model = os.environ.get("LLM_MODEL")
        os.environ["LLM_ENGINE"] = routed_engine
        if routed_model:
            os.environ["LLM_MODEL"] = routed_model
        try:
            return get_client(force_new=True)
        finally:
            # Restore env
            if old_engine:
                os.environ["LLM_ENGINE"] = old_engine
            else:
                os.environ.pop("LLM_ENGINE", None)
            if old_model:
                os.environ["LLM_MODEL"] = old_model
            else:
                os.environ.pop("LLM_MODEL", None)

    return get_client(force_new=force_new)