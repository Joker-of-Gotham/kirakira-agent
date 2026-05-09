import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { CheckpointEnvelope } from "@kirakira/event-store";

const checkpointEnvelopeSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  createdAt: z.string().datetime(),
  version: z.literal("kirakira.checkpoint.v1"),
  payload: z.unknown(),
});

describe("checkpoint envelope compatibility", () => {
  it("accepts envelopes defined by @kirakira/event-store", () => {
    const envelope: CheckpointEnvelope = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      runId: "550e8400-e29b-41d4-a716-446655440001",
      createdAt: "2026-05-06T12:00:00.000Z",
      version: "kirakira.checkpoint.v1",
      payload: {
        tenantId: "t1",
        stepNo: 2,
        counters: { n: 1 },
        artifactManifest: { artifactIds: [] },
      },
    };

    expect(checkpointEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });
});
