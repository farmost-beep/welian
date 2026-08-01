"""Cloud LLM Client — routes AI calls through Welian cloud (方案C).

Architecture (SPEC §7.1 + 方案C 批发赚价差):
  Edge (this client) → Welian Cloud (billing gateway) → LLM Provider

The cloud worker:
  1. Validates user token
  2. Checks/deducts points (tokens.py on edge side)
  3. Forwards to LLM Provider using Welian's wholesale API key
  4. Returns result + actual token usage

This client implements the same LLMClient interface as OpenAIClient/ClaudeClient,
so edge.py can switch between direct (self-hosted) and cloud (commercial) modes
transparently.

Usage:
  from welian.llm.cloud import CloudLLMClient
  client = CloudLLMClient(cloud_url="https://api.welian.app", user_token="...")
  reply = client.complete("Hello", system="You are Welian")
"""
from __future__ import annotations

import json
from typing import Optional, Any

import httpx

from .base import LLMClient, LLMError, LLMAuthError, LLMTimeoutError


class CloudLLMClient(LLMClient):
    """LLM client that routes through Welian cloud billing gateway.

    Unlike OpenAIClient/ClaudeClient which call LLM providers directly,
    this client sends requests to Welian's cloud-worker which handles
    LLM forwarding + billing.
    """

    def __init__(
        self,
        cloud_url: str = "https://api.welian.app",
        user_token: str = "",
        timeout: float = 60.0,
    ):
        self.cloud_url = cloud_url.rstrip("/")
        self.user_token = user_token
        self.timeout = timeout
        self._last_usage: Optional[dict] = None

    @property
    def last_usage(self) -> Optional[dict]:
        """Token usage from the most recent call (for billing)."""
        return self._last_usage

    def complete(
        self,
        prompt: str,
        system: Optional[str] = None,
        messages: Optional[list] = None,
        **kwargs: Any,
    ) -> str:
        """Call LLM via Welian cloud gateway.

        Sends to cloud-worker /ai/chat endpoint.
        Returns the LLM response text.
        Stores token usage in self._last_usage for billing.
        """
        # Build messages array: combine conversation history + current prompt
        # The cloud worker requires messages to be a non-empty array
        all_messages = list(messages) if messages else []
        if prompt:
            all_messages.append({"role": "user", "content": prompt})

        if not all_messages:
            raise LLMError("Cloud LLM 调用需要 prompt 或 messages")

        # Build request body
        body: dict = {
            "user_token": self.user_token,
            "max_tokens": kwargs.get("max_tokens", 1024),
            "messages": all_messages,
        }
        if system:
            body["system"] = system
        if "temperature" in kwargs:
            body["temperature"] = kwargs["temperature"]

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.user_token}",
        }

        url = f"{self.cloud_url}/ai/chat"

        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(url, headers=headers, json=body)
        except httpx.TimeoutException as e:
            raise LLMTimeoutError(f"Cloud LLM 调用超时（{self.timeout}s）") from e
        except httpx.HTTPError as e:
            raise LLMError(f"HTTP错误: {e}") from e

        return self._handle_response(resp)

    def _handle_response(self, resp) -> str:
        status = resp.status_code

        if status == 401 or status == 403:
            raise LLMAuthError(
                f"认证失败（{status}）: {resp.text[:200]}",
                status_code=status,
            )
        if status == 402:
            # Payment required — out of points
            raise LLMError(
                f"联点余额不足，请充值。{resp.text[:200]}",
                status_code=402,
            )
        if status == 429:
            from .base import LLMRateLimitError
            raise LLMRateLimitError(
                f"速率限制: {resp.text[:200]}",
                status_code=429,
            )
        if status >= 500:
            raise LLMError(
                f"云端错误（{status}）: {resp.text[:200]}",
                status_code=status,
            )
        if status != 200:
            raise LLMError(
                f"未知响应（{status}）: {resp.text[:200]}",
                status_code=status,
            )

        try:
            data = resp.json()
        except json.JSONDecodeError as e:
            from .base import LLMResponseError
            raise LLMResponseError(f"响应解析失败: {e}") from e

        # Store usage for billing
        self._last_usage = data.get("usage")

        reply = data.get("reply") or data.get("content") or ""
        if not reply:
            from .base import LLMResponseError
            raise LLMResponseError("云端返回空响应")

        return reply
