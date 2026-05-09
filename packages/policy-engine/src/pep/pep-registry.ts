import type { BasePep } from "./base-pep.js";
import type { EnforcementResult, PepContext } from "./pep-types.js";

/** Route {@link BasePep} subclasses by PDP {@link PolicyInput.action.kind}. */
export class PepRegistry {
  private readonly peps = new Map<string, BasePep>();

  register(actionKind: string, pep: BasePep): void {
    this.peps.set(actionKind, pep);
  }

  getPep(actionKind: string): BasePep | undefined {
    return this.peps.get(actionKind);
  }

  async enforce(actionKind: string, rawAction: unknown, context: PepContext): Promise<EnforcementResult> {
    const pep = this.peps.get(actionKind);
    if (!pep) throw new Error(`No PEP registered for action kind: ${actionKind}`);
    return pep.enforce(rawAction, context);
  }
}
