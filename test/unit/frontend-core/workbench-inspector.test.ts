import { describe, expect, it } from "vitest";
import {
  runtimeDaemonHealth,
  type RunEvent,
  type RuntimeMcpListResult,
} from "../../../packages/runtime-contracts/src/index.js";
import {
  createEmptyRunDashboard,
  createMcpDirectoryView,
  createWorkbenchInspectorView,
  projectRunDashboard,
  type RuntimeTransportStatus,
} from "../../../packages/frontend-core/src/index.js";

const event = (
  kind: RunEvent["kind"],
  payload: Record<string, unknown> = {},
  seq = 1,
): RunEvent => ({
  id: `evt-${seq}`,
  runId: "run-1",
  timestamp: `2026-06-09T01:00:${String(seq).padStart(2, "0")}.000Z`,
  kind,
  payload,
  checkpointSeq: seq,
});

const status = (
  health: ReturnType<typeof runtimeDaemonHealth>,
): RuntimeTransportStatus => ({
  mode: "mock",
  state: health.ok ? "healthy" : "unavailable",
  label: "Test runtime",
  detail: "Unit test status",
  health,
});

describe("frontend-core workbench inspector view", () => {
  it("projects research and artifact tabs with focusable rows", () => {
    const projection = projectRunDashboard(createEmptyRunDashboard(), [
      event(
        "research.started",
        {
          researchRunId: "research-a",
          question: "How should the workbench show inspector views?",
        },
        1,
      ),
      event(
        "research.citation.added",
        {
          researchRunId: "research-a",
          citationId: "citation-a",
          title: "Workbench IA note",
          uri: "https://example.test/workbench",
        },
        2,
      ),
      event(
        "artifact.created",
        {
          artifactId: "artifact-a",
          title: "Inspector model",
          kind: "markdown",
          summary: "Projection notes",
        },
        3,
      ),
    ]);

    const research = createWorkbenchInspectorView({
      projection,
      mcpDirectory: createMcpDirectoryView(undefined),
      activeView: "research",
    });
    const artifacts = createWorkbenchInspectorView({
      projection,
      mcpDirectory: createMcpDirectoryView(undefined),
      activeView: "artifacts",
    });

    expect(research.tabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "research", count: 1, tone: "active" }),
        expect.objectContaining({ id: "artifacts", count: 1, tone: "active" }),
      ]),
    );
    expect(research.panel.rows[0]).toMatchObject({
      id: "research:research-a",
      focusId: "research:research-a",
      title: "How should the workbench show inspector views?",
      detail: "Workbench IA note",
      href: "https://example.test/workbench",
    });
    expect(artifacts.panel.rows[0]).toMatchObject({
      id: "artifact:artifact-a",
      focusId: "artifact:artifact-a",
      title: "Inspector model",
      detail: "Projection notes",
    });
  });

  it("surfaces MCP inventory rows and discovery errors", () => {
    const directoryResult: RuntimeMcpListResult = {
      generatedAt: "2026-06-09T01:00:00.000Z",
      servers: [
        {
          name: "docs",
          health: "healthy",
          toolCount: 1,
          tools: [
            {
              name: "search",
              title: "Search docs",
              inputSchema: {
                type: "object",
                properties: {
                  query: { type: "string" },
                },
                required: ["query"],
              },
            },
          ],
        },
        {
          name: "memory",
          health: "degraded",
          toolCount: 0,
          error: "Embedding provider unavailable",
        },
      ],
    };

    const view = createWorkbenchInspectorView({
      projection: createEmptyRunDashboard(),
      mcpDirectory: createMcpDirectoryView(directoryResult),
      mcpState: { status: "error", message: "MCP gateway offline" },
      activeView: "mcp",
      selectedMcpToolId: "docs:search",
    });

    expect(view.panel.statusTone).toBe("danger");
    expect(view.panel.errorMessage).toBe("MCP gateway offline");
    expect(view.panel.mcpServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "docs",
          tone: "success",
          selected: true,
          tools: [
            expect.objectContaining({
              id: "docs:search",
              selected: true,
              detail: "1 fields / 1 required",
            }),
          ],
        }),
        expect.objectContaining({
          name: "memory",
          tone: "warning",
          error: "Embedding provider unavailable",
        }),
      ]),
    );
  });

  it("reports memory disabled and unloaded empty states", () => {
    const disabled = createWorkbenchInspectorView({
      projection: createEmptyRunDashboard(),
      runtimeStatus: status(runtimeDaemonHealth({
        gateway: true,
        kernel: true,
        socket: true,
        capabilities: {
          memory: {
            state: "disabled",
            summary: "Memory is off for this profile",
          },
        },
      })),
      mcpDirectory: createMcpDirectoryView(undefined),
      activeView: "memory",
    });
    const unloaded = createWorkbenchInspectorView({
      projection: createEmptyRunDashboard(),
      mcpDirectory: createMcpDirectoryView(undefined),
      activeView: "memory",
    });

    expect(disabled.panel.statusLabel).toBe("disabled");
    expect(disabled.panel.errorMessage).toBe(
      "Memory capability is disabled by the current runtime profile.",
    );
    expect(disabled.tabs.find((tab) => tab.id === "memory")).toMatchObject({
      count: 0,
      tone: "warning",
    });
    expect(unloaded.panel.emptyMessage).toBe(
      "Runtime manifest has not loaded memory capability metadata.",
    );
  });
});
