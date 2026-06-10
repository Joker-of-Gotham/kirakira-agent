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

If Docker Desktop or the Docker daemon is unavailable, keep the blocked
full-lifecycle artifact as open work. Do not replace it with renderer-only or
mock evidence.
