# 2026-06-09 Runtime Profile Memory State

## Context

Daemon memory recall could be constructed from env, but the runtime profile did
not yet expose a typed memory contract. That kept memory composition weaker
than MCP and presentation profiles: the daemon had to infer services and
defaults from scattered env names instead of a resolved profile state.

References used for the boundary decision:

- Docker Compose env precedence:
  https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/
- Node.js environment variables and `.env` parsing:
  https://nodejs.org/api/environment_variables.html
- LangGraph memory model:
  https://docs.langchain.com/oss/javascript/concepts/memory
- OpenAI Agents SDK sandbox memory:
  https://openai.github.io/openai-agents-js/guides/sandbox-agents/memory/

## Changed

- Added a top-level `memory` profile contract to `configs/runtime/profiles.json`.
- Added `ResolvedRuntimeMemoryState` and attached it to
  `ResolvedRuntimeProfileState`.
- Updated `@kirakira/config-resolver` to merge top-level memory defaults with
  profile overrides and project memory services/vector/graph/blob/embedding/
  recall fields into resolved runtime state.
- Updated `scripts/runtime-profile.mjs` to merge the same memory defaults into
  runtime profiles and render non-secret memory env defaults through existing
  declarative env bindings.
- Updated daemon memory runtime deps to prefer resolved profile aliases and
  defaults before falling back to generic runtime env.
- Updated `daemonConfigFromEnv` to pass the same profile-rendered env into
  `kernel.memory.env`, so embedded daemon config and memory dependency
  construction do not diverge.
- Added tests for resolved memory state projection, runtime env rendering, and
  daemon consumption of profile-provided env aliases/defaults.

## Design Notes

- The profile contract describes long-term memory backing services and defaults;
  it does not replace deployment env. Actual service URLs and credentials still
  come from env, matching Docker/Node precedence rules.
- Secret values are not placed in profile defaults. The profile only names env
  keys such as `OPENAI_API_KEY`, `S3_SECRET_ACCESS_KEY`, and
  `KIRAKIRA_NEO4J_PASSWORD`.
- `KIRAKIRA_MEMORY_ENABLED` is not rendered by default. Explicit env can still
  force-enable or disable daemon memory, while normal daemon creation remains
  gated by deep-research config, profile services, and actual env availability.

## Validation

- `pnpm.cmd --filter @kirakira/core build`
- `pnpm.cmd --filter @kirakira/core typecheck`
- `pnpm.cmd --filter @kirakira/config-resolver typecheck`
- `pnpm.cmd --filter @kirakira/config-resolver build`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon build`
- `pnpm.cmd exec vitest run test/unit/config-resolver/resolved-state.test.ts test/unit/runtime/profile-resolution.test.ts test/unit/runtime-daemon/memory-runtime-deps.test.ts test/unit/runtime-daemon/kernel-bridge-subagent.test.ts test/unit/runtime-daemon/daemon-lifecycle-health.test.ts test/unit/runtime-daemon/daemon-config.test.ts test/unit/runtime/memory-test-host-env.test.ts`

## Remaining Work

- Reuse the same resolved memory contract from `test/helpers/memory-env.ts`
  instead of maintaining parallel test-only env extraction.
- Add gated Docker/local daemon integration coverage for the `test-host` memory
  stack.
- Add workbench memory health/status projection after the frontend tool/citation
  ledger slice lands.
