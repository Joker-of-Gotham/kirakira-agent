import { describe, expect, it } from "vitest";
import type { RunEvent } from "@kirakira/runtime-contracts";
import {
  createEmptyRunDashboard,
  createWorkbenchDetailViews,
  projectRunDashboard,
} from "../../../packages/frontend-core/src/index.js";

const event = (
  kind: RunEvent["kind"],
  payload: Record<string, unknown> = {},
  seq = 1,
): RunEvent => ({
  id: `evt-${seq}`,
  runId: "run-detail",
  timestamp: `2026-06-10T02:00:${String(seq).padStart(2, "0")}.000Z`,
  kind,
  payload,
  checkpointSeq: seq,
});

describe("frontend-core workbench detail view-models", () => {
  it("projects a selected subagent drawer with artifact refs and visual QA hooks", () => {
    const projection = projectRunDashboard(createEmptyRunDashboard(), [
      event(
        "artifact.created",
        {
          artifactId: "brief",
          title: "Research brief",
          path: "artifacts/brief.md",
          kind: "markdown",
        },
        1,
      ),
      event(
        "subagent.spawned",
        {
          subagentId: "agent-visual",
          role: "reviewer",
          lane: "qa",
          taskPreview: "Check workbench screenshots",
          inputArtifactRefs: ["brief"],
          capabilities: [
            { kind: "tool", name: "browser" },
            { kind: "mcp", name: "playwright" },
          ],
        },
        2,
      ),
      event(
        "artifact.created",
        {
          artifactId: "shot",
          title: "Workbench desktop screenshot",
          path: "artifacts/visual/workbench.png",
          kind: "screenshot",
          summary: "1280px layout capture",
          metadata: { visualQa: true, browser: "chromium" },
        },
        3,
      ),
      event(
        "subagent.completed",
        {
          subagentId: "agent-visual",
          status: "completed",
          preview: "Layout passes visual review",
          artifactRefs: ["shot"],
        },
        4,
      ),
    ]);

    const details = createWorkbenchDetailViews({
      projection,
      selectedSubagentId: "subagent:agent-visual",
    });

    expect(details.subagentDrawer.selected).toMatchObject({
      id: "agent-visual",
      title: "Check workbench screenshots",
      summary: "Layout passes visual review",
      phase: "completed",
    });
    expect(details.subagentDrawer.selected?.capabilities.map((item) => item.label)).toEqual([
      "tool:browser",
      "mcp:playwright",
    ]);
    expect(details.subagentDrawer.selected?.artifactRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "brief", source: "input", found: true }),
        expect.objectContaining({ id: "shot", source: "output", found: true }),
      ]),
    );
    expect(details.subagentDrawer.selected?.visualQaHooks).toEqual([
      expect.objectContaining({ id: "shot", visualQa: true }),
    ]);
  });

  it("builds a citation ledger and links artifact detail cards back to citations", () => {
    const projection = projectRunDashboard(createEmptyRunDashboard(), [
      event(
        "research.started",
        {
          researchRunId: "research-a",
          question: "Which evidence validates the workbench?",
          sourcePolicy: "verified",
        },
        1,
      ),
      event(
        "artifact.created",
        {
          artifactId: "qa-report",
          path: "artifacts/qa/report.md",
          kind: "visual-qa-report",
          summary: "Visual QA checklist",
          metadata: { playwright: true },
        },
        2,
      ),
      event(
        "research.citation.added",
        {
          researchRunId: "research-a",
          citationId: "citation-1",
          sourceKind: "web",
          title: "Runtime design note",
          uri: "https://example.test/design",
        },
        3,
      ),
      event(
        "research.citation.added",
        {
          researchRunId: "research-a",
          citationId: "citation-2",
          sourceKind: "artifact",
          title: "QA report",
          artifactPointer: "artifact://qa-report#visual",
          traceId: "trace-qa",
        },
        4,
      ),
    ]);

    const details = createWorkbenchDetailViews({
      projection,
      selectedCitationId: "citation:coupon-missing",
      selectedArtifactId: "artifact:qa-report",
    });

    expect(details.citationLedger.citations).toHaveLength(2);
    expect(details.citationLedger.citations.map((item) => item.id)).toEqual([
      "citation-1",
      "citation-2",
    ]);
    expect(details.citationLedger.selected).toMatchObject({
      id: "citation-1",
      href: "https://example.test/design",
    });
    expect(details.citationLedger.citations[1]).toMatchObject({
      id: "citation-2",
      artifactFocusId: "artifact:qa-report",
    });
    expect(details.artifactDetails.visualQa).toMatchObject({
      count: 1,
      statusLabel: "1 hooks",
    });
    expect(details.artifactDetails.selected).toMatchObject({
      id: "qa-report",
      visualQa: true,
      relatedCitations: [expect.objectContaining({ label: "QA report" })],
    });
  });
});
