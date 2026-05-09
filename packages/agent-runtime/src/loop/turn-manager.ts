import { ulid } from "ulid";

import type { Action, Observation, ReactWorkerState, TokenUsage, Turn } from "../types.js";

export class TurnManager {
  private turns: Turn[] = [];
  private seq = 0;

  startTurn(): Turn {
    this.seq += 1;
    const turn: Turn = {
      id: ulid(),
      seq: this.seq,
      startedAt: new Date().toISOString(),
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
    return turn;
  }

  completeTurn(
    turn: Turn,
    action: Action,
    observation: Observation,
    usage?: TokenUsage,
  ): Turn {
    const completed: Turn = {
      ...turn,
      completedAt: new Date().toISOString(),
      action,
      observation,
      tokenUsage: usage ?? turn.tokenUsage,
    };
    this.turns.push(completed);
    return completed;
  }

  applyState(state: ReactWorkerState): ReactWorkerState {
    return {
      ...state,
      turns: [...this.turns],
      currentTurnSeq: this.seq,
    };
  }

  getTurnHistory(): Turn[] {
    return [...this.turns];
  }

  seedFromState(state: ReactWorkerState): void {
    this.turns.length = 0;
    this.turns.push(...state.turns);
    this.seq = state.currentTurnSeq;
  }
}
