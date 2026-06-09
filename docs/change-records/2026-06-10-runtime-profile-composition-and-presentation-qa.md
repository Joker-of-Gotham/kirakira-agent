# Runtime profile composition and presentation QA

Date: 2026-06-10

## Scope

- Centralized daemon runtime-profile consumption through
  `runtimeProfileComposition` for MCP server registration, MCP OpenTelemetry
  recorder planning, memory service selection, memory backing-service checks,
  workspace defaults, daemon config, and lifecycle topology.
- Reclassified the runtime-daemon EAM drift row from `partial` to `covered` and
  moved the next mechanism gap to orchestrator-kernel live source-adapter
  validation.
- Split readiness output into actionable `openWork` and non-actionable
  `advisoryWarnings` so classified file-level drift no longer inflates the
  remaining work count.
- Added an archiveable presentation quality artifact with mobile, tablet, and
  desktop viewport targets plus a seven-dimension visual review scorecard.

## External references

- MCP Tools specification 2025-11-25:
  <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>
- OpenTelemetry MCP semantic conventions:
  <https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/>
- Docker Compose startup-order readiness semantics:
  <https://docs.docker.com/compose/how-tos/startup-order/>

## Validation

```powershell
pnpm.cmd exec vitest run test/unit/runtime-daemon/mcp-runtime.test.ts test/unit/runtime-daemon/memory-runtime-deps.test.ts test/unit/runtime-daemon/daemon-config.test.ts test/unit/scripts/upgrade-readiness.test.ts
pnpm.cmd --filter @kirakira/runtime-daemon typecheck
pnpm.cmd exec vitest run test/unit/scripts/presentation-quality-gate.test.ts test/unit/runtime-daemon/kernel-bridge-subagent.test.ts
node scripts\presentation-quality-gate.mjs --profile workbench-host --format markdown --artifact docs\upgrade\gates\presentation-quality-workbench-host.json --fail-on-issues
node scripts\upgrade-readiness.mjs --format json
node scripts\eam-parity-audit.mjs --format json
pnpm.cmd exec vitest run test/unit/scripts/upgrade-readiness.test.ts test/unit/eam-parity/eam-parity-audit.test.ts
```

Result: upgrade readiness reports `openWork=1`, `advisoryWarnings=1`,
`covered=7`, `partial=1`, and no failures.
