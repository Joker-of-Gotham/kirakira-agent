# Kirakira-Agent Gateway Layer

## Overview

The Gateway layer provides a multi-provider model abstraction with capability awareness, cost tracking, and mirror failover. It bridges the TypeScript CLI with a Python model server via JSON-RPC 2.0 over stdio.

## Architecture

```
┌─────────────────────┐
│     TS CLI           │
│  ┌────────────────┐  │
│  │ GatewayClient  │  │  JSON-RPC 2.0
│  │ (gateway-      │──┼──────────────────┐
│  │  client.ts)    │  │    over stdio     │
│  └────────────────┘  │                   │
│  ┌────────────────┐  │                   ▼
│  │ GatewayProcess │  │    ┌──────────────────────┐
│  │ (spawn/manage) │──┼───▶│   Python Gateway      │
│  └────────────────┘  │    │  ┌────────────────┐   │
└─────────────────────┘    │  │ GatewayServer  │   │
                           │  │  (server.py)   │   │
                           │  └───────┬────────┘   │
                           │          │             │
                           │  ┌───────▼────────┐   │
                           │  │   Providers     │   │
                           │  │ OpenAI│Azure│   │   │
                           │  │ Anthropic│Ollama│  │
                           │  │ vLLM│LiteLLM    │  │
                           │  └────────────────┘   │
                           └──────────────────────┘
```

## Packages

- **`kirakira-model-gateway` (Python)** — providers, model_resolver, capability, cost, server
- **`@kirakira/cli`** — gateway-client.ts, gateway-process.ts

## Sub-docs

| Doc | Description |
|-----|-------------|
| [01-provider-abstraction](./01-provider-abstraction/) | Provider interface and supported vendors |
| [02-model-resolver](./02-model-resolver/) | Model name resolution, aliases, fuzzy matching |
| [03-capability-registry](./03-capability-registry/) | Capability matrix and query API |
| [04-mirror-failover](./04-mirror-failover/) | Mirror rotation and error recovery |
| [05-cost-tracking](./05-cost-tracking/) | Per-request cost estimation and budget control |
| [06-jsonrpc-protocol](./06-jsonrpc-protocol/) | TS-Python JSON-RPC communication protocol |
| [07-local-models](./07-local-models/) | Ollama and vLLM integration guide |
