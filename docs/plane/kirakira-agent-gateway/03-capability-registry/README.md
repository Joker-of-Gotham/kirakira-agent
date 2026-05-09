# Capability Registry

## Purpose

Tracks what each model supports, enabling capability-aware routing.

## Capability Fields

| Field | Type | Description |
|-------|------|-------------|
| `supports_function_calling` | bool | Tool/function calling support |
| `supports_structured_output` | bool | JSON schema output |
| `supports_vision` | bool | Image input support |
| `supports_batch` | bool | Batch API support |
| `supports_streaming` | bool | Streaming output |
| `max_context_tokens` | int | Max input context window |
| `max_output_tokens` | int | Max output tokens |
| `price_class` | str | low / medium / high / premium |
| `latency_class` | str | fast / medium / slow |

## Built-in Models

GPT-4o, GPT-4o-mini, GPT-4.1, O3, Claude Sonnet 4, Claude Opus 4, Qwen3-32B, Qwen3.5-35B-A3B.

## API

```python
registry = ModelCapabilityRegistry()
cap = registry.get("gpt-4o")
cap.supports_function_calling  # True
cap.max_context_tokens         # 128_000

registry.supports_feature("gpt-4o", "supports_vision")  # True
registry.list_models()  # sorted list of all known models
```
