# Harness hardcoding readiness gate

Date: 2026-06-10

## Scope

- Added machine-readable readiness evidence for the unrelated dev-server port
  guard.
- The gate lives in `scripts/upgrade-readiness.mjs` at
  `gates.harnessHardcoding`.
- It scans runtime profile projection, startup, readiness, and MCP config
  fragments for forbidden port `5173`.

## Validation

```powershell
pnpm exec vitest run test/unit/scripts/upgrade-readiness.test.ts test/unit/eam-parity/eam-parity-audit.test.ts
node scripts/upgrade-readiness.mjs --format json
```

Expected readiness evidence:

- `gates.harnessHardcoding.status = "pass"`
- `gates.harnessHardcoding.totalMatches = 0`
- all scanned scopes report `matchCount = 0`
