# 2026-06-09 Runtime Profile Projection Fragments

## Context

Docker, host, workbench, and test startup paths already resolved services and
MCP servers from `configs/runtime/profiles.json`, but callers still needed
separate surfaces for MCP config JSON and memory-stack startup details.

## Change

- Added `projection` to `scripts/runtime-profile.mjs`.
- Added `buildMcpConfigPlan()`, `buildMemoryStackPlan()`, and
  `buildRuntimeProfileProjection()` for direct script consumers.
- Added `buildResolvedRuntimeProfileProjection()` and related helpers in
  `@kirakira/config-resolver` for consumers that already have resolved runtime
  state.
- Kept projection output file-free: it returns MCP config JSON and memory-stack
  plan fragments without touching local `.mcp.json`.

## Validation

- `pnpm vitest run test/unit/runtime/profile-resolution.test.ts`
- `pnpm vitest run test/unit/config-resolver/resolved-state.test.ts`

## Risk

Existing launcher and CLI paths are not all switched to the new projection
helpers yet. This slice adds the tested contract first so follow-up changes can
replace remaining local assembly without changing profile semantics.
