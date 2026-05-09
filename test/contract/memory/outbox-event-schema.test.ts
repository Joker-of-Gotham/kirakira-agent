import { describe, expect, it } from "vitest";
import { z } from "zod";

const outboxEventSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string(),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  eventType: z.string().min(1),
  payload: z.record(z.unknown()),
  status: z.enum(["pending", "processing", "completed", "failed", "dead_letter"]),
  attempts: z.number().int().min(0),
  availableAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

describe("outbox event contract", () => {
  it("matches the store adapter outbox row shape", () => {
    const sample = {
      id: "1",
      tenantId: "t1",
      aggregateType: "memory_episode",
      aggregateId: "550e8400-e29b-41d4-a716-446655440000",
      eventType: "memory.fact.extract",
      payload: { episodeId: "550e8400-e29b-41d4-a716-446655440000" },
      status: "pending" as const,
      attempts: 0,
      availableAt: "2026-05-06T12:00:00.000Z",
      createdAt: "2026-05-06T12:00:00.001Z",
    };

    expect(outboxEventSchema.parse(sample)).toEqual(sample);
  });
});
