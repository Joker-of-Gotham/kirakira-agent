import { describe, expect, it } from "vitest";

import { PiiClassifier } from "../../../packages/memory-service/src/governance/pii-classifier.js";
import { RedactionEngine } from "../../../packages/memory-service/src/governance/redaction-engine.js";

describe("PII governance", () => {
  it("classifies transcripts containing government identifiers", () => {
    const classifier = new PiiClassifier();
    expect(classifier.classify("Reach me at jane@example.com")).toBe("low");
    expect(classifier.classify("SSN 123-45-6789 for verification")).toBe("high");
  });

  it("redacts emails, phones, and SSN tokens from free text", () => {
    const engine = new RedactionEngine();
    const raw =
      "Contact finance at finance@acme.test or +1 (415) 555-2671. Tax id 123-45-6789.";
    const redacted = engine.redactPlainText(raw);
    expect(redacted).not.toContain("finance@acme.test");
    expect(redacted).not.toContain("415");
    expect(redacted).not.toContain("123-45-6789");
    expect(redacted).toContain("[REDACTED]");
  });
});
