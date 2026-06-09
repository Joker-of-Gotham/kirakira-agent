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

The audit defaults to the current workspace and
`reference_project/eam-agent`, but both roots are configurable. It compares
package directories and docs-plane directories, supports explicit aliases such
as `eamd=kirakirad`, and can emit Markdown or JSON.

## Validation

- `pnpm exec vitest run test/unit/eam-parity/eam-parity-audit.test.ts`
- `pnpm parity:eam -- --format json`

## Remaining work

This is a parity evidence surface, not a feature migration. Follow-up work
should add deeper file-level checks for runtime contracts, MCP configs, memory
pipelines, and orchestration kernel behavior once each subsystem has a stable
contract to compare.
