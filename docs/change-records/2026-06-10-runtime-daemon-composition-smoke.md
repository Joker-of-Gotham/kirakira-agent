# Runtime Daemon Composition Smoke

Date: 2026-06-10

## Change

- Added `daemonCompositionGates.runtime-daemon:composition-smoke` to
  `configs/runtime/profiles.json`.
- Added `scripts/runtime-daemon-composition-smoke.mjs` as an opt-in smoke gate
  for a single `KernelBridge` run.
- Added `test/smoke/runtime-daemon/composition-smoke.test.ts`, which proves
  subagent topology, delegated runtime metadata, deep research MCP evidence,
  MCP policy/trust/audit/OTel metadata, memory recall, checkpoint persistence,
  and profile readiness in one run.
- Added `test/unit/scripts/runtime-daemon-composition-smoke.test.ts`.
- Added the composition gate to `integrationGates.upgrade` and refreshed
  `docs/upgrade/gates/runtime-integration-gate.json`.

## External Constraints

- MCP tool exposure and invocation metadata follows the 2025-11-25 Tools
  contract:
  <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>.
- MCP tracing uses OpenTelemetry's MCP semantic conventions, including
  `tools/call`, `gen_ai.operation.name=execute_tool`, and MCP-specific span
  attributes:
  <https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/>.
- Docker Compose `up --wait` remains the live dependency startup shape for
  Docker-backed child gates; this composition smoke stays in-process so it does
  not mutate the local Docker stack by default:
  <https://docs.docker.com/reference/cli/docker/compose/up/>.

## Validation

```powershell
pnpm.cmd exec vitest run test/smoke/runtime-daemon/composition-smoke.test.ts
pnpm.cmd exec vitest run test/unit/scripts/runtime-daemon-composition-smoke.test.ts
node scripts/runtime-daemon-composition-smoke.mjs --gate runtime-daemon:composition-smoke --profile workbench-host --live
node scripts/runtime-integration-gate.mjs --gate upgrade --dry-run
```

## Boundary

This closes the single-run `KernelBridge` composition gap for runtime-daemon
mechanisms. It does not replace the Docker-backed memory persistence gate or
the web/desktop presentation smoke gate. Renderer-level hydrated
browser/Electron screenshot QA now lives in
`docs/change-records/2026-06-10-presentation-hydrated-visual-qa.md`; full
Docker-backed visual QA remains a slower environment gate.
