import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { MemoryRecord } from "@kirakira/memory-core";

import { ContextAssembler } from "../../../packages/memory-service/src/context/context-fs.js";
import { BudgetCompiler } from "../../../packages/memory-service/src/recall/budget/budget-compiler.js";

describe("context filesystem assembly", () => {
  it("progressively fills L0→L3 with coherent estimates", async () => {
    const assembler = new ContextAssembler();
    const compiler = new BudgetCompiler();
    const now = new Date().toISOString();

    const records: MemoryRecord[] = [
      {
        id: randomUUID(),
        tenantId: "ctx",
        workspaceId: "ws",
        namespace: "project",
        kind: "fact",
        text: "ACME prefers Net-45 payment terms for strategic vendors.",
        summaryL0: "Net-45 for strategic vendors",
        metadata: { artifactUri: "s3://b/a.json" },
        evidenceIds: [randomUUID()],
        entityIds: [randomUUID()],
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: "2026-12-31T00:00:00.000Z",
        txFrom: now,
        retentionClass: "default",
        piiLevel: "none",
        redacted: false,
        createdAt: now,
      },
      {
        id: randomUUID(),
        tenantId: "ctx",
        workspaceId: "ws",
        namespace: "agent",
        kind: "checkpoint",
        text: '{"lane":"plan"}',
        summaryL0: "checkpoint snapshot",
        metadata: { phase: "plan" },
        evidenceIds: [],
        entityIds: [],
        txFrom: now,
        retentionClass: "default",
        piiLevel: "none",
        redacted: false,
        createdAt: now,
      },
    ];

    const explanations = records.map((r, i) => ({
      recordId: r.id,
      routeReason: i === 0 ? "similarity" : "state",
      score: 1 / (i + 1),
    }));

    const compiled = await compiler.compile(records, "q-test", explanations, 6000, "L3");

    const bundle = await assembler.assemble(records, "payment terms for ACME", explanations, 6000, "L3");

    expect(bundle.levels.l0.level).toBe("L0");
    expect(bundle.levels.l0.abstract).toContain("payment terms");
    expect(bundle.levels.l1?.factSummaries.length).toBeGreaterThan(0);
    expect(bundle.levels.l2?.cards.length).toBeGreaterThan(0);
    expect(bundle.levels.l3?.evidence.length).toBeGreaterThan(0);

    expect(bundle.queryId.length).toBeGreaterThan(0);
    expect(compiled.context.queryId).toBe("q-test");
    expect(bundle.totalEstimatedTokens).toBeGreaterThan(0);
  });
});
