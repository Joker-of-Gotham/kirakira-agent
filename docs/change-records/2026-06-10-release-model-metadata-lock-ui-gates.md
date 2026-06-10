# Release, model metadata, lock policy, and UI gate hardening

Date: 2026-06-10

## References

- MCP tools/list and tools/call result semantics:
  https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- OpenTelemetry MCP semantic conventions:
  https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/
- Electron security and context isolation:
  https://www.electronjs.org/docs/latest/tutorial/security
- Docker Compose wait semantics:
  https://docs.docker.com/reference/cli/docker/compose/up/
- OpenAI pricing source for model metadata:
  https://developers.openai.com/api/docs/pricing

## Changes

- Added a build-free shared model metadata catalog in
  `packages/core/src/model-metadata.catalog.json` plus TypeScript helpers for
  alias resolution, capabilities, context windows, embedding/tool support, and
  cost estimation.
- Added Python model metadata catalog loading and moved model-gateway alias,
  capability, and token cost tables onto the shared catalog.
- Added release automation surfaces:
  `scripts/release-check.mjs`, `.github/workflows/upgrade-readiness.yml`, and
  `docs/release-checklist.md`.
- Declared `skills-lock.json` as local generated state and kept `kirakira.lock`
  as the auditable workspace lockfile.
- Added shared MCP playground `requiresHumanConfirmation` projection and wired
  the workbench MCP call UI so governed tool calls require explicit human
  confirmation before execution.
- Implemented the dark-mode semantic token layer promised by `DESIGN.md`.

## Validation

```powershell
pnpm.cmd --filter @kirakira/core typecheck
pnpm.cmd --filter @kirakira/frontend-core typecheck
pnpm.cmd --filter @kirakira/frontend-core build
pnpm.cmd --filter @kirakira/frontend-app typecheck
pnpm.cmd exec vitest run test/unit/core/model-metadata.test.ts test/unit/frontend-core/mcp-playground.test.ts
python -m pytest test/unit/model-gateway/test_model_metadata_catalog.py test/unit/model-gateway/test_capability.py test/unit/model-gateway/test_cost.py
node scripts/release-check.mjs --skip-docker --skip-hydrated
node scripts/eam-parity-audit.mjs --depth files
node scripts/upgrade-readiness.mjs --profile workbench-host --format json
node scripts/runtime-full-lifecycle-gate.mjs --gate runtime-full-lifecycle --profile workbench-host --live --timeout-ms 240000
```

## Remaining

Docker daemon is still unavailable on this machine, so the no-skip
Docker-backed full lifecycle gate cannot be converted from blocked evidence to
passed evidence in this slice.
