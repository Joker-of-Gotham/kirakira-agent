# Kirakira Workbench Design System

Date: 2026-06-10

## Overview

Kirakira's shared web and Electron renderer is an operational workbench. The
first screen is the product surface: run control, swarm state, research evidence,
MCP tools, memory/runtime health, approvals, and artifacts. It must stay dense,
scan-friendly, and distinctive without becoming a marketing page.

## View Taxonomy

- Runs: primary plan board, activity stream, cancellation, run inspector.
- Agents: swarm topology, role readiness, live workers, lane drift, attention.
- Research: evidence runs, citation links, source artifacts, artifact queue.
- Systems: memory/runtime capability inspector, MCP inventory, tool playground.

The sidebar owns this IA. View counts and tones must be derived from projected
runtime state, not hardcoded labels.

## Tokens

Base color tokens live in `packages/frontend-app/src/styles.css` under
`:root`. Component CSS should use semantic aliases, not one-off component hex
values.

| Token | Role |
| --- | --- |
| `--kk-color-canvas` | App canvas background |
| `--kk-color-surface` | Primary panel and repeated-item surface |
| `--kk-color-surface-raised` | Sidebar/right-rail chrome |
| `--kk-color-surface-subtle` | Low-emphasis metric cells and nested repeated rows |
| `--kk-color-surface-muted` | Hover/selected neutral state |
| `--kk-color-border`, `--kk-color-border-strong` | Default and emphasized separators |
| `--kk-color-text`, `--kk-color-text-muted`, `--kk-color-ink` | Body, secondary, and heading text |
| `--kk-color-accent` | Operational active state; use sparingly |
| `--kk-color-success`, `--kk-color-warning`, `--kk-color-danger` | Runtime status states |
| `--kk-color-accent-border`, `--kk-color-success-border`, `--kk-color-warning-border`, `--kk-color-danger-border` | Status border emphasis |
| `--kk-color-accent-wash` | Low-emphasis active-state fill |
| `--kk-color-link`, `--kk-color-insight` | External links and special insight accents |
| `--kk-space-1` through `--kk-space-5` | 4px-based spacing scale |
| `--kk-radius-sm`, `--kk-radius-md`, `--kk-radius-pill` | Shape scale; panels and controls cap at 8px |
| `--kk-shadow-panel` | Top-level panel elevation only |
| `--kk-shell-gloss` | Subtle shell background gloss; not a hero gradient |

Legacy `--kk-*` aliases remain for compatibility, but new CSS should prefer the
semantic `--kk-color-*`, `--kk-space-*`, `--kk-radius-*`, and `--kk-shadow-*`
tokens.

## Typography

Use Inter/system UI for the renderer and a system monospace stack for JSON,
schemas, and artifact previews. Do not scale type with viewport width. Kicker
text stays uppercase with zero letter spacing. Compact panels use 0.72rem to
1rem labels; reserve larger headings for the workspace topbar.

## Layout

The desktop shell is a three-column grid: sidebar, workspace, right rail. The
workspace owns the active view surface, then the shared run inspector and
composer. Fixed-format surfaces use stable grid tracks:

- Navigation: icon, text, count.
- Metrics: three equal tracks, collapsing to one track on mobile.
- Boards: repeat tracks with explicit min widths.
- Research/artifact strips: auto-fit tracks with a 190px minimum.

At `820px` and below, all operational grids collapse to one column and overflow
inside repeated lists is released to avoid nested scroll traps.

## Components

Buttons use icons from `lucide-react` when a clear symbol exists. Repeated items
may be card-like rows with 8px radius; page sections are panels, not cards inside
cards. Top-level panels may use `--kk-shadow-panel`; nested repeated rows use
borders and surface tokens only.

Interactive controls must expose hover, focus-visible, disabled/loading where
applicable, and pressed/selected state via `aria-current`, `aria-pressed`, or
tab semantics.

## Do And Do Not

Do:

- Keep web and Electron renderer IA identical.
- Use runtime projections as the source of counts, status, and tones.
- Use cyan as a functional accent, balanced with sage, amber, coral, and neutral
  surfaces.
- Keep MCP, memory, artifacts, and research visible as operational systems.

Do not:

- Reintroduce an unrelated Vite default workbench target; Kirakira web and
  desktop renderer endpoints must come from the runtime profile.
- Add purple/blue gradient hero styling or decorative orbs.
- Put explanatory feature prose in the app chrome.
- Add raw component colors or spacing values without extending this token list.

## Motion And Accessibility

Motion is limited to 120ms hover/focus transitions and is disabled unless
`prefers-reduced-motion: no-preference` matches. Focus rings use the accent token
with an offset. Mobile touch targets should stay at least 36px in the dense
desktop shell and expand when controls stack.

## Dark Mode Strategy

Dark mode uses a single `prefers-color-scheme: dark` semantic token remap in
`packages/frontend-app/src/styles.css`. Component CSS must continue to consume
the same semantic tokens and must not duplicate dark-specific component rules.
