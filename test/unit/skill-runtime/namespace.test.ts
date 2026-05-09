import { describe, expect, it } from "vitest";
import {
  autoPrefixExternal,
  parseSkillRef,
  withNamespace,
} from "@kirakira/skill-runtime";

describe("skill namespace helpers", () => {
  it("withNamespace prefixes vendor", () => {
    expect(withNamespace("claude", "lint")).toBe("claude:lint");
  });

  it("parseSkillRef splits known vendors", () => {
    expect(parseSkillRef("claude:lint")).toEqual({
      namespace: "claude",
      name: "lint",
    });
    expect(parseSkillRef("plain")).toEqual({ name: "plain" });
  });

  it("autoPrefixExternal adds source when unprefixed", () => {
    expect(autoPrefixExternal("lint", "cursor")).toBe("cursor:lint");
    expect(autoPrefixExternal("claude:lint", "cursor")).toBe("claude:lint");
  });
});
