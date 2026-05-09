# Local Models: Ollama & vLLM

## Ollama Integration

Reference: [ollama/ollama OpenAI compatibility](https://github.com/ollama/ollama/blob/main/docs/openai.md)

### Configuration

```toml
[model]
default = "llama3"

[[model.providers]]
name = "local-ollama"
type = "ollama"
base_url = "http://localhost:11434"
```

Or via environment:
```bash
export LLM_PROVIDER=ollama
export LLM_BASE_URL=http://localhost:11434
export LLM_MODEL=llama3
```

### Behavior

- Ollama exposes an OpenAI-compatible endpoint at `/v1`
- The provider automatically appends `/v1` if not present
- API key defaults to `"ollama"` (required by OpenAI SDK but not validated)

## vLLM Integration

Reference: [vLLM OpenAI-compatible server](https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html)

### Configuration

```toml
[[model.providers]]
name = "local-vllm"
type = "vllm"
base_url = "http://localhost:8000"
default_model = "meta-llama/Llama-3-8B"
```

### Behavior

- vLLM serves on port 8000 by default via `vllm serve`
- API key defaults to `"EMPTY"` (not validated)
- Full OpenAI Chat Completions compatibility

## LiteLLM Proxy

For organizations running a LiteLLM gateway:

```toml
[[model.providers]]
name = "litellm"
type = "litellm"
base_url = "http://litellm-proxy:4000"
api_key_env = "LITELLM_KEY"
```
