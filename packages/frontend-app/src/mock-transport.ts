import type {
  RuntimeTransport,
  RuntimeTransportEvent,
  RuntimeArtifactContent,
  RuntimeArtifactContentRequest,
  RuntimeMcpListRequest,
  RuntimeMcpListResult,
  RuntimeMcpToolCallRequest,
  RuntimeMcpToolCallResult,
  SubmitPromptRequest,
  SubscribeRunOptions,
  Unsubscribe,
} from "@kirakira/frontend-core";
import {
  runtimeDaemonHealth,
  type RunEvent,
  type RunEventKind,
  type RuntimeOrchestrationManifest,
} from "@kirakira/runtime-contracts";

type Listener = (event: RuntimeTransportEvent) => void;

const now = () => new Date().toISOString();

const mockOrchestration: RuntimeOrchestrationManifest = {
  profileName: "mock-workbench",
  handoffMode: "swarm",
  defaultRole: "planner",
  lanes: {
    foreground: { capacity: 1 },
    delegated: { capacity: 4 },
    background: { capacity: 2 },
  },
  roles: [
    {
      id: "planner",
      description: "Keeps the run plan coherent and owns final synthesis",
      lane: "foreground",
      context: "inherit",
      toolScope: ["repo.read", "runtime.status"],
      permissionLabels: ["workspace-read"],
    },
    {
      id: "researcher",
      description: "Collects source-backed evidence for runtime and UI decisions",
      lane: "delegated",
      context: "filtered",
      skillScope: ["deep-research", "frontend-review"],
      mcpServers: ["docs", "filesystem-core"],
      permissionLabels: ["network-docs-only"],
    },
    {
      id: "verifier",
      description: "Checks artifacts, approvals, and runtime readiness before release",
      lane: "background",
      context: "isolated",
      toolScope: ["test.run", "runtime.doctor"],
      permissionLabels: ["workspace-write-gated"],
    },
  ],
  handoffs: [
    { from: "planner", to: "researcher", mode: "swarm", inputFilter: "research-brief" },
    { from: "researcher", to: "verifier", mode: "supervisor", approvalRequired: true },
  ],
};

export function createMockRuntimeTransport(): RuntimeTransport {
  let counter = 0;
  let connected = false;
  const eventsByRun = new Map<string, RunEvent[]>();
  const listenersByRun = new Map<string, Set<Listener>>();
  const timers = new Set<number>();
  const artifactContentByRun = new Map<string, Map<string, RuntimeArtifactContent>>();

  const makeEvent = (
    runId: string,
    kind: RunEventKind,
    payload: Record<string, unknown> = {},
  ): RunEvent => {
    counter += 1;
    return {
      id: `mock-event-${counter}`,
      runId,
      timestamp: now(),
      kind,
      payload,
      checkpointSeq: counter,
    };
  };

  const emit = (event: RunEvent) => {
    const list = eventsByRun.get(event.runId) ?? [];
    list.push(event);
    eventsByRun.set(event.runId, list);
    const listeners = listenersByRun.get(event.runId);
    if (!listeners) return;
    for (const listener of listeners) {
      listener({ type: "event", event });
    }
  };

  const schedule = (delay: number, fn: () => void) => {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      fn();
    }, delay);
    timers.add(timer);
  };

  const replay = (
    runId: string,
    listener: Listener,
    options?: SubscribeRunOptions,
  ) => {
    const events = eventsByRun.get(runId) ?? [];
    for (const event of events) {
      if (options?.filter?.kinds && !options.filter.kinds.includes(event.kind)) continue;
      if (options?.afterSeq !== undefined && (event.checkpointSeq ?? 0) <= options.afterSeq) {
        continue;
      }
      listener({ type: "event", event });
    }
  };

  const startMockRun = (request: SubmitPromptRequest, runId: string) => {
    const mode = request.mode ?? "interactive";
    const prompt = request.prompt.trim();
    const researchRunId = `${runId}-research`;
    const subagentId = `${runId}-agent`;
    const callId = `${runId}-tool`;
    const ticketId = `${runId}-approval`;
    const artifactId = `${runId}-artifact`;
    const artifactContent: RuntimeArtifactContent = {
      runId,
      artifactId,
      path: "artifacts/runtime-capability-manifest.md",
      kind: "markdown",
      createdAt: now(),
      updatedAt: now(),
      sizeBytes: 2320,
      truncated: false,
      encoding: "utf8",
      content:
        "# Runtime capability manifest notes\n\n" +
        "- Browser and desktop clients consume the same runtime gateway contract.\n" +
        "- Artifact preview uses artifact ids instead of renderer-supplied file paths.\n" +
        "- Content is clipped at the runtime boundary before it reaches the UI.\n",
    };
    artifactContentByRun.set(runId, new Map([[artifactId, artifactContent]]));

    const timeline: Array<[number, RunEventKind, Record<string, unknown>]> = [
      [0, "run.created", { prompt, mode }],
      [120, "run.started", { prompt, mode }],
      [
        240,
        "graph.normalized",
        {
          graphId: `${runId}-graph`,
          rootNodeId: "workspace-scan",
          totalNodes: 4,
          completedNodes: 0,
          runningNodes: 0,
          failedNodes: 0,
          nodes: [
            {
              id: "workspace-scan",
              kind: "synthesize",
              status: "pending",
              description: "Map runtime contracts and UI surface gaps",
            },
            {
              id: "delegated-research",
              kind: "subagent",
              status: "pending",
              role: "researcher",
              requestedLane: "delegated",
              description: "Delegate source-backed research",
            },
            {
              id: "approval-gate",
              kind: "approval",
              status: "pending",
              description: "Review workspace-safe runtime change",
            },
            {
              id: "finalize",
              kind: "synthesize",
              status: "pending",
              description: "Summarize and persist artifacts",
            },
          ],
          edges: [
            { id: "scan-research", from: "workspace-scan", to: "delegated-research" },
            { id: "research-approval", from: "delegated-research", to: "approval-gate" },
            { id: "approval-finalize", from: "approval-gate", to: "finalize" },
          ],
        },
      ],
      [
        330,
        "task.started",
        {
          taskId: "workspace-scan",
          nodeId: "workspace-scan",
          kind: "synthesize",
          description: "Map runtime contracts and UI surface gaps",
          workerId: `${runId}-supervisor`,
        },
      ],
      [
        390,
        "task.completed",
        {
          taskId: "workspace-scan",
          nodeId: "workspace-scan",
          kind: "synthesize",
          description: "Map runtime contracts and UI surface gaps",
        },
      ],
      [
        420,
        "subagent.spawned",
        {
          subagentId,
          parentTaskId: "workspace-scan",
          role: "researcher",
          lane: "delegated",
          requestedLane: "delegated",
          taskPreview: "Map runtime contracts and UI surface gaps",
          capabilities: [
            { kind: "tool", name: "repo.read" },
            { kind: "skill", name: "frontend-ui-engineering" },
          ],
          modelPreference: "runtime-default",
          traceId: `${runId}-trace`,
        },
      ],
      [
        500,
        "task.started",
        {
          taskId: "delegated-research",
          nodeId: "delegated-research",
          kind: "subagent",
          description: "Delegate source-backed research",
          workerId: subagentId,
        },
      ],
      [
        640,
        "research.started",
        {
          researchRunId,
          question: prompt,
          sourcePolicy: "authoritative-first",
          requiredSourceKinds: ["docs", "repo"],
          subagentId,
          traceId: `${runId}-trace`,
        },
      ],
      [
        860,
        "tool.call.started",
        { callId, toolId: "docs.search", summary: "Checking runtime and UI source boundaries" },
      ],
      [
        1180,
        "research.citation.added",
        {
          researchRunId,
          citationId: `${researchRunId}-citation`,
          sourceKind: "docs",
          title: "Electron context isolation",
          uri: "https://www.electronjs.org/docs/latest/tutorial/context-isolation",
        },
      ],
      [
        1460,
        "tool.call.completed",
        { callId, summary: "Boundary checks completed" },
      ],
      [
        1580,
        "task.completed",
        {
          taskId: "delegated-research",
          nodeId: "delegated-research",
          kind: "subagent",
          description: "Delegate source-backed research",
        },
      ],
      [
        1760,
        "approval.requested",
        {
          ticketId,
          action: "Apply workspace-safe runtime changes",
          reason: "Desktop main process needs to own daemon access before renderer wiring",
        },
      ],
      [
        2040,
        "artifact.created",
        {
          artifactId,
          path: "artifacts/runtime-capability-manifest.md",
          kind: "markdown",
          title: "Runtime capability manifest notes",
          summary: "Public capability surface captured for web and desktop clients",
          metadata: { source: "mock", bytes: 1840, reviewed: false },
        },
      ],
      [
        2120,
        "research.completed",
        {
          researchRunId,
          evidenceCount: 3,
          citationCount: 1,
          unknowns: [],
        },
      ],
      [
        2280,
        "artifact.updated",
        {
          artifactId,
          path: "artifacts/runtime-capability-manifest.md",
          kind: "markdown",
          title: "Runtime capability manifest notes",
          summary: "Updated after citation and approval checks",
          metadata: { source: "mock", bytes: 2320, reviewed: true },
        },
      ],
      [
        2300,
        "checkpoint.saved",
        { checkpointId: `${runId}-checkpoint-1`, checkpointSeq: 12 },
      ],
      [
        2460,
        "subagent.completed",
        {
          subagentId,
          status: "completed",
          preview: "Contracts are ready for browser and desktop adapters",
          artifactRefs: ["runtime-contracts"],
        },
      ],
    ];

    for (const [delay, kind, payload] of timeline) {
      schedule(delay, () => emit(makeEvent(runId, kind, payload)));
    }
  };

  return {
    mode: "mock",
    async connect() {
      connected = true;
    },
    disconnect() {
      connected = false;
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
      listenersByRun.clear();
    },
    async getStatus() {
      return {
        mode: "mock",
        state: "healthy",
        label: "Mock preview",
        detail: connected ? "Connected" : "Idle",
        health: runtimeDaemonHealth({
          gateway: true,
          kernel: true,
          socket: true,
          capabilities: { artifacts: { state: "enabled" } },
          orchestration: mockOrchestration,
        }),
      };
    },
    async submitPrompt(request) {
      if (!connected) {
        throw new Error("Mock runtime is not connected");
      }
      const runId = `run-${Date.now().toString(36)}-${counter + 1}`;
      eventsByRun.set(runId, []);
      startMockRun(request, runId);
      return { runId };
    },
    async getState(runId) {
      return {
        runId,
        state: {
          eventCount: eventsByRun.get(runId)?.length ?? 0,
        },
      };
    },
    async getArtifactContent(request: RuntimeArtifactContentRequest) {
      const artifact = artifactContentByRun.get(request.runId)?.get(request.artifactId);
      if (!artifact) {
        throw new Error(`Artifact not found: ${request.artifactId}`);
      }
      if (request.maxBytes !== undefined && artifact.content.length > request.maxBytes) {
        return {
          ...artifact,
          truncated: true,
          content: artifact.content.slice(0, request.maxBytes),
        };
      }
      return artifact;
    },
    async listMcpTools(_request: RuntimeMcpListRequest = {}): Promise<RuntimeMcpListResult> {
      return {
        generatedAt: now(),
        servers: [
          {
            name: "filesystem-core",
            health: "healthy",
            toolCount: 2,
            tools: [
              {
                name: "read_file",
                title: "Read file",
                description: "Read workspace file content",
                inputSchema: { type: "object", properties: { path: { type: "string" } } },
              },
              {
                name: "list_directory",
                title: "List directory",
                description: "List workspace directory contents",
                inputSchema: { type: "object", properties: { path: { type: "string" } } },
              },
            ],
          },
        ],
      };
    },
    async callMcpTool(request: RuntimeMcpToolCallRequest): Promise<RuntimeMcpToolCallResult> {
      return {
        server: request.server,
        tool: request.tool,
        success: true,
        content: [
          {
            type: "text",
            text: `Mock MCP response from ${request.server}:${request.tool}`,
          },
        ],
        latencyMs: 0,
        policy: {
          effect: "allow",
          reasonCodes: ["mock_runtime"],
          approvalRequired: false,
          traceId: request.traceId ?? `${request.runId ?? "mock"}-trace`,
        },
      };
    },
    subscribeRun(runId, onEvent, options): Unsubscribe {
      const listeners = listenersByRun.get(runId) ?? new Set<Listener>();
      listeners.add(onEvent);
      listenersByRun.set(runId, listeners);
      replay(runId, onEvent, options);
      return () => {
        listeners.delete(onEvent);
        if (listeners.size === 0) listenersByRun.delete(runId);
      };
    },
    async approve(decision) {
      emit(
        makeEvent(decision.runId, "approval.resolved", {
          ticketId: decision.ticketId,
          decision: decision.decision,
          reason: decision.reason,
        }),
      );
      if (decision.decision === "approve") {
        emit(
          makeEvent(decision.runId, "task.completed", {
            taskId: "approval-gate",
            nodeId: "approval-gate",
            kind: "approval",
            description: "Review workspace-safe runtime change",
          }),
        );
        emit(
          makeEvent(decision.runId, "task.completed", {
            taskId: "finalize",
            nodeId: "finalize",
            kind: "synthesize",
            description: "Summarize and persist artifacts",
          }),
        );
      }
      emit(
        makeEvent(
          decision.runId,
          decision.decision === "approve" ? "run.completed" : "run.failed",
          decision.decision === "approve"
            ? { summary: "Run completed after approval" }
            : { error: decision.reason ?? "Approval rejected" },
        ),
      );
    },
    async cancel(runId, reason) {
      emit(makeEvent(runId, "run.failed", { error: reason ?? "Cancelled" }));
    },
    async drain() {
      for (const runId of eventsByRun.keys()) {
        emit(makeEvent(runId, "run.drained", { summary: "Runtime drained" }));
      }
    },
  };
}
