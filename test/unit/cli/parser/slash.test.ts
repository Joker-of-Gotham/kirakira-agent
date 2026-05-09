import { describe, expect, it } from "vitest";
import { SLASH_COMMANDS_ARRAY, parseSlashInput } from "../../../../packages/cli/src/parser/slash.js";

describe("parseSlashInput", () => {
  it("returns null for non-slash and empty", () => {
    expect(parseSlashInput("help")).toBeNull();
    expect(parseSlashInput("")).toBeNull();
    expect(parseSlashInput(" /help")).toBeNull();
  });

  it("parses recognized commands with args", () => {
    const r = parseSlashInput("/plan do the thing");
    expect(r).toEqual({ command: "plan", args: "do the thing", recognized: true });
  });

  it("covers all registered slash commands", () => {
    for (const cmd of SLASH_COMMANDS_ARRAY) {
      const r = parseSlashInput(`/${cmd} trailing`);
      expect(r).not.toBeNull();
      expect(r!.command).toBe(cmd);
      expect(r!.recognized).toBe(true);
    }
  });

  it("marks unknown commands as unrecognized", () => {
    const r = parseSlashInput("/not-a-real-command");
    expect(r!.recognized).toBe(false);
  });

  it("bare / yields empty command", () => {
    expect(parseSlashInput("/")).toEqual({ command: "", args: "", recognized: false });
  });
});
