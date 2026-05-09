import type { ContextBudget, WorkingSet } from "../types.js";
import type { TokenUsage } from "../types.js";

export class BudgetTracker {
  private lastEstimate = 0;
  private actualTotal: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  /**
   * Self-correcting multiplier: starts at 1 (the ~4 chars/token baseline for
   * English text from OpenAI's tokenization guide), then adapts toward the
   * actual prompt/completion ratio reported by the model after each call.
   */
  private estimateRatio = 1;

  estimate(content: string): number {
    return Math.ceil((content.length / 4) * this.estimateRatio);
  }

  recordActualUsage(usage: TokenUsage): void {
    this.actualTotal = {
      promptTokens: this.actualTotal.promptTokens + usage.promptTokens,
      completionTokens: this.actualTotal.completionTokens + usage.completionTokens,
      totalTokens: this.actualTotal.totalTokens + usage.totalTokens,
    };
    const baseline = this.lastEstimate;
    if (baseline > 0 && usage.totalTokens > 0) {
      const observed = usage.totalTokens / baseline;
      this.estimateRatio = Math.min(
        3,
        Math.max(0.25, this.estimateRatio * 0.85 + observed * 0.15),
      );
    }
  }

  getActualTotal(): TokenUsage {
    return {
      promptTokens: this.actualTotal.promptTokens,
      completionTokens: this.actualTotal.completionTokens,
      totalTokens: this.actualTotal.totalTokens,
    };
  }

  track(workingSet: WorkingSet): void {
    this.lastEstimate = workingSet.totalTokenEstimate;
  }

  lastTracked(): number {
    return this.lastEstimate;
  }

  remaining(budget: ContextBudget): number {
    const cap = budget.maxTokens - budget.reservedForOutput;
    return Math.max(0, cap - this.lastEstimate);
  }
}
