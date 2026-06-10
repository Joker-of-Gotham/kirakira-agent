# Runtime Gate Contracts and Lifecycle Target Provenance

Date: 2026-06-10

## Request

Continue the terminal upgrade plan by reducing runtime gate duplication and
improving non-Docker lifecycle evidence while Docker daemon access remains
unavailable.

## External Baseline

- MCP tool discovery and invocation remain modeled as `tools/list` and
  `tools/call`: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- MCP trace metadata remains aligned with OpenTelemetry MCP semantic
  conventions: https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/
- Docker lifecycle evidence stays based on Compose `up --wait` readiness:
  https://docs.docker.com/reference/cli/docker/compose/up/
- Electron live evidence keeps typed preload and context isolation constraints:
  https://www.electronjs.org/docs/latest/tutorial/security

## Implementation

- Added a shared gate identity contract for step identity, result matching,
  child environment filtering, and child step execution status.
- Moved integration and full-lifecycle gate replay checks onto the shared gate
  contract instead of maintaining separate local identity matchers.
- Added full-lifecycle `targetSources` and `targetCollisions` evidence so a
  flat target key can be traced back to the contributing child gate/profile.
- Surfaced target collision counts in upgrade-readiness evidence without
  changing the current Docker warning semantics.

## Validation

```powershell
pnpm.cmd --filter @kirakira/runtime-contracts typecheck
pnpm.cmd exec vitest run test/unit/runtime-contracts/gates.test.ts test/unit/runtime-contracts/readiness.test.ts test/unit/scripts/runtime-integration-gate.test.ts test/unit/scripts/runtime-full-lifecycle-gate.test.ts test/unit/scripts/upgrade-readiness.test.ts
node scripts/runtime-integration-gate.mjs --gate upgrade
node scripts/runtime-full-lifecycle-gate.mjs --gate runtime-full-lifecycle --profile workbench-host --dry-run
node scripts/runtime-full-lifecycle-gate.mjs --gate runtime-full-lifecycle --profile workbench-host --live --timeout-ms 240000
```

The live full-lifecycle command still exits non-zero in this environment because
Docker daemon preflight is blocked. The written artifact is intentionally
`blocked` evidence, not a pass.

## Boundary

No local MCP config, agent skill cache, reference project, or skills lockfile is
part of this change. The flat `targets` map remains for compatibility; new
provenance fields are additive.
