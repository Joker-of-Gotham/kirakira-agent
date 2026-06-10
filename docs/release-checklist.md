# Kirakira Release Checklist

Date: 2026-06-10

## Completion Bar

Kirakira is release-complete only when all of these are true:

- `node scripts/upgrade-readiness.mjs --profile workbench-host --format json`
  reports `25 pass / 0 warn / 0 fail`.
- `node scripts/eam-parity-audit.mjs --depth files` reports `missing=0` and no
  unclassified drift rows.
- `docs/upgrade/gates/runtime-full-lifecycle-gate.json` is a matching
  `passed` artifact from the no-skip Docker-backed lifecycle gate.
- Web, desktop renderer, and browser gateway targets are profile-derived:
  `5183`, `5174`, and `17373`; `5173` is not a Kirakira endpoint.
- The final commit is pushed and verified with
  `git ls-remote origin refs/heads/codex/runtime-orchestration-profile-baseline`.

## Current Status

Current terminal-upgrade evidence is complete as of commit `31c9106`:

- `upgrade-readiness`: `25 pass / 0 warn / 0 fail`.
- EAM parity: `missing=0`; all ten behavior drift rows are covered.
- Full lifecycle: `docs/upgrade/gates/runtime-full-lifecycle-gate.json` is
  `passed` with Docker preflight passed and `targetCollisions=0`.
- Fast hydrated QA and full-lifecycle hydrated QA use separate artifacts:
  `presentation-hydrated-visual-qa.json` and
  `presentation-hydrated-visual-qa-full-lifecycle.json`.
- Local-only exclusions remain `.mcp.json`, `.agents/`, `reference_project/`,
  and generated `skills-lock.json`.

## Local Commands

Fast non-Docker release check:

```powershell
node scripts/release-check.mjs --skip-docker --skip-hydrated
```

Renderer visual QA check:

```powershell
$env:VITE_KIRAKIRA_RUNTIME_MODE='mock'
node scripts/presentation-hydrated-visual-qa.mjs --gate presentation-hydrated-visual-qa --profile workbench-host --timeout-ms 180000 --skip-infra --skip-daemon --live
```

Final Docker-backed check:

```powershell
node scripts/release-check.mjs --full-lifecycle
```

## Lockfile Policy

`skills-lock.json` is local generated state and must not be committed. The
auditable workspace lockfile is `kirakira.lock`, backed by
`packages/core/src/schemas/lock.ts` and documented under
`docs/plane/kirakira-agent-registry/06-lockfile-spec/README.md`.

## Docker Requirement

The current release artifact is passed. If Docker Desktop or the Docker daemon
is unavailable during a future rerun, record that rerun as blocked evidence and
do not announce a refreshed release-complete state from renderer-only or mock
evidence.
