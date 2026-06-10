# Deep Research Adapter Gate Profile Config

Date: 2026-06-10

## Summary

Deep-research live adapter gate metadata is now owned by
`configs/runtime/profiles.json` instead of script-local arrays.

`deepResearchLiveAdapterGates.deep-research:live-adapters` defines the suite
ids, source paths, checks, unit tests, live tests, result path, opt-in env vars,
timeout, and MCP/OTel references. `scripts/deep-research-live-adapters.mjs`
now interprets that profile contract, and `scripts/upgrade-readiness.mjs`
derives suite coverage from the same command metadata.

## Why

The previous gate kept the file/web/MCP suite list and test commands inside the
script. That made adapter expansion require coordinated code edits in multiple
harnesses. Moving the suite contract into the runtime profile keeps deep
research, MCP tool execution, KernelBridge research events, and release
readiness on the same profile-owned path as the rest of the runtime gates.

## References

- MCP Tools 2025-11-25: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- OpenTelemetry MCP semantic conventions: https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/

## Validation

```powershell
pnpm.cmd exec vitest run test/unit/scripts/deep-research-live-adapters.test.ts test/unit/scripts/runtime-integration-gate.test.ts test/unit/scripts/upgrade-readiness.test.ts
node scripts/deep-research-live-adapters.mjs --gate deep-research:live-adapters --profile workbench-host --live
node scripts/deep-research-live-adapters.mjs --dry-run
node scripts/runtime-integration-gate.mjs --gate upgrade --dry-run
node scripts/upgrade-readiness.mjs --profile workbench-host --format json
```

`runtime-full-lifecycle-gate` remains blocked by Docker preflight in this
environment; this change does not claim full Docker-backed lifecycle success.
