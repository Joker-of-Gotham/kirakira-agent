# Child Runtime, Memory Persistence, And Desktop Gate Coverage

Date: 2026-06-10
Branch: `codex/runtime-orchestration-profile-baseline`

## Scope

This slice advances three remaining upgrade tracks without changing Kirakira's
published runtime endpoints: web `http://127.0.0.1:5183/`, desktop renderer
`http://127.0.0.1:5174/`, and browser gateway
`ws://127.0.0.1:17373/runtime`.

## Changes

- Added concrete scoped child runtime dependency forks for delegated agents:
  context assembler, skill injector, tool registry, and tool executor now fork
  into a bounded child view instead of reusing parent instances by default.
- Preserved least-privilege MCP scope semantics so an allowed MCP server such
  as `filesystem` admits `filesystem:read_file` while unrelated tools stay
  outside the child view.
- Added desktop package-script coverage to keep `dev:electron` pointed at
  built main/preload startup plus `electron .`, while the renderer remains the
  separate Vite dev path.
- Added a profile-gated memory persistence smoke command for `test-host`,
  separating unit retain/reflect contracts from live Docker/local persistence
  validation.
- Extended retain-to-recall integration coverage with reflect observation,
  belief, and outbox persistence assertions when the memory stack is available.

## Validation

- `pnpm.cmd --filter @kirakira/agent-runtime typecheck`
- `pnpm.cmd exec vitest run test/unit/agent-runtime/react-loop-delegate.test.ts`
- `pnpm.cmd exec vitest run test/unit/scripts/memory-persistence-smoke.test.ts test/unit/scripts/upgrade-readiness.test.ts test/unit/runtime/profile-resolution.test.ts test/unit/runtime/memory-test-host-env.test.ts`
- `pnpm.cmd exec vitest run test/unit/runtime-daemon/memory-runtime-deps.test.ts test/unit/runtime/memory-test-host-env.test.ts`
- `node scripts/memory-persistence-smoke.mjs --dry-run --profile test-host`
- `pnpm.cmd exec vitest run test/unit/desktop/package-scripts.test.ts test/unit/scripts/workbench-launcher.test.ts test/unit/desktop/renderer-endpoint.test.ts`

## Remaining Risks

- The memory persistence command is now explicit and readiness-visible, but the
  full live Docker/local run still needs `node scripts/memory-persistence-smoke.mjs
  --profile test-host --live` in an environment with the memory stack available.
- Broader Electron screenshot QA and live shell smoke remain separate
  presentation-track work.
