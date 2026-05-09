import type { TokenUsage } from "../types.js";

/**
 * Per-1000-token pricing (USD). Default covers common models; agents can
 * override via KIRAKIRA_MODEL_PRICING env in JSON format.
 */
const BASE_PRICE = { in: 5e-4, out: 15e-4 };
const BUILTIN_PRICES: ReadonlyArray<[pattern: string, rate: { in: number; out: number }]> = [
  ["gpt-4o-mini", { in: 1.5e-4, out: 6e-4 }],
  ["gpt-4o", { in: 2.5e-3, out: 10e-3 }],
  ["gpt-4-turbo", { in: 10e-3, out: 30e-3 }],
  ["gpt-4.1-mini", { in: 4e-4, out: 16e-4 }],
  ["gpt-4.1-nano", { in: 1e-4, out: 4e-4 }],
  ["gpt-4.1", { in: 2e-3, out: 8e-3 }],
  ["o3-mini", { in: 1.1e-3, out: 4.4e-3 }],
  ["o3", { in: 10e-3, out: 40e-3 }],
  ["o4-mini", { in: 1.1e-3, out: 4.4e-3 }],
  ["claude-3-5-sonnet", { in: 3e-3, out: 15e-3 }],
  ["claude-3-5-haiku", { in: 8e-4, out: 4e-3 }],
  ["claude-3-opus", { in: 15e-3, out: 75e-3 }],
  ["claude-sonnet-4", { in: 3e-3, out: 15e-3 }],
  ["claude-opus-4", { in: 15e-3, out: 75e-3 }],
  ["gemini-2.5-flash", { in: 1.5e-4, out: 6e-4 }],
  ["gemini-2.5-pro", { in: 1.25e-3, out: 10e-3 }],
  ["deepseek-chat", { in: 1.4e-4, out: 2.8e-4 }],
  ["deepseek-reasoner", { in: 5.5e-4, out: 2.19e-3 }],
  ["qwen3-235b", { in: 5e-4, out: 15e-4 }],
];

function loadPricingOverrides(): Array<[string, { in: number; out: number }]> {
  const raw = process.env.KIRAKIRA_MODEL_PRICING;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Record<string, { in: number; out: number }>;
    return Object.entries(parsed);
  } catch {
    return [];
  }
}

const USER_OVERRIDES = loadPricingOverrides();

function priceFor(model: string): { in: number; out: number } {
  const lower = model.toLowerCase();
  for (const [k, v] of USER_OVERRIDES) {
    if (lower.includes(k.toLowerCase())) return v;
  }
  for (const [k, v] of BUILTIN_PRICES) {
    if (lower.includes(k)) return v;
  }
  return BASE_PRICE;
}

export class CostGuard {
  private totalTokens = 0;
  private totalCost = 0;
  private readonly budgetUsd: number | undefined;

  constructor(budgetUsd?: number) {
    this.budgetUsd = budgetUsd;
  }

  canProceed(): boolean {
    if (this.budgetUsd === undefined) return true;
    return this.totalCost <= this.budgetUsd;
  }

  record(usage: TokenUsage, model: string): void {
    this.totalTokens += usage.totalTokens;
    const p = priceFor(model);
    this.totalCost +=
      (usage.promptTokens / 1000) * p.in + (usage.completionTokens / 1000) * p.out;
  }

  summary(): {
    totalTokens: number;
    totalCost: number;
    budgetRemaining: number | null;
  } {
    return {
      totalTokens: this.totalTokens,
      totalCost: this.totalCost,
      budgetRemaining:
        this.budgetUsd === undefined ? null : Math.max(0, this.budgetUsd - this.totalCost),
    };
  }
}
