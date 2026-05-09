/**
 * Pure-function keyboard state machine for the TUI.
 *
 * Key design for IDE-embedded terminals (Cursor/VS Code):
 *   - Ctrl+B/U/D may be intercepted by the IDE
 *   - PgUp/PgDn ALWAYS scroll the timeline (most reliable)
 *   - Up/Down arrows: history recall OR scroll (context-dependent)
 *   - Escape with empty input: enter scroll mode
 *
 * Layer pipeline:
 *   Global → Scroll-mode → Escape → Palette → Composer
 */

/* ── Types ─────────────────────────────────────────────────────── */

export type FocusArea = "input" | "scroll";

export interface KeyState {
  focusArea: FocusArea;
  leaderPending: boolean;
  leaderKey: string;
  inputValue: string;
  inputHistory: string[];
  historyIdx: number;
  scrollOffset: number;
  paletteIdx: number;
  timelineLength: number;
  visibleCount: number;

  slashActive: boolean;
  mentionActive: boolean;
  paletteActive: boolean;
  filteredSlashCount: number;
  filteredMentionCount: number;
  atPos: number;
}

export interface KeyEvent {
  input: string;
  ctrl: boolean;
  meta: boolean;
  escape: boolean;
  return: boolean;
  shift: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  upArrow: boolean;
  downArrow: boolean;
  pageUp: boolean;
  pageDown: boolean;
}

export type Action =
  | { type: "noop" }
  | { type: "exit" }
  | { type: "set_leader_pending"; pending: boolean }
  | { type: "redraw" }
  | { type: "toggle_drawer" }
  | { type: "toggle_sidebar" }
  | { type: "show_drawer"; tab: string }
  | { type: "execute_slash"; command: string }
  | { type: "focus"; area: FocusArea }
  | { type: "set_input"; value: string }
  | { type: "set_history_idx"; idx: number }
  | { type: "set_scroll"; offset: number }
  | { type: "set_palette_idx"; idx: number }
  | { type: "submit"; text: string }
  | { type: "tab_complete_slash"; name: string }
  | { type: "tab_complete_mention"; relativePath: string; prefix: string };

export interface KeyResult {
  actions: Action[];
}

/* ── Detection helpers ─────────────────────────────────────────── */

function maxScroll(st: KeyState): number {
  return Math.max(0, st.timelineLength - st.visibleCount);
}

function detectPgUp(ev: KeyEvent): boolean {
  return ev.pageUp || ev.input === "\x1b[5~" || ev.input === "[5~";
}

function detectPgDn(ev: KeyEvent): boolean {
  return ev.pageDown || ev.input === "\x1b[6~" || ev.input === "[6~";
}

function isLeaderTrigger(ev: KeyEvent, st: KeyState): boolean {
  if (st.leaderKey === "none") return false;
  if (st.leaderKey === "ctrl+x") return ev.ctrl && ev.input === "x";
  return false;
}

function handleLeaderChord(ev: KeyEvent): KeyResult {
  const clear: Action = { type: "set_leader_pending", pending: false };
  if (ev.escape) return { actions: [clear] };

  const key = ev.input.toLowerCase();
  if (!key) return { actions: [{ type: "noop" }] };

  if (key === "q") return { actions: [clear, { type: "exit" }] };
  if (key === "h") return { actions: [clear, { type: "execute_slash", command: "help" }] };
  if (key === "n") return { actions: [clear, { type: "execute_slash", command: "new" }] };
  if (key === "l") return { actions: [clear, { type: "execute_slash", command: "sessions" }] };
  if (key === "c") return { actions: [clear, { type: "execute_slash", command: "compact" }] };
  if (key === "d") return { actions: [clear, { type: "execute_slash", command: "details" }] };
  if (key === "m") return { actions: [clear, { type: "execute_slash", command: "models" }] };
  if (key === "t") return { actions: [clear, { type: "execute_slash", command: "themes" }] };
  if (key === "u") return { actions: [clear, { type: "execute_slash", command: "undo" }] };
  if (key === "r") return { actions: [clear, { type: "execute_slash", command: "redo" }] };
  if (key === "x") return { actions: [clear, { type: "execute_slash", command: "export" }] };
  if (key === "a") return { actions: [clear, { type: "show_drawer", tab: "subagents" }] };
  if (key === "o") return { actions: [clear, { type: "show_drawer", tab: "trace" }] };
  if (key === "p") return { actions: [clear, { type: "show_drawer", tab: "policy" }] };
  if (key === "g") return { actions: [clear, { type: "show_drawer", tab: "tasks" }] };
  if (key === "s") return { actions: [clear, { type: "show_drawer", tab: "config" }] };
  if (key === "b") return { actions: [clear, { type: "toggle_sidebar" }] };

  return { actions: [clear] };
}

/* ── Layer 1: Global shortcuts (always active) ─────────────────── */

function handleGlobal(ev: KeyEvent, st: KeyState): KeyResult | null {
  if (st.leaderPending) {
    return handleLeaderChord(ev);
  }

  if (isLeaderTrigger(ev, st)) {
    return { actions: [{ type: "set_leader_pending", pending: true }] };
  }

  if (ev.ctrl && ev.input === "c") {
    return { actions: [{ type: "exit" }] };
  }
  if (ev.ctrl && ev.input === "l") {
    return { actions: [{ type: "redraw" }] };
  }
  if (ev.ctrl && ev.input === "o") {
    return { actions: [{ type: "toggle_drawer" }] };
  }
  if (ev.ctrl && ev.input === "t") {
    return { actions: [{ type: "show_drawer", tab: "mcp" }] };
  }

  if (ev.ctrl && ev.input === "b") {
    const next: FocusArea = st.focusArea === "input" ? "scroll" : "input";
    return { actions: [{ type: "focus", area: next }] };
  }

  /* PgUp/PgDn ALWAYS scroll the timeline — works in any mode,
     never intercepted by IDE, most reliable scroll mechanism */
  const isPgUp = detectPgUp(ev);
  const isPgDn = detectPgDn(ev);

  if (isPgUp) {
    const halfPage = Math.floor(st.visibleCount / 2);
    const offset = Math.min(st.scrollOffset + halfPage, maxScroll(st));
    return { actions: [{ type: "set_scroll", offset }] };
  }
  if (isPgDn) {
    const halfPage = Math.floor(st.visibleCount / 2);
    const offset = Math.max(0, st.scrollOffset - halfPage);
    return { actions: [{ type: "set_scroll", offset }] };
  }

  /* Ctrl+U/D = half-page scroll (vim-style, may not work in IDE terminals) */
  if (ev.ctrl && ev.input === "u") {
    const step = Math.floor(st.visibleCount / 2);
    const offset = Math.min(st.scrollOffset + step, maxScroll(st));
    return { actions: [{ type: "set_scroll", offset }] };
  }
  if (ev.ctrl && ev.input === "d") {
    const step = Math.floor(st.visibleCount / 2);
    const offset = Math.max(0, st.scrollOffset - step);
    return { actions: [{ type: "set_scroll", offset }] };
  }

  return null;
}

/* ── Layer 2: Scroll mode (pager-style) ──────────────────────── */

function handleScrollMode(ev: KeyEvent, st: KeyState): KeyResult | null {
  if (st.focusArea !== "scroll") return null;

  const ms = maxScroll(st);

  if (ev.upArrow || ev.input === "k") {
    return { actions: [{ type: "set_scroll", offset: Math.min(st.scrollOffset + 1, ms) }] };
  }
  if (ev.downArrow || ev.input === "j") {
    return { actions: [{ type: "set_scroll", offset: Math.max(0, st.scrollOffset - 1) }] };
  }

  if (ev.input === "G") {
    return { actions: [{ type: "set_scroll", offset: 0 }] };
  }
  if (ev.input === "g") {
    return { actions: [{ type: "set_scroll", offset: ms }] };
  }

  if (ev.escape || ev.input === "q" || ev.return) {
    return { actions: [{ type: "focus", area: "input" }] };
  }

  /* Any other printable character exits scroll and types into input */
  if (ev.input && !ev.ctrl && !ev.meta &&
      ev.input !== "k" && ev.input !== "j" &&
      ev.input !== "g" && ev.input !== "G" && ev.input !== "q") {
    return {
      actions: [
        { type: "focus", area: "input" },
        { type: "set_input", value: st.inputValue + ev.input },
        { type: "set_palette_idx", idx: 0 },
        { type: "set_scroll", offset: 0 },
        { type: "set_history_idx", idx: -1 },
      ],
    };
  }

  return { actions: [{ type: "noop" }] };
}

/* ── Layer 3: Escape handling ──────────────────────────────────── */

function handleEscape(ev: KeyEvent, st: KeyState): KeyResult | null {
  if (!ev.escape) return null;

  if (st.focusArea === "scroll") {
    return { actions: [{ type: "focus", area: "input" }] };
  }

  if (st.paletteActive) {
    if (st.slashActive) {
      return { actions: [{ type: "set_input", value: "" }, { type: "set_palette_idx", idx: 0 }] };
    }
    if (st.mentionActive) {
      return {
        actions: [
          { type: "set_input", value: st.inputValue.slice(0, st.atPos) },
          { type: "set_palette_idx", idx: 0 },
        ],
      };
    }
  }

  if (st.inputValue) {
    return { actions: [{ type: "set_input", value: "" }] };
  }

  return { actions: [{ type: "focus", area: "scroll" }] };
}

/* ── Layer 4: Palette navigation ───────────────────────────────── */

function handlePalette(ev: KeyEvent, st: KeyState): KeyResult | null {
  if (!st.paletteActive) return null;

  if (ev.upArrow) {
    return { actions: [{ type: "set_palette_idx", idx: Math.max(0, st.paletteIdx - 1) }] };
  }
  if (ev.downArrow) {
    const count = st.slashActive ? st.filteredSlashCount : st.filteredMentionCount;
    return { actions: [{ type: "set_palette_idx", idx: Math.min(count - 1, st.paletteIdx + 1) }] };
  }

  return null;
}

/* ── Layer 5: Composer (input area) ────────────────────────────── */

function handleComposer(ev: KeyEvent, st: KeyState): KeyResult {
  const ms = maxScroll(st);

  /* Enter → submit */
  if (ev.return && !ev.shift) {
    const text = st.inputValue.trim();
    if (text) {
      return { actions: [{ type: "submit", text }] };
    }
    return { actions: [{ type: "noop" }] };
  }

  /* Tab → palette completion */
  if (ev.tab) {
    if (st.slashActive && st.filteredSlashCount > 0) {
      return { actions: [{ type: "tab_complete_slash", name: "" }] };
    }
    if (st.mentionActive && st.filteredMentionCount > 0) {
      return {
        actions: [{
          type: "tab_complete_mention",
          relativePath: "",
          prefix: st.inputValue.slice(0, st.atPos),
        }],
      };
    }
    return { actions: [{ type: "noop" }] };
  }

  /* ↑/↓ without palette → history recall */
  if (ev.upArrow) {
    if (!st.inputValue && st.historyIdx === -1 && st.inputHistory.length === 0 && st.scrollOffset < ms) {
      return { actions: [{ type: "set_scroll", offset: st.scrollOffset + 1 }] };
    }
    if (st.inputHistory.length > 0) {
      const next = Math.min(st.historyIdx + 1, st.inputHistory.length - 1);
      return {
        actions: [
          { type: "set_history_idx", idx: next },
          { type: "set_input", value: st.inputHistory[next]! },
        ],
      };
    }
    return { actions: [{ type: "noop" }] };
  }
  if (ev.downArrow) {
    if (st.historyIdx > 0) {
      const next = st.historyIdx - 1;
      return {
        actions: [
          { type: "set_history_idx", idx: next },
          { type: "set_input", value: st.inputHistory[next]! },
        ],
      };
    }
    if (st.historyIdx === 0) {
      return {
        actions: [
          { type: "set_history_idx", idx: -1 },
          { type: "set_input", value: "" },
        ],
      };
    }
    if (!st.inputValue && st.historyIdx === -1 && st.inputHistory.length === 0 && st.scrollOffset > 0) {
      return { actions: [{ type: "set_scroll", offset: st.scrollOffset - 1 }] };
    }
    return { actions: [{ type: "noop" }] };
  }

  /* Backspace */
  if (ev.backspace || ev.delete) {
    return {
      actions: [
        { type: "set_input", value: st.inputValue.slice(0, -1) },
        { type: "set_scroll", offset: 0 },
        { type: "set_history_idx", idx: -1 },
      ],
    };
  }

  /* Regular character */
  if (ev.input && !ev.ctrl && !ev.meta) {
    return {
      actions: [
        { type: "set_input", value: st.inputValue + ev.input },
        { type: "set_palette_idx", idx: 0 },
        { type: "set_scroll", offset: 0 },
        { type: "set_history_idx", idx: -1 },
      ],
    };
  }

  return { actions: [{ type: "noop" }] };
}

/* ── Main dispatcher (layered pipeline) ────────────────────────── */

export function handleKey(ev: KeyEvent, st: KeyState): KeyResult {
  return (
    handleGlobal(ev, st) ??
    handleScrollMode(ev, st) ??
    handleEscape(ev, st) ??
    handlePalette(ev, st) ??
    handleComposer(ev, st)
  );
}
