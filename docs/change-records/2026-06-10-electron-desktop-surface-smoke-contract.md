# Electron Desktop Surface Smoke Contract

Date: 2026-06-10

## Change

- Added the desktop presentation surface selector to the default Electron smoke
  manifest:
  `[data-kk-presentation-surface="desktop"]`.
- Updated Electron smoke tests so a renderer that only mounts the shared web
  shell but does not identify as the desktop surface fails the smoke contract.
- Updated the presentation quality gate so desktop smoke content checks include
  the surface identity selector.

## External Constraints

- Electron security guidance recommends hardened renderer settings such as
  context isolation, disabled Node integration for remote content, sandboxing,
  and restrictive loading practices:
  <https://www.electronjs.org/docs/latest/tutorial/security>.
- Playwright exposes Electron application testing APIs that make renderer smoke
  assertions suitable for future full desktop automation:
  <https://playwright.dev/docs/api/class-electron>.

## Validation

```powershell
pnpm exec vitest run test/unit/desktop/startup-manifest.test.ts test/unit/desktop/electron-smoke.test.ts test/unit/scripts/presentation-quality-gate.test.ts
pnpm --filter @kirakira/desktop typecheck
node scripts/presentation-quality-gate.mjs --profile workbench-host --format json
```
