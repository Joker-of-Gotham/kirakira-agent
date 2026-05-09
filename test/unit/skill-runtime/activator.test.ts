import { describe, expect, it } from "vitest";
import {
  shouldActivateSkill,
  extractDollarSkillTriggers,
  resolveDollarSkills,
} from "../../../packages/skill-runtime/src/activator.js";

describe("shouldActivateSkill", () => {
  it("activates on substring match", () => {
    expect(shouldActivateSkill("debug this error", ["debug"])).toBe(true);
  });

  it("activates on glob pattern", () => {
    expect(shouldActivateSkill("fix the bug", ["fix*"])).toBe(true);
  });

  it("does not activate without patterns", () => {
    expect(shouldActivateSkill("anything", undefined)).toBe(false);
    expect(shouldActivateSkill("anything", [])).toBe(false);
  });

  it("does not activate on non-matching patterns", () => {
    expect(shouldActivateSkill("deploy the app", ["debug", "test"])).toBe(false);
  });
});

describe("extractDollarSkillTriggers", () => {
  it("extracts $skill references from input", () => {
    const triggers = extractDollarSkillTriggers("Use $mySkill to help");
    expect(triggers).toEqual(["mySkill"]);
  });

  it("extracts multiple $skill references", () => {
    const triggers = extractDollarSkillTriggers("$debug and $test-runner");
    expect(triggers).toEqual(["debug", "test-runner"]);
  });

  it("handles underscores and dots", () => {
    const triggers = extractDollarSkillTriggers("Run $my_skill.v2 now");
    expect(triggers).toEqual(["my_skill.v2"]);
  });

  it("returns empty array when no triggers", () => {
    const triggers = extractDollarSkillTriggers("Just a normal message");
    expect(triggers).toEqual([]);
  });

  it("ignores $ not followed by alphanumeric", () => {
    const triggers = extractDollarSkillTriggers("Cost is $100");
    expect(triggers).toEqual([]);
  });
});

describe("resolveDollarSkills", () => {
  const catalog = [
    { name: "debug" },
    { name: "test-runner" },
    { name: "code_review" },
  ];

  it("resolves exact matches", () => {
    const result = resolveDollarSkills("Use $debug please", catalog);
    expect(result).toEqual(["debug"]);
  });

  it("resolves with dash/underscore normalization", () => {
    const result = resolveDollarSkills("Run $testRunner", catalog);
    expect(result).toEqual(["test-runner"]);
  });

  it("resolves multiple matches", () => {
    const result = resolveDollarSkills("$debug then $codeReview", catalog);
    expect(result).toEqual(["debug", "code_review"]);
  });

  it("returns empty for no matches", () => {
    const result = resolveDollarSkills("$nonexistent", catalog);
    expect(result).toEqual([]);
  });
});
