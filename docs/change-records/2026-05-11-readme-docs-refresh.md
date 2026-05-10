# 2026-05-11 README and docs refresh

## Request

Refresh the public-facing documentation, make the top-level README presentable on GitHub, include screenshots and dynamic media, and bring the entry docs back in sync with the current implementation.

## Problems found

- `README.md` was no longer usable as an entry document and did not match the current runtime path.
- the top-level architecture doc was outdated and not aligned with the single-path startup model now used by the repo.
- the CLI plane docs still described the TUI as a future target even though the Ink interface is now the active product surface.
- there was no simple documentation hub that told a reader where to start.
- the repo had no generated media for the README, so the landing page could not show the current design direction cleanly.

## Files changed

- `README.md`
- `docs/README.md`
- `docs/architecture.md`
- `docs/plane/kirakira-agent-cli/README.md`
- `docs/plane/kirakira-agent-cli/04-tui/README.md`
- `docs/assets/readme/kirakira-hero.png`
- `docs/assets/readme/kirakira-provider-setup.png`
- `docs/assets/readme/kirakira-transcript.png`
- `docs/assets/readme/kirakira-tool-cards.png`
- `docs/assets/readme/kirakira-demo.gif`
- `scripts/generate_readme_media.py`

## Implementation details

### README rewrite

Replaced the old root README with a GitHub-oriented landing page that now covers:

- product summary
- screenshot and GIF media
- one-command startup path
- provider support and model discovery behavior
- architecture overview
- repo layout
- documentation links
- current validation snapshot

### Documentation hub

Added `docs/README.md` as the documentation entrypoint so readers can move from the top-level README into architecture, subsystem planes, and change records without guessing.

### Architecture update

Rewrote `docs/architecture.md` around the current repo shape:

- `pnpm start` as the canonical bootstrap path
- Docker-backed runtime services
- current package boundaries
- provider catalog behavior
- MCP integration
- policy transport
- TUI row-based transcript model

### CLI and TUI plane refresh

Updated the CLI plane docs to reflect the current product surface and rewrote the TUI page to describe the active Ink implementation instead of a future target.

### README media pipeline

The README media is now generated from `scripts/generate_readme_media.py`. The script produces:

- hero image
- provider setup screenshot
- transcript screenshot
- tool-card screenshot
- animated GIF

The transcript image canvas was also adjusted so the bottom composer card no longer clips against the terminal frame.

## Verification

Commands run for this documentation pass:

```powershell
python scripts\generate_readme_media.py
git diff -- README.md docs scripts\generate_readme_media.py
```

Observed result:

- README media regenerated successfully under `docs/assets/readme/`
- the new entry docs reference the generated assets correctly
- the transcript media layout no longer clips the bottom composer area

## Remaining notes

- The README intentionally focuses on the current runtime path rather than every historical design document in `docs/plane/`.
- The broader subsystem plane docs outside the CLI/TUI entry path were left intact unless they blocked navigation or contradicted the current implementation.
