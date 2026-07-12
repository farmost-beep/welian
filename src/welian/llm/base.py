"""LLM Client 抽象基类 + 异常体系

设计原则：
- 解耦大模型调用，使上层代码不依赖具体provider
- 异常分类清晰，便于上层做重试/降级
- 最小接口：complete() 一个方法就够 v1 使用
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Optional, Iterator, Dict, Any


# ── 异常体系 ──

class LLMError(Exception):
    """LLM调用异常基类"""
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class LLMAuthError(LLMError):
    """认证失败（API Key 无效/缺失）"""
    pass


class LLMRateLimitError(LLMError):
    """速率限制（应触发重试或退避）"""
    pass


class LLMTimeoutError(LLMError):
    """调用超时"""
    pass


class LLMResponseError(LLMError):
    """响应格式异常/解析失败"""
    pass


# ── 抽象基类 ──

class LLMClient(ABC):
    """LLM客户端抽象基类

    所有provider实现必须继承此类，实现complete()方法。
    上层通过 get_client() 工厂函数获取实例，无需关心具体provider。
    """

    @abstractmethod
    def complete(
        self,
        prompt: str,
        system: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        """同步调用，返回完整文本响应

        Args:
            prompt: 用户提示词
            system: 系统提示词（可选）
            **kwargs: provider特定参数（如 temperature, max_tokens）

        Returns:
            模型返回的文本内容

        Raises:
            LLMAuthError: 认证失败（不应重试）
            LLMRateLimitError: 速率限制（可重试）
            LLMTimeoutError: 超时（可重试）
            LLMResponseError: 响应解析失败（可重试）
            LLMError: 其他错误
        """
        pass

    def complete_with_retry(
        self,
        prompt: str,
        system: Optional[str] = None,
        max_retries: int = 2,
        **kwargs: Any,
    ) -> str:
        """带重试的complete调用

        重试策略：
        - LLMAuthError: 不重试（认证问题重试无用）
        - LLMRateLimitError: 指数退避重试（1s, 2s）
        - LLMTimeoutError: 重试
        - LLMResponseError: 重试
        - 其他: 不重试

        Args:
            prompt: 用户提示词
            system: 系统提示词
            max_retries: 最大重试次数（不含首次）
            **kwargs: 透传给complete()

        Returns:
            模型返回的文本
        """
        import time

        attempt = 0
        last_error: Optional[LLMError] = None
        retryable = (LLMRateLimitError, LLMTimeoutError, LLMResponseError)

        while attempt <= max_retries:
            try:
                return self.complete(prompt, system, **kwargs)
            except LLMAuthError:
                raise  # 认证失败不重试
            except retryable as e:
                last_error = e
                attempt += 1
                if attempt > max_retries:
                    break
                # 指数退避：1s, 2s, 4s
                wait = 2 ** (attempt - 1)
                time.sleep(wait)
            except LLMError:
                raise  # 其他LLMError不重试

        # 重试耗尽
        assert last_error is not None
        raise last_error