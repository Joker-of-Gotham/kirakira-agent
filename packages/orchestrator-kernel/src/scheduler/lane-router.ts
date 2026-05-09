import type { LaneState, LaneType, RoutingContext, TaskNode } from "../types.js";

export class LaneRouter {
  route(node: TaskNode, context: RoutingContext): LaneType {
    if ((context.interactivePriority ?? 0) > 50) return "foreground";
    if (context.laneHint) return context.laneHint;
    if (node.kind === "approval" && context.interactive) return "foreground";
    if (context.interactive || node.kind === "plan") return "foreground";
    if (node.kind === "subagent") return "delegated";
    if (node.kind === "tool" || node.kind === "skill-load") return "queued";
    if (node.spec.timeout !== undefined && node.spec.timeout > 120_000) return "background";
    return "queued";
  }

  getAvailableLane(preferred: LaneType, lanes: LaneState): LaneType {
    const tryLane = (l: LaneType): boolean => {
      const q = lanes[l];
      return q.active < q.capacity;
    };
    if (tryLane(preferred)) return preferred;
    const order: LaneType[] = ["foreground", "queued", "background", "delegated"];
    for (const l of order) {
      if (tryLane(l)) return l;
    }
    return preferred;
  }
}
