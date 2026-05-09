import { describe, expect, it } from "vitest";
import { parseShellInput } from "../../../../packages/cli/src/parser/shell.js";

describe("parseShellInput", () => {
  it("returns null when not shell input", () => {
    expect(parseShellInput("hello")).toBeNull();
    expect(parseShellInput("")).toBeNull();
  });

  it("parses toggle and repeat", () => {
    expect(parseShellInput("!")!.variant).toEqual({ variant: "toggle" });
    expect(parseShellInput("!!")!.variant).toEqual({ variant: "repeat_last" });
  });

  it("parses host execution", () => {
    const p = parseShellInput("! --host reboot");
    expect(p!.variant).toEqual({
      variant: "host",
      command: "reboot",
      needsApproval: true,
    });
  });

  it("parses one-shot command", () => {
    const p = parseShellInput("!pytest -q");
    expect(p!.variant).toMatchObject({
      variant: "oneshot",
      command: "pytest -q",
      needsApproval: false,
    });
  });
});
