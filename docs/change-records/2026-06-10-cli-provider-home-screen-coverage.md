# CLI Provider And Home Screen Coverage

Date: 2026-06-10
Branch: `codex/runtime-orchestration-profile-baseline`

## Scope

This slice closes the CLI behavior-parity coverage gap for provider setup and
home-screen TUI states. It does not change Kirakira's runtime endpoints:
web `http://127.0.0.1:5183/`, desktop renderer `http://127.0.0.1:5174/`,
and browser gateway `ws://127.0.0.1:17373/runtime`.

## Changes

- Added focused Ink render/input tests for the provider setup flow from
  provider selection through key entry, model filtering, save, `.env` write,
  and process env update.
- Added escape-navigation coverage for the provider setup key step.
- Added compact and wide home-screen render coverage to catch bounded-frame
  regressions around the setup entry surface.
- Updated behavior parity evidence so the CLI drift row is covered instead of
  partial.

## Validation

- `pnpm.cmd exec vitest run test/unit/cli/tui/provider-home-screen.test.ts test/tui/layout-stability.test.ts test/unit/cli/tui/config.test.ts`
- `pnpm.cmd --filter @kirakira/cli typecheck`

## Remaining Risks

- Future provider setup UI changes should keep the focused render/input test as
  the contract rather than relying only on broad layout stability snapshots.
