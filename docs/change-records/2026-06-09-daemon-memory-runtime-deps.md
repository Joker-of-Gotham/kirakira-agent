# 2026-06-09 Daemon Memory Runtime Dependencies

## Context

Kirakira had the same memory packages as EAM and a daemon deep-research
injection seam, but the daemon only used memory when a caller manually injected
a `MemoryRecallPort`. That left web, desktop, CLI, and daemon launches without
a default memory-backed research path.

The implementation follows the existing memory-pipeline environment contract
and keeps deploy-varying config in env rather than embedding service endpoints
in daemon code. This aligns with 12-factor config guidance and with current
agent-memory systems that separate short-lived run context from long-term
cross-session memory.

References used for the boundary decision:

- Twelve-Factor config guidance: https://www.12factor.net/config
- LangGraph memory model: https://docs.langchain.com/oss/javascript/concepts/memory
- OpenAI Agents SDK sandbox memory layout and progressive disclosure:
  https://openai.github.io/openai-agents-js/guides/sandbox-agents/memory/

## Changed

- Added `memory-runtime-deps.ts` to `@kirakira/runtime-daemon`.
- Added env-driven `MemoryServiceConfig` construction with memory-specific env
  overrides taking precedence over shared runtime env:
  `KIRAKIRA_MEMORY_POSTGRES_DSN`, `KIRAKIRA_MEMORY_REDIS_URL`,
  `KIRAKIRA_MEMORY_QDRANT_URL`, `KIRAKIRA_MEMORY_NEO4J_URI`,
  `KIRAKIRA_MEMORY_S3_ENDPOINT_URL`, and related credential/model fields.
- Added lazy `MemoryRecallPort` construction so daemon startup does not open
  backing-store clients until research actually calls memory recall.
- Updated `KernelBridge` to own the memory dependency lifecycle and inject the
  default memory research source when deep research is enabled, runtime profile
  services include memory backing services, and memory env is present.
- Updated daemon capability projection so the memory capability reports
  `enabled` when default daemon memory can be constructed.
- Added `@kirakira/memory-service` as a daemon dependency.

## Design Notes

- Explicit `deepResearch.memory` injection still wins. The default source is
  added only when no explicit memory source is supplied.
- `KIRAKIRA_MEMORY_ENABLED=0` disables the default path. `KIRAKIRA_MEMORY_ENABLED=1`
  enables it for tests or explicitly provisioned launches.
- The factory does not add a second service catalog. It consumes the same env
  aliases already used by the memory pipeline and launcher-generated runtime
  env.
- Tenant and workspace IDs are derived from explicit memory env first, then
  resolved config and run/workspace context.

## Validation

- `pnpm.cmd --filter @kirakira/memory-service build`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd exec vitest run test/unit/runtime-daemon/memory-runtime-deps.test.ts test/unit/runtime-daemon/kernel-bridge-subagent.test.ts test/unit/runtime-daemon/daemon-lifecycle-health.test.ts`

## Remaining Work

- Project a structured memory runtime state from `configs/runtime/profiles.json`
  into `ResolvedRuntimeProfileState` instead of relying only on env inference.
- Reuse the same memory config builder from memory integration helpers so test
  harnesses do not drift into a third configuration path.
- Add gated Docker/local daemon integration coverage against the `test-host`
  memory stack.
- Connect retain/reflect/checkpoint run events to the daemon memory service,
  not only deep-research recall.
