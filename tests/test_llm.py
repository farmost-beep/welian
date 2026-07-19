"""Tests for welian.llm module — base classes, Claude client, retry logic.

No real API calls. All HTTP calls are mocked.
"""
import pytest
import json
from unittest.mock import MagicMock, patch, PropertyMock
from welian.llm.base import (
    LLMClient, LLMError, LLMAuthError, LLMRateLimitError,
    LLMTimeoutError, LLMResponseError,
)


# ═══════════════════════════════════════════════════════════════
# Exception hierarchy
# ═══════════════════════════════════════════════════════════════

class TestLLMExceptions:
    def test_llm_error_has_status_code(self):
        err = LLMError("test error", status_code=500)
        assert str(err) == "test error"
        assert err.status_code == 500

    def test_llm_error_default_status_code_none(self):
        err = LLMError("test error")
        assert err.status_code is None

    def test_auth_error_inherits_llm_error(self):
        err = LLMAuthError("bad key", status_code=401)
        assert isinstance(err, LLMError)
        assert err.status_code == 401

    def test_rate_limit_error_inherits_llm_error(self):
        err = LLMRateLimitError("too fast", status_code=429)
        assert isinstance(err, LLMError)
        assert err.status_code == 429

    def test_timeout_error_inherits_llm_error(self):
        err = LLMTimeoutError("timed out", status_code=504)
        assert isinstance(err, LLMError)

    def test_response_error_inherits_llm_error(self):
        err = LLMResponseError("bad json", status_code=502)
        assert isinstance(err, LLMError)


# ═══════════════════════════════════════════════════════════════
# Retry logic (complete_with_retry)
# ═══════════════════════════════════════════════════════════════

class FakeClient(LLMClient):
    """Fake LLM client for testing retry logic."""
    def __init__(self, responses=None, exceptions=None):
        self.call_count = 0
        self._responses = responses or []
        self._exceptions = exceptions or []

    def complete(self, prompt, system=None, messages=None, **kwargs):
        self.call_count += 1
        if self._exceptions and len(self._exceptions) >= self.call_count:
            exc = self._exceptions[self.call_count - 1]
            if exc:
                raise exc
        if self._responses and len(self._responses) >= self.call_count:
            return self._responses[self.call_count - 1]
        return "default response"


class TestCompleteWithRetry:
    def test_success_first_try(self):
        client = FakeClient(responses=["hello"])
        result = client.complete_with_retry("test")
        assert result == "hello"
        assert client.call_count == 1

    def test_auth_error_not_retried(self):
        client = FakeClient(exceptions=[LLMAuthError("bad key")])
        with pytest.raises(LLMAuthError):
            client.complete_with_retry("test")
        assert client.call_count == 1  # no retry

    def test_rate_limit_retried(self):
        client = FakeClient(
            exceptions=[LLMRateLimitError("429"), None],
            responses=[None, "success after retry"],
        )
        with patch("time.sleep"):  # don't actually sleep
            result = client.complete_with_retry("test", max_retries=2)
        assert result == "success after retry"
        assert client.call_count == 2

    def test_timeout_retried(self):
        client = FakeClient(
            exceptions=[LLMTimeoutError("timeout"), None],
            responses=[None, "success"],
        )
        with patch("time.sleep"):
            result = client.complete_with_retry("test", max_retries=2)
        assert result == "success"
        assert client.call_count == 2

    def test_response_error_retried(self):
        client = FakeClient(
            exceptions=[LLMResponseError("bad json"), None],
            responses=[None, "fixed"],
        )
        with patch("time.sleep"):
            result = client.complete_with_retry("test", max_retries=2)
        assert result == "fixed"
        assert client.call_count == 2

    def test_max_retries_exhausted(self):
        client = FakeClient(exceptions=[
            LLMRateLimitError("429"),
            LLMRateLimitError("429"),
            LLMRateLimitError("429"),
        ])
        with patch("time.sleep"):
            with pytest.raises(LLMRateLimitError):
                client.complete_with_retry("test", max_retries=2)
        assert client.call_count == 3  # initial + 2 retries

    def test_generic_llm_error_not_retried(self):
        client = FakeClient(exceptions=[LLMError("unknown")])
        with pytest.raises(LLMError):
            client.complete_with_retry("test")
        assert client.call_count == 1


# ═══════════════════════════════════════════════════════════════
# Claude client — error mapping
# ═══════════════════════════════════════════════════════════════

class TestClaudeClientErrorMapping:
    """Test that ClaudeClient correctly maps HTTP status codes to LLMError subclasses."""

    def _make_mock_response(self, status_code, json_data=None, text="error body"):
        """Create a mock httpx.Response."""
        resp = MagicMock()
        resp.status_code = status_code
        resp.text = text
        if json_data is not None:
            resp.json.return_value = json_data
        return resp

    def test_401_raises_auth_error(self):
        from welian.llm.claude import ClaudeClient
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"}):
            client = ClaudeClient()
            mock_resp = self._make_mock_response(401)
            with patch("httpx.Client") as mock_httpx:
                mock_httpx.return_value.__enter__.return_value.post.return_value = mock_resp
                with pytest.raises(LLMAuthError):
                    client.complete("test")

    def test_403_raises_auth_error(self):
        from welian.llm.claude import ClaudeClient
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"}):
            client = ClaudeClient()
            mock_resp = self._make_mock_response(403)
            with patch("httpx.Client") as mock_httpx:
                mock_httpx.return_value.__enter__.return_value.post.return_value = mock_resp
                with pytest.raises(LLMAuthError):
                    client.complete("test")

    def test_429_raises_rate_limit_error(self):
        from welian.llm.claude import ClaudeClient
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"}):
            client = ClaudeClient()
            mock_resp = self._make_mock_response(429)
            with patch("httpx.Client") as mock_httpx:
                mock_httpx.return_value.__enter__.return_value.post.return_value = mock_resp
                with pytest.raises(LLMRateLimitError):
                    client.complete("test")

    def test_504_raises_timeout_error(self):
        from welian.llm.claude import ClaudeClient
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"}):
            client = ClaudeClient()
            mock_resp = self._make_mock_response(504)
            with patch("httpx.Client") as mock_httpx:
                mock_httpx.return_value.__enter__.return_value.post.return_value = mock_resp
                with pytest.raises(LLMTimeoutError):
                    client.complete("test")

    def test_500_raises_response_error(self):
        from welian.llm.claude import ClaudeClient
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"}):
            client = ClaudeClient()
            mock_resp = self._make_mock_response(500)
            with patch("httpx.Client") as mock_httpx:
                mock_httpx.return_value.__enter__.return_value.post.return_value = mock_resp
                with pytest.raises(LLMResponseError):
                    client.complete("test")

    def test_400_raises_generic_llm_error(self):
        from welian.llm.claude import ClaudeClient
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"}):
            client = ClaudeClient()
            mock_resp = self._make_mock_response(400)
            with patch("httpx.Client") as mock_httpx:
                mock_httpx.return_value.__enter__.return_value.post.return_value = mock_resp
                with pytest.raises(LLMError) as exc_info:
                    client.complete("test")
                # Should NOT be a subclass (4xx other than 401/403/429)
                assert type(exc_info.value) == LLMError

    def test_200_parses_content_correctly(self):
        from welian.llm.claude import ClaudeClient
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"}):
            client = ClaudeClient()
            mock_resp = self._make_mock_response(200, json_data={
                "content": [{"type": "text", "text": "Hello from Claude!"}]
            })
            with patch("httpx.Client") as mock_httpx:
                mock_httpx.return_value.__enter__.return_value.post.return_value = mock_resp
                result = client.complete("test")
                assert result == "Hello from Claude!"

    def test_200_missing_content_raises_response_error(self):
        from welian.llm.claude import ClaudeClient
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"}):
            client = ClaudeClient()
            mock_resp = self._make_mock_response(200, json_data={"no_content": True})
            with patch("httpx.Client") as mock_httpx:
                mock_httpx.return_value.__enter__.return_value.post.return_value = mock_resp
                with pytest.raises(LLMResponseError):
                    client.complete("test")

    def test_200_no_text_block_raises_response_error(self):
        from welian.llm.claude import ClaudeClient
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"}):
            client = ClaudeClient()
            mock_resp = self._make_mock_response(200, json_data={
                "content": [{"type": "image", "source": {"data": "..."}}]
            })
            with patch("httpx.Client") as mock_httpx:
                mock_httpx.return_value.__enter__.return_value.post.return_value = mock_resp
                with pytest.raises(LLMResponseError):
                    client.complete("test")


# ═══════════════════════════════════════════════════════════════
# Claude client — initialization
# ═══════════════════════════════════════════════════════════════

class TestClaudeClientInit:
    def test_missing_api_key_raises_auth_error(self):
        from welian.llm.claude import ClaudeClient
        # Clear env vars
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(LLMAuthError):
                ClaudeClient()

    def test_api_key_from_param(self):
        from welian.llm.claude import ClaudeClient
        with patch.dict("os.environ", {}, clear=True):
            client = ClaudeClient(api_key="param-key")
            assert client.api_key == "param-key"

    def test_api_key_from_env(self):
        from welian.llm.claude import ClaudeClient
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "env-key"}):
            client = ClaudeClient()
            assert client.api_key == "env-key"

    def test_api_key_from_auth_token_env(self):
        from welian.llm.claude import ClaudeClient
        with patch.dict("os.environ", {"ANTHROPIC_AUTH_TOKEN": "token-key"}, clear=True):
            client = ClaudeClient()
            assert client.api_key == "token-key"

    def test_custom_base_url(self):
        from welian.llm.claude import ClaudeClient
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "key", "ANTHROPIC_BASE_URL": "https://proxy.local"}):
            client = ClaudeClient()
            assert client.base_url == "https://proxy.local"

    def test_default_base_url(self):
        from welian.llm.claude import ClaudeClient
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "key"}, clear=True):
            client = ClaudeClient()
            assert client.base_url == "https://api.anthropic.com"
