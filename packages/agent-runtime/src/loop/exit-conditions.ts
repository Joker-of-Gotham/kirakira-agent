import type { ExitConditionMetrics, ReactWorkerState, Turn } from "../types.js";

export function isExitCondition(
  state: ReactWorkerState,
  metrics: ExitConditionMetrics,
): boolean {
  const lastTurn = state.turns[state.turns.length - 1];
  if (lastTurn?.action?.kind === "final_output") {
    return true;
  }
  if (state.currentTurnSeq >= state.config.maxTurns) {
    return true;
  }
  if (
    state.config.costBudgetUsd !== undefined &&
    state.totalCostUsd > state.config.costBudgetUsd
  ) {
    return true;
  }
  if (metrics.consecutiveErrors >= metrics.maxConsecutiveErrors) {
    return true;
  }
  return false;
}

export function lastActionFailed(turn: Turn | undefined): boolean {
  if (!turn?.observation?.content) return false;
  return (
    turn.observation.content.startsWith("ERROR:") ||
    turn.observation.content.includes('"success":false') ||
    turn.observation.content.includes('"success": false')
  );
}
