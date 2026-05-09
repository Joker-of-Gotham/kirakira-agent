import { describe, expect, it } from "vitest";
import { z } from "zod";

import { contextLevelSchema } from "@kirakira/memory-core";

const contextBundleSchema = z.object({
  queryId: z.string().min(1),
  totalEstimatedTokens: z.number().nonnegative(),
  levels: z.object({
    l0: z.object({
      level: z.literal("L0"),
      abstract: z.string(),
      entityCount: z.number().int().nonnegative(),
      timeWindow: z
        .object({
          from: z.string().optional(),
          to: z.string().optional(),
        })
        .optional(),
      estimatedTokens: z.number().nonnegative(),
    }),
    l1: z
      .object({
        level: z.literal("L1"),
        factSummaries: z.array(z.string()),
        stateSummary: z.string().optional(),
        observationSummaries: z.array(z.string()),
        estimatedTokens: z.number().nonnegative(),
      })
      .optional(),
    l2: z
      .object({
        level: z.literal("L2"),
        cards: z.array(
          z.object({
            id: z.string(),
            kind: z.string(),
            summary: z.string(),
            provenance: z.string(),
            routeReason: z.string(),
            score: z.number(),
          }),
        ),
        estimatedTokens: z.number().nonnegative(),
      })
      .optional(),
    l3: z
      .object({
        level: z.literal("L3"),
        evidence: z.array(
          z.object({
            id: z.string(),
            sourceRecordId: z.string(),
            rawSpan: z.string().optional(),
            artifactPointer: z.string().optional(),
            graphPath: z.array(z.string()).optional(),
            checkpointState: z.record(z.unknown()).optional(),
          }),
        ),
        estimatedTokens: z.number().nonnegative(),
      })
      .optional(),
  }),
});

describe("context filesystem schema", () => {
  it("accepts fully populated ContextBundle levels", () => {
    contextLevelSchema.parse("L3");

    const bundle = contextBundleSchema.parse({
      queryId: "ctx-1",
      totalEstimatedTokens: 128,
      levels: {
        l0: {
          level: "L0",
          abstract: "summary",
          entityCount: 2,
          estimatedTokens: 8,
        },
        l1: {
          level: "L1",
          factSummaries: ["a"],
          observationSummaries: [],
          estimatedTokens: 10,
        },
        l2: {
          level: "L2",
          cards: [
            {
              id: "r1",
              kind: "fact",
              summary: "s",
              provenance: "e1",
              routeReason: "similarity",
              score: 0.9,
            },
          ],
          estimatedTokens: 20,
        },
        l3: {
          level: "L3",
          evidence: [{ id: "r1", sourceRecordId: "r1", rawSpan: "body" }],
          estimatedTokens: 40,
        },
      },
    });

    expect(bundle.levels.l3?.evidence[0]?.rawSpan).toBe("body");
  });
});
