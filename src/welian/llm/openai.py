"""OpenAI 兼容协议客户端

支持所有 OpenAI 兼容 API：
- OpenAI 官方（https://api.openai.com/v1）
- MiniMax（https://api.MiniMax.cn/v1）
- 其他兼容服务（Azure OpenAI / 各种中转）

协议参考：https://platform.openai.com/docs/api-reference/chat
"""
from __future__ import annotations

import os
import json
from typing import Optional, Any

try:
    import httpx
except ImportError:
    httpx = None

from .base import (
    LLMClient,
    LLMError,
    LLMAuthError,
    LLMRateLimitError,
    LLMTimeoutError,
    LLMResponseError,
)


DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_MAX_TOKENS = 4096
DEFAULT_TIMEOUT = 30.0


class OpenAIClient(LLMClient):
    """OpenAI 兼容 API 客户端

    用法（OpenAI）：
        client = OpenAIClient(api_key="sk-...")

    用法（MiniMax）：
        client = OpenAIClient(
            api_key="...",
            base_url="https://api.MiniMax.cn/v1",
            model="MiniMax-Text-01",
        )

    环境变量（OpenAI）：
        os.environ["OPENAI_API_KEY"] = "sk-..."
        client = OpenAIClient()

    环境变量（MiniMax）：
        os.environ["OPENAI_API_KEY"] = "..."  # MiniMax也读这个
        os.environ["OPENAI_BASE_URL"] = "https://api.MiniMax.cn/v1"
        os.environ["OPENAI_MODEL"] = "MiniMax-Text-01"
        client = OpenAIClient()
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
        max_tokens: Optional[int] = None,
        # 兼容 MiniMax：也允许传 MiniMax_API_KEY 等其他环境变量名
        api_key_env: str = "OPENAI_API_KEY",
    ):
        if httpx is None:
            raise ImportError("请先安装 httpx: pip install httpx")

        # API Key：参数 > OPENAI_API_KEY > api_key_env 指定的环境变量
        self.api_key = (
            api_key
            or os.environ.get("OPENAI_API_KEY")
            or os.environ.get(api_key_env)
        )
        if not self.api_key:
            raise LLMAuthError(
                f"未设置 {api_key_env}（可通过环境变量或参数传入）"
            )

        self.model = (
            model
            or os.environ.get("OPENAI_MODEL")
            or os.environ.get("LLM_MODEL")
            or DEFAULT_MODEL
        )
        self.base_url = (
            base_url
            or os.environ.get("OPENAI_BASE_URL")
            or os.environ.get("LLM_BASE_URL")
            or DEFAULT_BASE_URL
        ).rstrip("/")
        self.timeout = timeout or DEFAULT_TIMEOUT
        self.max_tokens = max_tokens or DEFAULT_MAX_TOKENS

    def complete(
        self,
        prompt: str,
        system: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        """调用 /chat/completions 端点

        支持完整 OpenAI Chat Completions API
        """
        # 构造 messages
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        body = {
            "model": kwargs.get("model", self.model),
            "max_tokens": kwargs.get("max_tokens", self.max_tokens),
            "messages": messages,
        }
        if "temperature" in kwargs:
            body["temperature"] = kwargs["temperature"]

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        url = f"{self.base_url}/chat/completions"

        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(url, headers=headers, json=body)
        except httpx.TimeoutException as e:
            raise LLMTimeoutError(f"OpenAI API 调用超时（{self.timeout}s）") from e
        except httpx.HTTPError as e:
            raise LLMError(f"HTTP错误: {e}") from e

        return self._handle_response(resp)

    def _handle_response(self, resp) -> str:
        status = resp.status_code

        # 401/403: 认证
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

        # 408/504/524: 超时
        if status in (408, 504, 524):
            raise LLMTimeoutError(
                f"服务端超时（{status}）: {resp.text[:200]}",
                status_code=status,
            )

        # 4xx其他: 客户端错误
        if 400 <= status < 500:
            raise LLMError(
                f"客户端错误（{status}）: {resp.text[:200]}",
                status_code=status,
            )

        # 5xx: 服务端
        if status >= 500:
            raise LLMResponseError(
                f"服务端错误（{status}）: {resp.text[:200]}",
                status_code=status,
            )

        # 200: 解析
        if status == 200:
            try:
                data = resp.json()
            except json.JSONDecodeError as e:
                raise LLMResponseError(f"响应非JSON: {resp.text[:200]}") from e

            choices = data.get("choices")
            if not choices or not isinstance(choices, list):
                raise LLMResponseError(f"响应缺少choices: {data}")

            first = choices[0]
            message = first.get("message", {})
            content = message.get("content", "")

            if content:
                return content

            raise LLMResponseError(f"响应content为空: {data}")

        raise LLMError(f"未知状态码（{status}）: {resp.text[:200]}", status_code=status)