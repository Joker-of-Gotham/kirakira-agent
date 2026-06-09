# Readiness presentation projection gate

Date: 2026-06-10

## Scope

- Replaced hardcoded presentation URL comparisons in
  `scripts/upgrade-readiness.mjs` with a profile-derived consistency gate.
- Added `gates.presentationProjection` to compare readiness targets with the
  runtime profile env fragment:
  - `presentation:web` against `KIRAKIRA_WEB_URL`
  - `presentation:desktop` against `KIRAKIRA_DESKTOP_RENDERER_URL`
- Kept the unrelated dev-server port guard in `gates.harnessHardcoding`.

## Validation

```powershell
pnpm exec vitest run test/unit/scripts/upgrade-readiness.test.ts test/unit/eam-parity/eam-parity-audit.test.ts
node scripts/upgrade-readiness.mjs --format json
```

Expected readiness evidence:

- `gates.presentationProjection.status = "pass"`
- `gates.presentationProjection.failures = 0`
- each presentation target reports `status = "pass"`
