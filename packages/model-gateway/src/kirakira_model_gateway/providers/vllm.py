"""vLLM provider — identical to OpenAI-compatible but with vLLM-specific defaults."""

from __future__ import annotations

from typing import Any, Optional

from kirakira_model_gateway.providers.openai_compat import OpenAIProvider


class VllmProvider(OpenAIProvider):
    def __init__(
        self,
        base_url: str,
        api_key: str = "EMPTY",
        model: str = "",
        timeout: int = 120,
        max_retries: int = 2,
    ) -> None:
        super().__init__(
            base_url=base_url,
            api_key=api_key,
            default_model=model,
            timeout=timeout,
            max_retries=max_retries,
        )
