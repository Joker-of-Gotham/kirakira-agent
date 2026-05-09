import { describe, expect, it } from "vitest";

import { PiiClassifier } from "../../../../packages/memory-service/src/governance/pii-classifier.js";

describe("PiiClassifier.classify", () => {
  const classifier = new PiiClassifier();

  it('labels clean business copy as "none"', () => {
    expect(classifier.classify("Ship the analytics dashboard after QA signs off.")).toBe("none");
  });

  it("treats email addresses as low severity", () => {
    expect(classifier.classify("Please email sarah.doe@example.com for access.")).toBe("low");
  });

  it("treats SSN patterns as high severity", () => {
    expect(classifier.classify("Record 123-45-6789 should never appear in logs.")).toBe("high");
  });

  it("flags phone-like numbers as low severity", () => {
    expect(classifier.classify("Callback at 415-555-2671 if production breaks.")).toBe("low");
  });

  it("promotes the level when multiple PII signals overlap", () => {
    expect(
      classifier.classify(
        "Billing contact jane@example.com for Dr. Jane Smith and include SSN 123-45-6789 by mistake",
      ),
    ).toBe("high");
  });

  it("returns none for empty input", () => {
    expect(classifier.classify("   ")).toBe("none");
  });
});
