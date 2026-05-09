import type { Obligation, PolicyDecision } from "@kirakira/core";

export interface ObligationResult {
  allFulfilled: boolean;
  results: ObligationStepResult[];
}

export interface ObligationStepResult {
  type: string;
  fulfilled: boolean;
  error?: string;
}

export interface ObligationHandler {
  type: string;
  execute(obligation: Obligation, context: ObligationContext): Promise<ObligationStepResult>;
}

export interface ObligationContext {
  decision: PolicyDecision;
  sessionId: string;
  traceId: string;
  interactive: boolean;
}

function isRequired(ob: Obligation): boolean {
  return ob.required !== false;
}

export class ObligationExecutor {
  private readonly handlers = new Map<string, ObligationHandler>();

  register(handler: ObligationHandler): void {
    this.handlers.set(handler.type, handler);
  }

  async execute(obligations: Obligation[], context: ObligationContext): Promise<ObligationResult> {
    const results: ObligationStepResult[] = [];

    for (const obligation of obligations) {
      const handler = this.handlers.get(obligation.type);
      const req = isRequired(obligation);

      if (!handler) {
        const fulfilled = !req;
        results.push({
          type: obligation.type,
          fulfilled,
          ...(fulfilled ? {} : { error: `no handler registered for obligation type "${obligation.type}"` }),
        });
        if (req && !fulfilled)
          return { allFulfilled: false, results };
        continue;
      }

      const step = await handler.execute(obligation, context);
      results.push(step);
      if (req && !step.fulfilled) return { allFulfilled: false, results };
    }

    return { allFulfilled: true, results };
  }
}
