import { AgentRuntime } from "@kirakira/agent-runtime";
import type { EventWriter, RunEvent } from "@kirakira/event-store";
import { ulid } from "ulid";

export type RunMode = "interactive" | "headless" | "dry_run";

export interface RunOptions {
  budgetUsd?: number;
  workspaceRoot?: string;
  metadata?: Record<string, unknown>;
}

export type ControlMessage =
  | { type: "submit"; prompt: string; mode: RunMode; options?: RunOptions }
  | {
      type: "steer";
      runId: string;
      instruction: string;
      priority?: "high" | "normal";
    }
  | { type: "enqueue"; prompt: string; priority?: number; runId?: string }
  | {
      type: "approve";
      runId: string;
      ticketId: string;
      decision: "approve" | "reject";
      reason?: string;
    }
  | { type: "provide_input"; runId: string; interruptId: string; data: unknown }
  | { type: "drain" }
  | { type: "cancel"; runId: string; reason?: string }
  | { type: "resume"; runId: string; fromCheckpoint?: string }
  | { type: "inspect"; runId: string; includeEvents?: boolean };

interface RunRecord {
  runId: string;
  prompt: string;
  mode: RunMode;
  status: string;
  checkpointId?: string;
  graph: {
    totalNodes: number;
    completedNodes: number;
    runningNodes: number;
    failedNodes: number;
  };
  cost: {
    totalCostUsd: number;
    totalTokens: number;
    budgetRemainingUsd?: number;
  };
  pendingApprovals: Map<
    string,
    {
      ticketId: string;
      action: string;
      reason: string;
      requestedAt: string;
    }
  >;
  draining: boolean;
}

export class OrchestratorKernel {
  private readonly writer: EventWriter;
  private readonly runtime: AgentRuntime;
  private readonly runs = new Map<string, RunRecord>();
  private readonly eventHandlers = new Set<(event: RunEvent) => void>();
  private drainWaiters: (() => void)[] = [];
  private started = false;

  constructor(writer: EventWriter) {
    this.writer = writer;
    this.runtime = new AgentRuntime((e) => {
      this.append(e);
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
    for (const runId of [...this.runs.keys()]) {
      this.runtime.removeRunWorkers(runId);
    }
    this.runs.clear();
    this.writer.close();
  }

  getRuntime(): AgentRuntime {
    return this.runtime;
  }

  getWriter(): EventWriter {
    return this.writer;
  }

  onEvent(handler: (event: RunEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  private broadcastHandlers(event: RunEvent): void {
    for (const h of this.eventHandlers) {
      try {
        h(event);
      } catch {
        /* ignore handler errors */
      }
    }
  }

  private emit(runId: string, kind: RunEvent["kind"], payload: Record<string, unknown>): void {
    const event: RunEvent = {
      id: ulid(),
      runId,
      timestamp: new Date().toISOString(),
      kind,
      payload,
    };
    this.append(event);
  }

  private append(event: RunEvent): void {
    this.writer.append(event);
    this.broadcastHandlers(event);
  }

  private defaultRun(prompt: string, mode: RunMode): RunRecord {
    return {
      runId: "",
      prompt,
      mode,
      status: "pending",
      graph: {
        totalNodes: 0,
        completedNodes: 0,
        runningNodes: 0,
        failedNodes: 0,
      },
      cost: { totalCostUsd: 0, totalTokens: 0 },
      pendingApprovals: new Map(),
      draining: false,
    };
  }

  async submitRun(prompt: string, mode: RunMode, options?: RunOptions): Promise<string> {
    const runId = ulid();
    const rec = this.defaultRun(prompt, mode);
    rec.runId = runId;
    rec.status = "running";
    if (options?.budgetUsd !== undefined) {
      rec.cost.budgetRemainingUsd = options.budgetUsd;
    }
    this.runs.set(runId, rec);
    this.emit(runId, "run.created", { prompt, mode });
    this.emit(runId, "run.started", { prompt, mode });
    const workerId = `${runId}-worker`;
    this.runtime.registerWorker({
      id: workerId,
      runId,
      workloadType: mode,
      status: "active",
      turnCount: 0,
      model: "default",
    });
    rec.graph = {
      totalNodes: 1,
      completedNodes: 0,
      runningNodes: 1,
      failedNodes: 0,
    };
    this.emit(runId, "graph.normalized", {
      totalNodes: rec.graph.totalNodes,
      completedNodes: rec.graph.completedNodes,
      runningNodes: rec.graph.runningNodes,
      failedNodes: rec.graph.failedNodes,
    });
    return runId;
  }

  forwardControl(message: ControlMessage): void {
    switch (message.type) {
      case "submit": {
        void this.submitRun(message.prompt, message.mode, message.options);
        break;
      }
      case "steer": {
        const wId = `${message.runId}-worker`;
        try {
          const cur = this.runtime.getWorkerStatus(wId);
          this.runtime.updateWorker(wId, { turnCount: cur.turnCount + 1 });
        } catch {
          return;
        }
        this.emit(message.runId, "steer.received", {
          instruction: message.instruction,
          ...(message.priority !== undefined ? { priority: message.priority } : {}),
        });
        break;
      }
      case "enqueue": {
        const rid = message.runId ?? ulid();
        if (!this.runs.has(rid)) {
          const rec = this.defaultRun(message.prompt, "headless");
          rec.runId = rid;
          rec.status = "pending";
          this.runs.set(rid, rec);
        }
        this.emit(rid, "plan.compiled", {
          prompt: message.prompt,
          priority: message.priority ?? 0,
          enqueued: true,
        });
        break;
      }
      case "approve": {
        const r = this.runs.get(message.runId);
        if (!r) return;
        r.pendingApprovals.delete(message.ticketId);
        this.emit(message.runId, "approval.resolved", {
          ticketId: message.ticketId,
          decision: message.decision,
          ...(message.reason !== undefined ? { reason: message.reason } : {}),
        });
        break;
      }
      case "provide_input": {
        this.emit(message.runId, "interrupt.resumed", {
          interruptId: message.interruptId,
          data: message.data,
        } as Record<string, unknown>);
        break;
      }
      case "drain": {
        for (const r of this.runs.values()) {
          r.draining = true;
        }
        for (const rid of this.runs.keys()) {
          this.emit(rid, "drain.requested", {});
        }
        this.flushDrainIfIdle();
        break;
      }
      case "cancel": {
        const r = this.runs.get(message.runId);
        if (!r) return;
        r.status = "drained";
        this.emit(message.runId, "run.drained", { reason: message.reason ?? "cancelled" });
        this.runtime.removeRunWorkers(message.runId);
        this.flushDrainIfIdle();
        break;
      }
      case "resume": {
        const r = this.runs.get(message.runId);
        if (!r) return;
        r.status = "running";
        this.emit(message.runId, "interrupt.resumed", {
          ...(message.fromCheckpoint !== undefined ? { fromCheckpoint: message.fromCheckpoint } : {}),
        });
        break;
      }
      case "inspect": {
        const r = this.runs.get(message.runId);
        if (!r) return;
        this.emit(message.runId, "graph.normalized", {
          totalNodes: r.graph.totalNodes,
          completedNodes: r.graph.completedNodes,
          runningNodes: r.graph.runningNodes,
          failedNodes: r.graph.failedNodes,
          inspect: true,
          includeEvents: message.includeEvents ?? false,
        });
        break;
      }
    }
  }

  private flushDrainIfIdle(): void {
    const active = [...this.runs.values()].filter(
      (r) => r.status === "running" || r.status === "pending",
    );
    if (active.length > 0) return;
    const waiters = this.drainWaiters.splice(0, this.drainWaiters.length);
    for (const w of waiters) w();
  }

  async waitForDrain(): Promise<void> {
    const active = [...this.runs.values()].filter(
      (r) => r.status === "running" || r.status === "pending",
    );
    if (active.length === 0) return;
    await new Promise<void>((resolve) => {
      this.drainWaiters.push(resolve);
    });
  }

  getStateSnapshot(runId: string): {
    runId: string;
    status: string;
    graph?: RunRecord["graph"];
    checkpointId?: string;
  } | null {
    const r = this.runs.get(runId);
    if (!r) return null;
    return {
      runId: r.runId,
      status: r.status,
      graph: { ...r.graph },
      checkpointId: r.checkpointId,
    };
  }

  snapshotRunForDaemon(runId: string): {
    run: RunRecord | null;
    workers: ReturnType<AgentRuntime["listActiveWorkers"]>;
    approvals: Array<{
      ticketId: string;
      action: string;
      reason: string;
      requestedAt: string;
    }>;
  } {
    const run = this.runs.get(runId) ?? null;
    const workers = this.runtime.listActiveWorkers().filter((w) => w.id.startsWith(`${runId}-`));
    const approvals = run ? [...run.pendingApprovals.values()] : [];
    return { run, workers, approvals };
  }

  addPendingApproval(runId: string, ticketId: string, action: string, reason: string): void {
    const r = this.runs.get(runId);
    if (!r) return;
    const requestedAt = new Date().toISOString();
    r.pendingApprovals.set(ticketId, {
      ticketId,
      action,
      reason,
      requestedAt,
    });
    this.emit(runId, "approval.requested", {
      ticketId,
      action,
      reason,
    });
  }

  saveCheckpoint(runId: string, checkpointId: string): void {
    const r = this.runs.get(runId);
    if (!r) return;
    r.checkpointId = checkpointId;
    this.emit(runId, "checkpoint.saved", { checkpointId });
    this.flushDrainIfIdle();
  }
}
