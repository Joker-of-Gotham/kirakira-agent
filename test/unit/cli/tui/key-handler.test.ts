import { describe, expect, it } from "vitest";
import { handleKey } from "../../../../packages/cli/src/tui/key-handler.js";
import type { Action, KeyEvent, KeyState } from "../../../../packages/cli/src/tui/key-handler.js";

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
    leftArrow: false,
    rightArrow: false,
    home: false,
    end: false,
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
    cursorIndex: 0,
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

function findAction<T extends Action["type"]>(
  actions: Action[],
  type: T,
): Extract<Action, { type: T }> | undefined {
  return actions.find((action): action is Extract<Action, { type: T }> => action.type === type);
}

describe("key-handler", () => {
  it("toggles expanded tool results with Ctrl+R", () => {
    const { actions } = handleKey(emptyKey({ ctrl: true, input: "r" }), baseState());
    expect(findAction(actions, "toggle_tool_details")).toEqual({ type: "toggle_tool_details" });
  });

  it("clears stale leader state without running hidden chords", () => {
    const { actions } = handleKey(emptyKey({ input: "h" }), baseState({ leaderPending: true }));
    expect(findAction(actions, "set_leader_pending")).toEqual({
      type: "set_leader_pending",
      pending: false,
    });
    expect(findAction(actions, "execute_slash")).toBeUndefined();
  });

  it("scrolls transcript with PgUp/PgDn", () => {
    const up = handleKey(
      emptyKey({ pageUp: true }),
      baseState({ scrollOffset: 0, timelineLength: 30, visibleCount: 10 }),
    );
    expect(findAction(up.actions, "set_scroll")).toEqual({ type: "set_scroll", offset: 5 });

    const down = handleKey(
      emptyKey({ pageDown: true }),
      baseState({ scrollOffset: 10, visibleCount: 10 }),
    );
    expect(findAction(down.actions, "set_scroll")).toEqual({ type: "set_scroll", offset: 5 });
  });

  it("clears input with Escape and noops on empty input", () => {
    const clear = handleKey(
      emptyKey({ escape: true }),
      baseState({ inputValue: "hello", cursorIndex: 3 }),
    );
    expect(findAction(clear.actions, "set_input")).toEqual({
      type: "set_input",
      value: "",
      cursorIndex: 0,
    });

    const empty = handleKey(emptyKey({ escape: true }), baseState());
    expect(findAction(empty.actions, "noop")).toEqual({ type: "noop" });
  });

  it("moves palette selection with arrow keys", () => {
    const up = handleKey(
      emptyKey({ upArrow: true }),
      baseState({ paletteActive: true, slashActive: true, paletteIdx: 3 }),
    );
    expect(findAction(up.actions, "set_palette_idx")).toEqual({ type: "set_palette_idx", idx: 2 });

    const down = handleKey(
      emptyKey({ downArrow: true }),
      baseState({ paletteActive: true, slashActive: true, paletteIdx: 1, filteredSlashCount: 5 }),
    );
    expect(findAction(down.actions, "set_palette_idx")).toEqual({ type: "set_palette_idx", idx: 2 });
  });

  it("recalls history and places cursor at end", () => {
    const { actions } = handleKey(
      emptyKey({ upArrow: true }),
      baseState({ inputHistory: ["second", "first"], historyIdx: -1 }),
    );
    expect(findAction(actions, "set_history_idx")).toEqual({ type: "set_history_idx", idx: 0 });
    expect(findAction(actions, "set_input")).toEqual({
      type: "set_input",
      value: "second",
      cursorIndex: 6,
    });
  });

  it("moves cursor left, right, home, and end", () => {
    const left = handleKey(
      emptyKey({ leftArrow: true }),
      baseState({ inputValue: "abcd", cursorIndex: 2 }),
    );
    expect(findAction(left.actions, "set_cursor")).toEqual({ type: "set_cursor", cursorIndex: 1 });

    const right = handleKey(
      emptyKey({ rightArrow: true }),
      baseState({ inputValue: "abcd", cursorIndex: 2 }),
    );
    expect(findAction(right.actions, "set_cursor")).toEqual({ type: "set_cursor", cursorIndex: 3 });

    const home = handleKey(
      emptyKey({ home: true }),
      baseState({ inputValue: "abcd", cursorIndex: 2 }),
    );
    expect(findAction(home.actions, "set_cursor")).toEqual({ type: "set_cursor", cursorIndex: 0 });

    const end = handleKey(
      emptyKey({ end: true }),
      baseState({ inputValue: "abcd", cursorIndex: 2 }),
    );
    expect(findAction(end.actions, "set_cursor")).toEqual({ type: "set_cursor", cursorIndex: 4 });
  });

  it("inserts printable input at cursor", () => {
    const { actions } = handleKey(
      emptyKey({ input: "X" }),
      baseState({ inputValue: "abcd", cursorIndex: 2 }),
    );
    expect(findAction(actions, "set_input")).toEqual({
      type: "set_input",
      value: "abXcd",
      cursorIndex: 3,
    });
  });

  it("backspace deletes before cursor and delete removes at cursor", () => {
    const backspace = handleKey(
      emptyKey({ backspace: true }),
      baseState({ inputValue: "abcd", cursorIndex: 2 }),
    );
    expect(findAction(backspace.actions, "set_input")).toEqual({
      type: "set_input",
      value: "acd",
      cursorIndex: 1,
    });

    const del = handleKey(
      emptyKey({ delete: true }),
      baseState({ inputValue: "abcd", cursorIndex: 2 }),
    );
    expect(findAction(del.actions, "set_input")).toEqual({
      type: "set_input",
      value: "abd",
      cursorIndex: 2,
    });
  });

  it("submits trimmed text", () => {
    const { actions } = handleKey(
      emptyKey({ return: true }),
      baseState({ inputValue: "  hello  ", cursorIndex: 9 }),
    );
    expect(findAction(actions, "submit")).toEqual({ type: "submit", text: "hello" });
  });
});
