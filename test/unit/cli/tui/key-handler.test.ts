import { describe, expect, it } from "vitest";
import { handleKey } from "../../../../packages/cli/src/tui/key-handler.js";
import type { KeyEvent, KeyState, FocusArea, Action } from "../../../../packages/cli/src/tui/key-handler.js";

/* ── Helpers ──────────────────────────────────────────────────── */

function emptyKey(overrides: Partial<KeyEvent> = {}): KeyEvent {
  return {
    input: "",
    ctrl: false,
    meta: false,
    escape: false,
    return: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    upArrow: false,
    downArrow: false,
    pageUp: false,
    pageDown: false,
    ...overrides,
  };
}

function baseState(overrides: Partial<KeyState> = {}): KeyState {
  return {
    focusArea: "input",
    leaderPending: false,
    leaderKey: "ctrl+x",
    inputValue: "",
    inputHistory: [],
    historyIdx: -1,
    scrollOffset: 0,
    paletteIdx: 0,
    timelineLength: 20,
    visibleCount: 10,
    slashActive: false,
    mentionActive: false,
    paletteActive: false,
    filteredSlashCount: 0,
    filteredMentionCount: 0,
    atPos: -1,
    ...overrides,
  };
}

function findAction(actions: Action[], type: string): Action | undefined {
  return actions.find((a) => a.type === type);
}

/* ── Layer 1: Global shortcuts ────────────────────────────────── */

describe("key-handler", () => {
  describe("Leader key (ctrl+x)", () => {
    it("arms leader pending on Ctrl+X", () => {
      const { actions } = handleKey(
        emptyKey({ ctrl: true, input: "x" }),
        baseState(),
      );
      expect(findAction(actions, "set_leader_pending")).toEqual({
        type: "set_leader_pending",
        pending: true,
      });
    });

    it("runs slash command on leader chord", () => {
      const { actions } = handleKey(
        emptyKey({ input: "h" }),
        baseState({ leaderPending: true }),
      );
      expect(findAction(actions, "set_leader_pending")).toEqual({
        type: "set_leader_pending",
        pending: false,
      });
      expect(findAction(actions, "execute_slash")).toEqual({
        type: "execute_slash",
        command: "help",
      });
    });

    it("maps leader+u to undo", () => {
      const { actions } = handleKey(
        emptyKey({ input: "u" }),
        baseState({ leaderPending: true }),
      );
      expect(findAction(actions, "execute_slash")).toEqual({
        type: "execute_slash",
        command: "undo",
      });
    });
  });

  describe("Ctrl+B focus toggle (global)", () => {
    it("input → scroll", () => {
      const { actions } = handleKey(
        emptyKey({ ctrl: true, input: "b" }),
        baseState({ focusArea: "input" }),
      );
      expect(findAction(actions, "focus")).toEqual({ type: "focus", area: "scroll" });
    });

    it("scroll → input", () => {
      const { actions } = handleKey(
        emptyKey({ ctrl: true, input: "b" }),
        baseState({ focusArea: "scroll" }),
      );
      expect(findAction(actions, "focus")).toEqual({ type: "focus", area: "input" });
    });
  });

  describe("PgUp/PgDn ALWAYS scroll timeline (global layer)", () => {
    it("PgUp scrolls up half-page from input mode", () => {
      const { actions } = handleKey(
        emptyKey({ pageUp: true }),
        baseState({ focusArea: "input", scrollOffset: 0, timelineLength: 30, visibleCount: 10 }),
      );
      expect(findAction(actions, "set_scroll")).toEqual({ type: "set_scroll", offset: 5 });
    });

    it("PgDn scrolls down half-page from input mode", () => {
      const { actions } = handleKey(
        emptyKey({ pageDown: true }),
        baseState({ focusArea: "input", scrollOffset: 10, visibleCount: 10 }),
      );
      expect(findAction(actions, "set_scroll")).toEqual({ type: "set_scroll", offset: 5 });
    });

    it("PgUp from scroll mode also scrolls", () => {
      const { actions } = handleKey(
        emptyKey({ pageUp: true }),
        baseState({ focusArea: "scroll", scrollOffset: 0, timelineLength: 40, visibleCount: 10 }),
      );
      expect(findAction(actions, "set_scroll")).toEqual({ type: "set_scroll", offset: 5 });
    });

    it("PgUp caps at maxScroll", () => {
      const { actions } = handleKey(
        emptyKey({ pageUp: true }),
        baseState({ scrollOffset: 8, timelineLength: 15, visibleCount: 10 }),
      );
      const s = findAction(actions, "set_scroll") as { offset: number };
      expect(s.offset).toBe(5);
    });

    it("PgDn floors at 0", () => {
      const { actions } = handleKey(
        emptyKey({ pageDown: true }),
        baseState({ scrollOffset: 2, visibleCount: 10 }),
      );
      const s = findAction(actions, "set_scroll") as { offset: number };
      expect(s.offset).toBe(0);
    });

    it("PgUp via escape sequence works", () => {
      const { actions } = handleKey(
        emptyKey({ input: "\x1b[5~" }),
        baseState({ scrollOffset: 0, timelineLength: 30, visibleCount: 10 }),
      );
      expect(findAction(actions, "set_scroll")).toEqual({ type: "set_scroll", offset: 5 });
    });
  });

  describe("Ctrl+U/D timeline scroll (global, any focus)", () => {
    it("Ctrl+U scrolls up in input focus", () => {
      const { actions } = handleKey(
        emptyKey({ ctrl: true, input: "u" }),
        baseState({ focusArea: "input", scrollOffset: 0, timelineLength: 30, visibleCount: 10 }),
      );
      const s = findAction(actions, "set_scroll") as { offset: number };
      expect(s.offset).toBe(5);
    });

    it("Ctrl+D scrolls down", () => {
      const { actions } = handleKey(
        emptyKey({ ctrl: true, input: "d" }),
        baseState({ scrollOffset: 10, visibleCount: 10 }),
      );
      const s = findAction(actions, "set_scroll") as { offset: number };
      expect(s.offset).toBe(5);
    });
  });

  /* ── Layer 2: Scroll mode (pager-style) ──────────────────────── */

  describe("Scroll mode — pager-style navigation", () => {
    const scrollState = (overrides: Partial<KeyState> = {}) =>
      baseState({ focusArea: "scroll", timelineLength: 40, visibleCount: 10, ...overrides });

    it("↑ or k scrolls 1 line up", () => {
      const r1 = handleKey(emptyKey({ upArrow: true }), scrollState({ scrollOffset: 0 }));
      expect(findAction(r1.actions, "set_scroll")).toEqual({ type: "set_scroll", offset: 1 });

      const r2 = handleKey(emptyKey({ input: "k" }), scrollState({ scrollOffset: 5 }));
      expect(findAction(r2.actions, "set_scroll")).toEqual({ type: "set_scroll", offset: 6 });
    });

    it("↓ or j scrolls 1 line down", () => {
      const r1 = handleKey(emptyKey({ downArrow: true }), scrollState({ scrollOffset: 5 }));
      expect(findAction(r1.actions, "set_scroll")).toEqual({ type: "set_scroll", offset: 4 });

      const r2 = handleKey(emptyKey({ input: "j" }), scrollState({ scrollOffset: 5 }));
      expect(findAction(r2.actions, "set_scroll")).toEqual({ type: "set_scroll", offset: 4 });
    });

    it("g jumps to top (max scroll)", () => {
      const { actions } = handleKey(emptyKey({ input: "g" }), scrollState({ scrollOffset: 0 }));
      expect(findAction(actions, "set_scroll")).toEqual({ type: "set_scroll", offset: 30 });
    });

    it("G jumps to bottom (scroll = 0)", () => {
      const { actions } = handleKey(emptyKey({ input: "G" }), scrollState({ scrollOffset: 20 }));
      expect(findAction(actions, "set_scroll")).toEqual({ type: "set_scroll", offset: 0 });
    });

    it("q exits scroll mode", () => {
      const { actions } = handleKey(emptyKey({ input: "q" }), scrollState());
      expect(findAction(actions, "focus")).toEqual({ type: "focus", area: "input" });
    });

    it("Esc exits scroll mode", () => {
      const { actions } = handleKey(emptyKey({ escape: true }), scrollState());
      expect(findAction(actions, "focus")).toEqual({ type: "focus", area: "input" });
    });

    it("Enter exits scroll mode", () => {
      const { actions } = handleKey(emptyKey({ return: true }), scrollState());
      expect(findAction(actions, "focus")).toEqual({ type: "focus", area: "input" });
    });

    it("typing character exits scroll and appends to input", () => {
      const { actions } = handleKey(emptyKey({ input: "h" }), scrollState({ inputValue: "" }));
      const focus = findAction(actions, "focus") as { area: FocusArea };
      expect(focus.area).toBe("input");
      const inp = findAction(actions, "set_input") as { value: string };
      expect(inp.value).toBe("h");
    });
  });

  /* ── Layer 3: Escape handling ─────────────────────────────── */

  describe("Escape in input mode", () => {
    it("closes slash palette first", () => {
      const { actions } = handleKey(
        emptyKey({ escape: true }),
        baseState({ inputValue: "/he", slashActive: true, paletteActive: true }),
      );
      expect(findAction(actions, "set_input")).toEqual({ type: "set_input", value: "" });
      expect(findAction(actions, "focus")).toBeUndefined();
    });

    it("clears input when non-empty", () => {
      const { actions } = handleKey(
        emptyKey({ escape: true }),
        baseState({ inputValue: "hello" }),
      );
      expect(findAction(actions, "set_input")).toEqual({ type: "set_input", value: "" });
    });

    it("enters scroll mode when input is empty", () => {
      const { actions } = handleKey(
        emptyKey({ escape: true }),
        baseState({ inputValue: "" }),
      );
      expect(findAction(actions, "focus")).toEqual({ type: "focus", area: "scroll" });
    });
  });

  /* ── Layer 4: Palette navigation ──────────────────────────── */

  describe("Palette arrow navigation", () => {
    it("↑ moves palette selection up", () => {
      const { actions } = handleKey(
        emptyKey({ upArrow: true }),
        baseState({ paletteActive: true, slashActive: true, paletteIdx: 3 }),
      );
      expect(findAction(actions, "set_palette_idx")).toEqual({ type: "set_palette_idx", idx: 2 });
    });

    it("↓ moves palette selection down", () => {
      const { actions } = handleKey(
        emptyKey({ downArrow: true }),
        baseState({ paletteActive: true, slashActive: true, paletteIdx: 1, filteredSlashCount: 5 }),
      );
      expect(findAction(actions, "set_palette_idx")).toEqual({ type: "set_palette_idx", idx: 2 });
    });

    it("PgUp scrolls timeline even with palette open", () => {
      const { actions } = handleKey(
        emptyKey({ pageUp: true }),
        baseState({
          paletteActive: true, slashActive: true,
          timelineLength: 30, visibleCount: 10, scrollOffset: 0,
        }),
      );
      expect(findAction(actions, "set_scroll")).toEqual({ type: "set_scroll", offset: 5 });
    });
  });

  /* ── Layer 5: Composer (input) ────────────────────────────── */

  describe("Up/Down arrow history recall (composer)", () => {
    it("↑ recalls most recent history entry", () => {
      const { actions } = handleKey(
        emptyKey({ upArrow: true }),
        baseState({ inputHistory: ["second", "first"], historyIdx: -1 }),
      );
      expect(findAction(actions, "set_history_idx")).toEqual({ type: "set_history_idx", idx: 0 });
      expect(findAction(actions, "set_input")).toEqual({ type: "set_input", value: "second" });
    });

    it("↑ goes deeper into history", () => {
      const { actions } = handleKey(
        emptyKey({ upArrow: true }),
        baseState({ inputHistory: ["c", "b", "a"], historyIdx: 0 }),
      );
      expect(findAction(actions, "set_history_idx")).toEqual({ type: "set_history_idx", idx: 1 });
      expect(findAction(actions, "set_input")).toEqual({ type: "set_input", value: "b" });
    });

    it("↓ navigates forward in history", () => {
      const { actions } = handleKey(
        emptyKey({ downArrow: true }),
        baseState({ inputHistory: ["c", "b", "a"], historyIdx: 2 }),
      );
      expect(findAction(actions, "set_history_idx")).toEqual({ type: "set_history_idx", idx: 1 });
    });

    it("↓ at idx=0 clears to empty", () => {
      const { actions } = handleKey(
        emptyKey({ downArrow: true }),
        baseState({ inputHistory: ["hello"], historyIdx: 0 }),
      );
      expect(findAction(actions, "set_history_idx")).toEqual({ type: "set_history_idx", idx: -1 });
      expect(findAction(actions, "set_input")).toEqual({ type: "set_input", value: "" });
    });
  });

  describe("Submit", () => {
    it("Enter submits trimmed text", () => {
      const { actions } = handleKey(
        emptyKey({ return: true }),
        baseState({ inputValue: "  hello  " }),
      );
      expect(findAction(actions, "submit")).toEqual({ type: "submit", text: "hello" });
    });

    it("Enter on empty input is noop", () => {
      const { actions } = handleKey(
        emptyKey({ return: true }),
        baseState({ inputValue: "" }),
      );
      expect(findAction(actions, "submit")).toBeUndefined();
    });
  });

  describe("Character input and backspace", () => {
    it("appends character", () => {
      const { actions } = handleKey(
        emptyKey({ input: "a" }),
        baseState({ inputValue: "hell" }),
      );
      expect(findAction(actions, "set_input")).toEqual({ type: "set_input", value: "hella" });
    });

    it("backspace removes last char", () => {
      const { actions } = handleKey(
        emptyKey({ backspace: true }),
        baseState({ inputValue: "abc" }),
      );
      expect(findAction(actions, "set_input")).toEqual({ type: "set_input", value: "ab" });
    });
  });

  /* ── E2E flow: PgUp to scroll → Escape to browse → type to return ─ */

  describe("E2E: PgUp scroll → Esc browse → type returns", () => {
    it("complete user session flow", () => {
      let st = baseState({
        inputHistory: ["msg-3", "msg-2", "msg-1"],
        historyIdx: -1,
        timelineLength: 40,
        visibleCount: 10,
      });

      // 1. PgUp → scroll timeline (NOT history recall)
      let r = handleKey(emptyKey({ pageUp: true }), st);
      expect(findAction(r.actions, "set_scroll")).toEqual({ type: "set_scroll", offset: 5 });
      st = { ...st, scrollOffset: 5 };

      // 2. ↑ in input mode → recall "msg-3" (history)
      r = handleKey(emptyKey({ upArrow: true }), st);
      expect(findAction(r.actions, "set_input")).toEqual({ type: "set_input", value: "msg-3" });
      st = { ...st, historyIdx: 0, inputValue: "msg-3" };

      // 3. Escape → clear input
      r = handleKey(emptyKey({ escape: true }), st);
      expect(findAction(r.actions, "set_input")).toEqual({ type: "set_input", value: "" });
      st = { ...st, inputValue: "" };

      // 4. Escape again (empty input) → enter scroll mode
      r = handleKey(emptyKey({ escape: true }), st);
      expect(findAction(r.actions, "focus")).toEqual({ type: "focus", area: "scroll" });
      st = { ...st, focusArea: "scroll" };

      // 5. k → scroll up 1 line
      r = handleKey(emptyKey({ input: "k" }), st);
      expect(findAction(r.actions, "set_scroll")).toEqual({ type: "set_scroll", offset: 6 });
      st = { ...st, scrollOffset: 6 };

      // 6. g → jump to top
      r = handleKey(emptyKey({ input: "g" }), st);
      expect(findAction(r.actions, "set_scroll")).toEqual({ type: "set_scroll", offset: 30 });
      st = { ...st, scrollOffset: 30 };

      // 7. Type 'h' → auto-return to input
      r = handleKey(emptyKey({ input: "h" }), st);
      expect(findAction(r.actions, "focus")).toEqual({ type: "focus", area: "input" });
      expect(findAction(r.actions, "set_input")).toEqual({ type: "set_input", value: "h" });
    });
  });
});
