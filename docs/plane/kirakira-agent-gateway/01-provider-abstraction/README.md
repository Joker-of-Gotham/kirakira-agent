# Provider Abstraction

## Protocol

```python
class ModelProvider(Protocol):
    def complete_messages(
        self,
        messages: List[dict[str, str]],
        *,
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> Optional[str]: ...
```

## Supported Providers

| Provider | Class | Backend |
|----------|-------|---------|
| `openai` | `OpenAIProvider` | OpenAI-compatible `/v1/chat/completions` |
| `azure` | `AzureProvider` | Azure OpenAI via `openai` SDK |
| `anthropic` | `AnthropicProvider` | Anthropic Messages API |
| `ollama` | `OllamaProvider` | Ollama OpenAI-compatible endpoint |
| `vllm` | `VllmProvider` | vLLM OpenAI-compatible server |
| `litellm` | `LitellmProxyProvider` | LiteLLM proxy server |

## Factory

```python
from kirakira_model_gateway.providers import create_provider

provider = create_provider(
    "openai",
    base_url="http://localhost/v1",
    api_key="key",
    model="gpt-4o",
    timeout=120,
)
```

## Aliases

`openai_compat`, `compatible` → `OpenAIProvider`
`claude` → `AnthropicProvider`
`azure_openai`, `azure-openai` → `AzureProvider`
`litellm_proxy` → `LitellmProxyProvider`
