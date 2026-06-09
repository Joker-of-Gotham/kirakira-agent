import type {
  RunEvent,
  RunEventKind,
  RunState,
  ResearchCitationRecord,
  ResearchRunRecord,
  ResearchTaskRecord,
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
    researchRuns: {},
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

function readNumber(p: Record<string, unknown>, key: string): number | undefined {
  const value = p[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

function researchRunId(p: Record<string, unknown>, fallback: string): string {
  return readString(p, "researchRunId") ??
    readString(p, "researchId") ??
    readString(p, "planId") ??
    fallback;
}

function researchTaskId(p: Record<string, unknown>): string | undefined {
  return readString(p, "researchTaskId") ?? readString(p, "taskId") ?? readString(p, "id");
}

function researchRunMetadata(p: Record<string, unknown>): Partial<ResearchRunRecord> {
  return {
    ...(readString(p, "questionPreview") !== undefined
      ? { question: readString(p, "questionPreview") }
      : readString(p, "question") !== undefined
        ? { question: readString(p, "question") }
        : {}),
    ...(readString(p, "planId") !== undefined ? { planId: readString(p, "planId") } : {}),
    ...(readString(p, "sourcePolicy") !== undefined
      ? { sourcePolicy: readString(p, "sourcePolicy") }
      : {}),
    ...(readStringArray(p, "requiredSourceKinds") !== undefined
      ? { requiredSourceKinds: readStringArray(p, "requiredSourceKinds") }
      : {}),
    ...(readString(p, "traceId") !== undefined ? { traceId: readString(p, "traceId") } : {}),
    ...(readString(p, "parentTaskId") !== undefined
      ? { parentTaskId: readString(p, "parentTaskId") }
      : {}),
    ...(readString(p, "parentWorkerId") !== undefined
      ? { parentWorkerId: readString(p, "parentWorkerId") }
      : {}),
    ...(readString(p, "subagentId") !== undefined
      ? { subagentId: readString(p, "subagentId") }
      : {}),
    ...(readObject(p, "limits") !== undefined ? { limits: readObject(p, "limits") } : {}),
    ...(readObject(p, "citationSchema") !== undefined
      ? { citationSchema: readObject(p, "citationSchema") }
      : {}),
    ...(readStringArray(p, "unknowns") !== undefined
      ? { unknowns: readStringArray(p, "unknowns") }
      : {}),
    ...(readNumber(p, "toolCalls") !== undefined ? { toolCalls: readNumber(p, "toolCalls") } : {}),
  };
}

function researchTaskMetadata(p: Record<string, unknown>): Partial<ResearchTaskRecord> {
  return {
    ...(readString(p, "question") !== undefined ? { question: readString(p, "question") } : {}),
    ...(readNumber(p, "depth") !== undefined ? { depth: readNumber(p, "depth") } : {}),
    ...(readStringArray(p, "sourceKinds") !== undefined
      ? { sourceKinds: readStringArray(p, "sourceKinds") }
      : {}),
    ...(readNumber(p, "evidenceCount") !== undefined
      ? { evidenceCount: readNumber(p, "evidenceCount") }
      : {}),
    ...(readNumber(p, "citationCount") !== undefined
      ? { citationCount: readNumber(p, "citationCount") }
      : {}),
    ...(readString(p, "error") !== undefined
      ? { error: readString(p, "error") }
      : readString(p, "message") !== undefined
        ? { error: readString(p, "message") }
        : {}),
  };
}

function citationRecord(
  p: Record<string, unknown>,
  at: string,
): ResearchCitationRecord | undefined {
  const id = readString(p, "citationId") ?? readString(p, "id");
  if (!id) return undefined;
  return {
    id,
    ...(readString(p, "sourceKind") !== undefined ? { sourceKind: readString(p, "sourceKind") } : {}),
    ...(readString(p, "title") !== undefined ? { title: readString(p, "title") } : {}),
    ...(readString(p, "uri") !== undefined ? { uri: readString(p, "uri") } : {}),
    ...(readString(p, "summary") !== undefined ? { summary: readString(p, "summary") } : {}),
    ...(readString(p, "traceId") !== undefined ? { traceId: readString(p, "traceId") } : {}),
    ...(readString(p, "queryId") !== undefined ? { queryId: readString(p, "queryId") } : {}),
    ...(readString(p, "sourceRecordId") !== undefined
      ? { sourceRecordId: readString(p, "sourceRecordId") }
      : {}),
    ...(readStringArray(p, "evidenceIds") !== undefined
      ? { evidenceIds: readStringArray(p, "evidenceIds") }
      : {}),
    ...(readStringArray(p, "provenanceIds") !== undefined
      ? { provenanceIds: readStringArray(p, "provenanceIds") }
      : {}),
    ...(readString(p, "artifactPointer") !== undefined
      ? { artifactPointer: readString(p, "artifactPointer") }
      : {}),
    ...(readStringArray(p, "routeNames") !== undefined
      ? { routeNames: readStringArray(p, "routeNames") }
      : {}),
    ...(readNumber(p, "score") !== undefined ? { score: readNumber(p, "score") } : {}),
    ...(readObject(p, "metadata") !== undefined ? { metadata: readObject(p, "metadata") } : {}),
    addedAt: at,
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
    this.normalizeState(state);
    state.lastSeq = event.checkpointSeq ?? state.lastSeq + 1;
    this.dispatch(state, event.kind, event);
  }

  private normalizeState(state: RunState): void {
    state.researchRuns ??= {};
  }

  private dispatch(next: RunState, kind: RunEventKind, event: RunEvent): void {
    const p = event.payload;
    switch (kind) {
      case "run.created":
        next.createdAt = event.timestamp;
        next.status = "pending";
        next.parentRunId = readString(p, "parentRunId") ?? event.parentRunId ?? next.parentRunId;
        next.workspaceRoot = readString(p, "workspaceRoot") ?? next.workspaceRoot;
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
      case "research.started":
        this.applyResearchStarted(next, p, event.timestamp);
        break;
      case "research.plan.created":
        this.applyResearchPlan(next, p, event.timestamp);
        break;
      case "research.task.started":
        this.applyResearchTask(next, p, "running", event.timestamp);
        break;
      case "research.task.completed":
        this.applyResearchTask(
          next,
          p,
          readString(p, "status") === "failed" ? "failed" : "completed",
          event.timestamp,
        );
        break;
      case "research.task.failed":
        this.applyResearchTask(next, p, "failed", event.timestamp);
        break;
      case "research.source.started":
        this.applyResearchSource(next, p, false, event.timestamp);
        break;
      case "research.source.completed":
        this.applyResearchSource(next, p, false, event.timestamp);
        break;
      case "research.source.failed":
        this.applyResearchSource(next, p, true, event.timestamp);
        break;
      case "research.evidence.collected":
        this.applyResearchEvidence(next, p, event.timestamp);
        break;
      case "research.citation.added":
        this.applyResearchCitation(next, p, event.timestamp);
        break;
      case "research.limit.reached":
        this.applyResearchLimit(next, p, event.timestamp);
        break;
      case "research.completed":
        this.applyResearchDone(next, p, "completed", event.timestamp);
        break;
      case "research.failed":
        this.applyResearchDone(next, p, "failed", event.timestamp);
        break;
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

  private ensureResearchRun(
    next: RunState,
    p: Record<string, unknown>,
    at: string,
  ): ResearchRunRecord {
    const id = researchRunId(p, `${next.runId}:research`);
    const existing = next.researchRuns[id];
    const run: ResearchRunRecord = {
      ...existing,
      id,
      status: existing?.status ?? "planned",
      tasks: existing?.tasks ?? {},
      evidence: existing?.evidence ?? {},
      citations: existing?.citations ?? {},
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
      ...researchRunMetadata(p),
    };
    next.researchRuns[id] = run;
    return run;
  }

  private applyResearchStarted(
    next: RunState,
    p: Record<string, unknown>,
    at: string,
  ): void {
    const run = this.ensureResearchRun(next, p, at);
    run.status = "running";
  }

  private applyResearchPlan(
    next: RunState,
    p: Record<string, unknown>,
    at: string,
  ): void {
    const run = this.ensureResearchRun(next, p, at);
    run.status = run.status === "running" ? "running" : "planned";
    const tasks = readObjectArray(p, "tasks") ?? [];
    for (const raw of tasks) {
      const id = researchTaskId(raw);
      if (!id) continue;
      run.tasks[id] = {
        ...run.tasks[id],
        id,
        status: "pending",
        ...researchTaskMetadata(raw),
      };
    }
  }

  private applyResearchTask(
    next: RunState,
    p: Record<string, unknown>,
    status: ResearchTaskRecord["status"],
    at: string,
  ): void {
    const run = this.ensureResearchRun(next, p, at);
    run.status = status === "failed" ? "failed" : "running";
    const id = researchTaskId(p);
    if (!id) return;
    const existing = run.tasks[id];
    run.tasks[id] = {
      ...existing,
      id,
      status,
      ...researchTaskMetadata(p),
      startedAt: status === "running" ? at : existing?.startedAt,
      completedAt: status === "completed" || status === "failed" ? at : existing?.completedAt,
    };
  }

  private applyResearchSource(
    next: RunState,
    p: Record<string, unknown>,
    failed: boolean,
    at: string,
  ): void {
    const run = this.ensureResearchRun(next, p, at);
    run.status = "running";
    const taskId = researchTaskId(p);
    if (!taskId) {
      if (failed) {
        const message = readString(p, "message") ?? readString(p, "error") ?? "Research source failed.";
        run.unknowns = [...(run.unknowns ?? []), message];
      }
      return;
    }
    const existing = run.tasks[taskId];
    const message = readString(p, "message") ?? readString(p, "error");
    run.tasks[taskId] = {
      ...existing,
      id: taskId,
      status: "running",
      ...(readStringArray(p, "sourceKinds") !== undefined
        ? { sourceKinds: readStringArray(p, "sourceKinds") }
        : {}),
      startedAt: existing?.startedAt ?? at,
      completedAt: existing?.completedAt,
      error: failed ? message : existing?.error,
    };
    if (failed && message) {
      run.unknowns = [...(run.unknowns ?? []), message];
    }
  }

  private applyResearchEvidence(
    next: RunState,
    p: Record<string, unknown>,
    at: string,
  ): void {
    const run = this.ensureResearchRun(next, p, at);
    run.status = run.status === "planned" ? "running" : run.status;
    const evidenceIds = readStringArray(p, "evidenceIds");
    const ids =
      evidenceIds && evidenceIds.length > 0
        ? evidenceIds
        : [readString(p, "evidenceId") ?? readString(p, "id") ?? `research-evidence-${at}`];
    const taskId = researchTaskId(p);
    for (const id of ids) {
      run.evidence[id] = {
        id,
        ...(taskId !== undefined ? { taskId } : {}),
        ...(readString(p, "sourceKind") !== undefined ? { sourceKind: readString(p, "sourceKind") } : {}),
        ...(readString(p, "query") !== undefined ? { query: readString(p, "query") } : {}),
        ...(readString(p, "title") !== undefined ? { title: readString(p, "title") } : {}),
        ...(readString(p, "summary") !== undefined ? { summary: readString(p, "summary") } : {}),
        ...(readStringArray(p, "citationIds") !== undefined
          ? { citationIds: readStringArray(p, "citationIds") }
          : {}),
        collectedAt: at,
        ...(readObject(p, "metadata") !== undefined ? { metadata: readObject(p, "metadata") } : {}),
      };
    }
    if (taskId && run.tasks[taskId]) {
      const task = run.tasks[taskId];
      const evidenceIncrement = evidenceIds?.length ?? readNumber(p, "evidenceCount") ?? 1;
      const citationIncrement =
        readStringArray(p, "citationIds")?.length ?? readNumber(p, "citationCount") ?? 0;
      run.tasks[taskId] = {
        ...task,
        evidenceCount: (task.evidenceCount ?? 0) + evidenceIncrement,
        citationCount: (task.citationCount ?? 0) + citationIncrement,
      };
    }
  }

  private applyResearchCitation(
    next: RunState,
    p: Record<string, unknown>,
    at: string,
  ): void {
    const run = this.ensureResearchRun(next, p, at);
    run.status = run.status === "planned" ? "running" : run.status;
    const citation = citationRecord(p, at);
    if (!citation) return;
    run.citations[citation.id] = citation;
  }

  private applyResearchLimit(
    next: RunState,
    p: Record<string, unknown>,
    at: string,
  ): void {
    const run = this.ensureResearchRun(next, p, at);
    run.status = "running";
    const message = readString(p, "message") ?? "Research limit reached.";
    run.unknowns = [...(run.unknowns ?? []), message];
  }

  private applyResearchDone(
    next: RunState,
    p: Record<string, unknown>,
    status: ResearchRunRecord["status"],
    at: string,
  ): void {
    const run = this.ensureResearchRun(next, p, at);
    run.status = status;
    run.completedAt = at;
    run.updatedAt = at;
    if (status === "failed") {
      run.error = readString(p, "error") ?? readString(p, "message") ?? "research failed";
    }
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
