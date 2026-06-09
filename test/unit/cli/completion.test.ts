import { describe, expect, it } from "vitest";
import {
  generateBashCompletion,
  generateFishCompletion,
  generatePowershellCompletion,
  generateZshCompletion,
} from "../../../packages/cli/src/commands/completion.js";

describe("completion command", () => {
  it("includes the runtime topic in generated shell completions", () => {
    expect(generateBashCompletion()).toMatch(/\bcommands="[^"]*\bruntime\b[^"]*"/u);
    expect(generateZshCompletion()).toContain("'runtime:Runtime profile and readiness'");
    expect(generateFishCompletion()).toMatch(/-a '[^']*\bruntime\b[^']*'/u);
    expect(generatePowershellCompletion()).toContain("'runtime'");
  });
});
