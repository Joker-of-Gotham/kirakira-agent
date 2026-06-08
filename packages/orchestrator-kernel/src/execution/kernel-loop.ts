import { ulid } from "ulid";
import type { CheckpointManager } from "../checkpoint/checkpoint-manager.js";
import type { ControlInbox } from "../control/control-inbox.js";
import type { DependencyResolver } from "../compiler/dependency-resolver.js";
import type { DrainController } from "./drain.js";
import type { PlanNormalizer } from "../compiler/plan-normalizer.js";
import type { ResourceBudgetManager } from "../scheduler/resource-budget.js";
import type { BackpressureController } from "../scheduler/backpressure.js";
import type { LaneRouter } from "../scheduler/lane-router.js";
import type { SuperstepManager } from "./superstep.js";
import type {
  ResourceBudgets,
  RunEvent,
  RunPlan,
  RoutingContext,
  SchedulerState,
  TaskExecutor,
} from "../types.js";

function initialScheduler(budgets: ResourceBudgets): SchedulerState {
  const q = (capacity: number) => ({
    capacity,
    active: 0,
    pending: [] as string[],
  });
  return {
    readyQueue: [],
    runningTasks: new Map(),
    budgets,
    lanes: {
      foreground: q(4),
      queued: q(16),
      background: q(8),
      delegated: q(8),
    },
    backpressure: { isThrottled: false },
  };
}

export interface KernelLoopDeps {
  normalizer: PlanNormalizer;
  resolver: DependencyResolver;
  executor: TaskExecutor;
  laneRouter: LaneRouter;
  budgetManager: ResourceBudgetManager;
  backpressure: BackpressureController;
  checkpointManager: CheckpointManager;
  inbox: ControlInbox;
  superstep: SuperstepManager;
  drain: DrainController;
  routingContext: RoutingContext;
}

export class KernelLoop {
  constructor(private readonly deps: KernelLoopDeps) {}

  async *run(runId: string, plan: RunPlan): AsyncGenerator<RunEvent> {
    yield { kind: "plan_attached", plan };
    let graph = this.deps.normalizer.normalize(plan, runId);
    graph = this.deps.resolver.resolve(graph);
    yield { kind: "graph_normalized", graph };
    let scheduler = initialScheduler(this.deps.budgetManager.snapshot());
    let terminate = false;
    const kernelState = () => ({
      runId,
      planId: plan.id,
      graph: {
        id: graph.id,
        runId: graph.runId,
        rootNodeId: graph.rootNodeId,
        createdAt: graph.createdAt,
        updatedAt: graph.updatedAt,
        edges: graph.edges,
        nodes: Object.fromEntries(graph.nodes),
      },
      scheduler: {
        ...scheduler,
        runningTasks: Object.fromEntries(scheduler.runningTasks.entries()),
      },
      controlEpoch: 0,
      lineageRootId: runId,
    });
    const processControl = (): void => {
      while (this.deps.inbox.hasPending()) {
        const msg = this.deps.inbox.process();
        if (!msg) break;
        if (msg.kind === "request_drain") this.deps.drain.requestDrain();
        if (msg.kind === "cancel_hard" && msg.payload.runId === runId) terminate = true;
      }
    };
    const priority = (node: { kind: string; spec: { estimatedTokens?: number } }): number => {
      let p = 0;
      if (node.kind === "approval") p += 100;
      if (node.kind === "plan") p += 50;
      const est = node.spec.estimatedTokens;
      if (typeof est === "number") p -= Math.min(est / 10_000, 20);
      return p;
    };
    while (!terminate) {
      processControl();
      if (terminate) break;
      graph = this.deps.resolver.resolve(graph);
      scheduler.budgets = this.deps.budgetManager.snapshot();
      this.deps.backpressure.check(scheduler);
      if (this.deps.drain.isDraining() && scheduler.runningTasks.size === 0) {
        const readyAfterTask = this.deps.resolver.getReadyNodes(graph).length;
        if (readyAfterTask > 0) {
          const snap = this.deps.drain.onDrainComplete(kernelState());
          yield { kind: "checkpoint_saved", checkpointId: snap.id };
          this.deps.drain.reset();
          break;
        }
      }
      const readyNodes = this.deps.resolver
        .getReadyNodes(graph)
        .sort((a, b) => priority(b) - priority(a));
      const nextNode = readyNodes[0];
      if (!nextNode) {
        const pending = [...graph.nodes.values()].filter(
          (n) => n.status !== "completed" && n.status !== "failed" && n.status !== "cancelled",
        );
        if (pending.length === 0) break;
        const blocked = pending.filter(
          (n) =>
            n.status === "pending" &&
            graph.edges.some(
              (e) => e.kind === "blocks_on_approval" && e.from === n.id && e.to === n.id,
            ) &&
            !n.spec.approvalCleared,
        );
        if (blocked.length > 0) {
          yield {
            kind: "run_failed",
            runId,
            code: "AWAITING_APPROVAL",
            message: "Graph blocked on approval",
          };
          return;
        }
        yield {
          kind: "run_failed",
          runId,
          code: "STALL",
          message: "No runnable tasks while graph incomplete",
        };
        return;
      }
      const id = nextNode.id;
      const node = nextNode;
      this.deps.superstep.notifyDispatched(1);
      const workerId = ulid();
      const lane = this.deps.laneRouter.route(node, this.deps.routingContext);
      const chosen = this.deps.laneRouter.getAvailableLane(lane, scheduler.lanes);
      graph = this.deps.resolver.markRunning(graph, id, workerId);
      scheduler.runningTasks.set(id, {
        nodeId: id,
        workerId,
        startedAt: new Date().toISOString(),
        lane: chosen,
      });
      scheduler.lanes[chosen].active += 1;
      this.deps.superstep.notifyStarted();
      yield { kind: "task_started", nodeId: id, lane: chosen, workerId };
      try {
        const result = await this.deps.executor.execute(node, chosen);
        graph = this.deps.resolver.markCompleted(graph, id, result);
        yield { kind: "task_completed", nodeId: id, result };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        graph = this.deps.resolver.markFailed(graph, id, message);
        yield { kind: "task_failed", nodeId: id, error: message };
      } finally {
        scheduler.runningTasks.delete(id);
        scheduler.lanes[chosen].active = Math.max(0, scheduler.lanes[chosen].active - 1);
        this.deps.superstep.notifyFinished();
      }
      if (this.deps.superstep.detectBoundary(graph)) {
        this.deps.superstep.onBoundary(runId);
        yield { kind: "superstep_boundary", runId };
      }
      const ckCtx = {
        durability: this.deps.checkpointManager.getDurability(),
        nextHasSideEffect: true,
        superstepBoundary: false,
        runInterruptRequested: false,
      };
      if (await this.deps.checkpointManager.shouldCheckpoint(ckCtx)) {
        const checkpointId = await this.deps.checkpointManager.save(kernelState());
        yield { kind: "checkpoint_saved", checkpointId };
      }
    }
    yield { kind: "run_completed", runId, graph };
  }
}
