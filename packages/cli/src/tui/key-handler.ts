/**
 * Pure-function keyboard state machine for the TUI.
 *
 * Interaction policy:
 * - PgUp/PgDn scroll the transcript.
 * - Mouse wheel scrolling is handled in App via SGR mouse events.
 * - Up/Down arrows recall prompt history outside palettes.
 * - Esc closes transient UI or clears the composer; it does not enter a mode.
 * - Ctrl+R toggles the expanded tool-result transcript.
 */

import { isPrintableTextInput } from "./mouse.js";

export type FocusArea = "input" | "scroll";

export interface KeyState {
  focusArea: FocusArea;
  leaderPending: boolean;
  leaderKey: string;
  inputValue: string;
  cursorIndex: number;
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
  leftArrow: boolean;
  rightArrow: boolean;
  home: boolean;
  end: boolean;
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
  | { type: "toggle_tool_details" }
  | { type: "show_drawer"; tab: string }
  | { type: "execute_slash"; command: string }
  | { type: "focus"; area: FocusArea }
  | { type: "set_input"; value: string; cursorIndex?: number }
  | { type: "set_cursor"; cursorIndex: number }
  | { type: "set_history_idx"; idx: number }
  | { type: "set_scroll"; offset: number }
  | { type: "set_palette_idx"; idx: number }
  | { type: "submit"; text: string }
  | { type: "tab_complete_slash"; name: string }
  | { type: "tab_complete_mention"; relativePath: string; prefix: string };

export interface KeyResult {
  actions: Action[];
}

function maxScroll(st: KeyState): number {
  return Math.max(0, st.timelineLength - st.visibleCount);
}

function clampCursor(value: string, cursorIndex: number): number {
  return Math.max(0, Math.min(value.length, cursorIndex));
}

function setInput(value: string, cursorIndex = value.length): Action {
  return { type: "set_input", value, cursorIndex: clampCursor(value, cursorIndex) };
}

function insertAtCursor(value: string, cursorIndex: number, input: string): { value: string; cursorIndex: number } {
  const cursor = clampCursor(value, cursorIndex);
  const next = `${value.slice(0, cursor)}${input}${value.slice(cursor)}`;
  return { value: next, cursorIndex: cursor + input.length };
}

function backspaceAtCursor(value: string, cursorIndex: number): { value: string; cursorIndex: number } {
  const cursor = clampCursor(value, cursorIndex);
  if (cursor === 0) return { value, cursorIndex: 0 };
  return {
    value: `${value.slice(0, cursor - 1)}${value.slice(cursor)}`,
    cursorIndex: cursor - 1,
  };
}

function deleteAtCursor(value: string, cursorIndex: number): { value: string; cursorIndex: number } {
  const cursor = clampCursor(value, cursorIndex);
  if (cursor >= value.length) return { value, cursorIndex: cursor };
  return {
    value: `${value.slice(0, cursor)}${value.slice(cursor + 1)}`,
    cursorIndex: cursor,
  };
}

function detectPgUp(ev: KeyEvent): boolean {
  return ev.pageUp || ev.input === "\x1b[5~" || ev.input === "[5~";
}

function detectPgDn(ev: KeyEvent): boolean {
  return ev.pageDown || ev.input === "\x1b[6~" || ev.input === "[6~";
}

function handleGlobal(ev: KeyEvent, st: KeyState): KeyResult | null {
  if (st.leaderPending) {
    return { actions: [{ type: "set_leader_pending", pending: false }] };
  }

  if (ev.ctrl && ev.input === "c") return { actions: [{ type: "exit" }] };
  if (ev.ctrl && ev.input === "r") return { actions: [{ type: "toggle_tool_details" }] };

  if (detectPgUp(ev)) {
    const step = Math.max(1, Math.floor(st.visibleCount / 2));
    return { actions: [{ type: "set_scroll", offset: Math.min(st.scrollOffset + step, maxScroll(st)) }] };
  }
  if (detectPgDn(ev)) {
    const step = Math.max(1, Math.floor(st.visibleCount / 2));
    return { actions: [{ type: "set_scroll", offset: Math.max(0, st.scrollOffset - step) }] };
  }

  return null;
}

function handleEscape(ev: KeyEvent, st: KeyState): KeyResult | null {
  if (!ev.escape) return null;

  if (st.paletteActive) {
    if (st.slashActive) {
      return { actions: [setInput("", 0), { type: "set_palette_idx", idx: 0 }] };
    }
    if (st.mentionActive) {
      const nextValue = st.inputValue.slice(0, st.atPos);
      return {
        actions: [
          setInput(nextValue, nextValue.length),
          { type: "set_palette_idx", idx: 0 },
        ],
      };
    }
  }

  if (st.inputValue) return { actions: [setInput("", 0)] };
  return { actions: [{ type: "noop" }] };
}

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

function handleComposer(ev: KeyEvent, st: KeyState): KeyResult {
  const cursor = clampCursor(st.inputValue, st.cursorIndex);

  if (ev.return && !ev.shift) {
    const text = st.inputValue.trim();
    return text ? { actions: [{ type: "submit", text }] } : { actions: [{ type: "noop" }] };
  }

  if (ev.home || (ev.ctrl && ev.input === "a")) {
    return { actions: [{ type: "set_cursor", cursorIndex: 0 }] };
  }

  if (ev.end || (ev.ctrl && ev.input === "e")) {
    return { actions: [{ type: "set_cursor", cursorIndex: st.inputValue.length }] };
  }

  if (ev.leftArrow) {
    return { actions: [{ type: "set_cursor", cursorIndex: Math.max(0, cursor - 1) }] };
  }

  if (ev.rightArrow) {
    return { actions: [{ type: "set_cursor", cursorIndex: Math.min(st.inputValue.length, cursor + 1) }] };
  }

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

  if (ev.upArrow) {
    if (st.inputHistory.length > 0) {
      const next = Math.min(st.historyIdx + 1, st.inputHistory.length - 1);
      return {
        actions: [
          { type: "set_history_idx", idx: next },
          setInput(st.inputHistory[next]!, st.inputHistory[next]!.length),
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
          setInput(st.inputHistory[next]!, st.inputHistory[next]!.length),
        ],
      };
    }
    if (st.historyIdx === 0) {
      return {
        actions: [
          { type: "set_history_idx", idx: -1 },
          setInput("", 0),
        ],
      };
    }
    return { actions: [{ type: "noop" }] };
  }

  if (ev.backspace) {
    const next = backspaceAtCursor(st.inputValue, cursor);
    return {
      actions: [
        setInput(next.value, next.cursorIndex),
        { type: "set_scroll", offset: 0 },
        { type: "set_history_idx", idx: -1 },
      ],
    };
  }

  if (ev.delete) {
    const next = deleteAtCursor(st.inputValue, cursor);
    return {
      actions: [
        setInput(next.value, next.cursorIndex),
        { type: "set_scroll", offset: 0 },
        { type: "set_history_idx", idx: -1 },
      ],
    };
  }

  if (ev.input && !ev.ctrl && !ev.meta && isPrintableTextInput(ev.input)) {
    const next = insertAtCursor(st.inputValue, cursor, ev.input);
    return {
      actions: [
        setInput(next.value, next.cursorIndex),
        { type: "set_palette_idx", idx: 0 },
        { type: "set_scroll", offset: 0 },
        { type: "set_history_idx", idx: -1 },
      ],
    };
  }

  return { actions: [{ type: "noop" }] };
}

export function handleKey(ev: KeyEvent, st: KeyState): KeyResult {
  return (
    handleGlobal(ev, st) ??
    handleEscape(ev, st) ??
    handlePalette(ev, st) ??
    handleComposer(ev, st)
  );
}
