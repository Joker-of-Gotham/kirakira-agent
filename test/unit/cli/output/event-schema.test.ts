import { describe, expect, it } from "vitest";
import { outputEventSchema } from "@kirakira/core";

describe("outputEventSchema", () => {
  it("accepts well-formed event payloads", () => {
    const raw = {
      ts: "2026-05-04T12:00:00.000Z",
      event: "session.start",
      sessionId: "ses_01JZNG7P5V5QZQZQZQZQZQZQZQ",
      traceId: "a".repeat(32),
    };
    const r = outputEventSchema.safeParse(raw);
    expect(r.success).toBe(true);
  });

  it("rejects bad event enum", () => {
    const r = outputEventSchema.safeParse({
      ts: "2026-05-04T12:00:00.000Z",
      event: "nope",
      sessionId: "ses_x",
      traceId: "a".repeat(32),
    });
    expect(r.success).toBe(false);
  });
});
