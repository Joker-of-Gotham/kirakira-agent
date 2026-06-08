import type {
  RunEvent,
  RunEventKind,
  RunState,
  SubagentRecord,
  TaskNode,
  SkillRecord,
  ToolInvocationRecord,
} from "./types.js";

export function createEmptyRunState(runId: string): RunState {
  return {
    runId,
    status: "pending",
    taskNodes: {},
    taskEdges: [],
    artifacts: {},
    subagents: {},
    skills: {},
    tools: {},
    modelTranscript: [],
    sandboxOpen: false,
    approvals: {},
    interrupts: {},
    merges: {},
    control: { drainRequestedVersion: 0 },
    checkpoint: {},
    lastSeq: 0,
  };
}

function readString(p: Record<string, unknown>, key: string): string | undefined {
  const v = p[key];
  return typeof v === "string" ? v : undefined;
}

function readStringArray(p: Record<string, unknown>, key: string): string[] | undefined {
  const value = p[key];
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((item): item is string => typeof item === "string");
  return out.length > 0 ? out : undefined;
}

function readObject(p: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = p[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readObjectArray(
  p: Record<string, unknown>,
  key: string,
): Array<Record<string, unknown>> | undefined {
  const value = p[key];
  if (!Array.isArray(value)) return undefined;
  const out = value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
  return out.length > 0 ? out : undefined;
}

function namesForCapabilities(
  capabilities: Array<Record<string, unknown>> | undefined,
  kind: string,
): string[] | undefined {
  if (!capabilities) return undefined;
  const names = capabilities
    .filter((cap) => cap.kind === kind && typeof cap.name === "string")
    .map((cap) => cap.name as string);
  return names.length > 0 ? names : undefined;
}

function subagentMetadata(p: Record<string, unknown>): Partial<SubagentRecord> {
  const capabilities = readObjectArray(p, "capabilities");
  const scope = capabilities
    ? {
        capabilities,
        ...(namesForCapabilities(capabilities, "tool") !== undefined
          ? { toolNames: namesForCapabilities(capabilities, "tool") }
          : {}),
        ...(namesForCapabilities(capabilities, "skill") !== undefined
          ? { skillNames: namesForCapabilities(capabilities, "skill") }
          : {}),
        ...(namesForCapabilities(capabilities, "mcp") !== undefined
          ? { mcpServers: namesForCapabilities(capabilities, "mcp") }
          : {}),
      }
    : undefined;
  const contract = {
    ...(readString(p, "taskPreview") !== undefined
      ? { taskPreview: readString(p, "taskPreview") }
      : {}),
    ...(readString(p, "modelPreference") !== undefined
      ? { modelPreference: readString(p, "modelPreference") }
      : {}),
    ...(readObject(p, "runtimePolicy") !== undefined
      ? { runtimePolicy: readObject(p, "runtimePolicy") }
      : {}),
    ...(readObject(p, "policyCeiling") !== undefined
      ? { policyCeiling: readObject(p, "policyCeiling") }
      : {}),
    ...(readStringArray(p, "inputArtifactRefs") !== undefined
      ? { inputArtifactRefs: readStringArray(p, "inputArtifactRefs") }
      : {}),
    ...(readObject(p, "outputSchema") !== undefined
      ? { outputSchema: readObject(p, "outputSchema") }
      : {}),
  };
  const result = {
    ...(readString(p, "preview") !== undefined ? { preview: readString(p, "preview") } : {}),
    ...(readStringArray(p, "artifactRefs") !== undefined
      ? { artifactRefs: readStringArray(p, "artifactRefs") }
      : {}),
  };
  return {
    ...(readString(p, "parentTaskId") !== undefined
      ? { parentTaskId: readString(p, "parentTaskId") }
      : {}),
    ...(readString(p, "parentWorkerId") !== undefined
      ? { parentWorkerId: readString(p, "parentWorkerId") }
      : {}),
    ...(readString(p, "workerId") !== undefined ? { workerId: readString(p, "workerId") } : {}),
    ...(readString(p, "lane") !== undefined ? { lane: readString(p, "lane") } : {}),
    ...(readString(p, "traceId") !== undefined ? { traceId: readString(p, "traceId") } : {}),
    ...(scope !== undefined ? { scope } : {}),
    ...(Object.keys(contract).length > 0 ? { contract } : {}),
    ...(Object.keys(result).length > 0 ? { result } : {}),
  };
}

export class RunStateProjector {
  project(events: RunEvent[]): RunState {
    if (events.length === 0) {
      return createEmptyRunState("");
    }
    const state = createEmptyRunState(events[0]!.runId);
    for (const event of events) {
      this.apply(state, event);
    }
    return state;
  }

  apply(state: RunState, event: RunEvent): void {
    state.lastSeq = event.checkpointSeq ?? state.lastSeq + 1;
    this.dispatch(state, event.kind, event);
  }

  private dispatch(next: RunState, kind: RunEventKind, event: RunEvent): void {
    const p = event.payload;
    switch (kind) {
      case "run.created":
        next.createdAt = event.timestamp;
        next.status = "pending";
        next.parentRunId = readString(p, "parentRunId") ?? event.parentRunId ?? next.parentRunId;
        break;
      case "run.started":
        next.startedAt = event.timestamp;
        next.status = "running";
        break;
      case "run.completed":
        next.endedAt = event.timestamp;
        next.status = "completed";
        break;
      case "run.failed":
        next.endedAt = event.timestamp;
        next.status = "failed";
        next.errorMessage = readString(p, "message") ?? readString(p, "error") ?? "run failed";
        break;
      case "run.drained":
        next.endedAt = event.timestamp;
        next.status = "drained";
        break;
      case "plan.compiled":
        if (typeof p.plan === "object" && p.plan !== null && !Array.isArray(p.plan)) {
          next.plan = p.plan as Record<string, unknown>;
        } else {
          next.plan = { ...p };
        }
        break;
      case "graph.normalized": {
        const edges = p.edges;
        const nodes = p.nodes;
        if (Array.isArray(edges)) {
          next.taskEdges = edges as typeof next.taskEdges;
        }
        if (Array.isArray(nodes)) {
          for (const raw of nodes as Array<Record<string, unknown>>) {
            const id = readString(raw, "id");
            if (!id) continue;
            const st = readString(raw, "status");
            next.taskNodes[id] = { id, status: (st ?? "pending") as TaskNode["status"] };
          }
        }
        next.normalizedGraph = { ...p };
        break;
      }
      case "task.ready":
        this.upsertTask(next, p, "ready");
        break;
      case "task.started":
        this.upsertTask(next, p, "running", { startedAt: event.timestamp });
        break;
      case "task.completed":
        this.upsertTask(next, p, "completed", { completedAt: event.timestamp });
        break;
      case "task.failed":
        this.upsertTask(next, p, "failed", {
          completedAt: event.timestamp,
          error: readString(p, "error") ?? readString(p, "message"),
        });
        break;
      case "subagent.spawned": {
        const id = readString(p, "subagentId") ?? readString(p, "id");
        if (!id) break;
        next.subagents[id] = {
          ...next.subagents[id],
          id,
          ...subagentMetadata(p),
          status: "spawned",
          spawnedAt: event.timestamp,
        };
        break;
      }
      case "subagent.completed": {
        const id = readString(p, "subagentId") ?? readString(p, "id");
        if (!id) break;
        const existing = next.subagents[id];
        const failed = readString(p, "status") === "failed";
        next.subagents[id] = {
          ...existing,
          id,
          ...subagentMetadata(p),
          status: failed ? "failed" : "completed",
          spawnedAt: existing?.spawnedAt ?? event.timestamp,
          completedAt: event.timestamp,
          error: readString(p, "error"),
        };
        break;
      }
      case "tool.search.requested":
      case "tool.selected":
      case "tool.call.started":
      case "tool.call.completed":
      case "tool.call.failed":
        this.applyTool(next, kind, p, event.timestamp);
        break;
      case "skill.advertised":
      case "skill.loaded":
      case "skill.materialized":
        this.applySkill(next, kind, p, event.timestamp);
        break;
      case "model.request":
        next.modelTranscript.push({ kind: "request", at: event.timestamp, body: { ...p } });
        break;
      case "model.response":
        next.modelTranscript.push({ kind: "response", at: event.timestamp, body: { ...p } });
        break;
      case "sandbox.opened":
        next.sandboxOpen = true;
        break;
      case "sandbox.closed":
        next.sandboxOpen = false;
        break;
      case "artifact.created":
      case "artifact.updated":
        this.applyArtifact(next, kind, p, event.timestamp);
        break;
      case "approval.requested":
      case "approval.resolved":
        this.applyApproval(next, kind, p, event.timestamp);
        break;
      case "interrupt.raised":
      case "interrupt.resumed":
        this.applyInterrupt(next, kind, p, event.timestamp);
        break;
      case "checkpoint.saved":
        next.checkpoint.lastCheckpointId = readString(p, "checkpointId");
        next.checkpoint.lastCheckpointSeq =
          typeof p.seq === "number" ? p.seq : next.checkpoint.lastCheckpointSeq;
        break;
      case "checkpoint.restored":
        next.checkpoint.lastCheckpointId =
          readString(p, "checkpointId") ?? next.checkpoint.lastCheckpointId;
        break;
      case "merge.proposed":
      case "merge.applied":
        this.applyMerge(next, kind, p, event.timestamp);
        break;
      case "steer.received":
        next.control.lastSteer = { ...p };
        break;
      case "drain.requested":
        next.control.drainRequestedVersion += 1;
        next.control.lastDrainRequestedAt = event.timestamp;
        break;
      default:
        break;
    }
  }

  private upsertTask(
    next: RunState,
    p: Record<string, unknown>,
    status: TaskNode["status"],
    extra?: Partial<TaskNode>,
  ): void {
    const id = readString(p, "nodeId") ?? readString(p, "taskId") ?? readString(p, "id");
    if (!id) return;
    const existing = next.taskNodes[id];
    next.taskNodes[id] = { ...existing, id, status, ...extra };
  }

  private applyTool(
    next: RunState,
    kind: RunEventKind,
    p: Record<string, unknown>,
    at: string,
  ): void {
    const callId =
      readString(p, "callId") ?? readString(p, "id") ?? `tool-${at}`;
    const phaseMap: Record<string, ToolInvocationRecord["phase"]> = {
      "tool.search.requested": "search",
      "tool.selected": "selected",
      "tool.call.started": "started",
      "tool.call.completed": "completed",
      "tool.call.failed": "failed",
    };
    next.tools[callId] = {
      callId,
      toolId: readString(p, "toolName") ?? readString(p, "toolId"),
      phase: phaseMap[kind] ?? "started",
      at,
      detail: { ...p },
    };
  }

  private applySkill(
    next: RunState,
    kind: RunEventKind,
    p: Record<string, unknown>,
    at: string,
  ): void {
    const name = readString(p, "name") ?? readString(p, "skillName") ?? "unknown";
    const stateMap: Record<string, SkillRecord["state"]> = {
      "skill.advertised": "advertised",
      "skill.loaded": "loaded",
      "skill.materialized": "materialized",
    };
    next.skills[name] = {
      id: readString(p, "id") ?? name,
      name,
      state: stateMap[kind] ?? "advertised",
      at,
    };
  }

  private applyArtifact(
    next: RunState,
    kind: RunEventKind,
    p: Record<string, unknown>,
    at: string,
  ): void {
    const id = readString(p, "artifactId") ?? readString(p, "id") ?? `art-${at}`;
    next.artifacts[id] = {
      id,
      path: readString(p, "path"),
      kind: readString(p, "kind"),
      createdAt: kind === "artifact.created" ? at : (next.artifacts[id]?.createdAt ?? at),
      updatedAt: at,
      metadata: typeof p.metadata === "object" && p.metadata !== null
        ? (p.metadata as Record<string, unknown>)
        : undefined,
    };
  }

  private applyApproval(
    next: RunState,
    kind: RunEventKind,
    p: Record<string, unknown>,
    at: string,
  ): void {
    const id = readString(p, "ticketId") ?? readString(p, "id") ?? `apr-${at}`;
    if (kind === "approval.requested") {
      next.approvals[id] = { id, status: "pending", requestedAt: at };
    } else {
      const existing = next.approvals[id];
      const decision = readString(p, "decision");
      next.approvals[id] = {
        ...existing,
        id,
        status: decision === "reject" ? "rejected" : "approved",
        requestedAt: existing?.requestedAt ?? at,
        resolvedAt: at,
        decision: { ...p },
      };
    }
  }

  private applyInterrupt(
    next: RunState,
    kind: RunEventKind,
    p: Record<string, unknown>,
    at: string,
  ): void {
    const id = readString(p, "interruptId") ?? readString(p, "id") ?? `int-${at}`;
    next.interrupts[id] = {
      id,
      status: kind === "interrupt.raised" ? "raised" : "resumed",
      at,
      reason: readString(p, "reason"),
    };
  }

  private applyMerge(
    next: RunState,
    kind: RunEventKind,
    p: Record<string, unknown>,
    at: string,
  ): void {
    const id = readString(p, "mergeId") ?? readString(p, "id") ?? `mrg-${at}`;
    next.merges[id] = {
      id,
      status: kind === "merge.proposed" ? "proposed" : "applied",
      at,
      detail: { ...p },
    };
  }
}
