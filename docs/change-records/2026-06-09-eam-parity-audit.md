# EAM parity audit

Date: 2026-06-09

## Problem

The EAM-to-Kirakira migration roadmap had percentage estimates and hand-written
gap notes, but it lacked a repeatable command that could re-check the current
workspace against `reference_project/eam-agent`.

## Change

- Added `scripts/eam-parity-audit.mjs`.
- Added `pnpm parity:eam`.
- Added unit coverage for package aliases, docs-plane prefix aliases, missing
  entries, and CLI argument parsing.
- Added `--depth files` for recursive file inventory comparison, with bounded
  missing/extra samples per package or docs plane.

The audit defaults to the current workspace and
`reference_project/eam-agent`, but both roots are configurable. It compares
package directories and docs-plane directories, supports explicit aliases such
as `eamd=kirakirad`, and can emit Markdown or JSON.

## Validation

- `pnpm exec vitest run test/unit/eam-parity/eam-parity-audit.test.ts`
- `pnpm parity:eam -- --format json`
- `pnpm parity:eam -- --depth files --format json`

On 2026-06-09 the directory-level audit reported `missing=0`, while the
file-level audit reported `drift=11`. That distinction is intentional: package
presence is not treated as behavioral parity.

## Remaining work

This is a parity evidence surface, not a feature migration. Follow-up work
should turn the drift rows for memory-pipeline, model-gateway, tracing docs, and
daemon/kernel contracts into subsystem-specific behavior checks.
