import { describe, expect, it } from "vitest";
import {
  TuiMouseInputDecoder,
  isLikelyMouseInput,
  isPrintableTextInput,
  isTerminalControlInput,
  parseTuiMouseEvent,
} from "../../packages/cli/src/tui/mouse.js";

describe("tui mouse parsing", () => {
  it("parses SGR wheel events", () => {
    expect(parseTuiMouseEvent("\x1b[<64;12;20M")).toMatchObject({
      kind: "wheel-up",
      x: 12,
      y: 20,
    });
    expect(parseTuiMouseEvent("\x1b[<65;12;20M")).toMatchObject({
      kind: "wheel-down",
      x: 12,
      y: 20,
    });
    expect(parseTuiMouseEvent("[<64;12;20M")).toMatchObject({
      kind: "wheel-up",
      x: 12,
      y: 20,
    });
  });

  it("treats mouse and terminal controls as non-printable input", () => {
    expect(isTerminalControlInput("\x1b[<0;4;8M")).toBe(true);
    expect(isTerminalControlInput("[<0;4;8M")).toBe(true);
    expect(isPrintableTextInput("\x1b[<0;4;8M")).toBe(false);
    expect(isPrintableTextInput("[<0;4;8M")).toBe(false);
    expect(isPrintableTextInput("hello")).toBe(true);
    expect(isPrintableTextInput("123")).toBe(true);
    expect(isLikelyMouseInput("\x1b")).toBe(false);
    expect(isLikelyMouseInput("[A")).toBe(false);
  });

  it("consumes split mouse sequences before they reach the composer", () => {
    const decoder = new TuiMouseInputDecoder();

    expect(decoder.feed("[<64;12;")).toEqual({ consumed: true, event: null });
    expect(decoder.feed("20M")).toMatchObject({
      consumed: true,
      event: {
        kind: "wheel-up",
        x: 12,
        y: 20,
      },
    });
  });
});
