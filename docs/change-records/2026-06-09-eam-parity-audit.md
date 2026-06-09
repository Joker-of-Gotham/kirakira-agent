# EAM parity audit

Date: 2026-06-09

## Problem

The EAM-to-Kirakira migration roadmap had percentage estimates and hand-written
gap notes, but it lacked a repeatable command that could re-check the current
workspace against `reference_project/eam-agent`.

The first file-level pass still treated package and product namespace renames
as drift. That overstated gaps for Python packages such as
`memory-pipeline`/`model-gateway`, the Go daemon command path, and the tracing
docs file that renamed `eam-*` to `kirakira-*`.

## Change

- Added `scripts/eam-parity-audit.mjs`.
- Added `pnpm parity:eam`.
- Added unit coverage for package aliases, docs-plane prefix aliases, missing
  entries, and CLI argument parsing.
- Added `--depth files` for recursive file inventory comparison, with bounded
  missing/extra samples per package or docs plane.
- Added scoped file-path rename normalization for mechanism-preserving product
  renames:
  - `packages/eamd/cmd/eamd/*` -> `packages/kirakirad/cmd/kirakirad/*`
  - `src/eam_memory_pipeline/*` -> `src/kirakira_memory_pipeline/*`
  - `src/eam_model_gateway/*` -> `src/kirakira_model_gateway/*`
  - tracing docs filenames with `eam-` prefixes -> `kirakira-` prefixes
- Filtered generated Python cache artifacts from file inventory evidence.

The audit defaults to the current workspace and
`reference_project/eam-agent`, but both roots are configurable. It compares
package directories and docs-plane directories, supports explicit aliases such
as `eamd=kirakirad`, applies scoped file-path rename rules for known namespace
migrations, and can emit Markdown or JSON.

## Validation

- `pnpm exec vitest run test/unit/eam-parity/eam-parity-audit.test.ts`
- `pnpm parity:eam -- --format json`
- `pnpm parity:eam -- --depth files --format json`

On 2026-06-09 after rename-aware normalization:

- Directory-level audit: `exact=22`, `equivalent=9`, `drift=0`, `missing=0`,
  `extra=4`.
- File-level audit: `exact=15`, `equivalent=8`, `drift=8`, `missing=0`,
  `extra=4`.

That distinction is intentional: package presence is not treated as behavioral
parity, and product namespace migration is not treated as mechanism drift.

## Remaining work

This is a parity evidence surface, not a feature migration. Follow-up work
should turn the remaining true drift rows into subsystem-specific behavior
checks:

- `agent-runtime`: Kirakira delegate/runtime scope files are extra target
  surface and need contract-backed parity checks.
- `cli`: runtime/profile/doctor/provider-catalog command files are extra target
  surface and need command behavior coverage.
- `config-resolver`: runtime projection is Kirakira-only and should stay tied
  to resolved-state tests.
- `kirakirad`: `go.sum` remains an extra target artifact after command-path
  normalization.
- `mcp-adapter`: alias catalog, gateway context, and OTel bridge are extra
  target surface that should be validated through MCP trust/audit/span tests.
- `memory-store`: checkpoint migration/repository files are extra target
  surface and need live persistence coverage.
- `orchestrator-kernel`: subagent/deep-research runtime bridge files are extra
  target surface and need topology/lineage checks.
- `runtime-daemon`: daemon config, MCP/memory/deep-research dependency
  factories, runtime deps, and socket path files remain extra target surface.
