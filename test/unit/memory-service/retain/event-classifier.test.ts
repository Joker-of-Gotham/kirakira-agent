import { describe, expect, it } from "vitest";

import { MemoryEventClassifier } from "../../../../packages/memory-service/src/retain/event-classifier.js";

describe("MemoryEventClassifier.classify", () => {
  const classifier = new MemoryEventClassifier();

  it("defaults chat text to sourceType chat", () => {
    const out = classifier.classify("Just a casual message about nothing in particular.");
    expect(out.sourceType).toBe("chat");
  });

  it("detects tool source when text mentions tool output", () => {
    const out = classifier.classify("Here is the tool result from the last command.");
    expect(out.sourceType).toBe("tool");
  });

  it("detects web source when text contains a URL", () => {
    const out = classifier.classify("Read more at https://example.com/docs");
    expect(out.sourceType).toBe("web");
  });

  it("allows metadata.sourceType to override heuristics", () => {
    const out = classifier.classify("https://example.com ignored", { sourceType: "sandbox" });
    expect(out.sourceType).toBe("sandbox");
  });

  it("extracts capitalized names, quoted phrases, and @handles", () => {
    const out = classifier.classify(
      'Paris Morris said "quarterly OKRs" matter; ping @finance.bot for details.',
    );
    expect(out.entityHints).toEqual(
      expect.arrayContaining(["Paris Morris", "quarterly OKRs", "@finance.bot"]),
    );
    expect(out.hasEntities).toBe(true);
  });

  it("detects declarative facts when signals present and text is long enough", () => {
    const longEnough =
      "For the record, the deployment status is production and the API version is stable for customers now.";
    const out = classifier.classify(longEnough);
    expect(out.hasFacts).toBe(true);
  });

  it("detects preference phrasing", () => {
    const out = classifier.classify("I prefer dark mode in the dashboard at all times.");
    expect(out.hasPreferences).toBe(true);
  });

  it("adds belief to suggested kinds when causal language appears", () => {
    const out = classifier.classify(
      "Because uptime improved, therefore we conclude the new architecture is working for the team this week.",
    );
    expect(out.suggestedMemoryKinds).toContain("belief");
  });

  it("raises estimatedImportance with length, entities, facts, preferences, and urgency words", () => {
    const plainShort = classifier.classify("hello there");
    const richLong = classifier.classify(
      "Important: We should always use Acme Corp standards when the API is production; " +
        "I prefer detailed logs because failures are costly. " +
        "The contract requires 99.9% availability documented 2026-01-01. ".repeat(3),
    );
    expect(richLong.estimatedImportance).toBeGreaterThan(plainShort.estimatedImportance);
    expect(richLong.entityHints.length).toBeGreaterThan(0);
    expect(richLong.hasFacts).toBe(true);
    expect(richLong.hasPreferences).toBe(true);
    expect(plainShort.estimatedImportance).toBeLessThanOrEqual(1);
    expect(richLong.estimatedImportance).toBeLessThanOrEqual(1);
  });
});
