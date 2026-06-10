# Python Model Provider Catalog

Date: 2026-06-10

## Source Review

- OpenAI API reference: <https://developers.openai.com/api/reference/overview>
- Alibaba DashScope OpenAI compatibility: <https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope>
- Volcengine Ark OpenAI SDK compatibility: <https://www.volcengine.com/docs/82379/1298459>
- Volcengine Ark base URL: <https://www.volcengine.com/docs/82379/1330626>
- DeepSeek API docs: <https://api-docs.deepseek.com/>

These providers expose OpenAI-compatible APIs with provider-owned base URLs,
aliases, API-key environment names, and versioned path rules. The Python gateway
therefore should not carry a second hand-maintained provider switch beside the
TypeScript core catalog.

## Change

- Added `packages/model-gateway/src/kirakira_model_gateway/model_provider_catalog.py`.
- The Python gateway now loads `packages/core/src/model-providers.catalog.json`
  or an explicit `KIRAKIRA_MODEL_PROVIDER_CATALOG` override.
- `GatewayConfig.from_env()` now derives provider normalization, auto-detection,
  default base URL, default model, and provider-specific key env names from the
  shared catalog.
- OpenAI-compatible endpoint construction now derives provider host path rules
  from the shared catalog instead of hardcoded host branches.
- Provider factory aliases and LiteLLM-style provider-prefix stripping now use
  catalog ids and aliases for official OpenAI-compatible providers.

## Boundary

This slice removes duplicated provider catalog hardcoding. It intentionally
does not move model aliases, capability flags, or pricing metadata out of
`model_resolver.py`; those belong in a follow-up model metadata catalog.

## Validation

- `python -m ruff check packages/model-gateway/src/kirakira_model_gateway/model_provider_catalog.py packages/model-gateway/src/kirakira_model_gateway/config.py packages/model-gateway/src/kirakira_model_gateway/client.py packages/model-gateway/src/kirakira_model_gateway/providers/__init__.py packages/model-gateway/src/kirakira_model_gateway/model_resolver.py test/unit/model-gateway/test_model_provider_catalog.py test/unit/model-gateway/test_gateway_config.py`
- `python -m pytest test/unit/model-gateway`
- `pnpm.cmd exec vitest run test/unit/core/model-providers.test.ts test/unit/config-resolver/model-config.test.ts test/unit/agent-runtime/model-client-provider-env.test.ts test/unit/scripts/llm-providers.test.ts`
- `node scripts/eam-parity-audit.mjs --depth files --format json --sample-size 100`
- `node scripts/upgrade-readiness.mjs --profile workbench-host --format json`
