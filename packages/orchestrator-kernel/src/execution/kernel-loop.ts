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
  LaneCapacities,
  LaneType,
  ResourceBudgets,
  RunEvent,
  RunPlan,
  RoutingContext,
  SchedulerState,
  TaskExecutor,
} from "../types.js";

const DEFAULT_LANE_CAPACITIES: LaneCapacities = {
  foreground: 4,
  queued: 16,
  background: 8,
  delegated: 8,
};

type TaskExecutionOutcome =
  | { status: "completed"; nodeId: string; result: Awaited<ReturnType<TaskExecutor["execute"]>> }
  | { status: "failed"; nodeId: string; error: string };

function laneCapacity(
  lane: LaneType,
  overrides: Partial<LaneCapacities> | undefined,
): number {
  const value = overrides?.[lane] ?? DEFAULT_LANE_CAPACITIES[lane];
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function initialScheduler(
  budgets: ResourceBudgets,
  capacities?: Partial<LaneCapacities>,
): SchedulerState {
  const q = (lane: LaneType) => ({
    capacity: laneCapacity(lane, capacities),
    active: 0,
    pending: [] as string[],
  });
  return {
    readyQueue: [],
    runningTasks: new Map(),
    budgets,
    lanes: {
      foreground: q("foreground"),
      queued: q("queued"),
      background: q("background"),
      delegated: q("delegated"),
    },
    backpressure: { isThrottled: false },
  };
}

function resetLanePending(scheduler: SchedulerState): void {
  for (const lane of Object.keys(scheduler.lanes) as LaneType[]) {
    scheduler.lanes[lane].pending = [];
  }
}

function hasLaneCapacity(scheduler: SchedulerState, lane: LaneType): boolean {
  const state = scheduler.lanes[lane];
  return state.active < state.capacity;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function taskOutcome(
  executor: TaskExecutor,
  nodeId: string,
  node: Parameters<TaskExecutor["execute"]>[0],
  lane: LaneType,
): Promise<TaskExecutionOutcome> {
  return Promise.resolve()
    .then(() => executor.execute(node, lane))
    .then(
      (result) => ({ status: "completed", nodeId, result }),
      (error) => ({ status: "failed", nodeId, error: errorMessage(error) }),
    );
}

type KernelGraph = ReturnType<PlanNormalizer["normalize"]>;

function incompleteNodes(graph: KernelGraph) {
  return [...graph.nodes.values()].filter(
    (n) => n.status !== "completed" && n.status !== "failed" && n.status !== "cancelled",
  );
}

function approvalBlockedNodes(graph: KernelGraph) {
  return incompleteNodes(graph).filter(
    (n) =>
      n.status === "pending" &&
      graph.edges.some(
        (e) => e.kind === "blocks_on_approval" && e.from === n.id && e.to === n.id,
      ) &&
      !n.spec.approvalCleared,
  );
}

function stalledEvent(runId: string, graph: KernelGraph): RunEvent | undefined {
  const pending = incompleteNodes(graph);
  if (pending.length === 0) return undefined;
  const blocked = approvalBlockedNodes(graph);
  if (blocked.length > 0) {
    return {
      kind: "run_failed",
      runId,
      code: "AWAITING_APPROVAL",
      message: "Graph blocked on approval",
    };
  }
  return {
    kind: "run_failed",
    runId,
    code: "STALL",
    message: "No runnable tasks while graph incomplete",
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
  laneCapacities?: Partial<LaneCapacities>;
}

export class KernelLoop {
  constructor(private readonly deps: KernelLoopDeps) {}

  async *run(runId: string, plan: RunPlan): AsyncGenerator<RunEvent> {
    yield { kind: "plan_attached", plan };
    let graph = this.deps.normalizer.normalize(plan, runId);
    graph = this.deps.resolver.resolve(graph);
    yield { kind: "graph_normalized", graph };
    let scheduler = initialScheduler(this.deps.budgetManager.snapshot(), this.deps.laneCapacities);
    const inFlight = new Map<string, Promise<TaskExecutionOutcome>>();
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
      if (terminate && inFlight.size === 0) break;
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
      scheduler.readyQueue = [];
      resetLanePending(scheduler);

      for (const node of readyNodes) {
        const id = node.id;
        if (inFlight.has(id)) continue;
        const preferred = this.deps.laneRouter.route(node, this.deps.routingContext);
        const chosen = this.deps.laneRouter.getAvailableLane(preferred, scheduler.lanes);
        if (!hasLaneCapacity(scheduler, chosen)) {
          scheduler.readyQueue.push(id);
          scheduler.lanes[preferred].pending.push(id);
          continue;
        }

        this.deps.superstep.notifyDispatched(1);
        const workerId = ulid();
        graph = this.deps.resolver.markRunning(graph, id, workerId);
        scheduler.runningTasks.set(id, {
          nodeId: id,
          workerId,
          startedAt: new Date().toISOString(),
          lane: chosen,
        });
        scheduler.lanes[chosen].active += 1;
        this.deps.superstep.notifyStarted();
        inFlight.set(id, taskOutcome(this.deps.executor, id, node, chosen));
        yield { kind: "task_started", nodeId: id, lane: chosen, workerId };
      }

      if (inFlight.size === 0) {
        const stalled = stalledEvent(runId, graph);
        if (!stalled) break;
        yield stalled;
        return;
      }

      const outcome = await Promise.race(inFlight.values());
      inFlight.delete(outcome.nodeId);
      const running = scheduler.runningTasks.get(outcome.nodeId);
      if (running) {
        scheduler.runningTasks.delete(outcome.nodeId);
        scheduler.lanes[running.lane].active = Math.max(0, scheduler.lanes[running.lane].active - 1);
      }
      this.deps.superstep.notifyFinished();
      if (outcome.status === "completed") {
        graph = this.deps.resolver.markCompleted(graph, outcome.nodeId, outcome.result);
        yield { kind: "task_completed", nodeId: outcome.nodeId, result: outcome.result };
      } else {
        graph = this.deps.resolver.markFailed(graph, outcome.nodeId, outcome.error);
        yield { kind: "task_failed", nodeId: outcome.nodeId, error: outcome.error };
      }
      const superstepBoundary = this.deps.superstep.detectBoundary(graph);
      if (superstepBoundary) {
        this.deps.superstep.onBoundary(runId);
        yield { kind: "superstep_boundary", runId };
      }
      const ckCtx = {
        durability: this.deps.checkpointManager.getDurability(),
        nextHasSideEffect: true,
        superstepBoundary,
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
