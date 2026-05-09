import { describe, expect, it } from "vitest";
import {
  generateSessionId,
  generateSpanId,
  generateTraceId,
} from "@kirakira/core";

describe("id generators", () => {
  it("generateSessionId uses ses_ prefix and non-empty body", () => {
    const id = generateSessionId();
    expect(id.startsWith("ses_")).toBe(true);
    expect(id.length).toBeGreaterThan("ses_".length + 4);
  });

  it("generateTraceId is 32 lowercase hex chars", () => {
    const id = generateTraceId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("generateSpanId is 16 lowercase hex chars", () => {
    const id = generateSpanId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });
});
