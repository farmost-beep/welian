"""Tests for welian.bot.handler — slash commands, message splitting, rate limiting.

No real WeChat API calls. All IlinkApi methods are mocked.
"""
import pytest
import asyncio
import time
from unittest.mock import MagicMock, patch, AsyncMock
from welian.bot.handler import (
    IlinkApi, handle_command, send_long_message,
    MAX_MSG_LEN, SEND_INTERVAL,
)


def run_async(coro):
    """Helper to run async test functions without pytest-asyncio."""
    return asyncio.get_event_loop().run_until_complete(coro)


# ═══════════════════════════════════════════════════════════════
# Message splitting — send_long_message
# ═══════════════════════════════════════════════════════════════

class TestMessageSplitting:
    def test_short_message_sent_as_one(self):
        api = MagicMock()
        api.send_message = MagicMock(return_value=True)
        run_async(send_long_message(api, "user1", "短消息", ""))
        assert api.send_message.call_count == 1

    def test_long_message_split_into_chunks(self):
        api = MagicMock()
        api.send_message = MagicMock(return_value=True)
        long_text = "段落内容\n\n" + "A" * 2500
        run_async(send_long_message(api, "user1", long_text, ""))
        assert api.send_message.call_count > 1
        # Each chunk should be roughly under MAX_MSG_LEN (may have page prefix like [1/2])
        for call in api.send_message.call_args_list:
            text = call.args[1] if len(call.args) > 1 else call.kwargs.get("text", "")
            assert len(text) <= MAX_MSG_LEN + 20  # allow small overhead for page markers

    def test_very_long_single_block_split_at_boundaries(self):
        api = MagicMock()
        api.send_message = MagicMock(return_value=True)
        long_block = "B" * 5000
        run_async(send_long_message(api, "user1", long_block, ""))
        assert api.send_message.call_count > 1
        # All B characters should be preserved (page markers add extra chars)
        total_chars = sum(
            len(call.args[1]) if len(call.args) > 1 else len(call.kwargs.get("text", ""))
            for call in api.send_message.call_args_list
        )
        assert total_chars >= 5000  # at least all content preserved


# ═══════════════════════════════════════════════════════════════
# Slash commands — handle_command
# ═══════════════════════════════════════════════════════════════

class TestSlashCommands:
    def test_non_command_returns_false(self):
        api = MagicMock()
        result = run_async(handle_command("记一下", "user1", api, ""))
        assert result is False

    def test_help_command(self):
        api = MagicMock()
        api.send_message = MagicMock(return_value=True)
        result = run_async(handle_command("/help", "user1", api, ""))
        assert result is True
        api.send_message.assert_called_once()
        sent_text = api.send_message.call_args.args[1]
        assert "Welian" in sent_text
        assert "/help" in sent_text

    def test_help_alias_h(self):
        api = MagicMock()
        api.send_message = MagicMock(return_value=True)
        result = run_async(handle_command("/h", "user1", api, ""))
        assert result is True

    def test_reset_command(self):
        api = MagicMock()
        api.send_message = MagicMock(return_value=True)
        with patch("welian.bot.handler.sessions") as mock_sessions:
            mock_sessions.reset = MagicMock()
            result = run_async(handle_command("/reset", "user1", api, ""))
            assert result is True
            mock_sessions.reset.assert_called_once_with("user1")
            sent_text = api.send_message.call_args.args[1]
            assert "重置" in sent_text

    def test_unknown_command_sends_hint(self):
        api = MagicMock()
        api.send_message = MagicMock(return_value=True)
        with patch("welian.bot.handler.sessions"):
            result = run_async(handle_command("/nonexistent", "user1", api, ""))
            assert result is True
            sent_text = api.send_message.call_args.args[1]
            assert "未知命令" in sent_text or "/help" in sent_text


# ═══════════════════════════════════════════════════════════════
# Rate limiting — IlinkApi.send_message
# ═══════════════════════════════════════════════════════════════

class TestRateLimiting:
    def test_first_send_no_delay(self):
        api = IlinkApi(token="test")
        with patch.object(api, "_request") as mock_req:
            mock_req.return_value = {"ret": 0}
            with patch("time.sleep") as mock_sleep:
                result = api.send_message("user1", "hello", "")
                assert result is True
                # Should not sleep for rate limiting on first send
                # (only sleep for rate-limit response, which we don't trigger)
                mock_sleep.assert_not_called()

    def test_rate_limit_response_triggers_retry(self):
        api = IlinkApi(token="test")
        with patch.object(api, "_request") as mock_req:
            # First call returns rate-limit (-2), second succeeds
            mock_req.side_effect = [{"ret": -2}, {"ret": 0}]
            with patch("time.sleep") as mock_sleep:
                result = api.send_message("user1", "hello", "")
                assert result is True
                # Should have slept for retry backoff
                mock_sleep.assert_called()

    def test_rate_limit_exhausted_retries(self):
        api = IlinkApi(token="test")
        with patch.object(api, "_request") as mock_req:
            # All calls return rate-limit
            mock_req.return_value = {"ret": -2}
            with patch("time.sleep"):
                result = api.send_message("user1", "hello", "")
                assert result is False

    def test_network_error_returns_false(self):
        api = IlinkApi(token="test")
        with patch.object(api, "_request") as mock_req:
            mock_req.side_effect = Exception("network error")
            result = api.send_message("user1", "hello", "")
            assert result is False


# ═══════════════════════════════════════════════════════════════
# IlinkApi initialization
# ═══════════════════════════════════════════════════════════════

class TestIlinkApiInit:
    def test_token_stored(self):
        api = IlinkApi(token="my-token")
        assert api.token == "my-token"

    def test_base_url_trailing_slash_stripped(self):
        api = IlinkApi(token="t", base_url="https://api.test/")
        assert api.base_url == "https://api.test"

    def test_next_send_dict_initialized(self):
        api = IlinkApi(token="t")
        assert hasattr(api, "_next_send")
        assert api._next_send == {}
