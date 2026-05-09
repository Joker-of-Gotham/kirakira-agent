import { describe, expect, it } from "vitest";
import {
  classifySecurityTier,
  evaluateSkillTrust,
  type SkillFrontmatterParsed,
} from "../../../packages/skill-runtime/src/trust.js";

const baseFrontmatter: SkillFrontmatterParsed = {
  name: "test-skill",
  description: "A test skill",
};

describe("classifySecurityTier", () => {
  it("returns instruction-only for pure prompt skills", () => {
    const tier = classifySecurityTier(baseFrontmatter, {
      hasScriptsDir: false,
      bodySample: "Use this skill to help users with questions",
    });
    expect(tier).toBe("instruction-only");
  });

  it("returns scripts for skills with scripts/ directory", () => {
    const tier = classifySecurityTier(baseFrontmatter, {
      hasScriptsDir: true,
      bodySample: "",
    });
    expect(tier).toBe("scripts");
  });

  it("returns scripts for skills with allowed-tools", () => {
    const tier = classifySecurityTier(
      { ...baseFrontmatter, "allowed-tools": ["Shell", "Read"] },
      { hasScriptsDir: false, bodySample: "" },
    );
    expect(tier).toBe("scripts");
  });

  it("returns external-deps when body has network references", () => {
    const tier = classifySecurityTier(baseFrontmatter, {
      hasScriptsDir: false,
      bodySample: "Use fetch to download the data from the API",
    });
    expect(tier).toBe("external-deps");
  });

  it("returns external-deps when body has write operations", () => {
    const tier = classifySecurityTier(baseFrontmatter, {
      hasScriptsDir: false,
      bodySample: "mkdir -p /tmp/output && writeFile output.json",
    });
    expect(tier).toBe("external-deps");
  });

  it("returns external-deps when body has pip/npm install", () => {
    const tier = classifySecurityTier(baseFrontmatter, {
      hasScriptsDir: false,
      bodySample: "Run pip install requests to get the dependency",
    });
    expect(tier).toBe("external-deps");
  });

  it("returns external-deps when requires_approval_for is set", () => {
    const tier = classifySecurityTier(
      { ...baseFrontmatter, requires_approval_for: ["network_access"] },
      { hasScriptsDir: false, bodySample: "" },
    );
    expect(tier).toBe("external-deps");
  });
});

describe("evaluateSkillTrust", () => {
  it("assigns enterprise-allow for /etc/kirakira/ paths", () => {
    const result = evaluateSkillTrust("/etc/kirakira/skills/builtin/SKILL.md", baseFrontmatter, {
      hasScriptsDir: false,
      bodySample: "",
    });
    expect(result.level).toBe("enterprise-allow");
    expect(result.securityTier).toBe("instruction-only");
    expect(result.needsTrustPrompt).toBe(false);
  });

  it("requires prompt for script skills", () => {
    const result = evaluateSkillTrust("/home/user/.kirakira/skills/tool/SKILL.md", baseFrontmatter, {
      hasScriptsDir: true,
      bodySample: "",
    });
    expect(result.level).toBe("ask");
    expect(result.securityTier).toBe("scripts");
    expect(result.needsTrustPrompt).toBe(true);
  });

  it("requires prompt for external-deps skills", () => {
    const result = evaluateSkillTrust("/tmp/external/SKILL.md", baseFrontmatter, {
      hasScriptsDir: false,
      bodySample: "curl https://api.example.com/data",
    });
    expect(result.level).toBe("ask");
    expect(result.securityTier).toBe("external-deps");
    expect(result.needsTrustPrompt).toBe(true);
  });

  it("provides reasons for all detected issues", () => {
    const result = evaluateSkillTrust("/tmp/test/SKILL.md", baseFrontmatter, {
      hasScriptsDir: false,
      bodySample: "fetch data and writeFile output ${API_KEY}",
    });
    expect(result.reasons.length).toBeGreaterThan(1);
    expect(result.reasons.some((r) => r.includes("network"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("environment variable"))).toBe(true);
  });
});
