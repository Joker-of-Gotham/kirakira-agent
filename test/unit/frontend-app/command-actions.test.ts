import { describe, expect, it } from "vitest";

import type { RuntimeMcpDirectoryTool } from "@kirakira/frontend-core";
import {
  createWorkbenchCommandActions,
  filterWorkbenchCommandActions,
} from "../../../packages/frontend-app/src/command-actions.js";

const selectedTool: RuntimeMcpDirectoryTool = {
  id: "filesystem.read",
  server: "filesystem",
  name: "read",
  title: "Read File",
  inputPropertyCount: 1,
  requiredInputCount: 1,
  inputFields: [],
  argumentDraft: "{}",
};

describe("workbench command actions", () => {
  it("projects run, view, attention, approval, artifact, and MCP actions from context", () => {
    const actions = createWorkbenchCommandActions({
      runId: "run-1",
      activeView: "runs",
      views: [
        { id: "runs", label: "Runs", status: "active", selected: true },
        { id: "systems", label: "Systems", status: "2 tools" },
      ],
      attention: [
        {
          id: "attention:approval:gate-1",
          itemId: "approval:gate-1",
          focusId: "approval:gate-1",
          severity: "critical",
          title: "Approval required",
          detail: "gate-1",
          actionLabel: "Open gate",
        },
      ],
      pendingApprovalId: "gate-1",
      activeArtifactId: "artifact-1",
      activeArtifactTitle: "Trace summary",
      selectedMcpTool: selectedTool,
      drafts: {
        steerInstruction: "Keep changes scoped",
        enqueuePrompt: "Continue UI polish",
        interruptId: "interrupt-1",
      },
    });

    expect(actions.map((action) => action.kind)).toEqual(
      expect.arrayContaining([
        "steer_run",
        "open_view",
        "open_attention",
        "approve_gate",
        "open_artifact",
        "call_mcp_tool",
      ]),
    );
    expect(actions.find((action) => action.kind === "provide_input")).toMatchObject({
      disabled: false,
      detail: "Interrupt interrupt-1",
    });
    expect(actions.find((action) => action.id === "view.systems")).toMatchObject({
      label: "Open Systems",
      viewId: "systems",
    });
  });

  it("keeps runtime mutations disabled until the required target state exists", () => {
    const actions = createWorkbenchCommandActions({
      activeView: "runs",
      views: [{ id: "runs", label: "Runs", status: "idle" }],
      attention: [],
      drafts: {
        interruptId: "",
      },
    });

    expect(actions.find((action) => action.kind === "steer_run")).toMatchObject({
      disabled: true,
      disabledReason: "Run ID required",
    });
    expect(actions.find((action) => action.kind === "provide_input")).toMatchObject({
      disabled: true,
      disabledReason: "Run ID required",
    });
    expect(actions.find((action) => action.id === "view.runs")?.disabled).toBeUndefined();
  });

  it("filters by labels, groups, identifiers, and keywords", () => {
    const actions = createWorkbenchCommandActions({
      runId: "run-1",
      activeView: "runs",
      views: [{ id: "research", label: "Research", status: "ready" }],
      attention: [],
      activeArtifactId: "artifact-visual-qa",
      activeArtifactTitle: "Visual QA Report",
    });

    expect(filterWorkbenchCommandActions(actions, "visual qa").map((action) => action.kind)).toEqual([
      "open_artifact",
    ]);
    expect(filterWorkbenchCommandActions(actions, "research").map((action) => action.id)).toContain(
      "view.research",
    );
    expect(filterWorkbenchCommandActions(actions, "run inspect").map((action) => action.kind)).toEqual([
      "inspect_run",
    ]);
  });
});
