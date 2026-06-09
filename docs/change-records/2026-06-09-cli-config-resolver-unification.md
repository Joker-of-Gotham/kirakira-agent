# CLI Config Resolver Unification

Date: 2026-06-09

## References

- XDG Base Directory Specification:
  https://specifications.freedesktop.org/basedir-spec/latest/
- Twelve-Factor App config:
  https://12factor.net/config
- Node.js `process.env`:
  https://nodejs.org/api/process.html#processenv
- TOML v1.0.0:
  https://toml.io/en/v1.0.0

## Change

- Replaced the CLI-local config merge path with a thin
  `@kirakira/config-resolver` adapter.
- Added explicit `repoConfigPath` support to the resolver loader so CLI
  `--config` keeps its existing override behavior while system/user/repo/
  workspace layers share one implementation.
- Kept missing explicit config files fail-fast through `ConfigError`.
- Added `@kirakira/config-resolver` as a direct CLI dependency and externalized
  it in the CLI bundle.

## Why

The CLI and daemon had diverged into separate config ownership paths. That
kept old defaults alive in `packages/cli/src/config/loader.ts` and made runtime
profiles, memory defaults, MCP catalogs, and presentation endpoints dependent
on which entrypoint launched the system.

This change makes the resolver the single source for merged agent config,
policy defaults, local overrides, runtime profile projection, and fingerprint
generation.

## Validation

Passed before commit:

- `pnpm.cmd install --no-frozen-lockfile`
- `pnpm.cmd --filter @kirakira/config-resolver typecheck`
- `pnpm.cmd --filter @kirakira/config-resolver build`
- `pnpm.cmd --filter @kirakira/cli typecheck`
- `pnpm.cmd --filter @kirakira/cli build`
- `pnpm.cmd exec vitest run test/unit/cli/config/loader.test.ts test/unit/config-resolver/resolved-state.test.ts test/unit/cli/config/agent-toml.test.ts test/unit/cli/config/policy-yaml.test.ts test/contract/config/agent-toml-compat.test.ts`
- `git diff --check`
