# Keybindings (target)

Bindings apply to the future Ink TUI; stdin in plain `kirakira-agent exec` has no global keymap.

## Global

| Key | Action |
|-----|--------|
| `Ctrl+C` | Interrupt current turn / exit when idle |
| `Ctrl+D` | EOF (submit or exit ) |
| `Ctrl+L` | Clear timeline (non-destructive) |
| `/` | Focus input with slash prefix |

## Navigation (when `vim_mode: true`)

| Key | Action |
|-----|--------|
| `j` / `k` | Scroll timeline |
| `gg` / `G` | Jump start/end |

## Approval overlay

These align with **`processApprovalDecision`** values in `packages/cli/src/approval/decision.ts` (`ApprovalDecision` union from `@kirakira/core`):

| Key | Decision | Meaning |
|-----|----------|---------|
| `y` | `allow_once` | Proceed once |
| `n` | `deny` | Reject request |
| `Shift+Y` / session bind | `allow_session` | Remember pattern (allowlist) |
| `!` | *host force* | Reserved for destructive confirm (maps to policy `shell.hostExecution`) |
| `#` | `deny_block` | Block category |
| `?` | `details` | Expand diff / logs without deciding |

> Exact modifier keys depend on Ink `useInput`; keep semantics stable even if letters differ on layouts.

## Slash palette

Typing `/` + `Tab` should complete against `SLASH_COMMANDS_ARRAY` (`parser/slash.ts`).

## Accessibility

Provide `--no-tui` / `--human` fallbacks (`exec` already prints plain text; `output/default` enums in `agentTomlSchema.output`).
