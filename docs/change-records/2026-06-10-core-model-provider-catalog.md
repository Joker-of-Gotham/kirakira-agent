# Core Model Provider Catalog

Date: 2026-06-10

## Change

- Added a build-free provider catalog at
  `packages/core/src/model-providers.catalog.json`.
- Added `packages/core/src/model-providers.ts` as the typed API for provider
  lookup, alias normalization, API-key usability checks, env resolution, and
  OpenAI-compatible endpoint URL construction.
- Replaced duplicated provider defaults and URL builders in:
  - `packages/cli/src/gateway/provider-catalog.ts`
  - `packages/cli/src/gateway/openai-complete.ts`
  - `packages/config-resolver/src/model-config.ts`
  - `packages/agent-runtime/src/model/model-client.ts`
  - `scripts/llm-providers.mjs`
- Preserved call-site compatibility where behavior previously differed:
  config bootstrap still chooses `LLM_API_KEY` as an env var when present, and
  agent-runtime still allows a broad generic `LLM_API_KEY` fallback for direct
  runtime calls.

## External Constraints

- OpenAI API reference remains the baseline for OpenAI-compatible endpoint
  shape: <https://developers.openai.com/api/reference/overview>.
- Alibaba Cloud Model Studio documents DashScope OpenAI-compatible base URLs
  and the `DASHSCOPE_API_KEY` environment convention:
  <https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope>.
- Volcengine Ark documents Base URL/authentication and OpenAI SDK
  compatibility for Ark APIs:
  <https://www.volcengine.com/docs/82379/1298459> and
  <https://www.volcengine.com/docs/82379/1330626>.
- DeepSeek documents OpenAI-compatible access at `https://api.deepseek.com`,
  `DEEPSEEK_API_KEY`, and current default/fallback model names:
  <https://api-docs.deepseek.com/>.

## Validation

```powershell
pnpm.cmd --filter @kirakira/core build
pnpm.cmd exec vitest run test/unit/core/model-providers.test.ts test/unit/config-resolver/model-config.test.ts test/unit/agent-runtime/model-client-provider-env.test.ts test/unit/scripts/llm-providers.test.ts
pnpm.cmd --filter @kirakira/core typecheck
pnpm.cmd --filter @kirakira/config-resolver typecheck
pnpm.cmd --filter @kirakira/agent-runtime typecheck
pnpm.cmd --filter @kirakira/cli typecheck
node -e "import('./scripts/llm-providers.mjs').then((m)=>console.log(m.LLM_PROVIDERS.length, m.getProvider('dashscope').id))"
git diff --check
```

## Boundary

This closes the duplicated TypeScript and bootstrap-script provider catalog for
the currently supported OpenAI-compatible providers. It does not claim the
broader runtime/harness cleanup is complete, nor does it add live model
discovery against external provider APIs. Future provider additions should edit
the JSON catalog first and only add call-site code when a provider requires a
non-OpenAI-compatible transport.
