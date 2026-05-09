import { OrchestratorKernelError } from "../errors.js";
import type { BudgetConfig, ResourceBudgets } from "../types.js";

export function createEmptyBudgets(cfg: BudgetConfig): ResourceBudgets {
  const b = (limit: number) => ({ limit, used: 0, reserved: 0 });
  return {
    modelBudget: b(cfg.modelLimit),
    sandboxSlotBudget: b(cfg.sandboxSlotLimit),
    mcpQpsBudget: b(cfg.mcpQpsLimit),
    artifactIoBudget: b(cfg.artifactIoLimit),
  };
}

export class ResourceBudgetManager {
  private readonly budgets: ResourceBudgets;

  constructor(cfg: BudgetConfig) {
    this.budgets = createEmptyBudgets(cfg);
  }

  snapshot(): ResourceBudgets {
    return {
      modelBudget: { ...this.budgets.modelBudget },
      sandboxSlotBudget: { ...this.budgets.sandboxSlotBudget },
      mcpQpsBudget: { ...this.budgets.mcpQpsBudget },
      artifactIoBudget: { ...this.budgets.artifactIoBudget },
    };
  }

  canAllocate(resource: keyof ResourceBudgets, amount: number): boolean {
    if (amount <= 0) return true;
    const b = this.budgets[resource];
    return b.used + b.reserved + amount <= b.limit;
  }

  allocate(resource: keyof ResourceBudgets, amount: number): void {
    if (amount <= 0) return;
    if (!this.canAllocate(resource, amount)) {
      throw new OrchestratorKernelError("BUDGET_EXCEEDED", `Cannot allocate ${amount} for ${resource}`);
    }
    this.budgets[resource].used += amount;
  }

  release(resource: keyof ResourceBudgets, amount: number): void {
    if (amount <= 0) return;
    const b = this.budgets[resource];
    b.used = Math.max(0, b.used - amount);
  }

  getUtilization(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const key of Object.keys(this.budgets) as (keyof ResourceBudgets)[]) {
      const b = this.budgets[key];
      out[key] = b.limit === 0 ? 0 : b.used / b.limit;
    }
    return out;
  }
}
