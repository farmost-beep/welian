"""Anthropic Claude API 客户端

直接HTTP调用 https://api.anthropic.com，不依赖 anthropic SDK
- 最小依赖：只依赖 httpx（项目本身可能已有）
- 支持自定义 base_url（用于代理/中转）
- 错误映射：HTTP status → LLMError 子类
"""
from __future__ import annotations

import os
import json
from typing import Optional, Any

try:
    import httpx
except ImportError:
    httpx = None  # 允许延迟报错（调用时才报）

from .base import (
    LLMClient,
    LLMError,
    LLMAuthError,
    LLMRateLimitError,
    LLMTimeoutError,
    LLMResponseError,
)


DEFAULT_BASE_URL = "https://api.anthropic.com"
DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_MAX_TOKENS = 4096
DEFAULT_TIMEOUT = 30.0


class ClaudeClient(LLMClient):
    """Anthropic Claude API 客户端

    用法：
        client = ClaudeClient(api_key="sk-ant-...")
        text = client.complete("你好")

    或从环境变量：
        os.environ["ANTHROPIC_API_KEY"] = "sk-ant-..."
        client = ClaudeClient()
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ):
        if httpx is None:
            raise ImportError("请先安装 httpx: pip install httpx")

        # API Key 优先级：参数 > ANTHROPIC_API_KEY > ANTHROPIC_AUTH_TOKEN
        # ANTHROPIC_AUTH_TOKEN 是 Anthropic SDK 内部使用的环境变量名
        # 支持它让 social-cli 与 Claude Code / MiniMax 代理无缝兼容
        self.api_key = (
            api_key
            or os.environ.get("ANTHROPIC_API_KEY")
            or os.environ.get("ANTHROPIC_AUTH_TOKEN")
        )
        if not self.api_key:
            raise LLMAuthError(
                "未设置 ANTHROPIC_API_KEY 或 ANTHROPIC_AUTH_TOKEN"
                "（可通过环境变量或参数传入）"
            )

        self.model = model or os.environ.get("ANTHROPIC_MODEL") or DEFAULT_MODEL
        self.base_url = (base_url or os.environ.get("ANTHROPIC_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout or DEFAULT_TIMEOUT
        self.max_tokens = max_tokens or DEFAULT_MAX_TOKENS

    def complete(
        self,
        prompt: str,
        system: Optional[str] = None,
        messages: Optional[list] = None,
        **kwargs: Any,
    ) -> str:
        """调用 /v1/messages 端点

        文档：https://docs.anthropic.com/en/api/messages
        """
        # 构造请求体
        if messages is None:
            messages = []
        else:
            messages = list(messages)  # shallow copy
        if prompt:
            messages.append({"role": "user", "content": prompt})
        body = {
            "model": kwargs.get("model", self.model),
            "max_tokens": kwargs.get("max_tokens", self.max_tokens),
            "messages": messages,
        }
        if system:
            body["system"] = system
        if "temperature" in kwargs:
            body["temperature"] = kwargs["temperature"]

        # 构造请求头
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        url = f"{self.base_url}/v1/messages"

        # 发起请求
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(url, headers=headers, json=body)
        except httpx.TimeoutException as e:
            raise LLMTimeoutError(f"Claude API 调用超时（{self.timeout}s）") from e
        except httpx.HTTPError as e:
            raise LLMError(f"HTTP错误: {e}") from e

        # 状态码映射
        return self._handle_response(resp)

    def _handle_response(self, resp) -> str:
        """统一处理HTTP响应，映射错误"""
        status = resp.status_code

        # 401/403: 认证失败
        if status in (401, 403):
            raise LLMAuthError(
                f"认证失败（{status}）: {resp.text[:200]}",
                status_code=status,
            )

        # 429: 速率限制
        if status == 429:
            raise LLMRateLimitError(
                f"触发速率限制（429）: {resp.text[:200]}",
                status_code=status,
            )

        # 408/504/超时类: 超时
        if status in (408, 504, 524):
            raise LLMTimeoutError(
                f"服务端超时（{status}）: {resp.text[:200]}",
                status_code=status,
            )

        # 4xx其他: 客户端错误，不重试
        if 400 <= status < 500:
            raise LLMError(
                f"客户端错误（{status}）: {resp.text[:200]}",
                status_code=status,
            )

        # 5xx: 服务端错误，可重试
        if status >= 500:
            raise LLMResponseError(
                f"服务端错误（{status}）: {resp.text[:200]}",
                status_code=status,
            )

        # 200: 解析响应
        if status == 200:
            try:
                data = resp.json()
            except json.JSONDecodeError as e:
                raise LLMResponseError(f"响应非JSON: {resp.text[:200]}") from e

            # 提取 content[0].text
            content = data.get("content")
            if not content or not isinstance(content, list):
                raise LLMResponseError(f"响应缺少content: {data}")

            # 取第一个 text 块
            for block in content:
                if block.get("type") == "text":
                    text = block.get("text", "")
                    if text:
                        return text

            raise LLMResponseError(f"响应无text块: {data}")

        # 其他未知状态
        raise LLMError(f"未知状态码（{status}）: {resp.text[:200]}", status_code=status)