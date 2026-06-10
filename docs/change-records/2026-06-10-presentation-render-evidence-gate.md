# Presentation Render Evidence Gate

Date: 2026-06-10

## Change

- Added a shared renderer SSR evidence helper at
  `packages/frontend-app/src/presentation-render-evidence.ts`.
- Added `pnpm presentation:render` through
  `scripts/presentation-render-evidence.ts`.
- Added the durable gate artifact
  `docs/upgrade/gates/presentation-render-evidence.json`.
- Wired `upgrade-readiness` to require the render evidence artifact for the
  Web + Electron presentation track.
- Made `@kirakira/frontend-app` explicitly depend on `react-dom` so SSR
  evidence does not rely on transitive or hoisted packages.

## Boundary

This gate does not start Vite, Electron, Docker, the runtime daemon, or any
socket probe. It renders the shared React workbench twice with inert transports:
`browser-gateway` for Web and `desktop-ipc` for the Electron renderer. The
artifact stores selector and text marker results plus HTML bytes and hashes; it
does not store full HTML.

## Validation

```powershell
pnpm.cmd exec vitest run test/unit/frontend-app/presentation-render-evidence.test.ts test/unit/scripts/presentation-render-evidence.test.ts
pnpm.cmd presentation:render -- --profile workbench-host --write-result docs/upgrade/gates/presentation-render-evidence.json --format json
pnpm.cmd exec vitest run test/unit/scripts/upgrade-readiness.test.ts
node scripts/upgrade-readiness.mjs --profile workbench-host --format json
```

## Follow-Up

This closes the offline render evidence layer between static source checks and
opt-in live workbench smoke. It does not replace screenshot QA or live Electron
smoke; those remain separate slower gates.
